# Design: Community Summaries LazyGraphRAG

## Technical Approach

Add project-scoped, rebuildable community-summary artifacts over the existing consolidated KG. The source graph is only `kg_entities` plus `kg_triples`; `observation_facts` remains legacy-only rollback code and is not read or written by community construction.

The MVP partitions each project's eligible current KG triples with a deterministic connected-components algorithm implemented in TypeScript. Components are ordered by stable content-derived keys, summarized with bounded extractive text from member entities, relations, and source observations, then committed as a coherent project version. Optional Louvain/Leiden-style clustering is deferred until a deterministic, dependency-light Node implementation is validated by evals.

Community evidence is consumed only inside the existing `kg` retrieval lane. It extends `LaneCandidate.source` with a KG sub-source such as `kg_community_summary`, carries compact community metadata, and uses a lower default weight than direct `kg_triples` and `kg_multi_hop` evidence. No MCP tools, retrieval lanes, source memories, KG source rows, or portable export/import version are changed.

## Handoff Hints Consumed

- Config design pins concrete knobs, defaults, schema entries, and default-on/off behavior.
- KG design preserves KG-only source, connected-components fallback, concrete freshness/version fields, deterministic ordering, and no exact-Leiden dependency.
- Store design defines project-level transaction boundaries and stale/failure state transitions while keeping export/import unchanged.
- Retrieval design keeps community evidence inside `kg`, chooses sub-source names/weights/annotations, and excludes global answer synthesis or query-time subquery generation.
- Tools/admin design mirrors existing rebuild/prune CLI and HTTP patterns and preserves the six-tool MCP registry.
- Evals design covers project scoping, fallback states, no fifth lane, and ranking no-regression.

## Architecture Decisions

### Decision: Derived Tables and Project Run State
**Choice**: Add four derived tables through idempotent schema SQL and migrations:

- `kg_community_runs`: one row per rebuild attempt, with `run_key`, `project`, `algorithm`, `algorithm_version`, `summary_generator`, `config_hash`, `graph_signature`, `status`, `freshness`, `degraded_reasons_json`, count fields, timestamps, and `replaced_run_id`.
- `kg_communities`: committed community rows keyed by `(project, run_id, community_id)`, with `level`, `community_key`, `summary_text`, `summary_max_chars`, `entity_count`, `triple_count`, `source_observation_count`, `top_entities_json`, `top_relations_json`, `source_observation_ids_json`, `confidence`, `degraded`, `degraded_reasons_json`, `created_at`, `updated_at`.
- `kg_community_members`: entity membership keyed by `(community_row_id, entity_id)`, with `role`, `entity_rank`, and `evidence_count`.
- `kg_community_evidence`: source KG/source evidence keyed by `(community_row_id, triple_id)`, with `source_observation_id`, `relation`, `superseded`, `evidence_rank`, and `evidence_text`.

Readers select only the latest committed fresh run per project unless explicitly inspecting stale/failed state.

**Alternatives considered**: Store summaries as observations; store only JSON blobs; extend `kg_triples`.

**Rationale**: Dedicated tables keep artifacts rebuildable and rollbackable, avoid polluting source memory, support admin inspection and status queries, and preserve export/import version 1.

### Decision: Freshness and Version Model
**Choice**: Compute a deterministic `graph_signature` from eligible project KG rows: sorted `(triple_id, triple_hash, subject_entity_id, relation, object_entity_id, source_id, superseded_at, updated_at)` plus the relevant config hash. A run is fresh when its `graph_signature` matches the current project signature and `status = 'committed'`. Staleness is marked by `Store.markCommunitySummariesStale(project, reason)` after KG-affecting operations and verified again at read time by signature comparison.

State vocabulary: `missing`, `fresh`, `stale`, `rebuilding`, `failed`, `disabled`, `degraded`, `empty`.

**Alternatives considered**: Per-triple triggers; automatic rebuild after every save; mutable version numbers only.

**Rationale**: Signature-based freshness is deterministic, testable, and robust when mutations happen through multiple code paths. Operator-triggered rebuild is the MVP default; stale signaling is required before retrieval treats summaries as fresh.

### Decision: Connected Components as MVP Algorithm
**Choice**: Implement `connected_components_v1` in a new local module with no runtime dependency. It builds an undirected graph from eligible current triples, groups connected entity ids, sorts members by canonical name and id, and derives stable `community_id` as `c_${sha256(project|algorithm|level|sorted entity keys|sorted triple hashes).slice(0,16)}`. Empty projects commit an `empty` run with zero communities.

**Alternatives considered**: Add Louvain package; exact Leiden; hierarchical recursive clustering.

**Rationale**: The specs require offline deterministic operation and a connected-components fallback. Louvain/Leiden can improve cluster quality later, but making them load-bearing creates dependency and reproducibility risk for the MVP.

### Decision: Extractive Summary Construction
**Choice**: Generate `summary_text` deterministically from bounded fields:

- Header sentence from top entity names and relation names.
- Up to `kgCommunitySummaryMaxEvidence` ranked evidence lines from current triples first, then retained superseded triples flagged as historical.
- Top source observations by evidence count, capped by `kgCommunitySourceObservationLimit`.
- Truncation metadata stored as omitted entity/triple/source counts.

Ranking is deterministic: current before superseded, higher confidence, more query-independent evidence count, lower entity/triple id. Confidence is a normalized aggregate of included triple confidence values. `degraded` is true for empty KG, budget truncation, invalid configured algorithm fallback, or optional enrichment failure.

**Alternatives considered**: LLM-only summaries; embedding-based representative selection.

**Rationale**: Extractive summaries satisfy offline and CI behavior, retain provenance, and avoid inventing new claims.

### Decision: Store-Owned Rebuild and Read APIs
**Choice**: Add Store methods and result types in `src/store/types.ts` and `src/store/index.ts`:

- `rebuildCommunitySummaries(input: RebuildCommunitySummariesInput): CommunityRebuildResult`
- `previewCommunitySummaries(input: PreviewCommunitySummariesInput): CommunityPreviewResult`
- `getCommunitySummaryState(input: CommunityStateInput): CommunityStateResult`
- `getCommunitySummariesForRetrieval(input: CommunityRetrievalInput): CommunityRetrievalCandidate[]`
- `markCommunitySummariesStale(project: string | null, reason: string): void`
- `dropCommunitySummaries(input: DropCommunitySummariesInput): DropCommunitySummariesResult`

`rebuildCommunitySummaries` runs in a transaction. It inserts a `running` run, computes a full candidate set, deletes/replaces only the target project's previous derived rows after all candidates succeed, then commits the new run as the latest version. On failure, the previous committed run remains readable and the failed run records `status = 'failed'`.

**Alternatives considered**: Background scheduler; direct SQL from CLI/HTTP.

**Rationale**: The repository is Store-centric. Keeping rebuild/read logic in Store preserves transaction boundaries, testability, and thin CLI/HTTP adapters.

### Decision: Admin Surfaces Only
**Choice**: Add CLI commands:

- `rebuild-communities --project <name>` and `rebuild-communities --all`
- `preview-communities --project <name>` for dry-run bounded output
- `communities-status --project <name>` and `communities-status --all`
- `drop-communities --project <name>` and `drop-communities --all`

Add HTTP routes:

- `POST /communities/rebuild`
- `POST /communities/preview`
- `GET /communities/status?project=...`
- `GET /projects/:project/communities`
- `DELETE /communities`

Update `OPERATION_CATALOG`, `src/http-server.ts`, and `src/http-openapi.ts`. Do not modify `src/tools/index.ts` or register MCP tools.

**Alternatives considered**: Add `mem_project action=communities`; add `mem_communities`.

**Rationale**: Rebuild and inspection are admin operations per P1/P5. Existing `mem_recall` and `mem_project action=summary` may consume compact annotations without contract expansion.

### Decision: KG-Lane Retrieval Integration
**Choice**: Extend `LaneCandidate.source` to include `kg_community_summary` and add optional `community` metadata `{ communityId, runId, freshness, degraded, sourceObservationIds, entityCount, tripleCount }`. `Store.hybridRetrieve` appends community candidates from `getCommunitySummariesForRetrieval` to `queryKnowledgeLane` results when `communitySummaries.readPath.enabled` is true and the state is fresh. Stale/missing/failed states append a compact `degradedFallback` marker such as `kg_communities_stale` when community evidence was applicable, but retrieval still returns baseline lanes.

Default weight is conservative: `kgCommunityWeight = 0.45`, lower than direct KG (`kg` lane weight 0.9 plus candidate scores) and multi-hop (`kgMultiHopWeight` default 0.7). Direct `kg_triples` candidates win ties by source priority: `kg_triples`, `kg_multi_hop`, `kg_community_summary`, then legacy fallback if enabled.

**Alternatives considered**: Fifth `community` lane; answer synthesis; query-time subqueries.

**Rationale**: This preserves the four-lane contract and keeps community summaries as bounded evidence metadata, not GraphRAG global answering.

### Decision: Configuration Defaults
**Choice**: Add `CommunitySummariesConfig` under `ThothConfig.communitySummaries` with persisted JSON key `communitySummaries` and `THOTH_COMMUNITY_*` environment overrides:

- `enabled: true`
- `readPath.enabled: false` for MVP until eval gate passes
- `algorithm: 'connected_components'`
- `advancedAlgorithmFallback: 'connected_components'`
- `summaryMaxChars: 1200`
- `maxCommunitiesPerProject: 200`
- `maxRetrievalCommunities: 3`
- `maxEvidencePerCommunity: 8`
- `sourceObservationLimit: 12`
- `rebuildMaxTriples: 5000`
- `staleBehavior: 'skip'`
- `kgCommunityWeight: 0.45`
- `enrichment.enabled: false`, `timeoutMs: 8000`, `maxCostUsd: 0`, `maxChars: 1200`

Add schema validation in `config.schema.json` with finite minimums and bounded enums. Invalid algorithm resolves to connected components and records degraded state during rebuild.

**Alternatives considered**: Put knobs under `knowledgeGraph`; make read path enabled by default.

**Rationale**: A separate config group isolates derived-artifact lifecycle knobs. Rebuild can be enabled while retrieval contribution remains gated by eval evidence.

## Data Flow

1. Save/update/upsert/delete and graph rebuild/prune paths continue to update `kg_entities` and `kg_triples` through existing Store/indexing logic.
2. After a KG-affecting write commits, Store calls `markCommunitySummariesStale(project, reason)` for the affected project. This updates latest community run freshness without deleting source rows.
3. Operator runs `rebuild-communities --project X` or `POST /communities/rebuild`.
4. Store computes the current KG graph signature for project X, reads eligible KG triples joined to entities and source observations, then partitions with connected components.
5. Extractive summaries are constructed, bounded, and provenance-linked. Optional enrichment is skipped by default; if added later and it fails, deterministic summaries remain committed with degraded metadata.
6. Store transaction commits a new `kg_community_runs` version plus community/member/evidence rows. Previous committed rows remain available for rollback/inspection until explicitly dropped.
7. Retrieval calls `getCommunitySummariesForRetrieval` only when read path is enabled. Fresh summaries become `kg` lane candidates with source `kg_community_summary`; missing/stale/failed state adds degraded markers and falls back to existing retrieval.
8. CLI/HTTP inspection reads `getCommunitySummaryState` and bounded community rows. Portable export/import continues to serialize sessions, observations, and prompts only.

## File Changes

- `src/store/schema.ts`: add `COMMUNITY_SUMMARIES_SQL`, indexes, checks, and include in `SCHEMA_SQL`.
- `src/store/migrations.ts`: idempotently create community tables/indexes; add table/column guards if migration helpers need reuse.
- `src/store/types.ts`: add community config/result/entity types and extend `LaneCandidate.source` metadata types through retrieval imports as needed.
- `src/store/index.ts`: add rebuild, preview, state, stale marking, drop, retrieval read methods; call stale marking from `saveObservation`, `updateObservation`, `deleteObservation`, `rebuildObservationFacts`, `pruneSupersededTriples`, `migrateProject`, and project deletion where applicable.
- `src/retrieval/ranking.ts`: add `kg_community_summary` source, community metadata, and source tie-break priority without adding a lane.
- `src/tools/mem-recall.ts`: render compact community annotations in context output and degraded fallback markers; do not change tool schema.
- `src/tools/project-views.ts`: optionally annotate `formatProjectSummary` with a bounded community section when read path is enabled; leave `formatProjectGraph` as KG ledger.
- `src/config.ts`: add `CommunitySummariesConfig`, defaults, persisted merge, env parsing, and invalid-algorithm fallback.
- `config.schema.json`: add `communitySummaries` object schema.
- `src/cli.ts`: add help text, parser dispatch, and handlers for rebuild/preview/status/drop community commands.
- `src/http-server.ts`: register community HTTP routes.
- `src/http-routes.ts`: add route handlers and operation catalog entries.
- `src/http-openapi.ts`: document community routes and response schemas.
- `src/evals/retrieval.ts`: add community fixture seeding, disabled/enabled no-regression comparison, no fifth lane assertion, stale/degraded checks, and summary bounds metrics.
- Tests: add or extend `tests/store/*.test.ts`, `tests/config.test.ts`, `tests/cli.test.ts`, `tests/http-server.test.ts`, `tests/http-viz.test.ts` or nearest HTTP route tests, `tests/tools/mem-recall.test.ts`, `tests/tools/mem-project.test.ts`, `tests/tools/registry.test.ts`, and `tests/evals/retrieval.test.ts`.

## Interfaces / Contracts

Table status/freshness enums:

- `kg_community_runs.status`: `running | committed | failed`
- `kg_community_runs.freshness`: `fresh | stale | rebuilding | failed | empty | degraded`
- `kg_communities.summary_generator`: `extractive_v1` initially
- `kg_community_runs.algorithm`: `connected_components_v1` initially

Store result shapes:

```ts
type CommunityState = 'disabled' | 'missing' | 'fresh' | 'stale' | 'rebuilding' | 'failed' | 'empty' | 'degraded';

interface CommunityRebuildResult {
  project: string | null;
  run_id: number;
  status: 'committed' | 'failed';
  freshness: CommunityState;
  algorithm: 'connected_components';
  graph_signature: string | null;
  communities_created: number;
  entities_scanned: number;
  triples_scanned: number;
  source_observations_scanned: number;
  degraded_reasons: string[];
}
```

Retrieval contract:

- Lane set remains exactly `sentence`, `chunk`, `lexical`, `kg`.
- Community evidence uses `lane: 'kg'`, `source: 'kg_community_summary'`, bounded `text`, and optional `community` metadata.
- `mem_recall` compact header may render `[kg/kg_community_summary] ... community=c_<id> freshness=fresh coverage=obs:N triples:M degraded=no`.
- Stale or missing summaries never rank as fresh evidence.

Export/import contract:

- `ExportData.version` remains `1`.
- Community tables are excluded from portable export/import and sync payload correctness.
- Imported source memories can rebuild KG then communities later through admin workflows.

## Testing Strategy

- Store unit tests with in-memory SQLite:
  - schema/migration creates community tables idempotently.
  - connected-components rebuild is deterministic for identical KG fixtures.
  - project scoping excludes other projects.
  - empty KG commits empty/degraded state without throwing.
  - failed rebuild preserves previous committed version and records failed state.
  - repeated rebuild converges without duplicate communities/members/evidence.
  - KG mutation marks state stale.
  - drop/rollback deletes only derived rows.
  - export/import version and payload omit community artifacts.
- Retrieval tests:
  - community source appears as `lane: 'kg'` and no fifth lane exists.
  - direct `kg_triples` outranks otherwise-equal `kg_community_summary`.
  - stale/missing/disabled/failed summaries fall back to baseline and signal degraded state.
  - output bounds and source observation coverage metadata are reported.
- Config tests:
  - persisted config is backfilled.
  - `THOTH_COMMUNITY_*` env overrides persisted values.
  - invalid algorithm falls back to connected components.
  - offline defaults require no provider.
- CLI/HTTP tests:
  - scope validation mirrors `rebuild-graph` and `prune-graph`.
  - rebuild/preview/status/drop return bounded counts.
  - operation catalog and OpenAPI include CLI/HTTP admin routes.
  - MCP registry remains exactly six tools.
- Eval tests:
  - deterministic community construction fixture with multiple projects/components.
  - enabled vs disabled retrieval no-regression for direct KG, multi-hop, supersession, pruning, and maintenance cases.
  - stale/degraded/enrichment-failed states keep baseline recall available.

Verification commands planned:

- `pnpm exec vitest run tests/store/community-summaries.test.ts`
- `pnpm exec vitest run tests/config.test.ts tests/cli.test.ts tests/http-server.test.ts tests/tools/mem-recall.test.ts tests/tools/registry.test.ts tests/evals/retrieval.test.ts`
- `pnpm run build`
- `pnpm test`

## Migration / Rollout

1. Ship additive schema and config with community rebuild enabled but retrieval read path disabled by default.
2. Operators can run preview/rebuild and inspect status through CLI/HTTP. Empty/stale/failed/degraded states are explicit.
3. Retrieval integration is present behind `communitySummaries.readPath.enabled`. Evals must pass before considering default-on retrieval contribution.
4. Rollback is config-first: set `THOTH_COMMUNITY_ENABLED=false` or `communitySummaries.readPath.enabled=false` to ignore derived artifacts.
5. Full rollback can drop community rows through `drop-communities`; source observations, sessions, prompts, `kg_entities`, and current `kg_triples` remain intact.
6. Export/import remains version 1 and source-memory focused. After import, operators rebuild KG and then communities if desired.

## Open Questions

- Whether to keep previous committed community versions indefinitely or cap old runs with a later admin prune policy. MVP can keep a small fixed number, such as 3 committed runs per project, if tests prove rollback remains clear.
- Whether `formatProjectSummary` should consume community summaries immediately when read path is enabled, or wait until retrieval eval gates pass. Default design keeps read path disabled.
- Whether optional enrichment should reuse `kgLlm` config or receive a future dedicated provider contract. MVP stores enrichment fields but does not implement remote enrichment.
- Whether a Louvain-style dependency is worth adding after MVP evals show connected components are too coarse.

## Constitution Check

- P1 Compact MCP surface: Pass. No MCP tools or actions are added; community rebuild/inspection is CLI/HTTP only.
- P2 Deterministic-first retrieval: Pass. Connected-components and extractive summaries work offline; retrieval falls back with explicit degraded markers.
- P3 Harness-agnostic memory contract: Pass. Schema changes are additive, source memory/export contracts remain plain SQLite/JSON, and no harness-specific fields are introduced.
- P4 Token-efficient bounded recall outputs: Pass. Summary/evidence/result budgets are finite by default, annotations are compact, and stale/missing states avoid unbounded fallback dumps.
- P5 Stable public contract and deprecation discipline: Pass. Existing MCP tools, CLI/HTTP names, and export version are preserved; new CLI/HTTP admin routes are additive.
