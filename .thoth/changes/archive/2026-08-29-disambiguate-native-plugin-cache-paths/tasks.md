# Tasks: Disambiguate native plugin cache paths

## Authoring contract

Task IDs are sequential across this file. Each executable task owns one literal repository path, carries explicit requirement/success-criterion coverage, and ends with observable verification evidence.

## MVP scope

US1 is the first independently testable slice: deterministic managed-setup tests demonstrate exact Codex and Claude marketplace/plugin identities while preserving unrelated state and touching no real host home. US2 then completes packaged topology and inventory coverage.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011`; test-first failures establish each public seam before its corresponding implementation, descriptor digests follow descriptor writes, and final Oracle verification depends on all writer checks.

## Story US1

- [x] T001 [US1] Add a failing native-manager regression for both host-specific marketplace/plugin identities, plan/repair/rollback behavior, preservation of legacy thoth-mem@thoth-mem state, and zero mutation on conflicting provenance with FR-001/SC-001 coverage in `tests/setup/native-managers.test.ts` | Verify: the focused integration-config suite fails because both hosts still emit or accept thoth-mem@thoth-mem.
- [x] T002 [US1] Implement one host-specific native-manager identity and apply it across every observable manager operation with FR-001/SC-001 coverage in `src/setup/native-manager.ts` | Verify: the native-manager focused suite passes for Codex thoth-mem-codex and Claude thoth-mem-claude identities.
- [x] T003 [US2] Add a failing packed-distribution regression for both distinct marketplace/plugin path pairs and Skill resolution with FR-002/SC-002 coverage in `tests/packaging/public-plugin-distribution.test.ts` | Verify: the focused integration-config packaging suite fails while both marketplace descriptors still repeat thoth-mem.
- [x] T004 [US2] Rename only the Codex repository marketplace identifier while preserving plugin and Skill names with FR-002/SC-002 coverage in `.agents/plugins/marketplace.json` | Verify: the packaging regression observes thoth-mem-codex/thoth-mem for Codex.
- [x] T005 [US2] Rename only the Claude Code repository marketplace identifier while preserving plugin and Skill names with FR-002/SC-002 coverage in `.claude-plugin/marketplace.json` | Verify: the packaging regression observes thoth-mem-claude/thoth-mem for Claude and resolves both Skill roots.
- [x] T006 [US2] Enforce both distinct native identities in packed-plugin verification with FR-002/SC-002 coverage in `scripts/verify-packed-plugins.mjs` | Verify: packed verification rejects either repeated marketplace/plugin pair and accepts both canonical descriptors.
- [x] T007 [US2] Document both host-specific qualified installation identifiers with FR-001/FR-002 coverage in `README.md` | Verify: documented Codex and Claude commands name their exact marketplace-qualified plugin identities.
- [x] T008 [US2] Refresh only the two marketplace descriptor digests while preserving unrelated lock entries with FR-002/SC-002 coverage in `plugin/distribution-lock.json` | Verify: distribution verification reports no stale asset digest and the diff changes no unrelated digest.
- [x] T009 [US1] Apply a behavior-preserving simplification review to the native-manager change with FR-001/SC-001 coverage in `src/setup/native-manager.ts` | Verify: identity selection remains explicit, non-duplicated, host-isolated, and all focused tests still pass.

## Parallel execution

- None: all writer tasks share the ordered identity contract or its generated digests, and the dirty worktree makes one-writer sequencing safer than overlapping edits.

## Final verification

- [x] T010 Run the focused setup/packaging suites, build, full tests, integration verification/smoke, fixture benchmark, prepublish, and diff checks with FR-001/FR-002/SC-001/SC-002 coverage in `package.json` | Verify: every authorized deterministic check passes or its exact environment-bound limitation is recorded.
- [x] T011 Delegate read-only final review to a fresh Oracle and persist complete FR/buildable-SC evidence plus the explicit SC-003 operational risks with FR-001/FR-002/SC-001/SC-002 coverage in `openspec/changes/disambiguate-native-plugin-cache-paths/verify-report.md` | Verify: the Oracle returns PASS and every outcome criterion is PASS or explicit RISK.
