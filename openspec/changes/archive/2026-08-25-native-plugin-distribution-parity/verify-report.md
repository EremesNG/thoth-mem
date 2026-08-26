# Verification Report: Native plugin distribution parity

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: Final Oracle round 6 mapped every FR-001 through FR-045 and SC-001 through SC-013; both outcome criteria have observed real OpenCode PASS evidence.
- **Correctness**: Native packaging, setup ownership, exact six-tool MCP, identity, lifecycle, provider data, manager boundaries, Bun-to-Node SQLite execution, and cross-host recovery match their accepted contracts.
- **Coherence**: Specification, plan, completed tasks, implementation, tests, documentation, repository evidence, and the hashed user-operated OpenCode export agree; paid Claude model use remains an explicit non-blocking residual risk.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `package.json`, `scripts/build.mjs`, three native distribution roots | Packaging suites; inventory verification; packed smoke | PASS |
| FR-002 | `src/integration/opencode/plugin.ts`, adapters, public runner, Skills | Focused plugin/adapter/runner tests; packed smoke | PASS |
| FR-003 | `src/setup/opencode.ts`, exact npm/file config and global Skill sync | Native OpenCode setup tests; packed setup convergence | PASS |
| FR-004 | Exact managed-entry and Skill drift comparison | Duplicate/drift/no-op setup matrix | PASS |
| FR-005 | `src/setup/opencode-config.ts` JSONC structural edits | Comment/trailing-comma/malformed config fixtures | PASS |
| FR-006 | Receipt-first OpenCode transaction | Failure and interruption recovery fixtures | PASS |
| FR-007 | `src/setup/opencode-skills.ts` owned-tree hashing | Missing/stale/extra/link Skill fixtures | PASS |
| FR-008 | Target-bounded config/Skill rollback | Unrelated state preservation fixtures | PASS |
| FR-009 | Copied OpenCode activation removed from inventory and source | Integration inventory verification; packaging rejection tests | PASS |
| FR-010 | Bun adapter plus package-relative literal Node lifecycle; portable manager runner | Focused boundary tests; static dist inspection; packed Bun smoke | PASS |
| FR-011 | Native main/bin and complete manager assets in package inventory | Integration verification; packed artifact inspection | PASS |
| FR-012 | Installed-artifact npm/file setup, Skill, Bun hook, MCP, managers | `pnpm run integration:smoke` recorded PASS | PASS |
| FR-013 | Explicit local `file://` provenance and real-host report | Setup tests; OpenCode debug/config evidence | PASS |
| FR-014 | Per-dimension capability matrix and hashed outcome export | Final Oracle export inspection | PASS |
| FR-015 | `src/cli.ts` three native setup commands only | CLI/setup/help suites | PASS |
| FR-016 | Strict shared provider config and package-relative lifecycle forwarding | Runtime-config tests; cross-host and Bun-boundary tests | PASS |
| FR-017 | One deterministic tagged trailing OpenCode recovery region | Prefix-stability and repeated-transform tests | PASS |
| FR-018 | Help and plan paths return before mutation | Global/MCP/setup zero-write matrix | PASS |
| FR-019 | Exact owned OpenCode changes and manager-only Codex/Claude changes | Setup ownership and cache-safety suites | PASS |
| FR-020 | Secret-free receipt before each mutating setup attempt | Receipt and injected-failure fixtures | PASS |
| FR-021 | Codex selects only verified `plugin_manager` strategy | Native-manager capability fixtures | PASS |
| FR-022 | Legacy Codex migration behavior removed | Packaging/CLI absence tests | PASS |
| FR-023 | Freshness derived only from native manager state | Manager inspection/idempotency fixtures | PASS |
| FR-024 | OpenCode global Skill plus bundled Codex/Claude Skills | Inventory, setup, and package verification | PASS |
| FR-025 | Runtime no longer mutates `skills.paths` | Native plugin config test | PASS |
| FR-026 | User Skill paths and siblings preserved | Native plugin and setup preservation tests | PASS |
| FR-027 | Release smoke executes the installed tarball | Packed Bun/Node/manager smoke | PASS |
| FR-028 | Interrupted setup recovers exact owned state | Transaction restart fixtures | PASS |
| FR-029 | Temporary journals/backups removed after verified success | Setup cleanup/no-op fixtures | PASS |
| FR-030 | Cleanup degradation remains truthful and retryable | Failure-injection cleanup fixtures | PASS |
| FR-031 | Human/JSON results match provenance and restart state | CLI and setup result tests | PASS |
| FR-032 | Repeated setup performs zero mutation after exact verification | Public/local/manager idempotency matrix | PASS |
| FR-033 | Codex marketplace/plugin operations are manager-native and verified | Native-manager fixtures and real Codex evidence | PASS |
| FR-034 | Automated Codex checks use disposable global/user state | Isolated Codex 0.147.0 fixtures | PASS |
| FR-035 | Rollback touches only receipt-proven owned state | Manager/OpenCode rollback fixtures | PASS |
| FR-036 | Manager post-state overrides command exit text | Mixed-outcome manager fixtures | PASS |
| FR-037 | Claude external/pre-existing state remains outside ownership | Claude coexistence/rollback fixtures | PASS |
| FR-038 | Hidden residue does not prove Codex registration | Manager residue classification tests | PASS |
| FR-039 | Unforced support is bounded to Codex 0.147.x | Version-gate matrix | PASS |
| FR-040 | Forced-version warning appears only after safe capability proof | Human/JSON forced-warning fixtures | PASS |
| FR-041 | Supported, fail-closed, and forced paths run only in isolation | Complete injected manager matrix | PASS |
| FR-042 | One separate side-effect-free OpenCode identity tool | Root/delegated/depth/cycle/zero-dispatch tests | PASS |
| FR-043 | Complete identity-first bounded host output | OpenCode/public-runner identity and injection suites | PASS |
| FR-044 | Distinct synchronized OpenCode/Codex/Claude identity guidance | Reference-content and distribution-lock tests | PASS |
| FR-045 | OpenCode bundle excludes SQLite graph and uses bounded Node JSON stdio | 11/11 boundary tests; static dist inspection; packed Bun smoke | PASS |
| SC-001 `[buildable]` | Separate native main and executable CLI/MCP bin | Build/package/plugin tests | PASS |
| SC-002 `[buildable]` | Public/local setup converges once and then changes zero bytes | Native OpenCode idempotency tests | PASS |
| SC-003 `[buildable]` | OpenCode 1.18.23 resolves native plugin, MCP, Skill, hooks, runtime, data | Real-host report plus successful export | PASS |
| SC-004 `[buildable]` | Codex 0.147.0 manager-native install and V2 recovery | Manager fixtures and recorded real Codex PASS | PASS |
| SC-005 `[buildable]` | Claude 2.1.198 structure, hooks, MCP, Skill, runtime, data | Strict validation and packed smoke | PASS |
| SC-006 `[buildable]` | Injected failures restore exact owned state and preserve unrelated state | Setup/manager failure matrix | PASS |
| SC-007 `[buildable]` | Tarball contains no forbidden checkout/CWD/private/copy provenance | Inventory and packed-isolation checks | PASS |
| SC-008 `[outcome]` | Generic prompt omitted markers/IDs; OpenCode recovered and used A/B | Hashed export and final Oracle inspection | PASS |
| SC-009 `[outcome]` | OpenCode retrieved exact Codex-seeded memory/evidence pairs and project/source IDs | Hashed export `mem_recall`/`mem_get` trace | PASS |
| SC-010 `[buildable]` | Stable prefix and single tagged recovery tail | Property/repeated-transform tests | PASS |
| SC-011 `[buildable]` | One native identity tool remains outside exact six MCP tools | Identity and registry tests | PASS |
| SC-012 `[buildable]` | Complete bounded identity and synchronized host references | OpenCode/public-runner/package tests | PASS |
| SC-013 `[buildable]` | Bun main persists/recovers through Node without native SQLite graph | Focused boundary tests; Bun 1.3.10; packed smoke | PASS |

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | Final Oracle found no actionable blocker | — |

## Residual risks

- `RISK-CLAUDE-MODEL`: Paid Claude real-model consumption remains intentionally unobserved; Claude structural SC-005 and every implementation contract pass.
- Publication and release tagging remain separate user-authorized work.

## Status

Repository implementation, disposable-host verification, and real OpenCode outcome: **PASS — FINAL OUTCOME-AWARE ORACLE VERIFIED**. The corrected installed-artifact seam executes the OpenCode main under Bun and SQLite lifecycle under package-relative Node. A fresh final Oracle independently validated FR-001 through FR-045, SC-001 through SC-013, and the user-supplied OpenCode export with no actionable blockers.

Real-host closeout: **PASS — SC-008 AND SC-009 OBSERVED; FINAL OUTCOME-AWARE ORACLE PENDING**. After the Bun correction and restart, a fresh OpenCode `1.18.23` root session received only the generic continuation prompt, recovered both absent-from-prompt certification handoffs from the shared SQLite database, expanded their stable memory/evidence IDs, used them in its answer, and persisted a session-attributed final certification. Final SDD Oracle verification and archive have not run.

## OpenCode Bun runtime failure and convergence

The user-operated OpenCode `1.18.23` attempt on 2026-08-26 resolved the local native plugin and created root session `ses_fc3fe2019ffemOeIl21742gL1e`, then rejected the prompt while executing `chat.message`. The host log reported `ERR_DLOPEN_FAILED: 'better-sqlite3' is not yet supported in Bun`, with the stack entering `new MemoryService` from `dist/opencode.js` through `dispatchOpenCodeLifecycle`.

The same failure was reproduced outside the host with Bun `1.3.10` by importing the current built `dist/opencode.js` and invoking a native lifecycle callback. Code inspection confirmed that `src/integration/opencode/plugin.ts` statically imports `src/integration/lifecycle-dispatcher.ts`, which imports `MemoryService`; esbuild therefore copies the Node-native SQLite graph into the Bun artifact. Existing packed verification executed that artifact with Node, so it could not detect the host/runtime incompatibility.

Reference implementations support one correction rather than a storage rewrite: repository `master` used a thin OpenCode adapter plus a spawned Node hook runner; AgentMemory keeps OpenCode thin and calls its external service; Engram explicitly routes OpenCode events over HTTP to a separate SQLite service. The selected convergence keeps SQLite and the v2 core unchanged, moves only lifecycle execution behind the existing package-relative Node CLI, adds bounded versioned JSON stdio with host-safe failure, and release-gates the installed artifact under actual Bun. No real-home mutation is required for implementation; the current local plugin entry will pick up the rebuilt artifact after a user-approved restart.

TDD red evidence: after changing the installed-artifact smoke to load the packed native main with Bun and require identity-first checkpoint recovery, `pnpm run integration:smoke` failed under Bun `1.3.10` with the same `ERR_DLOPEN_FAILED` stack through packed `dist/opencode.js` → `MemoryService` → `better-sqlite3`. This proves the regression test exercises the missing production runtime seam rather than a synthetic fixture.

Implementation and green evidence:

- `src/integration/opencode/node-lifecycle-client.ts` now maps native operations to the existing host-neutral v2 event contract and spawns literal `node <package-relative-dist/index.js> lifecycle-v2` without a shell, `npx`, receipt, or caller-CWD dependency.
- The child boundary applies a 5-second timeout and 256-KiB combined output bound by default, forwards isolated provider/home configuration without global mutation, requires the exact lifecycle schema plus matching root/project identity, validates every rendered recovery field, and returns no result on launch, stdin, timeout, output, exit, JSON, envelope, or unexpected callback failure.
- `src/integration/opencode/plugin.ts` no longer imports the in-process dispatcher. Every persistence/recovery hook awaits the bounded client; host logging is best effort and cannot reject the callback. Failed recovery may still show the independently host-verified identity, but injects no memory context.
- The obsolete in-process dispatcher was removed. Packed verification rejects `better-sqlite3` or `class MemoryService` in `dist/opencode.js`, loads that installed artifact with Bun `1.3.10`, persists a checkpoint through Node, and observes identity-first recovery from an unrelated CWD.
- CI and release provision Bun `1.3.10` using the official `oven-sh/setup-bun@v2` action before the packed smoke. Routed and user-facing documentation now describe the same Bun-adapter/Node-persistence boundary.
- `pnpm run build` — PASS after the correction and behavior-preserving simplify pass.
- `pnpm exec vitest run tests/integration/opencode-native-plugin.test.ts` — PASS, 11/11. It covers valid and identity-mismatched envelopes; launch, timeout, nonzero exit, excess output, and invalid JSON; plus host-safe no-false-memory injection.
- `pnpm run integration:smoke` — PASS after its expected red. The installed tarball reports OpenCode, Codex, and Claude Code lifecycle fixtures active, with OpenCode itself running under Bun and its checkpoint recovered through Node.
- `pnpm run integration:verify` — PASS; all local/public inventories remain synchronized.
- `pnpm test` — PASS, 28 files and 120 tests.
- `git diff --check` — PASS; only existing line-ending notices were emitted.
- No real OpenCode home, plugin configuration, provider configuration, or shared database was mutated during this correction. The current local `file://` entry will require a host restart to load the rebuilt artifact only after Oracle accepts the candidate.

### Independent Oracle round 5 — PASS

The mandatory fresh Oracle returned **PASS with no actionable blockers** for the Bun-runtime convergence:

| Contract | Independent judgment |
| --- | --- |
| FR-010 | PASS — the Bun adapter invokes literal `node` with `shell:false` and package-relative `dist/index.js lifecycle-v2`; no child `npx` or CWD dependency remains. |
| FR-012 | PASS — the disposable tarball smoke covers npm/file convergence, Skill synchronization, native Bun import, lifecycle recovery, MCP, and manager bundles. |
| FR-045 / SC-013 | PASS — `dist/opencode.js` contains neither `better-sqlite3` nor `MemoryService`; Bun `1.3.10` persists and recovers a checkpoint through Node, and child failures remain bounded and host-safe. |
| FR-002, FR-016, FR-017 | PASS — lifecycle mapping, shared provider data, identity-first recovery, one tagged tail, and stable-prefix behavior remain covered. |
| FR-042, FR-043 | PASS — the identity-only native tool remains separate, complete, bounded, delegated-aware, and fail closed. |
| Exact six MCP tools | PASS — names and registry remain unchanged. |
| SC-008 / SC-009 | RISK — real OpenCode model use and stable-ID retrieval remain unobserved because the prior prompt failed before recovery. |

Oracle independently observed focused OpenCode 11/11, adapter/lifecycle/package/entrypoint 16/16, MCP registry 4/4, packed Bun smoke PASS, inventory PASS, ready validation PASS with only the previously reviewed overlap warnings, Bun `1.3.10`, a persistence-free compiled OpenCode graph, and diff hygiene PASS. It accepted the root's latest build PASS and full-suite 120/120 evidence without mutating generated output. Paid Claude model use remains an explicit residual RISK and is not an implementation blocker.

## Repository evidence

Commands run on 2026-08-25:

- `pnpm install --frozen-lockfile` — PASS, lockfile unchanged.
- `pnpm run build` — PASS; TypeScript and both `dist/index.js` / `dist/opencode.js` builds complete.
- Focused runtime-config suite — PASS, 7 tests.
- Focused native plugin, lifecycle, public runner, setup, manager, canary, and packaging suites — PASS; the final local-runtime correction subset passed 33 tests across 5 files.
- `pnpm test` — PASS, 108 tests across 28 files.
- `pnpm run integration:verify` — PASS; native OpenCode and Codex/Claude local/public inventories agree.
- `pnpm run integration:smoke` — PASS; tarball installs in a disposable directory, imports the one-export OpenCode main, executes the independent bin, converges npm/file setup idempotently, synchronizes the Skill, uses persisted provider data, enumerates six MCP tools, and executes OpenCode/Codex/Claude lifecycle fixtures from unrelated paths.

The test-first evidence includes malformed provider config, JSONC comments/trailing commas, duplicate and similarly named plugins, linked/extra-file Skill drift, handled rollback, interrupted setup recovery, manager mixed exit versus post-state, receipt-proven manager rollback, Codex version gating/forced capability checks, bounded diagnostics, prompt-cache stable-prefix behavior, local-versus-public runtime selection, plugin-relative MCP startup, and user-config isolation.

### Host identity convergence evidence

The user identified that the v2 rewrite had dropped two previously Oracle-approved contracts: the OpenCode-native identity tool and the model-visible verified identity header. The correction preserves the exact six-tool MCP registry while restoring one separate OpenCode host-native `thoth_mem_root_identity` tool.

- Accelerated `ready` validation after the convergence artifact update — PASS; the additive native-tool overlap warning was reviewed and accepted because it is explicitly outside MCP and performs no memory operation.
- TDD red evidence: OpenCode initially exposed zero native identity tools; delegated ancestry returned degraded; Codex/Claude public runners omitted normalized identity; actual CLI output returned `{}` without identity; long output exceeded 1,000 code points; newline identity injection was accepted; and packaged Skills still denied or omitted the proven procedures.
- `pnpm run build` — PASS after implementation and after the behavior-preserving simplify pass.
- Focused OpenCode native plugin, public runner, package/reference, and adapter suites — PASS, 21/21.
- `pnpm run integration:verify` — PASS after synchronizing the public bundle and distribution lock.
- `pnpm run integration:smoke` — PASS; the installed tarball exposes exactly one OpenCode native identity tool, exactly six MCP tools, and identity-first Codex/Claude lifecycle output.
- `pnpm test` — PASS, 28 files and 113 tests.
- OpenCode root/delegated/degraded identity JSON, depth-16 ancestry, cycle detection, zero persistence, complete bounded tagged output, control-character rejection, and prompt-cache tail ownership are covered at the public plugin seam.
- Codex/Claude output retains complete verified identity, truncates only optional context to 1,000 Unicode code points, rejects unsafe/overlong identity, and receives identity from the normalized lifecycle envelope rather than re-reading raw host input.

### Independent Oracle round 1 and convergence

Oracle round 1 returned **FAIL** with two actionable blockers while passing FR-042/SC-011 and FR-044:

1. Claude `SessionStart` with `source: "compact"` was normalized as `enroll`, so identity was visible but the `PreCompact` checkpoint was not recovered. This violated FR-002, FR-043, and SC-012.
2. The verified-identity header rejected CR/LF/NUL but still admitted semicolon field injection, tabs, and Unicode line/paragraph separators. OpenCode project rendering had the same ambiguity. This violated FR-043 and SC-012.

SC-008 and SC-009 remained correctly classified as real-host RISK rather than implementation blockers. Oracle also warned that the implementation counted 16 inspected session records while the specification described 16 `parentID` links.

Convergence evidence:

- TDD red — adapter expected `guide_post_compact` but received `enroll`; actual CLI-backed Claude compact startup omitted the saved checkpoint; public-runner semicolon injection emitted a forged-looking identity; OpenCode unsafe project identity was injected; and an exact sixteen-link chain degraded.
- Claude compact startup now maps to `guide_post_compact` with context injection, and an actual `PreCompact` → `SessionStart/compact` sequence recovers the saved checkpoint after the complete identity header.
- Codex/Claude and OpenCode header renderers reject semicolon, equals, every Unicode `Cc` control, `Zl`/`Zp`, leading/trailing whitespace, and identities that cannot fit completely. Ordinary project names with spaces remain valid.
- OpenCode traversal now follows at most 16 validated `parentID` links: an exact sixteen-link chain succeeds and seventeen links fail closed.
- The packed smoke now proves Claude compact checkpoint recovery from the installed tarball, not only source fixtures.
- `pnpm run build` — PASS.
- Focused adapter, public-runner, OpenCode native plugin, and package/reference suites — PASS, 23/23.
- `pnpm run integration:verify` — PASS after synchronized distribution-lock refresh.
- `pnpm run integration:smoke` — PASS, including installed-tarball Claude compact recovery.
- `pnpm test` — PASS, 28 files and 115 tests.
- `git diff --check` — PASS; only line-ending warnings were emitted.

### Independent Oracle round 2 — PASS

The mandatory fresh Oracle returned **PASS with no actionable implementation blockers**:

| Contract | Independent judgment |
| --- | --- |
| FR-001 through FR-041 | PASS — existing implementation and task mappings remain supported by build, full-suite, packed-smoke, disposable-manager, and real-host evidence. |
| FR-042 / SC-011 | PASS — one separate OpenCode identity tool; exactly 16 parent links succeed and 17 fail closed; delegated authority remains denied; zero memory dispatch; MCP remains exactly six tools. |
| FR-043 | PASS — Claude compact startup reaches post-compaction guidance and recovers the checkpoint identity-first; all three renderers reject ambiguous delimiters/control characters and preserve complete bounded identity. |
| FR-044 / SC-012 | PASS — host identity procedures are distinct and complete; canonical/public Codex and Claude references are byte-identical and package-enforced. |
| SC-001 through SC-007, SC-010 through SC-012 | PASS. |
| SC-008 / SC-009 | RISK — pending the user-operated fresh OpenCode model-use and stable-ID observation. |
| Paid Claude model use | RISK — intentionally unobserved, not an implementation defect. |

Oracle independently ran the 4-file focused suite (23/23), integration inventory verification, ready validator, and diff hygiene. It inspected the packed-smoke assertion and accepted the recorded installed-tarball PASS; no installation was authorized inside the read-only review. Exact memory lookup also confirmed corrected memory `a7999201-f738-56a1-a5ba-c334c710d9a0` and evidence `586caa62-5ec1-56d5-a278-6efd1bde1943` with supersession lineage.

### Setup-help safety convergence after Oracle round 2

A post-review diagnostic exposed a separate state-safety defect: `thoth-mem setup opencode --help` was parsed as a real public setup and changed the current OpenCode entry from the authorized local file to npm. The command completed successfully, so this was not a hidden or ambiguous state transition. The local state was immediately restored through the supported explicit local setup path; the first restorative run reported `changed=true`, and the identical repeated run reported `changed=false` with provenance `file:///C:/DEV/Proyectos/Webstorm/thoth-mem/dist/opencode.js` and data directory `C:\Users\EremesNG\.thoth-mem-v2-local`.

The defect is now closed:

- TDD red — an isolated disposable home observed `setup opencode --help` create plugin configuration, a synchronized Skill, and a setup receipt instead of printing help.
- Global or subcommand `--help` and `-h` now return the bounded command guide before any command dispatch.
- The isolated zero-write regression passes and asserts no OpenCode configuration, managed Skill, or provider configuration is created.
- `opencode debug config` exits zero and resolves the exact local `dist/opencode.js` provenance plus thoth-mem MCP; `opencode debug skill` exits zero and lists thoth-mem plus its OpenCode reference.
- `pnpm run build` — PASS.
- Focused setup plus identity convergence suites — PASS, 26/26.
- `pnpm run integration:smoke` — PASS after the CLI change.
- `pnpm test` — PASS, 28 files and 116 tests.
- `git diff --check` — PASS; line-ending notices only.

### Independent Oracle round 3 and entrypoint convergence

Oracle round 3 returned **FAIL with one actionable blocker**. `runCli` handled both help flags before setup/lifecycle/import dispatch, but `shouldRunCli` routed only long help. Consequently, global `-h` and `mcp -h` bypassed the CLI, started MCP, and created `memory-v2.sqlite` in an isolated data directory. Setup help for all three hosts was already non-mutating, and the prior FR-042 through FR-044 identity PASS remained supported.

The entrypoint defect is now closed:

- TDD red — unit routing classified global/MCP short help as MCP; process execution emitted no guide and created isolated state.
- `shouldRunCli` now routes both `--help` and `-h` before the MCP/default-path decision.
- Unit coverage asserts global, MCP, and setup help routing while retaining a normal MCP invocation with a separate data-directory argument on the MCP path.
- Process-level coverage executes global help, MCP help, and OpenCode/Codex/Claude setup help under both flags in separate disposable homes; every command prints the guide and the complete isolated tree remains empty, covering configuration, Skills, provider state, receipts, and SQLite.
- `pnpm run build` — PASS.
- Entrypoint unit suite — PASS, 2/2.
- Focused setup plus identity convergence suites — PASS, 26/26.
- `pnpm run integration:smoke` — PASS.
- `pnpm test` — PASS, 28 files and 117 tests.
- `git diff --check` — PASS; line-ending notices only.

### Independent Oracle round 4 — PASS

The final fresh Oracle returned **PASS with no actionable implementation blockers**. It confirmed that both help flags route through `runCli` before MCP startup, every global/MCP/setup help variant leaves its fully isolated tree empty, and a normal MCP invocation still reaches MCP and creates SQLite only when explicitly executed. Entrypoint unit tests passed 2/2; setup/help plus identity tests passed 26/26; integration inventory and packed smoke passed; ready validation and diff hygiene passed.

Oracle also rechecked the prior identity convergence and preserved PASS for FR-042 through FR-044 and SC-011 through SC-012: one OpenCode native identity tool, exact 16-link ancestry, delegated authorization denial, fail-closed header grammar, identity-first bounded recovery, Claude compact checkpoint recovery, synchronized references, and exactly six MCP tools. No build, real-host setup, publication, archive, or real-home mutation occurred during the independent review.

## Real OpenCode structure

Authorized local setup converged:

- Host version: OpenCode `1.18.23`.
- Plugin provenance: `file:///C:/DEV/Proyectos/Webstorm/thoth-mem/dist/opencode.js`.
- Native entry exports only `default`; OpenCode no longer rejects non-plugin helper exports.
- Resolved MCP command: `node C:\DEV\Proyectos\Webstorm\thoth-mem\dist\index.js mcp --no-http`.
- Global Skill: `C:\Users\EremesNG\.config\opencode\skills\thoth-mem\SKILL.md`.
- Provider config: `C:\Users\EremesNG\.config\thoth-mem\config.json`.
- Shared data directory: `C:\Users\EremesNG\.thoth-mem-v2-local`.
- Setup receipt: `C:\Users\EremesNG\.config\opencode\.thoth-mem\opencode.json`.
- First setup: `complete`, `changed=true`; repeated setup: `complete`, `changed=false`.
- MCP from an unrelated CWD: PASS, exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
- `opencode debug config` and `opencode debug skill`: PASS for the plugin, MCP, and Skill paths above.

Native hook callbacks, root/delegated identity isolation, SQLite handle release, one tagged recovery tail, recovery deduplication, and unchanged `skills.paths` pass in focused tests. Real model consumption remains unobserved until the user-operated OpenCode smoke.

## Codex manager evidence

Disposable Codex `0.147.0` evidence:

- Local repository marketplace registration: PASS.
- `thoth-mem@thoth-mem` installed and enabled at version `0.4.13`: PASS.
- Independently reread marketplace/plugin state: PASS.
- Repeated setup: `complete`, `changed=false`, `restartRequired=false`.
- No private descriptor or manager-cache edit was used.

Current Codex home:

- `thoth-mem@personal`: removed successfully through `codex plugin remove`; no legacy duplicate remains.
- `thoth-mem@thoth-mem`: installed and enabled from `C:\DEV\Proyectos\Webstorm\thoth-mem\plugin`.
- Root cause found after restart: installed `plugin/.mcp.json` invoked `npx --yes thoth-mem@0.4.13`, so the host loaded the published legacy server rather than the checkout V2 server. The packed lifecycle shim had masked this missing real-MCP seam.
- Corrected installed descriptor: `node ./runners/public-runner.mjs --mcp` with plugin-relative `cwd: "."`.
- Corrected provider config: `dataDir=C:\Users\EremesNG\.thoth-mem-v2-local` and `runtimeEntry=C:\DEV\Proyectos\Webstorm\thoth-mem\dist\index.js`.
- Native `codex plugin add thoth-mem@thoth-mem --json` refreshed the installed bundle; no cache file was edited directly.
- Standalone execution from the installed cache enumerated exactly the six V2 tools and recalled marker `SC008-CROSS-HOST-NATIVE-20260825-B` with memory/evidence IDs `2e5186c9-66e6-5f7a-a3dc-107894b62eb9` / `bdcc936f-8af9-5d1d-a8c4-a5b68a299ce2`.
- After the final restart, the ambient Codex tool declarations required the V2 `project_key`/UUID contracts; progressive compact → context → `mem_get` recovery returned the same marker and stable IDs.
- Native manager reread: exactly one enabled `thoth-mem@thoth-mem`; repeated setup returned `complete`, `changed=false`, `restartRequired=false`.
- The reusable distribution root cause and PASS evidence were saved as memory `1588bc03-7c01-586a-a5d0-164f12de15c3` with evidence `b919d0ce-e4f0-5105-a557-7621e48f0e7b`, but that save was incorrectly left without session/harness attribution. The active Codex root identity is `01a03689-1203-71a2-bb94-0cb97b83840b`, confirmed independently by targeted `CODEX_THREAD_ID` lookup and one unambiguous active-task inventory entry for this repository. The earlier claim that the host exposed no stable identity is superseded and must not be used as certification evidence.
- The durable correction is memory `a7999201-f738-56a1-a5ba-c334c710d9a0` with evidence `586caa62-5ec1-56d5-a278-6efd1bde1943`, attributed to Codex root session `01a03689-1203-71a2-bb94-0cb97b83840b`; it explicitly supersedes the unscoped memory while preserving the failed decision in history.

Codex real-host certification is complete for manager resolution, exact MCP surface, shared-database recovery, model-visible tool use, and setup idempotency. Automatic host hook invocation remains evidenced by packed/native fixtures rather than a separately observable desktop callback.

## Claude Code structural evidence

- `claude plugin validate C:\DEV\Proyectos\Webstorm\thoth-mem` — PASS for the marketplace.
- `claude plugin validate C:\DEV\Proyectos\Webstorm\thoth-mem\plugin` — PASS for the plugin manifest.
- Packed isolated hooks, MCP, Skill, pinned runtime, provider data, and lifecycle runner — PASS.
- Paid Claude model session / model consumption — **RISK, intentionally unobserved**.

## Cross-host handoff evidence

Codex saved the source-attributed marker through the real six-tool MCP into the shared database:

- Marker: `SC008-CROSS-HOST-NATIVE-20260825-B`.
- Memory ID: `2e5186c9-66e6-5f7a-a3dc-107894b62eb9`.
- Evidence ID: `bdcc936f-8af9-5d1d-a8c4-a5b68a299ce2`.
- Evidence source: `codex:native-plugin-distribution-parity`.
- Topic: `certification/native-cross-host`.

Immediate Codex `mem_recall` returned the same memory/evidence IDs from the selected database. The deterministic fixture also proves Codex-seeded, source-attributed recovery through a new OpenCode session over one SQLite file.

### User-operated OpenCode outcome — SC-008 and SC-009 PASS

The user exported the successful OpenCode conversation to `C:\Users\EremesNG\Downloads\continuaci-n-de-certificaci-n-de-thoth-mem.json`; its SHA-256 is `3AA1E5C0CF5666B26221E82210EEDC8CDB935E852486FF2B1C84A7848024614F`. The bounded export contains one user prompt and the complete native tool trace:

- OpenCode `1.18.23`, project directory `C:\DEV\Proyectos\Webstorm\thoth-mem`, root/orchestrator session `ses_fc3e25805ffeLOGTYUojw01dhC`.
- Exact prompt: `Continúa con la certificación pendiente de thoth-mem usando únicamente la memoria persistente disponible.` Programmatic inspection confirms it contains neither marker A/B nor memory/evidence B IDs.
- `thoth_mem_root_identity` returned schema `thoth-mem.opencode.identity.v1`, matching root/caller IDs, project `thoth-mem`, caller role `root`, and `root_lifecycle` authorization.
- The first recalls using the incorrect key `thoth-mem` returned no items. `mem_project list` exposed the canonical shared-database key `path:C:/DEV/Proyectos/Webstorm/thoth-mem`; recall with that key recovered B memory `2e5186c9-66e6-5f7a-a3dc-107894b62eb9` / evidence `bdcc936f-8af9-5d1d-a8c4-a5b68a299ce2` and A memory `db64a1c3-e6f7-528c-ac67-6d5ec98812ef` / evidence `7a052fa7-0044-5e42-acac-c86e3bcff01b`.
- Four direct `mem_get` calls expanded both memories and both evidence records. The B evidence retains `sourceRef=codex:native-plugin-distribution-parity` and the same project ID `3d23ee40-3daa-5764-a72c-29e599ce6a26`, proving cross-host retrieval from the selected database rather than model recollection alone.
- The model used those absent-from-prompt records in its final answer and reported the marker, memory, and evidence pairs. This satisfies SC-008 model use and SC-009 stable-ID equality.
- OpenCode persisted provisional certification memory `1858e939-6e4e-5efa-ae54-71952a4c1ba6` / evidence `fd88062a-42a4-557f-a237-5eeeb5bd3be5`, then a read-only recovery-only Oracle returned PASS. The final attributed record is memory `0956d981-b8e0-50b3-a648-9ade249ef89b` / evidence `8ad08c9b-9376-52dc-a0c7-998a1f3229fd`, under the verified OpenCode session.
- The only filesystem read in the OpenCode trace was the installed global Skill reference `C:\Users\EremesNG\.config\opencode\skills\thoth-mem\references\opencode.md`; no repository, build, web, or runtime inspection supplied the recovered markers.

The nested OpenCode Oracle certified only prompt-free persistent-memory recovery and explicitly did not claim fresh runtime/build inspection. It complements but does not replace the mandatory outcome-aware SDD Oracle recorded below as T039.

### Independent Oracle round 6 — FINAL PASS

The mandatory final outcome-aware Oracle returned **PASS with no actionable blockers** for completeness, correctness, and coherence across FR-001 through FR-045 and SC-001 through SC-013.

- FR-001 through FR-009: PASS for complete native inventory, three-host hooks/MCP/Skills, OpenCode npm/file convergence, owned JSONC/Skill transactions, and retirement of copied activation.
- FR-010 through FR-020: PASS for package-relative literal Node lifecycle/MCP execution, packed inventory/smoke, explicit local provenance, truthful capability dimensions, native setup commands, shared runtime config, stable trailing recovery, zero-write plan/help, bounded mutations, and receipts.
- FR-021 through FR-041: PASS for manager-only Codex/Claude ownership, absent legacy behavior, Skill delivery, packed execution, restart recovery, cleanup/idempotency, isolated manager verification, rollback, version gates, and forced-capability checks.
- FR-042 through FR-045: PASS for the separate OpenCode identity tool, complete fail-closed identity grammar, synchronized host references, exact six MCP tools, and the Bun-adapter/package-relative-Node SQLite boundary.
- SC-001 through SC-007 and SC-010 through SC-013: PASS from focused tests, inventory verification, current compiled-graph inspection, recorded build/full-suite/packed smoke, Bun `1.3.10`, and prior independent convergence reviews.
- SC-008: PASS because the generic user prompt contained neither marker nor stable IDs; the OpenCode model recovered A/B through real `mem_recall`/`mem_get` calls and used them in its answer.
- SC-009: PASS because OpenCode retrieved the exact B and A memory/evidence pairs from canonical project key `path:C:/DEV/Proyectos/Webstorm/thoth-mem`; B retained Codex source attribution and the shared project ID.

Oracle independently matched the export SHA-256, verified OpenCode `1.18.23` root session `ses_fc3e25805ffeLOGTYUojw01dhC`, confirmed final memory `0956d981-b8e0-50b3-a648-9ade249ef89b` / evidence `8ad08c9b-9376-52dc-a0c7-998a1f3229fd`, ran 14 focused files with 76/76 tests, passed `integration:verify`, confirmed Node and Bun expose only the default plugin export with no compiled SQLite graph, passed ready validation and diff hygiene, and accepted the latest recorded build, full 120/120 suite, and packed Bun smoke. The nested OpenCode Oracle was correctly treated only as recovery evidence.

Residual risk `RISK-CLAUDE-MODEL`: paid Claude real-model consumption remains intentionally unobserved. It does not invalidate Claude structural SC-005 or any implementation requirement. The unrelated untracked `restore-native-bundle-activation` change remains outside archive scope.

## Observable capability matrix

| Host | Native resolution | Six-tool MCP | Hook delivery | Memory confirmed | Context delivered | Model used |
|---|---|---|---|---|---|---|
| OpenCode | PASS — local native file | PASS — ambient V2 trace | PASS — identity and lifecycle recovery | PASS — attributed saves | PASS — absent-from-prompt handoff | PASS — model reported stable markers/IDs |
| Codex | PASS — one native plugin | PASS — ambient V2 | PASS (packed/native fixture) | PASS — ambient V2 | PASS — ambient V2 | PASS — ambient tool result used |
| Claude Code | PASS (strict structure) | PASS (packed) | PASS (packed) | PASS (packed) | PASS (packed) | RISK — paid session unavailable |

## Remaining gates

1. Run the separately scheduled final outcome-aware Oracle check over repository, packed, real Codex, Claude structural, Bun-runtime, and exported OpenCode evidence.
2. Archive only after that final PASS; preserve paid Claude model use as an explicit residual RISK.
