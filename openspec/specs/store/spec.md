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
