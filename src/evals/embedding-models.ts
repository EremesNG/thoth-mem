import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { EmbeddingConfig } from '../config.js';
import { resolveEmbeddingProfile } from '../retrieval/embedding-profile.js';
import { createEmbeddingProvider } from '../retrieval/provider-factory.js';
import type { EmbeddingInput, EmbeddingProviderAdapter } from '../retrieval/providers.js';
import { processEmbeddingVectors } from '../retrieval/vector-processing.js';
import { EMBEDDING_MODEL_CORPUS, type EmbeddingBenchmarkCorpus } from './embedding-model-corpus.js';

export type EmbeddingBenchmarkModelKey = 'nomic' | 'embeddinggemma' | 'qwen3';
export type EmbeddingBenchmarkDefaultDecision = EmbeddingBenchmarkModelKey;

export interface RetrievalMetrics {
  recallAt1: number;
  recallAt5: number;
  mrr: number;
}

export interface EmbeddingBenchmarkModelRun {
  key: EmbeddingBenchmarkModelKey;
  requestedModel: string;
  profile: {
    id: EmbeddingBenchmarkModelKey;
    version: number;
  };
  complete: boolean;
  expectedDimensions: number;
  observedDimensions: number | null;
  norms: {
    min: number | null;
    max: number | null;
    mean: number | null;
  };
  metrics: RetrievalMetrics & { qualityScore: number };
  requestCount: number;
  elapsedMs: number;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  modelBytes: number | null;
  errors: string[];
}

export interface CandidateGateResult {
  eligible: boolean;
  qualityScore: number;
  absoluteThresholds: {
    recallAt1: boolean;
    recallAt5: boolean;
    mrr: boolean;
  };
  noRegression: {
    recallAt1: boolean;
    recallAt5: boolean;
    mrr: boolean;
  };
  reasons: string[];
}

export interface EmbeddingModelGate {
  thresholds: RetrievalMetrics;
  equalityTolerance: number;
  candidates: Record<'embeddinggemma' | 'qwen3', CandidateGateResult>;
  winnerTrace: string[];
  passed: boolean;
  reasons: string[];
  defaultDecision: EmbeddingBenchmarkDefaultDecision;
}

export interface EmbeddingBenchmarkReport {
  version: 1;
  timestamp: string;
  provider: 'lmstudio' | 'transformers_local';
  corpus: {
    hash: string;
    caseCount: number;
    documentCount: number;
  };
  models: Record<EmbeddingBenchmarkModelKey, EmbeddingBenchmarkModelRun>;
  gate: EmbeddingModelGate;
}

export interface EmbeddingModelBenchmarkOptions {
  provider: 'lmstudio' | 'transformers_local';
  baseUrl: string | null;
  models: Record<EmbeddingBenchmarkModelKey, string>;
  modelBytes?: Partial<Record<EmbeddingBenchmarkModelKey, number | null>>;
  providerFactory?: (config: EmbeddingConfig) => EmbeddingProviderAdapter;
  timestamp?: string;
  nowMs?: () => number;
}

const GATE_THRESHOLDS: RetrievalMetrics = {
  recallAt1: 0.8,
  recallAt5: 0.95,
  mrr: 0.85,
};
const EQUALITY_TOLERANCE = 1e-12;

export function computeRetrievalMetrics(ranks: Array<number | null>): RetrievalMetrics {
  if (ranks.length === 0) {
    return { recallAt1: 0, recallAt5: 0, mrr: 0 };
  }
  const total = ranks.length;
  const recallAt1 = ranks.filter((rank) => rank === 1).length / total;
  const recallAt5 = ranks.filter((rank) => rank !== null && rank <= 5).length / total;
  const reciprocalRankSum = ranks.reduce<number>(
    (sum, rank) => sum + (rank === null ? 0 : 1 / rank),
    0,
  );
  return { recallAt1, recallAt5, mrr: reciprocalRankSum / total };
}

export function hashEmbeddingBenchmarkCorpus(corpus: EmbeddingBenchmarkCorpus): string {
  return createHash('sha256').update(JSON.stringify(corpus)).digest('hex');
}

function meetsThreshold(value: number, threshold: number): boolean {
  return value + EQUALITY_TOLERANCE >= threshold;
}

function candidateGateResult(
  candidate: EmbeddingBenchmarkModelRun,
  baseline: EmbeddingBenchmarkModelRun,
): CandidateGateResult {
  const absoluteThresholds = {
    recallAt1: meetsThreshold(candidate.metrics.recallAt1, GATE_THRESHOLDS.recallAt1),
    recallAt5: meetsThreshold(candidate.metrics.recallAt5, GATE_THRESHOLDS.recallAt5),
    mrr: meetsThreshold(candidate.metrics.mrr, GATE_THRESHOLDS.mrr),
  };
  const noRegression = {
    recallAt1: meetsThreshold(candidate.metrics.recallAt1, baseline.metrics.recallAt1),
    recallAt5: meetsThreshold(candidate.metrics.recallAt5, baseline.metrics.recallAt5),
    mrr: meetsThreshold(candidate.metrics.mrr, baseline.metrics.mrr),
  };
  const reasons: string[] = [];
  if (!candidate.complete) reasons.push(`${candidate.key} run is incomplete.`);
  for (const metric of ['recallAt1', 'recallAt5', 'mrr'] as const) {
    if (!absoluteThresholds[metric]) reasons.push(`${candidate.key} ${metric} is below the absolute threshold.`);
    if (!noRegression[metric]) reasons.push(`${candidate.key} ${metric} regresses Nomic.`);
  }

  return {
    eligible: candidate.complete
      && Object.values(absoluteThresholds).every(Boolean)
      && Object.values(noRegression).every(Boolean),
    qualityScore: candidate.metrics.qualityScore,
    absoluteThresholds,
    noRegression,
    reasons,
  };
}

function compareCandidates(
  left: EmbeddingBenchmarkModelRun,
  right: EmbeddingBenchmarkModelRun,
): { winner: EmbeddingBenchmarkModelRun; trace: string[] } {
  const trace: string[] = [];
  const comparisons: Array<{ label: string; left: number; right: number }> = [
    { label: 'qualityScore', left: left.metrics.qualityScore, right: right.metrics.qualityScore },
    { label: 'MRR', left: left.metrics.mrr, right: right.metrics.mrr },
    { label: 'Recall@1', left: left.metrics.recallAt1, right: right.metrics.recallAt1 },
    { label: 'Recall@5', left: left.metrics.recallAt5, right: right.metrics.recallAt5 },
  ];

  for (const comparison of comparisons) {
    const difference = comparison.left - comparison.right;
    if (Math.abs(difference) <= EQUALITY_TOLERANCE) {
      trace.push(`${comparison.label} tied within tolerance.`);
      continue;
    }
    const winner = difference > 0 ? left : right;
    trace.push(`${winner.key} wins on ${comparison.label}.`);
    return { winner, trace };
  }

  const winner = left.profile.id.localeCompare(right.profile.id) <= 0 ? left : right;
  trace.push(`${winner.key} wins by lexical profile ID.`);
  return { winner, trace };
}

export function evaluateEmbeddingModelGate(
  models: Record<EmbeddingBenchmarkModelKey, EmbeddingBenchmarkModelRun>,
): EmbeddingModelGate {
  const reasons: string[] = [];
  for (const key of ['nomic', 'embeddinggemma', 'qwen3'] as const) {
    if (!models[key].complete) reasons.push(`${key} run is incomplete.`);
  }

  const candidates = {
    embeddinggemma: candidateGateResult(models.embeddinggemma, models.nomic),
    qwen3: candidateGateResult(models.qwen3, models.nomic),
  };
  const eligibleRuns = ([models.embeddinggemma, models.qwen3])
    .filter((run) => candidates[run.key as 'embeddinggemma' | 'qwen3'].eligible);
  if (eligibleRuns.length === 0) reasons.push('No candidate is eligible.');

  let winner: EmbeddingBenchmarkModelRun | null = null;
  let winnerTrace: string[] = [];
  if (eligibleRuns.length === 1) {
    winner = eligibleRuns[0];
    winnerTrace = [`${winner.key} is the only eligible candidate.`];
  } else if (eligibleRuns.length === 2) {
    const comparison = compareCandidates(eligibleRuns[0], eligibleRuns[1]);
    winner = comparison.winner;
    winnerTrace = comparison.trace;
  }

  const allRunsComplete = models.nomic.complete && models.embeddinggemma.complete && models.qwen3.complete;
  const passed = allRunsComplete && winner !== null;
  return {
    thresholds: { ...GATE_THRESHOLDS },
    equalityTolerance: EQUALITY_TOLERANCE,
    candidates,
    winnerTrace,
    passed,
    reasons,
    defaultDecision: passed && winner ? winner.key : 'nomic',
  };
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
  }
  return dot;
}

function computeNorms(vectors: number[][]): EmbeddingBenchmarkModelRun['norms'] {
  if (vectors.length === 0) return { min: null, max: null, mean: null };
  const norms = vectors.map((vector) => Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0)));
  return {
    min: Math.min(...norms),
    max: Math.max(...norms),
    mean: norms.reduce((sum, value) => sum + value, 0) / norms.length,
  };
}

function emptyMetrics(): EmbeddingBenchmarkModelRun['metrics'] {
  return { recallAt1: 0, recallAt5: 0, mrr: 0, qualityScore: 0 };
}

async function runSingleModel(
  key: EmbeddingBenchmarkModelKey,
  options: EmbeddingModelBenchmarkOptions,
): Promise<EmbeddingBenchmarkModelRun> {
  const expectedDimensions = key === 'qwen3' ? 1024 : 768;
  const profile = resolveEmbeddingProfile(options.models[key], key);
  const config: EmbeddingConfig = {
    provider: options.provider,
    device: 'cpu',
    model: options.models[key],
    baseUrl: options.provider === 'lmstudio' ? options.baseUrl : null,
    dimensions: expectedDimensions,
    profile: key,
    resolvedProfile: profile,
    normalize: true,
    configHash: `embedding-benchmark:${key}:${options.models[key]}`,
  };
  const nowMs = options.nowMs ?? Date.now;
  const startedAt = nowMs();
  const latencies: number[] = [];
  let requestCount = 0;

  try {
    const provider = (options.providerFactory ?? createEmbeddingProvider)(config);
    const documentInputs: EmbeddingInput[] = EMBEDDING_MODEL_CORPUS.documents.map((document) => ({
      text: document.text,
      title: document.title,
      intent: 'retrieval',
      role: 'document',
    }));
    const queryInputs: EmbeddingInput[] = EMBEDDING_MODEL_CORPUS.cases.map((benchmarkCase) => ({
      text: benchmarkCase.query,
      intent: 'retrieval',
      role: 'query',
    }));

    let requestStartedAt = nowMs();
    requestCount += 1;
    const rawDocumentVectors = await provider.embed(documentInputs);
    latencies.push(nowMs() - requestStartedAt);
    const documentVectors = processEmbeddingVectors(
      rawDocumentVectors.map((vector, index) => ({ index, vector })),
      { expectedCount: documentInputs.length, dimensions: expectedDimensions, normalize: true },
    );

    requestStartedAt = nowMs();
    requestCount += 1;
    const rawQueryVectors = await provider.embed(queryInputs);
    latencies.push(nowMs() - requestStartedAt);
    const queryVectors = processEmbeddingVectors(
      rawQueryVectors.map((vector, index) => ({ index, vector })),
      { expectedCount: queryInputs.length, dimensions: expectedDimensions, normalize: true },
    );

    const ranks = EMBEDDING_MODEL_CORPUS.cases.map((benchmarkCase, caseIndex) => {
      const ranked = EMBEDDING_MODEL_CORPUS.documents
        .map((document, documentIndex) => ({
          id: document.id,
          score: cosineSimilarity(queryVectors[caseIndex], documentVectors[documentIndex]),
        }))
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
      const rank = ranked.findIndex((document) => document.id === benchmarkCase.expectedDocumentId);
      return rank < 0 ? null : rank + 1;
    });
    const metrics = computeRetrievalMetrics(ranks);
    const allVectors = [...documentVectors, ...queryVectors];
    return {
      key,
      requestedModel: options.models[key],
      profile: { id: key, version: profile.version },
      complete: true,
      expectedDimensions,
      observedDimensions: allVectors[0]?.length ?? null,
      norms: computeNorms(allVectors),
      metrics: {
        ...metrics,
        qualityScore: (metrics.recallAt1 + metrics.recallAt5 + metrics.mrr) / 3,
      },
      requestCount,
      elapsedMs: nowMs() - startedAt,
      medianLatencyMs: median(latencies),
      p95LatencyMs: percentile(latencies, 0.95),
      modelBytes: options.modelBytes?.[key] ?? null,
      errors: [],
    };
  } catch (error) {
    return {
      key,
      requestedModel: options.models[key],
      profile: { id: key, version: profile.version },
      complete: false,
      expectedDimensions,
      observedDimensions: null,
      norms: { min: null, max: null, mean: null },
      metrics: emptyMetrics(),
      requestCount,
      elapsedMs: nowMs() - startedAt,
      medianLatencyMs: median(latencies),
      p95LatencyMs: percentile(latencies, 0.95),
      modelBytes: options.modelBytes?.[key] ?? null,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function runEmbeddingModelBenchmark(
  options: EmbeddingModelBenchmarkOptions,
): Promise<EmbeddingBenchmarkReport> {
  const nomic = await runSingleModel('nomic', options);
  const embeddinggemma = await runSingleModel('embeddinggemma', options);
  const qwen3 = await runSingleModel('qwen3', options);
  const models = { nomic, embeddinggemma, qwen3 };
  return {
    version: 1,
    timestamp: options.timestamp ?? new Date().toISOString(),
    provider: options.provider,
    corpus: {
      hash: hashEmbeddingBenchmarkCorpus(EMBEDDING_MODEL_CORPUS),
      caseCount: EMBEDDING_MODEL_CORPUS.cases.length,
      documentCount: EMBEDDING_MODEL_CORPUS.documents.length,
    },
    models,
    gate: evaluateEmbeddingModelGate(models),
  };
}

export function writeEmbeddingBenchmarkReport(path: string, report: EmbeddingBenchmarkReport): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not exist when setup or the initial write failed.
    }
    throw error;
  }
}

function formatMetric(value: number): string {
  return value.toFixed(4);
}

export function renderEmbeddingBenchmarkMarkdown(report: EmbeddingBenchmarkReport): string {
  const lines = [
    '# Embedding model benchmark',
    '',
    `Timestamp: ${report.timestamp}`,
    `Provider: **${report.provider}**`,
    `Corpus: \`${report.corpus.hash}\` (${report.corpus.caseCount} cases, ${report.corpus.documentCount} documents)`,
    '',
    '| Model | Requested model | Profile | Complete | Expected/observed dimensions | Norm min/max/mean | Recall@1 | Recall@5 | MRR | Quality | Requests | Elapsed ms | Median ms | P95 ms | Bytes |',
    '| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const key of ['nomic', 'embeddinggemma', 'qwen3'] as const) {
    const run = report.models[key];
    lines.push(
      `| ${key} | ${run.requestedModel} | ${run.profile.id}@${run.profile.version} | ${run.complete ? 'yes' : 'no'} | ${run.expectedDimensions}/${run.observedDimensions ?? 'n/a'} | ${run.norms.min === null ? 'n/a' : formatMetric(run.norms.min)}/${run.norms.max === null ? 'n/a' : formatMetric(run.norms.max)}/${run.norms.mean === null ? 'n/a' : formatMetric(run.norms.mean)} | ${formatMetric(run.metrics.recallAt1)} | ${formatMetric(run.metrics.recallAt5)} | ${formatMetric(run.metrics.mrr)} | ${formatMetric(run.metrics.qualityScore)} | ${run.requestCount} | ${run.elapsedMs} | ${run.medianLatencyMs ?? 'n/a'} | ${run.p95LatencyMs ?? 'n/a'} | ${run.modelBytes ?? 'n/a'} |`,
    );
  }
  for (const key of ['nomic', 'embeddinggemma', 'qwen3'] as const) {
    for (const error of report.models[key].errors) lines.push(`- ${key} error: ${error}`);
  }
  lines.push(
    '',
    `Thresholds: Recall@1 >= ${formatMetric(report.gate.thresholds.recallAt1)}, Recall@5 >= ${formatMetric(report.gate.thresholds.recallAt5)}, MRR >= ${formatMetric(report.gate.thresholds.mrr)}`,
    `Equality tolerance: \`${report.gate.equalityTolerance}\``,
    '',
    '| Candidate | Eligible | Quality | Absolute thresholds | No regression vs Nomic |',
    '| --- | --- | ---: | --- | --- |',
  );
  const candidateDetails: string[] = [];
  for (const key of ['embeddinggemma', 'qwen3'] as const) {
    const candidate = report.gate.candidates[key];
    const absolute = `R@1:${candidate.absoluteThresholds.recallAt1 ? 'pass' : 'fail'}, R@5:${candidate.absoluteThresholds.recallAt5 ? 'pass' : 'fail'}, MRR:${candidate.absoluteThresholds.mrr ? 'pass' : 'fail'}`;
    const noRegression = `R@1:${candidate.noRegression.recallAt1 ? 'pass' : 'fail'}, R@5:${candidate.noRegression.recallAt5 ? 'pass' : 'fail'}, MRR:${candidate.noRegression.mrr ? 'pass' : 'fail'}`;
    lines.push(`| ${key} | ${candidate.eligible ? 'yes' : 'no'} | ${formatMetric(candidate.qualityScore)} | ${absolute} | ${noRegression} |`);
    candidateDetails.push(`- ${key} checks: absolute R@1: ${candidate.absoluteThresholds.recallAt1 ? 'pass' : 'fail'}; absolute R@5: ${candidate.absoluteThresholds.recallAt5 ? 'pass' : 'fail'}; absolute MRR: ${candidate.absoluteThresholds.mrr ? 'pass' : 'fail'}; no-regression R@1: ${candidate.noRegression.recallAt1 ? 'pass' : 'fail'}; no-regression R@5: ${candidate.noRegression.recallAt5 ? 'pass' : 'fail'}; no-regression MRR: ${candidate.noRegression.mrr ? 'pass' : 'fail'}.`);
    for (const reason of candidate.reasons) candidateDetails.push(`- ${key} rejection: ${reason}`);
  }
  lines.push(
    '',
    ...candidateDetails,
    '',
    `Gate: **${report.gate.passed ? 'PASS' : 'FAIL'}**`,
    `Default decision: **${report.gate.defaultDecision}**`,
  );
  for (const reason of report.gate.reasons) lines.push(`- ${reason}`);
  for (const step of report.gate.winnerTrace) lines.push(`- ${step}`);
  return lines.join('\n');
}

function readCliValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return null;
  return args[index + 1];
}

export function embeddingBenchmarkUsage(): string {
  return [
    'Usage: pnpm run eval:embedding-models -- [options]',
    '',
    'Required:',
    '  --provider <lmstudio|transformers_local>',
    '  --nomic-model <model-id>',
    '  --embeddinggemma-model <model-id>',
    '  --qwen3-model <model-id>',
    '  --output <json-path>',
    '',
    'LM Studio:',
    '  --base-url <url>',
    '',
    'Optional operational metadata:',
    '  --nomic-bytes <bytes>',
    '  --embeddinggemma-bytes <bytes>',
    '  --qwen3-bytes <bytes>',
  ].join('\n');
}

function parseOptionalBytes(args: string[], name: string): number | null {
  const raw = readCliValue(args, name);
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer byte count.`);
  }
  return value;
}

export interface EmbeddingBenchmarkCliDependencies {
  runBenchmark?: typeof runEmbeddingModelBenchmark;
  writeReport?: typeof writeEmbeddingBenchmarkReport;
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
}

export async function runEmbeddingBenchmarkCli(
  args: string[],
  dependencies: EmbeddingBenchmarkCliDependencies = {},
): Promise<number> {
  const writeStdout = dependencies.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = dependencies.writeStderr ?? ((text: string) => process.stderr.write(text));

  try {
    if (args.includes('--help')) {
      writeStdout(`${embeddingBenchmarkUsage()}\n`);
      return 0;
    }
    const providerValue = readCliValue(args, '--provider');
    if (providerValue !== 'lmstudio' && providerValue !== 'transformers_local') {
      throw new Error('--provider must be lmstudio or transformers_local.');
    }
    const required = (name: string): string => {
      const value = readCliValue(args, name)?.trim();
      if (!value) throw new Error(`${name} is required.`);
      return value;
    };
    const baseUrl = providerValue === 'lmstudio' ? required('--base-url').replace(/\/+$/, '') : null;
    const output = required('--output');
    const report = await (dependencies.runBenchmark ?? runEmbeddingModelBenchmark)({
      provider: providerValue,
      baseUrl,
      models: {
        nomic: required('--nomic-model'),
        embeddinggemma: required('--embeddinggemma-model'),
        qwen3: required('--qwen3-model'),
      },
      modelBytes: {
        nomic: parseOptionalBytes(args, '--nomic-bytes'),
        embeddinggemma: parseOptionalBytes(args, '--embeddinggemma-bytes'),
        qwen3: parseOptionalBytes(args, '--qwen3-bytes'),
      },
    });
    (dependencies.writeReport ?? writeEmbeddingBenchmarkReport)(output, report);
    writeStdout(`${renderEmbeddingBenchmarkMarkdown(report)}\n`);
    return report.gate.passed ? 0 : 1;
  } catch (error) {
    writeStderr(`[embedding-model-benchmark] failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runEmbeddingBenchmarkCli(process.argv.slice(2)).then((exitCode) => {
    if (exitCode !== 0) process.exitCode = exitCode;
  });
}
