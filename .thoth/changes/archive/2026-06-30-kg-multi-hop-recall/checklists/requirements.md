# Requirements-Quality Checklist — kg-multi-hop-recall

> "Unit tests for English." Each item must be `- [x]` or `- [-] waived: reason`
> before the spec→tasks transition (gated by `rules.requirements_quality`).
> Dimensions: completeness, clarity, measurability, testability.

## Domain: knowledge-graph

### Completeness
- [x] Traversal inputs (seed observation ids), bidirectional expansion, projection back to source observations, seed exclusion, and filter reuse are all specified
- [x] Bounding controls (depth guard, cycle/visited set, neighborhood cap) each have a requirement
- [x] Relation allow-list default (18 follow / 8 exclude) is enumerated and partitions the full 26-relation enum
- [x] Multi-hop evidence provenance/confidence/bridge-path and distinctness from direct facts are specified

### Clarity
- [x] "Bidirectional" is defined as subject→object and object→subject expansion
- [x] Excluded vs followed relations are named explicitly, with `REFERENCES` (follow) vs `MENTIONS` (exclude) disambiguated
- [x] Determinism (pure SQL, no model — P2) and boundedness (P4) are stated as constraints, not implementation

### Measurability
- [x] Depth is recorded per reached observation (1 vs 2) so closeness is observable
- [x] Neighborhood cap is a concrete number (`50`) and depth a concrete bound (`kgMaxDepth = 2`)
- [x] Allow-list ∪ exclude-list equals exactly 26 relations (checkable against `KG_RELATION_TYPES`)

### Testability
- [x] 2-hop-via-shared-entity, bidirectional-reach, cycle-termination, depth-stop, hub-cap, and metadata-not-followed each have a GWT scenario
- [x] Scenarios reference concrete relations (`DEPENDS_ON`, `USES`, `HAS_TOPIC`) so fixtures are constructible

## Domain: retrieval

### Completeness
- [x] Sub-source fusion (CL-1), lower weight (CL-2), dedup-by-observation, depth attenuation (CL-3), and degrade paths (CL-4/CL-5) each have a requirement
- [x] Both degrade triggers (disabled flag; cost-bound/error) are covered
- [x] "Preserved (not modified)" four-lane + degrade-by-lane requirements are called out

### Clarity
- [x] `lane: 'kg'` + `source: 'kg_multi_hop'` is stated as the discriminant (no fifth lane)
- [x] Effective weight ordering (`0.7` multi-hop < `0.9` direct KG < `1.0` semantic/lexical) is explicit
- [x] "Direct wins primary evidence; multi-hop never downgrades" is stated unambiguously

### Measurability
- [x] Attenuation formula `confidence * kgDepthDecay^(depth-1)` with `0.5` default yields checkable depth-1 vs depth-2 scores
- [x] "Identical to pre-change baseline when disabled" is a measurable equality
- [x] `degradedFallback` signal presence on degrade is observable

### Testability
- [x] New-observation-introduction, weighted-ordering, dedup-direct-wins, depth-2-below-depth-1, disabled-baseline, and cost-bound-degrade each have a GWT scenario
- [x] Scenarios are runnable through `hybridRetrieve` with the flag toggled

## Domain: config

### Completeness
- [x] All six knobs (enabled, maxDepth, neighborhoodLimit, multiHopWeight, depthDecay, traversalTimeoutMs) plus the relation allow-list are specified with type, default, and env var
- [x] Resolution precedence (env > persisted > default) is stated
- [x] Allow-list fail-safe behavior (empty/invalid → fewer edges, never more) is specified

### Clarity
- [x] Parsing helpers (`parseBoolean`/`parseNumber`) and the mirrored `graphFactsSource` pattern are named
- [x] The flag is identified as the rollback switch
- [x] `kgTraversalTimeoutMs` is clarified as a coarse guard, not an async timeout (CL-4)

### Measurability
- [x] Each default is a concrete value in the knob table
- [x] Env-wins / persisted-when-unset / default-when-unset are checkable per knob
- [x] Default allow-list membership (18 in, 8 out) is checkable

### Testability
- [x] Env-override, persisted, all-defaults, disable-rollback, and allow-list override/fail-safe each have a GWT scenario
- [x] Knob-home duplication (`RetrievalDefaults` in two files) is flagged for design sync without over-constraining placement

## Domain: store

### Completeness
- [x] Flag-gated `queryKnowledgeMultiHopLane` existence, seeding, re-fuse, and flag-off no-op are specified
- [x] Cost ceiling + coarse elapsed degrade + payload-cap composition each have a requirement
- [x] Filter reuse (`appendObservationFilters`) and "no schema migration / no export change" are recorded

### Clarity
- [x] Synchronous `better-sqlite3` constraint and its consequence for timeout enforcement are stated
- [x] Seed source (`fused.map(...id)` after slice) is named with line anchors
- [x] Candidate shape (`lane: 'kg'`, `source: 'kg_multi_hop'`, provenance, bridge path) is stated

### Measurability
- [x] Neighborhood cap and depth bound make traversal work bounded independent of graph size (observable)
- [x] Degrade signal in `degradedFallback` and "complete direct result returned" are observable
- [x] Payload stays within existing output caps regardless of neighborhood size (checkable)

### Testability
- [x] Flag-on-issues-traversal, flag-off-no-query, candidate-shape, ceiling-bounds-work, elapsed-degrade, and payload-cap each have a GWT scenario
- [x] `EXPLAIN QUERY PLAN` index-coverage check is named as a design/apply verification

## Domain: evals

### Completeness
- [x] Shared-entity multi-hop recall case (answer reachable only via shared entity) is specified
- [x] No-regression gate vs single-hop baseline (CL-5) is specified as the acceptance condition for default-ON
- [x] Metadata-relation-does-not-bridge distractor case is included

### Clarity
- [x] "No regression" is defined per-case (expected obs recalled at no worse rank), not as an aggregate
- [x] The gate, not the eval mechanics, decides the shipped default
- [x] Fixture seeding uses KG path (`tripleHash`-keyed), not `observation_facts`

### Measurability
- [x] ON vs OFF comparison is a concrete two-run procedure with per-case pass criteria
- [x] Multi-hop attribution (`source: 'kg_multi_hop'`) is observable in fused output
- [x] Disabled-run-equals-baseline is a measurable equality

### Testability
- [x] Flag-on-surfaces, flag-off-does-not-surface, distractor-not-bridged, no-regression, and disabled-baseline each have a GWT scenario
- [x] Scenarios reuse the existing eval runtime + `hybridRetrieve` with the flag toggled

## Implementation Close Notes

- [x] Shipped default decision: `kgMultiHopEnabled` remains `true`; `pnpm run eval:retrieval` passed with Recall@5 100.0% and no multi-hop regression.
- [x] Deferred follow-ups remain out of B2 scope: optional `idx_kg_triples_source` and hard `db.interrupt()` / progress-handler support.
- [x] CL-1 through CL-6 remain resolved as recorded in `design.md`; no post-implementation clarification reopened them.
