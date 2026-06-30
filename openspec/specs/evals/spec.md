# Delta for Evals

## ADDED Requirements
### Requirement: Evals MUST Validate sqlite-vec KNN Retrieval Defaults
Evaluation suites MUST validate that semantic retrieval uses sqlite-vec KNN semantics for sentence and chunk lanes and returns bounded top-k evidence using the configured defaults.

#### Scenario: Semantic lanes report KNN-bounded outputs
- GIVEN semantic indexes are available
- WHEN retrieval evals execute
- THEN reported evidence MUST confirm sentence top-k `100`, chunk top-k `20`, threshold `0.30`, and distance-to-score behavior unless explicitly reconfigured

### Requirement: Evals MUST Validate HyDE Dual Embedding Behavior
Evaluation suites MUST verify raw-query semantic retrieval remains active and HyDE answer embeddings contribute only when generation succeeds.

#### Scenario: HyDE success and failure are both measured
- GIVEN HyDE is enabled during evals
- WHEN generation succeeds or fails
- THEN eval output MUST distinguish raw-query-only retrieval from raw-plus-hypothetical-answer fused retrieval

### Requirement: Evals MUST Validate FTS5 Prefix Recall
Evaluation suites MUST verify lexical prefix matching behavior for eligible tokens and compare it against lexical-only baseline behavior.

#### Scenario: Prefix matching recalls variants
- GIVEN an eval query uses a token that has inflected or suffixed variants in the corpus
- WHEN lexical retrieval runs
- THEN FTS5 prefix matching MUST be measured as part of lexical and hybrid recall

### Requirement: Evals MUST Compare Hybrid Against Lexical Baseline
Evaluation suites MUST compare fused four-lane retrieval quality against lexical-only baseline.

#### Scenario: Hybrid and lexical baselines are measured
- GIVEN a stable evaluation corpus
- WHEN retrieval evals run
- THEN metrics MUST include both hybrid and lexical-only outcomes

### Requirement: Citation and Lineage MUST Be Verified Across Lanes
Evaluation outputs MUST verify source lineage and citations for sentence, chunk, lexical, and graph/KG evidence.

#### Scenario: Fused outputs retain source lineage
- GIVEN multi-lane fused results
- WHEN eval logic inspects outputs
- THEN each retained evidence item MUST include source-linkable lineage

### Requirement: Context Compression Quality MUST Be Measured
Evaluations MUST measure surgical sentence trimming and small-to-big promotion so mandatory trimming does not hide necessary parent context.

#### Scenario: Trimmed sentence and promoted parent metrics are reported
- GIVEN sentence evidence and parent promotion both appear in retrieval output
- WHEN eval scoring executes
- THEN metrics MUST report trimmed evidence quality and promoted-parent contribution separately

### Requirement: Degraded and Pending Semantic Fallback MUST Be Measured
Evals MUST include sqlite-vec load failure, vec table unavailability, stale/rebuilding index states, and post-save pending indexing states to verify lexical + graph/KG fallback quality.

#### Scenario: Semantic unavailable still yields useful fallback
- GIVEN semantic lanes are degraded or pending
- WHEN retrieval evals execute
- THEN fallback availability/quality metrics MUST be produced without global retrieval failure

### Requirement: Facts-Source Eval MUST Assert on `kg_triples`
The facts-source eval check (`factsSourceChecks`, `src/evals/retrieval.ts:699`,
computed at `:769`) MUST assert that graph-lane evidence is sourced from
`kg_triples` and MUST NOT require any `observation_facts`-sourced candidate. After
consolidation no candidate carries `source = 'observation_facts'`
(`src/evals/retrieval.ts:767`); the check MUST be redefined so it passes when the
KG-lane graph evidence (`source = 'kg_triples'`) is present and source-attributed,
without depending on a now-empty `observation_facts` candidate set.

#### Scenario: Facts-source check passes on KG-sourced evidence
- GIVEN graph-lane evidence is produced for an eval query
- WHEN the facts-source eval check evaluates the candidates
- THEN it MUST pass based on `kg_triples`-sourced, source-attributed candidates
- AND it MUST NOT require any `observation_facts`-sourced candidate

#### Scenario: Facts-source check does not regress on the removed source
- GIVEN consolidation is complete and no `observation_facts` source exists
- WHEN the retrieval eval suite runs
- THEN the facts-source check MUST NOT fail due to the absence of
  `observation_facts` candidates

### Requirement: Graph-Fact Eval Fixtures MUST Seed the Knowledge Graph
The eval fixtures that previously inserted directly into `observation_facts`
(`src/evals/retrieval.ts:676-684`, the `graph-lite` and `graph-rank` fixtures)
MUST instead establish their graph facts through the consolidated KG path
(`kg_entities`+`kg_triples`), so the graph lane has evidence to rank under the
single-source model. The fixtures MUST produce KG-lane graph evidence equivalent
in retrieval purpose to what they produced via `observation_facts`.

#### Scenario: Graph fixtures populate KG-lane evidence
- GIVEN the retrieval eval setup runs
- WHEN the `graph-lite` and `graph-rank` fixtures are established
- THEN their facts MUST be present as `kg_triples`+`kg_entities` (not
  `observation_facts`)
- AND the graph lane MUST be able to rank evidence for the corresponding eval
  cases

#### Scenario: No eval path inserts into observation_facts
- GIVEN the eval suite executes
- WHEN any graph-fact fixture or assertion runs
- THEN no INSERT into `observation_facts` MUST occur
- AND no eval assertion MUST filter on `source === 'observation_facts'`## MODIFIED Requirements

## REMOVED Requirements


## Assumptions
- **kg-quality eval unaffected:** `src/evals/kg-quality.ts` references neither
  `observation_facts` nor `kg_triples` by name (verified), so it requires no
  change under this consolidation.
- **Fixture relations:** The migrated fixtures use KG-native relations already
  (`graph-rank` uses `DEPENDS_ON`; `graph-lite` uses the free-form relation
  `supports`, `src/evals/retrieval.ts:676-684`), so seeding them into the KG does
  not depend on the legacy 7-relation labels. This is consistent with CL-4 in the
  knowledge-graph delta: the legacy-label parity (preserved by the adapter for
  consumer output) does not constrain the eval fixtures, which seed KG-native
  relations directly. The current check requires a non-empty `observation_facts`
  candidate set (`tripleCandidates.length > 0 && factCandidates.length > 0`,
  `src/evals/retrieval.ts:769`), which is why it MUST be redefined to pass on
  `kg_triples` evidence alone.