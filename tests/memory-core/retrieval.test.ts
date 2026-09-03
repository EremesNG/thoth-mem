import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import { applyLegacyImport, planLegacyImport, writeLegacyImportCandidate } from '../../src/memory-core/import/legacy-v1.js';
import { createStableLexicalRanker, stableLexicalRank, type StableLexicalRankWorkEvent } from '../../src/memory-core/retrieval/stable-lexical-rank.js';
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

const STABLE_STRATEGY = 'strict-selected-any-cap5-stable-v1' as const;
const CANDIDATE_STRATEGIES = ['any-prefix-v1', 'all-then-any-prefix-v1', 'strict-selected-any-cap5-rrf-v1', STABLE_STRATEGY] as const;
const AGENTMEMORY_BM25_COMMON_HITS = 409;

function referenceStableLexicalRank(query: string, title: string, content: string, topicKey: string): number {
  const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase();
  const tokens = (value: string): string[] => normalize(value).match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
  const queryPhrase = normalize(query).trim();
  const queryTerms = [...new Set(tokens(query).slice(0, 32))];
  const scoreField = (value: string, weight: number, phraseWeight: number): number => {
    const normalized = normalize(value);
    const fieldTerms = tokens(normalized);
    const lengthNormalization = 1 + Math.log1p(Math.max(0, fieldTerms.length - 8)) / 4;
    let score = queryPhrase && normalized.includes(queryPhrase) ? phraseWeight : 0;
    for (const term of queryTerms) {
      let frequency = 0;
      for (const candidate of fieldTerms) if (candidate.startsWith(term)) frequency += 1;
      if (frequency === 0) continue;
      score += weight * (frequency / (frequency + 1)) * (Math.min(Array.from(term).length, 12) / 4) / lengthNormalization;
    }
    return score;
  };
  if (queryTerms.length === 0) return 0;
  return scoreField(title, 8, 24) + scoreField(topicKey, 4, 12) + scoreField(content, 1, 4);
}

describe('stable lexical rank', () => {
  it('scores only normalized query and document fields with fixed bounded weights', () => {
    const title = stableLexicalRank('Ａlpha café', 'Alpha café', '', '');
    const topic = stableLexicalRank('alpha café', '', '', 'alpha café');
    const content = stableLexicalRank('alpha café', '', 'alpha café', '');
    const repeated = stableLexicalRank('alpha', '', 'alpha '.repeat(20), '');
    const single = stableLexicalRank('alpha', '', 'alpha', '');
    const padded = stableLexicalRank('alpha', '', `alpha ${'padding '.repeat(100)}`, '');

    expect(title).toBeGreaterThan(topic);
    expect(topic).toBeGreaterThan(content);
    expect(repeated).toBeGreaterThan(single);
    expect(repeated).toBeLessThan(single * 2);
    expect(padded).toBeLessThan(single);
    expect(title).toBe(stableLexicalRank('Alpha café', 'Ａlpha café', '', ''));
    expect(Number.isFinite(title)).toBe(true);
  });

  it('compiles once, normalizes each uncached field once, and remains exactly equivalent to the frozen scorer', () => {
    const events: StableLexicalRankWorkEvent[] = [];
    const ranker = createStableLexicalRanker({ cacheCapacity: 2, observe: (event) => events.push(event) });
    const query = 'Ａlpha alpha café prefix repeated';
    const candidates = [
      ['one', 'Alpha café', `${'prefix repeated '.repeat(2_000)}tail`, 'topic/alpha'],
      ['two', 'Repeated prefix', 'prefixing prefixes café', ''],
    ] as const;

    ranker.beginQuery(query);
    const scores = candidates.map(([id, title, content, topicKey]) => ranker.rank(query, id, title, content, topicKey));
    expect(ranker.rank(query, ...candidates[0])).toBe(scores[0]);
    expect(scores).toEqual(candidates.map(([, title, content, topicKey]) => referenceStableLexicalRank(query, title, content, topicKey)));
    expect(events.filter((event) => event.kind === 'query_compiled')).toHaveLength(1);
    expect(events.filter((event) => event.kind === 'field_normalized')).toHaveLength(6);
    expect(events.filter((event) => event.kind === 'cache_hit')).toHaveLength(1);
  });

  it('preserves exact score and ordering across Unicode, empty, repeated-prefix, and long-content fixtures', () => {
    const fixtures = [
      ['!!!', '', '', ''],
      ['café CAFÉ', 'Ｃafé release', 'café caféine', 'café/topic'],
      ['alpha alphabet alpha', 'alphabet alpha', 'alphanumeric alphabetic alpha', 'alpha'],
      ['underscore_token １２３', 'underscore_token', `${'１２３ padding '.repeat(4_000)}tail`, ''],
      ['İstanbul istanbul', 'İSTANBUL', 'istanbul İstanbul', 'locale/İstanbul'],
    ] as const;
    for (const [query, title, content, topicKey] of fixtures) {
      expect(Object.is(stableLexicalRank(query, title, content, topicKey), referenceStableLexicalRank(query, title, content, topicKey))).toBe(true);
    }

    const query = 'alpha alph alphabet';
    const candidates = ['alpha', 'alphabet alphabet', 'alphanumeric alpha alphabet', 'unrelated'];
    const optimizedOrder = candidates.map((content) => ({ content, score: stableLexicalRank(query, '', content, '') })).sort((left, right) => right.score - left.score).map(({ content }) => content);
    const referenceOrder = candidates.map((content) => ({ content, score: referenceStableLexicalRank(query, '', content, '') })).sort((left, right) => right.score - left.score).map(({ content }) => content);
    expect(optimizedOrder).toEqual(referenceOrder);
  });

  it('preserves default-locale ASCII folding when it differs from Unicode default folding', () => {
    const originalLocaleLowerCase = String.prototype.toLocaleLowerCase;
    const localeLowerCase = vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (this: string) {
      return originalLocaleLowerCase.call(this, 'tr-TR');
    });
    try {
      expect(referenceStableLexicalRank('Istanbul', '', 'İstanbul', '')).toBe(0);
      expect(stableLexicalRank('Istanbul', '', 'İstanbul', '')).toBe(0);
      const ranker = createStableLexicalRanker();
      ranker.beginQuery('Istanbul');
      expect(ranker.rank('Istanbul', 'turkish-city', '', 'İstanbul', '')).toBe(0);
    } finally {
      localeLowerCase.mockRestore();
    }
  });

  it('preserves repeated default-locale normalization for non-ASCII field tokens', () => {
    const originalLocaleLowerCase = String.prototype.toLocaleLowerCase;
    const localeLowerCase = vi.spyOn(String.prototype, 'toLocaleLowerCase').mockImplementation(function (this: string) {
      return originalLocaleLowerCase.call(this, 'az-AZ');
    });
    try {
      const query = 'ÌA';
      const title = 'İ\u0300A';
      expect(referenceStableLexicalRank(query, title, '', '')).toBe(2);
      expect(stableLexicalRank(query, title, '', '')).toBe(2);
      const ranker = createStableLexicalRanker();
      ranker.beginQuery(query);
      expect(ranker.rank(query, 'azerbaijani-combining-mark', title, '', '')).toBe(2);
    } finally {
      localeLowerCase.mockRestore();
    }
  });

  it('resets same-query scores explicitly and skips caching once exact capacity is full', () => {
    const events: StableLexicalRankWorkEvent[] = [];
    const ranker = createStableLexicalRanker({ cacheCapacity: 1, observe: (event) => events.push(event) });
    ranker.beginQuery('alpha');
    const first = ranker.rank('alpha', 'one', '', 'alpha', '');
    ranker.rank('alpha', 'two', '', 'alpha alpha', '');
    ranker.rank('alpha', 'two', '', 'alpha alpha', '');
    expect(ranker.rank('alpha', 'one', '', 'changed without reset', '')).toBe(first);

    ranker.beginQuery('alpha');
    expect(ranker.rank('alpha', 'one', '', 'changed without reset', '')).not.toBe(first);
    expect(events.filter((event) => event.kind === 'query_compiled')).toHaveLength(2);
    expect(events.filter((event) => event.kind === 'cache_hit')).toHaveLength(1);
    expect(events.filter((event) => event.kind === 'cache_skipped')).toHaveLength(2);
  });
});

describe('lexical query plans', () => {
  it('preserves the archived all-prefix control while candidates deduplicate terms', () => {
    expect(DEFAULT_LEXICAL_QUERY_STRATEGY).toBe(STABLE_STRATEGY);
    expect(LEXICAL_QUERY_STRATEGY_IDS).toEqual(['all-prefix-v1', 'any-prefix-v1', 'all-then-any-prefix-v1', 'strict-selected-any-cap5-rrf-v1', STABLE_STRATEGY]);
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

  it('preserves the bounded archived E0 strict/relaxed RRF plan', () => {
    const strategy = 'strict-selected-any-cap5-rrf-v1';
    const input = 'aa bbbb cccccc dddddddd eeeee';
    const first = buildFtsQueryPlan(input, strategy);
    const second = buildFtsQueryPlan(input, strategy);

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

  it('declares the stable fixed-field cohort plan as the new lexical default', () => {
    const first = buildFtsQueryPlan('aa bbbb cccccc dddddddd eeeee', STABLE_STRATEGY);
    const second = buildFtsQueryPlan('aa bbbb cccccc dddddddd eeeee', STABLE_STRATEGY);

    expect(DEFAULT_LEXICAL_QUERY_STRATEGY).toBe(STABLE_STRATEGY);
    expect(first).toMatchObject({
      strategyId: STABLE_STRATEGY,
      ranker: 'fixed-field-tf-v1',
      cohorts: 'monotonic-import-v1',
      maxStageResults: 5,
      maxLexicalResults: 5,
      stages: [
        { kind: 'strict', query: '"aa"* AND "bbbb"* AND "cccccc"* AND "dddddddd"* AND "eeeee"*' },
        { kind: 'relaxed', query: '"cccccc"* OR "dddddddd"* OR "eeeee"*' },
      ],
      fusion: { kind: 'rrf-v1', rankConstant: 60, weights: { strict: 1, relaxed: 1 } },
    });
    expect(first?.configHash).toBe('b3a5b51c95b8aa79a677b8756e7a7bac0dc6aaad84403446ea1a68f14864fa04');
    expect(first?.planHash).toBe('b3b7dc29f6c88998afcbe630c0b11156ced307e5fb764ae25cbd756caf5f5238');
    expect(second).toEqual(first);
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
    expect(DEFAULT_LEXICAL_QUERY_STRATEGY).toBe(STABLE_STRATEGY);
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
  it('keeps pending, accepted, and rejected observations outside memory FTS and automatic context', () => {
    const control = new MemoryService({ databasePath: ':memory:' });
    const candidate = new MemoryService({ databasePath: ':memory:' });
    const project = { key: 'repo:observation-isolation', name: 'observation-isolation' };
    try {
      for (const service of [control, candidate]) {
        service.save({ project, eventKey: 'memory', evidence: { kind: 'explicit_save', content: 'Stable promoted source.' }, memory: { kind: 'decision', title: 'Stable guidance', content: 'Keep stable promoted guidance.', topicKey: 'stable/guidance' } });
      }
      const support = candidate.save({ project, eventKey: 'observation-support', evidence: { kind: 'explicit_save', content: 'UNPROMOTED OBSERVATION SENTINEL' } });
      candidate.submitObservation({ project, eventKey: 'observation', observation: {
        kind: 'fact', scope: 'project', title: 'Unpromoted sentinel', claim: 'UNPROMOTED OBSERVATION SENTINEL',
        proposedMemory: { kind: 'discovery', title: 'Unpromoted sentinel', content: 'UNPROMOTED OBSERVATION SENTINEL' },
        supportIds: [support.evidence.id], generator: { kind: 'root_agent', name: 'codex' },
      } });

      const recallInput = { projectKey: project.key, query: 'stable guidance sentinel', correlationId: 'observation-isolation' };
      expect(candidate.recall(recallInput)).toEqual(control.recall(recallInput));
      expect(candidate.context({ projectKey: project.key, correlationId: 'observation-context' })).toEqual(control.context({ projectKey: project.key, correlationId: 'observation-context' }));
      expect(candidate.recall({ projectKey: project.key, query: 'UNPROMOTED OBSERVATION SENTINEL' }).items).toEqual([]);
    } finally { control.close(); candidate.close(); }
  });

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

  it('preserves stable overlap, recall-boundary reset, capacity skips, and diagnostics', () => {
    const observations: RecallDiagnostic[] = [];
    const service = new MemoryService({ databasePath: ':memory:', recallObserver: (observation) => observations.push(observation) });
    try {
      const memories = Array.from({ length: 8 }, (_, index) => save(
        service,
        `Alpha beta ${index}`,
        `alpha beta shared candidate ${index}`,
        undefined,
        `stable-overlap-${index}`,
      ));
      const first = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 5, lexicalStrategy: STABLE_STRATEGY, correlationId: 'stable-repeat' });
      const repeated = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 5, lexicalStrategy: STABLE_STRATEGY, correlationId: 'stable-repeat' });
      const changedQuery = service.recall({ projectKey: 'repo:retrieval', query: 'beta shared', limit: 5, lexicalStrategy: STABLE_STRATEGY, correlationId: 'stable-change' });
      expect(repeated).toEqual(first);
      expect(changedQuery.items.every((item) => memories.some((memory) => memory.id === item.id))).toBe(true);
      expect(observations.slice(0, 2).map((observation) => observation.stages.map(({ kind, executed, rows, reason }) => ({ kind, executed, rows, reason })))).toEqual([
        observations[0]!.stages.map(({ kind, executed, rows, reason }) => ({ kind, executed, rows, reason })),
        observations[0]!.stages.map(({ kind, executed, rows, reason }) => ({ kind, executed, rows, reason })),
      ]);

      const exact = save(service, 'Exact capacity', 'unrelated content', 'exact-capacity', 'stable-exact-capacity');
      expect(service.recall({ projectKey: 'repo:retrieval', query: 'exact-capacity', limit: 1, lexicalStrategy: STABLE_STRATEGY }).items.map((item) => item.id)).toEqual([exact.id]);
      expect(observations.at(-1)?.stages).toMatchObject([
        { kind: 'exact', executed: true, rows: 1 },
        { kind: 'strict', executed: false, rows: 0, reason: 'limit_satisfied' },
        { kind: 'relaxed', executed: false, rows: 0, reason: 'limit_satisfied' },
        { kind: 'post_query', executed: true, rows: 1 },
      ]);
    } finally { service.close(); }
  });

  it('selects explicit strategies while using the stable default', () => {
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
      const stable = service.recall({ projectKey: 'repo:retrieval', query: 'alpha beta', limit: 10, lexicalStrategy: STABLE_STRATEGY });

      expect(control.items.map((item) => item.id)).toEqual([both.id]);
      expect(implicit.items.map((item) => item.id)).toEqual(stable.items.map((item) => item.id));
      expect(observations[0]).toMatchObject({
        strategyId: STABLE_STRATEGY,
        configHash: buildFtsQueryPlan('alpha beta', STABLE_STRATEGY)?.configHash,
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

  it('keeps 17 complete native Top-K lists stable after 1,000 matching imported memories', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-stable-ranking-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'target.sqlite');
    const candidate = join(root, 'candidate.sqlite');
    const probes = Array.from({ length: 17 }, (_, index) => `probe${index} shared`);
    const targetService = new MemoryService({ databasePath: target });
    try {
      for (const [index, probe] of probes.entries()) {
        targetService.save({
          project: { key: 'rank', name: 'Ranking fixture' },
          eventKey: `protected-${index}`,
          evidence: { kind: 'explicit_save', content: `${probe} protected native evidence` },
          memory: { kind: 'decision', title: `Protected ${index}`, content: `${probe} protected native memory` },
        });
      }
      const stableBefore = probes.map((query) => targetService.recall({ projectKey: 'rank', query, limit: 5 }).items.map((item) => item.id));
      const archivedBefore = probes.map((query) => targetService.recall({ projectKey: 'rank', query, limit: 5, lexicalStrategy: 'strict-selected-any-cap5-rrf-v1' }).items.map((item) => item.id));
      expect(stableBefore).toHaveLength(17);
      expect(stableBefore.every((ids) => ids.length === 5)).toBe(true);
      targetService.close();

      const targetDatabase = new Database(target);
      targetDatabase.pragma('journal_mode = DELETE');
      targetDatabase.close();
      const legacy = new Database(source);
      legacy.exec(`
        CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT,directory TEXT,started_at TEXT,ended_at TEXT,summary TEXT);
        CREATE TABLE user_prompts(id INTEGER PRIMARY KEY,session_id TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT);
        CREATE TABLE observations(id INTEGER PRIMARY KEY,session_id TEXT,type TEXT,title TEXT,content TEXT,project TEXT,directory TEXT,topic_key TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,revision_count INTEGER);
        CREATE TABLE observation_versions(observation_id INTEGER NOT NULL,revision INTEGER NOT NULL,title TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT,PRIMARY KEY(observation_id,revision));
      `);
      legacy.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('rank-session', 'rank', null, '2025-01-01T00:00:00.000Z', null, null);
      const importedContent = `${probes.join(' ')} imported corpus extension`;
      const insert = legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
      legacy.transaction(() => {
        for (let index = 0; index < 1_000; index++) {
          insert.run(index + 1, 'rank-session', 'bugfix', `Imported bugfix ${index}`, importedContent, 'rank', null, null, `2025-02-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`, null, null, 1);
        }
      })();
      legacy.close();

      const plan = planLegacyImport({ sourcePath: source, targetPath: target });
      copyFileSync(target, candidate);
      writeLegacyImportCandidate({ candidatePath: candidate, plan, importedAt: '2026-09-02T12:00:00.000Z' });
      const candidateDatabase = new Database(candidate, { readonly: true });
      try {
        expect(candidateDatabase.prepare("SELECT count(DISTINCT memory_id) AS count FROM legacy_import_rows WHERE disposition='imported' AND memory_id IS NOT NULL").get()).toEqual({ count: 1_000 });
      } finally { candidateDatabase.close(); }

      const candidateService = new MemoryService({ databasePath: candidate, readonly: true });
      try {
        const stableAfter = probes.map((query) => candidateService.recall({ projectKey: 'rank', query, limit: 5 }).items.map((item) => item.id));
        const archivedAfter = probes.map((query) => candidateService.recall({ projectKey: 'rank', query, limit: 5, lexicalStrategy: 'strict-selected-any-cap5-rrf-v1' }).items.map((item) => item.id));
        expect(stableAfter).toEqual(stableBefore);
        expect(probes.map((query) => candidateService.recall({ projectKey: 'rank', query, limit: 5 }).items.map((item) => item.id))).toEqual(stableAfter);
        expect(archivedAfter.some((ids, index) => JSON.stringify(ids) !== JSON.stringify(archivedBefore[index]))).toBe(true);
      } finally { candidateService.close(); }
    } finally {
      try { targetService.close(); } catch { /* already closed */ }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fills only unused capacity from numeric import cohorts while exact access remains unconditional', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-cohort-capacity-'));
    const target = join(root, 'target.sqlite');
    const createLegacyCohort = (path: string, title: string, content: string, topicKey: string): void => {
      const legacy = new Database(path);
      legacy.exec(`
        CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT,directory TEXT,started_at TEXT,ended_at TEXT,summary TEXT);
        CREATE TABLE user_prompts(id INTEGER PRIMARY KEY,session_id TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT);
        CREATE TABLE observations(id INTEGER PRIMARY KEY,session_id TEXT,type TEXT,title TEXT,content TEXT,project TEXT,directory TEXT,topic_key TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,revision_count INTEGER);
        CREATE TABLE observation_versions(observation_id INTEGER NOT NULL,revision INTEGER NOT NULL,title TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT,PRIMARY KEY(observation_id,revision));
      `);
      legacy.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('session', 'rank-capacity', null, '2025-01-01T00:00:00.000Z', null, null);
      legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(1, 'session', 'bugfix', title, content, 'rank-capacity', null, topicKey, '2025-02-01T00:00:00.000Z', null, null, 1);
      legacy.close();
    };

    const nativeService = new MemoryService({ databasePath: target });
    try {
      for (let index = 0; index < 4; index++) {
        nativeService.save({
          project: { key: 'rank-capacity', name: 'Capacity fixture' },
          eventKey: `native-capacity-${index}`,
          evidence: { kind: 'explicit_save', content: `sharedcapacity native evidence ${index}` },
          memory: { kind: 'decision', title: `Native capacity ${index}`, content: `sharedcapacity native memory ${index}` },
        });
      }
      const protectedIds = nativeService.recall({ projectKey: 'rank-capacity', query: 'sharedcapacity', limit: 5 }).items.map((item) => item.id);
      expect(protectedIds).toHaveLength(4);
      nativeService.close();

      const firstSource = join(root, 'legacy-first.sqlite');
      const secondSource = join(root, 'legacy-second.sqlite');
      createLegacyCohort(firstSource, 'First imported', 'sharedcapacity firstonlytoken', 'import/first');
      createLegacyCohort(secondSource, 'Second imported', 'sharedcapacity secondonlytoken', 'import/second');
      const firstPlan = planLegacyImport({ sourcePath: firstSource, targetPath: target });
      const first = await applyLegacyImport({ plan: firstPlan, startedAt: '2026-09-02T12:00:00.000Z' });
      const secondPlan = planLegacyImport({ sourcePath: secondSource, targetPath: target });
      const second = await applyLegacyImport({ plan: secondPlan, startedAt: '2026-09-02T11:00:00.000Z' });
      const database = new Database(target, { readonly: true });
      const imported = database.prepare("SELECT import_id,memory_id FROM legacy_import_rows WHERE source_entity='observation' AND disposition='imported' ORDER BY import_id").all() as Array<{ import_id: string; memory_id: string }>;
      database.close();
      const firstId = imported.find((row) => row.import_id === first.importId)!.memory_id;
      const secondId = imported.find((row) => row.import_id === second.importId)!.memory_id;

      const observations: RecallDiagnostic[] = [];
      const service = new MemoryService({ databasePath: target, readonly: true, recallObserver: (observation) => observations.push(observation) });
      try {
        expect(service.recall({ projectKey: 'rank-capacity', query: 'sharedcapacity', limit: 5 }).items.map((item) => item.id)).toEqual([...protectedIds, firstId]);
        expect(observations[0]).toMatchObject({
          strategyId: STABLE_STRATEGY,
          stages: [
            { kind: 'exact', executed: true, rows: 0 },
            { kind: 'strict', executed: true, rows: 5 },
            { kind: 'relaxed', executed: true, rows: 5 },
            { kind: 'post_query', executed: true, rows: 5 },
          ],
          work: { rankedFtsRows: 10, fusedLexicalRows: 5, hydratedMemoryRows: 5 },
          result: { requestedLimit: 5, maxLexicalResults: 5, returnedCount: 5 },
        });
        expect(service.recall({ projectKey: 'rank-capacity', query: 'secondonlytoken', limit: 5 }).items.map((item) => item.id)).toEqual([secondId]);
        expect(service.recall({ projectKey: 'rank-capacity', query: secondId }).items[0]).toMatchObject({ id: secondId, lane: 'structured' });
        expect(service.recall({ projectKey: 'rank-capacity', query: 'import/second' }).items[0]).toMatchObject({ id: secondId, lane: 'structured' });
      } finally { service.close(); }
    } finally {
      try { nativeService.close(); } catch { /* already closed */ }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('recalls imported mapped and isolated history without changing target-current ordering', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-retrieval-import-'));
    const source = join(root, 'legacy.sqlite');
    const target = join(root, 'target.sqlite');
    const candidate = join(root, 'candidate.sqlite');
    const targetService = new MemoryService({ databasePath: target });
    const winner = targetService.save({
      project: { key: 'alpha', name: 'Alpha' }, eventKey: 'winner',
      evidence: { kind: 'explicit_save', content: 'baseline stable token winner' },
      memory: { kind: 'decision', title: 'Target winner', content: 'baseline stable token winner', topicKey: 'shared/topic' },
    }).memory!;
    const peer = targetService.save({
      project: { key: 'alpha', name: 'Alpha' }, eventKey: 'peer',
      evidence: { kind: 'explicit_save', content: 'baseline stable token peer' },
      memory: { kind: 'decision', title: 'Target peer', content: 'baseline stable token peer' },
    }).memory!;
    const before = targetService.recall({ projectKey: 'alpha', query: 'baseline stable token', limit: 10 }).items.map((item) => item.id);
    targetService.close();
    const targetDatabase = new Database(target);
    targetDatabase.pragma('journal_mode = DELETE');
    targetDatabase.close();
    const legacy = new Database(source);
    legacy.exec(`
      CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT,directory TEXT,started_at TEXT,ended_at TEXT,summary TEXT);
      CREATE TABLE user_prompts(id INTEGER PRIMARY KEY,session_id TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT);
      CREATE TABLE observations(id INTEGER PRIMARY KEY,session_id TEXT,type TEXT,title TEXT,content TEXT,project TEXT,directory TEXT,topic_key TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,revision_count INTEGER);
      CREATE TABLE observation_versions(observation_id INTEGER NOT NULL,revision INTEGER NOT NULL,title TEXT,content TEXT,project TEXT,directory TEXT,created_at TEXT,PRIMARY KEY(observation_id,revision));
    `);
    legacy.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('mapped', 'alpha', null, '2025-01-01T00:00:00.000Z', null, null);
    legacy.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)').run('isolated', 'legacy-only', null, '2025-01-01T00:00:00.000Z', null, null);
    legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(1, 'mapped', 'decision', 'Legacy collision', 'mapped historical searchable token', 'alpha', null, 'shared/topic', '2025-01-02T00:00:00.000Z', null, null, 1);
    legacy.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(2, 'isolated', 'learning', 'Legacy isolated head', 'isolated revision token head', 'legacy-only', null, 'legacy/topic', '2025-02-02T00:00:00.000Z', '2025-02-03T00:00:00.000Z', null, 2);
    legacy.prepare('INSERT INTO observation_versions VALUES(?,?,?,?,?,?,?)').run(2, 1, 'Legacy isolated prior', 'isolated revision token prior', 'legacy-only', null, '2025-02-01T00:00:00.000Z');
    legacy.close();
    try {
      const plan = planLegacyImport({ sourcePath: source, targetPath: target });
      copyFileSync(target, candidate);
      writeLegacyImportCandidate({ candidatePath: candidate, plan, importedAt: '2026-09-02T12:00:00.000Z' });
      const service = new MemoryService({ databasePath: candidate, readonly: true });
      try {
        expect(service.recall({ projectKey: 'alpha', query: 'baseline stable token', limit: 10 }).items.map((item) => item.id)).toEqual(before);
        expect(new Set(before)).toEqual(new Set([winner.id, peer.id]));
        expect(service.recall({ projectKey: 'alpha', query: 'shared/topic' }).items.map((item) => item.id)).toEqual([winner.id]);
        expect(service.recall({ projectKey: 'alpha', query: 'mapped historical searchable', history: true }).items).toEqual([
          expect.objectContaining({ title: 'Legacy collision', status: 'historical' }),
        ]);
        const isolated = service.recall({ projectKey: 'legacy:legacy-only', query: 'isolated revision token', history: true, limit: 10 }).items;
        expect(isolated).toEqual(expect.arrayContaining([
          expect.objectContaining({ title: 'Legacy isolated head', status: 'current' }),
          expect.objectContaining({ title: 'Legacy isolated prior', status: 'superseded' }),
        ]));
        const head = isolated.find((item) => item.title === 'Legacy isolated head')!;
        expect(service.get({ id: head.id, history: true }).lineage.map((item) => 'title' in item ? item.title : '')).toEqual(['Legacy isolated head', 'Legacy isolated prior']);
      } finally { service.close(); }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
