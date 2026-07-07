# Delta for Retrieval

## ADDED Requirements
### Requirement: Hybrid Retrieval MUST Fuse Four Lanes
The retrieval engine MUST execute sentence-semantic, chunk-semantic, lexical FTS5, and graph/KG lanes and fuse them into one ranked result set.

#### Scenario: Fused output contains all available lanes
- GIVEN sentence vectors, chunk vectors, FTS5, and graph/KG retrieval are available
- WHEN a retrieval query executes
- THEN final ranked results MUST include fused evidence from all four lanes

### Requirement: Semantic Retrieval MUST Use sqlite-vec KNN Defaults
Sentence and chunk semantic retrieval lanes MUST execute KNN via sqlite-vec `vec0` virtual tables using `MATCH`, `distance`, and bounded top-k queries. Unless explicitly reconfigured, sentence top-k MUST be `100`, chunk top-k MUST be `20`, and semantic evidence below score `0.30` MUST be filtered out.

#### Scenario: Sentence lane uses vec0 MATCH query with default k
- GIVEN sentence vectors are indexed in sqlite-vec
- WHEN sentence semantic retrieval runs
- THEN the query MUST use sqlite-vec `MATCH`, rank by `distance`, and request default top-k `100`

#### Scenario: Chunk lane uses vec0 MATCH query with default k
- GIVEN chunk vectors are indexed in sqlite-vec
- WHEN chunk semantic retrieval runs
- THEN the query MUST use sqlite-vec `MATCH`, rank by `distance`, and request default top-k `20`

#### Scenario: Low-score semantic evidence is filtered
- GIVEN semantic evidence has converted score below `0.30`
- WHEN retrieval candidates are filtered
- THEN that evidence MUST NOT contribute to final ranked output

### Requirement: sqlite-vec Distance MUST Be Converted to Comparable Scores
The retrieval engine MUST convert sqlite-vec semantic distance into normalized scores before thresholding/fusion. For default L2 distance, conversion MUST be `score = exp(-distance / 20)` unless a future metric explicitly defines and tests another conversion.

#### Scenario: L2 distance is converted consistently
- GIVEN sqlite-vec returns an L2 distance for semantic evidence
- WHEN the score is computed
- THEN the default conversion MUST use `exp(-distance / 20)` and produce monotonically lower scores for larger distances

### Requirement: HyDE MUST Use Raw Query and Hypothetical Answer Embeddings
HyDE retrieval MUST always embed the raw query. When HyDE is enabled and generation succeeds, the system MUST also embed the generated hypothetical answer as a separate semantic input and fuse raw-query and HyDE semantic candidates. HyDE failure, timeout, or disablement MUST leave raw-query semantic retrieval available.

#### Scenario: Raw query and HyDE answer both contribute
- GIVEN HyDE is enabled and returns a hypothetical answer
- WHEN semantic retrieval executes
- THEN sentence and chunk semantic lanes MUST consider both raw-query embedding results and hypothetical-answer embedding results during fusion

#### Scenario: HyDE failure falls back to raw query only
- GIVEN HyDE is enabled and generation fails or times out
- WHEN retrieval proceeds
- THEN semantic lanes MUST continue using the raw-query embedding without failing overall retrieval

### Requirement: FTS5 Lexical Retrieval MUST Use Sanitized Prefix Matching
The lexical lane MUST build a sanitized FTS5 prefix query from eligible query tokens, using `token*` terms joined by `OR`, and MUST use a default lexical limit of `20` unless explicitly reconfigured.

#### Scenario: Prefix query catches lexical variants
- GIVEN a query token such as `encrypt`
- WHEN the FTS5 lexical query is built
- THEN the query MUST include a sanitized prefix term like `encrypt*` so variants such as `encryption` can be recalled

#### Scenario: FTS5 tokenization avoids unsafe or low-value terms
- GIVEN a query contains punctuation or very short tokens
- WHEN the FTS5 prefix query is built
- THEN punctuation MUST be stripped and ineligible short tokens MUST be omitted before joining prefix terms with `OR`

### Requirement: Sentence-Level Precision MUST Use Surgical Trimming Under Clear Conditions
When one or more sentence semantic evidence items for a result meet or exceed the sentence score threshold (`0.30` by default), the primary returned evidence for that result MUST be the matching sentence text rather than the full parent chunk. Parent chunk/observation context MAY be promoted separately by small-to-big retrieval when broader context is required.

#### Scenario: Strong sentence hit returns trimmed evidence
- GIVEN a sentence semantic hit has score at or above the configured sentence threshold
- WHEN retrieval output is assembled
- THEN the primary evidence text MUST include the matching sentence text and MUST NOT replace it with the entire parent chunk by default

#### Scenario: Parent context is promoted separately
- GIVEN trimmed sentence evidence is precise but insufficient for answerability
- WHEN small-to-big promotion is triggered
- THEN parent chunk or observation context MUST be attached with lineage while preserving the trimmed sentence as sentence evidence

### Requirement: Retrieval MUST Degrade by Lane, Not Globally
If sqlite-vec cannot load, vec tables are unavailable, semantic index state is stale/rebuilding, or semantic providers time out, semantic lanes MUST be degraded while lexical FTS5 + graph/KG lanes continue.

#### Scenario: Semantic degraded, lexical and graph/KG remain available
- GIVEN semantic retrieval cannot execute due to sqlite-vec or index state issues
- WHEN retrieval is requested
- THEN the system MUST return lexical + graph/KG results with explicit degraded-state signaling and no global hard-failure

### Requirement: Recent Saves MUST Have Explicit Eventual Semantic Consistency
A newly saved or updated memory item MUST be available through primary persistence and lexical/graph-compatible paths immediately, while sentence/chunk semantic recall MAY remain pending until background indexing completes. Retrieval output MUST be able to signal that semantic coverage is pending or degraded for such content.

#### Scenario: Newly saved content is lexical before semantic indexing completes
- GIVEN content has just been saved and semantic background jobs are still pending
- WHEN retrieval is requested for that content
- THEN lexical FTS5 and graph/KG-compatible results MUST remain available and semantic state MUST indicate pending or degraded coverage

## MODIFIED Requirements

## ADDED Requirements (kg-multi-hop-recall, B2)

### Requirement: Multi-Hop KG Evidence MUST Fuse as a Lower-Weighted Sub-Source of the KG Lane
Entity-anchored multi-hop traversal evidence MUST be emitted as `LaneCandidate` entries with `lane: 'kg'` and `source: 'kg_multi_hop'`, then fused through existing `fuseCandidates` so multi-hop observations can be introduced into final output. Their effective contribution MUST be strictly below direct KG (default `0.7` vs `0.9`) via sub-source weighting or score pre-scaling; four-lane fusion remains unchanged.

#### Scenario: Multi-hop introduces a new observation into fused output
- GIVEN a reachable observation with no direct lexical/semantic/KG match
- WHEN fusion runs
- THEN that observation MAY appear with `lane: 'kg'` and `source: 'kg_multi_hop'`

#### Scenario: Multi-hop ranks below an otherwise-equal direct match
- GIVEN equal-strength direct and multi-hop candidates
- WHEN scoring is computed
- THEN multi-hop contribution MUST be lower than direct KG

#### Scenario: Four-lane contract is preserved
- GIVEN multi-hop is enabled
- WHEN fusion runs
- THEN lane set remains `sentence`, `chunk`, `lexical`, `kg`

### Requirement: Multi-Hop Candidates MUST Be De-Duplicated by Observation With Direct Evidence Winning
When the same observation is reached both directly and via multi-hop, de-duplication by `observationId` MUST keep a single output row and direct evidence must remain primary.

#### Scenario: Direct hit wins primary evidence over multi-hop
- GIVEN an observation produced by direct and multi-hop candidates
- WHEN primary evidence is selected
- THEN direct evidence MUST win and the row appears once

### Requirement: Multi-Hop Evidence MUST Attenuate by Hop Depth
Depth penalty MUST apply so depth-2 evidence is lower than depth-1 via `score = confidence * kgDepthDecay^(depth-1)` with `kgDepthDecay` default `0.5`.

#### Scenario: Depth-2 evidence scores below depth-1 evidence
- GIVEN two reached observations with equal confidence at depths 1 and 2
- WHEN scoring is computed
- THEN the depth-2 score MUST be lower

### Requirement: Multi-Hop Must Degrade to Single-Hop Baseline
When disabled or bounded by timeout/error, the engine MUST return the full direct result without hard-fail and signal `degradedFallback` for multi-hop.

#### Scenario: Disabled flag yields identical baseline output
- GIVEN `kgMultiHopEnabled = false`
- WHEN `hybridRetrieve` runs
- THEN no multi-hop candidates are produced and results are identical to baseline

#### Scenario: Cost-bound degrade returns complete direct result
- GIVEN traversal exceeds the allowed cost or errors
- WHEN retrieval completes
- THEN complete direct-lane result is returned and `degradedFallback` includes `kg_multi_hop`

## MODIFIED Requirements

## REMOVED Requirements


## ADDED Requirements (kg-supersedes-edges, B3)


> Sub-change **B3** (`kg-supersedes-edges`). Superseded KG facts are
> deprioritized in fusion AND in the B2 multi-hop traversal so retrieval prefers
> current truth, without dropping history (constitution **P5**) and without
> changing the four-lane contract. Flag-off output is byte-identical to pre-B3.

## ADDED Requirements

### Requirement: Superseded KG Evidence MUST Be Deprioritized in Fusion While Preserving the Four-Lane Contract
When the supersession flag is enabled, KG-lane evidence carrying a superseded
marker (from `queryKnowledgeLane`, see the store delta) MUST contribute a
strictly lower effective score than otherwise-equal current KG evidence, so a
current fact ranks above its superseded version after `fuseCandidates`
(`src/retrieval/ranking.ts:46`). Deprioritization MUST be achieved by
down-weighting or pre-scaling the superseded candidate's score, NOT by removing
it: the superseded observation MAY still appear in fused output, flagged. The
existing four-lane contract MUST be preserved — the lane set MUST remain
`sentence`, `chunk`, `lexical`, `kg` (the "Fuse Four Lanes" and "Degrade by Lane"
requirements are unchanged), and the B2 direct-vs-multi-hop sub-source weighting
(`0.9` direct vs `0.7` multi-hop) MUST remain in force.

#### Scenario: Current fact outranks its superseded version after fusion
- GIVEN a current KG candidate and a superseded KG candidate for the same query,
  otherwise equal in strength
- WHEN fusion runs with the flag enabled
- THEN the current fact's observation MUST rank above the superseded fact's
  observation

#### Scenario: Superseded evidence is flagged, not removed, in fused output
- GIVEN a superseded KG candidate participates in fusion
- WHEN fused output is assembled
- THEN the superseded evidence MUST still be representable in output with a
  superseded marker
- AND it MUST NOT be silently dropped

#### Scenario: Four-lane contract is preserved under supersession
- GIVEN the supersession flag is enabled
- WHEN fusion runs
- THEN the lane set MUST remain `sentence`, `chunk`, `lexical`, `kg`

### Requirement: Multi-Hop Traversal MUST Prefer Current Truth Over Superseded Edges
When the supersession flag is enabled, the B2 multi-hop traversal
(`queryKnowledgeMultiHopLane` / `buildKnowledgeMultiHopTraversalSql`,
`src/store/index.ts:2166-2325+`) MUST prefer current truth: superseded edges
(triples whose `superseded_by_triple_id` OR `superseded_at` is non-NULL) MUST be
deprioritized or skipped as bridge edges so the traversal frontier favors current
facts. The
existing B2 bounds MUST be unchanged: the cycle-guard, `kgMaxDepth`,
`kgNeighborhoodLimit`, the relation allow-list, the bidirectional expansion, and
the coarse elapsed-guard degrade behavior all remain exactly as in B2. When the
flag is OFF, traversal MUST issue the same query and produce baseline-identical
results to pre-B3 (no supersession predicate is applied).

#### Scenario: Superseded bridge edge does not advance the frontier preferentially
- GIVEN a current bridge edge and a superseded bridge edge to two different
  neighbors
- WHEN multi-hop traversal expands with the flag enabled
- THEN the neighbor reached via the current edge MUST be preferred over the one
  reached only via the superseded edge

#### Scenario: B2 bounds are unchanged under supersession
- GIVEN the supersession flag is enabled
- WHEN multi-hop traversal runs over a bounded neighborhood
- THEN cycle-guard, `kgMaxDepth`, `kgNeighborhoodLimit`, the relation allow-list,
  and bidirectional expansion MUST behave exactly as in B2

#### Scenario: Flag-off traversal is baseline-identical
- GIVEN the supersession flag is disabled
- WHEN multi-hop traversal runs
- THEN the traversal query and its results MUST be identical to pre-B3 (no
  supersession predicate applied)

### Requirement: Supersession Deprioritization MUST Be Byte-Identical to Baseline When Disabled
With the supersession flag OFF, the entire retrieval path (direct KG lane fusion
and multi-hop traversal) MUST be byte-identical to pre-B3 behavior: no
supersession column MUST be read in a way that changes candidate shape, scores,
ordering, or degrade signaling.

#### Scenario: Disabled flag yields identical retrieval output
- GIVEN `kgMultiHopEnabled` is unchanged from baseline and the supersession flag
  is disabled
- WHEN `hybridRetrieve` runs for any query
- THEN fused output MUST be identical to pre-B3 baseline output

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Re-scope is transparent to retrieval:** B3's detection mechanism changed
  (per-observation on-update DIFF instead of a cross-observation `topic_key` scan
  — see the knowledge-graph and store deltas), but retrieval reads supersession
  ONLY through the `superseded_by_triple_id` / `superseded_at` columns. The
  deprioritization semantics here are unchanged by the re-scope: any triple with a
  non-NULL supersession column is deprioritized + flagged regardless of how it was
  marked.
- **CL-1 (RESOLVED — deterministic deprioritization, no point-in-time):**
  Retrieval treats supersession purely as a deterministic down-weight + flag.
  There is no point-in-time/"as-of" retrieval mode (Option C, deferred).
- **CL-6 (RESOLVED — deprioritize, not hide, in retrieval):** Both the direct KG
  lane and multi-hop traversal DEPRIORITIZE superseded facts and keep them
  reachable/flagged; they do NOT hide them. Hiding-by-default applies only to
  `mem_project action=graph` (see the tools delta).
- **Multi-hop "skip vs deprioritize" default (RESOLVED — deprioritize):** Per the
  proposal's risk mitigation, the default is to DEPRIORITIZE superseded bridge
  edges rather than hard-skip, to limit frontier disruption; a hard-skip MAY be
  offered behind a knob but is not required by this spec. Either way the B2
  eval cases MUST show no regression (see the evals delta).
- **Lane-weight constants (code-accurate):** `DEFAULT_LANE_WEIGHTS.kg = 0.9`
  (`src/retrieval/ranking.ts:5-10`); B2 multi-hop effective weight defaults to
  `0.7` via `kgMultiHopWeight`. B3 deprioritization is applied on top of these
  and MUST keep direct-KG strictly above multi-hop and current strictly above
  superseded.
- **FLAG-GATING (RESOLVED):** Gated behind the `knowledgeGraph` master enable
  flag (env > persisted > default), default ON gated by the eval no-regression
  gate. Flag-off = byte-identical pre-B3 retrieval.

## Delta from kg-superseded-pruning

# Delta for Retrieval

> Change **C1** (`kg-superseded-pruning`). C1 bounds how many superseded
> `kg_triples` rows exist; it does NOT change how retrieval scores or fuses
> candidates. Pruned rows simply stop appearing (they were already deprioritized,
> not surfaced as current, under B3). The four-lane contract, the B3 supersession
> deprioritization, and the B2 multi-hop bounds are all UNCHANGED. This delta
> exists to lock the preserved-contract guarantee: retrieval MUST NOT regress
> because of pruning, and the retrieval read path MUST be byte-identical to pre-C1
> when the C1 master flag is off.

## ADDED Requirements

### Requirement: Retrieval Read Path MUST Be Unchanged by Pruning
C1 MUST NOT add, remove, or alter any predicate, weight, lane, or scoring step in
the retrieval read path (`queryKnowledgeLane`, `src/store/index.ts` ~2107/~2139;
the B3 supersession deprioritization; and the B2 multi-hop traversal
`queryKnowledgeMultiHopLane`, ~2279). Pruning only removes old superseded ROWS;
for any query, the retrieval output over the surviving rows MUST be exactly what
pre-C1 retrieval would have produced over those same surviving rows. Retrieval MUST
NOT read any C1 config knob (`kgPruneEnabled`, `kgSupersededKeepN`,
`kgPruneOrphanEntities`) and MUST NOT branch on pruning state.

#### Scenario: Retrieval output depends only on surviving rows, not on pruning
- GIVEN two databases that are identical except that one has had old superseded
  triples pruned and the other has not, where the pruned rows are all superseded
  (never current)
- WHEN the same query runs against both
- THEN the ranked retrieval output over the CURRENT and RETAINED-superseded rows
  MUST be identical (the only difference is that pruned superseded rows are absent
  from the not-yet-pruned database's history tail)

#### Scenario: Current facts are unaffected in retrieval after pruning
- GIVEN a query whose best answer is a current (non-superseded) fact
- WHEN pruning has removed older superseded triples in that fact's slot
- THEN the current fact MUST still rank and surface exactly as it did pre-prune

#### Scenario: B3 deprioritization and B2 multi-hop bounds are unchanged
- GIVEN the B3 supersession deprioritization and the B2 multi-hop traversal are in
  force
- WHEN retrieval runs after C1 is applied
- THEN the four-lane contract (`sentence`, `chunk`, `lexical`, `kg`), the
  current-above-superseded deprioritization, and the B2 bounds (cycle-guard,
  `kgMaxDepth`, `kgNeighborhoodLimit`, allow-list, bidirectional expansion,
  elapsed-guard degrade) MUST all behave exactly as before C1

### Requirement: Retrieval MUST Be Byte-Identical to Pre-C1 When the Master Flag Is Off
With the C1 master flag (`kgPruneEnabled`) off, the entire retrieval path MUST be
byte-identical to pre-C1 behavior (Success Criterion 4). Because retrieval never
reads C1 knobs, this holds trivially, but it MUST be asserted: no candidate shape,
score, ordering, or degrade signaling MUST differ from pre-C1 as a result of C1
being present in the codebase.

#### Scenario: Flag-off retrieval is byte-identical to pre-C1
- GIVEN `kgPruneEnabled` is off
- WHEN `hybridRetrieve` runs for any query
- THEN the fused output MUST be identical to pre-C1 baseline output

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Pruning acts only on already-deprioritized rows:** Under B3, superseded
  triples are already deprioritized and flagged in retrieval, never surfaced as
  current truth. C1 removes the OLDEST of those superseded rows, so the practical
  retrieval effect is limited to the deep history tail; current-fact retrieval is
  unaffected.
- **No point-in-time retrieval:** C1 does not add any "as-of"/point-in-time mode
  (that remains deferred, per B3 CL-1). Retrieval continues to treat supersession
  purely as B3's deterministic down-weight + flag.
- **C1 knobs are not retrieval inputs:** `kgPruneEnabled`/`kgSupersededKeepN`/
  `kgPruneOrphanEntities` govern the write/prune path only; retrieval reads none of
  them, which is what makes the flag-off byte-identity trivial and the
  "output-depends-only-on-surviving-rows" guarantee hold.



# Delta for Community Summaries LazyGraphRAG

## ADDED Requirements

### Requirement: Community Evidence MUST Remain Inside the Existing KG Lane
Community summaries MAY contribute evidence to recall and project-summary context only as a sub-source of the existing `kg` lane. The retrieval lane set MUST remain exactly `sentence`, `chunk`, `lexical`, and `kg`; no fifth community, summary, global, or GraphRAG lane SHALL be introduced.

#### Scenario: Community summary appears as KG sub-source
- GIVEN fresh community summaries exist for a project
- WHEN `mem_recall` retrieves evidence relevant to a community
- THEN any community-summary evidence MUST carry `lane: 'kg'` with a community-specific sub-source or annotation
- AND the lane set MUST remain `sentence`, `chunk`, `lexical`, and `kg`

### Requirement: Community Evidence MUST Be Bounded and Rank-Safe
Community-summary evidence MUST be bounded by configured result and character budgets, MUST be source-attributed, and MUST NOT swamp direct KG or B2 multi-hop evidence. Direct KG evidence MUST remain primary over otherwise-equal community-summary evidence, and community evidence MUST be de-duplicated by observation/project context so it does not create repeated output for the same source cluster.

#### Scenario: Direct KG evidence outranks community evidence
- GIVEN a direct KG candidate and a community-summary candidate are otherwise equally relevant
- WHEN fused retrieval ranks results
- THEN the direct KG candidate MUST rank above the community-summary candidate

#### Scenario: Community evidence obeys output bounds
- GIVEN a query matches many community summaries
- WHEN recall output is assembled
- THEN community-summary text MUST be capped by configured budgets
- AND output MUST report boundedness or omitted community evidence

### Requirement: Retrieval MUST Degrade Gracefully When Community Summaries Are Unavailable
When community summaries are disabled, missing, stale, rebuilding, failed, or enrichment-degraded, retrieval MUST continue using the existing sentence, chunk, lexical, direct KG, and multi-hop KG behavior. Degraded community state MUST be signaled when relevant, and retrieval MUST NOT globally fail because community summaries are unavailable.

#### Scenario: Missing summaries fall back to existing retrieval
- GIVEN community summaries have not been built for a project
- WHEN recall runs
- THEN retrieval MUST return the existing four-lane baseline results
- AND it MUST NOT throw due to missing community artifacts

#### Scenario: Stale summaries are not ranked as fresh
- GIVEN community summaries are marked stale
- WHEN recall runs
- THEN stale community text MUST NOT be treated as fresh evidence
- AND degraded/stale state SHOULD be visible to callers when community evidence would otherwise have contributed

### Requirement: Community Summaries MUST Not Implement Full GraphRAG Global Answer Synthesis
Retrieval integration MUST NOT add full GraphRAG global answer synthesis, query-time subquery generation, or LLM-based query planning as part of this MVP. Community summaries may provide bounded evidence snippets, annotations, or project-summary context; answer synthesis remains the caller's responsibility.

#### Scenario: Query does not trigger subquery generation
- GIVEN community summaries are enabled
- WHEN a recall query is executed
- THEN the system MUST retrieve bounded evidence from existing lanes
- AND it MUST NOT generate query-time subqueries or a global synthesized answer

### Requirement: Project Summary and Recall Output MAY Annotate Community Evidence
`mem_recall` and project summary consumers MAY annotate output with community identifiers, summary freshness, source coverage, and degraded/enrichment state when community evidence contributes. Such annotations MUST be compact, bounded, and must not hide the source observations required for full-detail escalation through existing recall/get flows.

#### Scenario: Recall includes compact community annotation
- GIVEN a fresh community summary contributes to a recall result
- WHEN `mem_recall` renders the result
- THEN the output MAY include a compact community annotation with freshness and coverage metadata
- AND callers MUST still be able to escalate to source evidence through existing IDs or KG provenance

# Delta for Community Read Path Rollout Gate

## ADDED Requirements

### Requirement: Community Read-Path Activation MUST Remain Explicit and Reversible
The system MUST keep `communitySummaries.readPath.enabled` globally default OFF. A project MUST NOT receive community-summary read-path enrichment unless an operator has made an explicit opt-in through the existing env or persisted config path and the project satisfies the rollout eligibility gates. Clearing `THOTH_COMMUNITY_READ_PATH_ENABLED` or persisted `communitySummaries.readPath.enabled` MUST return the project to the community-disabled baseline without deleting community metadata.

#### Scenario: Global default stays disabled
- GIVEN no env or persisted config opt-in is present
- WHEN retrieval resolves community-summary read-path participation
- THEN `communitySummaries.readPath.enabled` MUST resolve to false
- AND no community-summary evidence MUST be queried for read-path enrichment

#### Scenario: Opt-in is reversible
- GIVEN a project has explicit community read-path opt-in and passes eligibility
- WHEN the operator clears the env or persisted opt-in
- THEN retrieval MUST stop using community-summary enrichment for that project
- AND existing sentence, chunk, lexical, direct KG, and multi-hop KG baseline retrieval MUST continue

### Requirement: Project Eligibility MUST Require Fresh Committed Community State
A project MUST be eligible for community-summary read-path enrichment only when the project has a fresh committed community rebuild state, graph/community/source-observation coverage that meets named rollout threshold constants, bounded summaries, and no stale, rebuilding, failed, degraded, or enrichment-unavailable state that would make community evidence unreliable. Eligibility MUST be evaluated per project and MUST NOT be inferred from global config alone; passing one project MUST NOT enable enrichment for another project.

#### Scenario: Fresh committed state permits eligibility
- GIVEN a project has explicit opt-in, a committed community rebuild for the current graph state, minimum KG/community/source-observation coverage, and bounded summaries
- WHEN eligibility is evaluated for that project
- THEN the project MAY be considered eligible for community-summary read-path enrichment

#### Scenario: Stale or rebuilding state blocks eligibility
- GIVEN a project has explicit opt-in but its community state is stale or rebuilding
- WHEN eligibility is evaluated for that project
- THEN the project MUST be treated as ineligible for community-summary read-path enrichment
- AND retrieval MUST use the community-disabled baseline

#### Scenario: Failed or degraded state blocks eligibility
- GIVEN a project has explicit opt-in but its latest community rebuild failed, is degraded, or depends on unavailable enrichment
- WHEN eligibility is evaluated for that project
- THEN the project MUST be treated as ineligible for community-summary read-path enrichment
- AND the degraded condition SHOULD be signaled where community evidence would otherwise have contributed

### Requirement: Community Evidence MUST Remain a KG-Lane Sub-Source
Community-summary evidence MUST remain inside the existing `kg` retrieval lane with a community-specific sub-source such as `kg_community_summary`. The lane set MUST remain `sentence`, `chunk`, `lexical`, and `kg`; the system SHALL NOT introduce a fifth community, summary, GraphRAG, or global-answer lane for this rollout gate. Direct KG and B2 multi-hop evidence MUST remain rank-safe versus otherwise-equal community-summary evidence.

#### Scenario: Eligible community evidence is KG sub-source evidence
- GIVEN a project is opted in and eligible for community-summary enrichment
- WHEN `mem_recall` retrieves community-summary evidence
- THEN that evidence MUST carry `lane: 'kg'` and source/sub-source `kg_community_summary`
- AND no `community` lane or fifth retrieval lane MUST appear

#### Scenario: Direct KG remains rank-safe
- GIVEN direct KG evidence and community-summary evidence are otherwise equally relevant
- WHEN fused retrieval ranks the candidates
- THEN direct KG evidence MUST rank above community-summary evidence

#### Scenario: B2 multi-hop remains no worse
- GIVEN B2 multi-hop evidence is expected to surface for a query under the community-disabled baseline
- WHEN community-summary enrichment is enabled for an eligible project
- THEN the multi-hop answer MUST still surface no worse than the disabled baseline according to the rollout gate

### Requirement: Community Fallback MUST Preserve Non-Empty Baseline Retrieval
When community summaries are disabled, missing, stale, rebuilding, failed, degraded, or enrichment-unavailable, retrieval MUST fall back to the existing baseline lanes without global failure. If the same project, corpus, query, and retrieval budgets have non-empty source-attributed baseline hits with community enrichment disabled, the fallback result MUST remain non-empty with at least one source-attributed baseline-lane hit and MUST preserve usable baseline lineage.

#### Scenario: Missing summaries fall back to baseline hits
- GIVEN community summaries are missing for a project and the community-disabled baseline has hits for the query
- WHEN retrieval runs with community read-path opt-in present
- THEN retrieval MUST return non-empty baseline results
- AND it MUST NOT fail because summaries are missing

#### Scenario: Stale or failed summaries fall back to baseline hits
- GIVEN community summaries are stale or failed and the community-disabled baseline has hits for the query
- WHEN retrieval runs
- THEN retrieval MUST return non-empty baseline results
- AND stale or failed community summaries MUST NOT be ranked as fresh evidence

#### Scenario: Enrichment-unavailable state falls back to deterministic summaries or baseline
- GIVEN optional enrichment is unavailable or degraded
- WHEN retrieval runs
- THEN deterministic extractive community summaries MAY be used only if the project remains eligible
- AND otherwise retrieval MUST return the non-empty community-disabled baseline when baseline hits exist

### Requirement: Community Read Path MUST Stay Bounded and Non-Synthesizing
Community-summary read-path enrichment MUST remain bounded by configured community count, summary character, evidence-per-community, and source-observation limits. The rollout gate MUST NOT add full GraphRAG global answer synthesis, query-time subquery generation, LLM query planning, or P5 graph navigation v2 behavior.

#### Scenario: Community evidence obeys configured bounds
- GIVEN an eligible project has many matching community summaries
- WHEN retrieval assembles output
- THEN returned community-summary evidence MUST obey configured count and character budgets
- AND omitted or bounded community evidence SHOULD be observable through compact metadata

#### Scenario: Retrieval does not synthesize global answers
- GIVEN community-summary read-path enrichment is enabled for an eligible project
- WHEN a recall query executes
- THEN the system MUST return bounded evidence through existing retrieval lanes
- AND it MUST NOT generate a global synthesized answer or query-time subqueries

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Minimum graph/community/source-observation coverage thresholds are treated as named design-time implementation constants and matching test fixtures/eval thresholds rather than new config fields unless design proves persisted per-project decisions are necessary.
- The concrete coverage constants MUST be derived during design from existing readiness/eval evidence and any available real-project evidence; if evidence is sparse, design MUST choose conservative constants and document why they adequately protect opt-in rollout only.
- "Fresh committed community state" means the latest completed community rebuild matches the current project graph signature or equivalent existing freshness marker and is not stale, rebuilding, failed, degraded, or dependent on unavailable enrichment.
- Baseline non-empty fallback comparisons are scoped to the same project, corpus, query, and retrieval budgets used by the disabled baseline; fallback is not required to invent results when that disabled baseline is itself empty.
- This change specifies rollout eligibility behavior only; multi-harness support, G3 harness parity, MemoryIntegrationCore migration, and P5 graph navigation v2 remain deferred and out of scope.

## Handoff Hints
- Preserve global default OFF and reversible opt-in in design.
- Keep community evidence as `kg_community_summary` inside the KG lane; do not add a lane or MCP surface.
- Design must choose concrete named minimum coverage thresholds, implement regression/fallback tests against them, and decide whether eligibility is computed on demand or represented as a stored per-project decision.

## Merged change: pre-multiharness-foundations (retrieval)

# Delta for Retrieval

## ADDED Requirements
### Requirement: Recall and Context Paths MUST Emit Token-Savings Measurement Metadata
Retrieval and context-producing paths MUST expose measurement metadata sufficient to compare full source size, retained evidence size, returned payload size, and token savings. Metrics MUST distinguish character counts from exact token counts and deterministic token estimates. When exact tokenizer accounting is unavailable, estimates MUST be labeled as estimates and computed deterministically.

#### Scenario: Retrieval result reports size bases
- GIVEN a recall request returns ranked evidence
- WHEN output metadata or eval instrumentation is inspected
- THEN full source size, evidence size, and returned payload size MUST be available
- AND the basis MUST indicate whether the measurements are characters, exact tokens, or estimated tokens

#### Scenario: Token estimates are labeled
- GIVEN exact tokenizer support is unavailable
- WHEN token-savings metadata is emitted
- THEN estimated token counts MUST be present only as estimates
- AND the output MUST NOT imply billing-exact token accounting

### Requirement: Retrieval MUST Measure Compact/Context Answers Versus mem_get Escalation
The retrieval funnel MUST support telemetry that counts when compact/context evidence is sufficient and when the caller escalates to `mem_get` for full content. The measurement MUST avoid claiming `mem_get` avoidance when a later full fetch is required for the same answer path.

#### Scenario: Compact recall answers without escalation
- GIVEN compact or context recall evidence contains enough source-attributed information for an answer path
- AND no correlated full `mem_get` call follows for the same path
- WHEN telemetry is summarized
- THEN the path MAY count as `mem_get` avoided

#### Scenario: Later full fetch prevents avoidance credit
- GIVEN compact or context recall runs for an answer path
- AND a correlated `mem_get` full fetch follows because full content is required
- WHEN telemetry is summarized
- THEN the path MUST count as escalated
- AND it MUST NOT count as avoided

### Requirement: Recall-After-Compaction Evidence MUST Be Measurable
Retrieval instrumentation and evals MUST include evidence that after a compaction-like context loss, the recall funnel can recover source material using compact recall, context expansion, and optional `mem_get` escalation. The evidence MUST report quality and payload savings without storing raw sensitive content.

#### Scenario: Compaction recovery uses the recall funnel
- GIVEN a task requires recovering prior source material after only a compact summary remains
- WHEN the recall-after-compaction scenario runs
- THEN compact recall, context expansion, and any full-fetch escalation MUST be measured separately
- AND the report MUST include recovered evidence quality and payload-size metrics

#### Scenario: Compaction telemetry is privacy-safe
- GIVEN recovered memories contain private or secret-like content
- WHEN recall-after-compaction telemetry is recorded
- THEN the telemetry MUST include only sanitized bounded metadata, counts, hashes, or signatures
- AND raw sensitive content MUST NOT be persisted in telemetry

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- This change measures the existing four-lane retrieval and recall funnel; it does not add a fifth lane, global answer synthesis, or query-time subquery planning.
- Correlation between recall and `mem_get` may use trace ids, request ids, or a deterministic bounded time/window heuristic selected during design.

## Handoff Hints
- Design should reuse existing retrieval eval envelope fields where possible and add only the missing escalation/token fields.
- Design must keep lane attribution unchanged: `sentence`, `chunk`, `lexical`, and `kg`.
- Verification should include compact-only, context-expanded, and full-fetch-escalated paths.
