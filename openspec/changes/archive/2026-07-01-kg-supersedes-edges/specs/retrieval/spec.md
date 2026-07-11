# Delta for Retrieval

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
