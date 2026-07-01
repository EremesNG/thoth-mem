# Tasks: Memory Consolidation, Reflection, and Decay

## Phase 1 — Infrastructure and Configuration

- [x] 1.1 Establish deterministic maintenance configuration precedence and rollback defaults — `src/config.ts`, `config.schema.json`

**[USN-1]** | Priority: P1
**Spec:** `config/Maintenance Configuration MUST Resolve Deterministically With Env Overrides`
**Independent Test:** Verify env override wins for maintenance settings and deterministic rollback defaults apply when values are unset.
**Verification**:
- Run: `pnpm test -- tests/config.test.ts`
- Expected: Configuration precedence and conservatively deterministic defaults are validated.

- [x] 1.2 Add explicit disablement switches for automatic runs and consumption paths — `src/config.ts`

**[USN-1]** | Priority: P1
**Spec:** `config/Maintenance MUST Be Disableable Without Migration`
**Independent Test:** Validate that both automatic execution and read-path maintenance consumption can be independently disabled through config.
**Verification**:
- Run: `pnpm test -- tests/config.test.ts`
- Expected: Disabling flags are observed independently and persist with restart.

- [x] 1.3 Make decay policy explicit, measurable, and explainable in config — `src/config.ts`, `config.schema.json`

**[USN-1]** | Priority: P2
**Spec:** `config/Decay Policy Configuration MUST Be Explicit and Measurable`
**Independent Test:** Validate typed decay policy keys, allowed values, and measurable thresholds are persisted and validated.
**Verification**:
- Run: `pnpm test -- tests/config.test.ts`
- Expected: Invalid policy inputs are rejected and policy rationale remains explainable.

- [x] 1.4 Document maintenance schema fields and unknown-key safety — `config.schema.json`

**[USN-1]** | Priority: P2
**Spec:** `config/Config Schema MUST Document Maintenance Settings`
**Independent Test:** Validate schema documentation and closed-object behavior for maintenance keys.
**Verification**:
- Run: `pnpm test -- tests/config.test.ts`
- Expected: Documented settings are accepted; unknown settings fail validation.

## Phase 2 — Store Schema, Migrations, and Metadata

- [x] 2.1 Implement deterministic and transactional maintenance planning paths — `src/store/maintenance.ts`, `src/store/index.ts`, `src/store/schema.ts`

**[USN-2]** | Priority: P1
**Spec:** `store/Store Maintenance Runs MUST Be Deterministic, Auditable, and Transactional`
**Independent Test:** Dry-run and apply planning produce deterministic outcomes and rollback on failure.
**Verification**:
- Run: `pnpm test -- tests/store/admin.test.ts`
- Expected: Scoped maintenance runs are deterministic and transactional.

- [x] 2.2 Preserve source memories and consolidation provenance during maintenance writes — `src/store/maintenance.ts`, `src/store/index.ts`

**[USN-2]** | Priority: P1
**Spec:** `store/Consolidation MUST Preserve Source Memories and Provenance`
**Independent Test:** Validate stable source IDs and provenance fields survive consolidation updates.
**Verification**:
- Run: `pnpm test -- tests/store/admin.test.ts`
- Expected: Consolidated outputs keep source memory lineage and provenance attributes.

- [x] 2.3 Persist reflection outputs as source-linked durable records — `src/store/index.ts`

**[USN-2]** | Priority: P1
**Spec:** `store/Reflection Outputs MUST Be Source-Linked Durable Memory Records`
**Independent Test:** Save and fetch reflected outputs and verify source linkage remains durable over updates.
**Verification**:
- Run: `pnpm test -- tests/store/admin.test.ts`
- Expected: Reflection records persist with source IDs and remain readable by ID.

- [x] 2.4 Apply reversible decay via ranking metadata only — `src/store/index.ts`

**[USN-2]** | Priority: P2
**Spec:** `store/Decay MUST Be Reversible Ranking Metadata by Default`
**Independent Test:** Confirm decayed records retain full content with only score/ranking metadata changes.
**Verification**:
- Run: `pnpm test -- tests/store/admin.test.ts`
- Expected: Decayed records remain retrievable and decays are reversible by configuration.

- [x] 2.5 Keep maintenance metadata portable across export/import boundaries — `src/store/index.ts`

**[USN-2]** | Priority: P2
**Spec:** `store/Maintenance Metadata MUST Preserve Portable Export/Import Semantics`
**Independent Test:** Export records then re-import while validating portability and internal metadata regeneration.
**Verification**:
- Run: `pnpm test -- tests/store/export-import.test.ts`
- Expected: Portable records import cleanly and maintenance internals are regenerated safely.

## Phase 3 — Knowledge Graph Consistency and Evidence

- [x] 3.1 Preserve `kg_triples` as the only graph fact source — `src/store/index.ts`, `src/store/schema.ts`

**[USN-3]** | Priority: P1
**Spec:** `knowledge-graph/Maintenance MUST Preserve `kg_triples` as the Graph-Derived Fact Source`
**Independent Test:** Verify maintenance metadata does not introduce a parallel fact graph source outside `kg_triples`.
**Verification**:
- Run: `pnpm test -- tests/store/graph-lite.test.ts`
- Expected: Fact reads resolve from `kg_triples` and source graph provenance remains unchanged.

- [x] 3.2 Add graph evidence nodes/edges for consolidation and reflection provenance — `src/store/maintenance.ts`, `src/store/index.ts`, `src/tools/project-views.ts`

**[USN-3]** | Priority: P1
**Spec:** `knowledge-graph/Consolidation and Reflection Provenance MUST Be Representable in Graph Evidence`
**Independent Test:** Emit graph evidence records linking consolidated/reflected outputs to original source facts.
**Verification**:
- Run: `pnpm test -- tests/store/graph-lite.test.ts tests/tools/mem-project.test.ts`
- Expected: Provenance edges remain queryable and source-linked.

- [x] 3.3 Represent decay priority changes without pruning or supersession reversal in KG views — `src/store/index.ts`, `src/retrieval/ranking.ts`, `src/tools/project-views.ts`

**[USN-3]** | Priority: P1
**Spec:** `knowledge-graph/Decay MUST Deprioritize Graph Evidence Without Reversing Supersession or Pruning Contracts`
**Independent Test:** Validate decayed graph evidence is down-ranked while supersession and pruning invariants remain intact.
**Verification**:
- Run: `pnpm test -- tests/store/admin.test.ts tests/store/graph-lite.test.ts`
- Expected: No decay-driven pruning occurs and supersession ordering is preserved.

## Phase 4 — Retrieval and Ranking Semantics

- [x] 4.1 Preserve source reachability while suppressing duplicate noise in compact retrieval — `src/retrieval/ranking.ts`

**[USN-4]** | Priority: P1
**Spec:** `retrieval/Retrieval MUST Suppress Duplicate Noise While Preserving Source Reachability`
**Independent Test:** Verify duplicate cluster suppression keeps one compact winner while retaining source IDs.
**Verification**:
- Run: `pnpm test -- tests/retrieval/hyde-generator.test.ts`
- Expected: Source IDs remain present after suppression.

- [x] 4.2 Promote reflections while preserving source records in ranking output — `src/retrieval/ranking.ts`, `src/store/index.ts`, `src/tools/mem-context.ts`

**[USN-4]** | Priority: P1
**Spec:** `retrieval/Retrieval MUST Promote Source-Linked Reflections Without Hiding Sources`
**Independent Test:** Ensure reflected content can be ranked up when useful and source records stay accessible.
**Verification**:
- Run: `pnpm run eval:retrieval`
- Expected: Reflections appear where useful without removing source-memory visibility.

- [x] 4.3 Apply decay as down-weighted ranking without global hiding — `src/retrieval/ranking.ts`

**[USN-4]** | Priority: P2
**Spec:** `retrieval/Decay MUST Down-Weight Low-Value or Stale Memories Without Global Hiding`
**Independent Test:** Validate stale results are still visible under strong query signal but ranked lower.
**Verification**:
- Run: `pnpm test -- tests/retrieval/hyde-generator.test.ts`
- Expected: No global filtering occurs; stale results can reappear under high relevance.

- [x] 4.4 Confirm maintenance disablement restores post-change baseline retrieval behavior — `src/retrieval/ranking.ts`, `src/store/index.ts`

**[USN-4]** | Priority: P2
**Spec:** `retrieval/Disabled Maintenance Consumption MUST Match the Post-C1 Baseline`
**Independent Test:** Toggle maintenance-consumption off and compare evidence/rank parity against baseline expectations.
**Verification**:
- Run: `pnpm test -- tests/store/context.test.ts`
- Expected: Baseline ranking and context assembly are restored when maintenance consumption is disabled.

## Phase 5 — Tool Outputs and Project Views

- [x] 5.1 Keep MCP tool registry compact and unchanged during maintenance work — `src/tools/index.ts`

**[USN-5]** | Priority: P1
**Spec:** `tools/Maintenance MUST NOT Change the Compact MCP Tool Registry`
**Independent Test:** Assert tool registration set remains unchanged after adding maintenance behavior.
**Verification**:
- Run: `pnpm test -- tests/tools/registry.test.ts`
- Expected: The compact tool registry matches the expected six-tool boundary.

- [x] 5.2 Surface maintenance effects in recall and context tool output metadata — `src/tools/mem-recall.ts`, `src/tools/mem-context.ts`

**[USN-5]** | Priority: P1
**Spec:** `tools/`mem_recall` and Context Tools MUST Surface Maintenance Effects Transparently`
**Independent Test:** Validate output text/evidence includes maintenance/consolidation/reflection/decay flags.
**Verification**:
- Run: `pnpm test -- tests/tools/mem-recall.test.ts`
- Expected: Maintenance effects are discoverable through tool responses.

- [x] 5.3 Preserve full-record recoverability by id for suppressed or decayed items — `src/tools/mem-get.ts`, `src/tools/mem-context.ts`

**[USN-5]** | Priority: P2
**Spec:** `tools/Full-Record Tooling MUST Preserve Source Recoverability`
**Independent Test:** Retrieve items via ids and through context paths even if ranking suppresses them.
**Verification**:
- Run: `pnpm test -- tests/tools/mem-get.test.ts tests/tools/mem-context.test.ts`
- Expected: Full records remain fetchable with unchanged schema.

- [x] 5.4 Keep `mem_project` graph and summary modes within existing boundaries — `src/tools/mem-project.ts`, `src/tools/project-views.ts`

**[USN-5]** | Priority: P2
**Spec:** `tools/`mem_project` Views MUST Respect Existing Graph and Summary Boundaries`
**Independent Test:** Confirm project graph output and summary mode preserve existing boundaries and budget contracts.
**Verification**:
- Run: `pnpm test -- tests/tools/mem-project.test.ts`
- Expected: Project graph is non-dashboard style and summary behavior remains scoped.

## Phase 6 — Admin Indexing and Degraded Modes

- [x] 6.1 Add bounded, scoped, idempotent automatic maintenance orchestration — `src/store/maintenance.ts`, `src/store/index.ts`, `src/cli.ts`

**[USN-6]** | Priority: P1
**Spec:** `indexing/Automatic Maintenance MUST Be Bounded, Idempotent, and Disableable`
**Independent Test:** Execute automatic maintenance with scoped bounds and verify bounded retries converge idempotently.
**Verification**:
- Run: `pnpm test -- tests/store/admin.test.ts`
- Expected: Automatic mode is bounded, repeatable, and stoppable.

- [x] 6.2 Define safe degradation paths when semantic or model features are unavailable — `src/store/maintenance.ts`, `src/store/index.ts`

**[USN-6]** | Priority: P1
**Spec:** `indexing/Maintenance MUST Degrade Safely When Semantic or Model Capabilities Are Unavailable`
**Independent Test:** Simulate unavailable semantic/model paths and verify deterministic lane fallback continues safely.
**Verification**:
- Run: `pnpm test -- tests/store/admin.test.ts`
- Expected: Missing optional lanes do not fail maintenance, source writes, or lexical/graph retrieval.

- [x] 6.3 Keep admin entry points outside MCP while enabling preview/apply workflows — `src/cli.ts`, `src/http-server.ts`, `src/http-routes.ts`, `src/http-openapi.ts`

**[USN-6]** | Priority: P2
**Spec:** `indexing/Maintenance Entry Points MUST Reuse Admin Boundaries and Stay Outside MCP Registration`
**Independent Test:** Validate admin route/command for preview/apply and absence from MCP tool registry.
**Verification**:
- Run: `pnpm test -- tests/cli.test.ts tests/http-server.test.ts`
- Expected: Preview/apply is admin-only and no MCP registration changes occur.

## Phase 7 — Evals and Regression Gate

- [x] 7.1 Add retrieval eval for duplicate suppression with source reachability — `tests/evals/retrieval.test.ts`

**[USN-7]** | Priority: P1
**Spec:** `evals/Evals MUST Validate Duplicate Suppression With Source Reachability`
**Independent Test:** Validate source reachability remains for suppressed duplicates.
**Verification**:
- Run: `pnpm run eval:retrieval`
- Expected: Duplicate suppression improves signal without source loss.

- [x] 7.2 Validate reflection quality and idempotent outputs in evals — `tests/evals/retrieval.test.ts`

**[USN-7]** | Priority: P1
**Spec:** `evals/Evals MUST Validate Reflection Quality and Idempotency`
**Independent Test:** Run reflection eval twice and assert idempotent results with non-duplicative reflections.
**Verification**:
- Run: `pnpm run eval:retrieval`
- Expected: Reflection output quality remains and duplicate reflection outputs do not appear.

- [x] 7.3 Add decay eval coverage that down-weights without masking current facts — `tests/evals/retrieval.test.ts`

**[USN-7]** | Priority: P1
**Spec:** `evals/Evals MUST Validate Decay Down-Weighting Without Hiding Current Facts`
**Independent Test:** Assert stale entries rank lower while recent facts still surface first.
**Verification**:
- Run: `pnpm run eval:retrieval`
- Expected: Current facts remain retrievable while stale entries are deprioritized.

- [x] 7.4 Add regression gates for default maintenance behavior and no retrieval drift — `tests/evals/retrieval.test.ts`

**[USN-7]** | Priority: P2
**Spec:** `evals/Evals MUST Gate Maintenance Defaults on No Retrieval Regression`
**Independent Test:** Compare baseline fixtures against maintenance defaults for regression budgets.
**Verification**:
- Run: `pnpm run eval:retrieval`
- Expected: No unintended retrieval regression is introduced at defaults.

- [x] 7.5 Add export/import lifecycle evals for maintenance metadata regeneration — `tests/evals/retrieval.test.ts`, `tests/store/export-import.test.ts`

**[USN-7]** | Priority: P2
**Spec:** `evals/Evals MUST Validate Export/Import Maintenance Semantics`
**Independent Test:** Export imported records, re-run maintenance semantics, and verify resulting behavior is recoverable and deterministic.
**Verification**:
- Run: `pnpm test -- tests/store/export-import.test.ts`
- Expected: Export/import maintenance semantics remain stable and deterministic.

## Phase 8 — End-to-End Verification Gates

- [x] 8.1 Run complete build gate after shared TypeScript/API changes — no file edits

**[USN-8]** | Priority: P1
**Spec:** `tools/Maintenance MUST NOT Change the Compact MCP Tool Registry`
**Independent Test:** Compile the full TypeScript package and dashboard build after maintenance integration.
**Verification**:
- Run: `pnpm run build`
- Expected: Build completes cleanly with no TypeScript or bundled output regressions.

- [x] 8.2 Run full project regression suite before archive — no file edits

**[USN-8]** | Priority: P1
**Spec:** `evals/Evals MUST Gate Maintenance Defaults on No Retrieval Regression`
**Independent Test:** Execute the complete Vitest regression suite after all implementation tasks.
**Verification**:
- Run: `pnpm test`
- Expected: Full regression suite passes.

- [x] 8.3 Run final maintenance-aware retrieval eval before archive — no file edits

**[USN-8]** | Priority: P1
**Spec:** `evals/Evals MUST Gate Maintenance Defaults on No Retrieval Regression`
**Independent Test:** Execute the retrieval eval harness after implementation and regression tests.
**Verification**:
- Run: `pnpm run eval:retrieval`
- Expected: Retrieval eval passes with maintenance-aware fixtures and no unintended baseline drift.
