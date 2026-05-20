import { pathToFileURL } from 'node:url';
import { Store } from '../store/index.js';
import type { SaveObservationInput } from '../store/types.js';

interface EvalFixture {
  key: string;
  observation: SaveObservationInput;
}

interface EvalCase {
  name: string;
  query: string;
  expectedKey: string;
  project?: string;
  limit?: number;
}

export interface RetrievalEvalCaseResult {
  name: string;
  query: string;
  expected_title: string;
  found: boolean;
  rank: number | null;
  result_count: number;
  context_chars: number;
  full_content_chars: number;
}

export interface RetrievalEvalSummary {
  total_cases: number;
  recall_at_1: number;
  recall_at_k: number;
  mean_reciprocal_rank: number;
  context_compression: number;
}

export interface RetrievalEvalReport {
  summary: RetrievalEvalSummary;
  cases: RetrievalEvalCaseResult[];
  markdown: string;
}

const TOP_K = 5;

const FIXTURES: EvalFixture[] = [
  {
    key: 'auth-refresh',
    observation: {
      title: 'JWT refresh token rotation',
      type: 'decision',
      project: 'auth-project',
      topic_key: 'architecture/auth-refresh',
      content: [
        '**What**: Implemented JWT refresh token rotation with sliding expiry.',
        '**Why**: Access tokens needed short lifetimes without forcing frequent login.',
        '**Where**: src/auth/token-service.ts',
        '**Learned**: Keep refresh token invalidation isolated from request middleware.',
      ].join('\n'),
    },
  },
  {
    key: 'encryption',
    observation: {
      title: 'Envelope encryption migration',
      type: 'architecture',
      project: 'security-project',
      topic_key: 'architecture/envelope-encryption',
      content: [
        '**What**: Migrated token encryption to envelope keys.',
        '**Why**: Key rotation needed to avoid rewriting all persisted secrets.',
        '**Where**: src/security/crypto.ts',
      ].join('\n'),
    },
  },
  {
    key: 'sqlite-wal',
    observation: {
      title: 'SQLite WAL concurrency',
      type: 'config',
      project: 'storage-project',
      topic_key: 'config/sqlite-wal',
      content: [
        '**What**: Enabled SQLite WAL mode and busy timeout.',
        '**Why**: Concurrent readers need to avoid blocking writes during MCP and HTTP access.',
        '**Where**: src/store/schema.ts',
      ].join('\n'),
    },
  },
  {
    key: 'topic-upsert',
    observation: {
      title: 'Topic key upsert behavior',
      type: 'pattern',
      project: 'memory-project',
      topic_key: 'pattern/topic-key-upsert',
      content: [
        '**What**: Use topic_key as stable identity for evolving decisions.',
        '**Why**: Agents need one authoritative current memory plus version history.',
        '**Where**: src/store/index.ts',
      ].join('\n'),
    },
  },
  {
    key: 'graph-lite',
    observation: {
      title: 'Graph-lite derived facts',
      type: 'architecture',
      project: 'memory-project',
      topic_key: 'retrieval/graph-lite-derived-facts',
      content: [
        '**What**: Derive graph-lite facts from structured observations.',
        '**Why**: Agents need structured relationships before vector embeddings.',
        '**Where**: src/store/index.ts and src/tools/mem-project-graph.ts',
        '**Learned**: Deterministic metadata facts are cheaper and more predictable than LLM extraction.',
      ].join('\n'),
    },
  },
  {
    key: 'sync-export',
    observation: {
      title: 'Incremental sync chunks',
      type: 'architecture',
      project: 'sync-project',
      topic_key: 'architecture/incremental-sync',
      content: [
        '**What**: Export memory changes as chunked sync mutations.',
        '**Why**: Large memory stores need portable incremental backup.',
        '**Where**: src/sync/index.ts',
      ].join('\n'),
    },
  },
];

const CASES: EvalCase[] = [
  {
    name: 'direct auth recall',
    query: 'JWT refresh token rotation',
    project: 'auth-project',
    expectedKey: 'auth-refresh',
  },
  {
    name: 'prefix technical term recall',
    query: 'encrypt token keys',
    project: 'security-project',
    expectedKey: 'encryption',
  },
  {
    name: 'configuration recall',
    query: 'sqlite concurrent readers busy timeout',
    project: 'storage-project',
    expectedKey: 'sqlite-wal',
  },
  {
    name: 'topic behavior recall',
    query: 'stable topic key identity version history',
    project: 'memory-project',
    expectedKey: 'topic-upsert',
  },
  {
    name: 'graph-lite recall',
    query: 'structured facts before vector embeddings',
    project: 'memory-project',
    expectedKey: 'graph-lite',
  },
  {
    name: 'global sync recall',
    query: 'incremental backup sync chunks',
    expectedKey: 'sync-export',
  },
];

function seedEvalStore(store: Store): Map<string, number> {
  const idsByKey = new Map<string, number>();

  for (const fixture of FIXTURES) {
    const result = store.saveObservation(fixture.observation);
    idsByKey.set(fixture.key, result.observation.id);
  }

  return idsByKey;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(3));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMarkdown(summary: RetrievalEvalSummary, cases: RetrievalEvalCaseResult[]): string {
  const caseRows = cases.map((result) => [
    result.found ? 'PASS' : 'MISS',
    result.name,
    result.rank ?? '-',
    result.result_count,
    result.query,
  ]);

  return [
    '# Retrieval Eval Baseline',
    '',
    'Deterministic baseline for current lexical retrieval before introducing embeddings.',
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Total cases | ${summary.total_cases} |`,
    `| Recall @ 1 | ${formatPercent(summary.recall_at_1)} |`,
    `| Recall @ ${TOP_K} | ${formatPercent(summary.recall_at_k)} |`,
    `| Mean Reciprocal Rank | ${summary.mean_reciprocal_rank.toFixed(3)} |`,
    `| Context Compression | ${formatPercent(summary.context_compression)} |`,
    '',
    '## Case Results',
    '',
    '| Status | Case | Rank | Results | Query |',
    '| --- | --- | ---: | ---: | --- |',
    ...caseRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function runRetrievalEval(): RetrievalEvalReport {
  const store = new Store(':memory:');

  try {
    const idsByKey = seedEvalStore(store);
    const cases = CASES.map((evalCase): RetrievalEvalCaseResult => {
      const expectedId = idsByKey.get(evalCase.expectedKey);
      const results = store.searchObservations({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
      });
      const rankIndex = results.findIndex((result) => result.id === expectedId);
      const expected = FIXTURES.find((fixture) => fixture.key === evalCase.expectedKey);
      const context = store.searchObservationsFormatted({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
        mode: 'context',
        max_chars: 4000,
      });
      const preview = store.searchObservationsFormatted({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
        mode: 'preview',
      });

      return {
        name: evalCase.name,
        query: evalCase.query,
        expected_title: expected?.observation.title ?? evalCase.expectedKey,
        found: rankIndex >= 0,
        rank: rankIndex >= 0 ? rankIndex + 1 : null,
        result_count: results.length,
        context_chars: context.length,
        full_content_chars: preview.length,
      };
    });

    const found = cases.filter((result) => result.found);
    const reciprocalRankSum = cases.reduce((sum, result) => sum + (result.rank ? 1 / result.rank : 0), 0);
    const fullChars = cases.reduce((sum, result) => sum + result.full_content_chars, 0);
    const contextChars = cases.reduce((sum, result) => sum + result.context_chars, 0);
    const summary: RetrievalEvalSummary = {
      total_cases: cases.length,
      recall_at_1: ratio(cases.filter((result) => result.rank === 1).length, cases.length),
      recall_at_k: ratio(found.length, cases.length),
      mean_reciprocal_rank: ratio(reciprocalRankSum, cases.length),
      context_compression: fullChars === 0 ? 0 : Number((1 - contextChars / fullChars).toFixed(3)),
    };

    return {
      summary,
      cases,
      markdown: formatMarkdown(summary, cases),
    };
  } finally {
    store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${runRetrievalEval().markdown}\n`);
}
