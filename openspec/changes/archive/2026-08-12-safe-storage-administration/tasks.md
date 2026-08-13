# Tasks: Safe Storage Administration

## MVP scope

US1 and US2 together form the first independently testable delivery: repair and retention apply work without manual bindings while the existing supplied-binding and fail-closed Store contracts remain effective. Completion evidence is the focused CLI suite with internal-preview spies, stale/failure controls, fixed-time continuation, and unchanged HTTP contract tests.

## Dependencies

T001 -> T002 -> T003 -> T004; T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012; T013 -> T014 -> T015; T016 and T017 follow command registration; T018-T022 follow green implementation; T023-T024 are final gates.

## Story US1 — Apply repair without copying a fingerprint

- [x] T001 [US1] Add red-first CLI tests for internal repair preview binding, explicit supplied binding, concurrent drift, preview immutability, and failure propagation covering FR-001/SC-001 in `tests/cli.test.ts` | Verify: focused tests fail for missing internal binding and prove no silent retry path.
- [x] T002 [US1] Implement optional repair fingerprint parsing and one-shot internal preview-to-apply binding while preserving supplied bindings covering FR-001/SC-001 in `src/cli.ts` | Verify: focused repair tests pass and Store apply receives exactly the internally previewed or explicitly supplied fingerprint.

## Story US2 — Prune one or all internally bound batches

- [x] T003 [US2] Add red-first CLI tests for no-binding apply, supplied-pair preservation, partial-pair rejection, fixed effective time, stale failure, no progress, and bounded growth covering FR-002/SC-002 in `tests/cli.test.ts` | Verify: focused tests fail on the current mandatory grammar and exercise every stop condition without false rollback claims.
- [x] T004 [US2] Implement optional complete retention binding, internal first preview, and fixed-time continuation without changing Store/HTTP contracts covering FR-002/SC-002 in `src/cli.ts` | Verify: one-batch and until-complete tests pass with zero manual bindings and explicit bindings remain effective.

## Story US3 — Preview and apply guarded database compaction

- [x] T005 [US3] Add red-first tests for pure absolute data/database path resolution and unchanged existing precedence covering FR-003/FR-006/SC-003 in `tests/config.test.ts` | Verify: tests prove resolution creates no directory or config file and ordinary configuration retains its prior precedence.
- [x] T006 [US3] Extract the pure storage-path resolver and make ordinary configuration reuse it covering FR-003/FR-006/SC-003 in `src/config.ts` | Verify: focused config tests pass with no behavior regression or filesystem writes from pure resolution.
- [x] T007 [US3] Add red-first disposable tests for exact physical/logical preview metrics, fresh-process URI initialization and exact immutable target proof, incompatible preinitialized-driver failure, readable paired-sidecar access, partial/non-file/unreadable sidecar rejection, missing target, zero durable mutation, zero freelist, and free-space status covering FR-003/FR-005/FR-006/SC-003 in `tests/store/compaction.test.ts` | Verify: spawned children and snapshots prove immutable bytes and paired database/WAL bytes remain unchanged, SHM identity/size remains stable despite allowed volatile read-marks, no sidecar is created, and no path reaches live data.
- [x] T008 [US3] Add bounded public preview, metrics, checkpoint, validation, and apply result shapes covering FR-003/FR-005/SC-003/SC-004 in `src/store/types.ts` | Verify: TypeScript accepts exact JSON-safe result contracts without weakening existing repair/retention types.
- [x] T009 [US3] Implement the compact-process URI initializer that forces driver URI handling before the first native constructor and exposes a bounded initialization invariant covering FR-003/SC-003 in `src/store/sqlite-uri-runtime.ts` | Verify: a fresh child starting with URI handling disabled imports the initializer first and subsequently honors an immutable file URI.
- [x] T010 [US3] Implement verified immutable target opening, sidecar classification, paired-sidecar read-only preview, incompatible-runtime failure, post-close durable zero-write audit, and physical/logical filesystem metrics covering FR-003/FR-005/FR-006/SC-003 in `src/store/compaction.ts` | Verify: immutable preview is byte-for-byte stable; paired preview preserves database/WAL bytes and SHM identity/size with only volatile read-mark changes allowed; no checkpoint, directory, config, database, or sidecar is created or repaired.
- [x] T011 [US3] Add red-first disposable apply and failure-injection tests for shrinkage, no-op, large uncheckpointed WAL, both capacity gates, checkpoint busy, integrity, foreign keys, VACUUM, reopen, schema/count identity, WAL, and concurrent access covering FR-003/FR-005/FR-006/SC-004/SC-005 in `tests/store/compaction.test.ts` | Verify: pre-commit failures preserve prior logical state while post-commit verification injection asserts non-zero/no-success and untouched SQLite-owned files without a rollback claim.
- [x] T012 [US3] Implement physical/logical capacity preflight, refreshed post-checkpoint capacity validation, SQLite checkpoint and transactional VACUUM, fresh reopen, full validation, and bounded contextual errors covering FR-003/FR-005/FR-006/SC-004/SC-005 in `src/store/compaction.ts` | Verify: focused tests pass for WAL growth, shrinkage, preserved schema/counts, WAL mode, integrity, foreign keys, and no raw file replacement operations.
- [x] T013 [US3] Add red-first CLI tests for help, grammar, missing target, read-only preview, explicit apply/no-op, bounded Markdown/JSON, custom data directory, independent dispatch, and contextual failures covering FR-004/FR-006/SC-003/SC-004/SC-005 in `tests/cli.test.ts` | Verify: focused tests fail before command registration and assert compact never invokes prune/repair and causes no project/MCP/HTTP expansion.
- [x] T014 [US3] Implement compact command parsing, handler, formatting, and error propagation through the existing CLI boundary covering FR-004/FR-006/SC-003/SC-004/SC-005 in `src/cli.ts` | Verify: compact CLI tests pass and preview performs no writes while apply reports only post-validated success.
- [x] T015 [US3] Register compact command detection and actual runCli dispatch without changing MCP startup behavior covering FR-004/SC-006 in `src/index.ts` | Verify: shouldRunCli and runCli entrypoint tests execute the compact handler while ordinary MCP startup remains unchanged.
- [x] T016 [US3] Extend the registry regression to lock the public MCP surface at six tools after command addition covering FR-004/SC-006 in `tests/tools/registry.test.ts` | Verify: registry suite passes with exactly the existing six tool names and no compaction tool.
- [x] T017 [US3] Add HTTP regression evidence that repair/retention apply still require explicit bindings and no compaction route exists covering FR-001/FR-002/FR-004/SC-006 in `tests/http-server.test.ts` | Verify: HTTP suite passes with unchanged validation, conflict, route catalog, and OpenAPI behavior.

## Documentation and contract convergence

- [x] T018 Update operator documentation for simplified apply, optional compatibility bindings, compaction preview/apply, capacity/blocking expectations, and separate live authorization covering FR-001-FR-006/SC-006 in `README.md` | Verify: every documented command matches parser grammar and does not imply automatic compaction or rollback.
- [x] T019 After final Oracle PASS, converge canonical CLI requirements and scenarios for internal bindings and compact administration covering FR-001/FR-002/FR-004/SC-001/SC-002/SC-006 in `openspec/specs/cli/spec.md` | Verify: archive-time CLI deltas exactly preserve effective legacy inputs and six-tool separation.
- [x] T020 After final Oracle PASS, converge canonical Store requirements for compaction preconditions, SQLite ownership, metrics, validation, and live-data prohibition covering FR-003/FR-005/FR-006/SC-003/SC-004/SC-005 in `openspec/specs/store/spec.md` | Verify: archive-time Store text contains no raw replacement or sidecar manipulation protocol.
- [x] T021 Apply the mandatory simplify pass to the CLI changes without altering behavior covering FR-001/FR-002/FR-004/SC-001/SC-002 in `src/cli.ts` | Verify: focused CLI tests remain green and parsing/handler duplication is reduced only where contract-preserving.
- [x] T022 Apply the mandatory simplify pass to compaction implementation without altering safety boundaries covering FR-003/FR-005/SC-003/SC-004/SC-005 in `src/store/compaction.ts` | Verify: focused compaction tests remain green and all phase-specific errors and cleanup paths stay explicit.

## Parallel execution

- None: CLI stories share `tests/cli.test.ts` and `src/cli.ts`; compaction tasks depend on the pure resolver, shared types, one test fixture, and one implementation module, so parallel writers would overlap mutable surfaces or undermine red-first ordering.

## Final verification

- [x] T023 Run focused config, CLI, compaction, HTTP, index, registry, repair, and retention regressions and record evidence covering FR-001-FR-006/SC-001-SC-006 in `openspec/changes/safe-storage-administration/tasks.md` | Verify: every focused suite passes on disposable paths and the task evidence contains no live data command.
- [x] T024 Run typecheck/build, full Vitest, diff hygiene, and live-path audit before independent Oracle verification covering FR-001-FR-006/SC-006 in `openspec/changes/safe-storage-administration/tasks.md` | Verify: build and full tests pass, diff check is clean, six tools remain registered, and no generated or live-data mutation appears in the diff or command history.

## Implementation evidence

- T001-T004: RED showed manual bindings were mandatory and explicit empty values were ignored; GREEN proves one-shot internal binding, effective supplied values, presence-aware empty/partial rejection, fixed-time continuation, and no stale retry.
- T005-T012: RED showed no pure resolver or compaction module and exposed false-success no-op checks; GREEN proves pure path resolution, verified immutable URI startup, paired-sidecar durable zero-write audit, both capacity gates, checkpoint/VACUUM failure handling, real no-op validation, and post-reopen verification on disposable databases.
- T013-T018: RED showed compact help/dispatch absent; GREEN proves bounded preview/apply output, separate CLI dispatch, no HTTP/MCP expansion, six tools, and operator documentation. A dedicated public-seam characterization exercises compact preview/apply on a disposable database and proves all four repair/retention Store methods remain uncalled; CLI plus compaction passed 2 files/65 tests.
- T021-T023: behavior-preserving simplify completed; focused surface passed 6 files/166 tests, repair/retention Store regressions passed 3 files/29 tests, and the final CLI/compaction convergence passed 2 files/64 tests. Typecheck, build, diff hygiene, bundle ordering, generated-output status, and live-path audit passed. Full Vitest was attempted twice but timed out without a final result, so T024 remains in progress for independent verification.

## Convergence after Oracle verification failure

- [x] T025 Remediate FINDING-001 (partial) by adding a red nearest-suite public-export regression proving the compaction runtime seam cannot replace SQLite VACUUM, then make VACUUM unconditional and require a freshly reopened freelist_count of zero before success covering FR-003/FR-005/SC-005 in `src/store/compaction.ts` | Verify: the Oracle reproduction with a no-op injected vacuum cannot return success, while normal disposable compaction still shrinks and validates the database.
- [x] T026 Remediate FINDING-002 (partial) by adding a red nearest-suite decision-boundary regression for a stale zero-freelist preview, then re-read metrics on the validation connection and prove zero freelist before returning a no-op success covering FR-003/FR-005/SC-005 in `src/store/compaction.ts` | Verify: a concurrent freelist change cannot return a stale no-op success and either follows the normal guarded apply path or fails closed.
- [x] T027 Remediate FINDING-003 (missing) by adding CLI retention continuation regressions for persistence/apply failure, bounded-growth violation, no-progress termination, and fixed-effective-time propagation covering FR-002/SC-002 in `tests/cli.test.ts` | Verify: each failure terminates non-zero without retrying stale state or claiming completion, and every batch reuses the first effective instant with a fresh fingerprint.
- [x] T028 Remediate WARNING-001 (partial) by reconciling verification provenance without asserting a renewed plan approval: label the recorded review as historical after its hashes became stale, and append corrected convergence evidence for the previously overstated T003/T011/T023 claims in `openspec/changes/safe-storage-administration/plan-review.md` | Verify: no stale hash set is presented as a current approval and final Oracle verification remains the only closeout authority.

### Convergence evidence

- T025: RED reproduced false success when the runtime callback replaced VACUUM and left 1304 freelist pages; GREEN makes SQLite `VACUUM` unconditional, treats the callback only as a hook, and requires zero freelist after fresh reopen.
- T026: RED reproduced a stale zero-freelist no-op success; GREEN reclassifies and reopens at the decision boundary, completes integrity/identity validation, and makes the refreshed zero-freelist observation the final prerequisite for no-op success.
- T027: four public CLI characterization tests prove apply failure, bounded-growth violation, and no-progress terminate without completion or stale retry, while continuation fixes the first effective instant and refreshes the fingerprint each batch. No CLI implementation change was required.
- T028: the plan review now labels its approval and hashes as historical rather than current. Convergence passed compaction 15/15, CLI 56/56, combined 71/71, typecheck, build, diff check, and clean generated-output status; mandatory fresh Oracle verification remains pending in T024.
- T024 final verification: a fresh independent Oracle returned PASS after running the focused six-file matrix (176), Store repair/retention regressions (29), full Vitest (97 files, 1,332 passed, 1 skipped), typecheck, build, diff, ready gate, packaged disposable compact preview/apply, the former false-success probes, and a real SQLite write-lock failure probe. SC-007 remains an explicit production-outcome risk because live execution was not authorized.
- T019-T020 archive preparation: the declared CLI and Store deltas passed preflight against the canonical targets, preserve the six-tool and explicit Store/HTTP boundaries, and are queued for the thoth-archive transaction; the archive report intentionally records canonical sync as pending until that transaction succeeds.
