# Delta for Evals

> Sub-change B1 of Change B. The facts-source eval (`factsSourceChecks`) and the
> graph-fact fixtures move off `observation_facts` and onto `kg_triples`.

## ADDED Requirements

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
- AND no eval assertion MUST filter on `source === 'observation_facts'`

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
