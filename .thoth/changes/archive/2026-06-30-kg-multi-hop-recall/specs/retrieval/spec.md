# Delta for Retrieval

## ADDED Requirements

### Requirement: Multi-Hop KG Evidence MUST Fuse as a Lower-Weighted Sub-Source of the KG Lane
The retrieval engine MUST fuse entity-anchored multi-hop KG evidence (see the
knowledge-graph delta) into the ranked result set as a SUB-SOURCE of the existing
`kg` lane, NOT as a fifth lane. Multi-hop candidates MUST keep `lane: 'kg'` and
MUST carry a new `source` discriminant `'kg_multi_hop'` (additive to the
`LaneCandidate.source` union, `src/retrieval/ranking.ts:22`). They MUST be fused
through the existing `fuseCandidates` (`src/retrieval/ranking.ts:45`) so multi-hop
evidence can introduce NEW observations into the final ranked output (not only
enrich existing hits), bounded by the same `fusedLimit` and the downstream output
caps. Multi-hop evidence MUST contribute a STRICTLY LOWER effective weight than
direct KG evidence: direct KG is `0.9` (`DEFAULT_LANE_WEIGHTS.kg`,
`src/retrieval/ranking.ts:9`); the multi-hop effective weight MUST default to
`kgMultiHopWeight ≈ 0.7` (configurable), achieved either by a source-aware weight
or by pre-scaling the candidate score (design decides; the observable requirement
is the lower effective weight).

#### Scenario: Multi-hop introduces a new observation into fused output
- GIVEN an observation reachable only via multi-hop traversal (no direct
  lexical/semantic/KG match for the query) and multi-hop is enabled
- WHEN fusion runs
- THEN that observation MUST be able to appear in the final ranked output with
  `lane: 'kg'` and `source: 'kg_multi_hop'`

#### Scenario: Multi-hop ranks below an otherwise-equal direct match
- GIVEN two observations with equal underlying evidence scores, one matched
  directly (`source` a direct KG/semantic/lexical source) and one matched only via
  multi-hop
- WHEN fusion computes weighted contributions
- THEN the multi-hop observation's effective contribution MUST be strictly lower
  than the direct match's, reflecting the `kgMultiHopWeight ≈ 0.7` vs direct KG
  `0.9` (and below the `1.0` semantic/lexical lanes)

#### Scenario: Four-lane fusion contract is preserved
- GIVEN multi-hop is enabled
- WHEN fusion runs
- THEN the lane set MUST remain the four lanes (`sentence`, `chunk`, `lexical`,
  `kg`); multi-hop MUST NOT introduce a fifth `RetrievalLane`, and the "Hybrid
  Retrieval MUST Fuse Four Lanes" requirement MUST remain satisfied with multi-hop
  additive under `kg`

### Requirement: Multi-Hop Candidates MUST Be De-Duplicated by Observation With Direct Evidence Winning
When the same observation is reached both directly (any direct lane/source) and
via multi-hop, fusion MUST de-duplicate by `observationId` (the existing
`byObservation` grouping in `fuseCandidates`) and the DIRECT candidate MUST win
primary-evidence selection. The multi-hop candidate MUST act as additive
enrichment for that observation and MUST NEVER downgrade or replace the direct
primary evidence.

#### Scenario: Direct hit wins primary evidence over multi-hop
- GIVEN an observation produced both a direct candidate and a `kg_multi_hop`
  candidate
- WHEN fusion selects the primary evidence for that observation
- THEN the direct candidate MUST be selected as primary
- AND the observation MUST appear once in the fused output (de-duplicated by
  `observationId`), not twice

#### Scenario: Multi-hop enriches without lowering a direct hit's rank
- GIVEN an observation already ranked via a direct lane
- WHEN a `kg_multi_hop` candidate for the same observation is fused in
- THEN the observation's existing direct primary evidence MUST be retained
- AND the added multi-hop evidence MUST NOT reduce the observation's rank below
  where its direct evidence alone placed it

### Requirement: Multi-Hop Evidence MUST Attenuate by Hop Depth
Multi-hop candidate scores MUST attenuate with hop depth so that depth-2 evidence
scores strictly below otherwise-equal depth-1 evidence. The attenuation MUST be
`score = confidence * kgDepthDecay^(depth-1)` with `kgDepthDecay` defaulting to
`0.5` (configurable): depth-1 evidence is unattenuated and depth-2 evidence is
halved at the default factor.

#### Scenario: Depth-2 evidence scores below depth-1 evidence
- GIVEN two reached observations with equal bridging-triple confidence, one
  reached at depth `1` and one at depth `2`, with `kgDepthDecay = 0.5`
- WHEN their multi-hop candidate scores are computed
- THEN the depth-1 candidate score MUST equal `confidence` and the depth-2
  candidate score MUST equal `confidence * 0.5`
- AND the depth-2 candidate MUST rank below the depth-1 candidate, all else equal

#### Scenario: Decay factor is configurable
- GIVEN `kgDepthDecay` is reconfigured (per the config delta) to a value other
  than the default
- WHEN a depth-2 multi-hop candidate score is computed
- THEN the attenuation MUST use the configured factor, not the hard-coded default

### Requirement: Multi-Hop MUST Degrade to Single-Hop Behavior When Disabled or Cost-Bounded
The engine MUST degrade gracefully to today's single-hop behavior whenever
multi-hop cannot or should not contribute, with no global hard-failure
(constitution **P2**; preserves "Retrieval MUST Degrade by Lane, Not Globally").
Specifically:

- When `kgMultiHopEnabled` is false, `hybridRetrieve` MUST run EXACTLY as today:
  no traversal query is issued, no `kg_multi_hop` candidate is emitted, and the
  ranked output MUST be identical to the pre-change baseline for the same inputs.
- When the traversal cost ceiling is hit or the traversal raises an error, the
  engine MUST drop multi-hop candidates for that query, return the complete
  direct-lane result, and signal the degradation in `degradedFallback` (mirroring
  the existing semantic-degrade signaling, `src/store/index.ts:1773`).

Multi-hop MUST NEVER be load-bearing for basic recall: the direct lanes always
produce a complete result independently of traversal.

#### Scenario: Disabled flag yields identical baseline output
- GIVEN `kgMultiHopEnabled` is false
- WHEN `hybridRetrieve` runs for a query
- THEN no traversal query MUST be issued, no `kg_multi_hop` candidate MUST be
  produced, and the ranked results MUST equal the pre-change single-hop baseline
  for that query

#### Scenario: Cost-bound degrade returns the complete direct result and signals it
- GIVEN multi-hop is enabled but the traversal hits its cost ceiling (or errors)
  for a query
- WHEN `hybridRetrieve` completes
- THEN it MUST return the complete direct-lane ranked result (no multi-hop
  candidates for that query)
- AND `degradedFallback` MUST include a multi-hop degrade signal
- AND retrieval MUST NOT hard-fail

#### Scenario: Multi-hop is never required for basic recall
- GIVEN traversal returns no reached observations (empty neighborhood)
- WHEN `hybridRetrieve` completes
- THEN the direct-lane ranked result MUST be returned unchanged with no error

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **CL-1 (RESOLVED — kg sub-source):** Multi-hop is a sub-source of the `kg` lane
  (`source: 'kg_multi_hop'`, `lane: 'kg'`), preserving "Hybrid Retrieval MUST Fuse
  Four Lanes" and leaving `RetrievalLane`/`DEFAULT_LANE_ORDER`/
  `DEFAULT_LANE_WEIGHTS` structurally unchanged. The only typed surface change is
  the additive `LaneCandidate.source` union member `'kg_multi_hop'`.
- **CL-2 (RESOLVED — multi-hop effective weight `0.7`):** Multi-hop effective
  weight defaults to `kgMultiHopWeight = 0.7` (configurable), strictly below
  direct KG `0.9` and well below the `1.0` semantic/lexical lanes.
- **CL-3 (RESOLVED — depth decay `0.5`):** `score = confidence *
  kgDepthDecay^(depth-1)`, `kgDepthDecay = 0.5` by default; depth-1 full,
  depth-2 half.
- **CL-4 (RESOLVED — deterministic cost ceiling, coarse elapsed guard):**
  `better-sqlite3` is synchronous; there is NO hard mid-query async timeout.
  Traversal cost is bounded DETERMINISTICALLY by `kgMaxDepth` +
  `kgNeighborhoodLimit` + relation filtering (the cost ceiling), with a coarse
  measured-elapsed guard checked BETWEEN hops / around the call: if the bounded
  traversal nonetheless exceeds `kgTraversalTimeoutMs`, the multi-hop re-fuse is
  skipped and `degradedFallback` is signaled for that query. SQLite
  `interrupt()`/progress-handler is noted as an OPTIONAL future hard-interrupt,
  not required by this change.
- **CL-5 (RESOLVED — flag default ON, gated on no-regression eval):**
  `kgMultiHopEnabled` defaults to `true`, GATED on the eval suite demonstrating no
  regression vs the single-hop baseline (see the evals delta). If a regression is
  observed, the default flips to `false` until weights/filters are tuned. Rollback
  is `kgMultiHopEnabled = false` (mirrors B1 `graphFactsSource`).
- **Seeding contract (code-grounded):** Multi-hop traversal is seeded by the
  observation ids of the primary fused result set
  (`fused.map(hit => hit.observation.id)` after
  `fuseCandidates(...).slice(0, fusedLimit)`, `src/store/index.ts:1797`), run
  alongside the existing graph-enrichment pass (`:1800-1817`). The exact placement
  (single re-fuse vs enrich-then-cap) is a design decision; the observable
  requirement is that multi-hop observations can appear in the final ranked output
  bounded by `fusedLimit`/output caps.
- **PRESERVED (not modified):** "Hybrid Retrieval MUST Fuse Four Lanes"
  (`openspec/specs/retrieval/spec.md:4`) and "Retrieval MUST Degrade by Lane, Not
  Globally" (`:77`) are unchanged; multi-hop is additive under the `kg` lane and
  never load-bearing for basic recall.
