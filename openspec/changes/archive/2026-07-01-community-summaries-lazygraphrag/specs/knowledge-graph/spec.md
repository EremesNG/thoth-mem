# Delta for Knowledge Graph

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
The MVP community algorithm MUST be deterministic for identical KG inputs and configuration, MUST require no embeddings, remote services, or LLMs, and MUST include a connected-components fallback. A Louvain-style or Leiden-style algorithm MAY be selected when a deterministic, Node-friendly implementation is validated, but exact Leiden clustering SHALL NOT be required for MVP correctness.

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

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions

- Community hierarchy MAY be represented as one level for MVP when connected components are used; design may add parent/child levels if the selected algorithm naturally supports them.
- Community identifiers should be content-derived or version-mapped so rebuilds are stable enough for inspection and testing.
- "Freshness" is a derived-artifact state, not a new source-of-truth graph fact.

## handoffHints

- Preserve the no-`observation_facts` constraint and the connected-components fallback in design.
- Treat exact Leiden as optional discovery, not a required dependency.
- Design must define concrete freshness/version fields and deterministic ordering.
