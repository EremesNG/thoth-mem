# Tasks: Portable PR Verification

## Authoring contract

Root owns task state, SDD artifacts, and the coupled verification implementation. The work remains one ordered chain because the shared npm helper is consumed by both packaging seams and the final focused reproduction must reconcile all five original CI suites before broad verification.

## MVP scope

US1 is the MVP: package dry-run inspection and the full packed smoke complete with the active npm installation without assuming one operating-system layout or one npm JSON envelope. Completion evidence is parser/discovery coverage plus green packaging and public marketplace smoke suites.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011`; T004 through T007 are behaviorally independent fixture corrections but remain serialized under one root writer to preserve diagnostic continuity and avoid interleaving focused test state.

## Story US1

- [x] T001 [US1] Add failing coverage for array and keyed-object pack envelopes plus missing, empty, and ambiguous output under FR-001/SC-001 in `tests/packaging/first-product.test.ts` | Verify: the new cases fail because the shared npm pack parser does not yet exist while the expected accepted and rejected shapes are explicit.
- [x] T002 [US1] Implement bounded npm CLI discovery and exact single-record pack-envelope parsing for FR-001/SC-001 in `scripts/npm-pack.mjs` | Verify: T001 accepts the supported npm response shapes, locates the active CLI, and rejects unavailable, malformed, empty, or multiple package records with actionable errors.
- [x] T003 [US1] Route packed tarball creation and installation through the shared portable helper for FR-001/FR-004/SC-001 in `scripts/verify-packed-plugins.mjs` | Verify: the existing smoke identifies one tarball and completes package installation, CLI cold start, six-tool MCP, and all three lifecycle fixtures from disposable state.

## Story US2

- [x] T004 [US2] Replace Windows-only lifecycle fixture paths with per-test platform-native nonexistent absolute paths for FR-002/FR-004/SC-002 in `tests/integration/public-plugin-runner.test.ts` | Verify: every exact identity, bounded fallback, Claude compact, and provider-config assertion passes with the computed normalized path key.
- [x] T005 [US2] Isolate ambient configuration variables in native-manager cases that assert files beneath a disposable home for FR-002/FR-004/SC-002 in `tests/setup/native-managers.test.ts` | Verify: local runtime config and pre-identity journal assertions resolve inside their temporary homes even when the parent process exports XDG configuration.

## Story US3

- [x] T006 [US3] Convert release publication coverage to require a repository-owned synthetic central fixture for FR-003/FR-004/SC-003 in `tests/release-marketplace.test.ts` | Verify: the test no longer references a sibling checkout and fails only because the synthetic fixture helper is not yet implemented.
- [x] T007 [US3] Implement the minimal valid central catalog fixture with two plugin entries, three owned descriptors, updater, validator, and node test for FR-003/FR-004/SC-003 in `tests/fixtures/central-marketplace.ts` | Verify: publication changes exactly the three owned files, preserves thoth-agents, retries without a commit, rejects a missing tag, and rejects a normal push race.

## Regression and cleanup

- [x] T008 Simplify the new npm and marketplace fixture helpers without changing FR-001/FR-002/FR-003/FR-004 behavior in `scripts/npm-pack.mjs` | Verify: helpers retain one clear validation path, no duplicated envelope logic or external fixture dependency, and all focused cases remain green.
- [x] T009 Run the original focused five-suite reproduction for FR-001/FR-002/FR-003/FR-004 and SC-001/SC-002/SC-003 in `tests/release-marketplace.test.ts` | Verify: all marketplace publication, packed smoke, public runner, package boundary, and native-manager tests pass together with no real home or sibling repository dependency.

## Parallel execution

- None: one root writer owns the shared `scripts/npm-pack.mjs` contract and its two consumers, while the remaining fixture corrections feed the same focused reproduction; ordered execution avoids mixed red/green evidence and has lower coordination cost than disjoint delegation.

## Final verification

- [x] T010 Run build, full tests, integration verification, packed smoke, fixture benchmark, prepublish, and diff hygiene for SC-004 in `package.json` | Verify: every repository-required command passes, or an exact pre-existing unrelated failure is reported without changing product behavior, dependencies, generated output, or user state.
- [x] T011 Record complete FR/buildable-SC evidence plus a fresh independent Oracle verdict for SC-001/SC-002/SC-003/SC-004 in `openspec/changes/fix-pr-21-linux-ci-portability/verify-report.md` | Verify: Oracle returns PASS or identifies bounded actionable blockers, Ubuntu CI rerun remains explicitly unobserved unless the branch is separately pushed, and closeout evidence is truthful.
