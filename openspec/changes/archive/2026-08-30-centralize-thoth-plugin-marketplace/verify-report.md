# Verification Report: Central Thoth plugin marketplace

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS
**Current gate**: T038 passed with zero blockers; T039 closeout and archive remain pending.
**Final Oracle instance**: `oracle_final_verify_t038_r2`

> This report preserves the independent evidence for T025. Its FR-006/SC-006 preservation judgment is no longer the active contract; T030-T039 and a fresh Oracle own the converged cleanup verification.

## Review dimensions

- **Completeness**: PASS. Every accepted FR and SC is implemented or observed with concrete evidence.
- **Correctness**: PASS. Product behavior, central publication, real migration, and post-restart first-read outcomes match the converged contracts.
- **Coherence**: PASS. Specification, plan, 45 completed tasks, code, tests, documentation, migration evidence, and final Oracle judgment agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/setup/native-manager.ts` contains the canonical source/ID, Codex 0.151.x capability gate, Windows `ComSpec` lookup, exact cleanup registry, provenance rejection, and central-first verification | thoth-mem focused setup/release suite, 26/26 | PASS |
| FR-002 | Both product inventories exclude repository-owned catalogs and retain plugin/Skill assets | thoth-mem integration verification and thoth-agents packaging lifecycle, 15/15 | PASS |
| FR-003 | Both release flows push tags before catalog publication and expose idempotent catalog-only retry | both disposable publisher suites | PASS |
| FR-004 | Central descriptors pin exactly thoth-agents 0.3.11 and thoth-mem 0.4.13 beneath neutral `thoth-plugins` | central tests 11/11 and `pnpm run validate` | PASS |
| FR-005 | thoth-agents native installers use the central source/ID and Codex performs exact owned cleanup after verification | thoth-agents focused suite, 28/28 | PASS |
| FR-006 | Both Codex installers use fixed targets, official removals, path/link/provenance guards, central-first ordering, retry guidance, and sibling preservation | focused suites plus captured real migration comparison | PASS |
| FR-007 | Central validation checks immutable tags, manifests, Skills, descriptor agreement, target preservation, and concurrent advancement | central validation and both publisher race suites | PASS |
| SC-001 `[buildable]` | Central output retains separate marketplace/plugin/version segments | central tests 11/11 and source validation | PASS |
| SC-002 `[outcome]` | Restarted catalog resolves `cache/thoth-plugins/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md` with SHA-256 `ec3b94ea8393a2e86d4d91902afa948da223897d3096781f692762948114900a` | current-session first catalog read and live filesystem hash | PASS |
| SC-003 `[buildable]` | Setup suites cover 0.151.x, Windows lookup, exact central IDs, conflict behavior, cleanup-only legacy references, and idempotence | thoth-mem 26/26 and thoth-agents 28/28 | PASS |
| SC-004 `[buildable]` | Publisher suites cover ordering, target-only updates, mismatch, retry, and race rejection | both disposable publisher suites | PASS |
| SC-005 `[outcome]` | Central `HEAD`, local `main`, `origin/main`, and remote `main` equal `0f1fa5d784d629590bdeba2e309f39259f6ba9a7` | clean worktree inspection and `git ls-remote --heads origin refs/heads/main` | PASS |
| SC-006 `[outcome]` | All eight authorized legacy roots are absent; unrelated manager JSON is identical; control manifests remain equal at 320, 1, and 683 entries | independent before/after JSON comparison and live post-restart manager/path read | PASS |

## Convergence 1 implementation verification (T036)

Executed on 2026-08-30 after the mandatory simplify pass. This is root-recorded
implementation evidence, not the independent final judgment reserved for T038.

| Surface | Executed evidence | Result |
| --- | --- | --- |
| thoth-mem owned Codex cleanup and release isolation | `pnpm exec vitest run tests/release-marketplace.test.ts tests/setup/native-managers.test.ts` | PASS, 23/23; the cleanup suite contributes 19/19 |
| thoth-mem type/build | `pnpm run build` | PASS |
| thoth-mem integration and packed lifecycle | `pnpm run integration:verify`; `pnpm run integration:smoke` | PASS; packed smoke activated OpenCode, Codex, and Claude Code fixtures |
| thoth-mem broad suite | `pnpm test` | BASELINE, 294/295 tests pass; only `tests/integration/public-plugin-runner.test.ts` fails at the previously isolated Claude compact-checkpoint assertion, outside the cleanup implementation surface |
| thoth-agents owned Codex cleanup and release isolation | sanitized `pnpm exec vitest run src/harness/publish-marketplace.test.ts src/cli/codex-plugin-install.test.ts src/cli/operations/codex.test.ts src/cli/install.test.ts` | PASS, 50/50; the focused cleanup/install group passes 46/46 |
| thoth-agents type, format, build, and broad suite | `pnpm run typecheck`; `pnpm run check:ci`; `pnpm run build`; sanitized `pnpm test` | PASS; Biome checked 273 files and Vitest passed 1168/1168 across 99 files |
| thoth-agents integration packaging | sanitized `pnpm run integration:verify` | PASS, 15/15 |
| central catalog | `pnpm test`; `pnpm run validate`; `git diff --check` | PASS, 11/11 and two pinned sources validated |
| central publication state | local `main`, `origin/main`, and worktree inspection | PASS; clean worktree and both refs equal `0f1fa5d784d629590bdeba2e309f39259f6ba9a7` |
| version and diff boundary | package/catalog reads plus task-scoped `git diff --check` in both product repositories | PASS; thoth-mem remains `0.4.13`, thoth-agents remains `0.3.11`, catalog pins match, and no cleanup-only descriptor/version edit exists |

The cleanup implementation verifies the central plugin and exact expected version
before removing only the product-owned legacy manager identities. Exact orphan roots
are accepted only after descendant, real-path, directory, link, and manifest/source
preflight; the same guards run immediately before deletion. A conflict, lock, unsafe
root, or race retains the verified central plugin and returns bounded close-and-retry
guidance. No portable process detector and no restart garbage collection are assumed.

T037 has not run: the ambient Codex process is deliberately still active. Real manager
state and `C:\Users\EremesNG\.codex` cache/snapshot roots were not mutated during T036.

## Convergence finding C002 — Windows command lookup

The post-T036 real dry run was read-only and discovered a fail-closed command-selection
contradiction before any manager or filesystem mutation:

- PowerShell `codex --version`, explicit `C:\nvm4w\nodejs\codex.cmd --version`, and
  `cmd.exe /d /s /c "codex --version"` report `codex-cli 0.151.0`.
- `node:child_process.spawnSync('codex', ['--version'])` reports the later Desktop
  `C:\Users\EremesNG\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe` at
  `codex-cli 0.147.0`; Node with shell lookup reports `0.151.0` but emits the documented
  unsafe-argument warning, so `shell:true` is not accepted.
- thoth-mem's real plan therefore returned `unsupported` solely at the version gate and
  executed zero actions. thoth-agents already uses `ComSpec /d /s /c codex` with
  `shell:false`, inspected the actual manager, and produced the expected exact legacy
  plan without mutation.

C002 refines FR-001 without broadening cleanup authority: normalize only implicit
Windows lookup, then retain the existing version/capability inspection as the trust
boundary. T040-T044 must complete before T037.

## Convergence 2 implementation verification (T044)

- Fresh Oracle plan review returned `[OKAY]` with matching SHA-256 digests for the
  specification, plan, tasks, active checklist, and constitution before product edits.
- TDD red: the three new command-resolution tests failed while the existing 19 cleanup
  tests passed because `getNativeManagerInvocation` did not exist.
- TDD green and simplify: `pnpm exec vitest run tests/setup/native-managers.test.ts`
  passes 22/22. The final helper wraps only an implicit literal Windows `codex`, keeps
  an argument vector with `shell:false`, and preserves explicit/non-Windows execution.
- `pnpm run build`, `pnpm run integration:verify`, and `pnpm run integration:smoke`
  pass. Packed smoke again activates OpenCode, Codex, and Claude Code fixtures.
- The broad `pnpm test` result is 297/298: only the same previously isolated
  `tests/integration/public-plugin-runner.test.ts` Claude compact-checkpoint assertion
  fails. C002 adds three passing tests and does not touch that test/runtime surface.
- Fresh WebStorm batch diagnostics report zero errors in the source and test files;
  task-scoped `git diff --check` passes.
- With `CODEX_HOME` explicitly resolved to `C:\Users\EremesNG\.codex`, the rebuilt
  local CLI's real `setup codex --plan --json` exits 0 with status `planned`, verifies
  the central marketplace/plugin as installed and enabled, emits only the four exact
  thoth-mem manager removals plus four fixed roots, reports `changed:false`, writes no
  receipt, and returns no warning or diagnostic. The same dry run previously failed
  closed at Desktop `0.147.0`, so the observed success proves the implicit Windows
  lookup now reaches the operator-visible `0.151.0` command before the unchanged gate.

No non-dry-run command or real cache deletion occurred during C002. T037 remains the
first authorized real mutation and still requires Codex to be closed.

## Real stopped-host migration and restart evidence (T037)

The user closed Codex and ran the guarded released-equivalent migration runner with
both `--apply` and `--confirm-codex-closed`. It returned `status: PASS` and persisted
nine evidence files under
`C:\Users\EremesNG\AppData\Local\Temp\thoth-codex-migration-evidence-2026-08-31T02-37-05-587Z`.
Root independently inspected those JSON records, their SHA-256 digests, and the live
manager/filesystem state after the user restarted Codex.

| Evidence | Observed result | Status |
| --- | --- | --- |
| Guarded apply | `agents-result.json` reports success; `mem-result.json` reports `complete`, central marketplace/plugin/enabled verification true, no warning, and no diagnostic | PASS |
| Manager transition | Before: `thoth-agents` plus `thoth-plugins`, with `thoth-agents@thoth-agents` and `thoth-mem@thoth-plugins`. After: only `thoth-plugins`, with enabled `thoth-agents@thoth-plugins` 0.3.11 and `thoth-mem@thoth-plugins` 0.4.13 | PASS |
| Exact legacy roots | The three roots that existed before (`plugins/cache/thoth-mem-codex`, `plugins/cache/thoth-agents`, `.tmp/marketplaces/thoth-agents`) are absent after; all eight authorized legacy roots are absent in both captured and live post-restart state | PASS |
| Unowned controls | `plugins/cache/openai-primary-runtime` (320 manifest entries), `plugins/cache/personal` (1), and `.tmp/marketplaces/engram` (683) have identical before/after manifests; all unrelated marketplace and installed-plugin manager JSON is also identical | PASS |
| Post-restart live state | `codex-cli 0.151.0` reports only the central Thoth marketplace and the two exact enabled central plugin IDs/versions | PASS |
| First catalog read | The restarted session cataloged and read `C:\Users\EremesNG\.codex\plugins\cache\thoth-plugins\thoth-mem\0.4.13\skills\thoth-mem\SKILL.md` directly (SHA-256 `ec3b94ea8393a2e86d4d91902afa948da223897d3096781f692762948114900a`), with no omitted-plugin-segment probe or recovery path | PASS |

`verification.json` is independently consistent with these observations and has
SHA-256 `ab40c1eebc12992bd8150f2d2631d8cd157d35a266dd9a433a194e1a653a2731`.
The live post-restart check also confirmed that all eight legacy paths remain absent
and both central cache roots exist. This satisfies the outcome evidence required by
SC-002 and SC-006; final acceptance remains reserved for the fresh T038 Oracle.

## Historical pre-publication review dimensions

- **Completeness**: PASS. Every FR and every locally buildable SC is represented; SC-002, SC-005, and SC-006 remain explicitly pending outcome scope.
- **Correctness**: PASS. Catalog, installer, packaging, release, retry, race, provenance, and preservation behavior matches the accepted contracts.
- **Coherence**: PASS. Specification, plan, completed tasks, implementation, tests, and active operator documentation agree.

## Historical pre-publication compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/setup/native-manager.ts`: canonical marketplace/ID, capability-checked Codex 0.151.x policy, fail-closed force path, provenance conflict handling, manager-only rollback, residue preservation, and no cache operations | thoth-mem focused setup/package/release suite, 37/37 | PASS |
| FR-002 | Both product package inventories omit repository catalogs while retaining native manifests and Skills | pack dry-runs: thoth-mem 43 files, 11 plugin files, 1 Skill, 0 catalogs; thoth-agents 232 files, 44 plugin files, 5 Skills, 0 catalogs | PASS |
| FR-003 | Both `package.json` release flows push the product tag before `release:marketplace`; both `scripts/publish-marketplace.mjs` implementations use fresh clones, target-only commits, no-op retry, and ordinary pushes | Both four-case disposable bare-remote release suites | PASS |
| FR-004 | `../thoth-plugins/catalog/plugins.json` and `scripts/catalog.mjs`: deterministic dual-host rendering, independent `v0.4.13`/`v0.3.11` pins, and `git-subdir` `plugin/` roots | central `pnpm test`, 11/11; live `pnpm run validate`, 2 tags | PASS |
| FR-005 | thoth-agents Codex/Claude installers use the central source and `thoth-agents@thoth-plugins` while preserving scope, ordering, global layer, required skills, provider handoff, and reload guidance | sanitized relevant tests, 73/73; installer tests, 18/18 | PASS |
| FR-006 | Both installer families diagnose and preserve legacy/unrelated state; destructive manager commands are limited to rollback of newly created canonical state | focused installer tests plus active-document identity scan | PASS |
| FR-007 | Central validation checks the exact tag, both manifests, matching versions, and required Skills before writes; publishers permit only the three catalog paths and reject races | central 11/11 plus both publisher suites | PASS |
| SC-001 [buildable] | The central repo renders one neutral marketplace with two independently pinned plugins | `pnpm test`; `pnpm run validate` | PASS |
| SC-002 [outcome] | Real first-read behavior requires publication, manager installation, restart, and observation | Deferred to T027/T028 | RISK |
| SC-003 [buildable] | Product packages contain complete plugin bundles and zero competing catalogs; executable setup uses only canonical IDs | focused tests, sanitized installer suites, and pack inventories | PASS |
| SC-004 [buildable] | Release handoff proves tag ordering, target-only update, retry idempotency, unchanged product version, and race rejection | both disposable four-case publisher suites | PASS |
| SC-005 [outcome] | Central remote `main` publication has not occurred at this gate | Deferred to T026/T028 | RISK |
| SC-006 [outcome] | Real legacy manager/cache byte preservation requires bounded pre/post capture | Deferred to T027/T028 | RISK |

## Independent verification

- Central: `pnpm test` PASS 11/11; `pnpm run validate` PASS for both pinned product tags; `git diff --check` PASS.
- thoth-mem: focused suite PASS 37/37; `pnpm run integration:verify` PASS; scoped diff and package inventory verified.
- thoth-agents: sanitized marketplace suite PASS 73/73; sanitized installer suite PASS 18/18; `pnpm run integration:verify` PASS 15/15; `pnpm run typecheck` PASS.
- The central remote has no `main` head. Product tags `v0.4.13` and `v0.3.11` are visible.
- The central repository contains exactly the intended 12 files. A scoped secret scan found no credential patterns and no dependency/build directories.
- The thoth-mem broad-suite failure is independent: the stale test submits plain `summary`, while the committed runtime requires structured `thoth_mem_summary`; the failing test, adapter, summary service, and runner have zero working-tree diff.
- The thoth-agents broad-suite failure is independent: the concurrent orchestration hook adds `evidence` to stderr while its old test expects six keys. The remaining Biome finding is confined to the unrelated untracked `src/orchestration/evaluation.ts`.
- Clearing ambient `CODEX_HOME` and `CLAUDE_CONFIG_DIR` isolates disposable installer homes because those environment variables intentionally override `homeDir`; the sanitized suites still execute product behavior.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | Zero unresolved blockers | — |

## Residual risks

- SC-002, SC-005, and SC-006 remain pending until central publication, authorized real-host migration with byte-identical legacy manifests, restart, and first-read observation.
- `thoth-agents` contains substantial unrelated orchestration work. Preserve it exactly and do not include it in the marketplace-only publication.
- Canonical OpenSpec specs still describe the released identities until T029 archive reconciliation; active operator documentation is already aligned.
- The two isolated broad-suite failures remain for their owning changes and do not block this publication.

## Oracle handoff

Root may perform only T026: commit and normally push validated central `main`.
T027 real-host migration and T028 verification by a new Oracle remain mandatory.

## T038 Oracle round 1 — failed artifact coherence

**Reviewer**: oracle (`oracle_final_verify_t038`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: FAIL<br>
**Finding**: `F-T038-001`

### Conclusion

Functional implementation evidence satisfies FR-001 through FR-007 and SC-001
through SC-006, including C001 cleanup, C002 Windows lookup, central publication,
real migration, and the post-restart Skill path. Overall verdict is **FAIL** because
the current Full-route artifact set is structurally invalid and cannot pass
`ready`/closeout validation.

- **Completeness**: PASS for accepted product scope and FR/SC coverage.
- **Correctness**: PASS for implementation and observed outcomes.
- **Coherence**: FAIL. T027-T029 are semantically superseded correctly but violate the installed task contract, blocking required SDD gates.

### Compliance matrix

| ID | Result | Evidence |
| --- | --- | --- |
| FR-001 | PASS | thoth-mem uses central source/ID, complete 0.151.x capability gate, Windows `ComSpec /d /s /c` with `shell:false`, literal overrides, exact cleanup registry; focused suite passed. |
| FR-002 | PASS | Both package inventories delete repository-owned marketplace descriptors while retaining plugin/Skill assets; thoth-mem integration verify/smoke and thoth-agents integration 15/15 passed. |
| FR-003 | PASS | Both release flows push tags before catalog publication and expose catalog-only retry; publisher suites passed. |
| FR-004 | PASS | Central descriptors contain exactly `thoth-agents` 0.3.11 and `thoth-mem` 0.4.13 under neutral `thoth-plugins`; central 11/11 plus source validation passed. |
| FR-005 | PASS | thoth-agents Codex/Claude installers use the central source and exact central plugin ID; Codex alone implements owned cleanup; focused tests passed. |
| FR-006 | PASS | Both Codex installers preflight exact fixed roots, reject links/provenance conflicts, verify central first, use official removals, revalidate before deletion, preserve siblings/unrelated state, and return retry guidance. |
| FR-007 | PASS | Central validation checks exact tags, both manifests, Skills, descriptor agreement, and target-only changes; normal push rejects races; release suites passed. |
| SC-001 | PASS | Central 11/11 and `pnpm run validate` passed; derived path retains separate marketplace/plugin segments. |
| SC-002 | PASS | Restarted catalog and live filesystem resolve `.../cache/thoth-plugins/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md`; SHA-256 is `ec3b94ea...900a`, with no omitted-plugin path in the current catalog. |
| SC-003 | PASS | Current focused setup suites passed, including 0.151.x/C002 tests; executable install paths use only central identities, with former identities limited to exact cleanup handling. |
| SC-004 | PASS | thoth-mem publisher/setup group passed 26/26; thoth-agents Codex/Claude/publisher group passed 28/28, covering ordering, target preservation, retry, mismatch, and race rejection. |
| SC-005 | PASS | Clean central local HEAD, `origin/main`, and read-only remote `main` all equal `0f1fa5d784d629590bdeba2e309f39259f6ba9a7`. |
| SC-006 | PASS | Captures show all eight authorized legacy roots absent, unrelated manager JSON unchanged, and control manifests byte-equivalent: 320, 1, and 683 entries. Live post-restart state confirms absence and both enabled central versions. |

### Commands and independently inspected evidence

- Central: `pnpm test` passed 11/11; `pnpm run validate` validated two pinned sources.
- Remote: `git ls-remote --heads origin refs/heads/main` returned the expected commit.
- thoth-mem: focused tests passed 26/26; build, integration verification, and packed smoke passed.
- thoth-agents: focused tests passed 28/28; typecheck passed; integration passed 15/15.
- Live read-only manager checks used exact `CODEX_HOME=C:\Users\EremesNG\.codex`; Codex 0.151.0 lists only `thoth-plugins` and enabled `thoth-agents@thoth-plugins` 0.3.11 plus `thoth-mem@thoth-plugins` 0.4.13.
- Evidence JSON was parsed independently rather than trusting `verification.json`: unrelated marketplaces/plugins compare equal, all selected roots converge absent, and all three controls compare exactly equal.
- Recorded thoth-agents 1168/1168 is consistent with the report; integration was rerun. Recorded thoth-mem broad 297/298 retains the isolated historical Claude compact-checkpoint failure; its test/runtime files have no task-owned diff.

### Finding and remediation

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| F-T038-001 | High | Coherence/closeout | Installed Full validator with `--through ready` returns `SDD-TASK-FORMAT`, `SDD-TASK-SEQUENCE`, and `SDD-TASK-VERIFICATION`. Only T027-T029 lack one backticked repository-relative path and `| Verify:`; they are skipped, producing sequence 026 to 030. | Normalize T027-T029 in `openspec/changes/centralize-thoth-plugin-marketplace/tasks.md` as valid checked supersession tasks, each with exactly one repository-relative path and observable Verify clause. An in-memory normalization confirmed 44/44 sequential valid tasks. |

### Warnings and next action

- C001 and C002 are substantively coherent; the defect is structural encoding, not implementation behavior.
- Unrelated thoth-agents working-tree changes remain substantial and untouched.
- T039/archive remains pending, and the isolated thoth-mem broad-suite failure remains outside this change.
- Converge only F-T038-001, rerun the installed Full `ready` validator, and then obtain a fresh Oracle final verification. Do not run closeout or archive on this verdict.

## T038 Oracle round 2 — final PASS

**Reviewer**: oracle (`oracle_final_verify_t038_r2`)<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

### Conclusion

Fresh independent final verification passes with zero blockers. F-T038-001 is
closed, every FR-001 through FR-007 and SC-001 through SC-006 has defensible PASS
evidence, and T039 remains correctly pending.

- **Completeness**: PASS
- **Correctness**: PASS
- **Coherence**: PASS

### Compliance matrix

| ID | Result | Evidence |
| --- | --- | --- |
| FR-001 | PASS | `native-manager.ts` uses the canonical marketplace/ID, complete Codex 0.151.x capability gate, Windows `ComSpec /d /s /c` with `shell:false`, literal overrides, exact cleanup registry, provenance rejection, and central-first verification. thoth-mem focused suite passed 26/26. |
| FR-002 | PASS | Both packages exclude repository-owned marketplace catalogs while retaining their plugin/Skill inventories. thoth-mem integration verification passed; thoth-agents packaging lifecycle passed 15/15. |
| FR-003 | PASS | Both release flows push tags before `release:marketplace`; publishers use fresh clones, target-only paths, idempotent no-op retries, and normal pushes. Both publisher suites passed. |
| FR-004 | PASS | Central catalogs contain exactly `thoth-agents` 0.3.11 and `thoth-mem` 0.4.13 under neutral `thoth-plugins`, with independent immutable tags and `plugin/` subdirectories. Central tests passed 11/11 and both sources validated. |
| FR-005 | PASS | thoth-agents Codex and Claude installers use the central source and `thoth-agents@thoth-plugins`; Codex alone performs exact owned cleanup after central verification. Focused suite passed 28/28. |
| FR-006 | PASS | Both Codex implementations use fixed identity/root sets, official removals, descendant/link/provenance checks before mutation and deletion, central-first ordering, retry guidance, and sibling preservation. Migration and live state confirm the outcome. |
| FR-007 | PASS | Central validation checks tags, both manifests, required Skills, descriptor agreement, and target preservation; publisher changed-path allowlists and ordinary pushes reject concurrent advancement. |
| SC-001 | PASS | Central 11/11 plus source validation; descriptors preserve separate marketplace/plugin/version segments. |
| SC-002 | PASS | Restart evidence and current installed catalog resolve `.../cache/thoth-plugins/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md`; SHA-256 `ec3b94ea8393a2e86d4d91902afa948da223897d3096781f692762948114900a`. |
| SC-003 | PASS | Current setup suites cover unforced 0.151.x, Windows lookup, exact central IDs, conflict behavior, cleanup-only legacy references, and no-op convergence. |
| SC-004 | PASS | Both disposable publisher suites cover ordering, target-only updates, absent-tag rejection, retry, and race rejection. |
| SC-005 | PASS | Clean central `HEAD`, local `main`, `origin/main`, and remote `main` all equal `0f1fa5d784d629590bdeba2e309f39259f6ba9a7`. |
| SC-006 | PASS | Captures show all eight legacy roots absent after migration; unrelated manager JSON is exactly equal; control manifests are byte-equivalent at 320, 1, and 683 entries. Live state reconfirms absence and both enabled central versions. |

### Commands and results

- Full validator through `ready`: `valid:true`, zero errors.
- Independent task parse: 45 unique sequential tasks; 43 completed; only T038/T039 pending at review time. T027-T029 each contain one repository-relative path and `Verify:` clause; T045 is complete.
- Central: `pnpm test` PASS 11/11; `pnpm run validate` PASS for two pinned sources.
- thoth-mem: focused setup/release PASS 26/26; integration inventory PASS; build PASS.
- thoth-agents: focused Codex/Claude/publisher PASS 28/28; integration PASS 15/15; typecheck PASS.
- Scoped `git diff --check`: PASS in both product repositories; central worktree clean.
- Live reads with explicit `CODEX_HOME=C:\Users\EremesNG\.codex`: Codex 0.151.0; only central Thoth marketplace; enabled `thoth-agents@thoth-plugins` 0.3.11 and `thoth-mem@thoth-plugins` 0.4.13.
- Recorded broad evidence remains applicable: thoth-agents 1168/1168; thoth-mem 297/298 with the same isolated historical Claude compact-checkpoint failure. The implicated test/runtime files have no task-owned diff.

### Findings

None. No critical, high, or blocking defect remains.

### Warnings and residual risks

- thoth-agents retains substantial unrelated orchestration/configuration worktree changes. Archive and later commits must preserve and separate them.
- The isolated thoth-mem broad-suite failure remains owned by its historical change and is outside this marketplace implementation.
- T039/archive remains pending by design; this is workflow state, not a product risk.

### Evidence, risks, and handoff

Migration evidence was parsed independently rather than trusting `verification.json`:
before/after manager state, selected roots, and controls reconcile exactly. Three
legacy roots existed before; all eight authorized roots were absent afterward and
remain absent live. The three unrelated control manifests and unrelated
marketplace/plugin manager records compare exactly. Central cache roots and the
installed Skill are present and readable.

No unresolved FR/SC risk or open question remains. Root may persist this verdict,
mark T038 complete, prepare closeout, and perform thoth-archive/T039.
