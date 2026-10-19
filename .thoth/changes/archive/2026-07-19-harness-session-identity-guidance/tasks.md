# Tasks: Harness session identity guidance

## MVP scope

US2 is the MVP: a supported native lifecycle event exposes the already verified root session ID and project in bounded model-visible context, demonstrated through the public `MemoryIntegrationCore.handle` result.

## Dependencies

T001 precedes T002; T002 precedes T003; T003 precedes T004; T004 precedes T005; T005 precedes T006; T006 precedes T007 and T008; T007 and T008 precede T009; T009 precedes T012; T012 precedes T010 and T011; T010 and T011 precede T013 and T014.

## Story US2

- [x] T001 [US2] Add the failing lifecycle identity-header test for FR-005 and SC-003 in `tests/integration/lifecycle.test.ts` | Verify: the focused named test fails because host output lacks the verified root session ID and project
- [x] T002 [US2] Prepend lifecycle-resolved identity to confirmed host output for FR-005 and SC-003 in `src/integration/core/lifecycle.ts` | Verify: the focused identity-header test passes and existing recovery context remains visible
- [x] T003 [US2] Add failing Unicode budget and overlong-identity tests for FR-006 and SC-004 in `tests/integration/lifecycle.test.ts` | Verify: focused boundary tests fail because identity-aware budgeting is not yet enforced
- [x] T004 [US2] Enforce complete-identity-first bounded output for FR-006 and SC-004 in `src/integration/core/lifecycle.ts` | Verify: all focused lifecycle tests pass and emitted text is at most 1,000 Unicode code points

## Story US1

- [x] T005 [US1] Add the failing canonical skill-bundle contract test for FR-001, FR-002, FR-003, FR-004, SC-001, and SC-002 in `tests/integration/hook-command.test.ts` | Verify: the focused test fails because routing and the 3 harness references are absent
- [x] T006 [US1] Add progressive routing and thin Codex, Claude Code, and OpenCode identity references for FR-001, FR-002, FR-003, FR-004, SC-001, and SC-002 in `skills/thoth-mem` | Verify: the focused canonical skill-bundle test passes and every reference maps identity without duplicating the common recipe

## Story US3

- [x] T007 [US3] Add failing inventory and package-layout tests for FR-008, SC-005, and SC-006 in `tests/packaging/inventory.test.ts` | Verify: focused tests fail because packaged references are undeclared
- [x] T008 [US3] Add failing synchronization and runtime-declaration tests for FR-007, FR-008, SC-005, and SC-006 in `tests/integration/hook-command.test.ts` | Verify: focused tests fail because reference synchronization and validation are absent
- [x] T009 [US3] Declare 3 packaged harness-reference assets for FR-008, SC-005, and SC-006 in `integrations/inventory.json` | Verify: inventory parsing accepts unique shared roles and collected package files remain fully declared
- [x] T010 [US3] Synchronize all canonical harness references for FR-007, SC-005, and SC-006 in `scripts/sync-integration-assets.mjs` | Verify: the disposable synchronization test reports changed reference paths and produces byte-identical files
- [x] T011 [US3] Validate every packaged harness reference for FR-008, SC-005, and SC-006 in `scripts/verify-integration-package.mjs` | Verify: runtime declaration verification rejects a missing or undeclared reference
- [x] T012 [US3] Add byte-identical published harness references for FR-007, FR-008, SC-005, and SC-006 in `plugin/skills/thoth-mem/references` | Verify: focused delivery tests and the read-only integration verifier pass

## Parallel execution

- None: lifecycle output, canonical guidance, and delivery tests form dependent red-green slices, and one writer must coordinate the shared plugin inventory and skill bundle.

## Final verification

- [x] T013 Simplify the owned diff while preserving FR-001 through FR-008 and SC-001 through SC-006 in `src/integration/core/lifecycle.ts` | Verify: focused tests remain green and the complete diff contains no duplicated workflow guidance or unrelated edits
- [x] T014 Map independent evidence for FR-001 through FR-008 and SC-001 through SC-006 in `openspec/changes/harness-session-identity-guidance` | Verify: Oracle records PASS, the closeout gate accepts complete evidence, and archive readiness is explicit
