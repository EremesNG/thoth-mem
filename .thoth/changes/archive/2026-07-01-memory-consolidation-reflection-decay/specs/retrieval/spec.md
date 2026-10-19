# Delta for Retrieval

## ADDED Requirements

### Requirement: Retrieval MUST Suppress Duplicate Noise While Preserving Source Reachability
When consolidation metadata identifies a duplicate or near-duplicate cluster, retrieval and context assembly MUST reduce repeated default evidence from cluster members by preferring the canonical or highest-signal memory. Suppression MUST be explainable in evidence metadata and MUST NOT make source records unreachable by stable identifier.

#### Scenario: Consolidated cluster returns one primary result by default
- GIVEN several observations are consolidated into one duplicate cluster
- WHEN a recall query matches the cluster
- THEN default ranked output SHOULD include one primary cluster result rather than every duplicate source as equal-strength results
- AND output metadata MUST indicate that consolidation influenced the result
- AND the suppressed source records MUST remain retrievable by id

### Requirement: Retrieval MUST Promote Source-Linked Reflections Without Hiding Sources
Reflected durable memories SHOULD be eligible for recall and context ranking as compact high-signal summaries when they match the query. A reflected memory MUST carry source lineage in output evidence, and retrieval MUST still allow callers to reach the underlying source memories through full-record or lineage-inclusive paths.

#### Scenario: Reflection improves compact recall
- GIVEN a reflected memory summarizes several related source observations
- WHEN a query matches the synthesized learning
- THEN the reflected memory SHOULD be eligible to rank above the individual lower-signal source observations
- AND the returned evidence MUST identify the source memories used by the reflection

#### Scenario: Source memories remain available
- GIVEN a reflected memory is returned for a query
- WHEN a caller follows source lineage or requests a source by id
- THEN the original source memory MUST remain available with its full content

### Requirement: Decay MUST Down-Weight Low-Value or Stale Memories Without Global Hiding
Retrieval MUST consume decay metadata as a deterministic down-weight or de-emphasis signal, not as a deletion or global filter. Decayed memories MAY still appear when strongly relevant, explicitly requested, or needed for provenance. Decay MUST compose with existing lane degradation, KG supersession, multi-hop weighting, and lexical/semantic fusion without changing the four-lane retrieval contract.

#### Scenario: Decayed memory ranks below current high-signal memory
- GIVEN two otherwise-equivalent memories match a query
- AND one memory has active decay metadata while the other does not
- WHEN retrieval fuses candidates
- THEN the non-decayed memory SHOULD rank above the decayed memory
- AND the decayed memory MUST remain eligible to appear when it is the strongest or only relevant evidence

#### Scenario: Four-lane retrieval contract remains intact
- GIVEN consolidation, reflection, and decay metadata exists
- WHEN hybrid retrieval runs
- THEN the lane set MUST remain sentence, chunk, lexical, and kg where available
- AND maintenance metadata MUST adjust ranking/evidence without creating a fifth retrieval lane

### Requirement: Disabled Maintenance Consumption MUST Match the Post-C1 Baseline
When maintenance consumption is disabled through effective configuration, retrieval and context assembly MUST ignore consolidation and decay metadata and MUST not give reflected records special ranking treatment. Existing persisted reflected records MAY still be returned as ordinary memory records if they match a query, but no maintenance-specific promotion, suppression, or decay down-weighting MUST be applied.

#### Scenario: Maintenance consumption disabled restores baseline ranking rules
- GIVEN consolidation and decay metadata exists
- AND maintenance consumption is disabled
- WHEN the same recall query runs against the same store
- THEN ranking, evidence shape, and degrade signaling MUST match the post-C1 baseline rules over the same memory records
- AND reflected records MUST be treated like ordinary records rather than specially promoted

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **No new retrieval lane:** Maintenance modifies ranking/evidence within existing lanes and context assembly; it does not add a maintenance lane.
- **Recoverability over hiding:** Decay and consolidation reduce default noise but preserve id-based and lineage-based recovery.
- **Canonical selection source:** Retrieval should consume the canonical member recorded by store maintenance for a consolidation cluster. It may use normal ranking only to order canonical/reflected/ordinary candidates after cluster suppression is applied, not to invent a different cluster canonical on each query.
