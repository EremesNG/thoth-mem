# Tasks: Central Thoth plugin marketplace

## Authoring contract

Task paths are relative to the repository named in each description. The adaptive
root is the only implementation writer; fresh Oracle agents own independent plan and
verification judgments.

## MVP scope

US1 is the first independently testable slice: a pinned dependency-free central
repository runs its declared tests and validator, renders both host descriptors, and
disposable thoth-mem setup accepts Codex 0.151.x while resolving the exact
thoth-plugins/thoth-mem/version Skill topology with no omitted plugin segment. The
real first-read outcome remains a closeout observation after authorized installation
and restart.

## Dependencies

T001 -> T002 -> T003 -> T004; T004 -> T005 -> T006; T004 -> T009 -> T010; T004 -> T011 -> T012; T002 -> T015 -> T016; T002 -> T017 -> T018; T006 and T008 and T010 and T012 and T014 and T016 and T018 -> T022 -> T023 -> T024 -> T025 -> T026 -> T027. T027 exposed C001 and superseded the original T028-T029 closeout edge; convergence runs T027 -> T030 -> T031 -> T032 -> T033 -> T034 -> T035 -> T036. The real T036 dry run exposed C002, so closeout now runs T036 -> T040 -> T041 -> T042 -> T043 -> T044 -> T037 -> T038 -> T039. Documentation tasks T019-T021 depend on the corresponding original contract and completed before T025; T035 updates both product documents for C001 and T043 records the Windows resolution refinement.

## Story US1

- [x] T001 [US1] Scaffold the new dependency-free central ESM repository with Node 22.12.0 or newer, pnpm 11.20.0, exact test/render/validate commands, ignore rules, and source/test directories covering FR-004 and SC-001 in `package.json` | Verify: a clean central checkout recognizes all declared pnpm commands without installing dependencies or inferring settings from another repository.
- [x] T002 [US1] Add failing central registry, renderer, updater, source-manifest, Skill-inventory, target-preservation, cache-topology, and mismatch tests covering FR-004, FR-007, SC-001, and SC-004 in `tests/catalog.test.mjs` | Verify: the declared central test command runs and the new suite fails for missing implementation while enumerating both plugins and both native hosts.
- [x] T003 [US1] Implement the dependency-free registry loader, deterministic host renderers, source-tag validator, target-only updater, and executable render/validate entrypoints covering FR-004, FR-007, SC-001, and SC-004 in `scripts/catalog.mjs` | Verify: focused central tests pass for valid fixtures and reject every declared mismatch without writing Git state.
- [x] T004 [US1] Seed current independently pinned plugin records and commit both generated native descriptors covering FR-004 and SC-001 in `catalog/plugins.json` | Verify: local validation passes with exactly two entries at thoth-mem 0.4.13 and thoth-agents 0.3.11 and derives distinct marketplace/plugin path segments.
- [x] T005 [US1] Add failing thoth-mem native-manager tests for unforced Codex 0.151.x capability acceptance, other-family forced/fail-closed policy, central source, exact plugin ID, provenance conflict, version repair, legacy preservation, and zero cache operations covering FR-001, FR-006, and SC-003 in `tests/setup/native-managers.test.ts` | Verify: tests fail against the old 0.147.x and host-derived identity gates while capturing the expected official-manager commands.
- [x] T006 [US1] Replace thoth-mem host-derived marketplace identity/source matching and the unforced 0.147.x gate with the canonical remote and capability-checked 0.151.x policy while retaining journaling, rollback, idempotence, forced-family gating, and bounded residue diagnostics covering FR-001, FR-006, and SC-003 in `src/setup/native-manager.ts` | Verify: all focused native-manager tests pass and no emitted operation removes a marketplace, plugin, or cache.

## Story US2

- [x] T007 [US2] Add failing thoth-mem inventory and packed-verification expectations that remove competing package catalogs while retaining one complete plugin bundle covering FR-002 and SC-003 in `tests/integration/public-plugin-package.test.ts` | Verify: focused tests fail while either per-repository descriptor remains in the publish inventory.
- [x] T008 [US2] Stop generating and packaging thoth-mem marketplace descriptors and align integration verification with central ownership covering FR-002 and SC-003 in `scripts/sync-plugin-distribution.mjs` | Verify: integration sync, inventory verification, pack dry-run, and smoke fixtures contain the plugin bundle but zero package-owned marketplace catalogs.
- [x] T009 [US2] Add failing thoth-agents Codex installer tests for central registration, exact plugin ID, conflict detection, legacy preservation, and unchanged follow-on setup covering FR-005, FR-006, and SC-003 in `src/cli/codex-plugin-install.test.ts` | Verify: focused tests fail against thoth-agents-codex and pass no destructive manager operation expectation.
- [x] T010 [US2] Migrate the thoth-agents Codex installer and completion text to the canonical marketplace while preserving setup ordering and agent-pack behavior covering FR-005, FR-006, and SC-003 in `src/cli/codex-plugin-install.ts` | Verify: Codex installer and CLI integration tests pass with only thoth-agents@thoth-plugins.
- [x] T011 [US2] Add failing thoth-agents Claude Code installer tests for central registration, exact plugin ID, conflict detection, scope, legacy preservation, and unchanged follow-on setup covering FR-005, FR-006, and SC-003 in `src/cli/claude-code-install.test.ts` | Verify: focused tests fail against thoth-agents-claude and prove unrelated manager records remain unchanged.
- [x] T012 [US2] Migrate the thoth-agents Claude Code installer and completion text to the canonical marketplace while preserving scope and reload guidance covering FR-005, FR-006, and SC-003 in `src/cli/claude-code-install.ts` | Verify: Claude installer and CLI integration tests pass with only thoth-agents@thoth-plugins.
- [x] T013 [US2] Add failing thoth-agents generator/package tests requiring zero repository-owned marketplace catalogs and unchanged plugin manifests/Skills covering FR-002 and SC-003 in `src/harness/generate-integration-packages.test.ts` | Verify: focused generation tests fail while old descriptors are emitted or packaged.
- [x] T014 [US2] Remove marketplace generation/package entries from thoth-agents while preserving every non-catalog integration asset and concurrent unrelated edit covering FR-002 and SC-003 in `src/harness/generate-integration-packages.ts` | Verify: integration generation and package inventory checks pass with no diff outside declared catalog ownership.

## Story US3

- [x] T015 [US3] Add failing thoth-mem release-publisher tests using disposable bare remotes for tag visibility, fresh central clone, target-only commit, retry no-op, failure messaging, and race rejection covering FR-003, FR-007, and SC-004 in `tests/release-marketplace.test.ts` | Verify: the suite fails before the publisher exists and never changes a package version during retry cases.
- [x] T016 [US3] Implement thoth-mem catalog-only publication and append it after the existing tag push in all release levels covering FR-003, FR-007, and SC-004 in `scripts/publish-marketplace.mjs` | Verify: focused bare-remote tests pass and package scripts expose patch, minor, major, and marketplace-only flows in the required order.
- [x] T017 [US3] Add failing thoth-agents release-publisher tests using disposable bare remotes for the same ordering, preservation, retry, and race contract covering FR-003, FR-007, and SC-004 in `src/harness/publish-marketplace.test.ts` | Verify: the suite fails before the publisher exists and preserves the thoth-mem registry record byte-for-byte.
- [x] T018 [US3] Implement thoth-agents catalog-only publication and append it after the existing tag push in all release levels covering FR-003, FR-007, and SC-004 in `scripts/publish-marketplace.mjs` | Verify: focused bare-remote tests pass and no release path force-pushes or creates a second version during retry.
- [x] T019 [US3] Document central catalog structure, validation, initial bootstrap, release handoff, retry semantics, and normal-commit rollback covering FR-003, FR-004, FR-007, and SC-005 in `README.md` | Verify: every executable instruction matches an implemented central script and identifies main as the publication branch.
- [x] T020 [US3] Update the routed thoth-mem native setup, packaging, release, Codex 0.151.x, and manual legacy-cleanup guidance covering FR-001, FR-002, FR-003, and FR-006 in `docs/agent/native-lifecycle.md` | Verify: routed documentation contains the exact new source/ID and no current instruction advertises a removed per-repository catalog or old unforced version gate.
- [x] T021 [US3] Update thoth-agents packaging/setup/release guidance without disturbing unrelated documentation work covering FR-002, FR-003, FR-005, and FR-006 in `docs/codex-plugin-packaging.md` | Verify: current guidance describes thoth-plugins, independent versions, catalog-only retry, and preserved legacy state.

## Story US4

- [x] T022 [US4] Apply the mandatory simplify pass to recent implementation changes without altering the validated central, setup, packaging, or release behavior covering FR-001 through FR-007 in `scripts/catalog.mjs` | Verify: focused tests remain green and the scoped diff contains no behavior change or unrelated cleanup.
- [x] T023 [US4] Run all focused central, thoth-mem, and thoth-agents test groups plus executable-identity searches covering SC-001, SC-003, and SC-004 from the central validation entrypoint in `scripts/validate.mjs` | Verify: all focused checks pass and former marketplace IDs have zero executable setup occurrences outside historical artifacts/tests that assert migration.
- [x] T024 [US4] Run each repository's required broader build, type, integration, package, and test checks covering FR-001 through FR-007 and SC-001, SC-003, and SC-004 using the thoth-mem verification contract in `docs/agent/testing.md` | Verify: every required command passes or an exact unrelated baseline failure is isolated with evidence before publication.

## Parallel execution

- None: central registry semantics are shared by both installer and release migrations, publication order is sequential, thoth-agents has unrelated concurrent edits, and the single-writer decision avoids overlapping mutable surfaces and stale cross-repository assumptions.

## Final verification

- [x] T025 Obtain a fresh read-only Oracle pre-publication verification of all local diffs, test evidence, release safety, and preservation boundaries covering FR-001 through FR-007 and buildable SC-001, SC-003, and SC-004 in `openspec/changes/centralize-thoth-plugin-marketplace/verify-report.md` | Verify: Oracle returns PASS with zero unresolved blockers before any central remote push.
- [x] T026 Initialize or fast-forward central branch main, commit only validated catalog/tooling content, push to the authorized GitHub remote, and verify the remote commit covering SC-005 in `.agents/plugins/marketplace.json` | Verify: normal push succeeds and the remote main ref equals the independently approved local commit.
- [x] T027 SUPERSEDED by C001/T030-T039 after its real-manager investigation disproved the legacy byte-preservation contract in `openspec/changes/centralize-thoth-plugin-marketplace/tasks.md` | Verify: C001 retains the bounded investigation evidence as its convergence trigger and removes the contradicted preservation outcome from active closeout.
- [x] T028 SUPERSEDED by T038 against the accepted owned-cleanup contract in `openspec/changes/centralize-thoth-plugin-marketplace/tasks.md` | Verify: T038, not this contradicted-contract task, owns the fresh final Oracle verification.
- [x] T029 SUPERSEDED by T039 for converged closeout in `openspec/changes/centralize-thoth-plugin-marketplace/tasks.md` | Verify: T039, not this contradicted-contract task, owns archive and durable-memory reconciliation.

## Convergence 1 — owned Codex legacy cleanup

**Finding C001** (`contradicts`, critical): T027 proved that the accepted byte-preservation contract contradicts the user's clarified migration intent. Codex `0.151.0` removes registered plugin cache and marketplace snapshots synchronously, while an unregistered orphan cache survives both an idempotent `plugin remove` and a fresh CLI process. The product CLIs must therefore verify central state first, retire only their own exact Codex legacy state, and remove exact safe orphan roots without relying on restart or fragile process enumeration.

- [x] T030 [US4] Resolve C001 by amending the canonical specification, plan, checklist, and task graph from legacy byte preservation to stopped-Codex, install-before-cleanup, exact-owned-root convergence covering FR-001, FR-005, FR-006, SC-002, and SC-006 in `openspec/changes/centralize-thoth-plugin-marketplace/` | Verify: Full ready validation passes and a fresh Oracle approves completeness, correctness, coherence, deletion safety, and the explicit no-process-detector rationale before product code changes.
- [x] T031 [US4] Resolve C001 by adding the first failing thoth-mem public setup tests for central-verification-before-cleanup, exact legacy plugin/marketplace commands, orphan-root removal, sibling/unrelated preservation, unsafe-path rejection, cleanup-failure retry, dry-run, and idempotence covering FR-001, FR-006, and SC-003 in `tests/setup/native-managers.test.ts` | Verify: each vertical slice fails for the intended missing behavior before its minimal implementation and no test asserts private helper structure.
- [x] T032 [US4] Resolve C001 by implementing thoth-mem Codex-only owned legacy cleanup while retaining Claude preservation, existing journal rollback, version/capability gates, and central provenance handling covering FR-001 and FR-006 in `src/setup/native-manager.ts` | Verify: the focused native-manager suite passes; cleanup begins only after central verification; unsafe or locked roots yield bounded retry guidance with central state retained.
- [x] T033 [US4] Resolve C001 by adding the first failing thoth-agents public Codex plan/apply tests for the same product-owned cleanup contract covering FR-005, FR-006, and SC-003 in `src/cli/codex-plugin-install.test.ts` | Verify: each vertical slice fails against preservation behavior and observes only public plan/apply results, manager calls, and disposable filesystem state.
- [x] T034 [US4] Resolve C001 by implementing thoth-agents Codex-only owned legacy cleanup with only required call-site plumbing and without changing Claude Code cleanup behavior, global agent setup ordering, or unrelated concurrent orchestration work covering FR-005 and FR-006 in `src/cli/codex-plugin-install.ts` | Verify: focused Codex installer/integration tests pass, the sibling thoth-mem roots remain byte-identical, and retries converge after a simulated cleanup failure.
- [x] T035 [US4] Resolve C001 by replacing manual-preservation guidance with close-Codex, verified-central-first, exact-owned-cleanup, retry, and no-restart-GC guarantees in thoth-mem and C:/DEV/Proyectos/Webstorm/thoth-agents/docs/codex-plugin-packaging.md, anchored by `docs/agent/native-lifecycle.md` | Verify: both routed Codex documents name exact manager operations and never promise portable process detection or startup garbage collection.
- [x] T036 [US4] Resolve C001 by applying the mandatory simplify pass and recording focused, type, build, integration, packaging, release, and scoped-diff checks across all three repositories in `openspec/changes/centralize-thoth-plugin-marketplace/verify-report.md` | Verify: all owned checks pass or only the previously isolated unrelated baselines remain; no central descriptor version changes are introduced by cleanup-only code.
- [x] T037 [US4] Resolve C001 with the user-confirmed Codex host closed by running the product CLIs or exact released-equivalent flow and capturing before/after manager JSON plus bounded manifests anchored at `.agents/plugins/marketplace.json` | Verify: selected legacy IDs/roots are absent, central Skills resolve on the first catalog path, and sibling/unrelated control manifests compare equal for SC-002 and SC-006.
- [x] T038 [US4] Resolve C001 by obtaining a fresh read-only Oracle final verification of the converged artifacts, product diffs, remote central main, tests, real-host cleanup evidence, and first-read evidence in `openspec/changes/centralize-thoth-plugin-marketplace/verify-report.md` | Verify: Oracle covers every FR and SC and returns PASS with zero blockers or routes exact defects to another convergence round.
- [x] T039 [US4] Resolve C001 by persisting final evidence, reconciling canonical deltas, archiving the passing change, and superseding obsolete preservation memory in `openspec/changes/centralize-thoth-plugin-marketplace/archive-report.md` | Verify: closeout validation and thoth-archive pass with the cleanup contract canonicalized.

## Convergence 2 — Windows Codex command resolution

**Finding C002** (`contradicts`, high): A real read-only dry run against `C:\Users\EremesNG\.codex` proved that PowerShell and `cmd.exe` resolve the npm Codex `0.151.0` shim, while thoth-mem's direct Node `spawnSync('codex', ...)` bypasses it and invokes the Desktop `codex.exe` at `0.147.0`. The existing gate then fails safely, but it rejects the operator-visible supported manager and prevents the authorized migration. thoth-agents already uses `ComSpec` lookup with `shell:false` and is not defective.

- [x] T040 [US4] Resolve C002 by amending the canonical specification, plan, task graph, and verification state for Windows shell-compatible implicit Codex lookup, literal explicit overrides, direct non-Windows execution, and unchanged capability authority in `openspec/changes/centralize-thoth-plugin-marketplace/plan.md` | Verify: Full ready validation passes and a fresh Oracle returns `[OKAY]` before product code changes.
- [x] T041 [US4] Resolve C002 by adding the first failing thoth-mem tests for the Windows command-shell invocation vector with shell disabled, direct non-Windows execution, literal explicit override preservation, and observed manager output flowing through the existing version gate in `tests/setup/native-managers.test.ts` | Verify: tests fail only because the default Windows executor currently resolves `codex` directly and do not weaken capability checks.
- [x] T042 [US4] Resolve C002 by implementing the smallest thoth-mem native-manager invocation normalization without enumerating installations, selecting a version, changing cleanup targets, or changing thoth-agents in `src/setup/native-manager.ts` | Verify: focused tests pass and the resolver delegates all trust to the existing manager version/capability inspection.
- [x] T043 [US4] Resolve C002 by applying simplify and documenting the implicit Windows command-shell lookup, literal explicit overrides, and unchanged version/capability authority in `docs/agent/native-lifecycle.md` | Verify: focused tests remain green and troubleshooting distinguishes command selection from version selection without recommending installation enumeration.
- [x] T044 [US4] Resolve C002 by rerunning affected and broader verification plus the real read-only dry run against the user's resolved Codex home and recording the evidence in `openspec/changes/centralize-thoth-plugin-marketplace/verify-report.md` | Verify: the dry run observes `0.151.x`, emits the exact bounded legacy plan, performs zero writes, and leaves T037 as the only pre-Oracle real-host gate.

## Convergence 3 — superseded-task grammar

**Finding F-T038-001** (`partial`, high): The first T038 Oracle found that T027-T029
were semantically superseded but no longer matched the installed task grammar, so the
Full validator skipped them and reported format, sequence, and verification errors.
The functional FR/SC review passed; only artifact normalization is authorized.

- [x] T045 Resolve F-T038-001 by normalizing the three checked supersession records without changing their meaning in `openspec/changes/centralize-thoth-plugin-marketplace/tasks.md` | Verify: the installed Full `ready` validator recognizes 45 sequential completed-or-pending tasks with no task format, sequence, or verification error before a fresh Oracle rerun.
