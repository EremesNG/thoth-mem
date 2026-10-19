# Tasks: Agent Operational Health

## Phase 1: MCP Registry and Health Action Contract (Accelerated)

- [x] 1.1 Add focused MCP registry test to lock the six-tool surface and add health action coverage in `mem_project` tests — `tests/tools/registry.test.ts`, `tests/tools/mem-project.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-01-mem-project-health`
  **Independent Test:** A focused registry test asserts `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` only.
  **Verification**:
  - Run: `pnpm test -- tests/tools/registry.test.ts tests/tools/mem-project.test.ts`
  - Expected: Registry test validates exact six-tool inventory, and `mem_project` supports `action="health"` while unchanged action inputs remain valid.

## Phase 2: Legacy Drift Repro and Guarding

- [x] 2.1 Add focused regression coverage reproducing legacy drift and default KG read-path behavior without `observation_facts` — `tests/store/kg-facts-cutover.test.ts`, `tests/tools/mem-recall.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-02-missing-observation-facts`
  **Independent Test:** Separate focused tests should run on a DB state where `observation_facts` is missing to confirm default KG-backed recall and graph actions continue without crash.
  **Verification**:
  - Run: `pnpm test -- tests/store/kg-facts-cutover.test.ts tests/tools/mem-recall.test.ts`
  - Expected: No uncaught `no such table: observation_facts`; default paths return controlled degraded/empty outputs and the failure mode is observable when path is explicitly legacy.

- [x] 2.2 Add focused `mem_project(action="health")` legacy-mode assertion for explicit legacy configuration paths — `tests/tools/mem-project.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-03-legacy-health-reporting`
  **Independent Test:** Health response explicitly reports a degraded legacy state and names missing `observation_facts` when legacy mode is explicitly selected.
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-project.test.ts`
  - Expected: Health output includes a legacy drift section with named missing table and non-crashing behavior when explicit legacy mode targets a legacy-only path.

## Phase 3: Store Helper and mem_project Health Branch

- [x] 3.1 Add/adjust Store helper tests for compact, defensive legacy detection and drift-report shape — `tests/store/kg-facts-cutover.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-04-helper-drift-detection`
  **Independent Test:** Store helper-level tests validate observed drift markers from `observationFactsTableExists` and related health/state probes.
  **Verification**:
  - Run: `pnpm test -- tests/store/kg-facts-cutover.test.ts`
  - Expected: Store helpers expose drift detection without throwing, and health-relevant status fields remain bounded and deterministic.

- [x] 3.2 Add compact health aggregation helper (or helper extension) for `src/store/index.ts` using existing health/state signals and explicit legacy drift status output shape.
  **[USN-3]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-05-no-new-mcp-tool`
  **Independent Test:** Add or extend a Store-level health method used by MCP callers to return `health`, `legacy_drift`, `semantic`, `visualization`, `jobs`, and `coverage` signals in bounded form.
  **Verification**:
  - Run: `pnpm test -- tests/store/kg-facts-cutover.test.ts`
  - Expected: `src/store/index.ts` offers a stable health-aggregation path that includes explicit missing `observation_facts` detection but does not alter non-health behavior.

- [x] 3.3 Add formatter/action branch for compact health output in `src/tools/mem-project.ts` and `src/tools/project-views.ts`.
  **[USN-4]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-05-no-new-mcp-tool`
  **Independent Test:** Implement `action="health"` handling in existing `mem_project` dispatch, and format compact sections with bounded size.
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-project.test.ts`
  - Expected: `action="health"` is exposed through the existing `mem_project` tool only (no new MCP tool), with compact human-readable health output and unchanged existing `mem_project` action coverage.

- [x] 3.4 Add explicit defensive guards for missing `observation_facts` on explicit legacy read paths without swallowing unrelated SQL errors (e.g., non-legacy failures still propagate).
  **[USN-5]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-03-legacy-health-reporting`
  **Independent Test:** Add focused tests asserting legacy read paths catch the missing-table case and classify it as legacy drift, while unrelated `SELECT`/constraint/database failures remain reported.
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-recall.test.ts`
  - Expected: Legacy-mode read paths return controlled degraded outputs or explicit MCP errors when `observation_facts` is missing; unrelated SQL errors are preserved for diagnosis.

## Phase 4: Integration Focus and Guardrails

- [x] 4.1 Integration focus on end-to-end health + legacy drift + existing action invariants (`list|summary|graph|topics|topic|health`) with six-tool behavior — `tests/tools/mem-project.test.ts`, `tests/tools/mem-recall.test.ts`, `tests/tools/registry.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-07-end-to-end-operational-health`
  **Independent Test:** Focused integration-style run validates no regression in existing action behavior while adding health output and explicit degraded legacy reporting.
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-project.test.ts tests/tools/mem-recall.test.ts tests/tools/registry.test.ts`
  - Expected: Existing `mem_project` actions keep output-budget semantics, health action is present, and registry invariants stay exact.

## Phase 5: Verification Gates

- [x] 5.1 Focused implementation verification, including KG cutover + health surface smoke test — `tests/tools/mem-project.test.ts`, `tests/store/kg-facts-cutover.test.ts`, `tests/tools/mem-recall.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-08-implementation-evidence`
  **Independent Test:** Focused execution that proves the slice works before global gate and captures any residual drift edges.
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-project.test.ts tests/tools/mem-recall.test.ts tests/store/kg-facts-cutover.test.ts`
  - Expected: Focused suites cover health action, tool registry behavior, and missing `observation_facts` drift without regressions.

- [x] 5.2 Run repository build and full tests as final gate
  **[USN-6]** | Priority: P1
  **Spec:** `sdd/agent-operational-health:SC-09-final-gate`
  **Independent Test:** Global validation after implementing tasks.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript and bundling checks pass.
  - Run: `pnpm test`
  - Expected: Full Vitest suite passes.
