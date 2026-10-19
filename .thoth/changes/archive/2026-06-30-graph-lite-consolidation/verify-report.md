# Verification Report: Graph-Lite Consolidation

## Round

round 1

## Completeness

All required OpenSpec artifacts were recovered from `openspec/changes/graph-lite-consolidation/`: `tasks.md`, `design.md`, and the full-pipeline delta specs under `specs/`.

All task checkboxes in `tasks.md` are complete. Verification mapped all 52 Given/When/Then scenarios across store, knowledge-graph, indexing, evals, and tools specs.

Compliance: 52 compliant / 52 total scenarios.

## Build and Test Evidence

- Root-reported integration gate passed: `pnpm test && pnpm run build`; 45 test files passed, 487 tests passed; build passed.
- Verifier reran targeted evidence command: `pnpm exec vitest run tests/store/kg-facts-cutover.test.ts tests/evals/retrieval.test.ts tests/tools/registry.test.ts`; 3 files passed, 27 tests passed.
- Default KG cutover is configured in `src/config.ts:59`, `src/config.ts:232`, `src/config.ts:446`, and schema enum support exists in `config.schema.json:55`.
- Fresh schema no longer defines `observation_facts`; `rg` found no `observation_facts` references in `src/store/schema.ts`.
- Live migration drops legacy artifacts idempotently in the live runner at `src/store/migrations.ts:275`-`278`.
- Targeted absence/rollback tests cover schema absence and rollback fixtures at `tests/store/schema.test.ts:43`, `tests/store/schema.test.ts:78`-`80`, `tests/store/migration.test.ts:113`, `tests/store/migration.test.ts:149`, and `tests/store/migration.test.ts:168`.

## Compliance Matrix

### Store Specs: 23/23 compliant

- Adapter derives ObservationFact rows from the knowledge graph; honors filters; excludes deleted/non-observation sources; deterministic ordering: implemented in `src/store/index.ts:3073`-`3162`, covered by `tests/store/kg-facts-cutover.test.ts:91`, `:154`, `:190`.
- Content-section relations match legacy reader; metadata-derived relations match legacy labels; per-observation coverage matches: adapter synthesis at `src/store/index.ts:3127`-`3158`, uncapped parity tests at `tests/store/kg-facts-cutover.test.ts:116`, legacy/default flag parity at `tests/store/kg-facts-cutover.test.ts:223`.
- Existing retrieval primitives remain functional after removal; getObservationFacts returns KG-backed facts; indirect readers inherit KG source: default branch at `src/store/index.ts:3040`-`3043`, project graph uses `store.getObservationFacts` at `src/tools/project-views.ts:31`-`35`, tests at `tests/store/kg-facts-cutover.test.ts:247` and `tests/http-viz.test.ts:221`.
- Knowledge-lane fallback branch is removed on default path; ranking tiebreaker no longer references `observation_facts`; relation listing and visualization edges come from KG: guarded legacy branch only at `src/store/index.ts:2081`-`2112`, score/id tiebreaker at `src/store/index.ts:1807`-`1809`, relation/viz KG projection at `src/store/index.ts:2691`-`2752`, tests at `tests/store/kg-facts-cutover.test.ts:247`, `:270`, `:521`.
- Save no longer writes `observation_facts`; delete path cleans KG facts; rebuild repopulates KG and avoids dropped table: `refreshGraphFacts` dispatches to KG by default at `src/store/index.ts:1109`-`1115`, delete is KG-first with legacy guard at `src/store/index.ts:1138`-`1142`, rebuild writes deterministic KG facts at `src/store/index.ts:3165`-`3209`, tests at `tests/store/kg-facts-cutover.test.ts:313`, `:360`, `:389`, `:407`.
- Export shape unchanged and import round-trip unaffected: export/import remain sessions/observations/prompts at `src/store/index.ts:3366`-`3371` and `src/store/index.ts:3376`-`3447`, tests at `tests/store/export-import.test.ts:81` and `:110`.
- Drop idempotency, final live-runner placement, flag rollback, and post-drop rollback are covered by `src/store/migrations.ts:275`-`278`, `tests/store/migration.test.ts:113`, `:149`, `:168`.

### Knowledge-Graph Specs: 12/12 compliant

- Graph facts are served from KG by default and knowledge lane has one default graph source: `getObservationFacts` default KG branch at `src/store/index.ts:3040`-`3043`, KG lane emits `source: 'kg_triples'` at `src/store/index.ts:2071`-`2077`, default-path test at `tests/store/kg-facts-cutover.test.ts:247`.
- Graph facts are queryable immediately after save; re-save does not duplicate; LLM enrichment remains optional/non-blocking: save/update call `refreshGraphFacts` at `src/store/index.ts:1505`, `:1535`, `:1654`; helper is no-LLM at `src/indexing/jobs.ts:483`-`500`; dedupe/delete/upsert at `src/indexing/jobs.ts:521`-`554`; tests at `tests/store/kg-facts-cutover.test.ts:313`, `:455`.
- Readers degrade gracefully pre-backfill and backfill populates legacy coverage without breaking new writes: metadata-only/raw insert test at `tests/store/kg-facts-cutover.test.ts:494`, rebuild convergence test at `tests/store/kg-facts-cutover.test.ts:407`.
- Legacy subject/object strings become entity-backed triples and repeated backfill converges: entity/triple upsert loop at `src/indexing/jobs.ts:514`-`554`, rebuild coverage at `tests/store/kg-facts-cutover.test.ts:407`.
- Triple source/confidence/provenance and synchronous provenance are preserved: triple insert includes `source_type`, `source_id`, `provenance`, `confidence`, `extractor_version` at `src/indexing/jobs.ts:521`-`554`; tests at `tests/store/index.test.ts:1180` and `tests/store/kg-facts-cutover.test.ts:455`.
- Repeated extraction and sync/background convergence are covered by `tests/store/kg-facts-cutover.test.ts:455`.

### Indexing Specs: 9/9 compliant

- Save synchronously persists deterministic KG facts without model dependency; sync write idempotent: helper uses `extractKnowledgeTriples` without LLM args at `src/indexing/jobs.ts:491`-`499`, cap removed at `src/indexing/kg-extractor.ts:185`-`194`, tests at `tests/store/kg-facts-cutover.test.ts:313`, `tests/indexing/jobs.test.ts:201`.
- Background job enriches without being required; enrichment failure preserves deterministic facts: `processKgJob` writes deterministic facts first at `src/indexing/jobs.ts:427`-`451`, optional LLM branch follows at `src/indexing/jobs.ts:453`-`475`.
- CLI rebuild, HTTP rebuild, and operator-triggered backfill remain functional against KG: CLI handler at `src/cli.ts:576`-`586`, dispatch at `src/cli.ts:700`, HTTP test at `tests/http-viz.test.ts:93`, CLI tests at `tests/cli.test.ts:362` and `:384`.
- Save returns with semantic indexing pending but graph facts present; retrieval can observe pending semantic coverage: save enqueues semantic/KG jobs at `src/store/index.ts:1506`, `:1536`, `:1655`, status/progress surfaces at `src/store/index.ts:2288`-`2334`, tests at `tests/store/kg-facts-cutover.test.ts:337`-`353` and `tests/store/index.test.ts:587`.

### Evals Specs: 4/4 compliant

- Facts-source check passes on KG-sourced evidence and does not regress on removed source: `factsSourceChecks` uses `kg_triples` candidates at `src/evals/retrieval.ts:842`-`850`, tests at `tests/evals/retrieval.test.ts:59`.
- Graph fixtures populate KG-lane evidence and no eval path inserts into `observation_facts`: fixture insert targets `kg_triples` at `src/evals/retrieval.ts:352`-`356`, source test at `tests/evals/retrieval.test.ts:70`-`74`.

### Tools Specs: 4/4 compliant

- Compact MCP registry unchanged: six tools are registered at `src/tools/index.ts:23`-`28`, tested at `tests/tools/registry.test.ts:7`.
- Project graph ledger renders from KG and degrades gracefully before backfill: `formatProjectGraph` calls `store.getObservationFacts` at `src/tools/project-views.ts:31`-`35`; raw/no-content graceful test at `tests/store/kg-facts-cutover.test.ts:494`.
- Project graph output budget is preserved: graph/topic `max_chars` validation remains at `src/tools/mem-project.ts:17`-`32`, tested at `tests/tools/mem-project.test.ts:94`-`99`.

## Design Coherence

The implementation matches the design's three core decisions:

- Hybrid adapter: metadata synthesized from observations and content read from `kg_triples`/`kg_entities`, implemented at `src/store/index.ts:3073`-`3162`.
- Synchronous deterministic write: `writeDeterministicKgFacts` is shared by save/update/rebuild and background KG processing, implemented at `src/indexing/jobs.ts:451` and `src/indexing/jobs.ts:483`-`500`.
- Ordered drop in the live migration runner: idempotent drops are last in the transaction at `src/store/migrations.ts:275`-`278`, matching the resolved OQ-3 design.

## Issues Found

### Critical

None.

### Warnings

None.

## Constitution Suggestion

Surfaced, advisory only: this change touched/named constitution principles (`P1`, `P2`, `P3`) across proposal, design, tasks, and delta specs. Consider running `sdd-constitution` to record whether a constitution amendment is warranted. This does not affect the verdict.

## Verdict

pass
