import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/memory-core/service.js';
import {
  DEFAULT_LEXICAL_QUERY_STRATEGY,
  LEXICAL_QUERY_STRATEGY_IDS,
  buildFtsQuery,
  buildFtsQueryPlan,
} from '../../src/memory-core/sqlite/fts.js';

function save(service: MemoryService, title: string, content: string, topicKey?: string, eventKey?: string) {
  return service.save({ project: { key: 'repo:retrieval', name: 'retrieval' }, eventKey, evidence: { kind: 'explicit_save', content }, memory: { kind: 'decision', title, content, topicKey } }).memory!;
}

const CANDIDATE_STRATEGIES = ['any-prefix-v1', 'all-then-any-prefix-v1'] as const;

describe('lexical query plans', () => {
  it('preserves the archived all-prefix control while candidates deduplicate terms', () => {
    expect(DEFAULT_LEXICAL_QUERY_STRATEGY).toBe('any-prefix-v1');
    expect(LEXICAL_QUERY_STRATEGY_IDS).toEqual(['all-prefix-v1', 'any-prefix-v1', 'all-then-any-prefix-v1']);
    expect(buildFtsQuery('Alpha alpha beta')).toBe('"Alpha"* AND "alpha"* AND "beta"*');
    expect(buildFtsQueryPlan('Alpha alpha beta', 'all-prefix-v1')?.stages).toEqual([
      { kind: 'strict', query: '"Alpha"* AND "alpha"* AND "beta"*' },
    ]);
    expect(buildFtsQueryPlan('Alpha alpha beta', 'all-prefix-v1')?.maxLexicalResults).toBeNull();
    expect(buildFtsQueryPlan('Alpha alpha beta', 'any-prefix-v1')?.stages).toEqual([
      { kind: 'relaxed', query: '"Alpha"* OR "beta"*' },
    ]);
    expect(buildFtsQueryPlan('Alpha alpha beta', 'any-prefix-v1')?.maxLexicalResults).toBe(2);
    expect(buildFtsQueryPlan('Alpha alpha beta', 'all-then-any-prefix-v1')?.stages).toEqual([
      { kind: 'strict', query: '"Alpha"* AND "alpha"* AND "beta"*' },
      { kind: 'relaxed', query: '"Alpha"* OR "beta"*' },
    ]);
    expect(buildFtsQueryPlan('Alpha alpha beta', 'all-then-any-prefix-v1')?.maxLexicalResults).toBeNull();
  });

  it('builds stable, bounded, syntax-safe plans for untrusted query shapes', () => {
    const unicode = buildFtsQueryPlan('Ａlpha café "beta gamma"', 'any-prefix-v1');
    expect(unicode?.stages).toEqual([
      { kind: 'relaxed', query: '"Alpha"* OR "café"* OR "beta gamma"' },
    ]);
    expect(unicode?.configHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(unicode?.planHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(buildFtsQueryPlan('OR NOT alpha (((', 'any-prefix-v1')?.stages[0]?.query).toBe('"OR"* OR "NOT"* OR "alpha"*');

    const overlong = Array.from({ length: 20 }, (_, index) => `term${index}`).join(' ');
    const control = buildFtsQueryPlan(overlong, 'all-prefix-v1')!;
    const candidate = buildFtsQueryPlan(overlong, 'any-prefix-v1')!;
    const adaptive = buildFtsQueryPlan(overlong, 'all-then-any-prefix-v1')!;
    expect(control.stages[0]?.query.match(/"term\d+"\*/gu)).toHaveLength(12);
    expect(candidate.stages[0]?.query.match(/"term\d+"\*/gu)).toHaveLength(3);
    expect(candidate.maxLexicalResults).toBe(2);
    expect(adaptive.stages[0]?.query.match(/"term\d+"\*/gu)).toHaveLength(12);
    expect(adaptive.stages[1]?.query.match(/"term\d+"\*/gu)).toHaveLength(12);
    expect(adaptive.maxLexicalResults).toBeNull();
    expect(new Set([control.configHash, candidate.configHash, adaptive.configHash]).size).toBe(3);
  });

  it('selects bounded specific candidate terms without changing control or adaptive expressions', () => {
    const input = 'aa bbbb cccccc dddddddd eeeee';
    expect(buildFtsQueryPlan(input, 'all-prefix-v1')?.stages).toEqual([
      { kind: 'strict', query: '"aa"* AND "bbbb"* AND "cccccc"* AND "dddddddd"* AND "eeeee"*' },
    ]);
    expect(buildFtsQueryPlan(input, 'any-prefix-v1')?.stages).toEqual([
      { kind: 'relaxed', query: '"cccccc"* OR "dddddddd"* OR "eeeee"*' },
    ]);
    expect(buildFtsQueryPlan(input, 'all-then-any-prefix-v1')?.stages).toEqual([
      { kind: 'strict', query: '"aa"* AND "bbbb"* AND "cccccc"* AND "dddddddd"* AND "eeeee"*' },
      { kind: 'relaxed', query: '"aa"* OR "bbbb"* OR "cccccc"* OR "dddddddd"* OR "eeeee"*' },
    ]);
  });

  it('collapses equivalent single-term adaptive plans and returns null for empty input', () => {
    expect(buildFtsQueryPlan('single', 'all-prefix-v1')?.stages).toEqual([{ kind: 'strict', query: '"single"*' }]);
    expect(buildFtsQueryPlan('single', 'any-prefix-v1')?.stages).toEqual([{ kind: 'relaxed', query: '"single"*' }]);
    expect(buildFtsQueryPlan('single', 'all-then-any-prefix-v1')?.stages).toEqual([{ kind: 'strict', query: '"single"*' }]);
    expect(buildFtsQueryPlan('!!! "" (((', 'all-prefix-v1')).toBeNull();
  });
});

describe('lexical-first retrieval', () => {
  it.each(CANDIDATE_STRATEGIES)('returns no plan or result for empty normalized input with %s', (lexicalStrategy) => {
    expect(buildFtsQueryPlan('!!! "" (((', lexicalStrategy)).toBeNull();
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      save(service, 'Existing row', 'searchable content', undefined, `empty-${lexicalStrategy}`);
      expect(service.recall({ projectKey: 'repo:retrieval', query: '!!! "" (((', lexicalStrategy }).items).toEqual([]);
    } finally { service.close(); }
  });

  it('caps only relaxed candidate work while preserving exact precedence and caller limits', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const exact = save(service, 'Exact topic', 'unrelated authoritative row', 'alpha missing', 'bounded-exact');
      for (let index = 0; index < 12; index += 1) save(service, `Candidate ${index}`, `alpha candidate token${index}`, undefined, `bounded-${index}`);

      const relaxed = service.recall({ projectKey: 'repo:retrieval', query: 'alpha missing', limit: 20, lexicalStrategy: 'any-prefix-v1' });
      const uncapped = service.recall({ projectKey: 'repo:retrieval', query: 'alpha missing', limit: 20, lexicalStrategy: 'all-then-any-prefix-v1' });
      expect(relaxed.items[0]?.id).toBe(exact.id);
      expect(relaxed.items).toHaveLength(3);
      expect(relaxed.items.slice(1).map((item) => item.id)).toEqual(uncapped.items.slice(1, 3).map((item) => item.id));

      const small = service.recall({ projectKey: 'repo:retrieval', query: 'alpha missing', limit: 5, lexicalStrategy: 'any-prefix-v1' });
      expect(small.items).toHaveLength(3);
      expect(small.items[0]?.id).toBe(exact.id);
    } finally { service.close(); }
  });

  it('emits privacy-safe reconciled diagnostics without changing recall results', () => {
    const observations: unknown[] = [];
    const observed = new MemoryService({ databasePath: ':memory:', recallObserver: (observation: unknown) => observations.push(observation) });
    const control = new MemoryService({ databasePath: ':memory:' });
    try {
      for (const service of [observed, control]) {
        save(service, 'Both terms', `${'z'.repeat(260)} alpha beta private diagnostic sentinel`, undefined, 'diagnostic-both');
        save(service, 'Alpha only', `${'z'.repeat(260)} alpha stands alone`, undefined, 'diagnostic-alpha');
      }

      const input = { projectKey: 'repo:retrieval', query: 'missing alpha beta', limit: 10, lexicalStrategy: 'any-prefix-v1' as const, correlationId: 'diagnostic-correlation' };
      const observedResult = observed.recall(input);
      const controlResult = control.recall(input);

      expect(observedResult).toEqual(controlResult);
      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({
        strategyId: 'any-prefix-v1',
        stages: [
          { kind: 'exact', executed: true },
          { kind: 'strict', executed: false, reason: 'not_planned', rows: 0 },
          { kind: 'relaxed', executed: true },
          { kind: 'post_query', executed: true },
        ],
        result: { requestedLimit: 10, returnedCount: observedResult.items.length },
        work: {
          memoryHydrationStatements: 1,
          evidenceHydrationStatements: 1,
          snippetTokenChecks: 4,
          returnedRows: observedResult.items.length,
          sourceChars: observedResult.budget.sourceChars,
          evidenceChars: observedResult.budget.evidenceChars,
          returnedChars: observedResult.budget.returnedChars,
        },
      });
      expect(JSON.stringify(observations[0])).not.toContain('private diagnostic sentinel');
      expect(JSON.stringify(observations[0])).not.toContain('missing alpha beta');
    } finally { observed.close(); control.close(); }
  });

  it('selects explicit strategies while using the promoted any-prefix default', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const both = save(service, 'Both terms', 'alpha beta together');
      const alpha = save(service, 'Alpha only', 'alpha stands alone');
      const beta = save(service, 'Beta only', 'beta stands alone');

      const implicit = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10 });
      const control = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10, lexicalStrategy: 'all-prefix-v1' });
      const relaxed = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10, lexicalStrategy: 'any-prefix-v1' });
      const adaptive = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10, lexicalStrategy: 'all-then-any-prefix-v1' });

      expect(control.items.map((item) => item.id)).toEqual([both.id]);
      expect(implicit.items.map((item) => item.id)).toEqual(relaxed.items.map((item) => item.id));
      expect(relaxed.items).toHaveLength(2);
      expect(relaxed.items.map((item) => item.id)).toContain(both.id);
      expect(relaxed.items.every((item) => [both.id, alpha.id, beta.id].includes(item.id))).toBe(true);
      expect(adaptive.items[0]?.id).toBe(both.id);
      expect(new Set(adaptive.items.map((item) => item.id))).toEqual(new Set([both.id, alpha.id, beta.id]));
      expect(adaptive.items).toHaveLength(3);
      expect(adaptive.budget.requestedChars).toBe(1200);
      expect(adaptive.budget.returnedChars).toBe(adaptive.items.reduce((sum, item) => sum + item.snippet.length, 0));
    } finally { service.close(); }
  });

  it.each(CANDIDATE_STRATEGIES)('preserves project, history, query-shape, and limit contracts for %s', (lexicalStrategy) => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const old = save(service, 'Old Unicode phrase', 'café alpha beta legacy', 'café', `candidate-${lexicalStrategy}-old`);
      const current = save(service, 'Current Unicode phrase', 'café alpha beta current', 'café', `candidate-${lexicalStrategy}-current`);
      const other = service.save({
        project: { key: 'repo:other', name: 'other' },
        eventKey: `candidate-${lexicalStrategy}-other`,
        evidence: { kind: 'explicit_save', content: 'café alpha beta private other project' },
        memory: { kind: 'decision', title: 'Other project', content: 'café alpha beta private other project' },
      }).memory!;

      const queryShapes = ['café', '"alpha beta"', 'OR NOT alpha (((', 'alpha alpha beta', Array.from({ length: 20 }, (_, index) => `term${index}`).join(' ')];
      for (const query of queryShapes) {
        const first = service.recall({ projectKey: 'repo:retrieval', query, limit: 1, lexicalStrategy });
        const second = service.recall({ projectKey: 'repo:retrieval', query, limit: 1, lexicalStrategy });
        expect(first.items).toHaveLength(first.items.length > 0 ? 1 : 0);
        expect(second.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
        expect(first.items.every((item) => item.id !== old.id)).toBe(true);
      }

      const currentOnly = service.recall({ projectKey: 'repo:retrieval', query: 'café', limit: 20, lexicalStrategy });
      const withHistory = service.recall({ projectKey: 'repo:retrieval', query: 'café', limit: 20, history: true, lexicalStrategy });
      expect(currentOnly.items.map((item) => item.id)).toContain(current.id);
      expect(currentOnly.items.map((item) => item.id)).not.toContain(old.id);
      expect(withHistory.items.map((item) => item.id)).toEqual(expect.arrayContaining([current.id, old.id]));
      expect(withHistory.items.map((item) => item.id)).not.toContain(other.id);
    } finally { service.close(); }
  });

  it('keeps structured matches ahead of strict and relaxed results and enforces the shared limit', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const exact = save(service, 'Exact topic', 'unrelated words', 'alpha beta');
      const strict = save(service, 'Strict terms', 'alpha beta together');
      save(service, 'Relaxed term', 'alpha stands alone');

      const items = service.recall({
        projectKey: 'repo:retrieval',
        query: 'alpha beta',
        limit: 2,
        lexicalStrategy: 'all-then-any-prefix-v1',
      }).items;

      expect(items.map((item) => item.id)).toEqual([exact.id, strict.id]);
      expect(items.map((item) => item.lane)).toEqual(['structured', 'lexical']);
    } finally { service.close(); }
  });

  it('supports exact ID/topic, phrases, code tokens, and bounded prefixes immediately after save', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const memory = save(service, 'Deployment parser', 'The deployment parser keeps foo_bar tokens and exact alpha beta phrases.', 'deploy/parser');
      expect(service.recall({ projectKey: 'repo:retrieval', query: memory.id }).items[0]?.lane).toBe('structured');
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'deploy/parser' }).items[0]?.id).toBe(memory.id);
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta' }).items[0]?.id).toBe(memory.id);
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'deploy' }).items[0]?.id).toBe(memory.id);
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'foo_bar' }).items[0]?.id).toBe(memory.id);
    } finally { service.close(); }
  });

  it('treats punctuation/operators safely and uses deterministic tie breaks', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      expect(service.recall({ projectKey: 'repo:retrieval', query: '!!! OR "" (((' }).items).toEqual([]);
      const one = save(service, 'Equal one', 'shared deterministic token'); const two = save(service, 'Equal two', 'shared deterministic token');
      const first = service.recall({ projectKey: 'repo:retrieval', query: 'shared deterministic', limit: 10 }).items.map((item) => item.id);
      const second = service.recall({ projectKey: 'repo:retrieval', query: 'shared deterministic', limit: 10 }).items.map((item) => item.id);
      expect(first).toEqual(second); expect(new Set(first)).toEqual(new Set([one.id, two.id]));
    } finally { service.close(); }
  });

  it('supports a quoted phrase without turning phrase terms into independent prefixes', () => {
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const exactPhrase = save(service, 'Exact phrase', 'alpha beta appears together');
      save(service, 'Separated phrase', 'alpha intervening words beta');
      const items = service.recall({ projectKey: 'repo:retrieval', query: '"alpha beta"', limit: 10 }).items;
      expect(items.map((item) => item.id)).toEqual([exactPhrase.id]);
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'alph' }).items.map((item) => item.id)).toContain(exactPhrase.id);
    } finally { service.close(); }
  });
});
