# Tasks: Canonical taxonomy recovery

## Authoring contract

Task identifiers are globally sequential. Every implementation task is test-first, and every verification names an observable contract rather than an internal activity.

## MVP scope

US1 is the first independently testable increment: all public and direct save paths share one canonical runtime taxonomy, accept every declared V2 value, and reject representative invalid values before any project, session, evidence, memory, receipt, supersession, or FTS mutation.

## Dependencies

T001 -> T003 -> T004; T002 -> T003 -> T005 -> T006; T006 -> T007 -> T008 -> T009; T009 -> T010 -> T011; T011 -> T012 -> T013 -> T014 -> T015. US3 depends on US2 because canonical recovery fixtures must open at the current internal SQLite revision.

## Story US1

- [x] T001 [US1] Add failing MCP and direct-handler contract tests covering every canonical nested taxonomy value, representative invalid values, bounded field errors, and the exact six-tool registry for FR-001/FR-006 and SC-001/SC-002/SC-006 in `tests/tools/mcp-v2.test.ts` | Verify: tests fail on current arbitrary-string casts and pass only when invalid requests have zero durable side effects.
- [x] T002 [US1] Add failing shared-service and fresh-ledger tests for canonical acceptance, non-canonical rejection before transactions, and direct-SQL evidence/memory kind enforcement for FR-002 and SC-001/SC-002 in `tests/memory-core/taxonomy.test.ts` | Verify: invalid service and SQL writes leave authoritative tables, receipts, and FTS unchanged.
- [x] T003 [US1] Export readonly canonical taxonomy tuples, derive their TypeScript unions, distinguish public protocol V2 naming, and provide dependency-free runtime membership/assertion seams for FR-001/FR-002/FR-006 and SC-001 in `src/memory-core/contracts.ts` | Verify: TypeScript, Zod consumers, SQLite SQL generation, and the Bun-safe parser can import one tuple set without duplicating value lists.
- [x] T004 [US1] Replace open nested records and taxonomy casts with closed tuple-driven Zod shapes used by both MCP registration and direct handlers for FR-001/FR-006 and SC-001/SC-002/SC-006 in `src/tools/index.ts` | Verify: every canonical save/session request succeeds, invalid nested classifications return the bounded V2 error envelope, and getToolCount remains six.
- [x] T005 [US1] Validate save, retract, and lifecycle classifications before opening durable transactions for FR-002/FR-006 and SC-001/SC-002 in `src/memory-core/service.ts` | Verify: direct callers cannot bypass the public schema and a rejected request creates or updates no project, session, ledger, link, receipt, or FTS row.
- [x] T006 [US1] Generate canonical evidence/memory insert guards and immutable triggers from the shared runtime tuples for fresh databases for FR-002/FR-007 and SC-001/SC-002 in `src/memory-core/sqlite/schema.ts` | Verify: fresh SQLite ledgers accept all canonical kinds, reject non-canonical direct inserts, and retain existing immutability and FTS behavior.

## Story US2

- [x] T007 [US2] Add a revision-2 fixture and failing migration tests for declared mappings, identity/lineage/receipt/FTS preservation, unknown-value rollback, forced transactional rollback, current-revision no-op startup, and foreign-key integrity for FR-002/FR-003/FR-007 and SC-003/SC-004 in `tests/memory-core/taxonomy-migration.test.ts` | Verify: the current migrator fails the fixture while every post-migration invariant and rollback snapshot is explicit.
- [x] T008 [US2] Introduce internal SQLite revision 3 and implement the ordered atomic revision-2 convergence using only learning-to-convention and certification-or-verification-to-explicit-save mappings for FR-003/FR-007 and SC-003/SC-004 in `src/memory-core/sqlite/migrations.ts` | Verify: known values converge once, unknown values and forced failures roll back completely, unsupported revisions fail clearly, and reopening revision 3 performs zero writes.
- [x] T009 [US2] Run the US1 and US2 focused suites together and reconcile only contract-consistent defects for FR-001/FR-002/FR-003/FR-007 and SC-001/SC-002/SC-003/SC-004 in `tests/memory-core/taxonomy-migration.test.ts` | Verify: the canonical source, service boundary, fresh ledger, upgraded ledger, FTS, receipts, and foreign keys pass as one coherent chain.

## Story US3

- [x] T010 [US3] Add failing OpenCode lifecycle tests for canonical SC008 delivery, absent memory on invalid taxonomy, exact reason-specific diagnostics, malformed JSON/identity separation, and non-blocking degradation for FR-004/FR-005/FR-006 and SC-001/SC-005 in `tests/integration/opencode-native-plugin.test.ts` | Verify: current duplicated parsing rejects the known row only generically and cannot satisfy the new diagnostic contract.
- [x] T011 [US3] Rework child-envelope parsing to consume canonical runtime tuples and return bounded discriminated failures while preserving the literal-Node boundary for FR-004/FR-005/FR-006 and SC-001/SC-005 in `src/integration/opencode/node-lifecycle-client.ts` | Verify: canonical recovery reaches the tagged system tail, invalid recovery taxonomy emits node_lifecycle_invalid_recovery_taxonomy exactly once, and no failed envelope injects memory or rejects the prompt.

Outcome SCs remain verification targets and do not create implementation work beyond the real-host certification below.

## Parallel execution

- None: the single root writer must evolve one shared taxonomy in dependency order across tests, contracts, persistence, migration, and the OpenCode parser; parallel edits would overlap the same runtime contract and obscure migration causality.

## Final verification

- [x] T012 Exercise the packed artifact and Bun-to-literal-Node boundary after a clean build for FR-004/FR-005/FR-006 and SC-005/SC-006 in `scripts/verify-integration-package.mjs` | Verify: the packed OpenCode bundle contains no native SQLite load in Bun, executes canonical recovery through Node, retains exactly six MCP tools, and passes integration verification and smoke.
- [x] T013 Apply the mandatory behavior-preserving simplification review to the completed implementation for FR-001/FR-002/FR-003/FR-004/FR-005/FR-006/FR-007 and SC-001/SC-002/SC-003/SC-004/SC-005 in `src/memory-core/contracts.ts` | Verify: duplicated taxonomy logic and unnecessary branches are removed without changing focused test outcomes or expanding scope.
- [x] T014 Run build, full tests, integration verification, integration smoke, prepublish verification, and whitespace review for FR-001/FR-002/FR-003/FR-004/FR-005/FR-006/FR-007 and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `package.json` | Verify: every declared repository command and git diff --check succeeds with no unrelated, generated, dependency, or secret material added.
- [x] T015 Obtain fresh independent Oracle verification and persist requirement-by-requirement evidence for FR-001/FR-002/FR-003/FR-004/FR-005/FR-006/FR-007 and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `openspec/changes/canonical-taxonomy-recovery/verify-report.md` | Verify: Oracle returns PASS with no unresolved blocker and the report distinguishes buildable evidence from the pending real-host outcome.
- [x] T016 Perform the user-operated fresh OpenCode no-tools SC008 smoke and capture outcome evidence for FR-004/FR-005 and SC-007 in `openspec/changes/canonical-taxonomy-recovery/verify-report.md` | Verify: an absent-from-prompt marker is returned automatically with enroll, capture_root, and recover receipts, zero thoth-mem tool calls, and zero node_lifecycle_invalid_envelope diagnostics.

## Convergence

**C001 — `partial` — FR-005 / SC-005 / SC-007**: Two real OpenCode no-tools attempts returned `NO_RECUPERADO` even though the strict Node envelope was accepted and lifecycle recovery returned the current SC008-A memory. A read-only replay proved the complete recovered context placed the marker at code-point 1,257, while `renderRecovery` globally sliced the concatenated block to 1,000 code points and ended inside the second item. The original single-item integration coverage therefore did not buildably prove the accepted multi-item bounded-delivery contract.

- [x] T017 [US3] Add one failing public-hook regression and implement item-aware bounded recovery rendering for C001, FR-005, SC-005, and SC-007 in `src/integration/opencode/plugin.ts` | Verify: a later SC008 marker remains in one source-attributed tagged block after at least two longer items, complete rendered lines stay within 1,000 code points, and existing identity/fail-closed behavior is unchanged.
- [x] T018 Apply the mandatory simplify review and rerun focused, build, full, packed-integration, prepublish, and diff checks after T017 for C001 and SC-005/SC-006 through `package.json` | Verify: behavior remains bounded and deterministic, all declared repository checks pass, and unrelated worktree changes remain untouched.
- [x] T019 Obtain a fresh independent Oracle verification after convergence and persist its requirement-by-requirement verdict before retrying T016 in `openspec/changes/canonical-taxonomy-recovery/verify-report.md` | Verify: Oracle returns PASS with no unresolved blocker for FR-001 through FR-007 and buildable SC-001 through SC-006.
