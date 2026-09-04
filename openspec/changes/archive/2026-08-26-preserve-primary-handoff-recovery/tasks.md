# Tasks: Preserve primary handoff recovery

## MVP scope

US1 is the MVP: a newest handoff that fits by itself remains complete under competing-memory pressure, demonstrated through both the renderer and shared lifecycle seams.

## Dependencies

`T001 -> T003`; `T002 -> T003`; `T003 -> T004 -> T005 -> T006`; `T006 -> T007`. The final real-host SC-004 smoke follows installation and user-operated Codex and OpenCode restarts after buildable verification.

## Story US1

- [x] T001 [US1] Add a failing competing-memory renderer fixture covering complete primary-handoff reservation for FR-001, FR-002, FR-003, SC-001 in `tests/memory-core/continuation.test.ts` | Verify: the test fails because the fitting handoff currently ends with an ellipsis and passes only when its full hidden action survives under the 1,000-code-point cap.
- [x] T002 [US1] Add a shared-lifecycle fixture with a fitting hidden handoff and older competing memories for FR-001, FR-005, SC-002 in `tests/integration/lifecycle.test.ts` | Verify: recovery exposes the exact hidden pending action, complete selected IDs, and bounded host-neutral context after implementation.
- [x] T003 [US1] Reserve a complete individually fitting primary handoff before remaining-budget secondary selection for FR-001, FR-002, FR-003, SC-001, SC-002 in `src/memory-core/continuation.ts` | Verify: focused renderer and lifecycle tests pass without increasing the cap or changing adapter and MCP contracts.

## Story US2

- [x] T004 [US2] Extend oversized-primary, no-handoff, Unicode, and truthful-measurement regression coverage for FR-003, FR-004, SC-003 in `tests/memory-core/continuation.test.ts` | Verify: oversized handoffs remain explicitly truncated with intact memory IDs while existing safety fixtures remain green.

## Parallel execution

- None: all red tests constrain the same continuation allocation contract and the single implementation writer must preserve their ordered evidence before changing the renderer.

## Final verification

- [x] T005 Simplify and review the bounded allocation diff for FR-001, FR-002, FR-003, FR-004 in `src/memory-core/continuation.ts` | Verify: the final code has one explicit primary reservation path, no duplicated allocation policy, and no unrelated behavior change.
- [x] T006 Run focused, full, packaging, benchmark-fixture, prepublish, and diff checks for FR-001, FR-002, FR-003, FR-004, FR-005, SC-001, SC-002, SC-003 in `package.json` | Verify: all declared local checks pass and final Oracle verification records independent evidence before archive.

## Story US3

- [x] T007 [US3] Record the fresh no-tools Codex and OpenCode model-consumption smokes for FR-005, SC-004 in `openspec/changes/preserve-primary-handoff-recovery/verify-report.md` | Verify: both restarted sessions return all hidden fields exactly, contain zero tool calls or tool parts, and distinguish hook execution, delivery, and observed model consumption.
