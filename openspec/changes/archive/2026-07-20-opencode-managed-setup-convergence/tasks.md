# Tasks: OpenCode managed setup convergence

## MVP scope

US1 is the first independently testable slice: global and project OpenCode setup accepts older, newer, missing, malformed, and same-version-diverged managed state, replaces the complete canonical assets and plugin entry without force, writes current metadata, and immediately reruns as an exact no-op. Completion evidence is T001-T004 for FR-001, FR-002, FR-003, FR-011, SC-001, and the filesystem portion of SC-002.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016 -> T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023`; shared setup transaction types, orchestration, and fixtures require one sequential writer. US2 recovery depends on the US1 filesystem primitive, US3 configuration tests precede engine integration, and US4 packed verification follows all runtime behavior.

## Story US1 - Converge an existing OpenCode installation

- [x] T001 [US1] Add failing global/project convergence and exact no-op tests covering FR-001, FR-002, FR-011 and SC-001 in `tests/setup/engine.test.ts` | Verify: stale, missing, malformed, newer, and same-version-diverged fixtures fail for the currently missing behavior while exact state remains a no-op
- [x] T002 [US1] Implement OpenCode-only desired-state classification, convergence reasons, source preflight, and no-force planning covering FR-001, FR-002, FR-011 and SC-001 in `src/setup/engine.ts` | Verify: T001 passes and existing Codex and Claude ownership outcomes remain unchanged
- [x] T003 [US1] Add failing authoritative cross-kind and link/junction replacement tests covering FR-003 and SC-001, SC-002 in `tests/setup/engine.test.ts` | Verify: real-filesystem cases fail because current transactions reject kind changes and linked canonical entries
- [x] T004 [US1] Implement opt-in whole-target replacement, raw-link backup/snapshot, non-traversing containment, and exact restoration covering FR-003 and SC-001, SC-002 in `src/setup/filesystem.ts` | Verify: T003 and the existing filesystem fault matrix pass while every link destination remains byte-identical

## Story US3 - Repair OpenCode configuration deterministically

- [x] T005 [US3] Add failing JSONC precedence, parseable-parent repair, malformed recreation, and secret-safe diagnostic tests covering FR-004 and SC-003 in `tests/setup/engine.test.ts` | Verify: both-config, invalid-parent, and malformed-root cases fail for the missing convergence behavior
- [x] T006 [US3] Implement parseable OpenCode config normalization and malformed-root classification covering FR-004 and SC-003 in `src/setup/harnesses/opencode.ts` | Verify: planner tests preserve unrelated parseable settings and never include raw invalid content in conflicts
- [x] T007 [US3] Integrate transaction-owned non-colliding malformed-config quarantine and JSONC selection covering FR-004 and SC-003 in `src/setup/engine.ts` | Verify: T005 passes, failure removes the quarantine, success retains a byte-exact owner-protected backup, and output discloses only its path

## Story US2 - Survive interrupted replacement

- [x] T008 [US2] Add failing target-bound journal, valid restore-and-retry, invalid reset, target-isolated cleanup, and cleanup-warning retry tests covering FR-005, FR-006, FR-007, FR-008 and SC-002, SC-004 in `tests/setup/rollback.test.ts` | Verify: tests expose current shared receipt blocking and post-success durable rollback state
- [x] T009 [US2] Implement target-bound OpenCode journal keys, safe namespace reset, tolerant legacy matching, and target-confined cleanup covering FR-005, FR-006, FR-007, FR-008 and SC-002, SC-004 in `src/setup/receipt.ts` | Verify: helper evidence proves no shared-key rotation, cross-target deletion, embedded-path traversal, or secret-bearing diagnostics
- [x] T010 [US2] Integrate pre-inspection recovery, full pre-state restoration, verify-before-cleanup, receipt-null success, and cleanup retry covering FR-005, FR-006, FR-007, FR-008 and SC-002, SC-004 in `src/setup/engine.ts` | Verify: T008 passes across injected filesystem and receipt faults and a later cleanup-only run leaves exact OpenCode state unchanged

## Story US4 - Preview and verify destructive convergence

- [x] T011 [US4] Add failing plan, cleanup-only, restart-action, and harness-isolation tests covering FR-009, FR-011 and SC-005 in `tests/setup/engine.test.ts` | Verify: plan fixtures expose current force-conflict wording and missing journal, cleanup, and restart steps while performing zero writes
- [x] T012 [US4] Add failing human and JSON result agreement tests covering FR-009 and SC-005 in `tests/cli.test.ts` | Verify: changed, no-op, cleanup-warning, and cleanup-only results expose any status, receipt, warning, or manual-action mismatch
- [x] T013 [US4] Implement truthful plan steps, bounded diagnostics, cleanup-only semantics, and restart actions covering FR-009, FR-011 and SC-005 in `src/setup/engine.ts` | Verify: T011-T012 pass with unchanged result fields and exit codes and no restart action for no-op or cleanup-only runs
- [x] T014 [US4] Add failing packed-artifact convergence cases covering FR-010, FR-011 and SC-006 in `tests/packaging/packed-install.test.ts` | Verify: prior, newer, missing, malformed, and same-version-diverged global and project targets demonstrate any remaining source-checkout or manual-deletion dependency
- [x] T015 [US4] Complete isolated packed fixture wiring and convergence assertions covering FR-010, FR-011 and SC-006 in `tests/packaging/packed-install.test.ts` | Verify: every tarball-only fixture converges and at least 1 immediate repeated setup is a verified no-op

## Cross-story regression and closeout

- [x] T016 Add explicit Codex and Claude setup isolation regressions covering FR-001, FR-005, FR-007 and SC-002 in `tests/setup/engine.test.ts` | Verify: permissive ownership, dedicated keys, and cleanup remain unreachable from non-OpenCode setup
- [x] T017 Preserve historical explicit rollback and recovery regressions covering FR-005, FR-006, FR-007 and SC-002, SC-004 in `tests/setup/rollback.test.ts` | Verify: old valid OpenCode receipts remain bounded until successful convergence and Codex and Claude receipt behavior is unchanged
- [x] T018 Simplify OpenCode orchestration without changing FR-001 through FR-011 or SC-001 through SC-006 in `src/setup/engine.ts` | Verify: focused tests stay green and transaction ordering remains explicit
- [x] T019 Simplify link-safe transaction helpers without changing FR-003, FR-005 or SC-002 in `src/setup/filesystem.ts` | Verify: fault and link tests stay green with no duplicated containment or snapshot branch
- [x] T020 Simplify journal and cleanup helpers without changing FR-005 through FR-008 or SC-002, SC-004 in `src/setup/receipt.ts` | Verify: receipt isolation and cleanup fault tests stay green
- [x] T021 Simplify config convergence without changing FR-004 or SC-003 in `src/setup/harnesses/opencode.ts` | Verify: config preservation, recreation, and privacy tests stay green
- [x] T022 Run focused delivery and package checks covering FR-001 through FR-011 and SC-001 through SC-006 from `package.json` | Verify: focused setup, rollback, CLI, and packed-install Vitest files plus the integration package verifier all pass
- [x] T023 Run repository gates and record independent evidence covering FR-001 through FR-011 and SC-001 through SC-007 in `openspec/changes/opencode-managed-setup-convergence/verify-report.md` | Verify: build and full tests pass, Oracle returns PASS or actionable defects, and root records every FR and buildable SC result without self-approval

## Parallel execution

- None: every implementation slice shares setup transaction types, engine orchestration, or mutable fixtures, and one writer is required to prevent overlapping edits and stale transaction assumptions.

## Final verification

The final task is the mandatory independent Oracle verification boundary. Root may mark it complete only after Oracle reviews the final diff and executed evidence; implementation writers do not approve their own work.

## Convergence

### ORA-VERIFY-001 — partial

- [x] T024 [US2] Remediate ORA-VERIFY-001 by enforcing physical existing-ancestor containment before journal scan, reset, recovery, and cleanup for FR-006, FR-007, FR-011 and SC-002 in `src/setup/receipt.ts` | Verify: global and project junction-ancestor regressions preserve outside sentinels with zero recovery mutation, focused setup/rollback tests pass, and Oracle no longer reproduces outside-target deletion
