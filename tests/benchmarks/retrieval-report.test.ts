import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  aggregateScores,
  percentile,
  scoreRanking,
  validateRetrievalReport,
} from '../../benchmarks/retrieval-report.mjs';

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceHash = (character: string): string => character.repeat(64);

function budget(requested: number, returned: number, source: number, evidence: number) {
  return {
    requested_utf16_code_units: requested,
    returned_utf16_code_units: returned,
    truncated_utf16_code_units: Math.max(0, source - returned),
    source_utf16_code_units: source,
    evidence_utf16_code_units: evidence,
    full_utf16_code_units: source,
    compression_ratio: source === 0 ? 1 : returned / source,
    token_basis: 'estimated_chars_div_4',
  };
}

function parentAt(root: unknown, path: Array<string | number>): { parent: Record<string | number, unknown>; key: string | number } {
  let current = root as Record<string | number, unknown>;
  for (const part of path.slice(0, -1)) current = current[part] as Record<string | number, unknown>;
  return { parent: current, key: path.at(-1)! };
}

function setAt(root: unknown, path: Array<string | number>, value: unknown): void {
  const { parent, key } = parentAt(root, path);
  parent[key] = value;
}

function deleteAt(root: unknown, path: Array<string | number>): void {
  const { parent, key } = parentAt(root, path);
  delete parent[key];
}

function validReport() {
  const rankingA = scoreRanking(['s2', 's1'], ['s1']);
  const rankingB = scoreRanking(['s3'], ['s3']);
  const deliveryA = scoreRanking(['s2'], ['s1']);
  const deliveryB = rankingB;
  const queryOrder = ['q1', 'q2'];
  const lexicalStrategy = { id: 'all-prefix-v1', config_hash: sourceHash('e') };
  const candidateConfig = { lexical: true, tokenizer: 'unicode61', lexical_strategy: lexicalStrategy };
  return {
    schema: 'thoth-mem.retrieval-benchmark-report.v1',
    created_at: '2026-08-26T00:00:00.000Z',
    dataset: {
      name: 'LongMemEval-S cleaned',
      source: { dataset: 'xiaowu0162/longmemeval-cleaned', filename: 'longmemeval_s_cleaned.json', revision: 'a'.repeat(40), sha256: sourceHash('b'), bytes: 277_383_467, license: 'MIT' },
      corpus_hash: sourceHash('c'),
      query_hash: sourceHash('d'),
      record_count: 3,
      evaluated_count: 2,
      exclusions: [{ question_id: 'q_abs', reason: 'abstention' }],
    },
    candidate: { id: 'sqlite-fts5-bm25-session-full', config_hash: hash(candidateConfig), config: candidateConfig },
    conditions: {
      query_order: queryOrder,
      query_order_hash: hash(queryOrder),
      candidate_k: 20,
      candidate_payload_utf16_code_units: 20_000,
      delivery: { utf16_code_units: 4_000, estimated_tokens: 1_000, token_basis: 'estimated_chars_div_4' },
    },
    environment: { runtime: 'node', runtime_version: process.versions.node, platform: process.platform, arch: process.arch },
    metrics: {
      ranking: aggregateScores([{ questionType: 'single', metrics: rankingA }, { questionType: 'assistant', metrics: rankingB }]),
      delivery: aggregateScores([{ questionType: 'single', metrics: deliveryA }, { questionType: 'assistant', metrics: deliveryB }]),
      resources: {
        retrieval_latency_ms: { p50: 1, p95: 2, samples: [1, 2] },
        delivery_latency_ms: { p50: 2, p95: 4, samples: [2, 4] },
        ingestion_ms: { p50: 10, p95: 20, samples: [10, 20] },
        startup_ms: { p50: 1, p95: 1, samples: [1, 1] },
        rss_bytes: { peak: 200, samples: [100, 200] },
        sqlite_bytes: { total: 300, p50: 100, p95: 200, samples: [100, 200] },
        text: {
          corpus_utf16_code_units: 1_000,
          query_utf16_code_units: 100,
          ranked_source_utf16_code_units: 160,
          ranked_evidence_utf16_code_units: 20,
          ranked_returned_utf16_code_units: 30,
          ranked_truncated_utf16_code_units: 130,
          delivery_source_utf16_code_units: 160,
          delivery_evidence_utf16_code_units: 20,
          delivered_utf16_code_units: 20,
          delivery_truncated_utf16_code_units: 140,
          estimated_tokens: { corpus: 250, queries: 25, ranked_source: 40, ranked_returned: 8, ranked_truncated: 33, delivery_source: 40, delivered: 5, delivery_truncated: 35 },
        },
        network_calls: 0,
        model_calls: 0,
        llm_calls: 0,
      },
    },
    provenance: {
      coverage: 1,
      mappings: [
        { question_id: 'q1', source_id: '0:s1', session_index: 0, session_id: 's1', memory_id: 'm1', evidence_id: 'e1' },
        { question_id: 'q1', source_id: '1:s2', session_index: 1, session_id: 's2', memory_id: 'm2', evidence_id: 'e2' },
        { question_id: 'q2', source_id: '0:s3', session_index: 0, session_id: 's3', memory_id: 'm3', evidence_id: 'e3' },
      ],
    },
    queries: [
      { question_id: 'q1', question_type: 'single', query_plan_hash: sourceHash('f'), gold_session_ids: ['s1'], gold_source_ids: ['0:s1'], ranked_source_ids: ['1:s2', '0:s1'], ranked_session_ids: ['s2', 's1'], delivered_source_ids: ['1:s2'], delivered_session_ids: ['s2'], gold_ranks: [2], ranking_budget: budget(20_000, 20, 100, 12), delivery_budget: budget(4_000, 10, 100, 12), ranking: rankingA, delivery: deliveryA },
      { question_id: 'q2', question_type: 'assistant', query_plan_hash: sourceHash('a'), gold_session_ids: ['s3'], gold_source_ids: ['0:s3'], ranked_source_ids: ['0:s3'], ranked_session_ids: ['s3'], delivered_source_ids: ['0:s3'], delivered_session_ids: ['s3'], gold_ranks: [1], ranking_budget: budget(20_000, 10, 60, 8), delivery_budget: budget(4_000, 10, 60, 8), ranking: rankingB, delivery: deliveryB },
    ],
    errors: [],
    promotion: { decision: 'incomplete', reasons: ['lexical_baseline_only_no_candidate_comparison'] },
  };
}

describe('retrieval-only benchmark scoring', () => {
  it('keeps any, fractional, and all-gold recall distinct with first-gold MRR and binary NDCG', () => {
    const complete = scoreRanking(['noise', 'gold-b', 'gold-a'], ['gold-a', 'gold-b']);
    expect(complete).toMatchObject({
      recall_any_at_1: 0,
      recall_at_1: 0,
      recall_all_at_1: 0,
      recall_any_at_5: 1,
      recall_at_5: 1,
      recall_all_at_5: 1,
      recall_any_at_10: 1,
      recall_at_10: 1,
      recall_all_at_10: 1,
      recall_any_at_20: 1,
      recall_at_20: 1,
      recall_all_at_20: 1,
      mrr_any: 0.5,
    });
    expect(complete.ndcg_at_10).toBeCloseTo(0.693426, 6);

    const partial = scoreRanking(['noise', 'gold-a'], ['gold-a', 'gold-b']);
    expect(partial).toMatchObject({ recall_any_at_5: 1, recall_at_5: 0.5, recall_all_at_5: 0, mrr_any: 0.5 });
  });

  it('keeps repeated session IDs as candidate positions while counting distinct recall and relevant occurrences for NDCG', () => {
    const positional = scoreRanking(['noise', 'noise', 'gold-a', 'gold-a', 'gold-b'], ['gold-a', 'gold-b'], 3);
    expect(positional).toMatchObject({
      recall_any_at_1: 0,
      recall_at_1: 0,
      recall_all_at_1: 0,
      recall_any_at_5: 1,
      recall_at_5: 1,
      recall_all_at_5: 1,
      mrr_any: 1 / 3,
    });
    const ideal = 1 + (1 / Math.log2(3)) + (1 / Math.log2(4));
    const actual = (1 / Math.log2(4)) + (1 / Math.log2(5)) + (1 / Math.log2(6));
    expect(positional.ndcg_at_10).toBeCloseTo(actual / ideal, 12);
  });

  it('aggregates each metric overall and by question type without changing its label', () => {
    const first = scoreRanking(['gold'], ['gold']);
    const second = scoreRanking([], ['missing']);
    expect(aggregateScores([
      { questionType: 'single', metrics: first },
      { questionType: 'single', metrics: second },
      { questionType: 'assistant', metrics: first },
    ])).toMatchObject({
      overall: { recall_any_at_1: 2 / 3, recall_at_20: 2 / 3, recall_all_at_20: 2 / 3, mrr_any: 2 / 3, ndcg_at_10: 2 / 3 },
      by_question_type: {
        single: { count: 2, recall_any_at_1: 0.5, mrr_any: 0.5 },
        assistant: { count: 1, recall_any_at_1: 1, mrr_any: 1 },
      },
    });
  });

  it('uses nearest-rank percentiles over observed samples', () => {
    expect(percentile([9, 1, 5, 3, 7], 50)).toBe(5);
    expect(percentile([9, 1, 5, 3, 7], 95)).toBe(9);
  });

  it('validates a complete retrieval-only report independently from fixture continuity', () => {
    const schema = JSON.parse(readFileSync('benchmarks/retrieval-report.schema.json', 'utf8'));
    expect(schema.properties.schema.const).toBe('thoth-mem.retrieval-benchmark-report.v1');
    expect(schema.properties.candidate.properties.config.required).toContain('lexical_strategy');
    expect(schema.$defs.lexicalStrategy).toMatchObject({
      additionalProperties: false,
      required: ['id', 'config_hash'],
    });
    expect(schema.$defs.query.required).toContain('query_plan_hash');
    expect(schema.$defs.query.properties.query_plan_hash).toEqual({ $ref: '#/$defs/hash' });
    expect(validateRetrievalReport(validReport())).toEqual({ valid: true, errors: [] });
  });

  it('requires a declared lexical strategy and a plan hash for every evaluated query', () => {
    const missingStrategy = validReport();
    deleteAt(missingStrategy, ['candidate', 'config', 'lexical_strategy']);
    expect(validateRetrievalReport(missingStrategy).errors).toContain('candidate');

    const unsupportedStrategy = validReport();
    setAt(unsupportedStrategy, ['candidate', 'config', 'lexical_strategy', 'id'], 'unknown-v1');
    expect(validateRetrievalReport(unsupportedStrategy).errors).toContain('candidate');

    const missingPlanHash = validReport();
    deleteAt(missingPlanHash, ['queries', 0, 'query_plan_hash']);
    expect(validateRetrievalReport(missingPlanHash).errors).toContain('queries');
  });

  it('admits only the declared E0 strategy while retaining historical v1 lane validity', () => {
    const e0 = validReport();
    setAt(e0, ['candidate', 'config', 'lexical_strategy', 'id'], 'strict-selected-any-cap5-rrf-v1');
    setAt(e0, ['candidate', 'config_hash'], hash(e0.candidate.config));
    expect(validateRetrievalReport(e0)).toEqual({ valid: true, errors: [] });

    const unknown = validReport();
    setAt(unknown, ['candidate', 'config', 'lexical_strategy', 'id'], 'unknown-v1');
    setAt(unknown, ['candidate', 'config_hash'], hash(unknown.candidate.config));
    expect(validateRetrievalReport(unknown).errors).toContain('candidate');

    const schema = JSON.parse(readFileSync('benchmarks/retrieval-report.schema.json', 'utf8'));
    expect(schema.$defs.lexicalStrategy.properties.id.enum).toEqual([
      'all-prefix-v1',
      'any-prefix-v1',
      'all-then-any-prefix-v1',
      'strict-selected-any-cap5-rrf-v1',
    ]);

    for (const path of [
      'benchmarks/results/longmemeval-s-lexical-comparison-report.json',
      'benchmarks/results/longmemeval-s-lexical-latency-report-r4.json',
    ]) {
      const archived = JSON.parse(readFileSync(path, 'utf8'));
      for (const lane of Object.values(archived.lanes)) expect(validateRetrievalReport(lane)).toEqual({ valid: true, errors: [] });
    }
  });

  it('fails closed for ambiguous metrics, unequal units, leakage, broken provenance, resources, or promotion claims', () => {
    const cases = [
      { mutate: (report: unknown) => deleteAt(report, ['metrics', 'ranking', 'overall', 'recall_all_at_20']), error: 'metrics.ranking' },
      { mutate: (report: unknown) => setAt(report, ['unexpected'], true), error: 'schema' },
      { mutate: (report: unknown) => setAt(report, ['candidate', 'config_hash'], sourceHash('f')), error: 'candidate' },
      { mutate: (report: unknown) => setAt(report, ['candidate', 'unexpected'], true), error: 'candidate' },
      { mutate: (report: unknown) => setAt(report, ['conditions', 'delivery', 'utf16_code_units'], 3_999), error: 'budgets' },
      { mutate: (report: unknown) => setAt(report, ['queries', 0, 'gold_session_ids'], []), error: 'queries' },
      { mutate: (report: unknown) => deleteAt(report, ['queries', 0, 'gold_source_ids']), error: 'queries' },
      { mutate: (report: unknown) => deleteAt(report, ['queries', 0, 'ranking_budget']), error: 'queries' },
      { mutate: (report: unknown) => setAt(report, ['queries', 0, 'unexpected'], true), error: 'queries' },
      { mutate: (report: unknown) => setAt(report, ['queries', 0], null), error: 'queries' },
      { mutate: (report: unknown) => setAt(report, ['queries', 0, 'answer'], 'forbidden'), error: 'label_leakage' },
      { mutate: (report: unknown) => setAt(report, ['provenance', 'mappings'], []), error: 'provenance' },
      { mutate: (report: unknown) => setAt(report, ['provenance', 'mappings', 0, 'unexpected'], true), error: 'provenance' },
      { mutate: (report: unknown) => setAt(report, ['metrics', 'resources', 'text', 'ranked_truncated_utf16_code_units'], 129), error: 'resources.text' },
      { mutate: (report: unknown) => setAt(report, ['metrics', 'resources', 'retrieval_latency_ms', 'p95'], 99), error: 'resources.retrieval_latency_ms' },
      { mutate: (report: unknown) => setAt(report, ['metrics', 'resources', 'network_calls'], 1), error: 'offline_execution' },
      { mutate: (report: unknown) => setAt(report, ['promotion', 'decision'], 'promoted'), error: 'promotion' },
    ];
    for (const entry of cases) {
      const report: unknown = validReport();
      entry.mutate(report);
      expect(validateRetrievalReport(report).errors, entry.error).toContain(entry.error);
    }
  });
});
