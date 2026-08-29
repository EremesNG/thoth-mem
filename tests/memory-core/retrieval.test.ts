import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { MemoryService, type RecallDiagnostic } from '../../src/memory-core/service.js';
import {
  DEFAULT_LEXICAL_QUERY_STRATEGY,
  LEXICAL_QUERY_STRATEGY_IDS,
  buildFtsQuery,
  buildFtsQueryPlan,
} from '../../src/memory-core/sqlite/fts.js';

function save(service: MemoryService, title: string, content: string, topicKey?: string, eventKey?: string) {
  return service.save({ project: { key: 'repo:retrieval', name: 'retrieval' }, eventKey, evidence: { kind: 'explicit_save', content }, memory: { kind: 'decision', title, content, topicKey } }).memory!;
}

const CANDIDATE_STRATEGIES = ['any-prefix-v1', 'all-then-any-prefix-v1', 'strict-selected-any-cap5-rrf-v1'] as const;
const AGENTMEMORY_BM25_COMMON_HITS = 409;

describe('lexical query plans', () => {
  it('preserves the archived all-prefix control while candidates deduplicate terms', () => {
    expect(DEFAULT_LEXICAL_QUERY_STRATEGY).toBe('strict-selected-any-cap5-rrf-v1');
    expect(LEXICAL_QUERY_STRATEGY_IDS).toEqual(['all-prefix-v1', 'any-prefix-v1', 'all-then-any-prefix-v1', 'strict-selected-any-cap5-rrf-v1']);
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

  it('declares the bounded E0 strict/relaxed RRF plan as the lexical default', () => {
    const strategy = 'strict-selected-any-cap5-rrf-v1';
    const input = 'aa bbbb cccccc dddddddd eeeee';
    const first = buildFtsQueryPlan(input, strategy);
    const second = buildFtsQueryPlan(input, strategy);

    expect(DEFAULT_LEXICAL_QUERY_STRATEGY).toBe(strategy);
    expect(LEXICAL_QUERY_STRATEGY_IDS).toEqual([
      'all-prefix-v1',
      'any-prefix-v1',
      'all-then-any-prefix-v1',
      strategy,
    ]);
    expect(first).toMatchObject({
      strategyId: strategy,
      maxStageResults: 5,
      maxLexicalResults: 5,
      stages: [
        { kind: 'strict', query: '"aa"* AND "bbbb"* AND "cccccc"* AND "dddddddd"* AND "eeeee"*' },
        { kind: 'relaxed', query: '"cccccc"* OR "dddddddd"* OR "eeeee"*' },
      ],
      fusion: {
        kind: 'rrf-v1',
        rankConstant: 60,
        weights: { strict: 1, relaxed: 1 },
      },
    });
    expect(first?.configHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first?.planHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(second).toEqual(first);
    expect(buildFtsQueryPlan(`${input} ffffffffff`, strategy)?.planHash).not.toBe(first?.planHash);
    expect(buildFtsQueryPlan('OR NOT alpha (((', strategy)?.stages).toEqual([
      { kind: 'strict', query: '"OR"* AND "NOT"* AND "alpha"*' },
      { kind: 'relaxed', query: '"OR"* OR "NOT"* OR "alpha"*' },
    ]);
    expect(buildFtsQueryPlan('!!! "" (((', strategy)).toBeNull();
  });

  it('preserves the immutable hybrid-parity decision while applying the later lexical-only promotion', () => {
    const raw = readFileSync('benchmarks/results/longmemeval-s-lexical-recall-at-5-report.json', 'utf8');
    const report = JSON.parse(raw);
    const e0Plan = buildFtsQueryPlan('lexical strategy configuration', 'strict-selected-any-cap5-rrf-v1');

    expect(createHash('sha256').update(raw).digest('hex')).toBe('de9137eaba9cdeb30db14f2f315c23fddbf6ea5da75804a0dc59ad36b11faa17');
    expect(report.promotion).toMatchObject({ decision: 'retain_default', selected_strategy: null });
    expect(report.promotion.assessments[0]).toMatchObject({
      strategy_id: 'strict-selected-any-cap5-rrf-v1',
      eligible: false,
      reasons: expect.arrayContaining(['recall_any_at_5_below_447_of_470']),
      evidence: { recall_any_at_5_hits: 419, evaluated_count: 470 },
    });
    expect(e0Plan?.configHash).toBe(report.candidate.config_hash);
    expect(report.promotion.assessments[0].evidence.recall_any_at_5_hits).toBeGreaterThan(AGENTMEMORY_BM25_COMMON_HITS);
    expect(DEFAULT_LEXICAL_QUERY_STRATEGY).toBe('strict-selected-any-cap5-rrf-v1');
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

  it('fuses independent E0 ranks after exact matches with deterministic bounded output', () => {
    const strategy = 'strict-selected-any-cap5-rrf-v1' as const;
    const query = 'alpha beta distinctive';
    const service = new MemoryService({ databasePath: ':memory:' });
    try {
      const exact = save(service, 'Exact topic', 'unrelated authoritative row', query, 'e0-exact');
      const agreement = save(service, 'All query terms', 'alpha beta distinctive together', undefined, 'e0-agreement');
      const relaxed = Array.from({ length: 8 }, (_, index) => save(
        service,
        `Relaxed ${index}`,
        `distinctive candidate ${index}`,
        undefined,
        `e0-relaxed-${index}`,
      ));

      const first = service.recall({ projectKey: 'repo:retrieval', query, limit: 10, lexicalStrategy: strategy });
      const second = service.recall({ projectKey: 'repo:retrieval', query, limit: 10, lexicalStrategy: strategy });

      expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
      expect(first.items).toHaveLength(6);
      expect(first.items[0]?.id).toBe(exact.id);
      expect(first.items[0]?.lane).toBe('structured');
      expect(first.items[1]?.id).toBe(agreement.id);
      expect(first.items[1]?.scoreComponents.lexical).toBeCloseTo(2 / 61, 12);
      expect(first.items.slice(1).every((item) => item.lane === 'lexical')).toBe(true);
      expect(new Set(first.items.map((item) => item.id)).size).toBe(first.items.length);
      expect(first.items.slice(1).every((item) => item.evidenceIds.length === 1)).toBe(true);
      expect(first.items.slice(1).every((item) => [agreement.id, ...relaxed.map((item) => item.id)].includes(item.id))).toBe(true);
      expect(first.budget.returnedChars).toBe(first.items.reduce((sum, item) => sum + item.snippet.length, 0));

      for (let limit = 1; limit <= 10; limit += 1) {
        const result = service.recall({ projectKey: 'repo:retrieval', query, limit, lexicalStrategy: strategy });
        expect(result.items).toHaveLength(Math.min(limit, 6));
        expect(result.items[0]?.id).toBe(exact.id);
      }
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
          fusedLexicalRows: 2,
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

  it('reconciles raw and fused E0 work through truncation and skipped stages', () => {
    const observations: unknown[] = [];
    const observed = new MemoryService({ databasePath: ':memory:', recallObserver: (observation: unknown) => observations.push(observation) });
    const control = new MemoryService({ databasePath: ':memory:' });
    try {
      for (const service of [observed, control]) {
        save(service, 'Private exact title', 'x'.repeat(180), 'alpha beta distinctive', 'e0-diagnostic-exact');
        save(service, 'Private agreement title', `${'y'.repeat(180)} alpha beta distinctive`, undefined, 'e0-diagnostic-agreement');
        for (let index = 0; index < 8; index += 1) {
          save(service, `Private relaxed ${index}`, `${'z'.repeat(180)} distinctive candidate ${index}`, undefined, `e0-diagnostic-relaxed-${index}`);
        }
      }

      const input = {
        projectKey: 'repo:retrieval',
        query: 'alpha beta distinctive',
        limit: 10,
        budgetChars: 64,
        correlationId: 'e0-diagnostic-correlation',
        lexicalStrategy: 'strict-selected-any-cap5-rrf-v1' as const,
      };
      const observedResult = observed.recall(input);
      const controlResult = control.recall(input);
      expect(observedResult).toEqual(controlResult);
      expect(observations[0]).toMatchObject({
        strategyId: input.lexicalStrategy,
        stages: [
          { kind: 'exact', executed: true, rows: 1 },
          { kind: 'strict', executed: true, rows: 1 },
          { kind: 'relaxed', executed: true, rows: 5 },
          { kind: 'post_query', executed: true, rows: 6 },
        ],
        work: {
          rankedFtsRows: 6,
          fusedLexicalRows: 5,
          hydratedMemoryRows: 6,
          returnedRows: 1,
        },
        result: { maxLexicalResults: 5, returnedCount: 1 },
      });

      expect(observed.recall({ ...input, query: '!!! "" (((' })).toEqual(control.recall({ ...input, query: '!!! "" (((' }));
      expect(observations[1]).toMatchObject({
        configHash: null,
        planHash: null,
        stages: [
          { kind: 'exact', executed: true, rows: 0 },
          { kind: 'strict', executed: false, reason: 'empty_query', rows: 0 },
          { kind: 'relaxed', executed: false, reason: 'empty_query', rows: 0 },
          { kind: 'post_query', executed: true, rows: 0 },
        ],
        work: { rankedFtsRows: 0, fusedLexicalRows: 0, hydratedMemoryRows: 0, returnedRows: 0 },
      });
      const serialized = JSON.stringify(observations);
      expect(serialized).not.toContain('alpha beta distinctive');
      expect(serialized).not.toContain('Private exact title');
      expect(serialized).not.toContain('e0-diagnostic');
    } finally { observed.close(); control.close(); }
  });

  it('selects explicit strategies while using the promoted E0 default', () => {
    const observations: RecallDiagnostic[] = [];
    const service = new MemoryService({ databasePath: ':memory:', recallObserver: (observation) => observations.push(observation) });
    try {
      const both = save(service, 'Both terms', 'alpha beta together');
      const alpha = save(service, 'Alpha only', 'alpha stands alone');
      const beta = save(service, 'Beta only', 'beta stands alone');

      const implicit = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10 });
      const control = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10, lexicalStrategy: 'all-prefix-v1' });
      const relaxed = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10, lexicalStrategy: 'any-prefix-v1' });
      const adaptive = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10, lexicalStrategy: 'all-then-any-prefix-v1' });
      const e0 = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10, lexicalStrategy: 'strict-selected-any-cap5-rrf-v1' });

      expect(control.items.map((item) => item.id)).toEqual([both.id]);
      expect(implicit.items.map((item) => item.id)).toEqual(e0.items.map((item) => item.id));
      expect(observations[0]).toMatchObject({
        strategyId: 'strict-selected-any-cap5-rrf-v1',
        configHash: buildFtsQueryPlan('alpha beta', 'strict-selected-any-cap5-rrf-v1')?.configHash,
        result: { maxLexicalResults: 5 },
      });
      expect(relaxed.items).toHaveLength(2);
      expect(relaxed.items.map((item) => item.id)).toContain(both.id);
      expect(relaxed.items.every((item) => [both.id, alpha.id, beta.id].includes(item.id))).toBe(true);
      expect(adaptive.items[0]?.id).toBe(both.id);
      expect(new Set(adaptive.items.map((item) => item.id))).toEqual(new Set([both.id, alpha.id, beta.id]));
      expect(adaptive.items).toHaveLength(3);
      expect(e0.items).toHaveLength(3);
      expect(new Set(e0.items.map((item) => item.id))).toEqual(new Set([both.id, alpha.id, beta.id]));
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
