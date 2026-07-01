# Delta for Evals

## ADDED Requirements

### Requirement: Evals MUST Validate Duplicate Suppression With Source Reachability
Evaluation coverage MUST include duplicate and near-duplicate memory clusters. The eval MUST show that maintenance reduces repeated default recall/context evidence while every source memory remains reachable by stable id and provenance.

#### Scenario: Duplicate recall noise is reduced
- GIVEN an eval corpus with exact and near-duplicate observations
- WHEN maintenance is applied and recall runs for the duplicated topic
- THEN default recall/context output MUST contain fewer duplicate evidence rows than before maintenance
- AND the selected canonical result MUST expose consolidation provenance

#### Scenario: Duplicate sources remain fetchable
- GIVEN a duplicate source was suppressed by consolidation
- WHEN the eval fetches that source by id
- THEN the full source content MUST be returned

### Requirement: Evals MUST Validate Reflection Quality and Idempotency
Evaluation coverage MUST include related-memory clusters where a durable reflected learning is expected. The eval MUST assert that reflection produces source-linked compact memory, improves or preserves recall quality for the target query, and does not duplicate reflected outputs across reruns.

#### Scenario: Reflected learning improves compact recall
- GIVEN related source memories contain an emergent durable learning
- WHEN reflection runs and recall queries that learning
- THEN the reflected memory SHOULD rank at or above the individual lower-signal sources
- AND the reflected memory MUST expose source lineage

#### Scenario: Reflection rerun does not duplicate output
- GIVEN reflection has already produced a reflected memory for an unchanged source set
- WHEN reflection runs again with the same configuration
- THEN no duplicate reflected memory MUST be created

### Requirement: Evals MUST Validate Decay Down-Weighting Without Hiding Current Facts
Evaluation coverage MUST include stale or low-value memories and current high-signal memories. The eval MUST assert that decay lowers influence of stale/low-value records, current high-signal records remain ranked correctly, and decayed records remain retrievable.

#### Scenario: Decay lowers stale memory rank
- GIVEN a stale low-value memory and a current high-signal memory both match a query
- WHEN decay consumption is enabled
- THEN the current high-signal memory SHOULD rank above the decayed stale memory
- AND the decayed memory MUST remain retrievable by id

#### Scenario: Decay does not regress current-fact retrieval
- GIVEN existing retrieval fixtures that pass before decay is consumed
- WHEN decay consumption is enabled under default policy
- THEN current high-signal answers MUST NOT regress in pass/fail or rank criteria

### Requirement: Evals MUST Gate Maintenance Defaults on No Retrieval Regression
The existing retrieval-quality fixtures, including KG, multi-hop, supersession, pruning, lexical, and semantic degraded cases, MUST pass with maintenance consumption disabled and enabled. Enabled outcomes MUST be no worse than disabled outcomes for pass/rank criteria unless a scenario explicitly expects duplicate suppression. This no-regression evidence MUST gate any decision to enable automatic maintenance by default.

#### Scenario: Existing fixtures do not regress with maintenance consumption enabled
- GIVEN the existing retrieval eval suite
- WHEN it runs once with maintenance consumption disabled and once enabled
- THEN all passing disabled cases MUST still pass enabled
- AND answer rank MUST NOT worsen except where duplicate suppression explicitly changes repeated evidence ordering without losing the answer

#### Scenario: Regression keeps automatic maintenance conservative
- GIVEN a regression appears when maintenance consumption is enabled
- WHEN default configuration is selected
- THEN automatic mutating maintenance MUST remain disabled by default until the regression is resolved or explicitly accepted

### Requirement: Evals MUST Validate Export/Import Maintenance Semantics
Evaluation coverage MUST assert that portable export/import preserves source memories and reflected portable records, does not require internal consolidation/decay metadata, and can regenerate internal maintenance outcomes after import.

#### Scenario: Export/import preserves portable memory records
- GIVEN a store with source memories, reflected memories, and internal maintenance metadata
- WHEN export and import round-trip runs
- THEN source memories and reflected portable records MUST survive the round trip
- AND import MUST NOT require consolidation or decay metadata fields

#### Scenario: Maintenance can be recomputed after import
- GIVEN an imported store lacks internal consolidation and decay metadata
- WHEN maintenance runs after import
- THEN consolidation and decay outcomes MUST be recomputable from the imported portable records

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **Quality gates mirror B2/B3/C1 precedent:** Default-enablement decisions depend on no-regression eval evidence.
- **Duplicate suppression exception:** Duplicate-count reduction is allowed when the expected answer remains present and source reachability is proven.
- **Fixture labels define signal classes:** "High-signal", "low-value", "stale", and "lower-signal" are test-fixture roles assigned before maintenance runs; eval assertions should compare stable fixture ids and expected ranks rather than inferring those labels from the maintenance score being tested.
