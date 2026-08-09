# Tasks: Forced Codex version override

## Authoring contract

Task identifiers are sequential across the change. Each executable task names one owned path, maps to requirements or success criteria, and ends with observable verification evidence.

## MVP scope

US1 is the MVP: controlled forced Codex `0.146.x` and `0.147.x` setup selects `plugin_manager`, preserves normal evidence-derived status, and emits one bounded warning, while paired unforced cases remain unchanged.

## Dependencies

`T001 -> T003 -> T004`; `T002 -> T003 -> T004`; `T005 -> T006`; `T003 + T004 + T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014`.

## Story US1

- [x] T001 [US1] Add failing forced and paired unforced inspector/setup cases for Codex 0.146.x and 0.147.x with absent and compatible manager state, covering FR-001, FR-002, FR-003, FR-004, SC-001, SC-002, and SC-003 in `tests/setup/codex-cli.test.ts` | Verify: targeted red tests demonstrate the missing force-aware strategy and warning behavior without mutating real state
- [x] T002 [US3] Add failing forced safety and output cases for incomplete grammar, malformed or conflicting state, warning parity, and legacy-only backup diagnostics, covering FR-005, FR-006, FR-007, SC-004, SC-005, and SC-006 in `tests/setup/codex-cli.test.ts` | Verify: targeted red tests distinguish the version override from every preserved safety gate and diagnostic boundary
- [x] T003 [US1] Implement default-false force context, version-predicate override, bounded warning generation, and execution diagnostic preservation with FR-001, FR-002, FR-003, FR-004, FR-005, SC-001, SC-002, SC-003, and SC-004 coverage in `src/setup/codex-cli.ts` | Verify: direct inspector and executor tests pass for forced and unforced versions with exactly one warning only when the override selects plugin manager
- [x] T004 [US1] Propagate the immutable request force value through no-op, primary, and final Codex inspections and condition backup diagnostics on an actual legacy mutation with FR-002, FR-003, FR-005, FR-006, SC-002, SC-003, and SC-005 coverage in `src/setup/engine.ts` | Verify: engine results preserve the forced strategy across the full flow, omit irrelevant modern backup messages, and retain legacy backup evidence

## Story US2

- [x] T005 [US2] Add failing CLI contract assertions for force request propagation, help wording, and human/JSON warning parity with FR-003, FR-004, SC-003, and SC-006 coverage in `tests/cli.test.ts` | Verify: targeted red tests show the public option is parsed unchanged and its expanded Codex semantics are visible on both renderers
- [x] T006 [US2] Update existing force help text without changing option parsing or setup result schema with FR-003 and FR-004 coverage in `src/cli.ts` | Verify: CLI tests pass and setup requests still contain the same boolean force field

## Story US3

- [x] T007 [US3] Document that Codex force may bypass only the version gate while capability, state, ownership, and cleanup safeguards remain mandatory, covering FR-004 and FR-005 in `README.md` | Verify: documented commands and safety language match the implemented CLI behavior and expose no private paths or state
- [x] T008 [US3] Simplify the touched force-aware strategy and diagnostic logic without changing behavior, covering FR-001 through FR-007 in `src/setup/codex-cli.ts` | Verify: the simplify review reports no redundant branches or duplicated warning construction and focused tests remain green

## Parallel execution

- None: The initial tests intentionally share the controlled Codex fixture and source expectations, while subsequent source, CLI, and documentation work depends on the same finalized public behavior; sequential ownership avoids overlapping edits and contradictory assertions.

## Final verification

- [x] T009 Run the focused Codex CLI setup suite covering FR-001 through FR-007 and SC-001 through SC-006 in `tests/setup/codex-cli.test.ts` | Verify: pnpm test for the file exits zero with all controlled forced, unforced, and safety cases passing
- [x] T010 Run the focused public CLI suite covering FR-003, FR-004, SC-003, and SC-006 in `tests/cli.test.ts` | Verify: pnpm test for the file exits zero and human/JSON outputs remain aligned
- [x] T011 Run the complete setup domain suite covering cross-setup regressions in `tests/setup` | Verify: all setup tests exit zero with OpenCode, Codex, Claude, receipt, and rollback behavior intact
- [x] T012 Run read-only integration package verification for managed-delivery invariants in `package.json` | Verify: pnpm run integration:verify exits zero without synchronizing or mutating published assets
- [x] T013 Run the root TypeScript, build, and dashboard build gate for the changed interfaces in `package.json` | Verify: pnpm run build exits zero
- [x] T014 Run the full Vitest regression suite for final implementation evidence in `package.json` | Verify: pnpm test exits zero with no unrelated test regression
