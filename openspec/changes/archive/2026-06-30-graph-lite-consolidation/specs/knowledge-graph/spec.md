# Delta for Knowledge Graph

> Sub-change B1 of Change B. Makes `kg_triples` (+ `kg_entities`) the single
> source of graph-derived facts and retires the redundant `observation_facts`
> precursor. Multi-hop (B2), bi-temporal (B3), and community summaries (C) are
> OUT OF SCOPE.

## ADDED Requirements

### Requirement: `kg_triples` MUST Be the Single Source of Graph-Derived Facts
The knowledge graph (`kg_entities` + `kg_triples`) MUST be the only persisted
source of graph-derived facts in the system. No parallel graph-fact store
(specifically the retired `observation_facts` precursor) SHALL be read or written
once consolidation is complete. Any consumer that previously required the
`ObservationFact` projection MUST obtain it from the KG-backed adapter: its four
content-section relations (`HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED`) are
read from `kg_triples` joined to `kg_entities`, and its three metadata-derived
relations (`IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY`) are synthesized from the
joined `observations` row (see CL-4) — never from a separate facts table. No
persisted graph-fact store other than `kg_entities`+`kg_triples` SHALL exist.

#### Scenario: Graph facts are served only from the knowledge graph
- GIVEN consolidation onto `kg_triples` is complete
- WHEN any graph-fact consumer (ranking knowledge lane, project graph, ledger
  detail, visualization, stats relation listing) requests graph-derived facts
- THEN the facts MUST be derived from `kg_entities` + `kg_triples`
- AND no code path MUST read or write the `observation_facts` table

#### Scenario: Knowledge lane has a single graph source
- GIVEN a recall query that exercises the graph/KG lane
- WHEN `queryKnowledgeLane` assembles graph candidates
- THEN the candidates MUST be sourced solely from `kg_triples` (joined to
  `kg_entities`)
- AND no `observation_facts`-sourced candidate (`source = 'observation_facts'`)
  MUST be produced

### Requirement: Graph Facts MUST Be Written Synchronously and Deterministically on Save
On observation save, update, and upsert, the system MUST write the deterministic
knowledge-graph facts for that observation SYNCHRONOUSLY, before the save
operation returns, reusing the deterministic extractor that already runs first in
the KG job path (`extractKnowledgeTriples`). This preserves parity with the
retired synchronous `observation_facts` writer so graph facts are immediately
queryable after a save without waiting for any background job. The write MUST NOT
require an embedding model or any remote service (constitution **P2**). The
background `extract_kg` job MUST be RETAINED for optional LLM enrichment only;
deterministic graph availability MUST NOT depend on it. The synchronous write
MUST be idempotent and update-safe: re-saving the same observation MUST converge
to the same triples (deduplicated by `triple_hash`) and MUST replace prior
deterministic triples for that observation rather than accumulating duplicates.

#### Scenario: Graph facts are queryable immediately after save
- GIVEN a new observation whose content yields deterministic triples
- WHEN the save operation returns
- THEN the deterministic `kg_entities`/`kg_triples` for that observation MUST
  already be persisted and queryable through the KG-backed adapter
- AND no background `extract_kg` job completion MUST be required for those
  deterministic facts to be available

#### Scenario: Re-saving an observation does not duplicate triples
- GIVEN an observation that has already been saved and has deterministic triples
- WHEN the same observation is updated or upserted again
- THEN the deterministic triples for that observation MUST be replaced/upserted
  in place (deduplicated by `triple_hash`)
- AND the post-save triple set for that observation MUST NOT contain duplicate
  equivalent triples

#### Scenario: LLM enrichment remains optional and non-blocking
- GIVEN the deterministic synchronous graph write has completed on save
- WHEN the optional `extract_kg` background job later runs with LLM enrichment
  enabled
- THEN it MUST only enrich (add/upgrade) triples for that observation
- AND a failure or absence of LLM enrichment MUST NOT remove or invalidate the
  deterministic facts already written synchronously

### Requirement: KG-Backed Graph Readers MUST Degrade Gracefully Before Backfill
Backfill of `kg_entities`/`kg_triples` for legacy already-saved observations is
OPERATOR-TRIGGERED (see the indexing delta) and is NOT guaranteed to have run.
The consolidated KG-backed readers MUST degrade gracefully when backfill has not
yet run: they MUST return an empty-but-valid result (fewer or zero rows) for
observations that have no KG facts yet, and MUST NOT raise an error, crash, or
fail the surrounding retrieval/render operation because legacy graph facts are
absent.

#### Scenario: Reader returns empty-but-valid output pre-backfill
- GIVEN legacy observations exist that have not yet been processed into
  `kg_triples`
- WHEN a graph-fact consumer reads facts for those observations before backfill
  has run
- THEN the consumer MUST return an empty-but-valid result for them (no rows)
  rather than raising an error
- AND the surrounding operation (recall, project graph, ledger render) MUST still
  succeed

#### Scenario: Backfill populates legacy coverage without breaking new writes
- GIVEN new observations are already covered by the synchronous deterministic
  write while legacy observations are not
- WHEN the operator-triggered backfill runs over legacy observations
- THEN legacy observations MUST gain their deterministic `kg_entities`/`kg_triples`
- AND coverage for already-covered new observations MUST remain correct (no
  duplication, deduplicated by `triple_hash`)

### Requirement: Deterministic Entity Backfill MUST Cover Legacy String Subjects/Objects
For legacy graph facts whose subject/object strings lack a corresponding
`kg_entities` row, the backfill MUST create deterministic `kg_entities` entries
(and the corresponding `kg_triples`) so the KG-backed adapter returns complete
results for already-saved data. This backfill MUST be deterministic (no model
required), consistent with constitution **P2**, and MUST be idempotent across
repeated runs (deduplicated by entity key and `triple_hash`).

#### Scenario: Legacy subject/object strings become entity-backed triples
- GIVEN a legacy observation whose graph facts reference subject/object strings
  with no existing `kg_entities` row
- WHEN deterministic backfill runs for that observation
- THEN deterministic `kg_entities` rows MUST be created for those strings
- AND corresponding `kg_triples` MUST be created so the adapter can join entity
  canonical names for that observation

#### Scenario: Repeated backfill converges
- GIVEN backfill has already run for an observation
- WHEN backfill runs again for the same observation
- THEN no duplicate entities or triples MUST be created (deduplicated by entity
  key and `triple_hash`)

## MODIFIED Requirements

### Requirement: KG Records MUST Preserve Provenance and Confidence
Knowledge triples MUST include source linkage, extraction metadata, and
confidence metadata for ranking/fusion. This applies to BOTH the synchronous
deterministic write-on-save and the optional background `extract_kg` enrichment:
the synchronously written deterministic triples MUST carry the same provenance
(`provenance`, `source_type = 'observation'`, `source_id`), confidence, and
extractor-version metadata that the background path persists, so consumers cannot
distinguish synchronously-written facts from background-written facts by missing
metadata.

#### Scenario: Triple includes source and confidence
- GIVEN a persisted triple
- WHEN retrieval/ranking reads KG evidence
- THEN source memory identity, extractor metadata, and confidence metadata MUST
  be available

#### Scenario: Synchronously written triples carry full provenance
- GIVEN graph facts written synchronously on save
- WHEN those triples are read for ranking or graph rendering
- THEN they MUST expose the same provenance, `source_type`/`source_id`,
  confidence, and extractor-version metadata as background-written triples

### Requirement: KG Extraction MUST Be Idempotent and Update-Safe
KG extraction MUST converge safely across retries, restarts, and source-content
updates without duplicating equivalent triples. This convergence guarantee MUST
hold across BOTH the synchronous deterministic write-on-save and the background
`extract_kg` job for the same observation: running the background job after the
synchronous write (or vice versa) MUST NOT create duplicate equivalent triples
for that observation, and updating the source observation MUST replace its stale
triples rather than accumulate them.

#### Scenario: Repeated extraction converges
- GIVEN the same source content is extracted more than once
- WHEN extraction results are persisted
- THEN equivalent triples MUST be upserted or deduplicated without duplicate
  ranking evidence

#### Scenario: Synchronous and background paths converge for one observation
- GIVEN an observation written synchronously on save
- WHEN the background `extract_kg` job subsequently processes the same
  observation
- THEN the combined result MUST NOT contain duplicate equivalent triples for that
  observation

## REMOVED Requirements

### Requirement: `observation_facts` MUST Remain Compatible as Graph-lite Fallback/Source
**Reason:** REV3 of the validated discovery finding (`review/thoth-mem/graph-gap`)
established that `observation_facts` is a redundant legacy precursor, not a
designed degraded-mode fallback. Its 7 relations and string subjects are a lossy
subset of the rich KG, and both stores populate deterministically from the same
content (the deterministic extractor always runs first), so there is no separate
fallback lane that survives when `kg_triples` is absent. Consolidating onto
`kg_triples` as the single source of graph truth removes the parallel duplication
and unblocks B2/B3.

**Migration:** All former `observation_facts` consumers obtain the
`ObservationFact` projection from the KG-backed adapter
(`getObservationFactsFromKg`, see the store delta). Legacy already-saved data is
covered by operator-triggered deterministic backfill (see the indexing delta).
The `observation_facts` table and its indexes are dropped via an idempotent,
gated migration after backfill and reader migration are verified (see the store
delta). The portable sync/export format is unaffected (it never serialized
`observation_facts`).

## Assumptions

- **CL-1 (RESOLVED — synchronous deterministic write-on-save):** Per the
  orchestrator-endorsed decision, graph facts are written synchronously and
  deterministically on save/update/upsert (reusing `extractKnowledgeTriples`),
  preserving the immediate availability the retired synchronous
  `observation_facts` writer provided. The `extract_kg` background job is retained
  for optional LLM enrichment only. The "accept eventual graph facts" alternative
  is explicitly NOT adopted.
- **CL-2 (RESOLVED — operator-triggered backfill + graceful degrade):** Backfill
  of legacy rows is operator-triggered via `rebuild-graph --all` (a documented
  upgrade step), NOT an automatic startup migration. The consolidated readers
  degrade gracefully (empty-but-valid, no crash) when backfill has not yet run.
- **CL-3 (RESOLVED — superseded by CL-4 parity; subject = observation title):**
  The adapter's `subject` MUST be the legacy observation `title` for all rows,
  matching the legacy `observation_facts` builder. The earlier "KG-native
  canonical subject" draft is superseded because `mem_project action=graph`
  renders the subject in its ledger lines (`src/tools/project-views.ts:38`), and
  CL-4 requires B1 to change no observable output. The relation-extraction
  readers (`HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED`) consume only
  relation/object and are preserved regardless.
- **Deterministic extractor location:** The deterministic, no-model extractor is
  `extractKnowledgeTriples` (`src/indexing/kg-extractor.ts:364`); it already runs
  first in `processKgJob` (`src/indexing/jobs.ts:441`) before any optional LLM
  enrichment, which is why reusing it for the synchronous write preserves
  determinism (constitution **P2**).
- **CL-4 (RESOLVED — KG-RELATION-PARITY: PRESERVE LEGACY LABELS via a
  hybrid-source adapter; B1 changes NO observable output).** The consolidation is
  transparent: `getObservationFactsFromKg` MUST return the SAME 7-relation
  `ObservationFact` set with the SAME labels the legacy `observation_facts`
  builder produced, so visualization, `mem_project action=graph`, the `/graph`
  endpoint, the stats relation listing, the full `facts` array in ledger detail,
  and evals output are UNCHANGED. This parity is achieved without remapping
  `kg_triples.relation`, because the two relation groups have different,
  independently-derivable sources:
  - **The 4 CONTENT relations** (`HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`,
    `HAS_LEARNED`) are sourced from `kg_triples` (joined to `kg_entities`). The
    deterministic KG extractor already emits these section relations identically
    to the legacy builder (`STRUCTURED_SECTION_RELATIONS`,
    `src/indexing/kg-extractor.ts:105-110`), so no relabeling is needed for them.
  - **The 3 METADATA relations** (`IN_PROJECT`, `HAS_TYPE`, `HAS_TOPIC_KEY`) are
    SYNTHESIZED by the adapter directly from the observation's own columns
    (`project`, `type`, `topic_key`) — exactly as the legacy builder always did
    (`buildObservationFacts`, `src/store/index.ts:1058-1066`, which derived them
    from observation metadata, not from any real graph edge). The adapter
    therefore constructs `IN_PROJECT`/`HAS_TYPE`/`HAS_TOPIC_KEY` from the
    `observations` row it already joins; it does NOT read them from `kg_triples`
    and does NOT depend on the extractor's KG-native `BELONGS_TO`/`HAS_TOPIC`
    labels or its absent `HAS_TYPE`. Net: the metadata-derived labels are
    byte-for-byte legacy-compatible with no dependence on KG relation naming.

  Surfacing the richer KG-native relations (`USES`/`DEPENDS_ON`/`BELONGS_TO`/
  `HAS_TOPIC`/`HAS_SCOPE`/etc.) is explicitly OUT OF SCOPE for B1 and deferred to
  B2. Alternative (b) from the original fork (accept KG-native labels and migrate
  consumers) is NOT adopted: B1 preserves observable output.
- **CL-5 (RESOLVED — VERSION-BUMP-LABEL: MINOR; final confirmation at release).**
  The `observation_facts` drop is labeled a MINOR version bump. Rationale: it is
  an internal destructive table drop with a reconstructable, operator-triggered
  deterministic backfill and NO public-contract breakage — the `/graph` endpoint
  behavior, the portable export/import format (incl. `version`), the MCP tool
  surface, and the CLI command names are all preserved. The constitution **P3**
  "destructive migrations require MAJOR" clause is read as targeting destructive
  changes that lose data or break an observable contract; this drop loses no data
  (contents are fully derivable from `observations` and repopulated by
  `rebuild-graph`) and breaks no observable contract, so MINOR is the correct
  label. The final label is confirmed at release.
