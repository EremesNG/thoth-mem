# Delta for Knowledge Graph

## ADDED Requirements
### Requirement: Broad Memory Content MUST Be Extracted into Typed Knowledge Triples
Saved user prompts, observations, session-summary-like memory content, and conversation-like text MUST be processed into subject-relation-object triples with typed entities and typed relations.

#### Scenario: New memory content yields typed triples
- GIVEN new memory content is saved
- WHEN KG extraction runs
- THEN typed entities and typed relations MUST be persisted as triples

#### Scenario: Session-like content is included
- GIVEN session-summary-like or prompt-like content is saved through thoth-mem surfaces
- WHEN KG extraction runs
- THEN extraction MUST consider that content as eligible source material subject to privacy and content filters

### Requirement: Knowledge Graph Taxonomy MUST Be Broad Enough for Core Parity
The KG extractor MUST define a thoth-mem adapted taxonomy with at least 22 entity categories and at least 20 relation categories for broad subject-relation-object extraction.

#### Scenario: Taxonomy contains broad entity and relation coverage
- GIVEN the KG extraction taxonomy is initialized
- WHEN taxonomy metadata is inspected by tests or diagnostics
- THEN it MUST expose at least 22 entity categories and at least 20 relation categories

### Requirement: KG Records MUST Preserve Provenance and Confidence
Knowledge triples MUST include source linkage, extraction metadata, and confidence metadata for ranking/fusion.

#### Scenario: Triple includes source and confidence
- GIVEN a persisted triple
- WHEN retrieval/ranking reads KG evidence
- THEN source memory identity, extractor metadata, and confidence metadata MUST be available

### Requirement: KG Extraction MUST Be Idempotent and Update-Safe
KG extraction MUST converge safely across retries, restarts, and source-content updates without duplicating equivalent triples.

#### Scenario: Repeated extraction converges
- GIVEN the same source content is extracted more than once
- WHEN extraction results are persisted
- THEN equivalent triples MUST be upserted or deduplicated without duplicate ranking evidence

### Requirement: `observation_facts` MUST Remain Compatible as Graph-lite Fallback/Source
Existing graph-lite `observation_facts` behavior MUST remain compatible and may be used as fallback/source when broader KG extraction is unavailable or partial.

#### Scenario: Graph-lite remains queryable
- GIVEN broader KG extraction is degraded or incomplete
- WHEN graph retrieval is requested
- THEN `observation_facts`-backed graph-lite results MUST still be available

### Requirement: KG Evidence MUST Participate in Fused Retrieval Ranking
Graph/KG retrieval output MUST participate alongside sentence semantic, chunk semantic, and lexical FTS5 lanes in final ranking.

#### Scenario: KG contributes to fused ranked output
- GIVEN relevant KG evidence exists
- WHEN retrieval fusion executes
- THEN graph/KG evidence MUST be rankable and source-attributed in final output

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
  key and `triple_hash`)## MODIFIED Requirements

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
`observation_facts`).## MODIFIED Requirements
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

## ADDED Requirements (kg-multi-hop-recall, B2)

### Requirement: Entity-Anchored Multi-Hop Traversal MUST Surface Observations Reachable Through Shared Entities
Given seed observations, the system MUST perform bounded, bidirectional multi-hop traversal over `kg_triples` to return other observations reachable by shared entities, with seed entities resolved from `kg_triples` rows whose `source_id` is the seed observation.

#### Scenario: Two-hop neighbor is surfaced via a shared entity
- GIVEN a seed observation whose entity is linked to another observation's entity by an allowed relation
- WHEN traversal runs within `kgMaxDepth`
- THEN the reached observation MUST be returned and the seed MUST NOT be returned as reached

#### Scenario: Traversal is bidirectional across edge direction
- GIVEN a triple where the seed entity appears as object side
- WHEN traversal expands
- THEN traversal MUST follow from object to subject as well as subject to object

#### Scenario: Depth distinguishes evidence
- GIVEN observations at different hop distances from the same seed
- WHEN traversal returns reached observations
- THEN each reached observation MUST carry the hop depth

### Requirement: Multi-Hop Traversal MUST Follow Only the Configured Structural Relation Allow-List
Traversal MUST use the configured allow-list and not follow excluded metadata/synthetic relations. The default list is the 18 structural relations and excludes `HAS_WHAT`, `HAS_WHY`, `HAS_WHERE`, `HAS_LEARNED`, `HAS_TOPIC`, `HAS_SCOPE`, `MENTIONS`, `EXTRACTED_FROM`.

#### Scenario: Structural relations extend the frontier
- GIVEN a seed entity connected by a structural relation in the allow-list
- WHEN traversal runs
- THEN the adjacent observation MUST be eligible for projection

#### Scenario: Metadata relations do not extend the frontier
- GIVEN edges to neighbors only via excluded relations
- WHEN traversal runs
- THEN excluded edges MUST not contribute reached observations

### Requirement: Multi-Hop Traversal MUST Be Cycle-Guarded and Bounded
Traversal MUST terminate with `depth < kgMaxDepth`, must not revisit visited entities, and must cap reached observations by `kgNeighborhoodLimit`.

#### Scenario: Cycles terminate
- GIVEN a cycle in the graph
- WHEN traversal runs
- THEN it MUST terminate and not exceed the configured depth

#### Scenario: Neighborhood cap bounds a hub
- GIVEN a high-degree seed neighborhood and a small cap
- WHEN traversal runs
- THEN at most `kgNeighborhoodLimit` observations are returned

### Requirement: Multi-Hop Evidence MUST Carry KG Provenance, Confidence, and Bridge Path
Each reached observation MUST emit a `kg` lane candidate with `source: 'kg_multi_hop'`, KG provenance/confidence, and bridge-path text such as `"<seed entity> →(<relation>)→ <bridge entity>"`.

#### Scenario: Reached observation carries bridge-path evidence
- GIVEN a reached observation from one hop bridge
- WHEN evidence is emitted
- THEN `kg`/`kg_multi_hop` provenance, confidence, and bridge text MUST be present

## MODIFIED Requirements

## REMOVED Requirements

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


## ADDED Requirements (kg-supersedes-edges, B3)


> Sub-change **B3** (`kg-supersedes-edges`) of Change B. Builds on shipped B1
> (`graph-lite-consolidation`, `kg_triples` is the single graph-fact source) and
> B2 (`kg-multi-hop-recall`). Adds deterministic supersession (current-vs-stale)
> over `kg_triples` without deleting history (constitution **P5**).
>
> **RE-SCOPED MECHANISM (supersede-on-update / diff-based).** The prior detection
> mechanism — a deterministic CROSS-OBSERVATION `topic_key`-succession scan — was
> INERT in normal usage: a `topic_key` upsert updates the existing observation IN
> PLACE (`src/store/index.ts:1504`), and the shared deterministic writer DELETEs +
> reinserts that observation's own triples by `source_id`
> (`persistKgExtraction`, `src/indexing/jobs.ts:537`), so distinct observations
> never share `(topic_key, project, scope)` except via import/sync, and the
> per-observation `triple_hash` (`observation:${obs.id}:${tripleHash}`,
> `src/indexing/jobs.ts:552`) is wiped on every re-extract. The blind delete also
> violates **P5** (supersede-not-delete) at the graph layer. B3 now detects
> supersession by DIFFING an observation's PRIOR triple set against its
> NEWLY-EXTRACTED triple set on every re-extraction.

## ADDED Requirements

### Requirement: `SUPERSEDES` MUST Be Added to the KG Relation Vocabulary
The KG relation vocabulary (`KG_RELATION_TYPES`, `src/indexing/kg-extractor.ts:11-15`)
MUST include a `SUPERSEDES` relation name that is reserved for marking a newer
fact as superseding an older fact. `SUPERSEDES` is a META-relation kept distinct
from the structural traversal allow-list: it MUST NOT be a member of the default
multi-hop relation allow-list (`DEFAULT_KG_RELATION_ALLOW_LIST`, `src/config.ts`,
the 18 structural relations) so it never acts as an ordinary bridge edge in B2
traversal. Only `SUPERSEDES` is added in B3; `CONTRADICTS` and `REPLACES` are
explicitly deferred (CL-2).

#### Scenario: SUPERSEDES is a recognized relation
- GIVEN the KG relation vocabulary is initialized
- WHEN the relation set is inspected by tests or diagnostics
- THEN `SUPERSEDES` MUST be a recognized relation type

#### Scenario: SUPERSEDES is excluded from the structural traversal allow-list
- GIVEN the default multi-hop relation allow-list is resolved
- WHEN its members are inspected
- THEN `SUPERSEDES` MUST NOT be present in the default allow-list
- AND B2 multi-hop traversal MUST NOT follow `SUPERSEDES` as a bridge edge under
  the default allow-list

### Requirement: Supersession MUST Be Detected by Diffing an Observation's Re-Extracted Facts
On every re-extraction of an observation's deterministic facts (the shared writer
`writeDeterministicKgFacts` → `persistKgExtraction`, `src/indexing/jobs.ts:483,502`,
reached synchronously via `refreshGraphFacts`, `src/store/index.ts:1119-1126`, and
by the background `extract_kg` job and `rebuild-graph`), the system MUST detect
supersession DETERMINISTICALLY, with no embedding model and no remote service
(constitution **P2**), by DIFFING the observation's PRIOR triple set (the rows
already stored for that `source_id`) against the NEWLY-EXTRACTED triple set FOR
THAT SAME observation:

- A prior triple that is ABSENT from or CHANGED in the new set (a removed or
  replaced fact) MUST be MARKED superseded (see the store delta:
  `superseded_at` is set; `superseded_by_triple_id` is set to the replacing
  triple when one exists, else left NULL) and MUST be KEPT (NOT deleted).
- A triple present in BOTH sets (unchanged) MUST be left as-is — neither
  duplicated nor marked superseded.
- A triple NEW in the new set (no prior counterpart) MUST be inserted as a
  current (non-superseded) triple.

A triple's IDENTITY for the diff is its content identity (subject + relation +
object, as captured by the per-observation `triple_hash`), scoped to that one
observation's `source_id`. A REPLACEMENT is a prior triple whose SUBJECT and
RELATION match a new triple but whose OBJECT differs. The optional LLM path
(`kgLlm`, the background `extract_kg` job) MUST NOT be required for, and MUST NOT
gate, this deterministic diff supersession (CL-4); LLM enrichment MAY only add
supersession markings later, never remove deterministic ones.

#### Scenario: Updating a topic_key observation replaces a fact
- GIVEN an observation under a `topic_key` whose stored facts include `X`
- WHEN the observation is updated/upserted and its re-extracted facts replace `X`
  with `Y` (same subject + relation, different object)
- THEN the prior triple `X` MUST be marked superseded (kept, deprioritized)
- AND its `superseded_by_triple_id` MUST point at the replacing triple `Y`
- AND `Y` MUST be present as a current (non-superseded) triple

#### Scenario: Unchanged facts are not superseded
- GIVEN an observation whose stored facts include a triple `Z`
- WHEN the observation is re-extracted and `Z` is still present in the new set
- THEN `Z` MUST NOT be marked superseded
- AND `Z` MUST NOT be duplicated

#### Scenario: First-ever extraction supersedes nothing
- GIVEN an observation with no prior stored triples
- WHEN its facts are extracted for the first time
- THEN every extracted triple MUST be inserted as current
- AND no supersession marking MUST be produced (there is no prior fact to
  supersede)

#### Scenario: A removed fact with no replacement is superseded with a null pointer
- GIVEN an observation whose stored facts include a triple `X`
- WHEN the observation is re-extracted and `X` is absent from the new set with no
  same-subject-and-relation replacement
- THEN `X` MUST be marked superseded with `superseded_at` set
- AND `superseded_by_triple_id` MUST be NULL (pure removal, no replacing triple)

#### Scenario: Detection requires no model or remote service
- GIVEN the embedding model and the optional KG LLM are both unavailable
- WHEN an observation is re-extracted with a changed fact set
- THEN the diff supersession MUST still be detected and recorded

### Requirement: Content-Pattern Supersession Hints MUST Be Gated and Lower-Confidence
The system MUST support an OPTIONAL secondary signal that augments the diff:
content-pattern hints (phrases such as "no longer", "replaced by", "deprecated",
"changed to", "superseded by") that mark a fact as superseding a matching prior
fact even when the diff alone would not. Each detected hint MUST emit a
confidence value, and a content-pattern hint MUST contribute a supersession
marking ONLY when (a) the content-pattern detection flag is enabled (see the
config delta) AND (b) the emitted confidence is at or above the configured
supersession confidence threshold. Content-pattern hints MUST be LOWER confidence
than the primary diff signal. When the content-pattern flag is disabled, ONLY the
deterministic diff signal MUST drive supersession.

#### Scenario: Above-threshold content hint contributes a supersession marking
- GIVEN content-pattern detection is enabled and the configured threshold is met
- WHEN re-extracted content contains a recognized supersession phrase that matches
  a prior fact
- THEN that prior fact MUST be marked superseded

#### Scenario: Below-threshold content hint contributes nothing
- GIVEN content-pattern detection is enabled
- WHEN a content-pattern hint's emitted confidence is below the configured
  threshold
- THEN no supersession marking MUST be produced from that hint

#### Scenario: Disabled content-pattern flag uses only the diff signal
- GIVEN content-pattern detection is disabled
- WHEN content containing a supersession phrase is re-extracted
- THEN no content-pattern supersession marking MUST be produced
- AND diff-based supersession MUST still operate

### Requirement: Supersession MUST NOT Falsely Cross Unrelated Facts
Deterministic supersession MUST be scoped so a newer fact supersedes only prior
facts that are genuinely its predecessors. The diff signal MUST operate ONLY
within a SINGLE observation's own triple set (the rows sharing that `source_id`);
re-extracting one observation MUST NOT mark another observation's triples as
superseded. A REPLACEMENT MUST require a same-subject-and-relation match within
that observation; content-pattern supersession MUST require a concrete match
against a prior fact and MUST NOT broadly supersede unrelated facts.

#### Scenario: No supersession across different observations
- GIVEN two observations each with their own stored facts
- WHEN one observation is re-extracted
- THEN facts belonging to the other observation MUST NOT be marked superseded

#### Scenario: Non-matching content does not supersede
- GIVEN content-pattern detection is enabled
- WHEN re-extracted content has no recognized supersession phrase and the diff
  shows no removed or replaced prior fact
- THEN no supersession marking MUST be produced

### Requirement: Superseded Facts MUST Be Preserved, Not Deleted
Marking a fact as superseded MUST preserve the underlying fact and its history
(constitution **P5**: supersede, don't delete). On re-extraction the writer MUST
NOT blindly delete the observation's prior triples; a superseded triple MUST
remain present in `kg_triples` and MUST remain reachable by readers that request
history; supersession MUST only annotate the prior triple (via the supersession
columns in the store delta), never remove it. Re-extracting the same observation
with the SAME content MUST converge to the same triple set and supersede NOTHING
new (idempotent, reusing B1's `triple_hash` dedup discipline) and MUST NOT
accumulate duplicate triples or duplicate supersession markings.

#### Scenario: Superseded fact remains queryable as history
- GIVEN a fact has been marked superseded by a newer fact
- WHEN history-inclusive graph reads run
- THEN the superseded fact MUST still be present and retrievable
- AND it MUST NOT have been deleted from `kg_triples`

#### Scenario: Re-extracting identical content supersedes nothing
- GIVEN an observation whose triples are already stored
- WHEN the same observation is re-extracted with byte-identical content
- THEN the stored triple set MUST be unchanged
- AND no new supersession marking MUST be produced
- AND no duplicate triple MUST accumulate

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-1 (RESOLVED — OPTION B, explicit supersedes markings, deterministic):** B3
  implements explicit supersession marking with deterministic detection. There
  is NO bi-temporal `valid_at`/`invalid_at`, NO point-in-time/"as-of" queries,
  and NO LLM path. Option C (full bi-temporal + point-in-time + LLM-assisted
  contradiction detection) is deferred to a later sub-change / Change C. User
  confirmed Option B.
- **CL-2 (RESOLVED — only `SUPERSEDES`):** B3 adds ONLY the `SUPERSEDES` relation
  name. `CONTRADICTS` and `REPLACES` are deferred; they are added later only if a
  consumer needs the distinction.
- **CL-3 (RESOLVED — RE-SCOPED to on-update diff + threshold):** The PRIMARY
  signal is the per-observation DIFF of prior vs newly-extracted triples on every
  re-extraction (a prior fact absent/changed in the new set is superseded; a
  same-subject-and-relation, different-object new fact is the replacement),
  treated as HIGH confidence. The prior CROSS-OBSERVATION `topic_key`-succession
  scan is REMOVED because it was inert (in-place upsert + delete-by-`source_id`
  reinsert). The diff naturally fires on the common evolving-memory update case
  (a `topic_key` re-save re-extracts the same `source_id`). An OPTIONAL secondary
  signal is content-pattern hints ("no longer", "replaced by", "deprecated",
  "changed to", "superseded by"), emitted at LOWER confidence, gated by a flag
  AND a configurable confidence threshold (default in the config delta).
  Below-threshold hints contribute nothing.
- **CL-4 (RESOLVED — NO LLM in B3):** Deterministic diff supersession MUST NOT
  depend on the optional `kgLlm` path or the background `extract_kg` job
  (constitution **P2**). The diff applies inside the SHARED writer
  (`persistKgExtraction`) reached by BOTH the synchronous write and the
  `extract_kg` job, so behavior is consistent across both paths. LLM enrichment
  MAY only enrich (add) supersession markings later; it MUST NOT gate or remove
  deterministic supersession.
- **CL-7 (RESOLVED — MINOR version bump):** B3 is additive and backward-compatible
  (additive nullable columns, new relation name in the vocabulary, flag-gated
  behavior). Following the B1 CL-5 precedent, this is a MINOR bump; the
  constitution **P3** "destructive migrations require MAJOR" clause targets
  data-losing / contract-breaking migrations, which B3 is not. Confirmed at
  release.
- **FLAG-GATING (RESOLVED):** All B3 behavior is gated behind a master enable
  flag in the `knowledgeGraph` config block (env > persisted > default, the B2
  pattern). The flag DEFAULTS ON, gated by the eval no-regression gate (see the
  evals delta): if supersession-ON regresses the existing retrieval suite
  (including B2 multi-hop), the documented default flips OFF. With the flag OFF,
  the writer reverts to the pre-B3 delete-by-`source_id` + reinsert behavior and
  output is byte-identical to pre-B3.
- **Shared writer is `writeDeterministicKgFacts` / `persistKgExtraction`
  (code-accurate):** The proposal's `refreshObservationFacts` /
  `extractKnowledgeTriples` references are partial. Post-B1 the synchronous graph
  writer is `refreshGraphFacts` (`src/store/index.ts:1119-1126`) delegating to
  `writeDeterministicKgFacts` (`src/indexing/jobs.ts:483`), which calls
  `persistKgExtraction` (`src/indexing/jobs.ts:502`). `persistKgExtraction`
  currently does a blind `DELETE FROM kg_triples WHERE source_type='observation'
  AND source_id=?` (`:537`) then reinserts; B3 replaces that delete+reinsert with
  the diff-and-mark-superseded write. The legacy `observation_facts` writer is
  used only when `graphFactsSource = 'legacy'` and is out of scope for
  supersession.
- **Diff identity reuses `triple_hash` (code-accurate):** Triple content identity
  for the diff is the existing per-observation `triple_hash`
  (`observation:${obs.id}:${tripleHash}`, `src/indexing/jobs.ts:552`), which
  already encodes subject+relation+object content. The diff compares prior
  `triple_hash` set vs new `triple_hash` set for the same `source_id`;
  same-subject-and-relation/different-object replacement detection uses the
  resolved entity names + relation.
- **Confidence convention reuse:** Detection confidence reuses the existing
  extractor confidence convention (`RELATION_PATTERNS` confidences,
  `src/indexing/kg-extractor.ts:55-103`): the diff signal is high-confidence;
  content-pattern hints sit below it and are gated by the threshold.

## Delta from kg-superseded-pruning

# Delta for Knowledge Graph

> Change **C1** (`kg-superseded-pruning`) of Change C. Builds on shipped B3
> (`kg-supersedes-edges`), which replaced blind deletion of KG facts with
> supersede-not-delete: on re-extraction, removed/replaced triples are MARKED
> superseded (`superseded_by_triple_id`, `superseded_at`) and KEPT. B3 shipped the
> MARKING half of the lifecycle with NO retention mechanism, so superseded rows
> accumulate without bound, eroding the token-efficiency / bounded-recall goal
> (constitution **P4**). C1 closes the lifecycle by bounding that growth: it
> retains the N most-recent superseded triples per fact slot as recoverable
> history and prunes the older ones. CURRENT (non-superseded) facts are NEVER
> pruned.
>
> **P5 tension (disclosed).** B3's discipline is supersede-not-delete. C1
> intentionally DELETES old superseded rows, which sits in tension with that
> discipline. The framing is BOUNDED RETENTION that preserves the N most-recent
> supersession history, NOT a reversal of supersede-not-delete: current facts are
> never deleted and recent history is retained. The tension is explicit and is a
> candidate constitution-amendment note for a later phase.

## ADDED Requirements

### Requirement: Bounded Retention MUST Keep Only the N Most-Recent Superseded Triples Per Slot
The system MUST bound superseded-triple growth by a keep-N-most-recent-per-slot
retention policy. For each fact "slot", the system MUST retain only the
`kgSupersededKeepN` (see the config delta) most-recent SUPERSEDED triples and MUST
prune the older superseded triples in that slot. Recency MUST be ordered
DETERMINISTICALLY by `superseded_at` DESC, tie-broken by `id` DESC, so the same
database and the same `N` always yield the same retained set and the same prune
set (Success Criterion 5). CURRENT (non-superseded) triples — those with NULL
`superseded_at` AND NULL `superseded_by_triple_id` — MUST NEVER be pruned under any
trigger, regardless of how many exist in a slot. Pruning MUST require no embedding
model and no remote service (constitution **P2**).

A fact "slot" is the grouping key over which the keep-N window is counted. For C1
the slot MUST be `(source_id, subject_entity_id, relation)` — the per-slot window
is counted WITHIN a single observation's own triples, over each subject-entity +
relation pair, matching B3's per-observation, same-subject-and-relation
supersession-chain semantics. The slot MUST NOT cross observations: keep-N is
enforced independently per `source_id`, because B3 supersession is per-observation
per-slot and the writer's diff unit is the observation. See the resolved Decisions
below.

#### Scenario: A slot with more than N superseded triples is pruned to N
- GIVEN a slot with `N + k` superseded triples (`k > 0`) and any number of current
  triples
- WHEN retention is enforced for that slot with keep-N = `N`
- THEN exactly the `N` most-recent superseded triples (by `superseded_at` DESC,
  then `id` DESC) MUST be retained
- AND the older `k` superseded triples MUST be pruned
- AND every current (non-superseded) triple in the slot MUST remain

#### Scenario: A slot with exactly N superseded triples prunes nothing
- GIVEN a slot with exactly `N` superseded triples
- WHEN retention is enforced with keep-N = `N`
- THEN no triple MUST be pruned

#### Scenario: Current facts are never pruned regardless of count
- GIVEN a slot whose count of CURRENT (non-superseded) triples far exceeds `N`
- WHEN retention is enforced
- THEN no current triple MUST be pruned
- AND retention MUST act ONLY on superseded triples

#### Scenario: keep-N of zero prunes all superseded but keeps current
- GIVEN keep-N = `0` and a slot with superseded and current triples
- WHEN retention is enforced
- THEN every superseded triple in the slot MUST be pruned
- AND every current triple MUST remain

#### Scenario: Ties on superseded_at are broken deterministically by id
- GIVEN two superseded triples in a slot sharing the same `superseded_at` value at
  the keep-N boundary
- WHEN retention selects the retained set
- THEN the tie MUST be broken by `id` DESC so the retained/pruned partition is
  deterministic across repeated runs

### Requirement: Pruning MUST Be Deterministic and Repeatable
Pruning MUST be deterministic: the same database contents and the same
`kgSupersededKeepN` MUST always produce the same prune set (Success Criterion 5).
Re-running pruning after a prune with no intervening supersession MUST prune
nothing further (idempotent convergence). Pruning MUST NOT depend on wall-clock
time, iteration order, or any non-deterministic input.

#### Scenario: Repeated pruning converges
- GIVEN pruning has already run for a database with keep-N = `N`
- WHEN pruning runs again with the same `N` and no new supersession has occurred
- THEN no additional triple MUST be pruned

#### Scenario: Same inputs yield the same prune set
- GIVEN two identical database snapshots and the same `N`
- WHEN pruning computes the prune set for each
- THEN the two prune sets MUST be identical

### Requirement: Automatic Incremental Enforcement MUST Maintain the Cap Gated by the Master Flag
In addition to the manual op, the system MUST enforce the keep-N cap AUTOMATICALLY
during normal supersession so the cap is maintained in steady state without an
operator running the admin op. The automatic enforcement MUST run inside the shared
deterministic writer `persistKgExtraction` (`src/indexing/jobs.ts`), AFTER the B3
supersede-marking step, and MUST be scoped ONLY to the
`(source_id, subject_entity_id, relation)` slot(s) touched by the current write.
The automatic path MUST be gated so that the enforcement code path is entered ONLY
when the C1 master flag (`kgPruneEnabled`) is ON AND B3's `kgSupersedeEnabled` is
ON. When EITHER flag is OFF the enforcement path MUST NOT be entered, so the
supersession write path is byte-identical to pre-C1: no keep-N query, no prune, no
orphan cleanup, and no change to the write transaction shape. When both flags are
ON, after a supersession marking is written for an observation, the keep-N cap MUST
hold for the affected slot(s) (Success Criterion 1). The automatic enforcement MUST
reuse the same deterministic, transactional prune logic as the manual op (see the
store delta) so both triggers produce identical retention outcomes. (This clarify
pass pins the hook LOCATION and the gating PRINCIPLE; the exact implementation and
its byte-identical-when-disabled proof are detailed in design.)

#### Scenario: Cap holds in steady state with both flags on
- GIVEN `kgPruneEnabled` and `kgSupersedeEnabled` are both on and keep-N = `N`
- WHEN an observation is repeatedly updated so a slot would exceed `N` superseded
  triples
- THEN after each supersession write the slot MUST hold at most `N` superseded
  triples
- AND current facts MUST be unaffected

#### Scenario: Automatic enforcement is scoped to the slots the write touched
- GIVEN `kgPruneEnabled` and `kgSupersedeEnabled` are both on
- AND observation A owns superseded triples exceeding `N` in one of its slots
- WHEN a DIFFERENT observation B is written (touching only B's own slots) via the
  shared writer `persistKgExtraction`
- THEN the automatic enforcement MUST act only on the `(source_id,
  subject_entity_id, relation)` slots that observation B's write touched
- AND observation A's over-cap slot MUST be left unchanged by B's write

#### Scenario: Automatic path is byte-identical to pre-C1 when the master flag is off
- GIVEN `kgPruneEnabled` is off (B3 supersession may be on)
- WHEN an observation is saved, updated, upserted, or rebuilt
- THEN no incremental keep-N enforcement MUST run
- AND the supersession write path MUST issue no extra query and MUST preserve its
  pre-C1 transaction shape

#### Scenario: Automatic path is inert when supersession is off
- GIVEN `kgSupersedeEnabled` is off (so no rows are ever superseded)
- WHEN an observation is saved or rebuilt with `kgPruneEnabled` on
- THEN no automatic pruning MUST occur and behavior MUST be byte-identical to
  pre-C1

### Requirement: Pruning MUST NOT Delete Current Facts or Cross Unrelated Slots
Pruning MUST act only on superseded triples within the slot being bounded and MUST
NOT delete current facts, MUST NOT prune superseded triples belonging to a
different slot, and MUST NOT alter any triple's supersession markings on surviving
rows except as required by the referential-safety cleanup (see the store delta:
dangling `superseded_by_triple_id` refs pointing at pruned rows are NULLed). A
wrong slot key or off-by-one MUST NOT be able to delete more history than the
keep-N policy specifies.

#### Scenario: Pruning one slot does not touch another slot's history
- GIVEN two slots each holding more than `N` superseded triples
- WHEN retention is enforced for the first slot only (e.g. via the automatic path
  scoped to the affected slot)
- THEN only the first slot's excess superseded triples MUST be pruned
- AND the second slot's superseded triples MUST remain

#### Scenario: A surviving superseded row keeps its own markings
- GIVEN a retained superseded triple whose `superseded_by_triple_id` points at a
  triple that is NOT in the prune set
- WHEN pruning completes
- THEN that retained row's `superseded_at` and `superseded_by_triple_id` MUST be
  unchanged

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Builds on B3 supersession columns:** C1 reads the B3 supersession state
  (`superseded_at`, `superseded_by_triple_id` on `kg_triples`) to identify
  superseded rows; a row is CURRENT iff both are NULL. C1 adds no new columns to
  `kg_triples`; retention is query-driven (Success Criterion: no destructive DDL
  migration, no down-migration needed).
- **Recency ordering reuses B3's timestamp:** "Most-recent" superseded is ordered
  by `superseded_at` DESC then `id` DESC. `superseded_at` is the B3 marking
  timestamp; `id` is the monotonic `kg_triples` primary key, giving a total,
  deterministic order even when `superseded_at` ties.
- **Automatic-trigger determinism mirrors B3 flag-gating:** The automatic path is
  gated exactly like B3's write gating so flag-off is byte-identical. The primary
  signal that a slot may exceed the cap is a fresh supersession marking on the
  observation just written; the automatic path is scoped to the slot(s) that
  observation touched to keep steady-state batches small (the proposal's
  incremental-enforcement intent). The hook point is RESOLVED (see Decisions below):
  enforcement runs inside the shared writer `persistKgExtraction`
  (`src/indexing/jobs.ts`) after B3 supersede-marking, entered only when both flags
  are ON. The exact implementation and its byte-identical-when-disabled proof (a
  dedicated test, mirroring B3's guarantee) are detailed in design.
- **Reversibility limit (disclosed):** Rows pruned while the feature is ON are not
  recoverable from the KG; they can only be reconstructed by re-running
  `rebuild-graph` from source observations, which regenerates CURRENT facts, not
  historical superseded chains (this is inherent to bounded retention and is why
  the config delta's provisional default leans OFF).
- **Out of scope (from the proposal):** age/TTL-based pruning, confidence-threshold
  pruning, SQLite `VACUUM`/file-shrink, portable export/import format changes, any
  MCP tool surface change, and pruning CURRENT facts are all explicitly OUT OF
  SCOPE for C1.

## Decisions (resolved in clarify)
- **Fact "slot" definition (was: slot-key fork) — RESOLVED:** the slot is
  `(source_id, subject_entity_id, relation)`. keep-N is enforced per-observation
  (`source_id`) per subject-entity + relation pair and MUST NOT cross observations,
  because B3 supersession is per-observation per-slot and this matches the writer's
  diff unit. Encoded above in the slot-definition prose of the "Bounded Retention"
  requirement. (Not chosen: `(subject, relation, object)`, the coarser
  `(subject_entity_id, relation)` collapsing all objects across observations, or a
  pure per-source-observation key.)
- **Automatic-trigger hook point (was: hook-point + flag-off byte-identity fork) —
  RESOLVED:** enforcement runs INSIDE the shared deterministic writer
  `persistKgExtraction` (`src/indexing/jobs.ts`), AFTER the B3 supersede-marking
  step, scoped only to the slots the current write touched. The enforcement path is
  entered ONLY when `kgPruneEnabled` AND `kgSupersedeEnabled` are both ON; when
  either is OFF the path is not entered, giving byte-identical-to-pre-C1 behavior.
  Clarify pins the hook LOCATION and gating PRINCIPLE; design details the
  implementation and the dedicated byte-identical-when-disabled test.



# Delta for Community Summaries LazyGraphRAG

## ADDED Requirements

### Requirement: Communities MUST Be Derived From the Consolidated Project-Scoped Knowledge Graph
The system MUST derive community partitions only from the consolidated knowledge graph (`kg_entities` + `kg_triples`) scoped to a single project. Community construction MUST NOT read, recreate, or depend on the retired `observation_facts` table, and MUST NOT create a parallel graph-fact source of truth. Community membership MAY reference source observations and KG rows for provenance, but the authoritative graph facts remain `kg_entities` + `kg_triples`.

#### Scenario: Project communities derive from KG rows
- GIVEN two projects with KG entities and triples
- WHEN community construction runs for one project
- THEN only that project's KG-derived graph MUST be partitioned
- AND the resulting community artifacts MUST reference KG/source provenance
- AND no `observation_facts` read or write MUST occur

#### Scenario: Empty KG produces valid degraded output
- GIVEN a project has no eligible KG triples
- WHEN community construction runs
- THEN the operation MUST complete without error
- AND it MUST record a degraded or empty partition state rather than inventing communities

### Requirement: Community Partitioning MUST Be Deterministic and Dependency-Light for MVP
The MVP community algorithm MUST be deterministic for identical KG inputs and configuration, MUST require no embeddings, remote services, or LLMs, and MUST include a connected-components fallback. A Louvain-style or Leiden-style algorithm MAY be selected when a deterministic, Node-friendly implementation is validated, but exact Leiden SHALL NOT be required for MVP correctness.

#### Scenario: Connected-components fallback is sufficient
- GIVEN community construction is enabled and no advanced clustering implementation is available
- WHEN a project's KG is partitioned
- THEN connected components MUST produce deterministic communities
- AND summary generation MUST still be eligible to run

#### Scenario: Same graph and config produce same partition
- GIVEN the same project KG snapshot and community configuration
- WHEN community construction runs twice
- THEN community identifiers, memberships, and ordering MUST be stable or reproducibly mapped by content-derived version metadata

### Requirement: Community Summaries MUST Be Bounded, Extractive, and Source-Attributed
Each community summary MUST be a bounded derived artifact generated from community member entities, triples, and source observations. The required baseline summary MUST be deterministic and extractive. It MUST carry source/provenance metadata sufficient to explain the entities, triples, source observations, algorithm, summary generator, freshness/version, and degraded state used to produce it.

#### Scenario: Summary is bounded and source-attributed
- GIVEN a community contains many entities, triples, and source observations
- WHEN its summary is generated
- THEN the summary text MUST stay within configured summary budgets
- AND it MUST include provenance metadata linking back to contributing KG/source evidence

#### Scenario: Extractive summary works offline
- GIVEN embeddings, remote services, and LLM providers are unavailable
- WHEN community summary generation runs
- THEN deterministic extractive summaries MUST still be produced or an explicit degraded state MUST be recorded
- AND rebuild success MUST NOT depend on LLM summarization

### Requirement: Optional LLM Enrichment MUST Be Additive and Fallback-Safe
Optional LLM enrichment MAY improve or annotate a deterministic community summary, but it MUST NOT be required for indexing-time correctness, recall availability, partition construction, or rebuild success. If enrichment fails, times out, is disabled, or exceeds budget, the deterministic extractive summary MUST remain valid and the artifact MUST signal the enrichment state.

#### Scenario: LLM enrichment failure preserves deterministic summary
- GIVEN a deterministic community summary exists
- AND optional LLM enrichment is enabled
- WHEN enrichment fails or times out
- THEN the deterministic summary MUST remain available
- AND the community artifact MUST record the enrichment failure/degraded state

### Requirement: Community Freshness MUST Track KG Versions and Maintenance State
Community artifacts MUST record freshness metadata that allows readers and admin surfaces to distinguish fresh, stale, missing, rebuilding, failed, and degraded community-summary states. Freshness MUST account for KG changes that alter eligible entities/triples, source observation changes, supersession markings, and pruning of superseded KG rows.

#### Scenario: KG change marks community summaries stale
- GIVEN community summaries were built for a project
- WHEN eligible KG entities or triples for that project change
- THEN the affected project community state MUST be detectable as stale or rebuilding before summaries are consumed as fresh evidence

#### Scenario: Pruning does not delete source memories
- GIVEN C1 pruning removes older superseded KG triples
- WHEN community summaries are rebuilt
- THEN source observations MUST remain untouched
- AND community artifacts MUST reflect the surviving KG/source evidence and the rebuild version

### Requirement: Community Construction MUST Respect Supersession and Pruning Semantics
Community construction and summaries MUST prefer current KG facts over superseded facts while preserving explicit degraded/history indicators when retained superseded evidence contributes. Pruned superseded triples are absent from community evidence, but pruning MUST NOT trigger source memory deletion or portable export/import changes.

#### Scenario: Current facts are preferred in summaries
- GIVEN a community contains current and retained superseded triples
- WHEN the summary evidence is selected
- THEN current facts MUST be preferred in extracted summary text
- AND any retained superseded evidence used MUST be flagged as historical or superseded

## Merged change: pre-multiharness-foundations (knowledge-graph)

# Delta for Knowledge Graph

## ADDED Requirements
### Requirement: Community Health MUST Use a Stable Graph Freshness Basis
Community-summary health MUST be based on a stable graph freshness basis or graph signature that can determine whether committed community summaries match the current project KG state. The basis MUST account for eligible KG entities/triples, source observation coverage, supersession markings, and pruning effects relevant to community construction.

#### Scenario: Matching graph basis reports fresh
- GIVEN a committed community summary records a graph freshness basis
- AND the current project KG state matches that basis
- WHEN community health is computed
- THEN the community state MUST be eligible to report `fresh`

#### Scenario: Changed KG reports stale
- GIVEN committed community summaries were built for a prior graph basis
- AND eligible KG triples, entities, source observation coverage, supersession markings, or pruning state changes
- WHEN community health is computed
- THEN the community state MUST be `stale` or `rebuilding`
- AND stale summaries MUST NOT be reported as fresh evidence

### Requirement: Community Health Coverage MUST Be Bounded and Source-Attributed
The knowledge-graph/community layer MUST provide bounded coverage metadata for community health, including source observation coverage, eligible KG entity/triple coverage, community count or missing count, and summary bounds. Coverage metadata MUST be source-attributed by ids/counts/signatures and MUST NOT require raw source text.

#### Scenario: Coverage metadata is available
- GIVEN community summaries exist for a project
- WHEN community health metadata is read
- THEN source observation count, eligible entity/triple count, community count, and coverage percentages or ratios MUST be available where computable
- AND the metadata MUST identify the graph basis used

#### Scenario: Sparse or missing coverage is explicit
- GIVEN a project has too little KG/community coverage to trust community summaries
- WHEN community health metadata is read
- THEN sparse, missing, or degraded coverage MUST be explicitly reported
- AND retrieval or rollout consumers MUST be able to avoid treating the summaries as fresh evidence

### Requirement: Community Job State MUST Reflect Rebuild, Failure, and Degraded Conditions
The KG/community layer MUST retain enough latest job metadata for health readers to distinguish rebuilding, failed, degraded, missing, disabled, stale, and fresh states. A failed rebuild MUST leave the previous committed community artifacts readable but MUST NOT cause health readers to report them as fresh for the current graph basis.

#### Scenario: Failed rebuild leaves previous artifact readable but not fresh
- GIVEN a previous committed community summary exists
- AND a later rebuild fails for the current graph state
- WHEN community health is computed
- THEN latest job state MUST be `failed`
- AND the previous artifact MAY remain readable
- BUT it MUST NOT be reported as fresh for the current graph basis

#### Scenario: Rebuilding state is visible
- GIVEN a community rebuild is in progress or marked running
- WHEN community health is computed
- THEN the community state MUST be `rebuilding`
- AND health output MUST include bounded latest job metadata

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- The graph freshness basis may reuse existing community run metadata if it already detects KG/signature changes; otherwise design may add a bounded derived signature.
- Community health is a diagnostic/readiness view, not a new community construction algorithm and not a GraphRAG global-answer feature.

## Handoff Hints
- Design should locate the existing community run/artifact metadata first and add only the minimal freshness basis needed for reliable health.
- Verification should cover fresh, stale, rebuilding, failed, degraded, missing, and disabled states.
