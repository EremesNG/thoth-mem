# Tasks: One-Command Legacy Import

## Authoring contract

Task status is root-owned. Root retains the single mutable implementation lane because the CLI parser, orchestration, output, tests, and documentation describe one coupled public contract. Every behavior slice follows red before green through the confirmed `runCli(args)` seam.

## MVP scope

US1 is the MVP: one public CLI invocation imports a disposable legacy database into the configured current target, retains its internally generated artifacts, and returns a bounded successful outcome. Completion evidence is the first failing-then-passing one-command CLI test plus unchanged explicit plan/apply tests.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008`; no task is safely parallel because each later slice consumes the public contract and evidence established by the preceding core/CLI/test change.

## Story US1

- [x] T001 [US1] Add the failing one-invocation success, default/override resolution, bounded-output, privacy, and artifact-custody tests for FR-001/SC-001/SC-002 in `tests/cli/import-legacy.test.ts` | Verify: focused run failed only at the new public invocation with exit 2 while all 11 existing tests passed.
- [x] T002 [US1] Implement exact one-command parsing, conventional source/configured target resolution, importer-owned run artifacts, internal plan/apply orchestration, and bounded human/JSON success output for FR-001/SC-001/SC-002 in `src/cli.ts` | Verify: all 12 focused CLI tests pass, including the one-command import without caller-supplied target, plan, report, replay, or verification commands.

## Story US2

- [x] T003 [US2] Add locked/invalid failure, fresh-attempt retry, committed exact-plan replay, changed-request isolation, and alias/tampered-custody public-seam tests for FR-001/SC-003/SC-004 in `tests/cli/import-legacy.test.ts` | Verify: all 17 focused tests pass; locked inputs preserve the target, a later baseline retries successfully, exact replay is zero-delta, and changed/tampered/aliased custody fails closed.
- [x] T004 [US2] Expose the bounded read-only committed import ID/plan-hash lookup needed for exact replay selection with FR-001/SC-004 coverage in `src/memory-core/import/legacy-v1.ts` | Verify: passing CLI replay coverage distinguishes no committed source from one exact committed plan without duplicated receipt SQL or target mutation.
- [x] T005 [US2] Complete fail-closed reporting, request-keyed multi-attempt custody, exact committed-plan selection, resolved-containment checks, and stable retry behavior discovered by T003 for FR-001/SC-003/SC-004 in `src/cli.ts` | Verify: all 17 focused tests pass; only matching source fingerprint, paths, mapping input, policy, and committed hash replay, while changed, tampered, locked, or aliased state fails closed.

## Story US3

- [x] T006 [US3] Document the one-command normal path, stopped-host retry, bounded result, and advanced plan/apply audit path for FR-001/SC-005 in `README.md` | Verify: README commands match CLI help and all 11 pre-existing explicit plan/apply tests pass unchanged within the 17-test focused suite.

## Parallel execution

- None: `tests/cli/import-legacy.test.ts`, `src/cli.ts`, and `README.md` form one sequential public-contract lane, and each implementation step consumes the immediately preceding red test evidence.

## Final verification

- [x] T007 Run the focused CLI importer suite and TypeScript build for FR-001/SC-001/SC-002/SC-003/SC-004/SC-005 in `tests/cli/import-legacy.test.ts` | Verify: all 17 focused tests and `pnpm run build` pass after the behavior-preserving simplify review.
- [x] T008 Run the repository-required full, integration, packed-smoke, fixture, prepublish, diff, and independent Oracle verification for FR-001/SC-001/SC-002/SC-003/SC-004/SC-005 in `openspec/changes/one-command-legacy-import/verify-report.md` | Verify: focused CLI/core 55/55, full suite 413/413, build, integration verification, three-host packed smoke, fixture benchmark, prepublish, ready validator, and diff checks passed; fresh Oracle round 5 returned PASS with SC-006 retained as outcome RISK.

## Convergence after Oracle verification round 1

- [x] T009 contradicts — Resolve finding V1-F001 by canonicalizing parsed mapping entries before request-key derivation for FR-001/SC-004 so semantically equivalent reordered manifests select committed custody in `src/cli.ts` | Verify: the new reordered-mapping replay test failed with exit 1 before implementation and passes with an exact-plan duplicate replay afterward.
- [x] T010 partial — Resolve finding V1-F002 by adding an explicit close-all-hosts-and-rerun action for locked/busy one-command failures under FR-001/SC-003 in `src/cli.ts` | Verify: the strengthened locked-target assertion failed against the generic error before implementation and passes afterward.
- [x] T011 partial — Resolve findings V1-W001/V1-W002 by strengthening SC-002/SC-004 coverage with exact aggregate counts and a retained stale-plan attempt followed by a changed target baseline and successful fresh attempt in `tests/cli/import-legacy.test.ts` | Verify: the focused suite now passes 19/19 and observes two baseline-bound plan attempts without manual cleanup.

## Convergence after Oracle verification round 2

- [x] T012 partial — Resolve finding V2-F001 by completing the SC-002 human-readable result with every aggregate disposition, plan/report paths, and explicit nullable backup/recovery values plus public-seam coverage in `tests/cli/import-legacy.test.ts` | Verify: the new non-JSON contract test failed before the output repair and all 20 focused tests pass afterward.

## Convergence after Oracle verification round 3

- [x] T013 contradicts — Resolve finding V3-F001 by binding each retained plan hash immutably to the canonical request identity, including null/empty/populated mapping distinction, and rejecting copied changed-request custody in `src/cli.ts` | Verify: a public-seam substitution test copies the committed plan and its old binding into changed-mapping custody, failed with a false duplicate before implementation, and all 20 focused tests pass with nonzero rejection and unchanged target afterward.

## Convergence after Oracle verification round 4

- [x] T014 contradicts — Resolve finding V4-F001 by placing the complete canonical mapping request, including null versus empty mode, inside the sealed plan and receipt-bound hash in `src/memory-core/import/contracts.ts` | Verify: the adversarial public-seam test failed with a false duplicate before implementation; afterward the altered copied binding receives nonzero rejection with unchanged target state and 55 focused importer/contract tests pass.
