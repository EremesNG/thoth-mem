# Tasks: OpenCode root identity tool

## MVP scope

US1 is the MVP: the public OpenCode plugin factory exposes `thoth_mem_root_identity`, and a root invocation returns the exact verified v1 JSON while producing zero lifecycle dispatches.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009`; each TDD slice depends on the previous green behavior because all slices share the plugin and its public runtime test.

## Story US1

- [x] T001 [US1] Add the failing public root-tool contract test for FR-001, FR-002, FR-005, FR-006 and SC-001, SC-002, SC-004 in `tests/integration/opencode-runtime.test.ts` | Verify: the focused test fails because `thoth_mem_root_identity` is absent
- [x] T002 [US1] Implement the minimal root-only native tool and exact v1 verified JSON for FR-001, FR-002, FR-005, FR-006 and SC-001, SC-002, SC-004 in `integrations/opencode/plugin.mjs` | Verify: the focused root-tool test passes and records zero dispatch requests

## Story US2

- [x] T003 [US2] Add the failing nested delegated-chain contract test for FR-002, FR-003, FR-004 and SC-002 in `tests/integration/opencode-runtime.test.ts` | Verify: the focused test fails because the tool does not yet resolve the terminal root and delegated authorization
- [x] T004 [US2] Implement bounded parent traversal and delegated root/caller authorization mapping for FR-002, FR-003, FR-004 and SC-002 in `integrations/opencode/plugin.mjs` | Verify: root and 2-level delegated focused tests pass with exact complete JSON objects

## Story US3

- [x] T005 [US3] Add failing table-driven degraded-result tests for FR-003, FR-005, FR-006 and SC-003, SC-004 in `tests/integration/opencode-runtime.test.ts` | Verify: focused cases expose missing handling for unavailable lookup, malformed or mismatched records, broken links, cycle, depth overflow, and unavailable project
- [x] T006 [US3] Implement fixed-depth cycle-safe failure handling and bounded degraded v1 JSON for FR-003, FR-005, FR-006 and SC-003, SC-004 in `integrations/opencode/plugin.mjs` | Verify: all focused identity-tool cases pass, omit `root_session_id` on degradation, and existing lifecycle tests remain green
- [x] T007 [US3] Apply behavior-preserving simplification across FR-001 through FR-006 and SC-001 through SC-005 in `integrations/opencode/plugin.mjs` | Verify: the focused runtime suite remains green with no broader API or documentation changes

Outcome SC-006 remains a separately authorized real-host verification target and does not create an implementation task.

## Parallel execution

- None: every implementation slice edits `integrations/opencode/plugin.mjs` and every test slice edits `tests/integration/opencode-runtime.test.ts`; preserving one writer and strict red-green order forbids safe overlap.

## Final verification

- [x] T008 Record independent Oracle evidence for FR-001 through FR-006 and buildable SC-001 through SC-005 in `openspec/changes/opencode-root-identity-tool/verify-report.md` | Verify: Oracle returns PASS after focused tests, package verification, build, full suite, and diff hygiene checks
- [x] T009 Prepare closeout for FR-001 through FR-006, buildable SC-001 through SC-005, and outcome SC-006 in `openspec/changes/opencode-root-identity-tool/archive-report.md` | Verify: archive report is READY with SC-006 explicitly observed or recorded as residual RISK
