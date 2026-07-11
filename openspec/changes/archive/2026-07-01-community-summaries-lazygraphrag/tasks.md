# Tasks: Community Summaries LazyGraphRAG

## Change
`community-summaries-lazygraphrag`

## Topic Key
`sdd/community-summaries-lazygraphrag/tasks`

## Artifact
`openspec/changes/community-summaries-lazygraphrag/tasks.md`

## Phase 1 — Schema foundation and migrations
- [x] 1.1 Add community summary schema DDL and community tables **[USN-01] | Priority: P1**
  **Spec:** knowledge-graph/Communities MUST be derived from `kg_entities` + `kg_triples`.
  - **Task:** Add `COMMUNITY_SUMMARIES_SQL` DDL blocks for `kg_community_runs`, `kg_communities`, `kg_community_members`, and `kg_community_evidence` in `src/store/schema.ts`, with project/run/algorithm/version/freshness/degraded fields and JSON coverage columns.
  - **Independent Test:** Validate schema contains the four new tables and that names/columns support project partitioning, provenance, and state tracking.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "creates community summary schema tables"`  
    Expected: New community tables/columns exist and are queryable by expected SQL projections.
- [x] 1.2 Add schema indexes and integrity checks for community artifacts **[USN-02] | Priority: P1**
  **Spec:** store/Community artifacts MUST be persisted as derived, additive state.
  - **Task:** Add indexes/checks in schema for bounded read paths and deterministic lookup (`project`, `run_id`, `freshness`, `degraded`, and community membership/evidence joins).
  - **Independent Test:** Assert lookup and purge queries are efficient and can constrain by `(project, status/freshness, run_id)` without schema errors.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "indexes support canonical community lookup"`  
    Expected: Query plans and test queries execute consistently after schema initialization.
- [x] 1.3 Preserve existing import/export contracts while adding community migrations **[USN-03] | Priority: P2**
  **Spec:** store/portable export/import contract MUST remain stable.
  - **Task:** Ensure migration path is additive only and does not alter existing export/import payload tables/version in `src/store/schema.ts`/`src/store/migrations.ts`.
  - **Independent Test:** Confirm exported/import payload structure does not include community-derived tables while schema migration still installs community artifacts.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "export/import excludes community artifacts"`  
    Expected: Existing export/import JSON fields stay unchanged; community tables are intentionally excluded.

## Phase 2 — Migrations and versioned initialization
- [x] 2.1 Add idempotent community migration registration **[USN-04] | Priority: P1**
  **Spec:** store/Community rebuild lifecycle MUST be idempotent.
  - **Task:** Add idempotent migration blocks for community tables/indexes in `src/store/migrations.ts` so repeated startup is safe.
  - **Independent Test:** Re-run migration helper and verify no duplicate DDL failures and retained committed data shape.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "migrations are idempotent"`  
    Expected: Repeated install/migrate calls succeed and do not duplicate tables/constraints.
- [x] 2.2 Make migration lifecycle resilient to failed and stale community runs **[USN-05] | Priority: P2**
  **Spec:** store/Store MUST support rollback-safe rebuild state transitions.
  - **Task:** Ensure migration/bootstrap supports `kg_community_runs.status` transitions and stale/failure states without blocking reads from prior committed rows.
  - **Independent Test:** Startup with preloaded failed run metadata yields stable reader semantics.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "failed run leaves prior committed rows readable"`  
    Expected: Latest committed run remains available when a failed run exists.

## Phase 3 — Config and validation
- [x] 3.1 Add deterministic community summaries config model and defaults **[USN-06] | Priority: P1**
  **Spec:** config/Algorithm configuration MUST include deterministic fallback.
  - **Task:** Add `communitySummaries` block to config model and defaults in `src/config.ts` (`enabled`, `readPath.enabled`, `algorithm`, `advancedAlgorithmFallback`, budgets, stale behavior, kg weight, optional enrichment settings).
  - **Independent Test:** Verify defaults map to connected-components baseline with retrieval read path disabled by default.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/config.test.ts -t "communitySummaries has deterministic offline defaults"`  
    Expected: Default config resolves offline-safe state and `readPath.enabled` defaults off.
- [x] 3.2 Add environment override parsing and precedence for community settings **[USN-07] | Priority: P1**
  **Spec:** config/Deterministic resolution precedence MUST be env then persisted then default.
  - **Task:** Add `THOTH_COMMUNITY_*` env parsing and precedence wiring in `src/config.ts` and expose through resolved config output.
  - **Independent Test:** Confirm env override wins persisted and that invalid values degrade to fallback safely.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/config.test.ts -t "communitySummaries env overrides persisted config"`  
    Expected: Env values are applied first; invalid algorithm falls back to connected-components behavior.
- [x] 3.3 Enforce bounded and validated community budget limits in config schema **[USN-08] | Priority: P2**
  **Spec:** config/Finite budgets by default MUST be enforced.
  - **Task:** Update `config.schema.json` with bounded enums/limits for summary/triple/community/enrichment values and no mandatory remote dependency fields.
  - **Independent Test:** Validate schema rejects negative/invalid/unbounded budget configurations where required.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/config.test.ts -t "community config schema rejects invalid budgets"`  
    Expected: Invalid values fail schema validation while safe defaults pass.

## Phase 4 — Store types, APIs, and deterministic rebuild behavior
- [x] 4.1 Add community type definitions and state model contracts **[USN-09] | Priority: P1**
  **Spec:** store/Community artifacts MUST include provenance and state metadata.
  - **Task:** Extend `src/store/types.ts` with community run/state/snapshot result types, input DTOs, and `CommunityState` union (`disabled|missing|fresh|stale|rebuilding|failed|empty|degraded`).
  - **Independent Test:** Compile-time and runtime shape checks for all new method contracts.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "community type shapes are present"`  
    Expected: New types compile and are used consistently by Store-facing methods.
- [x] 4.2 Implement deterministic project-scoped community rebuild and state APIs **[USN-10] | Priority: P1**
  **Spec:** store/Community rebuild MUST be transactional and project-scoped.
  - **Task:** Implement `rebuildCommunitySummaries` and `getCommunitySummaryState` in `src/store/index.ts` with project-level project scoping and run versioning.
  - **Independent Test:** Rebuild succeeds for one project without mutating other projects.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "rebuild is project-scoped and scoped"`  
    Expected: Only target project rows change; others remain intact.
- [x] 4.3 Implement deterministic connected-components reconstruction **[USN-11] | Priority: P1**
  **Spec:** knowledge-graph/Community Partitioning MUST Be Deterministic and Dependency-Light for MVP
  - **Task:** Add `connected_components_v1` rebuild path in Store-backed module; compute deterministic `community_id` and stable ordering.
  - **Independent Test:** Run connected-components on same fixture twice and compare community IDs/memberships.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "connected-components is deterministic"`  
    Expected: Stable community identifiers and membership ordering across repeated runs.
- [x] 4.4 Track freshness transitions for community rebuild state after KG changes **[USN-12] | Priority: P1**
  **Spec:** store/Freshness MUST reflect KG changes and staleness.
  - **Task:** Add `markCommunitySummariesStale(project, reason)` and call it from KG-affecting paths (`saveObservation`, `updateObservation`, `deleteObservation`, `rebuildObservationFacts`, `pruneSupersededTriples`, `migrateProject`, and delete lifecycle points).
  - **Independent Test:** Mutate KG source rows and confirm state transitions to stale/rebuild-needed.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "KG mutation marks stale"`  
    Expected: Fresh state switches to stale and read APIs surface non-freshness.
- [x] 4.5 Preserve committed community state across failed rebuilds **[USN-13] | Priority: P1**
  **Spec:** store/Failed rebuild must preserve prior committed version.
  - **Task:** Ensure rebuild transaction records failed status and keeps previous committed rows/readability when build cannot complete.
  - **Independent Test:** Inject deterministic rebuild failure and verify rollback retention semantics.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "failed rebuild keeps prior commit"`  
    Expected: Retrieval and state APIs still return pre-failure committed run data.
- [x] 4.6 Add bounded preview, drop, and retrieval surface APIs for communities **[USN-14] | Priority: P2**
  **Spec:** store/Drop/rebuild preview APIs MUST be bounded and explicit.
  - **Task:** Implement `previewCommunitySummaries`, `dropCommunitySummaries`, and `getCommunitySummariesForRetrieval` methods and associated bounded result shapes.
  - **Independent Test:** Preview returns bounded synthetic projection; drop only derived community artifacts.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts -t "preview and drop are bounded and scoped"`  
    Expected: Preview does not commit; drop never touches source memories/prompts/sessions.

## Phase 5 — Retrieval integration
- [x] 5.1 Add retrieval lane metadata for community evidence **[USN-15] | Priority: P1**
  **Spec:** retrieval/Community evidence MUST remain inside `kg` lane.
  - **Task:** Extend `src/retrieval/ranking.ts` to include `source: 'kg_community_summary'` and `community` metadata while preserving lane set (`sentence`, `chunk`, `lexical`, `kg`).
  - **Independent Test:** Assert lane union remains four values and community candidates map to `kg`.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/evals/retrieval.test.ts -t "community evidence is in kg lane"`  
    Expected: No fifth lane appears; community evidence uses `lane: 'kg'`.
- [x] 5.2 Enforce deterministic ranking preference between KG and community candidates **[USN-16] | Priority: P1**
  **Spec:** retrieval/Direct KG must rank above community summaries on ties.
  - **Task:** Add stable tie-break priority and conservative default `kgCommunityWeight = 0.45` plus bounded `maxRetrievalCommunities`.
  - **Independent Test:** Compare scoring of equal KG and community candidates with direct KG winning.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/evals/retrieval.test.ts -t "direct kg outranks community summary"`  
    Expected: `kg_triples` candidate remains above community-summary candidate.
- [x] 5.3 Implement retrieval fallback for degraded community summaries **[USN-17] | Priority: P2**
  **Spec:** retrieval/Degraded or stale summaries MUST gracefully fallback.
  - **Task:** Hook retrieval read-path to skip stale/missing/failed/disabled summaries and emit compact degradation markers while preserving baseline lanes.
  - **Independent Test:** Verify fallback path when summary state is non-fresh under all states.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/evals/retrieval.test.ts -t "degraded summaries fall back to baseline"`  
    Expected: sentence/chunk/lexical/kg multi-hop still return baseline results with degraded marker.

## Phase 6 — Tools/admin surfaces (CLI + HTTP, MCP unchanged)
- [x] 6.1 Confirm MCP tool registry remains unchanged **[USN-18] | Priority: P1**
  **Spec:** tools/MCP surface remains exactly six tools.
  - **Task:** Keep MCP registry untouched; do not add registry entries in tool registration for community operations.
  - **Independent Test:** Validate tool list still equals `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, `mem_session`.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/tools/registry.test.ts -t "mcp tool registry remains six entries"`  
    Expected: Registry output exactly matches six-tool baseline.
- [x] 6.2 Add project-scoped CLI community admin commands **[USN-19] | Priority: P1**
  **Spec:** tools/CLI rebuild/inspection should be project-scoped and bounded.
  - **Task:** Add community admin commands in `src/cli.ts` (`rebuild-communities`, `preview-communities`, `communities-status`, `drop-communities`) with validation parallel to existing admin operations.
  - **Independent Test:** Add CLI tests for command parsing and scoped success/error responses.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/cli.test.ts -t "community admin commands are project-scoped"`  
    Expected: Commands execute with bounded output and project/all validation semantics.
- [x] 6.3 Add bounded HTTP community admin routes and catalog entries **[USN-20] | Priority: P1**
  **Spec:** tools/HTTP admin routes MUST expose rebuild/inspection only.
  - **Task:** Add `POST /communities/rebuild`, `POST /communities/preview`, `GET /communities/status`, `GET /projects/:project/communities`, and `DELETE /communities` in `src/http-server.ts`, `src/http-routes.ts`, and `src/http-openapi.ts`; update operation catalog.
  - **Independent Test:** Verify route handlers are present and do not alter MCP tool behavior.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/http-server.test.ts -t "community HTTP admin routes exist"`  
    Expected: Routes resolve and return bounded payloads without exposing MCP tool expansion.
- [x] 6.4 Add optional additive community metadata to project views **[USN-21] | Priority: P2**
  **Spec:** tools/project views MAY include bounded community metadata.
  - **Task:** Add optional compact community summary annotation in `src/tools/mem-recall.ts` and `src/tools/project-views.ts` while retaining backward-compatible output and no schema changes.
  - **Independent Test:** Assert legacy consumers still parse existing outputs when no communities are read.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/tools/mem-recall.test.ts tests/tools/mem-project.test.ts -t "community annotation is additive"`  
    Expected: Existing outputs remain parseable and additive annotations are bounded.

## Phase 7 — Evals and validation
- [x] 7.1 Add deterministic community summary rebuild tests and fixtures **[USN-22] | Priority: P1**
  **Spec:** evals/Community construction must be deterministic and offline.
  - **Task:** Add `tests/store/community-summaries.test.ts` (new) with deterministic fixtures for project scoping, empty KG, dedupe convergence, and export/import compatibility.
  - **Independent Test:** Assert stable output for identical KG inputs and explicit fallback state for empty/degraded cases.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`  
    Expected: Deterministic rebuild, empty-project handling, and no community-fact dependency.
- [x] 7.2 Add no-regression retrieval coverage for community enabled/disabled paths **[USN-23] | Priority: P1**
  **Spec:** evals/No-regression must hold for existing retrieval behavior.
  - **Task:** Extend retrieval eval scenarios in `src/evals/retrieval.ts` and `tests/evals/retrieval.test.ts` for community enabled vs disabled no-regression, stale/failed/degraded fallback, and lane assertions.
  - **Independent Test:** Run both deterministic and regression-aware cases where direct KG/multi-hop still pass.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`  
    Expected: Existing retrieval fixtures retain pass status; no fifth lane introduced.
- [x] 7.3 Add bounded coverage and default-off read-path tests for community summaries **[USN-24] | Priority: P2**
  **Spec:** evals/Ranking and bounded output must be enforced before default enablement.
  - **Task:** Add tests to prove summary bounds, coverage metadata, and gate for `readPath.enabled` default behavior in eval harness.
  - **Independent Test:** Verify bounds metrics and default-off read path are enforced.
  - **Verification:**  
    Run: `pnpm exec vitest run tests/config.test.ts tests/evals/retrieval.test.ts`  
    Expected: Default run path remains disabled until evidence gate allows enabling.

## Phase 8 — Verification and finish
- [x] 8.1 Run full build for schema/store/retrieval implementation changes **[USN-25] | Priority: P1**
  **Spec:** schema/store/retrieval implementations MUST compile cleanly and pass build baseline.
  - **Task:** Execute full build for TypeScript/API correctness after task completion.
  - **Independent Test:** `pnpm run build`.
  - **Verification:**  
    Run: `pnpm run build`  
    Expected: TypeScript compile and project build complete without errors.
- [x] 8.2 Run repository test suite and targeted validation after changes **[USN-26] | Priority: P1**
  **Spec:** full-suite stability after all touched paths.
  - **Task:** Run repository test suite and targeted focused suites for changed areas.
  - **Independent Test:** `pnpm test` and targeted vitest invocations in sequence.
  - **Verification:**  
    Run: `pnpm test`  
    Expected: No regressions in existing and new tests; all passing.

## Phase summary
- Total tasks: 26
- P1: 20
- P2: 6
- P3: 0

## Execution order summary
1. `schema` + `migrations` (`USN-01` to `USN-05`)
2. `config` and schema validation (`USN-06` to `USN-08`)
3. `store types/methods/rebuild core` (`USN-09` to `USN-14`)
4. `retrieval` integration (`USN-15` to `USN-17`)
5. `tools/admin CLI+HTTP, MCP boundary` (`USN-18` to `USN-21`)
6. `evals and tests` (`USN-22` to `USN-24`)
7. `verification` (`USN-25` to `USN-26`)

## Next Step
plan-reviewer

## Warnings / blockers
- None discovered while generating tasks.
- `tests/store/community-summaries.test.ts` is a new file referenced by plan and expected to be created in execution.



