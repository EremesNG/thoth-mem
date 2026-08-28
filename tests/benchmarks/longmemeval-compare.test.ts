import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { validateLexicalComparisonReport } from '../../benchmarks/lexical-comparison-report.mjs';
import { DEFAULT_LEXICAL_LATENCY_REPORT, runLongMemEvalComparison } from '../../benchmarks/longmemeval/compare.mjs';

const STRATEGY_IDS = ['all-prefix-v1', 'any-prefix-v1', 'all-then-any-prefix-v1'] as const;
const fixture = JSON.parse(readFileSync('benchmarks/fixtures/longmemeval-s-mini.json', 'utf8')) as Array<Record<string, unknown>>;

function setup(root: string) {
  const content = JSON.stringify(fixture.slice(0, 4));
  const datasetPath = join(root, 'dataset.json');
  const sha256 = createHash('sha256').update(content).digest('hex');
  writeFileSync(datasetPath, content);
  return {
    datasetPath,
    sha256,
    source: { dataset: 'test/longmemeval-cleaned', filename: 'dataset.json', revision: 'a'.repeat(40), sha256, bytes: Buffer.byteLength(content), license: 'MIT' },
  };
}

describe('LongMemEval-S lexical comparison runner', () => {
  it('uses a distinct create-only default path for latency evidence', () => {
    expect(DEFAULT_LEXICAL_LATENCY_REPORT).toMatch(/longmemeval-s-lexical-latency-report\.json$/u);
    expect(DEFAULT_LEXICAL_LATENCY_REPORT).not.toMatch(/lexical-comparison-report\.json$/u);
  });

  it('evaluates the three real lanes sequentially and atomically publishes one offline report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-compare-'));
    const workDirectory = join(root, 'work');
    const outputPath = join(root, 'comparison.json');
    const input = setup(root);
    vi.stubGlobal('fetch', () => { throw new Error('network forbidden during evaluation'); });
    try {
      const result = await runLongMemEvalComparison({ ...input, outputPath, workDirectory });
      expect(result.outputPath).toBe(outputPath);
      expect(validateLexicalComparisonReport(result.report)).toEqual({ valid: true, errors: [] });
      expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(result.report);
      expect(Object.keys(result.report.lanes)).toEqual(STRATEGY_IDS);
      const created = STRATEGY_IDS.map((id) => Date.parse(result.report.lanes[id].created_at));
      expect(created).toEqual([...created].sort((left, right) => left - right));
      for (const id of STRATEGY_IDS) {
        expect(result.report.lanes[id].candidate.config.lexical_strategy.id).toBe(id);
        expect(result.report.lanes[id].metrics.resources).toMatchObject({ network_calls: 0, model_calls: 0, llm_calls: 0 });
      }
      expect(readdirSync(workDirectory)).toEqual([]);
      expect(readdirSync(root).filter((name) => name.includes('.tmp'))).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses overwrite and cleans disposable lane state after a failed run', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-compare-failure-'));
    const workDirectory = join(root, 'work');
    const outputPath = join(root, 'comparison.json');
    const input = setup(root);
    try {
      const first = await runLongMemEvalComparison({ ...input, outputPath, workDirectory });
      const published = readFileSync(outputPath, 'utf8');
      await expect(runLongMemEvalComparison({ ...input, outputPath, workDirectory })).rejects.toThrow(/already exists/u);
      expect(readFileSync(outputPath, 'utf8')).toBe(published);

      const failedOutput = join(root, 'failed.json');
      await expect(runLongMemEvalComparison({ ...input, expectedSha256: 'f'.repeat(64), outputPath: failedOutput, workDirectory })).rejects.toThrow(/SHA-256/u);
      expect(existsSync(failedOutput)).toBe(false);
      expect(readdirSync(workDirectory)).toEqual([]);
      expect(first.report.shared.evaluated_count).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows exactly one concurrent comparison publisher to claim a free output path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-compare-race-'));
    const outputPath = join(root, 'comparison.json');
    const input = setup(root);
    try {
      const outcomes = await Promise.allSettled([
        runLongMemEvalComparison({ ...input, outputPath, workDirectory: join(root, 'work-a') }),
        runLongMemEvalComparison({ ...input, outputPath, workDirectory: join(root, 'work-b') }),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      expect(validateLexicalComparisonReport(JSON.parse(readFileSync(outputPath, 'utf8')))).toEqual({ valid: true, errors: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
