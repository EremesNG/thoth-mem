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
    evidence_lineage_coverage: number;
    stale_result_rate: number;
    kg_provenance_rate: number;
    lane_truth_rate: number;
    facts_source_rate: number;
  };
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

function makeDeterministicEmbeddingProvider(store: Store): EmbeddingProviderAdapter {
  const dimensions = Math.max(8, store.config.embedding?.dimensions ?? 384);
  const vectorFromText = (text: string): number[] => {
    const vector = new Array<number>(dimensions).fill(0);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = normalized.split(/\s+/).filter((token) => token.length > 0);
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
    result.result_count,
    result.query,
  ]);

  return [
    '# Retrieval Eval Baseline (Hybrid Retrieval)',
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
    `| Pending Rate | ${formatPercent(summary.hybrid.pending_rate)} |`,
    `| Degraded Rate | ${formatPercent(summary.hybrid.degraded_rate)} |`,
    `| Lexical Prefix Hit Rate | ${formatPercent(summary.hybrid.lexical_prefix_hit_rate)} |`,
    `| Raw Semantic Hit Rate | ${formatPercent(summary.hybrid.raw_semantic_hit_rate)} |`,
    `| HyDE Semantic Hit Rate | ${formatPercent(summary.hybrid.hyde_semantic_hit_rate)} |`,
    `| Sentence Primary Rate | ${formatPercent(summary.hybrid.sentence_primary_rate)} |`,
    `| Promoted Parent Rate | ${formatPercent(summary.hybrid.promoted_parent_rate)} |`,
    `| KG Enrichment Rate | ${formatPercent(summary.hybrid.kg_hit_rate)} |`,
    `| Evidence Lineage Coverage | ${formatPercent(summary.hybrid.evidence_lineage_coverage)} |`,
    `| Stale Result Prevention Rate | ${formatPercent(summary.hybrid.stale_result_rate)} |`,
    `| KG Provenance Rate | ${formatPercent(summary.hybrid.kg_provenance_rate)} |`,
    `| Lane Truth Rate | ${formatPercent(summary.hybrid.lane_truth_rate)} |`,
    `| Facts Source Coverage Rate | ${formatPercent(summary.hybrid.facts_source_rate)} |`,
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
    '| Status | Case | Rank | Results | Query |',
    '| --- | --- | ---: | ---: | --- |',
    ...caseRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export async function runRetrievalEval(): Promise<RetrievalEvalReport> {
  const store = new Store(':memory:');

  try {
    const idsByKey = seedEvalStore(store);
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
          observation: { id: number };
          evidence: {
            primary: { lane: 'sentence' | 'chunk' | 'lexical' | 'kg'; source: string; chunkKey?: string | null; sentenceKey?: string | null; kg?: { provenance: string } };
            promotedParent?: { chunkKey: string };
            byLane: Partial<Record<'sentence' | 'chunk' | 'lexical' | 'kg', Array<{ source: string; kg?: { provenance?: string } }>>>;
          };
        }>;
        pending: boolean;
        semanticInputs: Array<{ source: 'raw_query' | 'hyde_answer'; text: string }>;
      }>;
    };
    await runtime.processSemanticJobs({ limit: 200, embeddingProvider });

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
      store.getDb().prepare(
        'INSERT INTO observation_facts (observation_id, subject, relation, object, project, topic_key, type) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(graphLiteId, 'graph lite facts', 'supports', 'structured facts before vector embeddings', 'memory-project', 'retrieval/graph-lite-derived-facts', 'discovery');
    }

    const pendingCases: boolean[] = [];
    const degradedCases: boolean[] = [];
    const lexicalPrefixHits: boolean[] = [];
    const rawSemanticHits: boolean[] = [];
    const hydeSemanticHits: boolean[] = [];
    const sentencePrimaryHits: boolean[] = [];
    const promotedParentHits: boolean[] = [];
    const kgHits: boolean[] = [];
    const lineageCoverageHits: boolean[] = [];
    const laneTruthChecks: boolean[] = [];
    const kgProvenanceChecks: boolean[] = [];
    const factsSourceChecks: boolean[] = [];
    let defaultsCapture: RetrievalEvalSummary['retrieval_defaults'] | null = null;

    const cases: RetrievalEvalCaseResult[] = [];
    for (const evalCase of CASES) {
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
        hyde: { enabled: true, mode: 'success', answer: `Hypothetical answer for ${evalCase.query}` },
      });
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
      laneTruthChecks.push(raw.results.every((hit) => {
        const laneEvidence = hit.evidence.byLane[hit.evidence.primary.lane];
        if (!laneEvidence || laneEvidence.length === 0) return false;
        return laneEvidence.some((candidate) => candidate.source === hit.evidence.primary.source);
      }));
      const kgCandidates = raw.results.flatMap((hit) => hit.evidence.byLane.kg ?? []);
      const tripleCandidates = kgCandidates.filter((candidate) => candidate.source === 'kg_triples');
      const factCandidates = kgCandidates.filter((candidate) => candidate.source === 'observation_facts');
      kgProvenanceChecks.push(tripleCandidates.length > 0 && tripleCandidates.every((candidate) => typeof candidate.kg?.provenance === 'string' && candidate.kg.provenance.length > 0));
      factsSourceChecks.push(tripleCandidates.length > 0 && factCandidates.length > 0);
      lineageCoverageHits.push(raw.results.some((hit) => {
        const primary = hit.evidence.primary;
        return Boolean(primary.chunkKey || primary.sentenceKey || primary.kg?.provenance || primary.source);
      }));

      cases.push({
        name: evalCase.name,
        query: evalCase.query,
        expected_title: expected?.observation.title ?? evalCase.expectedKey,
        found: rankIndex >= 0,
        rank: rankIndex >= 0 ? rankIndex + 1 : null,
        result_count: results.length,
        context_chars: context.length,
        full_content_chars: preview.length,
      });
    }

    const found = cases.filter((result) => result.found);
    const reciprocalRankSum = cases.reduce((sum, result) => sum + (result.rank ? 1 / result.rank : 0), 0);
    const fullChars = cases.reduce((sum, result) => sum + result.full_content_chars, 0);
    const contextChars = cases.reduce((sum, result) => sum + result.context_chars, 0);
    const countTrue = (items: Array<boolean | number>): number => items.filter(Boolean).length;
    const totalHybridCases = pendingCases.length === 0 ? cases.length : pendingCases.length;
    const summary: RetrievalEvalSummary = {
      total_cases: cases.length,
      recall_at_1: ratio(cases.filter((result) => result.rank === 1).length, cases.length),
      recall_at_k: ratio(found.length, cases.length),
      mean_reciprocal_rank: ratio(reciprocalRankSum, cases.length),
      context_compression: fullChars === 0 ? 0 : Number((1 - contextChars / fullChars).toFixed(3)),
      retrieval_defaults: defaultsCapture ?? {
        lane_order: 'sentence > chunk > lexical',
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
        evidence_lineage_coverage: ratio(countTrue(lineageCoverageHits), totalHybridCases),
        stale_result_rate: ratio(staleRuns.length - staleLeaks, staleRuns.length),
        kg_provenance_rate: ratio(countTrue(kgProvenanceChecks), totalHybridCases),
        lane_truth_rate: ratio(countTrue(laneTruthChecks), totalHybridCases),
        facts_source_rate: ratio(countTrue(factsSourceChecks), totalHybridCases),
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
