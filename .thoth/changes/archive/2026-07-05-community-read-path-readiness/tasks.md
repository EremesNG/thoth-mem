# Tasks: Community Read Path Readiness

## Phase 1: Readiness and default-off contract
- [x] 1.1 Add explicit readiness coverage for `communitySummaries.readPath.enabled` default-off preservation — `tests/config.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Community Read Path Readiness#Default-Off Preservation`
  **Independent Test:** Resolve default config with no env or persisted override and assert `communitySummaries.readPath.enabled` remains `false`.
  **Verification**:
  - Run: `pnpm exec vitest run tests/config.test.ts`
  - Expected: Config tests pass and fail if the community read path default changes to `true`.

- [x] 1.2 Guard explicit env and persisted override behavior for community read-path config — `tests/config.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `proposal/Community Read Path Readiness#Default-Off Preservation`
  **Independent Test:** Assert explicit env/config values continue to set `communitySummaries.readPath.enabled` deterministically while preserving schema bounds.
  **Verification**:
  - Run: `pnpm exec vitest run tests/config.test.ts`
  - Expected: Env/persisted override tests pass, and no path silently upgrades the default.

- [x] 1.3 Strengthen retrieval eval assertions for disabled and enabled no-regression rates — `tests/evals/retrieval.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `proposal/Community Read Path Readiness#Readiness Gates`
  **Independent Test:** Run the retrieval eval report assertions and verify `community_disabled_no_regression_rate` and `community_enabled_no_regression_rate` are present and passing.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: Retrieval eval tests pass with disabled/enabled no-regression readiness rates asserted.

## Phase 2: Fallback, lanes, and output bounds
- [x] 2.1 Verify no-fifth-lane invariant in retrieval and MCP output — `tests/store/community-summaries.test.ts`, `tests/tools/mem-recall.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Community Read Path Readiness#No-Fifth-Lane`
  **Independent Test:** Assert community evidence remains under `lane: 'kg'` / `source: 'kg_community_summary'` and no `community` lane appears.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts tests/tools/mem-recall.test.ts`
  - Expected: Community evidence remains a KG sub-source, and the output never introduces a fifth lane.

- [x] 2.2 Validate stale, degraded, and missing-summary fallback paths — `tests/store/community-summaries.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Community Read Path Readiness#Stale/Degraded Fallback`
  **Independent Test:** Exercise missing/stale/degraded community states and assert baseline retrieval remains usable with visible degraded markers where relevant.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: Retrieval returns usable fallback candidates and does not throw when community summaries are unavailable or degraded.

- [x] 2.3 Enforce compact MCP output bounds for community read-path summaries — `tests/tools/mem-recall.test.ts`
  **[USN-6]** | Priority: P2
  **Spec:** `proposal/Community Read Path Readiness#Output Bounds`
  **Independent Test:** Enable the read path in a bounded fixture and assert summary count, char budget, evidence count, and coverage payload limits remain respected.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-recall.test.ts`
  - Expected: Compact/context recall output stays within configured community summary and coverage bounds.

- [x] 2.4 Add or strengthen direct-KG and multi-hop no-regression assertions — `tests/evals/retrieval.test.ts`
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Community Read Path Readiness#Compact-MCP / KG-Lane Safety`
  **Independent Test:** Assert `community_direct_kg_no_regression_rate` and `community_multi_hop_no_regression_rate` remain present and passing in the retrieval eval summary.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: Direct KG and B2 multi-hop no-regression metrics remain asserted and passing.

## Phase 3: Readiness reporting and release gate
- [x] 3.1 Make retrieval eval readiness output explicit enough for rollout decisions — `src/evals/retrieval.ts`, `tests/evals/retrieval.test.ts`
  **[USN-8]** | Priority: P1
  **Spec:** `proposal/Community Read Path Readiness#Readiness Evaluations`
  **Independent Test:** Run the retrieval eval and assert the report exposes the readiness/gating metrics needed for a future rollout decision without changing runtime defaults.
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: Eval exits 0 and prints token-savings plus community readiness/gating metrics with no hard-fail behavior beyond existing gates.

- [x] 3.2 Run focused and full verification for readiness hardening — all affected modules
  **[USN-9]** | Priority: P1
  **Spec:** `proposal/Community Read Path Readiness#Runtime Compatibility`
  **Independent Test:** Execute focused readiness suites and then the repository baseline gates.
  **Verification**:
  - Run: `pnpm exec vitest run tests/config.test.ts tests/evals/retrieval.test.ts tests/store/community-summaries.test.ts tests/tools/mem-recall.test.ts`
  - Expected: Focused readiness suites pass.
  - Run: `pnpm run build`
  - Expected: Type-check and build pass.
  - Run: `pnpm test`
  - Expected: Full test suite passes with no regressions.

## Execution Order

Execute Phase 1 before Phase 2 so default/metric contract expectations are pinned before fallback and lane hardening. Execute Phase 3 last, after readiness assertions and bounded-output checks are in place.

## Next Step

Review this task plan with `plan-reviewer` before execution.
