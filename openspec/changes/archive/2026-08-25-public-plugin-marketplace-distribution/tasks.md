# Tasks: Public plugin marketplace distribution

## Authoring contract

Task identifiers are unique and sequential. Every task names one primary repository-relative ownership path, concrete FR/SC coverage, and an observable verification result. Behavior tests precede implementation.

## MVP scope

US1 is the MVP: a repository-discoverable Codex plugin whose public runner starts the pinned v2 package without a managed receipt, whose MCP handshake exposes exactly six tools, and whose isolated marketplace/install fixture passes without touching the personal Codex home.

## Dependencies

`T001 -> T002 -> T003`; `T004 -> T005`; `T006 -> T007`; `T008 -> T009`; `T010 -> T011`; `T002 + T003 + T005 + T007 + T009 + T011 -> T012 -> T013 -> T014`.

## Story US1

- [x] T001 [US1] Add failing catalog, containment, manifest-shape, exact-component, and six-tool registration tests for FR-001/FR-003/FR-005 and SC-001 in `tests/packaging/public-plugin-distribution.test.ts` | Verify: focused test fails because the public Codex marketplace/plugin distribution is absent
- [x] T002 [US1] Restore the repository Codex marketplace and current public Codex manifest, hooks, MCP descriptor, runtime metadata, and v2 Skill assets for FR-001/FR-003/FR-005 and SC-001 in `.agents/plugins/marketplace.json` | Verify: the focused Codex catalog resolves exactly one contained shared plugin root with one hook source, one MCP registration, and one v2 Skill

## Story US2

- [x] T003 [US2] Restore the repository Claude marketplace and current strict-valid Claude manifest, hooks, MCP descriptor, and shared v2 Skill mapping for FR-001/FR-003/FR-005 and SC-001 in `.claude-plugin/marketplace.json` | Verify: deterministic validation and installed Claude CLI strict validation accept the marketplace/plugin and all paths remain inside the shared root

## Shared public runtime

- [x] T004 [US1] Add failing portable-runner tests for receipt independence, exact pinned-package invocation, unrelated working directories, paths with spaces, bounded degradation, and Codex/Claude host output covering FR-002/FR-005 and SC-004 in `tests/integration/public-plugin-runner.test.ts` | Verify: focused tests fail because no receipt-independent public v2 runner exists
- [x] T005 [US1] Implement the shared public Node launcher and host output translation over lifecycle-v2 for FR-002/FR-005 and SC-004 in `plugin/runners/public-runner.mjs` | Verify: both host fixture suites pass with no receipt or checkout dependency and failures emit neutral bounded host output

## Story US4

- [x] T006 [US4] Add failing public inventory, version synchronization, stale-asset, package-file, and release-script tests for FR-003/FR-004 and SC-002 in `tests/integration/public-plugin-package.test.ts` | Verify: focused tests fail because public distribution assets are absent from current inventory, synchronization, and package files
- [x] T007 [US4] Extend canonical inventory and implement deterministic public plugin version/Skill synchronization plus release wiring for FR-003/FR-004 and SC-002 in `scripts/sync-plugin-distribution.mjs` | Verify: synchronization is idempotent, every stale fixture fails verification, and the npm file list includes both catalogs plus the complete shared plugin root

## Story US3

- [x] T008 [US3] Add a failing isolation test that hashes both public catalogs and traces every canary write for FR-004 and SC-003 in `tests/setup/public-canary-isolation.test.ts` | Verify: the test distinguishes pinned public runtime metadata from the explicit receipt-owned local runtime and detects any write outside the canary target
- [x] T009 [US3] Preserve receipt-owned setup-v2 and route the local Claude MCP launcher through its receipt so neither canary rewrites or silently falls back to public distribution for FR-004 and SC-003 in `integrations/claude-code/runner.mjs` | Verify: the isolation test records identical public-catalog hashes, confines all created files to the target, and records the local runtime entry in the receipt

## Story US4 packed smoke

- [x] T010 [US4] Add failing isolated repository-marketplace lifecycle and MCP process cases for both public hosts covering FR-004 and SC-004 in `tests/integration/public-marketplace-smoke.test.ts` | Verify: the new smoke cases fail before packed public plugin assets and controlled runtime resolution are available
- [x] T011 [US4] Extend packed smoke to stage repository catalogs, install their shared plugin root, invoke one host-shaped event per host, and complete one MCP initialize handshake per host for FR-004 and SC-004 in `scripts/verify-packed-plugins.mjs` | Verify: smoke passes with zero development-checkout reads and zero mutations under the real Codex or Claude homes
- [x] T012 [US4] Document public Codex/Claude marketplace installation separately from private setup-v2 canary setup for FR-001/FR-004 in `README.md` | Verify: commands identify repository marketplace installation as public and explicit-target setup as local development only

## Parallel execution

- None: both host catalogs resolve the same mutable `plugin/` root, and inventory, version synchronization, package files, and smoke verification consume that shared contract in dependency order.

## Final verification

- [x] T013 Run focused tests, build, full tests, integration verification, packed smoke, prepublication verification, strict Claude validation when available, and diff/secret/generated-output review for FR-001/FR-002/FR-003/FR-004/FR-005 and SC-001/SC-002/SC-003/SC-004 in `package.json` | Verify: every required command passes or the exact capability gap is recorded without claiming success
- [x] T014 Persist independent Oracle evidence for every FR and buildable SC, and classify real-host Codex SC-005 and Claude SC-006 individually as observed PASS or explicit residual RISK in `openspec/changes/public-plugin-marketplace-distribution/verify-report.md` | Verify: Oracle reports PASS with no critical or major defect and neither real-host outcome is inferred from fixture-only evidence

## Convergence

- [x] T015 [US4] Remediate M-001 (partial) by adding the complete stale-artifact negative matrix first, then making synchronization and verification cover both marketplace anchors plus every manifest, MCP, hook, Skill/reference, launcher, and runtime asset required by FR-003/FR-004 and SC-002 in `tests/integration/public-plugin-package.test.ts` | Verify: the synchronized fixture passes and an independently stale artifact in every required category fails deterministically
- [x] T016 [US4] Remediate M-002 (missing) by installing the packed repository plugin into a disposable host-owned cache seam and running lifecycle plus MCP only from that installed copy for FR-004 and SC-004 in `scripts/verify-packed-plugins.mjs` | Verify: both public hosts pass from isolated installed roots outside the unpacked npm package and outside real user homes
- [x] T017 [US1] Remediate W-001 (contradicts) by reconciling the Codex public manifest with the installed plugin-creator validator and a disposable Codex marketplace-manager installation for FR-003/FR-004 and SC-001/SC-004 in `tests/packaging/public-plugin-distribution.test.ts` | Verify: the current validator and an isolated manager accept the same repository catalog and manifest without relying on a pre-existing cache
- [x] T018 [US3] Remediate W-002 (partial) by recording a controlled filesystem before/after trace around canary installation and proving every created path remains below the explicit target for FR-004 and SC-003 in `tests/setup/public-canary-isolation.test.ts` | Verify: sibling sentinels and the repository public catalogs remain byte-identical while every new filesystem entry is target-contained
