# Tasks: Layered CI browser testing

## MVP scope

US1 is the first independently testable story: package scripts and CI expose non-overlapping non-browser, integration, browser-smoke, and performance selections, while pull-request jobs produce independent signals. Completion evidence is a passing delivery-contract test plus successful list/focused command probes for every lane.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005`; `T006 -> T007 -> T008 -> T009`; `T004 -> T009`; `T009 -> T010 -> T011`; `T003 + T005 + T011 -> T012`; `T001-T012 -> T013 -> T014`.

## Story US1

- [x] T001 [US1] Add a failing delivery-contract test for disjoint lane ownership, filterable non-browser aggregation, clean-checkout package-build prerequisites, 4 independent pull-request jobs, performance separation, and failure-only uploads covering FR-001/FR-002/FR-006/FR-008 and SC-001/SC-002/SC-005 in `tests/packaging/ci-test-lanes.test.ts` | Verify: the focused test fails on the current monolithic scripts/workflow and reports missing lanes plus the absent pre-Vitest package build.
- [x] T002 [US1] Define reusable unit, integration, browser-smoke, and browser-performance file selections and additive package commands while preserving filterable non-browser aggregation and building package output before both packaging-owning commands for FR-001 and SC-001 in `vitest.test-patterns.ts` | Verify: the delivery-contract test reports 100% single-lane ownership, 0 browser files in the non-browser aggregate, and package build ordering before Vitest in both packaging-owning commands.
- [x] T003 [US1] Split pull-request execution into exactly 4 independent quality/unit, integration, browser-smoke, and retrieval-evaluation jobs with failure-only smoke artifacts for FR-002/FR-008 and SC-002 in `.github/workflows/ci.yml` | Verify: the delivery-contract test observes 4 jobs, 0 inter-lane needs dependencies, all expected commands, and missing-file-tolerant failure uploads.
- [x] T004 [US1] Rename real-browser tests to explicit lane suffixes and split 2 timing/long-task scenarios from the 3 deterministic full-atlas functional scenarios for FR-006 and SC-005 in `tests/dashboard` | Verify: Vitest list output assigns every renamed browser file to exactly 1 lane, smoke lists 3 full-atlas functional tests, and performance lists 2 timing tests.
- [x] T005 [US1] Add a scheduled/manual dense-atlas workflow that runs only the browser-performance command and publishes failure diagnostics for FR-006/FR-008 in `.github/workflows/dashboard-performance.yml` | Verify: the delivery-contract test finds schedule plus workflow_dispatch, the performance command, no pull_request trigger, and failure-only missing-file-tolerant upload.

## Story US2

- [x] T006 [US2] Add failing browser lifecycle cases proving 1 shared PID across 2 isolated invocations, distinct context/target identity, storage isolation, 0 leaks across at least 6 lifecycle boundaries, and observable process/profile removal after an isolated global-setup teardown for FR-003/FR-004/FR-005 and SC-003/SC-004 in `tests/dashboard/dashboard-browser-harness-faults.browser.test.ts` | Verify: focused browser tests fail because current invocations launch independent Chrome/Vite lifecycles, expose no context evidence, and have no callable global-teardown seam.
- [x] T007 [US2] Extract bounded owned-browser startup, executable resolution, process termination, and profile cleanup primitives without changing their failure contracts for FR-003 and SC-004 in `tests/dashboard/dashboard-browser-process.ts` | Verify: focused process fault cases pass for retries, signal exits, executable selection, launch flags, process disappearance, and owned-profile containment.
- [x] T008 [US2] Start exactly 1 shared Chrome process per browser Vitest run, provide serializable endpoint metadata, expose an isolated setup/returned-teardown test seam, and release its process/profile during bounded teardown for FR-003 and SC-003/SC-004 in `tests/dashboard/dashboard-browser-global-setup.ts` | Verify: two harness invocations observe the same provided PID and the isolated teardown probe reports 0 owned process/profile leaks after completion.
- [x] T009 [US2] Replace per-test Chrome/Vite startup with a fresh shared-browser context/target plus per-test Store/HTTP bridge, direct built-dashboard serving, and reverse-order partial-setup cleanup for FR-004/FR-005 and SC-003/SC-004 in `tests/dashboard/dashboard-browser-harness.ts` | Verify: focused lifecycle and representative smoke cases pass with distinct context/target IDs, isolated storage, direct bridge origins, and 0 Vite resources.

## Story US3

- [x] T010 [US3] Preserve shared deterministic full-atlas fixture builders for smoke and performance cases without duplicating product expectations for FR-006 and SC-005 in `tests/dashboard/full-atlas-fixtures.ts` | Verify: smoke and performance files compile and list exactly their owned 3 and 2 scenarios.

## Story US4

- [x] T011 [US4] Add a red contract for exactly 1 CI-mode failing acceptance capture, 1 passing invocation with 0 captures, explicit 2 MiB/512 KiB/32 KiB byte caps, and original-error preservation for FR-007 and SC-007 in `tests/dashboard/dashboard-browser-diagnostics.browser.test.ts` | Verify: the focused test fails before diagnostic capture exists and never relies on dashboard private implementation details.
- [x] T012 [US4] Capture a screenshot, UTF-8-safe truncated DOM, and JSON metadata only for unexpected CI-mode acceptance failures within 2 MiB/512 KiB/32 KiB caps and ignore capture errors for FR-007/FR-008 and SC-007 in `tests/dashboard/dashboard-browser-harness.ts` | Verify: the diagnostics contract passes with 3 capped files for the failure, 0 files for the pass, and the original injected error unchanged.

## Parallel execution

- None: configuration, test classification, harness lifecycle, and workflow contracts share the same lane definitions and must advance as one TDD writer to avoid contradictory ownership or overlapping edits.

## Final verification

- [x] T013 Update canonical contributor testing guidance with the new commands, CI gates, browser build prerequisite, isolation model, performance schedule, and cleanup/artifact expectations for FR-001/FR-002/FR-003/FR-004/FR-005/FR-006/FR-007/FR-008 in `docs/agent/testing.md` | Verify: every documented command exists in package scripts and every claimed CI lane exists in its workflow.
- [x] T014 Run focused delivery/lifecycle/diagnostic tests, all lane commands, dashboard typecheck, production build, retrieval evaluation, diff checks, cleanup scans, and independent Oracle verification covering SC-001/SC-002/SC-003/SC-004/SC-005/SC-007 in `openspec/changes/layered-ci-browser-testing/verify-report.md` | Verify: the report records an Oracle PASS, complete buildable-SC evidence, 0 unrelated/generated/secret files, and SC-006 remains explicitly marked as a post-merge scheduled outcome target.

SC-006 is an outcome criterion and will be observed across 3 scheduled remote runs; it does not create an implementation task.
