import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runLongMemEval } from '../../benchmarks/longmemeval/run.mjs';
import { validateRetrievalReport } from '../../benchmarks/retrieval-report.mjs';

const fixture = JSON.parse(readFileSync('benchmarks/fixtures/longmemeval-s-mini.json', 'utf8')) as Array<Record<string, unknown>>;

afterEach(() => vi.unstubAllGlobals());

describe('LongMemEval-S lexical runner', () => {
  it('runs isolated product FTS5 retrieval offline with exact provenance and separate delivery', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-runner-'));
    const datasetPath = join(root, 'dataset.json');
    const outputPath = join(root, 'report.json');
    const workDirectory = join(root, 'work');
    const content = JSON.stringify(fixture.slice(0, 4));
    const sha256 = createHash('sha256').update(content).digest('hex');
    const source = { dataset: 'test/longmemeval-cleaned', filename: 'dataset.json', revision: 'a'.repeat(40), sha256, bytes: Buffer.byteLength(content), license: 'MIT' };
    writeFileSync(datasetPath, content);
    vi.stubGlobal('fetch', () => { throw new Error('network forbidden during evaluation'); });
    try {
      const result = await runLongMemEval({ datasetPath, expectedSha256: sha256, outputPath, source, workDirectory });

      expect(result.outputPath).toBe(outputPath);
      expect(validateRetrievalReport(result.report)).toEqual({ valid: true, errors: [] });
      expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(result.report);
      expect(result.report.dataset).toMatchObject({ record_count: 4, evaluated_count: 3, exclusions: [{ question_id: 'q_abstention_abs', reason: 'abstention' }] });
      expect(result.report.conditions).toMatchObject({ candidate_k: 20, candidate_payload_utf16_code_units: 20_000, delivery: { utf16_code_units: 4_000, estimated_tokens: 1_000, token_basis: 'estimated_chars_div_4' } });
      expect(result.report.candidate).toMatchObject({ id: 'sqlite-fts5-bm25-session-full', config: { lexical: true, granularity: 'session', dialogue: 'all_roles' } });
      expect(result.report.queries.map((query: { question_id: string }) => query.question_id)).toEqual(['q_multi_session', 'q_assistant_evidence', 'q_irrelevant_query']);
      expect(result.report.queries[0].ranked_session_ids[0]).toBe('session-storage');
      expect(result.report.queries[1].ranked_session_ids[0]).toBe('session-assistant-answer');
      expect(result.report.queries[2].ranked_session_ids).toEqual([]);
      expect(result.report.provenance.mappings).toHaveLength(7);
      expect(new Set(result.report.provenance.mappings.map((mapping: { memory_id: string }) => mapping.memory_id)).size).toBe(7);
      const multiMappings = result.report.provenance.mappings.filter((mapping: { question_id: string }) => mapping.question_id === 'q_multi_session');
      expect(multiMappings.map((mapping: { session_id: string }) => mapping.session_id)).toEqual(['session-storage', 'session-budget', 'session-noise', 'session-noise']);
      expect(multiMappings.map((mapping: { source_id: string }) => mapping.source_id)).toEqual(['0:session-storage', '1:session-budget', '2:session-noise', '3:session-noise']);
      expect(new Set(multiMappings.map((mapping: { source_id: string }) => mapping.source_id)).size).toBe(4);
      for (const query of result.report.queries) {
        expect(query.ranked_source_ids).toHaveLength(query.ranked_session_ids.length);
        expect(query.delivered_source_ids).toHaveLength(query.delivered_session_ids.length);
        expect(query.ranking_budget).toMatchObject({ requested_utf16_code_units: 20_000, token_basis: 'estimated_chars_div_4' });
        expect(query.delivery_budget).toMatchObject({ requested_utf16_code_units: 4_000, token_basis: 'estimated_chars_div_4' });
      }
      const sum = (key: string, budgetName: 'ranking_budget' | 'delivery_budget') => result.report.queries.reduce((total: number, query: Record<string, Record<string, number>>) => total + query[budgetName][key], 0);
      expect(result.report.metrics.resources.text).toMatchObject({
        ranked_source_utf16_code_units: sum('source_utf16_code_units', 'ranking_budget'),
        ranked_evidence_utf16_code_units: sum('evidence_utf16_code_units', 'ranking_budget'),
        ranked_returned_utf16_code_units: sum('returned_utf16_code_units', 'ranking_budget'),
        ranked_truncated_utf16_code_units: sum('truncated_utf16_code_units', 'ranking_budget'),
        delivery_source_utf16_code_units: sum('source_utf16_code_units', 'delivery_budget'),
        delivery_evidence_utf16_code_units: sum('evidence_utf16_code_units', 'delivery_budget'),
        delivered_utf16_code_units: sum('returned_utf16_code_units', 'delivery_budget'),
        delivery_truncated_utf16_code_units: sum('truncated_utf16_code_units', 'delivery_budget'),
      });
      expect(result.report.metrics.resources).toMatchObject({ network_calls: 0, model_calls: 0, llm_calls: 0 });
      expect(JSON.stringify(result.report)).not.toMatch(/LEAK_.*_ANSWER_MARKER|has_answer/u);
      expect(readdirSync(workDirectory)).toEqual([]);
      expect(readdirSync(root).filter((name) => name.includes('.tmp'))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid gold mappings without publishing a partial report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-longmem-runner-invalid-'));
    const datasetPath = join(root, 'dataset.json');
    const outputPath = join(root, 'report.json');
    const workDirectory = join(root, 'work');
    const content = JSON.stringify(fixture);
    const sha256 = createHash('sha256').update(content).digest('hex');
    writeFileSync(datasetPath, content);
    try {
      await expect(runLongMemEval({
        datasetPath,
        expectedSha256: sha256,
        outputPath,
        source: { dataset: 'test/invalid', filename: 'dataset.json', revision: 'a'.repeat(40), sha256, bytes: Buffer.byteLength(content), license: 'MIT' },
        workDirectory,
      })).rejects.toThrow(/answer_session_ids/u);
      expect(existsSync(outputPath)).toBe(false);
      expect(existsSync(workDirectory) ? readdirSync(workDirectory) : []).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
