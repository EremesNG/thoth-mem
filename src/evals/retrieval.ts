import { pathToFileURL } from 'node:url';
import {
  DEFAULT_COMMUNITY_SUMMARIES_CONFIG,
  DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
} from '../config.js';
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
    supersession_no_regression_rate: number;
    supersession_flag_off_rate: number;
    kg_prune_retention_rate: number;
    kg_prune_no_regression_rate: number;
    maintenance_duplicate_suppression_rate: number;
    maintenance_source_reachability_rate: number;
    maintenance_reflection_quality_rate: number;
    maintenance_reflection_idempotency_rate: number;
    maintenance_decay_current_fact_rate: number;
    maintenance_decay_reachability_rate: number;
    maintenance_no_regression_rate: number;
    maintenance_export_import_regeneration_rate: number;
    community_read_path_default_off_rate: number;
    community_disabled_no_regression_rate: number;
    community_enabled_no_regression_rate: number;
    community_fallback_rate: number;
    community_no_fifth_lane_rate: number;
    community_direct_kg_no_regression_rate: number;
    community_multi_hop_no_regression_rate: number;
    community_summary_bounds_rate: number;
    community_coverage_bounds_rate: number;
    community_enrichment_unavailable_fallback_rate: number;
  };
}

export interface RetrievalEvalReport {
  summary: RetrievalEvalSummary;
  cases: RetrievalEvalCaseResult[];
  markdown: string;
}

const TOP_K = 5;
const DEFAULT_NOISE_OBSERVATION_COUNT = 96;
const SUPERSESSION_SIGNAL_OBSERVATIONS = 1;
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
  {
    key: 'kg-multi-hop',
    observation: {
      title: 'Shared entity downstream finding',
      type: 'discovery',
      project: 'graph-project',
      topic_key: 'retrieval/kg-multi-hop',
      content: 'Downstream finding deliberately avoids the direct graph query terms and is reachable only through a structural entity bridge.',
    },
  },
  {
    key: 'kg-multi-hop-distractor',
    observation: {
      title: 'Metadata-only graph distractor',
      type: 'manual',
      project: 'graph-project',
      topic_key: 'retrieval/kg-multi-hop-distractor',
      content: 'Metadata-only distractor should not be reached by structural traversal.',
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
    name: 'kg multi-hop shared entity recall',
    query: 'xylophonic',
    project: 'graph-project',
    expectedKey: 'kg-multi-hop',
  },
  {
    name: 'supersession current fact wins',
    query: 'cache',
    project: 'supersession-project',
    expectedKey: 'kg-supersession',
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

  store.saveObservation({
    title: 'Supersession cache decision',
    type: 'decision',
    project: 'supersession-project',
    topic_key: 'eval/supersession-cache',
    content: '**What**: Redis cache',
  });
  const current = store.saveObservation({
    title: 'Supersession cache decision',
    type: 'decision',
    project: 'supersession-project',
    topic_key: 'eval/supersession-cache',
    content: '**What**: Valkey cache',
  });
  idsByKey.set('kg-supersession', current.observation.id);

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
    `| Supersession OFF/ON No-Regression Rate | ${formatPercent(summary.hybrid.supersession_no_regression_rate)} |`,
    `| Supersession Flag-Off Behavior Rate | ${formatPercent(summary.hybrid.supersession_flag_off_rate)} |`,
    `| KG Prune Retention Rate | ${formatPercent(summary.hybrid.kg_prune_retention_rate)} |`,
    `| KG Prune OFF/ON No-Regression Rate | ${formatPercent(summary.hybrid.kg_prune_no_regression_rate)} |`,
    `| Maintenance Duplicate Suppression Rate | ${formatPercent(summary.hybrid.maintenance_duplicate_suppression_rate)} |`,
    `| Maintenance Source Reachability Rate | ${formatPercent(summary.hybrid.maintenance_source_reachability_rate)} |`,
    `| Maintenance Reflection Quality Rate | ${formatPercent(summary.hybrid.maintenance_reflection_quality_rate)} |`,
    `| Maintenance Reflection Idempotency Rate | ${formatPercent(summary.hybrid.maintenance_reflection_idempotency_rate)} |`,
    `| Maintenance Decay Current Fact Rate | ${formatPercent(summary.hybrid.maintenance_decay_current_fact_rate)} |`,
    `| Maintenance Decay Reachability Rate | ${formatPercent(summary.hybrid.maintenance_decay_reachability_rate)} |`,
    `| Maintenance OFF/ON No-Regression Rate | ${formatPercent(summary.hybrid.maintenance_no_regression_rate)} |`,
    `| Maintenance Export/Import Regeneration Rate | ${formatPercent(summary.hybrid.maintenance_export_import_regeneration_rate)} |`,
    `| Community Read Path Default-Off Rate | ${formatPercent(summary.hybrid.community_read_path_default_off_rate)} |`,
    `| Community Disabled No-Regression Rate | ${formatPercent(summary.hybrid.community_disabled_no_regression_rate)} |`,
    `| Community Enabled No-Regression Rate | ${formatPercent(summary.hybrid.community_enabled_no_regression_rate)} |`,
    `| Community Fallback Rate | ${formatPercent(summary.hybrid.community_fallback_rate)} |`,
    `| Community No Fifth Lane Rate | ${formatPercent(summary.hybrid.community_no_fifth_lane_rate)} |`,
    `| Community Direct KG No-Regression Rate | ${formatPercent(summary.hybrid.community_direct_kg_no_regression_rate)} |`,
    `| Community Multi-Hop No-Regression Rate | ${formatPercent(summary.hybrid.community_multi_hop_no_regression_rate)} |`,
    `| Community Summary Bounds Rate | ${formatPercent(summary.hybrid.community_summary_bounds_rate)} |`,
    `| Community Coverage Bounds Rate | ${formatPercent(summary.hybrid.community_coverage_bounds_rate)} |`,
    `| Community Enrichment Unavailable Fallback Rate | ${formatPercent(summary.hybrid.community_enrichment_unavailable_fallback_rate)} |`,
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

async function validateSupersessionFlagOffBehavior(): Promise<boolean> {
  const controlStore = new Store(':memory:');
  try {
    if (controlStore.config.knowledgeGraph) {
      controlStore.config.knowledgeGraph.kgSupersedeEnabled = false;
    }
    controlStore.saveObservation({
      title: 'Supersession flag-off control',
      type: 'decision',
      project: 'supersession-off-project',
      topic_key: 'eval/supersession-flag-off-control',
      content: '**What**: Redis cache',
    });
    const current = controlStore.saveObservation({
      title: 'Supersession flag-off control',
      type: 'decision',
      project: 'supersession-off-project',
      topic_key: 'eval/supersession-flag-off-control',
      content: '**What**: Valkey cache',
    });
    const runtime = controlStore as Store & {
      processSemanticJobs: (input?: { embeddingProvider?: EmbeddingProviderAdapter | null; limit?: number }) => Promise<number>;
      hybridRetrieve: (input: {
        query: string;
        limit?: number;
        project?: string;
        embeddingProvider?: EmbeddingProviderAdapter | null;
        hyde?: { enabled?: boolean; mode?: 'success' | 'timeout' | 'failure'; answer?: string };
      }) => Promise<{
        results: Array<{
          observation: { id: number };
          evidence: {
            byLane: Partial<Record<'sentence' | 'chunk' | 'lexical' | 'kg', Array<{ source: string; text?: string; kg?: { superseded?: boolean } }>>>;
          };
        }>;
      }>;
    };
    const embeddingProvider = makeDeterministicEmbeddingProvider(controlStore);
    await runtime.processSemanticJobs({ limit: 20, embeddingProvider });
    const kgRows = controlStore.getDb().prepare(
      `SELECT
         oe.canonical_name AS object,
         t.superseded_by_triple_id AS supersededByTripleId,
         t.superseded_at AS supersededAt
       FROM kg_triples t
       JOIN kg_entities oe ON oe.id = t.object_entity_id
       WHERE t.source_type = 'observation' AND t.source_id = ?`
    ).all(current.observation.id) as Array<{ object: string; supersededByTripleId: number | null; supersededAt: string | null }>;
    const retrieval = await runtime.hybridRetrieve({
      query: 'cache',
      project: 'supersession-off-project',
      limit: TOP_K,
      embeddingProvider,
      hyde: { enabled: true, mode: 'success', answer: 'Valkey cache is the current cache decision.' },
    });
    const kgCandidates = retrieval.results.flatMap((hit) => hit.evidence.byLane.kg ?? []);
    return (
      retrieval.results.some((hit) => hit.observation.id === current.observation.id)
      && kgRows.some((row) => row.object === 'Valkey cache')
      && !kgRows.some((row) => row.object === 'Redis cache')
      && kgRows.every((row) => row.supersededByTripleId === null && row.supersededAt === null)
      && kgCandidates.every((candidate) => !candidate.kg?.superseded && !String(candidate.text ?? '').includes('Redis cache'))
    );
  } finally {
    controlStore.close();
  }
}

type EvalHybridRuntime = Store & {
  processSemanticJobs: (input?: { embeddingProvider?: EmbeddingProviderAdapter | null; limit?: number }) => Promise<number>;
  hybridRetrieve: (input: {
    query: string;
    limit?: number;
    project?: string;
    embeddingProvider?: EmbeddingProviderAdapter | null;
    hyde?: { enabled?: boolean; mode?: 'success' | 'timeout' | 'failure'; answer?: string };
  }) => Promise<{
    results: Array<{
      observation: { id: number; content: string; tool_name?: string | null };
      evidence: {
        maintenance?: {
          consolidation?: { canonicalId: number; memberIds: number[]; suppressedSourceIds: number[] };
          reflection?: { sourceIds: number[]; reasonClass: string; boost: number };
          decay?: { scoreMultiplier: number; state: string; reasonClass: string };
        };
      };
    }>;
  }>;
};

async function validateMaintenanceDuplicateSuppression(
  store: Store,
  runtime: EvalHybridRuntime,
  embeddingProvider: EmbeddingProviderAdapter,
): Promise<{ suppression: boolean; sourceReachability: boolean }> {
  const canonical = store.saveObservation({
    title: 'Maintenance eval duplicate canonical',
    content: 'maint-duplicate-signal source reachability duplicate cluster',
    type: 'decision',
    project: 'maintenance-duplicate-eval',
  }).observation;
  const duplicateId = Number(store.getDb().prepare(
    `INSERT INTO observations (
       session_id, type, title, content, project, scope, normalized_hash, sync_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), datetime('now', '-1 day'))`
  ).run(
    canonical.session_id,
    canonical.type,
    'Maintenance eval duplicate member',
    canonical.content,
    canonical.project,
    canonical.scope,
    canonical.normalized_hash,
    '44444444-4444-4444-8444-444444444444'
  ).lastInsertRowid);

  await runtime.processSemanticJobs({ limit: 20, embeddingProvider });
  const before = await runtime.hybridRetrieve({
    query: 'maint-duplicate-signal source reachability',
    project: 'maintenance-duplicate-eval',
    limit: TOP_K,
    embeddingProvider,
  });
  const duplicateHitsBefore = before.results.filter((hit) =>
    hit.observation.id === canonical.id || hit.observation.id === duplicateId
  ).length;

  store.runMaintenance({ scope: { project: 'maintenance-duplicate-eval' } });
  const after = await runtime.hybridRetrieve({
    query: 'maint-duplicate-signal source reachability',
    project: 'maintenance-duplicate-eval',
    limit: TOP_K,
    embeddingProvider,
  });
  const duplicateHitsAfter = after.results.filter((hit) =>
    hit.observation.id === canonical.id || hit.observation.id === duplicateId
  );
  const consolidation = duplicateHitsAfter[0]?.evidence.maintenance?.consolidation;

  return {
    suppression: duplicateHitsBefore >= 2
      && duplicateHitsAfter.length === 1
      && Boolean(consolidation)
      && consolidation!.memberIds.includes(canonical.id)
      && consolidation!.memberIds.includes(duplicateId)
      && consolidation!.suppressedSourceIds.length >= 1,
    sourceReachability: store.getObservation(duplicateId)?.content === canonical.content,
  };
}

async function validateMaintenanceReflection(
  store: Store,
  runtime: EvalHybridRuntime,
  embeddingProvider: EmbeddingProviderAdapter,
): Promise<{ quality: boolean; idempotency: boolean }> {
  store.saveObservation({
    title: 'Reflection quality source A',
    content: 'Deterministic reflection source A records durable learning inputs.',
    type: 'architecture',
    project: 'maintenance-reflection-eval',
  });
  store.saveObservation({
    title: 'Reflection quality source B',
    content: 'Deterministic reflection source B records durable learning inputs.',
    type: 'architecture',
    project: 'maintenance-reflection-eval',
  });

  const first = store.runMaintenance({ scope: { project: 'maintenance-reflection-eval' } });
  const second = store.runMaintenance({ scope: { project: 'maintenance-reflection-eval' } });
  await runtime.processSemanticJobs({ limit: 20, embeddingProvider });
  const reflectedId = second.reflections[0]?.planned_observation_id ?? first.reflections[0]?.planned_observation_id;
  const retrieval = await runtime.hybridRetrieve({
    query: 'maintenance reflection synthesized related source memories',
    project: 'maintenance-reflection-eval',
    limit: TOP_K,
    embeddingProvider,
  });
  const reflectionRank = retrieval.results.findIndex((hit) => hit.observation.id === reflectedId);
  const sourceRanks = second.reflections[0]?.sources.map((source) =>
    retrieval.results.findIndex((hit) => hit.observation.id === source.id)
  ).filter((rank) => rank >= 0) ?? [];
  const reflectionHit = reflectionRank >= 0 ? retrieval.results[reflectionRank] : undefined;
  const reflectedRows = store.getDb().prepare(
    "SELECT COUNT(*) AS count FROM observations WHERE tool_name = 'maintenance-reflection' AND project = 'maintenance-reflection-eval'"
  ).get() as { count: number };

  return {
    quality: reflectionRank >= 0
      && sourceRanks.every((rank) => reflectionRank <= rank)
      && (reflectionHit?.evidence.maintenance?.reflection?.sourceIds.length ?? 0) >= 2,
    idempotency: first.reflections.length === 1
      && second.reflections.length === 1
      && reflectedRows.count === 1
      && first.reflections[0]?.planned_observation_id === second.reflections[0]?.planned_observation_id,
  };
}

async function validateMaintenanceDecay(
  store: Store,
  runtime: EvalHybridRuntime,
  embeddingProvider: EmbeddingProviderAdapter,
): Promise<{ currentFact: boolean; reachability: boolean }> {
  const stale = store.saveObservation({
    title: 'Stale low-value maintenance eval',
    content: 'caldera endpoint policy chooses legacy polling for workers',
    type: 'discovery',
    project: 'maintenance-decay-eval',
  }).observation;
  store.getDb().prepare(
    "UPDATE observations SET updated_at = datetime('now', '-365 days'), created_at = datetime('now', '-365 days') WHERE id = ?"
  ).run(stale.id);
  const current = store.saveObservation({
    title: 'Current high-signal maintenance eval',
    content: 'caldera endpoint policy chooses streaming for workers',
    type: 'decision',
    project: 'maintenance-decay-eval',
  }).observation;

  await runtime.processSemanticJobs({ limit: 20, embeddingProvider });
  store.runMaintenance({ scope: { project: 'maintenance-decay-eval' } });
  const retrieval = await runtime.hybridRetrieve({
    query: 'caldera endpoint policy workers',
    project: 'maintenance-decay-eval',
    limit: 10,
    embeddingProvider,
  });
  const currentRank = retrieval.results.findIndex((hit) => hit.observation.id === current.id);
  const staleRank = retrieval.results.findIndex((hit) => hit.observation.id === stale.id);
  const staleHit = staleRank >= 0 ? retrieval.results[staleRank] : undefined;

  return {
    currentFact: currentRank >= 0
      && staleRank >= 0
      && currentRank < staleRank
      && Boolean(staleHit?.evidence.maintenance?.decay),
    reachability: store.getObservation(stale.id)?.content === stale.content,
  };
}

async function validateMaintenanceExportImportRegeneration(): Promise<boolean> {
  const sourceStore = new Store(':memory:');
  const targetStore = new Store(':memory:');
  try {
    const source = sourceStore.saveObservation({
      title: 'Portable maintenance duplicate A',
      content: 'portable maintenance duplicate signal',
      type: 'decision',
      project: 'maintenance-portable-eval',
    }).observation;
    sourceStore.getDb().prepare(
      `INSERT INTO observations (
         session_id, type, title, content, project, scope, normalized_hash, sync_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 day'), datetime('now', '-1 day'))`
    ).run(
      source.session_id,
      source.type,
      'Portable maintenance duplicate B',
      source.content,
      source.project,
      source.scope,
      source.normalized_hash,
      '55555555-5555-4555-8555-555555555555'
    );
    sourceStore.saveObservation({
      title: 'Portable reflection source A',
      content: 'portable reflection source one',
      type: 'architecture',
      project: 'maintenance-portable-eval',
    });
    sourceStore.saveObservation({
      title: 'Portable reflection source B',
      content: 'portable reflection source two',
      type: 'architecture',
      project: 'maintenance-portable-eval',
    });
    sourceStore.runMaintenance({ scope: { project: 'maintenance-portable-eval' } });

    const exported = sourceStore.exportData('maintenance-portable-eval');
    const portableJson = JSON.stringify(exported);
    targetStore.importData(exported);
    const metadataBefore = targetStore.getDb().prepare(
      `SELECT
         (SELECT COUNT(*) FROM maintenance_consolidations) AS consolidations,
         (SELECT COUNT(*) FROM maintenance_decay) AS decays`
    ).get() as { consolidations: number; decays: number };
    const regenerated = targetStore.runMaintenance({ scope: { project: 'maintenance-portable-eval' } });

    return exported.observations.some((observation) => observation.tool_name === 'maintenance-reflection')
      && !portableJson.includes('maintenance_consolidations')
      && !portableJson.includes('maintenance_decay')
      && metadataBefore.consolidations === 0
      && metadataBefore.decays === 0
      && regenerated.counts.consolidation_candidates > 0
      && regenerated.counts.decay_candidates >= 0;
  } finally {
    sourceStore.close();
    targetStore.close();
  }
}

async function validateKgPruneRetentionCase(
  store: Store,
  runtime: Store & {
    processSemanticJobs: (input?: { embeddingProvider?: EmbeddingProviderAdapter | null; limit?: number }) => Promise<number>;
    hybridRetrieve: (input: {
      query: string;
      limit?: number;
      project?: string;
      embeddingProvider?: EmbeddingProviderAdapter | null;
    }) => Promise<{ results: Array<{ observation: { id: number } }> }>;
  },
  embeddingProvider: EmbeddingProviderAdapter,
): Promise<boolean> {
  const knowledgeGraph = store.config.knowledgeGraph;
  if (!knowledgeGraph) return false;

  const previousPruneEnabled = knowledgeGraph.kgPruneEnabled;
  const previousKeepN = knowledgeGraph.kgSupersededKeepN;

  try {
    knowledgeGraph.kgPruneEnabled = false;
    knowledgeGraph.kgSupersededKeepN = 1;

    const saved = store.saveObservation({
      title: 'KG prune retention eval',
      type: 'decision',
      project: 'kg-prune-eval',
      topic_key: 'eval/kg-prune-retention',
      content: '**What**: Retention cache uses Redis',
    }).observation;

    for (const value of ['Retention cache uses Valkey', 'Retention cache uses Dragonfly', 'Retention cache uses Garnet']) {
      store.updateObservation({
        id: saved.id,
        content: `**What**: ${value}`,
      });
    }

    const supersededBefore = (store.getDb().prepare(
      `SELECT COUNT(*) AS count
       FROM kg_triples
       WHERE source_id = ? AND relation = 'HAS_WHAT'
         AND (superseded_at IS NOT NULL OR superseded_by_triple_id IS NOT NULL)`
    ).get(saved.id) as { count: number }).count;
    const dryRun = store.pruneSupersededTriples({ project: 'kg-prune-eval', dryRun: true });
    const real = store.pruneSupersededTriples({ project: 'kg-prune-eval' });
    const supersededAfter = (store.getDb().prepare(
      `SELECT COUNT(*) AS count
       FROM kg_triples
       WHERE source_id = ? AND relation = 'HAS_WHAT'
         AND (superseded_at IS NOT NULL OR superseded_by_triple_id IS NOT NULL)`
    ).get(saved.id) as { count: number }).count;
    const currentAfter = (store.getDb().prepare(
      `SELECT COUNT(*) AS count
       FROM kg_triples
       WHERE source_id = ? AND relation = 'HAS_WHAT'
         AND superseded_at IS NULL AND superseded_by_triple_id IS NULL`
    ).get(saved.id) as { count: number }).count;

    await runtime.processSemanticJobs({ limit: 20, embeddingProvider });
    const retrieval = await runtime.hybridRetrieve({
      query: 'Garnet retention cache',
      project: 'kg-prune-eval',
      limit: TOP_K,
      embeddingProvider,
    });

    return (
      supersededBefore === 3
      && dryRun.triples_pruned > 0
      && real.triples_pruned === dryRun.triples_pruned
      && supersededAfter === 1
      && currentAfter === 1
      && retrieval.results.some((hit) => hit.observation.id === saved.id)
    );
  } finally {
    knowledgeGraph.kgPruneEnabled = previousPruneEnabled;
    knowledgeGraph.kgSupersededKeepN = previousKeepN;
  }
}

async function validateCommunityReadPathEval(): Promise<{
  defaultOff: boolean;
  disabledNoRegression: boolean;
  enabledNoRegression: boolean;
  fallback: boolean;
  noFifthLane: boolean;
  directKgNoRegression: boolean;
  multiHopNoRegression: boolean;
  summaryBounds: boolean;
  coverageBounds: boolean;
  enrichmentUnavailableFallback: boolean;
}> {
  const store = new Store(':memory:', {
    communitySummaries: {
      ...DEFAULT_COMMUNITY_SUMMARIES_CONFIG,
      enabled: true,
      readPath: {
        ...DEFAULT_COMMUNITY_SUMMARIES_CONFIG.readPath,
        enabled: false,
      },
      summaryMaxChars: 1200,
      maxRetrievalCommunities: 1,
    },
    knowledgeGraph: {
      ...DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
      kgMultiHopEnabled: true,
    },
  });

  try {
    const runtime = store as Store & {
      processSemanticJobs: (input?: { embeddingProvider?: EmbeddingProviderAdapter | null; limit?: number }) => Promise<number>;
      hybridRetrieve: (input: {
        query: string;
        limit?: number;
        project?: string;
        embeddingProvider?: EmbeddingProviderAdapter | null;
      }) => Promise<{
        laneOrder: Array<'sentence' | 'chunk' | 'lexical' | 'kg'>;
        degradedFallback: string[];
        results: Array<{
          observation: { id: number };
          lanes: Array<'sentence' | 'chunk' | 'lexical' | 'kg'>;
          evidence: {
            byLane: Partial<Record<'sentence' | 'chunk' | 'lexical' | 'kg', Array<{
              source: string;
              text?: string;
              community?: { sourceObservationIds: number[]; entityCount: number; tripleCount: number };
            }>>>;
          };
        }>;
      }>;
    };
    const embeddingProvider = makeDeterministicEmbeddingProvider(store);
    const direct = store.saveObservation({
      title: 'Community eval direct KG source',
      type: 'decision',
      project: 'community-eval',
      topic_key: 'eval/community/direct',
      content: 'Sparse source for community read-path no-regression.',
    });
    const downstream = store.saveObservation({
      title: 'Community eval multi-hop downstream',
      type: 'discovery',
      project: 'community-eval',
      topic_key: 'eval/community/multi-hop',
      content: 'Downstream source intentionally relies on structural reachability.',
    });
    const db = store.getDb();
    const orion = db.prepare(
      'INSERT INTO kg_entities (entity_key, entity_type, canonical_name) VALUES (?, ?, ?)'
    ).run('community-eval:orion-service', 'concept', 'orion-service').lastInsertRowid as number;
    const nebula = db.prepare(
      'INSERT INTO kg_entities (entity_key, entity_type, canonical_name) VALUES (?, ?, ?)'
    ).run('community-eval:nebula-cache', 'concept', 'nebula-cache').lastInsertRowid as number;
    const archive = db.prepare(
      'INSERT INTO kg_entities (entity_key, entity_type, canonical_name) VALUES (?, ?, ?)'
    ).run('community-eval:archive-vault', 'concept', 'archive-vault').lastInsertRowid as number;
    db.prepare(
      `INSERT INTO kg_triples (
         subject_entity_id, relation, object_entity_id, source_type, source_id,
         project, topic_key, provenance, confidence, triple_hash
       ) VALUES (?, 'DEPENDS_ON', ?, 'observation', ?, 'community-eval', 'eval/community/direct', 'eval-community:direct', 0.9, ?)`
    ).run(orion, nebula, direct.observation.id, `community-direct:${direct.observation.id}`);
    db.prepare(
      `INSERT INTO kg_triples (
         subject_entity_id, relation, object_entity_id, source_type, source_id,
         project, topic_key, provenance, confidence, triple_hash
       ) VALUES (?, 'DEPENDS_ON', ?, 'observation', ?, 'community-eval', 'eval/community/multi-hop', 'eval-community:multi-hop', 0.9, ?)`
    ).run(nebula, archive, downstream.observation.id, `community-multi-hop:${downstream.observation.id}`);
    await runtime.processSemanticJobs({ limit: 20, embeddingProvider });
    store.rebuildCommunitySummaries({ project: 'community-eval' });

    const disabled = await runtime.hybridRetrieve({
      query: 'orion-service nebula-cache',
      project: 'community-eval',
      limit: TOP_K,
      embeddingProvider,
    });
    const defaultOff = store.config.communitySummaries.readPath.enabled === false
      && disabled.results.some((hit) => hit.observation.id === direct.observation.id)
      && disabled.degradedFallback.every((marker) => !marker.startsWith('kg_communities_'))
      && disabled.results.every((hit) =>
        !(hit.evidence.byLane.kg ?? []).some((candidate) => candidate.source === 'kg_community_summary')
      );

    store.config.communitySummaries.readPath.enabled = true;
    const enabled = await runtime.hybridRetrieve({
      query: 'orion-service nebula-cache',
      project: 'community-eval',
      limit: TOP_K,
      embeddingProvider,
    });
    const directDisabledRank = disabled.results.findIndex((hit) => hit.observation.id === direct.observation.id);
    const directEnabledRank = enabled.results.findIndex((hit) => hit.observation.id === direct.observation.id);
    const enabledKgCandidates = enabled.results.flatMap((hit) => hit.evidence.byLane.kg ?? []);
    const communityCandidates = enabledKgCandidates.filter((candidate) => candidate.source === 'kg_community_summary');
    const directKgNoRegression = enabledKgCandidates.some((candidate) => candidate.source === 'kg_triples');
    const enabledNoRegression = directEnabledRank >= 0 && directDisabledRank >= 0 && directEnabledRank <= directDisabledRank;
    const disabledNoRegression = directDisabledRank >= 0;
    const noFifthLane = enabled.laneOrder.join('|') === 'sentence|kg|chunk|lexical'
      && enabled.results.every((hit) => !hit.lanes.map(String).includes('community'));

    store.config.communitySummaries.readPath.enabled = false;
    const multiHopBaseline = await runtime.hybridRetrieve({
      query: 'orion-service',
      project: 'community-eval',
      limit: TOP_K,
      embeddingProvider,
    });
    store.config.communitySummaries.readPath.enabled = true;
    const multiHopEnabled = await runtime.hybridRetrieve({
      query: 'orion-service',
      project: 'community-eval',
      limit: TOP_K,
      embeddingProvider,
    });
    const baselineMultiHop = multiHopBaseline.results.some((hit) => hit.observation.id === downstream.observation.id)
      && multiHopBaseline.results.some((hit) =>
        (hit.evidence.byLane.kg ?? []).some((candidate) => candidate.source === 'kg_multi_hop')
      );
    const enabledMultiHop = multiHopEnabled.results.some((hit) => hit.observation.id === downstream.observation.id)
      && multiHopEnabled.results.some((hit) =>
        (hit.evidence.byLane.kg ?? []).some((candidate) => candidate.source === 'kg_multi_hop')
      );
    const multiHopNoRegression = baselineMultiHop && enabledMultiHop;

    const bounded = store.getCommunitySummariesForRetrieval({
      project: 'community-eval',
      limit: 99,
      maxChars: 80,
    });
    const summaryBounds = bounded.candidates.length <= 1
      && bounded.candidates.every((candidate) => candidate.summary_text.length <= 80)
      && communityCandidates.every((candidate) => (candidate.text?.length ?? 0) <= 1200);
    const coverageBounds = bounded.candidates.every((candidate) => candidate.source_observation_ids.length <= 12)
      && communityCandidates.every((candidate) => (candidate.community?.sourceObservationIds.length ?? 0) <= 12)
      && communityCandidates.every((candidate) =>
        (candidate.community?.entityCount ?? 0) > 0 && (candidate.community?.tripleCount ?? 0) > 0
      );

    const missing = await runtime.hybridRetrieve({
      query: 'orion-service',
      project: 'community-missing-eval',
      limit: TOP_K,
      embeddingProvider,
    });
    store.markCommunitySummariesStale('community-eval', 'eval_stale');
    const stale = await runtime.hybridRetrieve({
      query: 'orion-service nebula-cache',
      project: 'community-eval',
      limit: TOP_K,
      embeddingProvider,
    });
    store.rebuildCommunitySummaries({ project: 'community-eval' });
    store.config.communitySummaries.algorithm = 'louvain';
    store.rebuildCommunitySummaries({ project: 'community-eval' });
    const degraded = await runtime.hybridRetrieve({
      query: 'orion-service nebula-cache',
      project: 'community-eval',
      limit: TOP_K,
      embeddingProvider,
    });
    store.config.communitySummaries.algorithm = 'connected_components';
    store.rebuildCommunitySummaries({ project: 'community-eval' });
    store.getDb().exec(`
      CREATE TRIGGER community_eval_fail
      BEFORE INSERT ON kg_communities
      BEGIN
        SELECT RAISE(FAIL, 'forced community eval failure');
      END;
    `);
    store.rebuildCommunitySummaries({ project: 'community-eval' });
    const failed = await runtime.hybridRetrieve({
      query: 'orion-service nebula-cache',
      project: 'community-eval',
      limit: TOP_K,
      embeddingProvider,
    });
    const fallback = missing.degradedFallback.includes('kg_communities_missing')
      && stale.degradedFallback.includes('kg_communities_stale')
      && degraded.degradedFallback.includes('kg_communities_degraded')
      && failed.degradedFallback.includes('kg_communities_failed')
      && [missing, stale, degraded, failed].every((result) => result.results.length >= 0);

    store.getDb().exec('DROP TRIGGER community_eval_fail');
    store.config.communitySummaries.enrichment.enabled = true;
    const enrichedUnavailableRebuild = store.rebuildCommunitySummaries({ project: 'community-eval' });
    const enrichmentUnavailableRetrieval = store.getCommunitySummariesForRetrieval({
      project: 'community-eval',
      limit: 1,
      maxChars: 1200,
    });
    const enrichmentUnavailableFallback = enrichedUnavailableRebuild.status === 'committed'
      && enrichedUnavailableRebuild.freshness === 'degraded'
      && enrichedUnavailableRebuild.degraded_reasons.includes('enrichment_unavailable')
      && enrichmentUnavailableRetrieval.state === 'degraded'
      && enrichmentUnavailableRetrieval.degraded_reasons.includes('enrichment_unavailable')
      && enrichmentUnavailableRetrieval.candidates.length > 0
      && enrichmentUnavailableRetrieval.candidates.every((candidate) =>
        candidate.summary_text.length > 0
        && candidate.degraded
        && candidate.degraded_reasons.includes('enrichment_unavailable')
      );

    return {
      defaultOff,
      disabledNoRegression,
      enabledNoRegression,
      fallback,
      noFifthLane,
      directKgNoRegression,
      multiHopNoRegression,
      summaryBounds,
      coverageBounds,
      enrichmentUnavailableFallback,
    };
  } finally {
    store.close();
  }
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
            primary: { lane: 'sentence' | 'chunk' | 'lexical' | 'kg'; source: string; text: string; chunkKey?: string | null; sentenceKey?: string | null; kg?: { provenance: string; superseded?: boolean } };
            promotedParent?: { chunkKey: string; text?: string };
            byLane: Partial<Record<'sentence' | 'chunk' | 'lexical' | 'kg', Array<{ source: string; text?: string; kg?: { provenance?: string; superseded?: boolean } }>>>;
          };
        }>;
        pending: boolean;
        semanticInputs: Array<{ source: 'raw_query' | 'hyde_answer'; text: string }>;
      }>;
    };
    const seededObservationCount = FIXTURES.length + NON_SYNTHETIC_FIXTURES.length + SUPERSESSION_SIGNAL_OBSERVATIONS + noiseCount;
    await runtime.processSemanticJobs({ limit: seededObservationCount * 4 + 20, embeddingProvider });

    const maintenanceDuplicate = await validateMaintenanceDuplicateSuppression(store, runtime, embeddingProvider);
    const maintenanceReflection = await validateMaintenanceReflection(store, runtime, embeddingProvider);
    const maintenanceDecay = await validateMaintenanceDecay(store, runtime, embeddingProvider);
    const maintenanceExportImportRegeneration = await validateMaintenanceExportImportRegeneration();
    const communityReadPath = await validateCommunityReadPathEval();

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
    const multiHopId = idsByKey.get('kg-multi-hop');
    if (multiHopId) {
      seedGraphFactTriple({
        store,
        observationId: multiHopId,
        subject: 'zephyrcache',
        relation: 'DEPENDS_ON',
        object: 'quiet-bridge-store',
        project: 'graph-project',
        topicKey: 'retrieval/kg-multi-hop',
        provenance: 'eval-fixture:kg-multi-hop',
        tripleHash: `kg-multi-hop:${multiHopId}:DEPENDS_ON:1`,
      });
    }
    const multiHopDistractorId = idsByKey.get('kg-multi-hop-distractor');
    if (multiHopDistractorId) {
      seedGraphFactTriple({
        store,
        observationId: multiHopDistractorId,
        subject: 'zephyrcache',
        relation: 'MENTIONS',
        object: 'metadata-only-distractor',
        project: 'graph-project',
        topicKey: 'retrieval/kg-multi-hop-distractor',
        provenance: 'eval-fixture:kg-multi-hop-distractor',
        tripleHash: `kg-multi-hop-distractor:${multiHopDistractorId}:MENTIONS:1`,
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
    const supersessionNoRegressionChecks: boolean[] = [];
    const supersessionFlagOffChecks: boolean[] = [];
    const kgPruneRetentionChecks: boolean[] = [];
    const kgPruneNoRegressionChecks: boolean[] = [];
    const maintenanceNoRegressionChecks: boolean[] = [];
    const communityMultiHopNoRegressionChecks: boolean[] = [];
    let defaultsCapture: RetrievalEvalSummary['retrieval_defaults'] | null = null;

    const cases: RetrievalEvalCaseResult[] = [];
    const setKgMultiHopEnabled = (enabled: boolean): void => {
      if (store.config.knowledgeGraph) {
        store.config.knowledgeGraph.kgMultiHopEnabled = enabled;
      }
    };
    const setKgSupersedeEnabled = (enabled: boolean): void => {
      if (store.config.knowledgeGraph) {
        store.config.knowledgeGraph.kgSupersedeEnabled = enabled;
      }
    };
    const setKgPruneEnabled = (enabled: boolean): void => {
      if (store.config.knowledgeGraph) {
        store.config.knowledgeGraph.kgPruneEnabled = enabled;
      }
    };
    const setMaintenanceReadPathEnabled = (enabled: boolean): void => {
      store.config.maintenance.readPath.enabled = enabled;
    };
    for (const evalCase of CASES) {
      const expectedId = idsByKey.get(evalCase.expectedKey);
      const expected = [...FIXTURES, ...NON_SYNTHETIC_FIXTURES].find((fixture) => fixture.key === evalCase.expectedKey);
      setKgSupersedeEnabled(true);
      setKgMultiHopEnabled(false);
      setMaintenanceReadPathEnabled(false);
      const rawBaseline = await runtime.hybridRetrieve({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
        embeddingProvider,
      });
      const hydeBaseline = await runtime.hybridRetrieve({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
        embeddingProvider,
        hyde: { enabled: true, mode: 'success', answer: evalCase.hydeAnswer ?? `Hypothetical answer for ${evalCase.query}` },
      });
      setMaintenanceReadPathEnabled(true);
      setKgSupersedeEnabled(false);
      setKgMultiHopEnabled(true);
      const supersedeOffHyde = await runtime.hybridRetrieve({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
        embeddingProvider,
        hyde: { enabled: true, mode: 'success', answer: evalCase.hydeAnswer ?? `Hypothetical answer for ${evalCase.query}` },
      });
      setKgSupersedeEnabled(true);
      setKgMultiHopEnabled(true);
      setKgPruneEnabled(false);
      const pruneOffHyde = await runtime.hybridRetrieve({
        query: evalCase.query,
        project: evalCase.project,
        limit: evalCase.limit ?? TOP_K,
        embeddingProvider,
        hyde: { enabled: true, mode: 'success', answer: evalCase.hydeAnswer ?? `Hypothetical answer for ${evalCase.query}` },
      });
      setKgPruneEnabled(true);
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
      let communityEnabledHyde: Awaited<ReturnType<typeof runtime.hybridRetrieve>> | null = null;
      if (evalCase.expectedKey === 'kg-multi-hop') {
        const previousCommunityReadPath = store.config.communitySummaries.readPath.enabled;
        store.config.communitySummaries.readPath.enabled = true;
        communityEnabledHyde = await runtime.hybridRetrieve({
          query: evalCase.query,
          project: evalCase.project,
          limit: evalCase.limit ?? TOP_K,
          embeddingProvider,
          hyde: { enabled: true, mode: 'success', answer: evalCase.hydeAnswer ?? `Hypothetical answer for ${evalCase.query}` },
        });
        store.config.communitySummaries.readPath.enabled = previousCommunityReadPath;
      }
      const rawRankIndex = raw.results.findIndex((hit) => hit.observation.id === expectedId);
      const hydeRankIndex = hyde.results.findIndex((hit) => hit.observation.id === expectedId);
      const baselineHydeRankIndex = hydeBaseline.results.findIndex((hit) => hit.observation.id === expectedId);
      const supersedeOffHydeRankIndex = supersedeOffHyde.results.findIndex((hit) => hit.observation.id === expectedId);
      const pruneOffHydeRankIndex = pruneOffHyde.results.findIndex((hit) => hit.observation.id === expectedId);
      if (pruneOffHydeRankIndex === -1) {
        throw new Error(`kg pruning OFF eval failed in case "${evalCase.name}"`);
      }
      if (evalCase.expectedKey !== 'kg-multi-hop') {
        if (baselineHydeRankIndex === -1) {
          throw new Error(`maintenance disabled baseline eval failed in case "${evalCase.name}"`);
        }
        if (hydeRankIndex === -1 || hydeRankIndex > baselineHydeRankIndex) {
          throw new Error(`maintenance enabled regression in eval case "${evalCase.name}"`);
        }
        maintenanceNoRegressionChecks.push(true);
      }
      if (hydeRankIndex === -1 || hydeRankIndex > pruneOffHydeRankIndex) {
        throw new Error(`kg pruning ON regression in eval case "${evalCase.name}"`);
      }
      kgPruneNoRegressionChecks.push(true);
      if (evalCase.expectedKey !== 'kg-supersession') {
        if (supersedeOffHydeRankIndex === -1) {
          throw new Error(`kg supersession OFF eval failed in case "${evalCase.name}"`);
        }
        if (hydeRankIndex === -1 || hydeRankIndex > supersedeOffHydeRankIndex) {
          throw new Error(`kg supersession ON regression in eval case "${evalCase.name}"`);
        }
        supersessionNoRegressionChecks.push(true);
      }
      if (evalCase.expectedKey !== 'kg-multi-hop' && baselineHydeRankIndex >= 0) {
        if (hydeRankIndex === -1 || hydeRankIndex > baselineHydeRankIndex) {
          throw new Error(`kg multi-hop regression in eval case "${evalCase.name}"`);
        }
      }
      if (evalCase.expectedKey === 'kg-multi-hop') {
        const baselineMultiHop = hydeBaseline.results.some((hit) =>
          hit.evidence.byLane.kg?.some((candidate) => candidate.source === 'kg_multi_hop')
        );
        const onHit = hydeRankIndex >= 0 ? hyde.results[hydeRankIndex] : undefined;
        const hasMultiHopEvidence = onHit?.evidence.byLane.kg?.some((candidate) => candidate.source === 'kg_multi_hop') ?? false;
        if (baselineMultiHop || !hasMultiHopEvidence) {
          throw new Error('kg multi-hop eval did not isolate ON-only multi-hop evidence');
        }
        const communityEnabledRankIndex = communityEnabledHyde?.results.findIndex((hit) => hit.observation.id === expectedId) ?? -1;
        const communityEnabledHit = communityEnabledRankIndex >= 0
          ? communityEnabledHyde?.results[communityEnabledRankIndex]
          : undefined;
        communityMultiHopNoRegressionChecks.push(
          communityEnabledRankIndex >= 0
          && communityEnabledRankIndex <= hydeRankIndex
          && (communityEnabledHit?.evidence.byLane.kg?.some((candidate) => candidate.source === 'kg_multi_hop') ?? false)
        );
      }
      if (evalCase.expectedKey === 'kg-supersession') {
        const supersessionHit = hydeRankIndex >= 0 ? hyde.results[hydeRankIndex] : undefined;
        const kgCandidates = supersessionHit?.evidence.byLane.kg ?? [];
        const currentCandidate = kgCandidates.find((candidate) =>
          candidate.source === 'kg_triples' && 'text' in candidate && String(candidate.text).includes('Valkey cache')
        );
        const supersededCandidate = kgCandidates.find((candidate) =>
          candidate.source === 'kg_triples' && 'text' in candidate && String(candidate.text).includes('Redis cache')
        );
        if (!currentCandidate || !supersededCandidate || !supersededCandidate.kg?.superseded) {
          throw new Error('supersession eval did not retain and flag the superseded KG fact');
        }
      }
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
    const flagOffBehaviorOk = await validateSupersessionFlagOffBehavior();
    if (!flagOffBehaviorOk) {
      throw new Error('kg supersession flag-off eval retained or flagged stale superseded history');
    }
    supersessionFlagOffChecks.push(flagOffBehaviorOk);
    kgPruneRetentionChecks.push(await validateKgPruneRetentionCase(store, runtime, embeddingProvider));

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
        signal_observations: FIXTURES.length + SUPERSESSION_SIGNAL_OBSERVATIONS,
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
        supersession_no_regression_rate: ratio(countTrue(supersessionNoRegressionChecks), supersessionNoRegressionChecks.length),
        supersession_flag_off_rate: ratio(countTrue(supersessionFlagOffChecks), supersessionFlagOffChecks.length),
        kg_prune_retention_rate: ratio(countTrue(kgPruneRetentionChecks), kgPruneRetentionChecks.length),
        kg_prune_no_regression_rate: ratio(countTrue(kgPruneNoRegressionChecks), kgPruneNoRegressionChecks.length),
        maintenance_duplicate_suppression_rate: maintenanceDuplicate.suppression ? 1 : 0,
        maintenance_source_reachability_rate: maintenanceDuplicate.sourceReachability ? 1 : 0,
        maintenance_reflection_quality_rate: maintenanceReflection.quality ? 1 : 0,
        maintenance_reflection_idempotency_rate: maintenanceReflection.idempotency ? 1 : 0,
        maintenance_decay_current_fact_rate: maintenanceDecay.currentFact ? 1 : 0,
        maintenance_decay_reachability_rate: maintenanceDecay.reachability ? 1 : 0,
        maintenance_no_regression_rate: ratio(countTrue(maintenanceNoRegressionChecks), maintenanceNoRegressionChecks.length),
        maintenance_export_import_regeneration_rate: maintenanceExportImportRegeneration ? 1 : 0,
        community_read_path_default_off_rate: communityReadPath.defaultOff ? 1 : 0,
        community_disabled_no_regression_rate: communityReadPath.disabledNoRegression ? 1 : 0,
        community_enabled_no_regression_rate: communityReadPath.enabledNoRegression ? 1 : 0,
        community_fallback_rate: communityReadPath.fallback ? 1 : 0,
        community_no_fifth_lane_rate: communityReadPath.noFifthLane ? 1 : 0,
        community_direct_kg_no_regression_rate: communityReadPath.directKgNoRegression ? 1 : 0,
        community_multi_hop_no_regression_rate: ratio(countTrue(communityMultiHopNoRegressionChecks), communityMultiHopNoRegressionChecks.length),
        community_summary_bounds_rate: communityReadPath.summaryBounds ? 1 : 0,
        community_coverage_bounds_rate: communityReadPath.coverageBounds ? 1 : 0,
        community_enrichment_unavailable_fallback_rate: communityReadPath.enrichmentUnavailableFallback ? 1 : 0,
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
