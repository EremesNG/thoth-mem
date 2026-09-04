import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';

import { percentile95, writeImportRankingReport } from './report.mjs';

const STRATEGY_ID = 'strict-selected-any-cap5-stable-v1';
const CONFIG_HASH = 'b3a5b51c95b8aa79a677b8756e7a7bac0dc6aaad84403446ea1a68f14864fa04';
const WARMUPS = 10;
const SAMPLES = 100;
const PROBE_COUNT = 17;
const IMPORTED_MEMORY_COUNT = 1_000;
const TOP_K = 5;

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function extendCandidate(MemoryService, path, probes) {
  const service = new MemoryService({ databasePath: path });
  const imported = [];
  try {
    const content = `${probes.join(' ')} imported corpus extension`;
    for (let index = 0; index < IMPORTED_MEMORY_COUNT; index++) {
      const result = service.save({
        project: { key: 'import-ranking', name: 'Import ranking benchmark' },
        eventKey: `imported-${index}`,
        evidence: { kind: 'legacy_observation', content },
        memory: { kind: 'discovery', title: `Imported bugfix ${index}`, content, outcome: 'succeeded' },
      });
      if (!result.memory) throw new Error('Synthetic imported memory was not materialized');
      imported.push({ evidenceId: result.evidence.id, memoryId: result.memory.id, projectId: result.projectId });
    }
  } finally { service.close(); }
  const database = new Database(path);
  try {
    database.transaction(() => {
      const importId = 'synthetic-import-ranking-cohort';
      database.prepare('INSERT INTO legacy_imports VALUES(?,?,?,?,?,?,?,?,?,?)').run(
        importId, '1'.repeat(64), '{}', 'synthetic-control', '2'.repeat(64), '3'.repeat(64), '4'.repeat(64), 'legacy-v1', 'committed', '2026-09-02T12:00:00.000Z',
      );
      database.prepare('INSERT INTO legacy_import_cohorts VALUES(?,1)').run(importId);
      const insert = database.prepare('INSERT INTO legacy_import_rows VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const [index, row] of imported.entries()) {
        insert.run(importId, 'observation', String(index + 1), 1, hash({ index, source: 'synthetic-import-ranking' }), hash({ index, transformed: true }), 'imported', 'imported', row.projectId, null, row.evidenceId, row.memoryId, '2026-09-02T12:00:00.000Z');
      }
    })();
  } finally { database.close(); }
}

function emptyDiagnostics() {
  return { recall_calls: 0, ranked_fts_rows: 0, fused_lexical_rows: 0, hydrated_memory_rows: 0 };
}

function addDiagnostic(total, diagnostic) {
  total.recall_calls++;
  total.ranked_fts_rows += diagnostic.work.rankedFtsRows;
  total.fused_lexical_rows += diagnostic.work.fusedLexicalRows;
  total.hydrated_memory_rows += diagnostic.work.hydratedMemoryRows;
}

function pairwiseInversions(control, candidate) {
  let total = 0;
  for (let probe = 0; probe < control.length; probe++) {
    const positions = new Map(candidate[probe].map((id, index) => [id, index]));
    for (let left = 0; left < control[probe].length; left++) {
      for (let right = left + 1; right < control[probe].length; right++) {
        if ((positions.get(control[probe][left]) ?? Infinity) > (positions.get(control[probe][right]) ?? Infinity)) total++;
      }
    }
  }
  return total;
}

export async function runImportRankingBenchmark({ outputPath }) {
  if (!outputPath) throw new Error('An explicit --output path is required');
  const { MemoryService, buildFtsQueryPlan } = await import('../../dist/index.js');
  const root = mkdtempSync(join(tmpdir(), 'thoth-import-ranking-'));
  const controlPath = join(root, 'control.sqlite');
  const candidatePath = join(root, 'candidate.sqlite');
  const probes = Array.from({ length: PROBE_COUNT }, (_, index) => `probe${index} shared`);
  try {
    const seed = new MemoryService({ databasePath: controlPath });
    let beforeRankings;
    try {
      for (const [index, probe] of probes.entries()) {
        seed.save({
          project: { key: 'import-ranking', name: 'Import ranking benchmark' },
          eventKey: `protected-${index}`,
          evidence: { kind: 'explicit_save', content: `${probe} protected native evidence` },
          memory: { kind: 'decision', title: `Protected ${index}`, content: `${probe} protected native memory` },
        });
      }
      beforeRankings = probes.map((query) => seed.recall({ projectKey: 'import-ranking', query, limit: TOP_K }).items.map((item) => item.id));
    } finally { seed.close(); }
    const controlDatabase = new Database(controlPath);
    controlDatabase.pragma('journal_mode = DELETE');
    controlDatabase.close();
    copyFileSync(controlPath, candidatePath);
    extendCandidate(MemoryService, candidatePath, probes);

    const controlDiagnostics = emptyDiagnostics();
    const candidateDiagnostics = emptyDiagnostics();
    let controlMeasured = false;
    let candidateMeasured = false;
    const control = new MemoryService({ databasePath: candidatePath, readonly: true, recallObserver: (diagnostic) => { if (controlMeasured) addDiagnostic(controlDiagnostics, diagnostic); } });
    const candidate = new MemoryService({ databasePath: candidatePath, readonly: true, recallObserver: (diagnostic) => { if (candidateMeasured) addDiagnostic(candidateDiagnostics, diagnostic); } });
    let afterRankings;
    const controlSamples = [];
    const candidateSamples = [];
    try {
      afterRankings = probes.map((query) => candidate.recall({ projectKey: 'import-ranking', query, limit: TOP_K }).items.map((item) => item.id));
      for (let index = 0; index < WARMUPS; index++) for (const query of probes) control.recall({ projectKey: 'import-ranking', query, limit: TOP_K, lexicalStrategy: 'strict-selected-any-cap5-rrf-v1' });
      controlMeasured = true;
      for (let index = 0; index < SAMPLES; index++) {
        const start = performance.now();
        for (const query of probes) control.recall({ projectKey: 'import-ranking', query, limit: TOP_K, lexicalStrategy: 'strict-selected-any-cap5-rrf-v1' });
        controlSamples.push(performance.now() - start);
      }
      controlMeasured = false;
      for (let index = 0; index < WARMUPS; index++) for (const query of probes) candidate.recall({ projectKey: 'import-ranking', query, limit: TOP_K });
      candidateMeasured = true;
      for (let index = 0; index < SAMPLES; index++) {
        const start = performance.now();
        for (const query of probes) candidate.recall({ projectKey: 'import-ranking', query, limit: TOP_K });
        candidateSamples.push(performance.now() - start);
      }
      candidateMeasured = false;
    } finally { control.close(); candidate.close(); }

    const controlP95 = percentile95(controlSamples);
    const candidateP95 = percentile95(candidateSamples);
    const ratio = controlP95 === 0 ? (candidateP95 === 0 ? 1 : Number.POSITIVE_INFINITY) : candidateP95 / controlP95;
    const inputManifest = { probes, top_k: TOP_K, protected_memory_count: PROBE_COUNT, imported_memory_count: IMPORTED_MEMORY_COUNT };
    const inputHash = hash(inputManifest);
    const planManifestHash = hash(probes.map((query) => buildFtsQueryPlan(query, STRATEGY_ID)));
    const report = {
      schema: 'thoth-mem.import-ranking-report.v1',
      created_at: new Date().toISOString(),
      strategy: { id: STRATEGY_ID, config_hash: CONFIG_HASH, plan_manifest_hash: planManifestHash },
      conditions: { warmups: WARMUPS, samples: SAMPLES, probe_count: PROBE_COUNT, imported_memory_count: IMPORTED_MEMORY_COUNT, top_k: TOP_K },
      control: { strategy_id: 'strict-selected-any-cap5-rrf-v1', input_hash: inputHash, latency_ms: { p95: controlP95, samples: controlSamples }, diagnostics: controlDiagnostics },
      candidate: { strategy_id: STRATEGY_ID, input_hash: inputHash, latency_ms: { p95: candidateP95, samples: candidateSamples }, diagnostics: candidateDiagnostics },
      stability: {
        before_rankings: beforeRankings,
        after_rankings: afterRankings,
        exact_top_k_count: beforeRankings.filter((ranking, index) => JSON.stringify(ranking) === JSON.stringify(afterRankings[index])).length,
        pairwise_inversions: pairwiseInversions(beforeRankings, afterRankings),
      },
      performance: { candidate_to_control_p95_ratio: ratio, maximum_ratio: 2, passed: ratio <= 2 },
      calls: { network: 0, model: 0, llm: 0 },
      output: { mode: 'create-only', path: resolve(outputPath) },
    };
    return writeImportRankingReport(report, outputPath);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function outputArgument(argv) {
  const index = argv.indexOf('--output');
  return index >= 0 ? argv[index + 1] : undefined;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const report = await runImportRankingBenchmark({ outputPath: outputArgument(process.argv.slice(2)) });
  process.stdout.write(`${JSON.stringify({
    output: report.output.path,
    exact_top_k_count: report.stability.exact_top_k_count,
    pairwise_inversions: report.stability.pairwise_inversions,
    performance: report.performance,
  })}\n`);
}
