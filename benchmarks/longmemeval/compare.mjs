import { createHash, randomUUID } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  LEXICAL_COMPARISON_STRATEGY_IDS,
  LEXICAL_COMPARISON_BASELINE,
  createLexicalComparisonReport,
  validateLexicalComparisonReport,
} from '../lexical-comparison-report.mjs';
import { LONGMEMEVAL_SOURCE } from './contract.mjs';
import { DEFAULT_LONGMEMEVAL_CACHE } from './prepare.mjs';
import { runLongMemEval } from './run.mjs';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_LEXICAL_LATENCY_REPORT = resolve(moduleDirectory, '..', 'results', 'longmemeval-s-lexical-latency-report.json');
const ARCHIVED_LEXICAL_COMPARISON_REPORT = resolve(moduleDirectory, '..', 'results', 'longmemeval-s-lexical-comparison-report.json');

function archivedEvidence(options) {
  const bytes = options.archived ? null : readFileSync(ARCHIVED_LEXICAL_COMPARISON_REPORT);
  const report = options.archived ? { schema: 'thoth-mem.lexical-comparison-report.v1', lanes: options.archived.lanes } : JSON.parse(bytes.toString('utf8'));
  const sha256 = options.archived?.sha256 ?? createHash('sha256').update(bytes).digest('hex');
  if (report?.schema !== 'thoth-mem.lexical-comparison-report.v1'
    || !LEXICAL_COMPARISON_STRATEGY_IDS.every((id) => report?.lanes?.[id])
    || sha256 !== LEXICAL_COMPARISON_BASELINE.report_sha256) throw new Error('Archived lexical comparison report is invalid');
  for (const id of LEXICAL_COMPARISON_STRATEGY_IDS) {
    const lane = report.lanes[id];
    const actual = {
      recall_any_at_20: lane.metrics.ranking.overall.recall_any_at_20,
      recall_at_20: lane.metrics.ranking.overall.recall_at_20,
      ndcg_at_10: lane.metrics.ranking.overall.ndcg_at_10,
      sqlite_bytes_total: lane.metrics.resources.sqlite_bytes.total,
    };
    if (JSON.stringify(actual) !== JSON.stringify(LEXICAL_COMPARISON_BASELINE.quality_baseline[id])) throw new Error('Archived lexical comparison baseline is invalid');
  }
  return { sha256, lanes: report.lanes };
}

export async function runLongMemEvalComparison(options = {}) {
  const source = options.source ?? LONGMEMEVAL_SOURCE;
  const datasetPath = resolve(options.datasetPath ?? join(DEFAULT_LONGMEMEVAL_CACHE, LONGMEMEVAL_SOURCE.filename));
  const expectedSha256 = options.expectedSha256 ?? source.sha256;
  const outputPath = resolve(options.outputPath ?? DEFAULT_LEXICAL_LATENCY_REPORT);
  if (existsSync(outputPath)) throw new Error(`LongMemEval comparison output already exists: ${outputPath}`);

  let workDirectory;
  if (options.workDirectory) {
    const workParent = resolve(options.workDirectory);
    mkdirSync(workParent, { recursive: true });
    workDirectory = mkdtempSync(join(workParent, 'comparison-'));
  } else {
    workDirectory = mkdtempSync(join(tmpdir(), 'thoth-longmemeval-comparison-'));
  }

  try {
    const laneDirectory = join(workDirectory, 'lanes');
    const laneWorkDirectory = join(workDirectory, 'work');
    const lanes = {};
    const diagnostics = {};
    for (const lexicalStrategy of LEXICAL_COMPARISON_STRATEGY_IDS) {
      const result = await runLongMemEval({
        datasetPath,
        expectedSha256,
        source,
        lexicalStrategy,
        outputPath: join(laneDirectory, `${lexicalStrategy}.json`),
        workDirectory: join(laneWorkDirectory, lexicalStrategy),
      });
      lanes[lexicalStrategy] = result.report;
      diagnostics[lexicalStrategy] = result.diagnostics;
    }

    const report = createLexicalComparisonReport(lanes, { diagnostics, archived: archivedEvidence(options) });
    const validation = validateLexicalComparisonReport(report);
    if (!validation.valid) throw new Error(`Invalid LongMemEval lexical comparison report: ${validation.errors.join(', ')}`);
    mkdirSync(dirname(outputPath), { recursive: true });
    const temporaryOutput = join(dirname(outputPath), `.${randomUUID()}.tmp`);
    try {
      writeFileSync(temporaryOutput, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      try {
        linkSync(temporaryOutput, outputPath);
      } catch (error) {
        if (error?.code === 'EEXIST') throw new Error(`LongMemEval comparison output already exists: ${outputPath}`);
        throw error;
      }
    } finally {
      rmSync(temporaryOutput, { force: true });
    }
    return { outputPath, report };
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  if (process.argv.length > 2) throw new Error('LongMemEval lexical comparison does not accept source overrides');
  const result = await runLongMemEvalComparison();
  process.stdout.write(`${result.outputPath}\n`);
}
