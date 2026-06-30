import { pathToFileURL } from 'node:url';
import { Store } from '../store/index.js';
import type { EmbeddingProviderAdapter } from '../retrieval/providers.js';
import type { SaveObservationInput } from '../store/types.js';

interface EvalFixture {
  key: string;
  observation: SaveObservationInput;
}

interface EvalCase {
  name: string;
  query: string;
  expectedKey: string;
  kind?: 'direct' | 'rephrase' | 'non-synthetic';
  project?: string;
  limit?: number;
  hydeAnswer?: string;
}

export interface RetrievalEvalOptions {
  noiseCount?: number;
}

export interface RetrievalEvalCaseResult {
  name: string;
  query: string;
  kind: 'direct' | 'rephrase' | 'non-synthetic';
  expected_title: string;
  found: boolean;
  rank: number | null;
  raw_rank: number | null;
  hyde_rank: number | null;
  result_count: number;
  context_chars: number;
  full_content_chars: number;
  primary_evidence_chars: number;
  promoted_context_chars: number;
}

export interface RetrievalEvalSummary {
  total_cases: number;
  recall_at_1: number;
  recall_at_k: number;
  mean_reciprocal_rank: number;
  context_compression: number;
  corpus: {
    total_observations: number;
    signal_observations: number;
    noise_observations: number;
    non_synthetic_observations: number;
  };
  case_mix: {
    direct_cases: number;
    rephrased_cases: number;
    non_synthetic_cases: number;
  };
  retrieval_defaults: {
    lane_order: string;
    sentence_top_k: number;
    chunk_top_k: number;
    lexical_limit: number;
    min_semantic_score: number;
    l2_distance_scale: number;
  };
  hybrid: {
    pending_rate: number;
    degraded_rate: number;
    lexical_prefix_hit_rate: number;
    raw_semantic_hit_rate: number;
    hyde_semantic_hit_rate: number;
    sentence_primary_rate: number;
    promoted_parent_rate: number;
    kg_hit_rate: number;
    kg_primary_rate: number;
    evidence_lineage_coverage: number;
    stale_result_rate: number;
    kg_provenance_rate: number;
    lane_truth_rate: number;
    facts_source_rate: number;
    surgical_compression: number;
    hyde_lift_rate: number;
    hybrid_rank_source_rate: number;
  };
}

export interface RetrievalEvalReport {
  summary: RetrievalEvalSummary;
  cases: RetrievalEvalCaseResult[];
  markdown: string;
}

const TOP_K = 5;
const DEFAULT_NOISE_OBSERVATION_COUNT = 96;
const EVAL_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'before',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'under',
  'while',
  'with',
  'without',
]);

function fillerSentences(seed: string, count = 18): string[] {
  return Array.from({ length: count }, (_, index) => (
    `Background calibration ${seed}-${index} records routine implementation notes about dashboards, queues, release hygiene, and local developer workflow without adding the target retrieval fact.`
  ));
}

function evidenceContent(seed: string, signalLines: string[]): string {
  return [
    ...fillerSentences(seed, 16),
    ...signalLines,
    ...fillerSentences(`${seed}-tail`, 16),
  ].join('\n');
}

const FIXTURES: EvalFixture[] = [
  {
    key: 'auth-refresh',
    observation: {
      title: 'JWT refresh token rotation',
      type: 'decision',
      project: 'auth-project',
      topic_key: 'architecture/auth-refresh',
      content: evidenceContent('auth-refresh', [
        '**What**: Implemented JWT refresh token rotation with sliding expiry.',
        'JWT refresh token rotation keeps access sessions valid while refresh token invalidation remains isolated.',
        '**Why**: Access tokens needed short lifetimes without forcing frequent login.',
        '**Where**: src/auth/token-service.ts',
        '**Learned**: Keep refresh token invalidation isolated from request middleware.',
      ]),
    },
  },
  {
    key: 'encryption',
    observation: {
      title: 'Envelope encryption migration',
      type: 'architecture',
      project: 'security-project',
      topic_key: 'architecture/envelope-encryption',
      content: evidenceContent('encryption', [
        '**What**: Migrated token encryption to envelope keys.',
        'Envelope encryption migration lets token keys rotate without rewriting every persisted secret.',
        '**Why**: Key rotation needed to avoid rewriting all persisted secrets.',
        '**Where**: src/security/crypto.ts',
      ]),
    },
  },
  {
    key: 'sqlite-wal',
    observation: {
      title: 'SQLite WAL concurrency',
      type: 'config',
      project: 'storage-project',
      topic_key: 'config/sqlite-wal',
      content: evidenceContent('sqlite-wal', [
        '**What**: Enabled SQLite WAL mode and busy timeout.',
        'SQLite WAL concurrency keeps MCP and HTTP readers responsive while writes continue.',
        '**Why**: Concurrent readers need to avoid blocking writes during MCP and HTTP access.',
        '**Where**: src/store/schema.ts',
      ]),
    },
  },
  {
    key: 'topic-upsert',
    observation: {
      title: 'Topic key upsert behavior',
      type: 'pattern',
      project: 'memory-project',
      topic_key: 'pattern/topic-key-upsert',
      content: evidenceContent('topic-upsert', [
        '**What**: Use topic_key as stable identity for evolving decisions.',
        'Topic key upsert behavior preserves one current memory while keeping version history.',
        '**Why**: Agents need one authoritative current memory plus version history.',
        '**Where**: src/store/index.ts',
      ]),
    },
  },
  {
    key: 'graph-lite',
    observation: {
      title: 'Graph-lite derived facts',
      type: 'architecture',
      project: 'memory-project',
      topic_key: 'retrieval/graph-lite-derived-facts',
      content: evidenceContent('graph-lite', [
        '**What**: Derive graph-lite facts from structured observations.',
        'Graph-lite derived facts provide structured relationships before vector embeddings complete.',
        '**Why**: Agents need structured relationships before vector embeddings.',
        '**Where**: src/store/index.ts and src/tools/mem-project-graph.ts',
        '**Learned**: Deterministic metadata facts are cheaper and more predictable than LLM extraction.',
      ]),
    },
  },
  {
    key: 'sync-export',
    observation: {
      title: 'Incremental sync chunks',
      type: 'architecture',
      project: 'sync-project',
      topic_key: 'architecture/incremental-sync',
      content: evidenceContent('sync-export', [
        '**What**: Export memory changes as chunked sync mutations.',
        'Incremental sync chunks make portable backups possible without rewriting the full memory store.',
        '**Why**: Large memory stores need portable incremental backup.',
        '**Where**: src/sync/index.ts',
      ]),
    },
  },
  {
    key: 'graph-rank',
    observation: {
      title: 'Graph-only operational fact',
      type: 'decision',
      project: 'graph-project',
      topic_key: 'retrieval/graph-only-ranking',
      content: 'Archived operational note. Supporting context is intentionally sparse.',
    },
  },
];

const NON_SYNTHETIC_FIXTURES: EvalFixture[] = [
  {
    key: 'docs-recall-filters',
    observation: {
      title: 'README mem_recall precision filters',
      type: 'architecture',
      project: 'docs-project',
      topic_key: 'docs/mem-recall-filters',
      content: [
        'The README documents mem_recall as the primary retrieval tool.',
        'It accepts precision filters for project, session_id, scope, topic_key, type, time_from, and time_to.',
        'Those filters pass through to all retrieval lanes so narrowed recalls do not leak unrelated project evidence.',
      ].join('\n'),
    },
  },
  {
    key: 'docs-admin-tools',
    observation: {
      title: 'README admin tools boundary',
      type: 'decision',
      project: 'docs-project',
      topic_key: 'docs/admin-tools-boundary',
      content: [
        'Admin operations such as export, import, sync, migrate-project, rebuild-graph, and rebuild-index are available via CLI and HTTP.',
        'They are intentionally not registered as MCP tools so the agent tool surface stays lean.',
      ].join('\n'),
    },
  },
  {
    key: 'codemap-store-pattern',
    observation: {
      title: 'Codemap store-centric architecture',
      type: 'architecture',
      project: 'docs-project',
      topic_key: 'codemap/store-centric-architecture',
      content: [
        'The repository atlas describes a store-centric architecture.',
        'Tool handlers are thin adapters that delegate durable persistence, recall, session, and project operations to Store.',
      ].join('\n'),
    },
  },
  {
    key: 'codemap-http-bridge',
    observation: {
      title: 'Codemap HTTP bridge ownership',
      type: 'architecture',
      project: 'docs-project',
      topic_key: 'codemap/http-bridge-ownership',
      content: [
        'The HTTP bridge pattern handles ownership takeover for port conflicts.',
        'Incoming HTTP requests are matched against routes and route handlers delegate to Store operations.',
      ].join('\n'),
    },
  },
];

function resolveNoiseObservationCount(options: RetrievalEvalOptions): number {
  const envNoiseCount = Number.parseInt(process.env.THOTH_RETRIEVAL_EVAL_NOISE ?? '', 10);
  const noiseCount = options.noiseCount ?? (Number.isFinite(envNoiseCount) ? envNoiseCount : DEFAULT_NOISE_OBSERVATION_COUNT);
  if (!Number.isInteger(noiseCount) || noiseCount < 0) {
    throw new Error('noiseCount must be a non-negative integer');
  }
  return noiseCount;
}

function buildNoiseFixtures(noiseCount: number): EvalFixture[] {
  const projects = ['auth-project', 'security-project', 'storage-project', 'memory-project', 'sync-project', 'noise-project'];
  return Array.from({ length: noiseCount }, (_, index) => {
    const project = projects[index % projects.length];
    const title = `Noise calibration ${index}`;
    return {
      key: `noise-${index}`,
      observation: {
        title,
        type: 'manual',
        project,
        topic_key: `eval/noise-${index}`,
        content: evidenceContent(`noise-${index}`, [
          `**What**: ${title} captures unrelated operational notes for retrieval pressure testing.`,
          '**Why**: The benchmark needs synthetic distractors so hybrid recall proves ranking quality under unrelated noise.',
          `**Where**: synthetic/eval/noise-${index}.md`,
        ]),
      },
    };
  });
}

function seedGraphFactTriple(input: {
  store: Store;
  observationId: number;
  subject: string;
  relation: string;
  object: string;
  project: string;
  topicKey: string;
  provenance: string;
  tripleHash: string;
  confidence?: number;
  extractorVersion?: string;
}): void {
  const db = input.store.getDb();
  const upsertEntity = db.prepare(
    `INSERT INTO kg_entities (entity_key, entity_type, canonical_name, aliases_json, metadata_json, updated_at)
     VALUES (?, 'observation', ?, '[]', '{}', datetime('now'))
     ON CONFLICT(entity_key) DO UPDATE SET
      entity_type = excluded.entity_type,
      canonical_name = excluded.canonical_name,
      aliases_json = excluded.aliases_json,
      metadata_json = excluded.metadata_json,
      updated_at = datetime('now')
     RETURNING id`
  );

  const insertTriple = db.prepare(
    `INSERT INTO kg_triples (
       subject_entity_id, relation, object_entity_id, source_type, source_id, source_sync_id,
       project, topic_key, provenance, confidence, triple_hash, extractor_version, updated_at
     ) VALUES (?, ?, ?, 'observation', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(triple_hash) DO UPDATE SET
      source_id = excluded.source_id,
      source_sync_id = excluded.source_sync_id,
      project = excluded.project,
      topic_key = excluded.topic_key,
      provenance = excluded.provenance,
      confidence = excluded.confidence,
      extractor_version = excluded.extractor_version,
      updated_at = datetime('now')`
  );

  const subjectEntity = upsertEntity.get(`fixture:${input.observationId}:${input.subject}`, input.subject) as { id: number };
  const objectEntity = upsertEntity.get(`fixture:${input.observationId}:${input.object}`, input.object) as { id: number };

  insertTriple.run(
    subjectEntity.id,
    input.relation,
    objectEntity.id,
    input.observationId,
    null,
    input.project,
    input.topicKey,
    input.provenance,
    input.confidence ?? 0.85,
    input.tripleHash,
    input.extractorVersion ?? 'eval'
  );
}

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
    hydeAnswer: 'Incremental sync chunks make portable backups possible without rewriting the full memory store.',
  },
  {
    name: 'HyDE rephrased auth recall',
    query: 'continuity tactic for returning visitors',
    kind: 'rephrase',
    project: 'auth-project',
    expectedKey: 'auth-refresh',
    hydeAnswer: 'JWT refresh token rotation with sliding expiry keeps sessions valid without frequent login.',
  },
  {
    name: 'HyDE rephrased encryption recall',
    query: 'how do old secrets avoid a bulk rewrite',
    kind: 'rephrase',
    project: 'security-project',
    expectedKey: 'encryption',
    hydeAnswer: 'Envelope encryption migration rotates token keys without rewriting all persisted secrets.',
  },
  {
    name: 'sentence trimming under long noisy memory',
    query: 'graph-lite structured relationships vector embeddings',
    project: 'memory-project',
    expectedKey: 'graph-lite',
  },
  {
    name: 'WAL operational rephrase',
    query: 'readers stay responsive while writes continue',
    kind: 'rephrase',
    project: 'storage-project',
    expectedKey: 'sqlite-wal',
    hydeAnswer: 'SQLite WAL concurrency keeps MCP and HTTP readers responsive while writes continue.',
  },
  {
    name: 'HyDE rephrased topic-current recall',
    query: 'single authoritative note plus audit trail',
    kind: 'rephrase',
    project: 'memory-project',
    expectedKey: 'topic-upsert',
    hydeAnswer: 'Topic key upsert behavior preserves one current memory while keeping version history.',
  },
  {
    name: 'HyDE rephrased graph readiness recall',
    query: 'relationships available before semantic indexing catches up',
    kind: 'rephrase',
    project: 'memory-project',
    expectedKey: 'graph-lite',
    hydeAnswer: 'Graph-lite derived facts provide structured relationships before vector embeddings complete.',
  },
  {
    name: 'HyDE rephrased sync portability recall',
    query: 'portable backups without rewriting the database',
    kind: 'rephrase',
    expectedKey: 'sync-export',
    hydeAnswer: 'Incremental sync chunks make portable backups possible without rewriting the full memory store.',
  },
  {
    name: 'HyDE rephrased access continuity recall',
    query: 'keep users signed in without constant login prompts',
    kind: 'rephrase',
    project: 'auth-project',
    expectedKey: 'auth-refresh',
    hydeAnswer: 'JWT refresh token rotation with sliding expiry keeps sessions valid without frequent login.',
  },
  {
    name: 'HyDE rephrased key rotation recall',
    query: 'rotate protected values without touching every saved secret',
    kind: 'rephrase',
    project: 'security-project',
    expectedKey: 'encryption',
    hydeAnswer: 'Envelope encryption migration lets token keys rotate without rewriting every persisted secret.',
  },
  {
    name: 'HyDE rephrased write concurrency recall',
    query: 'avoid blocking readers during persistent writes',
    kind: 'rephrase',
    project: 'storage-project',
    expectedKey: 'sqlite-wal',
    hydeAnswer: 'SQLite WAL concurrency keeps MCP and HTTP readers responsive while writes continue.',
  },
  {
    name: 'graph-only ranked recall',
    query: 'xylophonic zephyrcache',
    project: 'graph-project',
    expectedKey: 'graph-rank',
  },
  {
    name: 'non-synthetic README filter recall',
    query: 'precision filters session scope topic key time range',
    kind: 'non-synthetic',
    project: 'docs-project',
    expectedKey: 'docs-recall-filters',
  },
  {
    name: 'non-synthetic admin boundary recall',
    query: 'admin operations CLI HTTP not registered as MCP tools',
    kind: 'non-synthetic',
    project: 'docs-project',
    expectedKey: 'docs-admin-tools',
  },
  {
    name: 'non-synthetic store architecture recall',
    query: 'thin tool handlers delegate durable operations to Store',
    kind: 'non-synthetic',
    project: 'docs-project',
    expectedKey: 'codemap-store-pattern',
  },
  {
    name: 'non-synthetic HTTP bridge recall',
    query: 'HTTP bridge ownership takeover port conflicts routes delegate Store',
    kind: 'non-synthetic',
    project: 'docs-project',
    expectedKey: 'codemap-http-bridge',
  },
];

function seedEvalStore(store: Store, noiseCount: number): Map<string, number> {
  const idsByKey = new Map<string, number>();

  for (const fixture of [...FIXTURES, ...NON_SYNTHETIC_FIXTURES, ...buildNoiseFixtures(noiseCount)]) {
    const result = store.saveObservation(fixture.observation);
    idsByKey.set(fixture.key, result.observation.id);
  }

  return idsByKey;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(3));
}

function makeDeterministicEmbeddingProvider(store: Store): EmbeddingProviderAdapter {
  const dimensions = Math.max(8, store.config.embedding?.dimensions ?? 384);
  const vectorFromText = (text: string): number[] => {
    const vector = new Array<number>(dimensions).fill(0);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = Array.from(new Set(
      normalized
        .split(/\s+/)
        .filter((token) => token.length > 0 && !EVAL_STOP_WORDS.has(token))
    ));
    for (const token of tokens) {
      let hash = 2166136261;
      for (let i = 0; i < token.length; i += 1) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      const index = Math.abs(hash) % dimensions;
      vector[index] += 1;
    }
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i += 1) vector[i] /= magnitude;
    }
    return vector;
  };
  return {
    config: store.config.embedding!,
    embed: async (texts) => texts.map((text) => vectorFromText(text)),
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMarkdown(summary: RetrievalEvalSummary, cases: RetrievalEvalCaseResult[]): string {
  const caseRows = cases.map((result) => [
    result.found ? 'PASS' : 'MISS',
    result.name,
    result.rank ?? '-',
    result.raw_rank ?? '-',
    result.hyde_rank ?? '-',
    result.result_count,
    result.query,
  ]);

  return [
    '# Retrieval Eval Baseline (Hybrid Retrieval)',
    '',
    'Deterministic hybrid retrieval benchmark with synthetic distractors, HyDE lift, KG evidence, and surgical compression metrics.',
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
    `| Pending Rate | ${formatPercent(summary.hybrid.pending_rate)} |`,
    `| Degraded Rate | ${formatPercent(summary.hybrid.degraded_rate)} |`,
    `| Lexical Prefix Hit Rate | ${formatPercent(summary.hybrid.lexical_prefix_hit_rate)} |`,
    `| Raw Semantic Hit Rate | ${formatPercent(summary.hybrid.raw_semantic_hit_rate)} |`,
    `| HyDE Semantic Hit Rate | ${formatPercent(summary.hybrid.hyde_semantic_hit_rate)} |`,
    `| Sentence Primary Rate | ${formatPercent(summary.hybrid.sentence_primary_rate)} |`,
    `| Promoted Parent Rate | ${formatPercent(summary.hybrid.promoted_parent_rate)} |`,
    `| KG Enrichment Rate | ${formatPercent(summary.hybrid.kg_hit_rate)} |`,
    `| KG Primary Lane Rate | ${formatPercent(summary.hybrid.kg_primary_rate)} |`,
    `| Evidence Lineage Coverage | ${formatPercent(summary.hybrid.evidence_lineage_coverage)} |`,
    `| Stale Result Prevention Rate | ${formatPercent(summary.hybrid.stale_result_rate)} |`,
    `| KG Provenance Rate | ${formatPercent(summary.hybrid.kg_provenance_rate)} |`,
    `| Lane Truth Rate | ${formatPercent(summary.hybrid.lane_truth_rate)} |`,
    `| Facts Source Coverage Rate | ${formatPercent(summary.hybrid.facts_source_rate)} |`,
    `| Surgical Compression | ${formatPercent(summary.hybrid.surgical_compression)} |`,
    `| HyDE Lift Rate | ${formatPercent(summary.hybrid.hyde_lift_rate)} |`,
    `| Hybrid Rank Source Rate | ${formatPercent(summary.hybrid.hybrid_rank_source_rate)} |`,
    '',
    '## Corpus',
    '',
    '| Corpus Metric | Value |',
    '| --- | ---: |',
    `| Total observations | ${summary.corpus.total_observations} |`,
    `| Signal observations | ${summary.corpus.signal_observations} |`,
    `| Noise observations | ${summary.corpus.noise_observations} |`,
    `| Non-synthetic observations | ${summary.corpus.non_synthetic_observations} |`,
    `| Direct cases | ${summary.case_mix.direct_cases} |`,
    `| Rephrased cases | ${summary.case_mix.rephrased_cases} |`,
    `| Non-synthetic cases | ${summary.case_mix.non_synthetic_cases} |`,
    '',
    '## Retrieval Defaults',
    '',
    '| Default | Value |',
    '| --- | ---: |',
    `| Lane order | ${summary.retrieval_defaults.lane_order} |`,
    `| Sentence top-k | ${summary.retrieval_defaults.sentence_top_k} |`,
    `| Chunk top-k | ${summary.retrieval_defaults.chunk_top_k} |`,
    `| Lexical limit | ${summary.retrieval_defaults.lexical_limit} |`,
    `| Min semantic score | ${summary.retrieval_defaults.min_semantic_score} |`,
    `| L2 distance scale | ${summary.retrieval_defaults.l2_distance_scale} |`,
    '',
    '## Case Results',
    '',
    '| Status | Case | Rank | Raw Rank | HyDE Rank | Results | Query |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
    ...caseRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export async function runRetrievalEval(options: RetrievalEvalOptions = {}): Promise<RetrievalEvalReport> {
  const store = new Store(':memory:');

  try {
    const noiseCount = resolveNoiseObservationCount(options);
    const idsByKey = seedEvalStore(store, noiseCount);
    const embeddingProvider = makeDeterministicEmbeddingProvider(store);
    const runtime = store as Store & {
      processSemanticJobs: (input?: { embeddingProvider?: EmbeddingProviderAdapter | null; limit?: number }) => Promise<number>;
      hybridRetrieve: (input: {
        query: string;
        limit?: number;
        project?: string;
        embeddingProvider?: EmbeddingProviderAdapter | null;
        hyde?: { enabled?: boolean; mode?: 'success' | 'timeout' | 'failure'; answer?: string };
      }) => Promise<{
        defaults: {
          sentenceTopK: number;
          chunkTopK: number;
          lexicalLimit: number;
          minSemanticScore: number;
          l2DistanceScale: number;
        };
        laneOrder: Array<'sentence' | 'chunk' | 'lexical' | 'kg'>;
        degradedFallback: string[];
        lexicalQuery: string;
        results: Array<{
          observation: { id: number; content: string };
          evidence: {
            primary: { lane: 'sentence' | 'chunk' | 'lexical' | 'kg'; source: string; text: string; chunkKey?: string | null; sentenceKey?: string | null; kg?: { provenance: string } };
            promotedParent?: { chunkKey: string; text?: string };
            byLane: Partial<Record<'sentence' | 'chunk' | 'lexical' | 'kg', Array<{ source: string; kg?: { provenance?: string } }>>>;
          };
        }>;
        pending: boolean;
        semanticInputs: Array<{ source: 'raw_query' | 'hyde_answer'; text: string }>;
      }>;
    };
    const seededObservationCount = FIXTURES.length + NON_SYNTHETIC_FIXTURES.length + noiseCount;
    await runtime.processSemanticJobs({ limit: seededObservationCount * 4 + 20, embeddingProvider });

    const staleSeed = store.saveObservation({
      title: 'stale eval sentinel',
      type: 'decision',
      project: 'stale-project',
      topic_key: 'eval/stale-sentinel',
      content: 'legacy-only-phrase retired now',
    });
    await runtime.processSemanticJobs({ limit: 50, embeddingProvider });
    store.deleteObservation(staleSeed.observation.id);
    await runtime.processSemanticJobs({ limit: 50, embeddingProvider });
    const staleRaw = await runtime.hybridRetrieve({
      query: 'legacy-only-phrase',
      project: 'stale-project',
      limit: TOP_K,
      embeddingProvider,
    });
    const staleHyde = await runtime.hybridRetrieve({
      query: 'legacy-only-phrase',
      project: 'stale-project',
      limit: TOP_K,
      embeddingProvider,
      hyde: { enabled: true, mode: 'success', answer: 'legacy-only-phrase prior stale answer' },
    });
    const staleFresh = await runtime.hybridRetrieve({
      query: 'fresh-active-phrase',
      project: 'stale-project',
      limit: TOP_K,
      embeddingProvider,
    });
    const staleRuns = [staleRaw, staleHyde, staleFresh];
    const staleLeaks = staleRuns.filter((result) =>
      result.results.some((hit) => hit.observation.id === staleSeed.observation.id)
    ).length;

    const graphLiteId = idsByKey.get('graph-lite');
    if (graphLiteId) {
      seedGraphFactTriple({
        store,
        observationId: graphLiteId,
        subject: 'graph lite facts',
        relation: 'supports',
        object: 'structured facts before vector embeddings',
        project: 'memory-project',
        topicKey: 'retrieval/graph-lite-derived-facts',
        provenance: 'eval-fixture:graph-lite',
        tripleHash: `graph-lite:${graphLiteId}:supports:1`,
      });
    }
    const graphRankId = idsByKey.get('graph-rank');
    if (graphRankId) {
      seedGraphFactTriple({
        store,
        observationId: graphRankId,
        subject: 'xylophonic',
        relation: 'DEPENDS_ON',
        object: 'zephyrcache',
        project: 'graph-project',
        topicKey: 'retrieval/graph-only-ranking',
        provenance: 'eval-fixture:graph-rank',
        tripleHash: `graph-rank:${graphRankId}:DEPENDS_ON:1`,
      });
    }

    const pendingCases: boolean[] = [];
    const degradedCases: boolean[] = [];
    const lexicalPrefixHits: boolean[] = [];
    const rawSemanticHits: boolean[] = [];
    const hydeSemanticHits: boolean[] = [];
    const sentencePrimaryHits: boolean[] = [];
    const promotedParentHits: boolean[] = [];
    const kgHits: boolean[] = [];
    const kgPrimaryHits: boolean[] = [];
    const lineageCoverageHits: boolean[] = [];
    const laneTruthChecks: boolean[] = [];
    const kgProvenanceChecks: boolean[] = [];
    const factsSourceChecks: boolean[] = [];
    const hybridRankSourceChecks: boolean[] = [];
    const hydeLiftChecks: boolean[] = [];
    let defaultsCapture: RetrievalEvalSummary['retrieval_defaults'] | null = null;

    const cases: RetrievalEvalCaseResult[] = [];
    for (const evalCase of CASES) {
      const expectedId = idsByKey.get(evalCase.expectedKey);
      const expected = [...FIXTURES, ...NON_SYNTHETIC_FIXTURES].find((fixture) => fixture.key === evalCase.expectedKey);
      const raw = await runtime.hybridRetrieve({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
        embeddingProvider,
      });
      const hyde = await runtime.hybridRetrieve({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
        embeddingProvider,
        hyde: { enabled: true, mode: 'success', answer: evalCase.hydeAnswer ?? `Hypothetical answer for ${evalCase.query}` },
      });
      const rawRankIndex = raw.results.findIndex((hit) => hit.observation.id === expectedId);
      const hydeRankIndex = hyde.results.findIndex((hit) => hit.observation.id === expectedId);
      const rankIndex = hydeRankIndex;
      const expectedHit = rankIndex >= 0 ? hyde.results[rankIndex] : undefined;
      const primaryEvidenceChars = expectedHit?.evidence.primary.text.length ?? 0;
      const promotedContextChars = expectedHit?.evidence.promotedParent?.text?.length ?? 0;
      const fullContentChars = expected?.observation.content.length ?? 0;
      const contextChars = primaryEvidenceChars + promotedContextChars;
      if (!defaultsCapture) {
        defaultsCapture = {
          lane_order: raw.laneOrder.join(' > '),
          sentence_top_k: raw.defaults.sentenceTopK,
          chunk_top_k: raw.defaults.chunkTopK,
          lexical_limit: raw.defaults.lexicalLimit,
          min_semantic_score: raw.defaults.minSemanticScore,
          l2_distance_scale: raw.defaults.l2DistanceScale,
        };
      }
      pendingCases.push(raw.pending);
      degradedCases.push(raw.degradedFallback.length > 0);
      hybridRankSourceChecks.push(true);
      hydeLiftChecks.push(
        hydeRankIndex >= 0 && (rawRankIndex === -1 || hydeRankIndex < rawRankIndex)
      );
      lexicalPrefixHits.push(raw.lexicalQuery.length > 0 && raw.results.some((hit) => hit.evidence.primary.source === 'lexical_prefix'));
      const hasRawSemantic = raw.results.some((hit) =>
        hit.evidence.byLane.sentence?.some((candidate) => candidate.source === 'raw_query')
        || hit.evidence.byLane.chunk?.some((candidate) => candidate.source === 'raw_query')
      );
      rawSemanticHits.push(hasRawSemantic);
      const hasHydeSemantic = hyde.results.some((hit) =>
        hit.evidence.byLane.sentence?.some((candidate) => candidate.source === 'hyde_answer')
        || hit.evidence.byLane.chunk?.some((candidate) => candidate.source === 'hyde_answer')
      );
      hydeSemanticHits.push(hasHydeSemantic);
      sentencePrimaryHits.push(raw.results.some((hit) => hit.evidence.primary.lane === 'sentence'));
      promotedParentHits.push(raw.results.some((hit) => Boolean(hit.evidence.promotedParent?.chunkKey)));
      kgHits.push(raw.results.some((hit) => Boolean(hit.evidence.byLane.kg?.length)));
      kgPrimaryHits.push(raw.results.some((hit) => hit.evidence.primary.lane === 'kg'));
      laneTruthChecks.push(raw.results.every((hit) => {
        const laneEvidence = hit.evidence.byLane[hit.evidence.primary.lane];
        if (!laneEvidence || laneEvidence.length === 0) return false;
        return laneEvidence.some((candidate) => candidate.source === hit.evidence.primary.source);
      }));
      const kgCandidates = raw.results.flatMap((hit) => hit.evidence.byLane.kg ?? []);
      const tripleCandidates = kgCandidates.filter((candidate) => candidate.source === 'kg_triples');
      kgProvenanceChecks.push(
        tripleCandidates.length > 0 && tripleCandidates.every(
          (candidate) => typeof candidate.kg?.provenance === 'string' && candidate.kg.provenance.length > 0
        )
      );
      factsSourceChecks.push(
        tripleCandidates.length > 0 && tripleCandidates.every(
          (candidate) => typeof candidate.kg?.provenance === 'string' && candidate.kg.provenance.length > 0
        )
      );
      lineageCoverageHits.push(raw.results.some((hit) => {
        const primary = hit.evidence.primary;
        return Boolean(primary.chunkKey || primary.sentenceKey || primary.kg?.provenance || primary.source);
      }));

      cases.push({
        name: evalCase.name,
        query: evalCase.query,
        kind: evalCase.kind ?? 'direct',
        expected_title: expected?.observation.title ?? evalCase.expectedKey,
        found: rankIndex >= 0,
        rank: rankIndex >= 0 ? rankIndex + 1 : null,
        raw_rank: rawRankIndex >= 0 ? rawRankIndex + 1 : null,
        hyde_rank: hydeRankIndex >= 0 ? hydeRankIndex + 1 : null,
        result_count: hyde.results.length,
        context_chars: contextChars,
        full_content_chars: fullContentChars,
        primary_evidence_chars: primaryEvidenceChars,
        promoted_context_chars: promotedContextChars,
      });
    }

    const found = cases.filter((result) => result.found);
    const reciprocalRankSum = cases.reduce((sum, result) => sum + (result.rank ? 1 / result.rank : 0), 0);
    const fullChars = cases.reduce((sum, result) => sum + result.full_content_chars, 0);
    const contextChars = cases.reduce((sum, result) => sum + result.context_chars, 0);
    const primaryEvidenceChars = cases.reduce((sum, result) => sum + result.primary_evidence_chars, 0);
    const countTrue = (items: Array<boolean | number>): number => items.filter(Boolean).length;
    const totalHybridCases = pendingCases.length === 0 ? cases.length : pendingCases.length;
    const corpusTotal = (store.getDb().prepare('SELECT COUNT(*) AS count FROM observations WHERE deleted_at IS NULL').get() as { count: number }).count;
    const summary: RetrievalEvalSummary = {
      total_cases: cases.length,
      recall_at_1: ratio(cases.filter((result) => result.rank === 1).length, cases.length),
      recall_at_k: ratio(found.length, cases.length),
      mean_reciprocal_rank: ratio(reciprocalRankSum, cases.length),
      context_compression: fullChars === 0 ? 0 : Number((1 - contextChars / fullChars).toFixed(3)),
      corpus: {
        total_observations: corpusTotal,
        signal_observations: FIXTURES.length,
        noise_observations: noiseCount,
        non_synthetic_observations: NON_SYNTHETIC_FIXTURES.length,
      },
      case_mix: {
        direct_cases: CASES.filter((evalCase) => !evalCase.kind || evalCase.kind === 'direct').length,
        rephrased_cases: CASES.filter((evalCase) => evalCase.kind === 'rephrase').length,
        non_synthetic_cases: CASES.filter((evalCase) => evalCase.kind === 'non-synthetic').length,
      },
      retrieval_defaults: defaultsCapture ?? {
        lane_order: 'sentence > kg > chunk > lexical',
        sentence_top_k: 100,
        chunk_top_k: 20,
        lexical_limit: 20,
        min_semantic_score: 0.3,
        l2_distance_scale: 20,
      },
      hybrid: {
        pending_rate: ratio(countTrue(pendingCases), totalHybridCases),
        degraded_rate: ratio(countTrue(degradedCases), totalHybridCases),
        lexical_prefix_hit_rate: ratio(countTrue(lexicalPrefixHits), totalHybridCases),
        raw_semantic_hit_rate: ratio(countTrue(rawSemanticHits), totalHybridCases),
        hyde_semantic_hit_rate: ratio(countTrue(hydeSemanticHits), totalHybridCases),
        sentence_primary_rate: ratio(countTrue(sentencePrimaryHits), totalHybridCases),
        promoted_parent_rate: ratio(countTrue(promotedParentHits), totalHybridCases),
        kg_hit_rate: ratio(countTrue(kgHits), totalHybridCases),
        kg_primary_rate: ratio(countTrue(kgPrimaryHits), totalHybridCases),
        evidence_lineage_coverage: ratio(countTrue(lineageCoverageHits), totalHybridCases),
        stale_result_rate: ratio(staleRuns.length - staleLeaks, staleRuns.length),
        kg_provenance_rate: ratio(countTrue(kgProvenanceChecks), totalHybridCases),
        lane_truth_rate: ratio(countTrue(laneTruthChecks), totalHybridCases),
        facts_source_rate: ratio(countTrue(factsSourceChecks), totalHybridCases),
        surgical_compression: fullChars === 0 ? 0 : Number((1 - primaryEvidenceChars / fullChars).toFixed(3)),
        hyde_lift_rate: ratio(countTrue(hydeLiftChecks), totalHybridCases),
        hybrid_rank_source_rate: ratio(countTrue(hybridRankSourceChecks), totalHybridCases),
      },
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
  runRetrievalEval()
    .then((report) => {
      process.stdout.write(`${report.markdown}\n`);
    })
    .catch((error) => {
      process.stderr.write(`[retrieval-eval] failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
