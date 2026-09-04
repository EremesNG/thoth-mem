# Tasks: Canonical product contract reset

## Authoring contract

Task identifiers are globally sequential. Behavior changes are test-first, and destructive canonical edits are guarded by an executable baseline test before replacement.

## MVP scope

US1 is the first independently testable increment: the active OpenSpec corpus contains exactly eight truthful current capabilities, no retired capability directories, and an updated repository context whose requirements map to the executable package or a declared benchmark gate.

## Dependencies

`T001 -> T002 -> T003`; `T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014`; `T014 -> T015 -> T016 -> T017 -> T018`. US2 depends on the approved canonical name map in US1; US3 depends on the renamed runtime remaining migration-safe.

## Story US1

- [x] T001 [US1] Add a failing exact-inventory and forbidden-surface contract test for FR-001/FR-002 and SC-001/SC-002 in `tests/packaging/canonical-product-contract.test.ts` | Verify: the test fails against the current 18-capability accumulated tree and reports retired capabilities without reading archived changes.
- [x] T002 [US1] Replace the active capability corpus with the eight-capability SQLite-first product contract and update stale OpenSpec context for FR-001/FR-002/FR-010 and SC-001/SC-002 in `openspec/specs` | Verify: exactly eight capability directories remain, every retained requirement maps to current runtime or an explicit eval gate, and no affirmative retired surface survives.
- [x] T003 [US1] Complete the canonical baseline assertions after the replacement for FR-001/FR-002/FR-010 and SC-001/SC-002 in `tests/packaging/canonical-product-contract.test.ts` | Verify: exact inventory, required current titles, forbidden legacy titles, and OpenSpec context all pass deterministically.

## Story US2

- [x] T004 [US2] Rename CLI/import/lifecycle expectations and assert rejection of transitional aliases for FR-004/FR-005/FR-006 and SC-003/SC-004 in `tests/cli/import-legacy.test.ts` | Verify: the focused test is red until `import-legacy`, `lifecycle`, `memory.sqlite`, and current report namespaces replace their transitional forms.
- [x] T005 [US2] Implement the generation-neutral CLI dispatch, help, importer report, lifecycle command, and current default database path for FR-004/FR-005/FR-006 and SC-003/SC-004 in `src/cli.ts` | Verify: current commands succeed, removed commands return the deterministic unknown-command code, and legacy import remains one-way and source-preserving.
- [x] T006 [US2] Rename MCP contract tests and assert the exact unversioned envelope namespace with no alias for FR-003/FR-008 and SC-003 in `tests/tools/mcp.test.ts` | Verify: all six handlers are red against the transitional namespace and the registry remains exactly six.
- [x] T007 [US2] Rename MCP result types, descriptions, schemas, and server instructions to the current contract for FR-003/FR-008 and SC-003 in `src/tools/index.ts` | Verify: the six handlers return only `thoth-mem.mcp.<tool>` or `thoth-mem.mcp.error`, and the old namespace is absent.
- [x] T008 [US2] Rename lifecycle/adapters tests and their import paths before production changes for FR-004 and SC-003 in `tests/integration/lifecycle.test.ts` | Verify: focused lifecycle tests fail until the module, command, and `thoth-mem.lifecycle` envelope agree.
- [x] T009 [US2] Rename the host-neutral lifecycle and adapter modules plus OpenCode Node-boundary consumption for FR-004 and SC-003 in `src/integration` | Verify: equivalent OpenCode, Codex, and Claude events reach the same service operations and Bun never imports SQLite.
- [x] T010 [US2] Update runner and packed-plugin tests for current receipt, lifecycle, envelope, and Skill terminology for FR-004/FR-007/FR-009 and SC-003/SC-005 in `tests/integration/public-plugin-runner.test.ts` | Verify: tests fail when any runner reads the old receipt, invokes the old command, validates the old envelope, or ships stale Skill wording.
- [x] T011 [US2] Synchronize native manifests, shared/public runners, managed receipts, inventory, and all distributed Skills for FR-004/FR-007/FR-009/FR-010 and SC-003/SC-005 in `integrations` | Verify: every host uses `.thoth-mem-managed.json`, `lifecycle`, the current envelope, and one byte-identical generation-neutral Skill.

## Story US3

- [x] T012 [US3] Update runtime/config/migration tests to preserve numeric revisions while adopting generation-neutral defaults for FR-006/FR-010 and SC-004/SC-005 in `tests/config/runtime.test.ts` | Verify: numeric schema and migration assertions remain intact, `memory.sqlite` is current, and no compatibility path opens the transitional filename.
- [x] T013 [US3] Normalize remaining source, test, schema, benchmark, documentation, and package-verifier terminology without changing technical revision values for FR-006/FR-007/FR-009/FR-010 and SC-004/SC-005 in `src/config/runtime.ts` | Verify: the scoped residue audit finds zero active V2 product labels and all numeric format/revision tests still pass.
- [x] T014 [US3] Update operator guidance and repository routing to describe the new base, removed aliases, and explicit backed-up database adoption for FR-001/FR-002/FR-005/FR-006/FR-010 and SC-001/SC-002/SC-005 in `README.md` | Verify: current commands and paths are copyable, retired surfaces are described only as absent, and real user state is not mutated.

## Parallel execution

- None: the canonical name map crosses imports, command dispatch, envelopes, runners, receipts, Skills, tests, and package verification; one ordered writer prevents split-brain intermediate contracts and overlapping distribution synchronization.

## Final verification

- [x] T015 Apply the mandatory behavior-preserving simplification pass to the completed reset for FR-001/FR-002/FR-003/FR-004/FR-005/FR-006/FR-007/FR-008/FR-009/FR-010 and SC-001/SC-002/SC-003/SC-004/SC-005 in `src` | Verify: duplicate generation constants, stale branches, and unnecessary rename scaffolding are removed without aliases or behavior drift.
- [x] T016 Run focused suites, build, full tests, integration verification/smoke, benchmark fixture, prepublish verification, residue audit, and whitespace review for all FRs and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `package.json` | Verify: every declared command passes, the registry is exactly six, packed hosts execute the current lifecycle, and diff hygiene reports no unrelated/generated/secret material.
- [x] T017 Obtain fresh independent Oracle verification and persist requirement-by-requirement evidence for all FRs and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `openspec/changes/canonical-v2-contract-reset/verify-report.md` | Verify: Oracle returns PASS with no unresolved blocker and distinguishes repository certification from the separate real-host data-adoption/reinstall step.
- [x] T018 Close the validated destructive reset and archive its durable delta for all FRs and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `openspec/changes/canonical-v2-contract-reset/archive-report.md` | Verify: the closeout gate is valid, the archive report is READY, and active specs remain the eight-capability current baseline.

## Convergence

- [x] T019 [US3] Resolve the partial Oracle finding SDD-SPEC-DELTA-RENAMED-SOURCE-MISSING for FR-003/FR-004 and SC-001/SC-002/SC-003/SC-004/SC-005 by classifying existing targets as modified rather than renamed from intentionally deleted source titles in `openspec/changes/canonical-v2-contract-reset/spec.md` | Verify: the Accelerated ready validator passes its durable-delta preflight, with rename history retained only as explanatory prose where useful.
