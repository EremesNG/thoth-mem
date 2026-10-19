# Delta for Knowledge Graph

## ADDED Requirements

### Requirement: Maintenance MUST Preserve `kg_triples` as the Graph-Derived Fact Source
The maintenance lifecycle MUST preserve the existing knowledge-graph contract: `kg_entities` and `kg_triples` remain the source of graph-derived facts, supersession/pruning behavior from B3/C1 remains governed by their existing requirements, and maintenance MUST NOT reintroduce `observation_facts` or any parallel graph-fact store. Consolidation, reflection, and decay MAY add metadata or derived memory records, but graph consumers MUST continue to obtain graph facts through the KG-backed path.

#### Scenario: Maintenance does not create a parallel fact source
- GIVEN maintenance has recorded consolidation, reflection, and decay outcomes
- WHEN graph-derived facts are read for recall, project graph, ledger, or visualization-compatible projections
- THEN facts MUST still be derived from `kg_entities` and `kg_triples`
- AND no `observation_facts` table or replacement parallel graph-fact store MUST be read or written

### Requirement: Consolidation and Reflection Provenance MUST Be Representable in Graph Evidence
When consolidated or reflected memory records participate in graph-backed retrieval, the graph evidence MUST remain traceable to the source memories that produced the maintenance outcome. A reflected memory that receives KG extraction MUST carry provenance that distinguishes it from its source memories and allows callers to audit the source set.

#### Scenario: Reflected graph evidence links to sources
- GIVEN reflection creates a source-linked durable memory and that memory has KG triples
- WHEN graph-backed recall returns the reflected memory
- THEN its evidence MUST identify the reflected memory as the returned record
- AND provenance MUST allow the caller to trace back to the source memories used for reflection

#### Scenario: Consolidated evidence does not erase source graph history
- GIVEN source memories in a consolidation cluster have existing KG triples
- WHEN the cluster's canonical memory is preferred in graph-backed retrieval
- THEN source graph history MUST remain reachable through history-inclusive or full-record paths
- AND consolidation MUST NOT delete source KG facts solely to reduce duplicate recall

### Requirement: Decay MUST Deprioritize Graph Evidence Without Reversing Supersession or Pruning Contracts
Decay MAY lower the influence of graph-backed evidence for stale, low-value, or redundant memories, but it MUST NOT alter the meaning of B3 supersession markers, C1 pruning retention, or the current-state graph view. Current non-decayed facts MUST rank above otherwise-equivalent decayed facts, while decayed facts remain recoverable unless they were independently pruned by an existing KG retention policy.

#### Scenario: Decay and supersession compose predictably
- GIVEN a graph fact is current but its source memory is decayed
- AND another graph fact is superseded but its source memory is not decayed
- WHEN graph-backed retrieval ranks candidates
- THEN the system MUST apply both states explicitly according to configured weights
- AND output evidence MUST not confuse decay with supersession

#### Scenario: Decay does not trigger KG pruning
- GIVEN decay metadata exists for a source memory with KG triples
- WHEN maintenance applies decay
- THEN no `kg_triples` row MUST be pruned merely because of decay
- AND any KG pruning MUST remain governed by the existing superseded-triple retention requirements

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Graph contract is preserved:** Maintenance metadata sits above the KG fact source; it does not redefine entity/triple storage or prior B1/B2/B3/C1 behavior.
- **Distinct states:** Design should model decay, consolidation, reflection, supersession, and pruning as distinguishable states in evidence so callers can explain ranking outcomes.

