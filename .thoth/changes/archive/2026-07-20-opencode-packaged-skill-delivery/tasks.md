# Tasks: OpenCode packaged skill delivery

## MVP scope

US1 is the MVP: project and global `thoth-mem setup opencode` fixtures install the complete published `thoth-mem` skill under the receipt-owned plugin assets, demonstrated from both repository and packed-package sources.

## Dependencies

T001 and T002 precede T006; T003 precedes T007; T004 and T005 precede T006; T006 and T007 precede T008; T008 precedes T009; T009 precedes T010 and T011; T010 and T011 precede T012.

## Story US1

- [x] T001 [US1] Add failing OpenCode source-validation and project/global skill-install tests for FR-001, FR-002, SC-001, and SC-002 in `tests/setup/engine.test.ts` | Verify: focused tests fail because the published skill source is neither required nor copied into managed OpenCode assets
- [x] T002 [US1] Add a failing packed-distribution skill-layout test for FR-001 and SC-001 in `tests/packaging/packed-install.test.ts` | Verify: the focused test fails because packed OpenCode setup omits the complete thoth-mem skill bundle

## Story US2

- [x] T003 [US2] Add failing bundled-path configuration-hook tests for FR-003, FR-004, SC-003, and SC-004 in `tests/integration/opencode-runtime.test.ts` | Verify: focused tests fail because the production OpenCode plugin exposes no config hook or bundled skill path

## Story US3

- [x] T004 [US3] Add failing managed skill-drift coverage for FR-005 and SC-005 in `tests/setup/engine.test.ts` | Verify: the focused test fails because installed skill files are absent from the receipt-owned comparison
- [x] T005 [US3] Add failing bundled-skill rollback coverage for FR-006 and SC-005 in `tests/setup/rollback.test.ts` | Verify: the focused test fails because rollback fixtures do not prove skill cleanup remains inside the managed plugin assets

## Story US1 implementation

- [x] T006 [US1] Resolve the packaged skill source and add it to OpenCode inspection/application layouts for FR-001, FR-002, FR-005, FR-006, SC-001, SC-002, and SC-005 in `src/setup` | Verify: focused setup, drift, rollback, and packed-install tests pass while all changes stay under the managed plugin asset directory

## Story US2 implementation

- [x] T007 [US2] Register the native absolute bundled skill parent idempotently for FR-003, FR-004, SC-003, and SC-004 in `integrations/opencode/plugin.mjs` | Verify: focused runtime tests pass for absent, pre-populated, repeated, and space-containing installation paths

## Declaration verification

- [x] T008 [US1] Bind the exact OpenCode bundled-skills runtime declaration to the shared packaged skill authority for FR-001, FR-002, SC-001, and SC-002 in `scripts/verify-integration-package.mjs` | Verify: canonical inventory verification accepts the setup-materialized skills directory while missing or different declarations still fail closed

## Delivery verification

- [x] T009 Validate published delivery for FR-001 through FR-006 and SC-001 through SC-006 from `package.json` | Verify: integration verification, relevant Vitest suites, build, and the full test suite all exit successfully without running real-host setup or mutating integration assets

## Parallel execution

- None: setup fixtures and source layouts overlap across US1 and US3, while US2 consumes the installed layout produced by the same single-writer change; sequential red-green slices avoid inconsistent package fixtures.

## Final verification

- [x] T010 Simplify the setup diff while preserving FR-001, FR-002, FR-005, FR-006, SC-001, SC-002, and SC-005 in `src/setup` | Verify: focused tests remain green and inspection and application share one complete asset-layout contract
- [x] T011 Simplify runtime registration while preserving FR-003, FR-004, SC-003, and SC-004 in `integrations/opencode/plugin.mjs` | Verify: focused tests remain green and the hook contains no persistent config write, duplicated path, or unrelated lifecycle change
- [x] T012 Map independent evidence for FR-001 through FR-006 and SC-001 through SC-006 in `openspec/changes/opencode-packaged-skill-delivery` | Verify: Oracle records PASS, the closeout gate accepts complete evidence, and archive readiness is explicit
