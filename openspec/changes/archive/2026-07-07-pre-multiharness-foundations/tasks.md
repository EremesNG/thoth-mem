# Tasks: Pre-Multiharness Foundations

> ⚠️ Warning: `tests/store/identity.test.ts` does not currently exist and is required for identity coverage. This task list creates it.
> ⚠️ Warning: `tests/utils/token-metrics.test.ts` does not currently exist and is required for token metric utility coverage. This task list creates it.

## Phase 1: Identity and configuration foundation

- [x] 1.1 Add shared identity baseline resolver contract with precedence and degraded metadata — `src/store/identity.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `config/Project Identity Resolver v2 MUST Resolve Stable Project Identity Deterministically`
  **Independent Test:** A focused resolver test file can cover explicit input precedence, deterministic fallback path selection, and degraded-source metadata.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/identity.test.ts`
  - Expected: Explicit input always wins; precedence and source labels are stable across repeated runs.

- [x] 1.2 Create resolver regression and session-placeholder tests — `tests/store/identity.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `config/Session Identity Normalization MUST Distinguish Explicit Stable IDs From Missing or Placeholder IDs`
  **Independent Test:** Tests cover explicit, blank, placeholder (`manual-save-*`), and synthesized IDs and verify no implicit mutation of legacy rows.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/identity.test.ts`
  - Expected: Resolver behavior matches all session-id scenarios, and historical placeholders remain query-stable.

- [x] 1.3 Add config-based default project identity input path — `src/config.ts`, `config.schema.json`
  **[USN-1]** | Priority: P2
  **Spec:** `config/Project Identity Resolver v2 MUST Resolve Stable Project Identity Deterministically`
  **Independent Test:** Config tests verify `THOTH_PROJECT` and persisted `project.default` parse into identity input without breaking existing env behavior.
  **Verification**:
  - Run: `pnpm exec vitest run tests/config.test.ts`
  - Expected: Config default and env project identity are resolved and emitted to identity callers.

- [x] 1.4 Consume shared resolver in store persistence and imports — `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `store/Store Identity Boundaries MUST Consume a Shared Resolver v2 Contract`
  **Independent Test:** Store save/session/import/sync-equivalent tests confirm explicit identity equivalence across paths and deterministic fallback on missing values.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/sessions.test.ts tests/store/export-import.test.ts`
  - Expected: Explicit identity is preserved, fallback is deterministic, and degraded reasons are surfaced.

- [x] 1.5 Preserve historical identity rows without silent repair — `src/store/index.ts`, `tests/store/export-import.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `config/Identity Resolver v2 MUST Preserve Historical Data Without Silent Repair`
  **Independent Test:** Import/export and session fixtures verify legacy `unknown` projects and `manual-save-*` sessions remain query-stable after resolver v2 is introduced.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/export-import.test.ts tests/store/sessions.test.ts`
  - Expected: Historical placeholder records are not rewritten or silently repaired.

## Phase 2: Community health read model and rendering

- [x] 2.1 Add bounded community health read model with seven states — `src/store/types.ts`, `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `store/Store MUST Provide Community Health State Inputs`
  **Independent Test:** Health reader unit tests cover `fresh`, `stale`, `rebuilding`, `failed`, `degraded`, `missing`, and `disabled` without unbounded scans.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: Read model exposes state, graph basis/signature, coverage, latest job status, and degraded reasons.

- [x] 2.2 Render health states in `mem_project(action="health")` with bounded metadata only — `src/tools/mem-project.ts`, `src/tools/project-views.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `tools/mem_project action=health MUST Report Community Summary Health State`
  **Independent Test:** Tool tests verify fresh/stale/rebuilding/failed/degraded/missing/disabled are all observable and bounded.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-project.test.ts`
  - Expected: Health text remains bounded and includes only safe metadata.

- [x] 2.3 Add coverage/freshness/job state tests for missing/disabled/failed/rebuilding paths — `tests/store/community-summaries.test.ts`
  **[USN-4]** | Priority: P2
  **Spec:** `knowledge-graph/Community Health Coverage MUST Be Bounded and Source-Attributed`
  **Independent Test:** Fixtures verify disabled and missing are distinct; failed/rebuilding reflect latest job metadata; stale uses basis mismatch.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: All coverage and stale/failure/rebuild branches are deterministic and explicit.

- [x] 2.4 Validate stable graph freshness basis and community job state mapping — `src/store/index.ts`, `tests/store/community-summaries.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `knowledge-graph/Community Health MUST Use a Stable Graph Freshness Basis`
  **Independent Test:** Fixtures verify matching graph signatures report fresh, signature drift reports stale, and failed/running runs remain source-attributed.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: Community health uses stored/current graph signatures as freshness basis and exposes drift deterministically.

- [x] 2.5 Validate community rebuild, failure, and degraded job states — `src/store/index.ts`, `tests/store/community-summaries.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `knowledge-graph/Community Job State MUST Reflect Rebuild, Failure, and Degraded Conditions`
  **Independent Test:** Fixtures insert or trigger running, failed, degraded, and previous-committed states and assert health reports the latest safe job state.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: Rebuilding, failed, degraded, and previous-readable states are distinguishable in health output.

## Phase 3: Telemetry foundation for payload and token metrics

- [x] 3.1 Add token/payload metric utility with explicit basis labels — `src/utils/token-metrics.ts`, `src/store/types.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `observability/Runtime Telemetry MUST Capture Payload and Token-Savings Metrics Per Tool`
  **Independent Test:** Utility tests verify char counts, estimated token basis, and exact/estimate separation.
  **Verification**:
  - Run: `pnpm exec vitest run tests/utils/token-metrics.test.ts`
  - Expected: Metric utility returns consistent, bounded metrics with explicit basis labels.

- [x] 3.2 Persist metrics in operation traces without raw sensitive payload leakage — `src/store/schema.ts`, `src/store/migrations.ts`, `src/store/index.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `store/Store Telemetry Aggregation MUST Record Payload and Escalation Metrics Without Raw Content Leakage`
  **Independent Test:** Trace persistence tests ensure telemetry rows keep only safe counts/ids/hashes and sanitize behavior remains intact.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/operation-traces.test.ts`
  - Expected: Trace rows store metrics JSON and correlation fields without raw private content.

- [x] 3.3 Add non-recursive trace wrapper checks for metrics — `src/tools/tracing.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `observability/Telemetry MUST Preserve Existing Trace Privacy and Bounds`
  **Independent Test:** Trace wrapper tests demonstrate that metric persistence does not invoke a traced tool recursively.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/trace-wrapper.test.ts`
  - Expected: Tracing and metric persistence remain non-recursive and bounded.

- [x] 3.4 Add mem_get avoided/escalated aggregation behavior with safe identifiers — `src/store/index.ts`
  **[USN-5]** | Priority: P2
  **Spec:** `observability/Telemetry MUST Count mem_get Avoidance and Escalation Without Raw Content`
  **Independent Test:** Aggregation tests validate avoided/escalated counters against deterministic correlation windows/id reuse.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/operation-traces.test.ts`
  - Expected: Avoidance is only credited when no later correlated full fetch is required.

## Phase 4: Retrieval and eval telemetry extension

- [x] 4.1 Add payload/token metadata to recall/context/mem_get formatting paths — `src/tools/mem-recall.ts`, `src/tools/mem-context.ts`, `src/tools/mem-get.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `retrieval/Recall and Context Paths MUST Emit Token-Savings Measurement Metadata`
  **Independent Test:** Tool tests for recall/context/get verify full/evidence/returned metrics and token basis labels are returned.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-recall.test.ts tests/tools/mem-get.test.ts`
  - Expected: Size/token basis metadata is present where applicable.

- [x] 4.2 Measure compact/context sufficiency versus escalation paths — `src/store/index.ts`, `src/tools/mem-context.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `retrieval/Retrieval MUST Measure Compact/Context Answers Versus mem_get Escalation`
  **Independent Test:** Correlation tests show compact/context-only cases as avoided and later full-fetch cases as escalated.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/operation-traces.test.ts`
  - Expected: Avoided and escalated are mutually exclusive for each answer path.

- [x] 4.3 Extend eval telemetry envelope and include compaction recovery evidence — `src/evals/retrieval.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `evals/Evals MUST Report Runtime Token-Savings Telemetry`
  **Independent Test:** Eval tests validate new envelope fields for averages, counts, and compaction recovery.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: Retrieval report includes avg payloads, mem_get avoided/escalated counts, token basis, and compaction case evidence.

- [x] 4.4 Verify eval report quality and command compatibility — `tests/evals/retrieval.test.ts`
  **[USN-6]** | Priority: P2
  **Spec:** `evals/Evals MUST Include Recall-After-Compaction Evidence`
  **Independent Test:** Running retrieval eval command shows both quality gates and telemetry fields in output.
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: Eval command succeeds and prints expanded token-savings telemetry while preserving recall/rank gates.

- [x] 4.5 Add eval cases for mem_get avoided/escalated and compaction recovery — `src/evals/retrieval.ts`, `tests/evals/retrieval.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `evals/Evals MUST Measure mem_get Avoided and Escalated Paths`
  **Independent Test:** Eval fixtures include compact/context-only answer paths and explicit full-fetch paths so avoided/escalated counts are both asserted.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: Eval report counts avoided and escalated paths without granting avoidance credit to later full fetches.

- [x] 4.6 Validate recall-after-compaction telemetry in retrieval paths — `src/tools/mem-context.ts`, `src/evals/retrieval.ts`, `tests/evals/retrieval.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `retrieval/Recall-After-Compaction Evidence MUST Be Measurable`
  **Independent Test:** Compaction-like fixtures prove the recall funnel recovers evidence and records privacy-safe success/failure telemetry.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: Recall-after-compaction cases report recovered counts, failures, and payload savings without raw content leakage.

## Phase 5: Cross-surface integration and registry safety

- [x] 5.1 Keep existing MCP registry and expose new behavior through existing actions — `src/tools/index.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `tools/This Change MUST Preserve the Compact MCP Tool Surface`
  **Independent Test:** Registry tests still assert exactly six tools and existing action names.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/registry.test.ts`
  - Expected: Tool registry is unchanged.

- [x] 5.2 Mirror identity and health telemetry on HTTP/CLI/sync boundaries — `src/http-routes.ts`, `src/cli.ts`, `src/sync/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `store/Store Identity Boundaries MUST Consume a Shared Resolver v2 Contract`
  **Independent Test:** HTTP/CLI/import/sync tests verify explicit identity preservation, deterministic fallback, and health/telemetry visibility where those surfaces already expose state.
  **Verification**:
  - Run: `pnpm exec vitest run tests/http-server.test.ts tests/sync/sync.test.ts tests/store/export-import.test.ts`
  - Expected: Surfaces share resolver semantics and expose equivalent degraded/fallback metadata.

- [x] 5.3 Add focused health state coverage for tool render output — `tests/tools/mem-project.test.ts`
  **[USN-3]** | Priority: P2
  **Spec:** `tools/Health Output MUST Be Bounded and Privacy-Safe`
  **Independent Test:** Tool tests verify bounded output and no raw summary content leakage.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-project.test.ts`
  - Expected: Output remains bounded and omits prompt/observation bodies and private text.

- [x] 5.4 Register new identity test file in identity verification flow — `tests/store/identity.test.ts`
  **[USN-1]** | Priority: P2
  **Spec:** `store/Store Identity Boundaries MUST Consume a Shared Resolver v2 Contract`
  **Independent Test:** The new file is runnable in isolation and integrated into focused identity gates.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/identity.test.ts`
  - Expected: `tests/store/identity.test.ts` exists and runs as part of the focused identity verification set.

## Phase 6: Final verification and archive readiness

- [x] 6.1 Run all focused foundation gates for this change
  **[USN-6]** | Priority: P1
  **Spec:** `store/Store Telemetry Aggregation MUST Record Payload and Escalation Metrics Without Raw Content Leakage`
  **Independent Test:** Focused suites for identity, health, telemetry, and eval telemetry validate prerequisite behavior before full-suite pass.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/identity.test.ts tests/store/community-summaries.test.ts tests/store/operation-traces.test.ts tests/tools/mem-recall.test.ts tests/tools/mem-project.test.ts tests/tools/mem-get.test.ts tests/evals/retrieval.test.ts`
  - Expected: Focused gates pass with no regressions.

- [x] 6.2 Run repository-wide build/test/eval gates
  **[USN-6]** | Priority: P1
  **Spec:** `config/Project Identity Resolver v2 MUST Resolve Stable Project Identity Deterministically`
  **Independent Test:** Build and full suite confirm no cross-module regressions outside the pre-multiharness foundation scope.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript compiles successfully.
  - Run: `pnpm test`
  - Expected: Full test suite passes.
  - Run: `pnpm run eval:retrieval`
  - Expected: Retrieval evals pass with expanded telemetry output.
