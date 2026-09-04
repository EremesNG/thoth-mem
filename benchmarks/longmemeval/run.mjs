import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { classifyRecord, inspectDataset, LONGMEMEVAL_SOURCE, normalizeSessions, streamJsonArray, validateRecord } from './contract.mjs';
import { DEFAULT_LONGMEMEVAL_CACHE } from './prepare.mjs';
import { aggregateLexicalDiagnostics } from '../lexical-comparison-report.mjs';
import { aggregateScores, percentile, scoreRanking, validateRetrievalReport } from '../retrieval-report.mjs';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const CANDIDATE_K = 20;
const CANDIDATE_PAYLOAD_UTF16 = 20_000;
const DELIVERY_UTF16 = 4_000;
const DELIVERY_TOKENS = 1_000;
const TOKEN_BASIS = 'estimated_chars_div_4';
const CANDIDATE_CONFIG = Object.freeze({
  lexical: true,
  granularity: 'session',
  dialogue: 'all_roles',
  engine: 'sqlite-fts5-bm25',
  query_expansion: false,
  candidate_k: CANDIDATE_K,
  candidate_payload_utf16_code_units: CANDIDATE_PAYLOAD_UTF16,
  delivery_utf16_code_units: DELIVERY_UTF16,
});

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sourceIdentity(source) {
  return {
    dataset: source.dataset,
    filename: source.filename,
    revision: source.revision,
    sha256: source.sha256,
    bytes: source.bytes,
    license: source.license,
  };
}

function sampleSummary(samples) {
  return { p50: percentile(samples, 50), p95: percentile(samples, 95), samples };
}

function reportBudget(budget) {
  return {
    requested_utf16_code_units: budget.requestedChars,
    returned_utf16_code_units: budget.returnedChars,
    truncated_utf16_code_units: budget.truncatedChars,
    source_utf16_code_units: budget.sourceChars,
    evidence_utf16_code_units: budget.evidenceChars,
    full_utf16_code_units: budget.fullChars,
    compression_ratio: budget.compressionRatio,
    token_basis: budget.tokenBasis,
  };
}

function addBudgetTotals(total, budget) {
  total.source += budget.source_utf16_code_units;
  total.evidence += budget.evidence_utf16_code_units;
  total.returned += budget.returned_utf16_code_units;
  total.truncated += budget.truncated_utf16_code_units;
}

function diagnosticWork(work) {
  return {
    ranked_fts_rows: work.rankedFtsRows,
    fused_lexical_rows: work.fusedLexicalRows,
    hydrated_memory_rows: work.hydratedMemoryRows,
    hydrated_evidence_links: work.hydratedEvidenceLinks,
    memory_hydration_statements: work.memoryHydrationStatements,
    evidence_hydration_statements: work.evidenceHydrationStatements,
    snippet_token_checks: work.snippetTokenChecks,
    returned_rows: work.returnedRows,
    source_utf16_code_units: work.sourceChars,
    evidence_utf16_code_units: work.evidenceChars,
    returned_utf16_code_units: work.returnedChars,
  };
}

function diagnosticQuery(questionId, observation) {
  return {
    question_id: questionId,
    strategy_id: observation.strategyId,
    config_hash: observation.configHash,
    plan_hash: observation.planHash,
    total_elapsed_ms: observation.totalElapsedMs,
    stages: observation.stages.map((stage) => ({
      kind: stage.kind,
      executed: stage.executed,
      elapsed_ms: stage.elapsedMs,
      rows: stage.rows,
      ...(stage.reason ? { reason: stage.reason } : {}),
    })),
    work: diagnosticWork(observation.work),
    result: {
      requested_limit: observation.result.requestedLimit,
      max_lexical_results: observation.result.maxLexicalResults,
      returned_count: observation.result.returnedCount,
      budget: {
        requested_utf16_code_units: observation.result.budget.requestedChars,
        source_utf16_code_units: observation.result.budget.sourceChars,
        evidence_utf16_code_units: observation.result.budget.evidenceChars,
        returned_utf16_code_units: observation.result.budget.returnedChars,
      },
    },
  };
}

function mapRecall(items, memoryToSource, questionId) {
  return items.map((item) => {
    const source = memoryToSource.get(item.id);
    if (!source) throw new Error(`Missing provenance mapping for ${questionId}:${item.id}`);
    return source;
  });
}

export async function runLongMemEval(options = {}) {
  const source = options.source ?? LONGMEMEVAL_SOURCE;
  const datasetPath = resolve(options.datasetPath ?? join(DEFAULT_LONGMEMEVAL_CACHE, LONGMEMEVAL_SOURCE.filename));
  const expectedSha256 = options.expectedSha256 ?? source.sha256;
  const outputPath = resolve(options.outputPath ?? resolve(moduleDirectory, '..', 'results', 'longmemeval-s-fts5-report.json'));
  if (existsSync(outputPath)) throw new Error(`LongMemEval output already exists: ${outputPath}`);
  const ownsWorkDirectory = !options.workDirectory;
  const workDirectory = options.workDirectory
    ? resolve(options.workDirectory)
    : mkdtempSync(join(tmpdir(), 'thoth-longmemeval-'));
  mkdirSync(workDirectory, { recursive: true });

  const inspection = await inspectDataset(datasetPath, { expectedSha256 });
  const { MemoryService, buildFtsQueryPlan } = await import('../../dist/index.js');
  const lexicalStrategy = options.lexicalStrategy ?? 'all-prefix-v1';
  const strategyProbe = buildFtsQueryPlan('lexical strategy configuration', lexicalStrategy);
  if (!strategyProbe) throw new Error(`Unsupported lexical query strategy: ${lexicalStrategy}`);
  const candidateConfig = Object.freeze({
    ...CANDIDATE_CONFIG,
    lexical_strategy: Object.freeze({ id: lexicalStrategy, config_hash: strategyProbe.configHash }),
  });
  const queries = [];
  const mappings = [];
  const retrievalLatency = [];
  const deliveryLatency = [];
  const ingestionSamples = [];
  const startupSamples = [];
  const rssSamples = [];
  const sqliteSamples = [];
  const diagnosticQueries = [];
  let corpusUtf16 = 0;
  let queryUtf16 = 0;
  const rankingText = { source: 0, evidence: 0, returned: 0, truncated: 0 };
  const deliveryText = { source: 0, evidence: 0, returned: 0, truncated: 0 };

  try {
    for await (const value of streamJsonArray(createReadStream(datasetPath))) {
      const record = validateRecord(value);
      if (!classifyRecord(record).eligible) continue;
      const questionDirectory = mkdtempSync(join(workDirectory, 'question-'));
      const databasePath = join(questionDirectory, 'memory.sqlite');
      let service;
      let captureDiagnostic = false;
      let capturedDiagnostic = null;
      try {
        const startupStart = performance.now();
        service = new MemoryService({ databasePath, recallObserver: (observation) => {
          if (captureDiagnostic) capturedDiagnostic = observation;
        } });
        startupSamples.push(performance.now() - startupStart);
        const projectKey = `benchmark:longmemeval:${record.question_id}`;
        const memoryToSource = new Map();
        const sessions = normalizeSessions(record);
        const ingestionStart = performance.now();
        for (const session of sessions) {
          const saved = service.save({
            project: { key: projectKey, name: record.question_id },
            eventKey: `longmemeval:${record.question_id}:${session.sourceId}`,
            evidence: {
              kind: 'explicit_save',
              content: session.text,
              sourceRef: session.sourceId,
              capturedAt: session.capturedAt,
              metadata: { datasetSessionId: session.sessionId, sessionIndex: session.index },
            },
            memory: { kind: 'discovery', title: `Session ${session.index + 1}`, content: session.text },
          });
          if (!saved.memory) throw new Error(`Memory promotion failed for ${record.question_id}:${session.sourceId}`);
          memoryToSource.set(saved.memory.id, { sourceId: session.sourceId, sessionId: session.sessionId });
          mappings.push({ question_id: record.question_id, source_id: session.sourceId, session_index: session.index, session_id: session.sessionId, memory_id: saved.memory.id, evidence_id: saved.evidence.id });
          corpusUtf16 += session.text.length;
        }
        ingestionSamples.push(performance.now() - ingestionStart);
        queryUtf16 += record.question.length;

        const retrievalStart = performance.now();
        const queryPlan = buildFtsQueryPlan(record.question, lexicalStrategy);
        const queryPlanHash = queryPlan?.planHash ?? hash({ strategyId: lexicalStrategy, configHash: strategyProbe.configHash, stages: [] });
        captureDiagnostic = true;
        const ranked = service.recall({ projectKey, query: record.question, mode: 'compact', limit: CANDIDATE_K, budgetChars: CANDIDATE_PAYLOAD_UTF16, lexicalStrategy });
        captureDiagnostic = false;
        retrievalLatency.push(performance.now() - retrievalStart);
        if (!capturedDiagnostic) throw new Error(`Missing ranking retrieval diagnostics for ${record.question_id}`);
        diagnosticQueries.push(diagnosticQuery(record.question_id, capturedDiagnostic));
        const deliveryStart = performance.now();
        const delivered = service.recall({ projectKey, query: record.question, mode: 'compact', limit: CANDIDATE_K, budgetChars: DELIVERY_UTF16, lexicalStrategy });
        deliveryLatency.push(performance.now() - deliveryStart);
        const rankedSources = mapRecall(ranked.items, memoryToSource, record.question_id);
        const deliveredSources = mapRecall(delivered.items, memoryToSource, record.question_id);
        const rankedSessionIds = rankedSources.map((source) => source.sessionId);
        const deliveredSessionIds = deliveredSources.map((source) => source.sessionId);
        const goldSet = new Set(record.answer_session_ids);
        const goldSourceIds = sessions.filter((session) => goldSet.has(session.sessionId)).map((session) => session.sourceId);
        const rankingBudget = reportBudget(ranked.budget);
        const deliveryBudget = reportBudget(delivered.budget);
        addBudgetTotals(rankingText, rankingBudget);
        addBudgetTotals(deliveryText, deliveryBudget);
        const rankingMetrics = scoreRanking(rankedSessionIds, record.answer_session_ids, goldSourceIds.length);
        const deliveryMetrics = scoreRanking(deliveredSessionIds, record.answer_session_ids, goldSourceIds.length);
        queries.push({
          question_id: record.question_id,
          question_type: record.question_type,
          query_plan_hash: queryPlanHash,
          gold_session_ids: [...record.answer_session_ids],
          gold_source_ids: goldSourceIds,
          ranked_source_ids: rankedSources.map((source) => source.sourceId),
          ranked_session_ids: rankedSessionIds,
          delivered_source_ids: deliveredSources.map((source) => source.sourceId),
          delivered_session_ids: deliveredSessionIds,
          gold_ranks: record.answer_session_ids.map((id) => rankedSessionIds.indexOf(id) + 1).filter((rank) => rank > 0),
          ranking_budget: rankingBudget,
          delivery_budget: deliveryBudget,
          ranking: rankingMetrics,
          delivery: deliveryMetrics,
        });
        rssSamples.push(process.memoryUsage().rss);
      } finally {
        service?.close();
        if (existsSync(databasePath)) sqliteSamples.push(statSync(databasePath).size);
        rmSync(questionDirectory, { recursive: true, force: true });
      }
    }

    const queryOrder = queries.map((query) => query.question_id);
    if (JSON.stringify(queryOrder) !== JSON.stringify(inspection.queryOrder)) throw new Error('LongMemEval query order changed during evaluation');
    const report = {
      schema: 'thoth-mem.retrieval-benchmark-report.v1',
      created_at: new Date().toISOString(),
      dataset: {
        name: 'LongMemEval-S cleaned',
        source: sourceIdentity(source),
        corpus_hash: inspection.corpusHash,
        query_hash: inspection.queryHash,
        record_count: inspection.recordCount,
        evaluated_count: inspection.eligibleCount,
        exclusions: inspection.exclusions,
      },
      candidate: { id: 'sqlite-fts5-bm25-session-full', config_hash: hash(candidateConfig), config: candidateConfig },
      conditions: {
        query_order: queryOrder,
        query_order_hash: hash(queryOrder),
        candidate_k: CANDIDATE_K,
        candidate_payload_utf16_code_units: CANDIDATE_PAYLOAD_UTF16,
        delivery: { utf16_code_units: DELIVERY_UTF16, estimated_tokens: DELIVERY_TOKENS, token_basis: TOKEN_BASIS },
      },
      environment: { runtime: 'node', runtime_version: process.versions.node, platform: process.platform, arch: process.arch },
      metrics: {
        ranking: aggregateScores(queries.map((query) => ({ questionType: query.question_type, metrics: query.ranking }))),
        delivery: aggregateScores(queries.map((query) => ({ questionType: query.question_type, metrics: query.delivery }))),
        resources: {
          retrieval_latency_ms: sampleSummary(retrievalLatency),
          delivery_latency_ms: sampleSummary(deliveryLatency),
          ingestion_ms: sampleSummary(ingestionSamples),
          startup_ms: sampleSummary(startupSamples),
          rss_bytes: { peak: Math.max(...rssSamples), samples: rssSamples },
          sqlite_bytes: { total: sqliteSamples.reduce((sum, value) => sum + value, 0), ...sampleSummary(sqliteSamples) },
          text: {
            corpus_utf16_code_units: corpusUtf16,
            query_utf16_code_units: queryUtf16,
            ranked_source_utf16_code_units: rankingText.source,
            ranked_evidence_utf16_code_units: rankingText.evidence,
            ranked_returned_utf16_code_units: rankingText.returned,
            ranked_truncated_utf16_code_units: rankingText.truncated,
            delivery_source_utf16_code_units: deliveryText.source,
            delivery_evidence_utf16_code_units: deliveryText.evidence,
            delivered_utf16_code_units: deliveryText.returned,
            delivery_truncated_utf16_code_units: deliveryText.truncated,
            estimated_tokens: {
              corpus: Math.ceil(corpusUtf16 / 4),
              queries: Math.ceil(queryUtf16 / 4),
              ranked_source: Math.ceil(rankingText.source / 4),
              ranked_returned: Math.ceil(rankingText.returned / 4),
              ranked_truncated: Math.ceil(rankingText.truncated / 4),
              delivery_source: Math.ceil(deliveryText.source / 4),
              delivered: Math.ceil(deliveryText.returned / 4),
              delivery_truncated: Math.ceil(deliveryText.truncated / 4),
            },
          },
          network_calls: 0,
          model_calls: 0,
          llm_calls: 0,
        },
      },
      provenance: { coverage: 1, mappings },
      queries,
      errors: [],
      promotion: { decision: 'incomplete', reasons: ['lexical_baseline_only_no_candidate_comparison'] },
    };
    const validation = validateRetrievalReport(report);
    if (!validation.valid) throw new Error(`Invalid LongMemEval report: ${validation.errors.join(', ')}`);
    mkdirSync(dirname(outputPath), { recursive: true });
    const temporaryOutput = join(dirname(outputPath), `.${randomUUID()}.tmp`);
    try {
      writeFileSync(temporaryOutput, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      try {
        linkSync(temporaryOutput, outputPath);
      } catch (error) {
        if (error?.code === 'EEXIST') throw new Error(`LongMemEval output already exists: ${outputPath}`);
        throw error;
      }
    } finally {
      rmSync(temporaryOutput, { force: true });
    }
    const aggregateDiagnostics = aggregateLexicalDiagnostics(diagnosticQueries);
    aggregateDiagnostics.work.fused_lexical_rows = diagnosticQueries.reduce((sum, query) => sum + query.work.fused_lexical_rows, 0);
    const diagnostics = {
      strategy_id: lexicalStrategy,
      config_hash: strategyProbe.configHash,
      max_lexical_results: strategyProbe.maxLexicalResults,
      queries: diagnosticQueries,
      aggregate: aggregateDiagnostics,
    };
    return { outputPath, report, diagnostics };
  } finally {
    if (ownsWorkDirectory) rmSync(workDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  if (process.argv.length > 2) throw new Error('LongMemEval evaluation does not accept source or dataset overrides');
  const result = await runLongMemEval();
  process.stdout.write(`${result.outputPath}\n`);
}
