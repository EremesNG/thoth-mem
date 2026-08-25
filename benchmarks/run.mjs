import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import manifest from './manifest.json' with { type: 'json' };
import { validateReport } from './report.mjs';

const SAMPLE_COUNT = 7;
const EXECUTION = { seed: 7, timeout_ms: 10_000, retries: 0 };
const READER = { id: 'fixture-reader@1', settings: { mode: 'compact', lexical: true } };
const SCORER = { id: 'deterministic-exact@1', settings: { case_sensitive: false } };
const PRIMARY_METRICS = [
  { namespace: 'retrieval', metric: 'mrr', gate: 'relative_gain', threshold: 0.05 },
  { namespace: 'retrieval', metric: 'recall_at_1', gate: 'non_regression' },
  { namespace: 'retrieval', metric: 'recall_at_5', gate: 'non_regression' },
  { namespace: 'retrieval', metric: 'hit_at_k', gate: 'non_regression' },
  { namespace: 'answer', metric: 'exact_match', gate: 'non_regression' },
  { namespace: 'agent', metric: 'hidden_test_success', gate: 'non_regression' },
];
const PROMOTION_GATE = { provenance_coverage: 1, resource_ceilings: { latency_p95_ms: 1.25, peak_memory_bytes: 1.1, database_bytes: 1.25, model_bytes: 1, network_calls: 1, llm_calls: 1, injected_tokens: 1 } };

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function percentile(samples, percentileValue) {
  const ordered = [...samples].sort((left, right) => left - right);
  return ordered[Math.ceil((percentileValue / 100) * ordered.length) - 1];
}

const root = dirname(fileURLToPath(import.meta.url));
const fixtureText = readFileSync(resolve(root, 'fixtures', 'queries.jsonl'), 'utf8');
const fixtures = fixtureText.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const lane = manifest.lanes.find((item) => item.available);
if (!lane || fixtures.length === 0) throw new Error('The committed fixture lane and queries are required');

const unavailable = manifest.lanes.filter((item) => !item.available).map((item) => ({ id: item.id, reason: item.reason }));
const budgets = { candidate_k: manifest.candidateK, context_tokens: manifest.contextTokenBudget };
const candidateConfig = { lexical: true };
const reader = { id: READER.id, settings_hash: hash(READER.settings) };
const scorer = { id: SCORER.id, settings_hash: hash(SCORER.settings) };
const queryOrder = fixtures.map((fixture) => fixture.id);
const runConfig = { schema_version: manifest.schemaVersion, budgets, sample_count: SAMPLE_COUNT, reader, scorer, ...EXECUTION };
const scratch = mkdtempSync(join(tmpdir(), 'thoth-benchmark-v2-'));
const databasePath = join(scratch, 'memory.sqlite');
const startupStart = performance.now();
let service;

try {
  const { MemoryService } = await import('../dist/index.js');
  service = new MemoryService({ databasePath });
  const startupMs = performance.now() - startupStart;
  const fixture = fixtures[0];
  const ingestionStart = performance.now();
  const saved = service.save({
    project: { key: 'benchmark:fixture', name: 'fixture' },
    eventKey: fixture.id,
    evidence: { kind: 'explicit_save', content: fixture.memory, sourceRef: fixture.id },
    memory: { kind: 'architecture', title: 'Authority', content: fixture.memory, topicKey: 'core/authority' },
  });
  const ingestionMs = performance.now() - ingestionStart;

  const latencySamples = [];
  const memorySamples = [];
  const recalls = [];
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const queryStart = performance.now();
    const recalled = service.recall({
      projectKey: 'benchmark:fixture', query: fixture.query, mode: 'compact',
      limit: manifest.candidateK, budgetChars: manifest.contextTokenBudget * 4,
    });
    latencySamples.push(performance.now() - queryStart);
    memorySamples.push(process.memoryUsage().rss);
    recalls.push(recalled);
  }

  const compact = recalls[0];
  const context = service.recall({
    projectKey: 'benchmark:fixture', query: fixture.query, mode: 'context',
    limit: manifest.candidateK, budgetChars: manifest.contextTokenBudget * 4,
  });
  const fetched = service.get({ id: saved.memory.id });
  const expectedRank = compact.items.findIndex((item) => item.id === saved.memory.id);
  const exactMatch = String(fetched.record.content).toLocaleLowerCase('en-US').includes(String(fixture.answer).toLocaleLowerCase('en-US')) ? 1 : 0;
  const controlLexicalHits = compact.items.filter((item) => item.lane === 'lexical').length;
  const projectionId = 'benchmark-optional';
  const fallbackControls = [];
  const captureFallback = (scenario, observedState) => {
    const recalled = service.recall({ projectKey: 'benchmark:fixture', query: fixture.query, mode: 'compact', limit: manifest.candidateK, budgetChars: manifest.contextTokenBudget * 4 });
    fallbackControls.push({
      scenario, observed_state: observedState, control_lexical_hits: controlLexicalHits,
      fallback_lexical_hits: recalled.items.filter((item) => item.lane === 'lexical').length,
      source_ids: [...new Set(recalled.items.flatMap((item) => [item.id, ...item.evidenceIds]))],
    });
  };
  service.projections.record({ projectionId, configHash: 'fixture', sourceWatermark: service.projections.currentWatermark(), state: 'disabled' });
  captureFallback('disabled', service.projections.effectiveStates()[projectionId]);
  service.projections.delete(projectionId);
  captureFallback('missing', 'missing');
  service.projections.record({ projectionId, configHash: 'fixture', sourceWatermark: Math.max(0, service.projections.currentWatermark() - 1), state: 'ready' });
  captureFallback('stale', service.projections.effectiveStates()[projectionId]);
  service.projections.record({ projectionId, configHash: 'fixture', sourceWatermark: service.projections.currentWatermark(), state: 'rebuilding' });
  captureFallback('rebuilding', service.projections.effectiveStates()[projectionId]);
  service.projections.record({ projectionId, configHash: 'fixture', sourceWatermark: service.projections.currentWatermark(), state: 'degraded', lastErrorCode: 'projection_failed' });
  captureFallback('failed', service.projections.effectiveStates()[projectionId]);
  service.projections.record({ projectionId, configHash: 'fixture', sourceWatermark: service.projections.currentWatermark(), state: 'ready' });
  service.projections.ensureConfiguration(projectionId, 'source-mismatch');
  captureFallback('source_mismatched', service.projections.effectiveStates()[projectionId]);
  const operationalErrors = [{ operation: 'optional_projection', code: 'projection_failed', message: 'Optional projection unavailable; lexical fallback remained active.', retryable: true }];
  const checkpoint = service.lifecycle({
    operation: 'checkpoint_pre_compact', harness: 'mcp',
    project: { key: 'benchmark:fixture', name: 'fixture' }, rootSessionKey: 'benchmark-session',
    eventKey: 'checkpoint:1', content: fixture.memory,
  });
  const recovery = service.lifecycle({
    operation: 'guide_post_compact', harness: 'mcp',
    project: { key: 'benchmark:fixture', name: 'fixture' }, rootSessionKey: 'benchmark-session',
    eventKey: 'recovery:1',
  });

  service.close();
  service = undefined;
  const provenanceIds = [...new Set([saved.memory.id, ...saved.memory.evidenceIds])];
  const report = {
    schema: 'thoth-mem.benchmark-report.v1',
    created_at: new Date(0).toISOString(),
    dataset: {
      name: lane.dataset, version: '1', license: 'committed-fixture', availability: 'committed',
      corpus_hash: hash(fixtures.map((item) => ({ id: item.id, memory: item.memory }))),
      query_hash: hash(fixtures.map((item) => ({ id: item.id, query: item.query, answer: item.answer }))),
    },
    candidate: { id: lane.id, config_hash: hash(candidateConfig), config: candidateConfig },
    conditions: { run_config_hash: hash(runConfig), query_order_hash: hash(queryOrder), reader, scorer, ...EXECUTION },
    environment: { runtime: 'node', runtime_version: process.versions.node, platform: process.platform, arch: process.arch },
    budgets,
    primary_metrics: PRIMARY_METRICS,
    promotion_gate: PROMOTION_GATE,
    metrics: {
      retrieval: {
        mrr: expectedRank >= 0 ? 1 / (expectedRank + 1) : 0,
        recall_at_1: expectedRank === 0 ? 1 : 0,
        recall_at_5: expectedRank >= 0 && expectedRank < 5 ? 1 : 0,
        hit_at_k: expectedRank >= 0 && expectedRank < manifest.candidateK ? 1 : 0,
      },
      evidence: { recall: saved.memory.evidenceIds.length > 0 ? 1 : 0, provenance_coverage: provenanceIds.length > 0 ? 1 : 0 },
      answer: { exact_match: exactMatch },
      agent: { hidden_test_success: null },
      progressive: {
        compact_returned_chars: compact.budget.returnedChars,
        context_returned_chars: context.budget.returnedChars,
        source_chars: compact.budget.sourceChars,
        evidence_chars: compact.budget.evidenceChars,
        full_chars: compact.budget.fullChars,
        truncated_chars: compact.budget.truncatedChars,
        full_fetches: 1, avoided_full_fetches: 0, escalation_rate: 1,
        compression_ratio: compact.budget.compressionRatio,
      },
      compaction: {
        checkpoints: checkpoint.outcome === 'confirmed' ? 1 : 0,
        recoveries: 1,
        recovery_success: recovery.outcome === 'confirmed' && recovery.capability.contextDelivered ? 1 : 0,
        delivered_sources: recovery.recovery?.sources.length ?? 0,
      },
      resources: {
        latency_p50_ms: percentile(latencySamples, 50), latency_p95_ms: percentile(latencySamples, 95),
        ingestion_ms: ingestionMs, startup_ms: startupMs,
        peak_memory_bytes: Math.max(...memorySamples), database_bytes: statSync(databasePath).size,
        model_bytes: 0, network_calls: 0, llm_calls: 0,
        injected_tokens: Math.ceil(context.budget.returnedChars / 4),
        returned_chars: compact.budget.returnedChars, truncated_chars: compact.budget.truncatedChars,
        samples: { latency_ms: latencySamples, memory_bytes: memorySamples },
      },
    },
    provenance: { coverage: provenanceIds.length > 0 ? 1 : 0, source_ids: provenanceIds },
    fallback_controls: fallbackControls,
    operational_errors: operationalErrors,
    unavailable,
    promotion: { decision: 'incomplete', reasons: ['fixture_only_external_lanes_unavailable'] },
  };
  const validation = validateReport(report);
  if (!validation.valid) throw new Error(`Invalid report: ${validation.errors.join(',')}`);
  mkdirSync(resolve(root, 'results'), { recursive: true });
  const output = resolve(root, 'results', 'fixture-report.json');
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${output}\n`);
} finally {
  service?.close();
  rmSync(scratch, { recursive: true, force: true });
}
