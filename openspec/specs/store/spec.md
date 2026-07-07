# Delta for Store

## ADDED Requirements
### Requirement: sqlite-vec MUST Be a Required Semantic Dependency
The store runtime MUST attempt to load sqlite-vec into the active better-sqlite3 connection and treat semantic lane availability as dependent on successful extension/table readiness.

#### Scenario: sqlite-vec load succeeds
- GIVEN a supported runtime with sqlite-vec installed
- WHEN store initializes semantic retrieval capabilities
- THEN sqlite-vec MUST be loaded against the active database connection

#### Scenario: sqlite-vec load fails
- GIVEN sqlite-vec cannot be loaded
- WHEN store initializes
- THEN semantic lanes MUST be marked degraded while lexical and graph/KG paths remain available

### Requirement: vec0 Virtual Tables MUST Store Sentence and Chunk Embeddings
The schema MUST include sqlite-vec `vec0` virtual tables for sentence embeddings and chunk embeddings with dimensions aligned to active embedding metadata.

#### Scenario: vec0 tables exist for both lanes
- GIVEN semantic schema migrations run
- WHEN table existence is verified
- THEN both sentence and chunk vec0 tables MUST exist for KNN queries

### Requirement: Deterministic Rowid Mapping and Lineage MUST Be Persisted
The store MUST persist deterministic mapping between logical sentence/chunk identities and vec0 `rowid`, including provenance lineage metadata.

#### Scenario: Rowid mapping is reproducible
- GIVEN the same source sentence/chunk lineage
- WHEN indexing runs repeatedly or after restart
- THEN the mapped rowid and lineage association MUST converge deterministically

### Requirement: Semantic Index Staleness MUST Be Detectable
The store MUST detect stale semantic indexes by comparing persisted index metadata hash with active embedding config hash.

#### Scenario: Hash mismatch marks stale
- GIVEN persisted semantic metadata hash differs from active hash
- WHEN staleness is evaluated
- THEN semantic index state MUST be marked stale and semantic lanes eligible for degraded behavior

### Requirement: Schema Evolution MUST Preserve Existing Lexical and Graph-lite Compatibility
Semantic/KG schema additions MUST preserve existing FTS5 and `observation_facts` functionality.

#### Scenario: Existing retrieval primitives remain functional
- GIVEN semantic and KG migrations have run
- WHEN lexical FTS5 and `observation_facts` retrieval are executed
- THEN they MUST remain functionally available

### Requirement: Store.getContext MUST Accept And Enforce A Max-Output-Chars Budget
`Store.getContext` MUST accept a maximum-output-character budget and MUST enforce
it on the rendered context string before returning, mirroring the budget
discipline already applied elsewhere in the codebase (`mem_recall`
`trimToBudget`, `src/tools/mem-recall.ts:24-29`; `formatProjectGraph` `maxChars`
and `formatContextResults` `maxChars` caps). The budget MUST default from
resolved configuration (`maxContextChars`) and MUST be overridable per call.
Enforcement MUST be deterministic for identical inputs and MUST surface a
shown/omitted (or truncation) indicator in the returned string so the bound is
measured, not merely claimed.

#### Scenario: getContext output never exceeds the budget
- GIVEN recent observations whose full rendering would exceed the supplied
  max-output-chars budget
- WHEN `Store.getContext` renders the context
- THEN the returned string length MUST be less than or equal to the supplied
  budget
- AND the returned string MUST include an indicator of how much was shown versus
  omitted

#### Scenario: getContext budget defaults from config and is overridable
- GIVEN a configured default `maxContextChars`
- WHEN `Store.getContext` is called without an explicit budget
- THEN the configured default MUST be applied
- AND WHEN `Store.getContext` is called with an explicit per-call budget
- THEN the per-call budget MUST take precedence for that call without mutating
  configuration

#### Scenario: getContext unbounded sentinel disables enforcement
- GIVEN the documented unbounded sentinel `0` is supplied as the budget
- WHEN `Store.getContext` renders a large store
- THEN the output MUST NOT be truncated by the budget

### Requirement: formatObservationMarkdown MUST Support A Preview/Truncation Mode
`formatObservationMarkdown` (`src/utils/content.ts:28-38`) MUST support a
preview/truncation rendering mode that emits a bounded preview of `obs.content`
(reusing the existing `truncateForPreview` primitive, `src/utils/content.ts:3-12`,
with a configurable preview length defaulting to 300) instead of the full body.
The preview mode MUST be the mode used by bounded context rendering in
`Store.getContext`. The existing full-content rendering behavior MUST remain
available for callers that explicitly request it, so non-context callers are not
silently changed.

#### Scenario: Preview mode truncates long observation content
- GIVEN an observation whose content exceeds the configured preview length
- WHEN `formatObservationMarkdown` renders it in preview mode
- THEN the emitted block MUST contain a bounded preview of the content, not the
  full body
- AND the block MUST retain the observation header metadata (id, type, title)

#### Scenario: Full mode remains available for explicit callers
- GIVEN a caller that explicitly requests full rendering
- WHEN `formatObservationMarkdown` renders an observation in full mode
- THEN the emitted block MUST contain the complete `obs.content`

### Requirement: Bounded Context Rendering MUST Preserve Existing Section Structure And Escalation
When `Store.getContext` renders bounded output, it MUST preserve the existing
context section structure (recent sessions, recent prompts, recent observations,
and memory stats) and MUST include a pointer directing callers to `mem_get` for
full observation bodies. Bounding MUST reduce the recent-observation content to
previews and trim to budget; it MUST NOT drop the structural sections or the
memory-stats summary that callers depend on.

#### Scenario: Bounded render keeps structure and mem_get pointer
- GIVEN bounded rendering is active in `Store.getContext`
- WHEN the context is rendered for a populated store
- THEN the output MUST still contain the recent-sessions, recent-prompts,
  recent-observations, and memory-stats sections
- AND the output MUST contain a pointer to `mem_get` for retrieving full
  observation content

### Requirement: Store MUST Provide a KG-Backed `ObservationFact` Adapter
The store MUST provide an adapter (`getObservationFactsFromKg`) that produces the
existing `ObservationFact` shape (`id`, `observation_id`, `subject`, `relation`,
`object`, `project`, `topic_key`, `type`, `created_at` — `src/store/types.ts:92`)
from a hybrid source (see CL-4 in the knowledge-graph delta), filtered to
observations that are not soft-deleted (`deleted_at IS NULL`). The adapter MUST
accept the same filter input as the existing `getObservationFacts`
(`ObservationFactsInput`: optional `observation_id`, `project`, `topic_key`) and
MUST apply those filters with the same meaning.

The adapter MUST emit two row groups, unioned, for each in-scope observation:

1. **Content-relation rows** — derived from `kg_triples` (joined to
   `kg_entities` for object canonical names, and to `observations` for `type` and
   the `deleted_at IS NULL` guard), filtered to `source_type = 'observation'` and
   to the four content-section relations
   (`HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED`). Mapping:
   `observation_id ← kg_triples.source_id`;
   `relation ← kg_triples.relation`;
   `object ← kg_entities.canonical_name` (object side);
   `created_at ← kg_triples.created_at`; `id ← kg_triples.id` (stable synthetic
   id).
2. **Synthesized metadata-relation rows** — constructed directly from the
   in-scope `observations` row (NOT from `kg_triples`), reproducing the legacy
   `buildObservationFacts` (`src/store/index.ts:1058-1066`): a `HAS_TYPE` row
   (`object ← observations.type`) always; an `IN_PROJECT` row
   (`object ← observations.project`) when `project` is set; a `HAS_TOPIC_KEY`
   row (`object ← observations.topic_key`) when `topic_key` is set. These rows
   MUST carry a stable synthetic `id`, `observation_id ← observations.id`, and
   `created_at ← observations.created_at`.

For BOTH groups: `subject ← observations.title` (matching the legacy builder,
which set `subject = observation.title` for every fact — preserves
`mem_project action=graph` line rendering, see CL-3); `project`/`topic_key` come
from the `observations` row; `type ← observations.type`. The adapter MUST return
rows in a deterministic order for identical inputs.

#### Scenario: Adapter derives ObservationFact rows from the knowledge graph
- GIVEN observations with deterministic `kg_entities`/`kg_triples` present
- WHEN `getObservationFactsFromKg` is called
- THEN it MUST return `ObservationFact`-shaped rows where content-relation
  (`HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED`) `object` is the joined
  `kg_entities.canonical_name` and `relation` is the `kg_triples.relation`
- AND it MUST also return synthesized `HAS_TYPE`/`IN_PROJECT`/`HAS_TOPIC_KEY`
  rows built from the observation's `type`/`project`/`topic_key`
- AND for every row `subject` is the observation's title, `observation_id` is the
  observation id, and `project`/`topic_key`/`type` follow the mapping above

#### Scenario: Adapter honors the same filters as the legacy reader
- GIVEN KG facts spanning multiple observations, projects, and topic keys
- WHEN `getObservationFactsFromKg` is called with `observation_id`, `project`,
  and/or `topic_key` filters
- THEN only rows matching those filters MUST be returned, with the same filter
  semantics the legacy `getObservationFacts` applied

#### Scenario: Adapter excludes deleted observations and non-observation sources
- GIVEN a soft-deleted observation (`deleted_at` set) and triples whose
  `source_type` is not `'observation'`
- WHEN `getObservationFactsFromKg` is called
- THEN rows for the deleted observation MUST be excluded
- AND triples whose `source_type` is not `'observation'` MUST be excluded

#### Scenario: Adapter output ordering is deterministic
- GIVEN a fixed set of KG facts
- WHEN `getObservationFactsFromKg` is called repeatedly with identical input
- THEN the returned row order MUST be identical across calls

### Requirement: KG-Backed Adapter MUST Preserve `ObservationFact` Consumer Parity
The adapter MUST preserve the `ObservationFact` consumer contract so reader
migration is shape-preserving AND output-preserving (constitution **P3**). The
adapter MUST return the SAME 7-relation set with the SAME labels the legacy
`observation_facts` reader returned (see CL-4 in the knowledge-graph delta), via
a hybrid source:
- For the four content-section relations (`HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`,
  `HAS_LEARNED`) that the ledger/timeline and project-graph readers consume, the
  adapter MUST return the same `relation` and `object` values for the same
  observation content that the legacy `observation_facts` reader returned,
  sourced from `kg_triples`+`kg_entities`.
- For the three metadata-derived relations (`IN_PROJECT`, `HAS_TYPE`,
  `HAS_TOPIC_KEY`), the adapter MUST SYNTHESIZE the rows from the joined
  `observations` columns (`project`, `type`, `topic_key`) — emitting `HAS_TYPE`
  always, `IN_PROJECT` when `project` is set, and `HAS_TOPIC_KEY` when
  `topic_key` is set — reproducing the legacy `buildObservationFacts`
  (`src/store/index.ts:1058-1066`) behavior exactly. These rows MUST NOT be
  read from `kg_triples` and MUST NOT use the extractor's KG-native
  `BELONGS_TO`/`HAS_TOPIC` labels.

Per-observation coverage (which observations contribute facts) MUST match the
legacy reader for the same observations once their KG facts exist.

#### Scenario: Content-section relations match the legacy reader
- GIVEN an observation whose content contains what/why/where/learned sections
- WHEN the adapter returns its facts
- THEN the `HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED` `relation`+`object`
  pairs MUST equal those the legacy `observation_facts` reader produced for the
  same content

#### Scenario: Metadata-derived relations match the legacy labels exactly
- GIVEN an observation with a `type`, a `project`, and a `topic_key`
- WHEN the adapter returns its facts
- THEN it MUST include a `HAS_TYPE` row (object = the observation `type`), an
  `IN_PROJECT` row (object = the `project`), and a `HAS_TOPIC_KEY` row
  (object = the `topic_key`), with `subject` = the observation title
- AND it MUST NOT emit the KG-native `BELONGS_TO`/`HAS_TOPIC` labels or omit
  `HAS_TYPE`
- AND for an observation with no `project`/`topic_key`, only the `HAS_TYPE`
  metadata row MUST be emitted (matching the legacy conditional builder)

#### Scenario: Per-observation coverage matches for the same observations
- GIVEN a set of observations covered in both the legacy table and the KG (after
  backfill)
- WHEN facts are read through the adapter and (pre-removal) through the legacy
  reader
- THEN the set of observations that contribute at least one fact MUST be the same## MODIFIED Requirements

## REMOVED Requirements
### Requirement: Schema Evolution MUST Preserve Existing Lexical and Graph-lite Compatibility
**Reason:** This requirement guaranteed continued `observation_facts`
("graph-lite") functionality alongside FTS5. Because `observation_facts` is
removed by this change, the graph-lite preservation clause is obsolete. It is
replaced by the modified requirement "Schema Evolution MUST Preserve Existing
Lexical Compatibility" above, which preserves FTS5 and the KG-backed graph path
without the removed table.

**Migration:** Graph-lite facts are now derived from `kg_triples`+`kg_entities`
via the KG-backed adapter; lexical FTS5 retrieval is unaffected.

### Requirement: `observation_facts` Table and Indexes MUST Be Removed via Ordered, Reversible Migration
The `observation_facts` table (`src/store/schema.ts:281-292`) and its three
indexes (`idx_observation_facts_observation`/`_project`/`_topic`,
`src/store/schema.ts:350-352`) MUST be removed. The table DDL and index DDL MUST
be removed from the schema definition, and a `DROP TABLE IF EXISTS
observation_facts` migration step MUST be added. The drop MUST be IDEMPOTENT
(safe to run on every startup, using `IF EXISTS`) and MUST execute ONLY as the
final step, after the adapter, reader migration, backfill, and write-suppression
are verified. The cutover MUST be reversible: a flag-guarded cutover (working name
`graphFactsSource`: `legacy` | `kg`, defaulting to the safe value until verified)
MUST allow switching the reader source and write-suppression via configuration
rather than code revert, mirroring the established sentinel/flag rollback pattern;
and after the drop, rollback MUST be achievable by re-adding the idempotent table
+ index DDL (`CREATE TABLE/INDEX IF NOT EXISTS`) and repopulating from
observations, since `observation_facts` content is fully derivable.

> Authored as a `REMOVED` requirement because its primary effect on the store
> contract is the removal of the `observation_facts` table and indexes; the
> migration/rollback clauses define how that removal is performed safely.

#### Scenario: Drop step is idempotent across restarts
- GIVEN the migration that drops `observation_facts` has already run
- WHEN the store initializes again
- THEN the drop step MUST be a safe no-op (`DROP TABLE IF EXISTS`) and MUST NOT
  raise an error

#### Scenario: Drop executes only after prerequisites are verified
- GIVEN the adapter, reader migration, backfill, and write-suppression are in
  place and verified
- WHEN the migration ordering is followed
- THEN the table/index drop MUST be the final step, executed after those
  prerequisites, never before

#### Scenario: Flag-guarded cutover enables rollback without code revert
- GIVEN the `graphFactsSource` cutover flag is supported and the table still
  exists
- WHEN the flag is set to the legacy source
- THEN graph-fact reads MUST come from `observation_facts` and the synchronous
  legacy writer MUST be re-enabled, restoring pre-cutover behavior without a code
  revert
- AND WHEN the flag is set to the KG source
- THEN reads MUST come from the KG-backed adapter and the legacy writer MUST be
  suppressed

#### Scenario: Post-drop rollback restores a derivable table
- GIVEN `observation_facts` has been dropped
- WHEN rollback re-adds the idempotent table + index DDL and runs the rebuild
- THEN the table MUST be recreatable and repopulatable from observations with no
  data loss (because its contents are fully derivable)## MODIFIED Requirements
### Requirement: Schema Evolution MUST Preserve Existing Lexical Compatibility
Semantic/KG schema changes MUST preserve existing FTS5 functionality. The
`observation_facts` table is REMOVED by this change (it is consolidated into
`kg_triples`); schema evolution MUST therefore preserve lexical FTS5 retrieval
and the KG-backed graph path, and MUST NOT require the removed `observation_facts`
table for any retrieval primitive to function.

#### Scenario: Existing retrieval primitives remain functional after removal
- GIVEN semantic and KG migrations have run and `observation_facts` has been
  dropped
- WHEN lexical FTS5 retrieval and KG-backed graph retrieval are executed
- THEN they MUST remain functionally available without referencing
  `observation_facts`

### Requirement: `getObservationFacts` MUST Be Backed by the KG Adapter
`getObservationFacts` (`src/store/index.ts:2969`) MUST be backed by the KG adapter
rather than by a direct `observation_facts` query, so that every indirect consumer
(`getObservatoryLedgerDetail`, `formatProjectGraph`, and the HTTP
`getProjectGraphFacts`) inherits the KG-backed source with no change to its
external output shape. The method MUST continue to accept `ObservationFactsInput`
and return `ObservationFact[]`.

#### Scenario: getObservationFacts returns KG-backed facts
- GIVEN consolidation is complete
- WHEN `getObservationFacts` is called with any supported filter
- THEN it MUST return `ObservationFact[]` derived from `kg_triples`+`kg_entities`
- AND it MUST NOT execute any query against `observation_facts`

#### Scenario: Indirect readers inherit the KG source unchanged
- GIVEN `getObservationFacts` is redirected to the adapter
- WHEN `getObservatoryLedgerDetail`, `formatProjectGraph`, and the HTTP project
  graph fetch render their output
- THEN each MUST produce its established output shape, now sourced from the KG,
  with no per-caller `observation_facts` query

### Requirement: All Direct `observation_facts` Readers MUST Be Migrated to the KG Source
Every direct reader of `observation_facts` MUST be migrated to the KG source:
the `queryKnowledgeLane` fallback branch (`src/store/index.ts:2060-2087`), the
ranking sort tiebreaker (`src/store/index.ts:1785-1789`), the relation-distinct
listing used by the visualization-filters options provider
(`src/store/index.ts:2666-2673`), and the visualization edge rows
(`getVisualizationRows`, `src/store/index.ts:2683-2698`). After migration, the
`queryKnowledgeLane` graph candidates MUST come solely from the `kg_triples`
branch (`src/store/index.ts:2040-2058`), and the ranking tiebreaker MUST no longer
special-case a `'observation_facts'` source (it reduces to score-then-
`observationId`). The relation-distinct listing and `getVisualizationRows` MUST
draw from the KG-backed adapter's `ObservationFact` projection (or an equivalent
view over it) so they expose the SAME full relation vocabulary as today
(constitution **P3**) — i.e. the four content relations from `kg_triples` PLUS
the synthesized `IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY` metadata relations (see
CL-4); they MUST NOT collapse to only the `kg_triples`-native relation labels.

#### Scenario: Knowledge-lane fallback branch is removed
- GIVEN consolidation is complete
- WHEN `queryKnowledgeLane` produces graph candidates
- THEN it MUST emit only `kg_triples`-sourced candidates
- AND it MUST NOT execute the `observation_facts` `factCandidates` query

#### Scenario: Ranking tiebreaker no longer references observation_facts
- GIVEN two graph-enrichment candidates with equal score
- WHEN the ranking sort applies its tiebreaker
- THEN the tiebreaker MUST resolve by `observationId` (score-then-id)
- AND it MUST NOT reference a `'observation_facts'` source

#### Scenario: Relation listing and visualization edges come from the KG
- GIVEN consolidation is complete
- WHEN the visualization-filters relation-distinct listing and
  `getVisualizationRows` produce their output
- THEN the relations and edges MUST be sourced from the KG-backed adapter/view
- AND the relation-distinct listing MUST still expose the full legacy vocabulary
  (content relations plus synthesized `IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY`),
  not only the `kg_triples`-native labels
- AND neither MUST query `observation_facts`

### Requirement: Synchronous `observation_facts` Writer MUST Be Removed
The synchronous `observation_facts` writer (`refreshObservationFacts`,
`src/store/index.ts:1094-1096`, delegating to `replaceObservationFacts`,
`src/store/index.ts:1068-1092`) MUST no longer run on save. Its three call sites
in `saveObservation` (`:1483`), `updateObservation` (`:1632`), and the upsert path
(`:1513`) MUST stop writing `observation_facts`; the consolidated synchronous
deterministic KG write (see the knowledge-graph and indexing deltas) becomes the
single graph writer on save. The unified delete path
(`deleteKnowledgeArtifactsForObservation`, `src/store/index.ts:1118-1121`) MUST
no longer reference `observation_facts` once the table is gone, while continuing
to delete the observation's `kg_triples` by `source_id`.

#### Scenario: Save no longer writes observation_facts
- GIVEN consolidation is complete
- WHEN an observation is saved, updated, or upserted
- THEN no write to `observation_facts` MUST occur
- AND the observation's deterministic graph facts MUST be written to
  `kg_entities`/`kg_triples` synchronously instead

#### Scenario: Delete path cleans KG facts and not the dropped table
- GIVEN an observation with KG facts is deleted
- WHEN `deleteKnowledgeArtifactsForObservation` runs after table removal
- THEN it MUST delete that observation's `kg_triples` by `source_id`
- AND it MUST NOT reference the removed `observation_facts` table

### Requirement: Rebuild Plumbing MUST Rebuild the KG-Backed Graph
`rebuildObservationFacts` (`src/store/index.ts:2998-3019`) MUST rebuild the
KG-backed graph (deterministic `kg_entities`/`kg_triples`) rather than the legacy
`observation_facts` table, so the operator-facing rebuild does not reference a
dropped table and remains the rebuild entry point. It MUST accept the same scope
input it accepts today (optional `project`) and MUST report a meaningful rebuild
result. Both the `rebuild-graph` CLI command and the HTTP `POST /graph/rebuild`
operation MUST continue to work against this KG-backed rebuild (see the indexing
delta).

#### Scenario: Rebuild repopulates the knowledge graph
- GIVEN observations exist (including legacy ones lacking KG facts)
- WHEN the rebuild is invoked (optionally scoped to a project)
- THEN it MUST repopulate deterministic `kg_entities`/`kg_triples` for the
  in-scope observations
- AND it MUST NOT write to `observation_facts`

#### Scenario: Rebuild does not reference the dropped table
- GIVEN `observation_facts` has been dropped
- WHEN the rebuild runs
- THEN it MUST complete without querying or writing `observation_facts`

### Requirement: Portable Export/Import Format MUST Remain Unchanged
Removing `observation_facts` MUST NOT change the portable sync/export format
(constitution **P2**). `exportData` (`src/store/index.ts:3156`, `version: 1`) and
`importData` (`src/store/index.ts:3195`) serialize only
`sessions`/`observations`/`prompts` and MUST continue to do so, never serializing
`observation_facts`, `kg_triples`, or `kg_entities`. The export `version` MUST NOT
change as a result of this consolidation.

#### Scenario: Export shape is unchanged after removal
- GIVEN consolidation and table removal are complete
- WHEN `exportData` produces an export
- THEN the export MUST contain only `sessions`, `observations`, and `prompts`
- AND the export `version` MUST be unchanged from before the consolidation

#### Scenario: Import round-trip is unaffected by the removal
- GIVEN an export produced before or after the consolidation
- WHEN `importData` imports it
- THEN it MUST import `sessions`/`observations`/`prompts` exactly as before
- AND it MUST NOT require or reference `observation_facts`

## Assumptions
- **CL-3 (RESOLVED — superseded by CL-4 parity):** The adapter's `subject` MUST
  be the legacy observation `title` for ALL emitted rows, matching the legacy
  `observation_facts` builder (which set `subject = observation.title` for every
  fact). This supersedes the earlier draft that used
  `kg_entities.canonical_name`: `mem_project action=graph` renders
  `${fact.subject} -- ${fact.relation} --> ${fact.object}`
  (`src/tools/project-views.ts:38`), so to keep B1 output byte-for-byte
  identical (CL-4), `subject` MUST remain the observation title rather than a
  KG-native canonical name. The four `HAS_*` content readers that consume only
  relation/object are unaffected either way; the title choice is what preserves
  the rendered ledger line.
- **`getStats` naming:** The proposal labels the relation-distinct read at
  `src/store/index.ts:2666-2673` as "getStats", but that read actually lives in
  the visualization-filters options provider (it returns
  `projects/sessions/topic_keys/types/relations`); the unrelated stats counter at
  `~1400-1411` reads no `observation_facts`. The requirement targets the actual
  relation-distinct read at 2666-2673 regardless of the method name.
- **`upsertObservation` call-site line:** The upsert-path writer call is at
  `src/store/index.ts:1513` and the `updateObservation` writer call is at
  `:1632` (the proposal's prose swaps these two line references); the requirement
  targets all three save/update/upsert writer call sites regardless of exact
  line.
- **Reversibility flag:** `graphFactsSource` is a working name for the cutover
  flag; it mirrors existing config patterns (boolean toggles like `httpDisabled`,
  enum fields like the embedding provider). Its precise shape is a design
  decision; this spec requires only that a reversible flag-guarded cutover exist.
- **CL-6 (RESOLVED — LIVE RUNNER: place drops in `runMigrationsWithSemantic`).** The
  idempotent drop MUST be implemented inside the LIVE migration runner
  `runMigrationsWithSemantic` (`src/store/migrations.ts:213`), within its
  existing transaction, ordered LAST (after all backfill, reader migration, and
  write-cutover steps). Concretely: append the following four idempotent
  statements at the end of that transaction:
  ```sql
  DROP INDEX IF EXISTS idx_observation_facts_observation;
  DROP INDEX IF EXISTS idx_observation_facts_project;
  DROP INDEX IF EXISTS idx_observation_facts_topic;
  DROP TABLE IF EXISTS observation_facts;
  ```
  These MUST NOT be placed in the inert `MIGRATIONS_SQL` array in
  `src/store/schema.ts` — that array is re-exported only and has no live runner.
  OQ-3 resolution: the drops execute in `runMigrationsWithSemantic` only. A
  structured-migration helper is NOT assumed to exist; design MUST NOT depend on
  one. The idempotency + final-step-ordering requirements below hold under this
  mechanism.

## ADDED Requirements (kg-multi-hop-recall, B2)

### Requirement: Store MUST Provide a Flag-Gated Multi-Hop Knowledge Lane in hybridRetrieve
The store MUST add a traversal path adjacent to `queryKnowledgeLane` and integrate it into `hybridRetrieve` behind `kgMultiHopEnabled`. Traversal must accept seed observation ids and `RetrievalCandidateFilters`, then emit `kg` lane candidates with `source: 'kg_multi_hop'`.

#### Scenario: Flag on issues traversal and can add observations
- GIVEN `kgMultiHopEnabled = true` and fused seeds
- WHEN `hybridRetrieve` runs
- THEN traversal runs and may add non-seed observations via re-fusion of `kg_multi_hop` candidates

#### Scenario: Flag off issues no traversal query
- GIVEN `kgMultiHopEnabled = false`
- WHEN `hybridRetrieve` runs
- THEN no traversal query is issued and output remains baseline-identical

### Requirement: Multi-Hop Traversal Cost MUST Be Bounded With Coarse Elapsed Degrade
Traversal MUST honor deterministic bounds (`kgMaxDepth`, `kgNeighborhoodLimit`, relation allow-list). If elapsed guard or a traversal error is hit, the direct result must be returned and `degradedFallback` must include `kg_multi_hop`.

#### Scenario: Deterministic ceiling bounds traversal work
- GIVEN a high-degree reachable hub
- WHEN traversal runs
- THEN expansions stop at depth and result cap limits

#### Scenario: Elapsed guard degrades to direct result and signals it
- GIVEN traversal exceeds `kgTraversalTimeoutMs` or throws
- WHEN retrieval completes
- THEN no multi-hop candidates are retained and `degradedFallback` includes `kg_multi_hop`

### Requirement: Multi-Hop Candidate Emission and Evidence Shape
Each traversal hit emitted to ranking must be `lane: 'kg'` and `source: 'kg_multi_hop'` with KG provenance/confidence and bridge-path text, distinguishable from direct KG-fact candidates.

#### Scenario: Candidate shape is distinguishable
- GIVEN an observation is reached via traversal
- WHEN its candidate is emitted
- THEN output evidence includes bridge path and traversal metadata and is tagged `kg_multi_hop`

## MODIFIED Requirements

## REMOVED Requirements


## ADDED Requirements (kg-supersedes-edges, B3)


> Sub-change **B3** (`kg-supersedes-edges`). Additive nullable supersession
> columns on `kg_triples`, a DIFF-based deterministic supersession write that
> replaces the blind delete+reinsert in the shared writer, and
> supersession-aware deprioritization in `queryKnowledgeLane`. History is
> preserved (constitution **P5**); flag-off output is byte-identical to pre-B3.
>
> **RE-SCOPED WRITE.** `persistKgExtraction` (`src/indexing/jobs.ts:502-556`)
> currently DELETEs an observation's triples by `source_id` (`:537`) and
> reinserts the freshly-extracted set on every re-extraction. That blind delete
> both makes cross-observation supersession detection impossible and violates
> **P5** at the graph layer. B3 replaces it with a DIFF-and-mark-superseded write.

## ADDED Requirements

### Requirement: `kg_triples` MUST Gain Nullable Supersession Columns via Additive Migration
The `kg_triples` table (`src/store/schema.ts:195-213`) MUST gain two additive,
NULLABLE columns: `superseded_by_triple_id` (INTEGER, nullable, referencing the
newer `kg_triples.id` that supersedes this row) and `superseded_at` (TEXT
timestamp, nullable). The columns MUST be added via the established
`addColumnIfMissing` pattern (`src/store/migrations.ts:103`) inside the LIVE
migration runner `runMigrationsWithSemantic` (`src/store/migrations.ts:213-217`),
mirroring `LEGACY_COLUMN_MIGRATIONS` (`src/store/migrations.ts:27-30`). NO
existing column MUST be altered or dropped, and no NOT NULL/DEFAULT constraint
that would rewrite existing rows MUST be introduced. The migration MUST be
IDEMPOTENT (safe to run on every startup; `addColumnIfMissing` no-ops when the
column already exists) and backward-compatible (existing rows have NULL
supersession columns, meaning "current/not superseded").

#### Scenario: Migration adds the columns when absent
- GIVEN a `kg_triples` table without the supersession columns
- WHEN `runMigrationsWithSemantic` runs
- THEN `superseded_by_triple_id` and `superseded_at` MUST be added as nullable
  columns
- AND existing rows MUST have NULL for both (treated as current)

#### Scenario: Migration is idempotent across restarts
- GIVEN the supersession columns already exist
- WHEN `runMigrationsWithSemantic` runs again
- THEN the column-add step MUST be a safe no-op and MUST NOT raise an error
- AND existing data MUST be unchanged

#### Scenario: Backward-compatible with pre-B3 rows
- GIVEN `kg_triples` rows written before B3
- WHEN graph reads run after the migration
- THEN those rows MUST behave as current (non-superseded) and MUST remain
  readable without error

### Requirement: The Deterministic Writer MUST Diff and Mark Superseded Instead of Delete-and-Reinsert
When the supersession feature flag is enabled, the shared deterministic writer
`persistKgExtraction` (`src/indexing/jobs.ts:502-556`, reached by the synchronous
`refreshGraphFacts` → `writeDeterministicKgFacts` path, `src/store/index.ts:1119-1126`,
call sites upsert `:1515`, save `:1545`, update `:1664`, and by the `extract_kg`
job and `rebuild-graph` at `:3416`) MUST NOT blindly delete the observation's
prior triples by `source_id` (`src/indexing/jobs.ts:537`). Instead it MUST DIFF
the observation's PRIOR stored triples against its NEWLY-EXTRACTED triples (for
the same `source_id`) and:

- For a prior triple ABSENT from or REPLACED in the new set, set `superseded_at`
  on that prior triple (and set `superseded_by_triple_id` to the replacing
  triple's id when a same-subject-and-relation/different-object replacement
  exists, else leave it NULL) and KEEP the row.
- For a triple present in BOTH sets, leave the current row unchanged (no
  duplicate insert, no supersede).
- For a triple NEW in the new set, insert it as a current triple.

The write MUST require no embedding model and no remote service (constitution
**P2**), MUST be performed synchronously so supersession is queryable immediately
after save returns, and MUST be idempotent and update-safe: re-extracting the
same observation with identical content MUST converge to the same triple set,
supersede nothing new, and accumulate no duplicate rows or markings (reusing the
per-observation `triple_hash`). The same diff write MUST apply in BOTH the
synchronous path and the `extract_kg`/`rebuild-graph` path (the writer is shared),
so the two paths stay consistent.

#### Scenario: Updating a fact supersedes the prior triple, queryable immediately
- GIVEN the flag is enabled and an observation whose stored facts include `X`
- WHEN the observation is updated so re-extraction replaces `X` with `Y`
  (same subject + relation, different object) and the save returns
- THEN the prior triple `X` MUST already carry `superseded_at` and a
  `superseded_by_triple_id` pointing at `Y`
- AND `Y` MUST be present as a current triple
- AND no background job completion MUST be required

#### Scenario: Prior triples are not deleted on re-extraction
- GIVEN the flag is enabled and an observation with stored triples
- WHEN the observation is re-extracted with a changed fact set
- THEN superseded prior triples MUST remain present in `kg_triples`
- AND the writer MUST NOT issue a blind delete-by-`source_id` of the prior
  triples

#### Scenario: Re-extracting identical content converges with no new supersession
- GIVEN an observation whose triples are already stored
- WHEN the same observation is re-extracted with byte-identical content
- THEN the stored triple set MUST be unchanged
- AND no triple MUST be newly marked superseded
- AND no duplicate row or marking MUST result

#### Scenario: Flag-off retains pre-B3 delete-and-reinsert behavior
- GIVEN the supersession feature flag is disabled
- WHEN an observation is saved, updated, upserted, or rebuilt
- THEN the writer MUST behave exactly as pre-B3 (delete the observation's prior
  triples by `source_id` and reinsert the extracted set)
- AND no supersession column MUST be set

### Requirement: `queryKnowledgeLane` MUST Deprioritize and Flag Superseded Triples, Not Drop Them
When the flag is enabled, `queryKnowledgeLane` (`src/store/index.ts:2074-2164`)
MUST deprioritize superseded triples (those with a non-NULL
`superseded_by_triple_id` OR a non-NULL `superseded_at`) so a current fact ranks
above its superseded version, and MUST FLAG the superseded candidate in its
evidence (constitution **P2**: secondary/degraded state signaled, never silently
dropped). Superseded triples MUST NOT be removed from the candidate set or
deleted; history MUST remain reachable. The deprioritization MUST be a
deterministic down-weight applied to the existing KG candidate scoring (the
`tripleCandidates` emission at `src/store/index.ts:2112-2130`). With the flag OFF,
`queryKnowledgeLane` MUST produce byte-identical candidates to pre-B3 (no
supersession column read affects scoring or shape).

#### Scenario: Current fact ranks above its superseded version
- GIVEN a superseded triple and the newer triple that supersedes it, both
  matching a query
- WHEN `queryKnowledgeLane` scores candidates
- THEN the current (non-superseded) triple MUST rank above the superseded one

#### Scenario: Superseded candidate is flagged, not dropped
- GIVEN a superseded triple matches a query
- WHEN `queryKnowledgeLane` emits candidates
- THEN the superseded candidate MUST still be emitted
- AND its evidence MUST carry a superseded marker indicating why it ranked lower

#### Scenario: Flag-off candidates are byte-identical to pre-B3
- GIVEN the supersession feature flag is disabled
- WHEN `queryKnowledgeLane` runs for any query
- THEN the emitted candidates (shape, scores, ordering) MUST be identical to
  pre-B3 behavior

### Requirement: Supersession Columns MUST NOT Enter the Portable Export/Import Format
The new supersession columns MUST remain internal-only and MUST NOT change the
portable sync/export format or its `version` (constitution **P2**). `exportData`
(`src/store/index.ts:3556`, `version: 1`) serializes only
`sessions`/`observations`/`prompts` and never `kg_triples`/`kg_entities`; it MUST
continue to do so, never serializing the supersession columns. The export
`version` MUST NOT change as a result of B3. Graph supersession state MUST remain
fully derivable on `rebuild-graph` (it is recomputed deterministically by
replaying the per-observation diff over `observations`).

#### Scenario: Export shape and version are unchanged by B3
- GIVEN B3 is applied
- WHEN `exportData` produces an export
- THEN the export MUST contain only `sessions`, `observations`, and `prompts`
- AND it MUST NOT contain `kg_triples` or any supersession column
- AND the export `version` MUST be unchanged

#### Scenario: Import is unaffected by the supersession columns
- GIVEN an export produced before or after B3
- WHEN `importData` (`src/store/index.ts:3595`) imports it
- THEN it MUST import `sessions`/`observations`/`prompts` exactly as before
- AND it MUST NOT require or reference the supersession columns

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-5 (RESOLVED — additive nullable columns on `kg_triples`):** Supersession
  is recorded with `superseded_by_triple_id` + `superseded_at` nullable columns
  on `kg_triples`, NOT a separate `kg_supersedes` table. Added via
  `addColumnIfMissing` in `runMigrationsWithSemantic` (`src/store/migrations.ts:213-217`,
  the same live runner and pattern B1 used for its drops). An optional supporting
  index on `superseded_by_triple_id` MAY be added (design decision) but is not
  required by this spec.
- **CL-6 (RESOLVED — deprioritize + flag, never delete):** Superseded triples are
  deprioritized and flagged in `queryKnowledgeLane`, never hidden or deleted, so
  history stays reachable (constitution **P5**). The current-state DEFAULT view
  is applied only at `mem_project action=graph` (see the tools delta), not in the
  recall lane.
- **Shared writer is `persistKgExtraction` (code-accurate, RE-SCOPED):** The
  proposal's `refreshObservationFacts` reference is stale; post-B1 the synchronous
  KG writer is `refreshGraphFacts` → `writeDeterministicKgFacts`
  (`src/store/index.ts:1119-1126`) → `persistKgExtraction`
  (`src/indexing/jobs.ts:502`). B3's diff write lives in `persistKgExtraction`,
  replacing the blind `DELETE ... WHERE source_id = ?` at `src/indexing/jobs.ts:537`.
  Because that writer is ALSO invoked by the `extract_kg` job and `rebuild-graph`
  (`src/store/index.ts:3416`), the diff applies to both paths from one place. The
  legacy `observation_facts` writer runs only under `graphFactsSource = 'legacy'`
  and is out of scope for supersession.
- **Live-runner placement (code-accurate, mirrors B1 CL-6):** The column-add MUST
  be in the LIVE runner `runMigrationsWithSemantic`, NOT in the inert
  `MIGRATIONS_SQL` array in `src/store/schema.ts` (re-exported only, no live
  runner). The `kg_triples` DDL in `schema.ts:195-213` MAY also declare the
  columns for fresh databases, but the additive `addColumnIfMissing` step is the
  mechanism that upgrades existing databases.
- **`triple_hash` UNIQUE collision on re-assert ([NEEDS CLARIFICATION] for
  design):** `triple_hash` is `TEXT NOT NULL UNIQUE` (`src/store/schema.ts:207`)
  and per-observation (`observation:${obs.id}:${tripleHash}`,
  `src/indexing/jobs.ts:552`). If a fact is superseded and then the SAME content
  is later re-asserted for that observation, the new insert produces the SAME
  `triple_hash` as the retained superseded row and collides on the UNIQUE
  constraint. RECOMMENDATION: on re-assert, REVIVE the existing superseded row
  (clear `superseded_at` / `superseded_by_triple_id`) rather than insert a
  duplicate. The existing `ON CONFLICT(triple_hash) DO UPDATE` (`:526-534`) gives
  a natural hook — extend it to also clear the supersession columns. Design owns
  the exact revive rule.
- **`superseded_by_triple_id` semantics (RESOLVED with recommendation):** A
  REPLACEMENT (a prior triple whose subject+relation match a new triple but whose
  object differs) sets `superseded_by_triple_id` to the replacing triple's id. A
  PURE REMOVAL (a prior triple with no replacement in the new set) sets
  `superseded_at` only and leaves `superseded_by_triple_id` NULL.
- **Storage growth (known tradeoff, RESOLVED — pruning deferred):** Triples now
  ACCUMULATE — superseded rows are retained (deprioritized) rather than deleted.
  This is the intended **P5** behavior. Pruning/compaction of long supersession
  chains is explicitly DEFERRED to Change C; B3 carries it as a known, bounded
  tradeoff.
- **Delete-path interaction:** `deleteKnowledgeArtifactsForObservation`
  (`src/store/index.ts:1148-1153`) still deletes an observation's `kg_triples` by
  `source_id` on hard delete; deleting a superseding observation's triples leaves
  dangling `superseded_by_triple_id` references. Readers MUST treat a superseded
  triple whose `superseded_by_triple_id` no longer resolves as still-superseded
  history (it MUST NOT error); cleanup of dangling references is a design decision
  and is not required to lose data.

## Delta from kg-superseded-pruning

# Delta for Store

> Change **C1** (`kg-superseded-pruning`). Adds a deterministic, transactional
> store method `pruneSupersededTriples` that computes the keep-N prune set, NULLs
> dangling `superseded_by_triple_id` refs, deletes the prune set, cleans orphaned
> `kg_entities`, and returns before/after counts. Reused by BOTH the manual
> `prune-graph` op (see the indexing delta) and the automatic incremental path.
> No new `kg_triples` column is added (retention is query-driven). Flag-off and
> the portable export/import format are unchanged (constitution **P2**).
>
> **REFERENTIAL SAFETY.** The FK cascade is entity→triple, NOT triple→entity
> (`src/store/schema.ts:213-214`), so deleting a subset of triples does not
> auto-collect orphaned entities and can leave surviving rows'
> `superseded_by_triple_id` pointing at deleted rows. Both hazards MUST be handled
> IN THE SAME TRANSACTION, reusing B3's proven NULL-dangling idiom
> (`src/store/index.ts:1151-1158`).

## ADDED Requirements

### Requirement: Store MUST Provide a Deterministic, Transactional `pruneSupersededTriples` Method
The store MUST provide a method (working name `pruneSupersededTriples`) that
enforces the keep-N-most-recent-per-slot retention policy (see the knowledge-graph
delta) over superseded `kg_triples`. It MUST accept an optional `project` scope and
an optional `dryRun` flag, and it MUST return a before/after count summary. The
method MUST be DETERMINISTIC (same DB + same `kgSupersededKeepN` ⇒ same prune set;
Success Criterion 5) and TRANSACTIONAL (all-or-nothing; a failure MUST leave the
KG unchanged; Success Criterion 5). It MUST require no embedding model and no
remote service (constitution **P2**). It MUST compute the prune set by ranking each
slot's superseded triples by `superseded_at` DESC, `id` DESC and selecting rank
`> N` for pruning, and it MUST NOT select any current (non-superseded) triple.

#### Scenario: Prune enforces keep-N and returns counts
- GIVEN slots with more than `kgSupersededKeepN` superseded triples
- WHEN `pruneSupersededTriples` runs (not in dry-run)
- THEN each slot MUST be reduced to at most `kgSupersededKeepN` superseded triples
- AND the method MUST return a summary including superseded-triples pruned,
  entities removed, dangling refs NULLed, and before/after totals

#### Scenario: Prune is all-or-nothing on failure
- GIVEN a prune is in progress within its transaction
- WHEN an error occurs before the transaction commits
- THEN no triple, entity, or reference MUST be changed (the KG MUST be unchanged)

#### Scenario: Prune is deterministic for identical inputs
- GIVEN two identical database snapshots and the same `kgSupersededKeepN`
- WHEN `pruneSupersededTriples` runs against each
- THEN the pruned rows and the returned counts MUST be identical

#### Scenario: Project scope bounds the prune
- GIVEN superseded triples across multiple projects
- WHEN `pruneSupersededTriples` runs with a `project` scope
- THEN only superseded triples for that project MUST be eligible for pruning
- AND other projects' superseded triples MUST remain

### Requirement: Dry-Run Mode MUST Report Would-Prune Counts Without Mutating
`pruneSupersededTriples` MUST support a `dryRun` mode that computes ALL the counts
it WOULD produce (triples to prune, entities that would be orphaned and removed,
dangling refs that would be NULLed, and before/after totals) WITHOUT deleting,
NULLing, or otherwise mutating any row (Success Criterion 2). Dry-run MUST compute
the identical prune set that a real run would compute for the same inputs, so the
preview is trustworthy. After a dry-run, a subsequent identical real run MUST prune
exactly the previewed rows.

#### Scenario: Dry-run computes counts and mutates nothing
- GIVEN slots that exceed keep-N
- WHEN `pruneSupersededTriples` runs with `dryRun` enabled
- THEN it MUST return the would-prune counts (triples, entities, NULLed refs,
  before/after)
- AND no `kg_triples` row, `kg_entities` row, or `superseded_by_triple_id`
  reference MUST be changed

#### Scenario: Dry-run preview matches the real prune set
- GIVEN a fixed database state and `kgSupersededKeepN`
- WHEN a dry-run is followed by a real run with no intervening change
- THEN the real run MUST prune exactly the rows the dry-run reported

### Requirement: Subset Prune MUST NULL Dangling Supersession Refs and Clean Orphaned Entities Transactionally
Before deleting the prune set, `pruneSupersededTriples` MUST, IN THE SAME
TRANSACTION: (a) NULL any `superseded_by_triple_id` on SURVIVING `kg_triples` rows
that points at a row in the prune set (reusing the B3 NULL-dangling UPDATE idiom,
`src/store/index.ts:1151-1158`), so no surviving row references a deleted triple;
and (b) after the delete, remove any `kg_entities` row left with zero referencing
`kg_triples` (orphaned), because the FK cascade is entity→triple only
(`src/store/schema.ts:213-214`) and does not auto-collect orphaned entities. The
orphaned-entity cleanup MUST be gated by `kgPruneOrphanEntities` (see the config
delta); when disabled, triple pruning and dangling-ref NULLing still occur but
orphaned entity rows are left in place. After a prune with orphan cleanup enabled,
referential integrity MUST hold: no surviving row's `superseded_by_triple_id`
points at a deleted row, and no `kg_entities` row has zero referencing triples
(Success Criterion 3).

#### Scenario: Dangling supersession refs are NULLed, not left pointing at deleted rows
- GIVEN a surviving superseded triple whose `superseded_by_triple_id` points at a
  triple that is in the prune set
- WHEN the prune runs
- THEN that surviving row's `superseded_by_triple_id` MUST be NULLed in the same
  transaction as the delete
- AND no surviving row MUST reference a deleted triple after the prune

#### Scenario: Orphaned entities are removed when cleanup is enabled
- GIVEN a `kg_entities` row whose only referencing triples are all in the prune set
- WHEN the prune runs with `kgPruneOrphanEntities` enabled
- THEN that entity row MUST be removed after the delete
- AND no `kg_entities` row with zero referencing triples MUST remain

#### Scenario: Entities still referenced by surviving triples are retained
- GIVEN an entity referenced by both a pruned triple and a surviving triple
- WHEN the prune runs with orphan cleanup enabled
- THEN that entity MUST be retained (it still has a referencing triple)

#### Scenario: Orphan cleanup disabled leaves entities but still prunes triples
- GIVEN `kgPruneOrphanEntities` is disabled and a prune orphans some entities
- WHEN the prune runs
- THEN the excess superseded triples MUST still be pruned and dangling refs NULLed
- AND the orphaned entity rows MUST be left in place

### Requirement: Prune Must Not Double-Clean With the Per-Observation Delete Path
The prune path and the existing per-observation delete path
(`deleteKnowledgeArtifactsForObservation`, `src/store/index.ts:1148-1164`, and the
hard-delete transaction `:1594-1599`) MUST leave `kg_entities`/`kg_triples`
consistent and MUST NOT interfere with each other: a prune MUST NOT depend on or
corrupt an observation delete, and neither MUST leave dangling supersession
references or orphaned entities. Deleting an observation whose triples supersede
another observation's retained rows MUST NOT be broken by C1 (B3 already
guarantees readers treat an unresolved `superseded_by_triple_id` as still-
superseded history without error).

#### Scenario: Prune after observation delete stays consistent
- GIVEN an observation has been hard-deleted (its `kg_triples` removed by
  `source_id`) leaving some superseded rows in other slots
- WHEN `pruneSupersededTriples` subsequently runs
- THEN it MUST prune per keep-N without error
- AND it MUST NOT leave dangling supersession references or orphaned entities

### Requirement: Pruning MUST NOT Enter the Portable Export/Import Format
Pruning MUST remain internal-only and MUST NOT change the portable sync/export
format or its `version` (constitution **P2**; Success Criterion 6). `exportData`
(`src/store/index.ts:3626-3663`, `version: 1`) serializes only
`sessions`/`observations`/`prompts` and never `kg_triples`/`kg_entities`; it MUST
continue to do so. The export `version` MUST NOT change as a result of C1, and
`importData` behavior MUST be unaffected. Existing export-import tests
(`tests/store/export-import.test.ts:81-132`, which assert kg columns are absent)
MUST still pass.

#### Scenario: Export shape and version are unchanged by C1
- GIVEN C1 is applied
- WHEN `exportData` produces an export
- THEN the export MUST contain only `sessions`, `observations`, and `prompts`
- AND it MUST NOT contain `kg_triples`, `kg_entities`, or any pruning-related field
- AND the export `version` MUST be unchanged

#### Scenario: Import is unaffected by pruning
- GIVEN an export produced before or after C1
- WHEN `importData` imports it
- THEN it MUST import `sessions`/`observations`/`prompts` exactly as before
- AND it MUST NOT require or reference any pruning state

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Method naming (working name):** `pruneSupersededTriples` is a working name; the
  precise signature is a design decision. The spec requires only a deterministic,
  transactional method that accepts an optional `project` and `dryRun`, enforces
  keep-N, performs the referential-safety cleanup, and returns before/after counts.
- **Count pattern mirrors `rebuildObservationFacts`:** The before/after delta
  summary reuses the count idiom at `src/store/index.ts:3469-3497`
  (`rebuildObservationFacts`), so the operator-facing result shape is consistent
  with the existing rebuild op.
- **NULL-dangling idiom reuse (code-accurate):** The dangling-ref NULLing reuses
  B3's exact UPDATE idiom at `src/store/index.ts:1151-1158`; C1 applies it to the
  prune set (survivors pointing at pruned rows) rather than to a deleted
  observation's triples.
- **No DDL / no down-migration:** keep-N is query-driven; C1 adds no destructive
  DDL. Any supporting index to make the per-slot ranking scan efficient (assessed
  in design) is additive and non-destructive and MAY remain on rollback (Success
  Criterion / Rollback: no schema rollback needed).
- **Shared logic across both triggers:** The same `pruneSupersededTriples` logic
  backs both the manual `prune-graph` op (full or `--project` scope) and the
  automatic incremental path (scoped to affected slots), so both triggers produce
  identical, deterministic retention outcomes.
- **First-prune batch size (known tradeoff):** A first prune over a large
  accumulated B3 backlog may be a large transaction; batching/scoping is a design
  concern (`--project` scope and steady-state incremental enforcement keep later
  batches small). This spec requires transactional all-or-nothing correctness, not
  a specific batching strategy.



# Delta for Community Summaries LazyGraphRAG

## ADDED Requirements

### Requirement: Store MUST Persist Community Summaries as Derived Artifacts
The store MUST persist community partition and summary artifacts as derived state separate from source memories and KG source rows. Derived community artifacts MUST reference their project, community identifier, algorithm/version metadata, source KG coverage, source observation coverage, summary generator, freshness state, degraded/enrichment state, and creation/update timestamps.

#### Scenario: Derived artifact references source evidence
- GIVEN a community summary is persisted
- WHEN the artifact is inspected
- THEN it MUST identify the project, community id, algorithm/generator versions, source KG coverage, source observation coverage, and freshness state
- AND it MUST NOT replace or duplicate source observations as authoritative memory

### Requirement: Community Rebuild MUST Be Transactional, Idempotent, and Project-Scoped
Community rebuild for a project MUST be transactional at the project artifact set level: a successful rebuild replaces that project's previous community artifacts with a coherent new version, while a failed rebuild leaves the previous committed version readable and marks rebuild status explicitly. Re-running rebuild with identical KG inputs and configuration MUST converge without duplicate community artifacts.

#### Scenario: Failed rebuild leaves previous version readable
- GIVEN a project has an existing committed community-summary version
- WHEN a rebuild fails before commit
- THEN readers MUST continue to see the previous committed version
- AND the project community state MUST record the failed rebuild status

#### Scenario: Repeated rebuild converges
- GIVEN identical KG inputs and community configuration
- WHEN community rebuild runs twice
- THEN the second run MUST NOT create duplicate artifacts
- AND the committed project community version MUST remain equivalent

### Requirement: Community Storage MUST Preserve Portable Export and Import Stability
Community artifacts MUST NOT change the portable export/import format unless a later spec explicitly justifies a compatible format revision. Source observations, prompts, and sessions remain the portable data contract; community artifacts are rebuildable from imported source memories and KG rebuilds.

#### Scenario: Export remains source-memory focused
- GIVEN community summaries exist
- WHEN export produces the portable payload
- THEN the payload MUST remain compatible with the existing export/import contract
- AND it MUST NOT require serialized community artifacts for import correctness

#### Scenario: Import can rebuild communities later
- GIVEN an import created without community artifacts
- WHEN KG rebuild and community rebuild are run after import
- THEN community summaries MUST be reconstructable from the imported source memories

### Requirement: Community Artifact Rollback MUST Never Delete Source Memories
Disabling, dropping, or rebuilding community-summary artifacts MUST NOT delete source observations, prompts, sessions, `kg_entities`, or current `kg_triples`. Rollback MAY ignore, remove, or rebuild derived community rows/artifacts.

#### Scenario: Community feature rollback leaves sources intact
- GIVEN community summaries are disabled or dropped
- WHEN recall and KG reads continue
- THEN source memories and KG source rows MUST remain intact
- AND retrieval MUST be able to fall back to the pre-community four-lane behavior

### Requirement: Store Readers MUST Surface Missing or Stale Community State Explicitly
Store methods that provide community summaries to retrieval, project summaries, or admin inspection MUST distinguish fresh summaries from missing, stale, rebuilding, failed, disabled, and degraded summaries. Readers MUST NOT silently treat stale community text as fresh evidence.

#### Scenario: Stale summary is explicitly marked
- GIVEN a project's KG changed after community summaries were built
- WHEN a store reader returns community summary data
- THEN the returned metadata MUST indicate stale state
- AND consumers MUST be able to avoid ranking stale text as fresh KG evidence
## Sync and Resilience Requirements

### Requirement: Topic Key MUST Be Search-Indexed
The system MUST index `topic_key` alongside existing observation search fields so topic metadata remains searchable with the same visibility rules as observations.

#### Scenario: Topic key is indexed for active observations
- GIVEN an active observation with a non-null `topic_key`
- WHEN observation search is executed
- THEN the observation SHALL be discoverable by topic-key search terms

#### Scenario: Index stays consistent after observation changes
- GIVEN an indexed observation whose `topic_key`, title, or content changes
- WHEN the change is persisted
- THEN subsequent searches MUST reflect the new values and MUST NOT return stale indexed values

### Requirement: Exact Topic Key Lookup MUST Be Deterministic
The system MUST support an exact `topic_key` lookup path that performs equality matching and MUST return only records whose stored topic key exactly matches the requested key.

#### Scenario: Exact key returns only exact matches
- GIVEN observations with similar topic keys (for example `architecture/auth` and `architecture/auth-v2`)
- WHEN an exact lookup for `architecture/auth` is requested
- THEN only `architecture/auth` matches MUST be returned

#### Scenario: Exact key bypasses tokenization edge cases
- GIVEN a topic key containing separators or tokens that are ambiguous under full-text tokenization
- WHEN exact lookup is requested for that key
- THEN the matching result MUST be based on exact equality semantics, not tokenized partial matching

### Requirement: Sync Chunk State MUST Be Persisted Idempotently
The system MUST persist sync chunk processing state in `sync_chunks` so imports and exports can identify already-seen chunks and avoid reprocessing.

#### Scenario: Duplicate chunk identity is skipped
- GIVEN a chunk previously recorded as processed
- WHEN the same chunk identity is encountered again
- THEN the system MUST skip reprocessing and record it as skipped

#### Scenario: Duplicate payload hash is skipped
- GIVEN a new chunk identifier whose content hash matches a previously processed chunk
- WHEN chunk deduplication is evaluated
- THEN the system SHOULD skip applying duplicate payload effects

### Requirement: Mutation Journal MUST Record Convergence Events
The system MUST persist create, update, and delete mutations in `sync_mutations` with stable ordering semantics suitable for incremental synchronization.

#### Scenario: Create and update produce journal entries
- GIVEN an observation or prompt that is created or updated
- WHEN persistence succeeds
- THEN a corresponding mutation record MUST be available for later incremental export

#### Scenario: Delete produces tombstone-eligible mutation
- GIVEN an observation or prompt that is deleted (including soft delete)
- WHEN persistence succeeds
- THEN a deletion mutation MUST be recorded so downstream sync can propagate a tombstone

### Requirement: Startup Migrations MUST Be Structured and Idempotent
The system MUST run migrations through explicit schema-aware helpers and repeated startup runs SHALL converge to the same schema state without error.

#### Scenario: Fresh database startup
- GIVEN a fresh database
- WHEN startup initialization runs
- THEN required tables, indexes, triggers, and sync state structures MUST exist

#### Scenario: Partially migrated database startup
- GIVEN a database missing only some required columns or sync tables
- WHEN startup initialization runs repeatedly
- THEN missing elements MUST be added without duplicating existing elements or failing the process

### Requirement: FTS Rebuild MUST Preserve Search Integrity
When schema evolution requires FTS rebuild, the system MUST rebuild indexes so searchable observation coverage remains complete for non-deleted records.

#### Scenario: Rebuild after topic-key index evolution
- GIVEN an existing dataset prior to an FTS schema change
- WHEN migration performs an FTS rebuild
- THEN all non-deleted observations MUST remain searchable and search-trigger synchronization MUST continue after rebuild


## Merge: stable-memory-identity-bootstrap/store

# Delta for Store

## ADDED Requirements
### Requirement: Store Session Persistence MUST Preserve Explicit Session and Project Identity
Store session creation and enrichment paths MUST preserve explicit `session_id` and `project` values supplied by callers. Idempotent session creation MUST enrich only missing or placeholder project metadata when a stable explicit project becomes available, and MUST NOT overwrite an already stable non-placeholder project with a placeholder value.

#### Scenario: Explicit session is created with stable project
- GIVEN a caller starts or ensures a session with explicit session id and explicit project
- WHEN the Store persists the session
- THEN the `sessions` row MUST contain that session id
- AND the `sessions.project` value MUST equal the explicit project

#### Scenario: Placeholder project is enriched idempotently
- GIVEN an existing session row has a placeholder or missing-equivalent project value
- WHEN the Store later ensures the same session with a stable explicit project
- THEN the Store MUST enrich the session project to the stable explicit value
- AND repeating the same ensure operation MUST be idempotent

#### Scenario: Stable project is not downgraded
- GIVEN an existing session row has a stable non-placeholder project
- WHEN a later Store call omits project or supplies a placeholder project
- THEN the Store MUST NOT replace the stable project with the placeholder

### Requirement: Store Save Paths MUST Retain Nullable Prompt and Observation Project Compatibility
Store prompt and observation persistence MUST remain backward-compatible with the existing schema where `sessions.project` is non-null while `user_prompts.project` and `observations.project` are nullable. The Store MUST NOT require destructive schema changes that make prompt or observation project fields non-null, and MUST make missing or placeholder identity query-stable.

#### Scenario: Prompt project may remain null
- GIVEN a prompt save request omits project identity
- WHEN the Store persists the prompt under compatibility behavior
- THEN the prompt record MAY retain a null project where the schema permits it
- AND any auto-created session MUST still satisfy the non-null `sessions.project` constraint using deterministic compatibility identity

#### Scenario: Observation project may remain null
- GIVEN an observation save request omits project identity
- WHEN the Store persists the observation
- THEN the observation record MAY retain a null project where the schema permits it
- AND project-scoped queries MUST continue to distinguish null, placeholder, and explicit projects predictably

### Requirement: Store Fallback Identity MUST Be Deterministic and Reportable
When Store paths synthesize fallback session or project identity for compatibility, the synthesized value MUST be deterministic for equivalent input and MUST be available to calling surfaces for fallback/degraded-state reporting. Store behavior MUST distinguish explicit identity from fallback identity so MCP, HTTP, CLI, and tests can observe the difference.

#### Scenario: Repeated missing-session prompt saves use deterministic fallback
- GIVEN two equivalent prompt save requests omit session id and use the same effective project
- WHEN the Store applies compatibility fallback behavior
- THEN the fallback session id MUST be the same deterministic value for both requests
- AND callers MUST be able to report that the session id was synthesized

#### Scenario: Explicit identity is distinguishable from fallback identity
- GIVEN one save request supplies explicit identity and another equivalent request omits it
- WHEN the Store persists both records
- THEN the Store result available to callers MUST indicate fallback use only for the request that omitted identity

### Requirement: Import and ApplyV2Chunk MUST Preserve or Degrade Identity Explicitly
Store import paths, including legacy import and `applyV2Chunk`, MUST preserve session and project identity present in imported sessions, observations, prompts, and mutations. When imported data lacks identity required by the target schema or query contract, the Store MUST apply deterministic compatibility handling and report missing/degraded identity in import results rather than silently treating `unknown` as stable caller identity.

#### Scenario: Import preserves explicit identity
- GIVEN an import payload contains explicit session id and project identity
- WHEN the Store imports sessions, observations, and prompts from that payload
- THEN the persisted records MUST preserve the imported identity values
- AND no degraded identity warning MUST be emitted for those values

#### Scenario: Legacy import reports degraded identity
- GIVEN a legacy import payload omits project or session identity for some records
- WHEN the Store imports the payload
- THEN import MUST remain backward-compatible and successful when the data is otherwise valid
- AND the result MUST report which identity fields were missing or degraded
- AND any placeholder used to satisfy storage constraints MUST be deterministic

#### Scenario: applyV2Chunk preserves mutation identity
- GIVEN a v2 sync chunk contains mutation records with explicit session and project identity
- WHEN `applyV2Chunk` applies the chunk
- THEN the resulting records and sync state MUST preserve those explicit identity values
- AND placeholder identity MUST NOT be substituted for present identity

### Requirement: Historical Placeholder Records MUST Not Be Silently Rewritten
This change MUST NOT silently rewrite existing historical records that already contain placeholder identity such as `manual-save-*` or `unknown`. Any future repair of historical identity MUST be opt-in and separately specified; current reads, imports, and saves MUST keep historical placeholders query-stable.

#### Scenario: Existing placeholder session remains query-stable
- GIVEN a database already contains a session id beginning with `manual-save-`
- WHEN the Store initializes or new identity-bootstrap behavior runs
- THEN the historical session id MUST remain unchanged
- AND queries filtering that exact session id MUST continue to find the same records

#### Scenario: Existing unknown project is not repaired implicitly
- GIVEN a database already contains records with project `unknown`
- WHEN import, search, timeline, recall, or context operations run
- THEN those records MUST NOT be silently reassigned to a different project
- AND callers MUST be able to continue filtering or inspecting them as degraded historical identity

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- `sessions.project` remains non-null; `observations.project` and `user_prompts.project` remain nullable for compatibility.
- Deterministic fallback values may keep existing placeholder vocabulary where needed, but callers can tell that the value was synthesized.
- Deterministic fallback means a repeatable value derived from stable inputs such as save category and effective project; it MUST NOT depend on timestamps, randomness, process id, or host-specific transient state.
- Placeholder project values for this change are the existing compatibility vocabulary such as `unknown`; stable explicit project values are non-empty caller/import/config values that are not placeholder values.
- No retroactive repair or migration of historical placeholder records is included in this change.

## Handoff Hints
- Design should centralize identity normalization/reporting at Store boundaries enough to avoid divergent MCP/HTTP/CLI behavior.
- Preserve idempotent session enrichment without destructive schema changes.
- Tests should include direct Store save/import/applyV2Chunk cases for explicit identity, null-compatible records, deterministic fallback, and historical placeholder stability.


## Merged change: pre-multiharness-foundations (store)

# Delta for Store

## ADDED Requirements
### Requirement: Store Identity Boundaries MUST Consume a Shared Resolver v2 Contract
Store save, session, import, sync, and mirrored HTTP/CLI persistence paths MUST consume one shared identity-resolution contract for project and session identity. The Store MUST preserve explicit identity, apply deterministic fallback only when required for compatibility, and expose degraded metadata for callers without silently diverging per surface.

#### Scenario: Store save uses the shared resolver
- GIVEN equivalent save requests arrive through MCP, HTTP, CLI, import, or sync surfaces
- WHEN they carry the same explicit project and session id
- THEN Store persistence MUST preserve those explicit identities
- AND the resulting identity metadata MUST be equivalent across surfaces

#### Scenario: Missing identity fallback is deterministic across surfaces
- GIVEN equivalent requests omit project or session identity
- WHEN Store persistence applies compatibility fallback
- THEN repeated equivalent requests MUST produce the same fallback identity
- AND callers MUST be able to report which fields were missing, blank, placeholder, or synthesized

#### Scenario: Historical placeholders are not rewritten
- GIVEN existing rows already contain placeholder project or session identity
- WHEN Store initialization, recall, import, sync, or health reads run
- THEN those rows MUST remain stored under their existing values
- AND no implicit repair migration MUST occur

### Requirement: Store MUST Provide Community Health State Inputs
The Store MUST provide a bounded project community health read model that distinguishes `fresh`, `stale`, `rebuilding`, `failed`, `degraded`, `missing`, and `disabled` states. The read model MUST include source coverage, community coverage, graph signature or freshness basis, latest job status, timestamps when available, and degraded/failure reason metadata without recomputing expensive graph state on each health request.

#### Scenario: Freshness basis is returned from stored metadata
- GIVEN community artifacts were built against a recorded graph signature or freshness basis
- WHEN Store health state is read for that project
- THEN the result MUST include the recorded basis and whether it matches the current graph state
- AND health rendering MUST NOT require an unbounded graph scan

#### Scenario: Missing and disabled are distinct
- GIVEN community summaries are disabled by configuration for a project
- WHEN Store health state is read
- THEN the state MUST be `disabled`
- AND GIVEN community summaries are enabled but no committed artifacts exist
- WHEN Store health state is read
- THEN the state MUST be `missing`

#### Scenario: Failed or rebuilding job state is visible
- GIVEN the latest community rebuild failed or is in progress
- WHEN Store health state is read
- THEN the result MUST include `failed` or `rebuilding` state and latest job metadata
- AND committed previous summaries MUST NOT be silently reported as fresh

### Requirement: Store Telemetry Aggregation MUST Record Payload and Escalation Metrics Without Raw Content Leakage
The Store or its tracing/telemetry boundary MUST make aggregate token-savings metrics available for runtime reporting, including per-tool average payload size, full/evidence/returned payload sizes, estimated-or-exact token counts, and `mem_get` avoided versus escalated counts. Telemetry MUST store numeric counts, bounded summaries, hashes, signatures, and sanitized metadata rather than raw sensitive request or response bodies.

#### Scenario: Per-tool payload averages are measurable
- GIVEN multiple MCP tool calls have been traced
- WHEN telemetry is summarized
- THEN average returned payload size per tool MUST be computable
- AND the summary MUST distinguish request, response, evidence, and returned size bases where available

#### Scenario: mem_get escalation counts are measurable
- GIVEN recall/context interactions either answer from compact/context evidence or require a later full `mem_get`
- WHEN telemetry is summarized
- THEN counts for `mem_get` avoided and escalated MUST be reported
- AND avoided counts MUST NOT be credited when a full fetch was required for the same answer path

#### Scenario: Raw sensitive content is not persisted as telemetry
- GIVEN a traced request or response contains private-tagged content or secret-like values
- WHEN token-savings telemetry is recorded
- THEN only sanitized bounded payload summaries, counts, or signatures MAY be stored
- AND the raw sensitive content MUST NOT be persisted in telemetry fields

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Health state should reuse existing community run/artifact metadata when sufficient; adding a bounded derived signature is allowed only if current metadata cannot prove freshness.
- `mem_get avoided` means compact/context evidence answered the path without a later full fetch for the same query/task correlation; design must define the concrete correlation window or trace linkage.
- Exact token counts are preferred when a portable tokenizer is available; deterministic estimates are acceptable when labeled as estimates.

## Handoff Hints
- Design should identify the lowest-cost stored community freshness basis and avoid on-demand graph recomputation in health reads.
- Design must choose a privacy-safe telemetry schema or trace-summary path that can compute counts without raw bodies.
- Tests should include direct Store health-state fixtures and telemetry aggregation over representative tool traces.

