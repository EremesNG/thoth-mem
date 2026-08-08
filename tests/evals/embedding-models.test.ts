import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EMBEDDING_MODEL_CORPUS } from '../../src/evals/embedding-model-corpus.js';
import {
  computeRetrievalMetrics,
  evaluateEmbeddingModelGate,
  hashEmbeddingBenchmarkCorpus,
  renderEmbeddingBenchmarkMarkdown,
  runEmbeddingBenchmarkCli,
  runEmbeddingModelBenchmark,
  writeEmbeddingBenchmarkReport,
  type EmbeddingBenchmarkModelKey,
  type EmbeddingBenchmarkModelRun,
  type EmbeddingBenchmarkReport,
} from '../../src/evals/embedding-models.js';
import type { EmbeddingProviderAdapter } from '../../src/retrieval/providers.js';

function completeRun(
  key: EmbeddingBenchmarkModelKey,
  metrics: { recallAt1: number; recallAt5: number; mrr: number },
): EmbeddingBenchmarkModelRun {
  return {
    key,
    requestedModel: `${key}-model`,
    profile: { id: key === 'qwen3' ? 'qwen3' : key, version: 1 },
    complete: true,
    expectedDimensions: key === 'qwen3' ? 1024 : 768,
    observedDimensions: key === 'qwen3' ? 1024 : 768,
    norms: { min: 1, max: 1, mean: 1 },
    metrics: { ...metrics, qualityScore: (metrics.recallAt1 + metrics.recallAt5 + metrics.mrr) / 3 },
    requestCount: 2,
    elapsedMs: 20,
    medianLatencyMs: 10,
    p95LatencyMs: 12,
    modelBytes: null,
    errors: [],
  };
}

function reportWithGate(gate: ReturnType<typeof evaluateEmbeddingModelGate>): EmbeddingBenchmarkReport {
  const baseline = completeRun('nomic', { recallAt1: 0.8, recallAt5: 1, mrr: 0.9 });
  return {
    version: 1,
    timestamp: '2026-08-08T18:00:00.000Z',
    provider: 'lmstudio',
    corpus: {
      hash: hashEmbeddingBenchmarkCorpus(EMBEDDING_MODEL_CORPUS),
      caseCount: EMBEDDING_MODEL_CORPUS.cases.length,
      documentCount: EMBEDDING_MODEL_CORPUS.documents.length,
    },
    models: {
      nomic: baseline,
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 0.9, recallAt5: 1, mrr: 0.95 }),
      qwen3: completeRun('qwen3', { recallAt1: 1, recallAt5: 1, mrr: 1 }),
    },
    gate,
  };
}

describe('embedding model corpus', () => {
  it('has stable unique identifiers and one valid expected document per case', () => {
    const documentIds = EMBEDDING_MODEL_CORPUS.documents.map((document) => document.id);
    const caseIds = EMBEDDING_MODEL_CORPUS.cases.map((benchmarkCase) => benchmarkCase.id);

    expect(new Set(documentIds).size).toBe(documentIds.length);
    expect(new Set(caseIds).size).toBe(caseIds.length);
    expect(EMBEDDING_MODEL_CORPUS.documents.length).toBeGreaterThanOrEqual(5);
    expect(EMBEDDING_MODEL_CORPUS.cases.length).toBeGreaterThanOrEqual(8);
    expect(EMBEDDING_MODEL_CORPUS.cases.every((benchmarkCase) => (
      documentIds.includes(benchmarkCase.expectedDocumentId)
    ))).toBe(true);
  });

  it('has a deterministic identity that changes with corpus content', () => {
    const original = hashEmbeddingBenchmarkCorpus(EMBEDDING_MODEL_CORPUS);
    const clone = structuredClone(EMBEDDING_MODEL_CORPUS);
    const changed = structuredClone(EMBEDDING_MODEL_CORPUS);
    changed.cases[0].query = `${changed.cases[0].query} changed`;

    expect(original).toMatch(/^[a-f0-9]{64}$/);
    expect(hashEmbeddingBenchmarkCorpus(clone)).toBe(original);
    expect(hashEmbeddingBenchmarkCorpus(changed)).not.toBe(original);
  });
});

describe('computeRetrievalMetrics', () => {
  it('computes Recall@1, Recall@5, and MRR from one-based ranks', () => {
    expect(computeRetrievalMetrics([1, 2, 6, null])).toEqual({
      recallAt1: 0.25,
      recallAt5: 0.5,
      mrr: 0.4166666666666667,
    });
  });
});

describe('evaluateEmbeddingModelGate', () => {
  const baseline = completeRun('nomic', { recallAt1: 0.8, recallAt5: 1, mrr: 0.9 });

  it('selects Qwen when both candidates are eligible and Qwen has higher quality', () => {
    const gate = evaluateEmbeddingModelGate({
      nomic: baseline,
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 0.9, recallAt5: 1, mrr: 0.95 }),
      qwen3: completeRun('qwen3', { recallAt1: 1, recallAt5: 1, mrr: 1 }),
    });

    expect(gate).toMatchObject({ passed: true, defaultDecision: 'qwen3' });
    expect(gate.candidates.embeddinggemma.eligible).toBe(true);
    expect(gate.candidates.qwen3.eligible).toBe(true);
  });

  it('uses lexical profile ID as the final stable tie-break', () => {
    const tied = { recallAt1: 0.9, recallAt5: 1, mrr: 0.95 };
    const gate = evaluateEmbeddingModelGate({
      nomic: baseline,
      embeddinggemma: completeRun('embeddinggemma', tied),
      qwen3: completeRun('qwen3', tied),
    });

    expect(gate.defaultDecision).toBe('embeddinggemma');
    expect(gate.winnerTrace.at(-1)).toContain('lexical profile ID');
  });

  it('allows one ineligible candidate not to block the other eligible candidate', () => {
    const gate = evaluateEmbeddingModelGate({
      nomic: baseline,
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 0.7, recallAt5: 1, mrr: 0.85 }),
      qwen3: completeRun('qwen3', { recallAt1: 0.9, recallAt5: 1, mrr: 0.95 }),
    });

    expect(gate).toMatchObject({ passed: true, defaultDecision: 'qwen3' });
    expect(gate.candidates.embeddinggemma.eligible).toBe(false);
    expect(gate.candidates.qwen3.eligible).toBe(true);
  });

  it('allows an eligible candidate to win when the Nomic comparator misses absolute thresholds', () => {
    const weakBaseline = completeRun('nomic', { recallAt1: 0.5, recallAt5: 1, mrr: 0.7166666666666666 });
    const gate = evaluateEmbeddingModelGate({
      nomic: weakBaseline,
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 1, recallAt5: 1, mrr: 1 }),
      qwen3: completeRun('qwen3', { recallAt1: 1, recallAt5: 1, mrr: 1 }),
    });

    expect(gate).toMatchObject({ passed: true, defaultDecision: 'embeddinggemma' });
    expect(gate.reasons).not.toContain('Nomic baseline is below one or more absolute thresholds.');
  });

  it('fails closed when any run is incomplete', () => {
    const incomplete = completeRun('qwen3', { recallAt1: 1, recallAt5: 1, mrr: 1 });
    incomplete.complete = false;
    incomplete.errors = ['model unavailable'];
    const gate = evaluateEmbeddingModelGate({
      nomic: baseline,
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 0.9, recallAt5: 1, mrr: 0.95 }),
      qwen3: incomplete,
    });

    expect(gate).toMatchObject({ passed: false, defaultDecision: 'nomic' });
    expect(gate.reasons.join(' ')).toContain('qwen3 run is incomplete');
  });

  it('fails closed when no candidate is eligible', () => {
    const gate = evaluateEmbeddingModelGate({
      nomic: baseline,
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 0.7, recallAt5: 1, mrr: 0.85 }),
      qwen3: completeRun('qwen3', { recallAt1: 0.8, recallAt5: 0.9, mrr: 0.84 }),
    });

    expect(gate).toMatchObject({ passed: false, defaultDecision: 'nomic' });
    expect(gate.reasons).toContain('No candidate is eligible.');
  });
});

describe('embedding benchmark reports', () => {
  let temporaryDirectory: string | null = null;

  afterEach(() => {
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = null;
    }
  });

  it('atomically persists complete JSON and renders the same gate decision', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'thoth-embedding-benchmark-'));
    const path = join(temporaryDirectory, 'result.json');
    const models = {
      nomic: completeRun('nomic', { recallAt1: 0.8, recallAt5: 1, mrr: 0.9 }),
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 0.9, recallAt5: 1, mrr: 0.95 }),
      qwen3: completeRun('qwen3', { recallAt1: 1, recallAt5: 1, mrr: 1 }),
    };
    const report = reportWithGate(evaluateEmbeddingModelGate(models));

    writeEmbeddingBenchmarkReport(path, report);

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(report);
    expect(renderEmbeddingBenchmarkMarkdown(report)).toContain('Default decision: **qwen3**');
  });

  it('renders complete model operations and rejected-candidate gate evidence', () => {
    const models = {
      nomic: completeRun('nomic', { recallAt1: 0.8, recallAt5: 1, mrr: 0.9 }),
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 0.7, recallAt5: 1, mrr: 0.85 }),
      qwen3: completeRun('qwen3', { recallAt1: 0.9, recallAt5: 1, mrr: 0.95 }),
    };
    models.embeddinggemma.modelBytes = 333_590_944;
    const report = { ...reportWithGate(evaluateEmbeddingModelGate(models)), models };

    const markdown = renderEmbeddingBenchmarkMarkdown(report);

    expect(markdown).toContain('embeddinggemma-model');
    expect(markdown).toContain('embeddinggemma@1');
    expect(markdown).toContain('333590944');
    expect(markdown).toContain('| embeddinggemma | no |');
    expect(markdown).toContain('absolute R@1: fail');
    expect(markdown).toContain('no-regression R@1: fail');
    expect(markdown).toContain('embeddinggemma rejection: embeddinggemma recallAt1 is below the absolute threshold.');
    expect(markdown).toContain('Norm min/max/mean');
    expect(markdown).toContain('Quality');
    expect(markdown).toContain('Requests');
    expect(markdown).toContain('Elapsed ms');
    expect(markdown).toContain('Equality tolerance: `1e-12`');
    expect(markdown.indexOf('| qwen3 | yes | 0.9500 |')).toBeLessThan(markdown.indexOf('- embeddinggemma checks:'));
  });

  it('returns a non-zero CLI status without rendering a decision when report persistence fails', async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'thoth-embedding-benchmark-cli-'));
    const outputPath = join(temporaryDirectory, 'result.json');
    const models = {
      nomic: completeRun('nomic', { recallAt1: 0.8, recallAt5: 1, mrr: 0.9 }),
      embeddinggemma: completeRun('embeddinggemma', { recallAt1: 0.9, recallAt5: 1, mrr: 0.95 }),
      qwen3: completeRun('qwen3', { recallAt1: 1, recallAt5: 1, mrr: 1 }),
    };
    const report = { ...reportWithGate(evaluateEmbeddingModelGate(models)), models };
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runEmbeddingBenchmarkCli([
      '--provider', 'lmstudio',
      '--base-url', 'http://127.0.0.1:1234',
      '--nomic-model', 'nomic-model',
      '--embeddinggemma-model', 'embeddinggemma-model',
      '--qwen3-model', 'qwen3-model',
      '--output', outputPath,
    ], {
      runBenchmark: async () => report,
      writeReport: () => { throw new Error('disk full'); },
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text),
    });

    expect(exitCode).toBe(1);
    expect(existsSync(outputPath)).toBe(false);
    expect(stdout).toEqual([]);
    expect(stderr.join(' ')).toContain('disk full');
  });
});

describe('runEmbeddingModelBenchmark', () => {
  function perfectProvider(config: EmbeddingProviderAdapter['config']): EmbeddingProviderAdapter {
    return {
      config,
      async embed(inputs) {
        const dimensions = config.dimensions ?? 0;
        return inputs.map((input) => {
          const documentIndex = input.role === 'document'
            ? EMBEDDING_MODEL_CORPUS.documents.findIndex((document) => document.text === input.text)
            : EMBEDDING_MODEL_CORPUS.documents.findIndex((document) => (
                document.id === EMBEDDING_MODEL_CORPUS.cases.find((benchmarkCase) => (
                  benchmarkCase.query === input.text
                ))?.expectedDocumentId
              ));
          const vector = new Array<number>(dimensions).fill(0);
          vector[documentIndex] = 1;
          return vector;
        });
      },
    };
  }

  function benchmarkOptions() {
    let tick = 0;
    return {
      provider: 'lmstudio' as const,
      baseUrl: 'http://127.0.0.1:1234',
      models: {
        nomic: 'nomic-model',
        embeddinggemma: 'embeddinggemma-model',
        qwen3: 'qwen3-model',
      },
      timestamp: '2026-08-08T18:00:00.000Z',
      nowMs: () => {
        tick += 5;
        return tick;
      },
    };
  }

  it('runs all three models over identical cases and selects a deterministic winner', async () => {
    const report = await runEmbeddingModelBenchmark({
      ...benchmarkOptions(),
      providerFactory: perfectProvider,
    });

    expect(report.models.nomic.metrics).toMatchObject({ recallAt1: 1, recallAt5: 1, mrr: 1 });
    expect(report.models.embeddinggemma.metrics).toMatchObject({ recallAt1: 1, recallAt5: 1, mrr: 1 });
    expect(report.models.qwen3.metrics).toMatchObject({ recallAt1: 1, recallAt5: 1, mrr: 1 });
    expect(report.gate).toMatchObject({ passed: true, defaultDecision: 'embeddinggemma' });
    expect(report.models.qwen3.observedDimensions).toBe(1024);
  });

  it('records a model failure and returns a complete fail-closed report', async () => {
    const report = await runEmbeddingModelBenchmark({
      ...benchmarkOptions(),
      providerFactory: (config) => {
        if (config.resolvedProfile.id === 'qwen3') {
          return {
            config,
            async embed() {
              throw new Error('model unavailable');
            },
          };
        }
        return perfectProvider(config);
      },
    });

    expect(report.models.qwen3).toMatchObject({ complete: false, errors: ['model unavailable'] });
    expect(report.gate).toMatchObject({ passed: false, defaultDecision: 'nomic' });
    expect(report.models.nomic.complete).toBe(true);
    expect(report.models.embeddinggemma.complete).toBe(true);
  });

  it('rejects invalid provider vectors and fails the decision closed', async () => {
    const report = await runEmbeddingModelBenchmark({
      ...benchmarkOptions(),
      providerFactory: (config) => {
        const provider = perfectProvider(config);
        if (config.resolvedProfile.id !== 'qwen3') return provider;
        return {
          config,
          async embed(inputs) {
            const vectors = await provider.embed(inputs);
            vectors[0][0] = Number.NaN;
            return vectors;
          },
        };
      },
    });

    expect(report.models.qwen3.complete).toBe(false);
    expect(report.models.qwen3.errors.join(' ')).toContain('non-finite value');
    expect(report.gate).toMatchObject({ passed: false, defaultDecision: 'nomic' });
  });
});
