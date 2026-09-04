# Implementation Plan: Native plugin distribution parity

## Technical context

The SQLite-first v2 core and exact six-tool MCP server are already bundled into `dist/index.js`; `package.json` currently points both `main` and the `thoth-mem` bin at that CLI/MCP entry. OpenCode assets live under `integrations/opencode/`, but their nested copied plugin is not natively resolved and its MCP command is caller-relative. Codex and Claude already have repository marketplace catalogs plus a shared public plugin root, although local Codex certification previously required a private descriptor correction and Claude lacks paid-session outcome evidence.

The primary reference is now sibling repository `C:/DEV/Proyectos/Webstorm/thoth-agents`. Its proven boundary is deliberately asymmetric: OpenCode loads a typed npm plugin from an exact package entry (and recognizes explicit `file://` development entries); the CLI synchronizes package-owned Skills into OpenCode's global native Skill root; Codex and Claude use their official marketplace/plugin managers; and host-specific activation remains separate from provider-owned runtime behavior. Repository `master`, Engram, and AgentMemory remain secondary evidence for memory lifecycle callback mapping. `oh-my-opencode-slim` contributes one additional bounded lesson: model-payload injection needs a tagged trailing region plus prefix-stability property tests or token-saving memory can accidentally destroy provider prompt-cache reuse.

The selected route remains Accelerated. The root agent owns implementation because the package entry split, setup/config transaction, native plugin, runtime configuration, and packaging tests share one ordered contract; separate writers would overlap `package.json`, build outputs, setup state, and integration inventory. Oracle remains the independent read-only plan reviewer and final verifier.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Native loading changes only registration and startup; the model-visible server remains exactly the existing six workflow tools.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Every host continues to use the deterministic SQLite-first core and no optional projection enters installation, lifecycle, or MCP startup.
- **P3 — Harness-Agnostic Memory Contract**: PASS — OpenCode, Codex, and Claude retain distinct native delivery mechanisms over one runtime configuration, lifecycle normalization, and memory service.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Native hooks use the shared bounded recovery result and supported host channels; distribution introduces no unbounded injected context.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The design intentionally removes the copied OpenCode bundle/bridge and rejects legacy filesystem fallback instead of preserving it.

## Design

### 1. Split the native OpenCode entry from the CLI/MCP entry

Add `src/integration/opencode/plugin.ts` as a typed `@opencode-ai/plugin` entry modeled on `thoth-agents/src/index.ts`. The build emits two independent artifacts:

- `dist/opencode.js`, referenced by `package.json#main`, exports the native OpenCode plugin and has no CLI side effect;
- `dist/index.js`, retained by `package.json#bin.thoth-mem`, starts setup/import/lifecycle commands or the stdio MCP server.

The native plugin resolves the CLI/MCP entry relative to its own `import.meta.url`, contributes one local MCP definition to OpenCode, and maps verified native session, root-message, system-transform, compaction, and finalization callbacks to the existing host-neutral lifecycle. It performs no retrieval or persistence logic of its own. Because OpenCode evaluates the plugin inside Bun, each SQLite-backed lifecycle operation is serialized as one host-neutral v2 event and sent over bounded JSON stdio to literal `node` plus the package-relative `dist/index.js lifecycle-v2` entry. Only that Node child loads `MemoryService` and `better-sqlite3`; the Bun artifact contains neither persistence graph nor native binding. Launch, timeout, nonzero exit, excess output, and invalid-envelope failures yield no verified lifecycle result and never reject the host callback. Model-visible startup and post-compaction context is rendered only from a validated bounded, source-attributed lifecycle recovery payload. A small cache-safe renderer owns one stable tag, removes only its previous tagged content, and appends recovery at the final supported payload position. Deterministic recovery reproduces identical bytes; changing recovery is confined to the trailing region. No timestamp, random value, request ID, or other volatile metadata is injected ahead of that tail.

OpenCode's `config` hook does not add a second host MCP block and does not try to expose a package-relative Skill path. The Skill is a setup-owned global native asset because the proven OpenCode npm loader does not discover relative Skills.

### 2. Resolve one provider-owned runtime configuration

Implement a small schema-backed runtime config loader using the existing v2 `config.schema.json` vocabulary. The one provider-owned global path is `${XDG_CONFIG_HOME:-<home>/.config}/thoth-mem/config.json` on every supported platform. It is strict JSON: absence means no persisted override, while an unreadable, malformed, schema-invalid, linked/non-file value fails closed with a bounded diagnostic. Data-directory precedence is:

1. explicit CLI/MCP argument;
2. `THOTH_MEM_DATA_DIR`;
3. the provider-owned global config `dataDir`;
4. the existing `~/.thoth-mem` default.

`setup --data-dir` preserves all other schema-valid provider fields and writes only `dataDir`: create the parent directory, stage a sibling temporary file, atomically rename it, and restore only this provider-owned file after handled failure. Explicit local Codex/Claude setup atomically adds a validated absolute `runtimeEntry` for the checkout-built `dist/index.js`; public manager setup clears it. Both hook and MCP descriptors enter through the same root-relative runner, which selects that local entry or the pinned public package before the shared runtime validates the provider config. Native OpenCode hooks and MCP, local Codex/Claude runners, and direct CLI lifecycle therefore resolve one core and database without editing manager caches.

### 3. Replace copied OpenCode activation with exact npm/file provenance

Replace generic `setup-v2 --harness --target` as the product setup path with the canonical first-product commands `setup opencode`, `setup codex`, and `setup claude`. Backward compatibility is intentionally not retained.

OpenCode setup has two explicit modes:

- public mode derives the executing semantic version and converges one `thoth-mem@<version>` entry;
- local mode requires `--local-package <root>`, verifies that package identity, build output, and native entry exist, then converges one canonical absolute `file://.../dist/opencode.js` entry.

Both modes select the documented global OpenCode JSON/JSONC configuration, use `jsonc-parser` edits to preserve comments and unrelated values, remove only exact thoth-mem npm/file entries, and synchronize `integrations/opencode/skills/thoth-mem` to the global native `skills/thoth-mem` tree. They do not create `.thoth-mem`, `plugins/thoth-mem.js`, or `mcp.thoth-mem` host configuration.

The shared native transaction records only the prior exact plugin entries, the prior owned Skill tree identity, an explicit provider-config change, or an ordered native-manager plan and its independently verified pre-state. It checkpoints a secret-free receipt before the first owned filesystem mutation or manager command, then records each bounded outcome and verification result. It stages the Skill tree, validates links and paths, backs up only existing owned values, and restores those values in reverse order after handled filesystem failure. Unknown copied assets are reported as manual cleanup context and are never deleted from name/path alone. Exact convergence performs zero writes.

The prior copied product surface is retired rather than left dormant. `src/setup/install.ts` and its `setup-v2` CLI wiring are removed after replacement tests fail against the old behavior. The copied OpenCode manifest, bridge, MCP descriptor, hooks, and runner under `integrations/opencode/` are deleted while its canonical `skills/thoth-mem` source is retained. `src/integration/package-inventory.ts` and `integrations/inventory.json` are updated together so neither runtime validation nor packed verification can continue declaring obsolete bridge assets. The existing first-product packaging test and both copied-canary tests are repurposed to assert the native dependency/build inventory and packed isolation instead of being dropped or leaving parallel old expectations.

### 4. Keep Codex and Claude manager-native

Codex and Claude setup follow the command/inspection structure proven in `thoth-agents` but substitute `EremesNG/thoth-mem` and `thoth-mem@thoth-mem`. Command construction and parsing are injected for tests; public setup invokes only supported native manager commands, verifies marketplace and enabled plugin state independently, and never writes manager caches directly or falls back to copied assets.

Manager setup uses the same receipt/checkpoint lifecycle as OpenCode. On interruption or a later restart, it rereads the exact marketplace and enabled-plugin state, reconciles that evidence with the ordered receipt, and resumes only safe outstanding operations. Rollback may invoke a scoped manager removal only when the receipt proves setup created that exact state and the manager exposes independently verifiable removal; otherwise it preserves manager state and returns bounded manual action. Temporary manager-attempt state is cleaned after verified completion, while a minimal final receipt remains; cleanup failure degrades reporting and is retried before a later no-op without converting a verified installation into failure.

The existing repository marketplaces and shared `plugin/` root remain the canonical Codex/Claude distribution. Their portable runner resolves the pinned public package for released installs and the provider-owned verified checkout entry only for explicit local provenance. `.mcp.json` launches that runner relative to the installed plugin instead of bypassing it with `npx`. Inventory generation/verification must keep manifest versions, hooks, MCP descriptor, Skill, runner, and runtime metadata synchronized.

Claude's installed CLI can prove manifest and marketplace acceptance without a paid model call. Verification therefore reports manager/asset resolution, MCP startup, lifecycle execution, memory confirmation, context rendering, and model use separately; only the last real-session dimension remains `RISK`.

### 5. Test native resolution rather than copied assets

TDD begins by rewriting the existing first-product packaging test to require the proven dependency set, separate native main and CLI/MCP bin outputs, retained Skill source, and no copied OpenCode activation. It also adds native plugin callback/config tests and, before copied implementation is retired, rewrites both legacy copied-canary suites to require native inventory, no `setup-v2`, no copied bridge/runtime assets, and packed isolation. All three rewritten suites therefore fail on the current topology. Manager tests use injected Codex/Claude executors and disposable homes. Packed smoke imports `main` under the supported Bun runtime as OpenCode would, executes the Node bin independently, enumerates exactly six MCP tools, and exercises lifecycle persistence plus recovery from paths with spaces and unrelated CWDs. The workflow provisions the same Bun line used by the smoke so release verification cannot silently fall back to Node-only plugin execution.

After repository checks pass, the authorized real OpenCode home is converged to the local `file://` entry and explicit shared data directory, then verified through `opencode debug config`, plugin/MCP resolution, Skill discovery, and cache-safe recovery without printing secrets. Codex regression evidence is rerun without private descriptor mutation. Claude receives strict structural verification only. Codex then seeds the unique handoff and the user attempts prompt-free OpenCode recovery; only after that real SC-008/SC-009 outcome is recorded does a fresh Oracle perform mandatory final verification.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Publish one native OpenCode main plus native Codex/Claude marketplace assets over the same package. | `package.json`, `scripts/build.mjs`, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json` | Packed inventory imports/validates all three host entries. |
| FR-002 | Compose OpenCode MCP/hooks in a typed plugin; retain native bundle hooks/MCP/Skill for Codex/Claude. | `src/integration/opencode/plugin.ts`, `src/integration/adapters/v2.ts`, `plugin/` | Native-shaped callback tests and package validators reach one lifecycle core. |
| FR-003 | Converge one exact npm or explicit file plugin entry and one native Skill tree; remove copied topology from desired state. | `src/setup/opencode.ts`, `src/cli.ts` | Disposable public/local setup resolves one entry and no copied bridge/MCP block. |
| FR-004 | Compare exact thoth-mem entries and owned Skill tree; preserve unproven/third-party state. | `src/setup/opencode.ts` | Drift, duplicate, same-version, and ambiguous-asset tests. |
| FR-005 | Use deterministic config precedence and JSONC edit operations. | `src/setup/opencode-config.ts` | Comments/trailing commas/unrelated entries remain byte-stable outside managed edits. |
| FR-006 | Journal only the exact plugin entries, owned Skill tree, and provider config before mutation. | `src/setup/transaction.ts` | Failure injection restores the prior owned values without whole-root rollback. |
| FR-007 | Synchronize and hash the canonical Skill into OpenCode's global native root. | `src/setup/opencode-skills.ts` | Missing, stale, extra, and linked owned Skill fixtures classify correctly. |
| FR-008 | Restore/remove only receipt-owned thoth-mem config and Skill state. | `src/setup/transaction.ts`, `src/setup/opencode-skills.ts` | Rollback preserves sibling Skills and later unrelated JSONC edits. |
| FR-009 | Delete copied OpenCode bundle activation from installer, hard-coded inventory, integration assets, and retained tests while preserving the canonical Skill source. | `src/setup/install.ts`, `src/integration/package-inventory.ts`, `integrations/opencode/`, `integrations/inventory.json` | Repurposed canary and package tests reject `setup-v2`, copied bridge/runner assets, `.thoth-mem`, or host MCP config. |
| FR-010 | Keep the OpenCode adapter in Bun while routing SQLite lifecycle work to literal Node through the package-relative entry; retain the portable Codex/Claude runner. | `src/integration/opencode/plugin.ts`, `plugin/runners/public-runner.mjs` | Unrelated-CWD packed Bun smoke succeeds without receipt or child `npx`, and the Bun artifact contains no native SQLite graph. |
| FR-011 | Emit/import native main and CLI bin plus complete manager bundles in the tarball. | `scripts/build.mjs`, `package.json`, `scripts/verify-integration-package.mjs` | Tarball verifier finds no checkout escape and both entries execute independently. |
| FR-012 | Exercise npm/file convergence, Skill sync, native import, MCP, hooks, and manager packages from disposable artifacts. | `scripts/verify-packed-plugins.mjs` | Packed smoke reports every observable host dimension independently. |
| FR-013 | Require explicit verified package root for local file provenance and expose it in resolved OpenCode state. | `src/setup/opencode.ts` | Real/disposable OpenCode config resolves the exact local build before smoke. |
| FR-014 | Use a structured certification matrix with no inferred model-use PASS. | `openspec/changes/native-plugin-distribution-parity/verify-report.md` | Claude model use and user-operated cross-host outcomes remain RISK until observed. |
| FR-015 | Provide only the three first-product native setup commands, plan/JSON controls, and no legacy fallback. | `src/cli.ts`, `src/setup/native-manager.ts` | CLI help/parser and injected manager tests match the public command contract. |
| FR-016 | Resolve data directory through one shared loader and persist explicit provider config outside host caches. | `src/config/runtime.ts`, `config.schema.json` | MCP and lifecycle in every fixture open the same selected SQLite file after restart. |
| FR-017 | Render native recovery through one tagged trailing region and enforce stable-prefix invariants. | `src/integration/opencode/plugin.ts` | Property tests prove unchanged prefixes and one deduplicated trailing recovery block. |
| FR-018 | Replace legacy/project plan content with exact zero-write native provenance, Skill/config, manager, verification, and restart actions. | `src/cli.ts` | Plan fixtures observe no filesystem write, manager mutation, backup, or receipt. |
| FR-019 | Limit mutation to exact OpenCode entries/Skill/provider config or native manager commands. | `src/setup/opencode.ts`, `src/setup/native-manager.ts` | Ambiguous/copied/unrelated state is preserved and no duplicate MCP config appears. |
| FR-020 | Persist one secret-free native ownership receipt with ordered mutation and verification evidence. | `src/setup/transaction.ts` | Failure/recovery tests inspect exact owned evidence and reject secret/unrelated payloads. |
| FR-021 | Permit only verified Codex plugin-manager strategy and fail closed otherwise. | `src/setup/native-manager.ts` | Capability fixtures never select or emulate legacy filesystem setup. |
| FR-022 | Remove automatic Codex dual-owned legacy migration. | `src/setup/native-manager.ts` | Residue yields bounded manual guidance and zero legacy deletion/adoption. |
| FR-023 | Remove legacy Codex freshness/shim/content identity. | `src/setup/native-manager.ts` | Status derives only from exact native marketplace and enabled-plugin evidence. |
| FR-024 | Synchronize OpenCode's global Skill and retain native bundled Skills for Codex/Claude. | `src/setup/opencode-skills.ts`, `plugin/skills/thoth-mem/SKILL.md` | Each host exposes one complete Skill without overwriting unrelated Skills. |
| FR-025 | Remove runtime mutation of OpenCode skills.paths. | `src/integration/opencode/plugin.ts` | Native config-hook tests leave skills.paths byte-for-byte unchanged. |
| FR-026 | Preserve all user Skill configuration and sibling trees. | `src/setup/opencode-skills.ts` | Sync/rollback fixtures mutate only the exact thoth-mem Skill tree. |
| FR-027 | Replace setup-v2 canary smoke with packed native main/bin, npm/file, Skill, manager, lifecycle, and MCP smoke. | `scripts/verify-packed-plugins.mjs` | Disposable verification uses packed files and never a real home or public checkout escape. |
| FR-028 | Recover only validated in-progress native owned state and never follow untrusted receipt paths. | `src/setup/transaction.ts` | Interrupted/invalid-receipt fixtures restore or discard safely before retry. |
| FR-029 | Remove temporary rollback state after success while retaining minimal final ownership evidence. | `src/setup/transaction.ts` | Successful verification leaves no usable temporary backup/journal and status remains inspectable. |
| FR-030 | Separate verified installation from bounded temporary-cleanup degradation. | `src/setup/transaction.ts` | Cleanup failure reports complete plus warning and later retries cleanup without rollback. |
| FR-031 | Render plan/human/JSON native evidence and restart actions consistently. | `src/cli.ts` | Snapshot/semantic CLI tests agree for changed, no-op, unsupported, and failed states. |
| FR-032 | Define idempotency only over independently verified first-product native state. | `src/setup/opencode.ts`, `src/setup/native-manager.ts` | Repeated OpenCode and manager setup changes zero bytes/state and reports `changed=false`; no legacy identity is consulted. |
| FR-033 | Keep Codex marketplace and plugin operations independently checkpointed and verified with no fallback. | `src/setup/native-manager.ts` | Injected mixed-outcome tests prove truthful partial/requires-user-action results and no cache/copied mutation. |
| FR-034 | Replace obsolete project/0.144.0 verification with disposable global/user `0.147.0` manager contracts. | `tests/setup/native-managers.test.ts` | Automated tests reject real homes and use only injected commands/disposable state; real smoke is separately authorized. |
| FR-035 | Bound rollback to receipt-owned files or receipt-proven safe manager removal. | `src/setup/transaction.ts`, `src/setup/native-manager.ts` | Restart/rollback tests preserve ambiguous/pre-existing manager state and remove only exact proven setup-created state. |
| FR-036 | Keep Codex manager operations independent and exact rereads authoritative while replacing obsolete version/package fixtures. | `src/setup/native-manager.ts`, `tests/setup/native-managers.test.ts` | Codex 0.147.0 and executing-package fixtures cover nonzero-then-verified, mixed, and failed outcomes without project or legacy fallback. |
| FR-037 | Preserve Claude coexistence while removing copied-fragment migration/adoption from the first product. | `src/setup/native-manager.ts` | Manual/external/ambiguous residue remains untouched and only receipt-proven manager operations can be reconciled. |
| FR-038 | Treat only exact global/user manager inspection as Codex authority and remove project-scope verification. | `src/setup/native-manager.ts` | Hidden residue, another disposable home, and command text never satisfy selected-home registration or ownership. |
| FR-039 | Support unforced Codex 0.147.x and fail closed or require proven force capability for other versions, never legacy behavior. | `src/setup/native-manager.ts` | Version/capability fixtures prove safe 0.147.x mutation and zero legacy selection for future absent state. |
| FR-040 | Emit one bounded override warning only when complete safe capabilities let a forced non-0.147.x version bypass the gate; otherwise fail closed with a capability diagnostic. | `src/setup/native-manager.ts`, `src/cli.ts` | Human/JSON fixtures distinguish successful override from incomplete/unsafe capability failure without changing evidence-derived status. |
| FR-041 | Verify supported, unforced-fail-closed, and proven-force version paths only through injected disposable execution. | `tests/setup/native-managers.test.ts` | 0.147.x unforced, 0.146.x/future unforced, and forced complete/incomplete/unsafe matrices run without project or real-home access. |
| FR-042 | Restore the previously verified OpenCode-native identity tool without changing MCP registration. | `src/integration/opencode/plugin.ts` | Public plugin tests assert exact root/delegated/degraded JSON, depth/cycle bounds, zero lifecycle dispatch, and exactly one native identity tool. |
| FR-043 | Carry already normalized lifecycle identity into bounded host-visible recovery output. | `src/integration/opencode/plugin.ts`, `plugin/runners/public-runner.mjs` | OpenCode transform plus Codex/Claude host-shaped runner tests assert complete identity-first output, context-only truncation, and fail-closed overlong identity. |
| FR-044 | Restore the approved per-host discovery procedures and synchronize public copies. | `integrations/*/skills/thoth-mem/references/*.md`, `plugin/skills/thoth-mem/references/*.md`, `scripts/sync-plugin-distribution.mjs` | Content and distribution tests assert authoritative sources, rejection lists, V2 mapping, and byte-identical generated copies. |
| FR-045 | Add a Bun-safe bounded lifecycle client that validates the Node CLI envelope and degrades without breaking the host. | `src/integration/opencode/plugin.ts`, `src/integration/opencode/node-lifecycle-client.ts` | Unit failures cover launch/timeout/exit/output/parse paths; packed Bun smoke persists and recovers through Node. |
| SC-001 | Build/import OpenCode main separately from executable CLI bin. | `tests/packaging/first-product.test.ts` | Repurposed package assertions require the native dependency set/two outputs; plugin tests register six-tool MCP/hooks and bin help/MCP remains executable. |
| SC-002 | Run public/local setup twice against commented JSONC and owned Skill drift. | `tests/setup/native-opencode.test.ts` | Exact entries/Skill converge and the second run changes zero bytes. |
| SC-003 | Query installed OpenCode `1.18.23` from unrelated CWD. | `openspec/changes/native-plugin-distribution-parity/verify-report.md` | Resolved local plugin, six tools, Skill, hooks, runtime, and data directory are recorded. |
| SC-004 | Recheck Codex `0.147.0` native manager install and restart recovery. | `tests/setup/native-managers.test.ts` | Disposable manager plus real regression require no private descriptor edit. |
| SC-005 | Run Claude `2.1.198` strict and isolated packed checks. | `scripts/verify-packed-plugins.mjs` | Structural dimensions pass and paid-session model use remains RISK. |
| SC-006 | Inject config, Skill, provider-config, manager, and verification failures. | `tests/setup/native-opencode.test.ts`, `tests/setup/native-managers.test.ts` | Exact owned state restores; unrelated state survives; false activation is rejected. |
| SC-007 | Inspect package/tarball/disposable homes for forbidden provenance and duplicated activation. | `tests/packaging/first-product.test.ts` | No checkout path, private descriptor, CWD dependency, copied per-harness OpenCode asset, or duplicated activation remains. |
| SC-008 | Seed a unique Codex handoff and require prompt-free native OpenCode use. | `openspec/changes/native-plugin-distribution-parity/verify-report.md` | Remains RISK until the user observes the model continuing from recovered context. |
| SC-009 | Compare stable IDs from the explicit shared SQLite database. | `openspec/changes/native-plugin-distribution-parity/verify-report.md` | Remains RISK until the real OpenCode session retrieves Codex-seeded IDs. |
| SC-010 | Run repeated native model-payload transforms with stable and changing recovery. | `tests/integration/opencode-native-plugin.test.ts` | Stable prefixes remain byte-identical and all changing bytes stay in one tagged tail. |
| SC-011 | Invoke the public OpenCode native tool independently from MCP. | `tests/integration/opencode-native-plugin.test.ts`, `tests/integration/package-v2.test.ts` | One versioned identity tool passes its authorization/failure matrix while the shared MCP list remains exactly six. |
| SC-012 | Exercise identity-aware recovery through all three host output seams. | `tests/integration/opencode-native-plugin.test.ts`, `tests/integration/public-plugin-runner.test.ts`, packaging tests | Complete identity appears before bounded context and detailed references survive synchronization and packing. |
| SC-013 | Execute the installed native main under Bun and the lifecycle core under Node. | `scripts/verify-packed-plugins.mjs`, `.github/workflows/ci.yml`, `.github/workflows/release.yml` | Checkpoint recovery succeeds through the package-relative child and child failure remains host-safe without false injection. |

## Optional support artifacts

- `research.md`: Not needed; decisive sibling-project and repository evidence is bounded and recorded in this plan.
- `data-model.md`: Not needed; SQLite schema and memory records do not change.
- `contracts/`: Not needed; the native entry, setup, lifecycle, and marketplace contracts are expressed as declared durable deltas to existing canonical specs.
- `quickstart.md`: Not needed; existing README/installation documentation will be updated after behavior is verified.

## Risks and migrations

- Changing `package.json#main` from the CLI/library entry to the native OpenCode plugin is intentionally breaking. Mitigation: keep the CLI in `bin`, expose explicit library subpaths only if current tests demonstrate a first-product need, and document the break rather than adding compatibility dispatch.
- OpenCode's typed plugin package may differ from the installed host patch level. Mitigation: use the API shape already proven by local `thoth-agents`, pin a compatible type package, and verify against installed OpenCode `1.18.23` before model smoke.
- Native lifecycle hooks can accidentally load Node-native SQLite inside Bun or keep SQLite handles alive. Mitigation: keep the Bun adapter dependency graph persistence-free, execute each operation in a bounded package-relative Node child, prove actual packed Bun recovery, and retain Node-side handle release tests.
- Recovery injection can invalidate provider prompt caches and erase expected token savings. Mitigation: one stable tag, strip-before-append ownership, trailing-only volatility, no dynamic metadata in stable content, and property tests over the real transform composition.
- JSONC and global Skill mutation can damage unrelated state. Mitigation: structural JSONC edits, exact package predicates, a dedicated owned Skill directory, link rejection, target-bounded journaling, and failure-injection tests.
- A malformed provider config could silently redirect hosts to different databases. Mitigation: one exact cross-platform path, strict schema-v2 JSON, fail-closed runtime/setup behavior, atomic single-file updates, and focused persistence/restart tests before runner changes.
- Public and local OpenCode provenance can be confused. Mitigation: mutually exclusive modes, explicit local package root verification, canonical file URLs, no fallback, and resolved-state reporting.
- Codex/Claude native manager grammars and trust remain host-owned. Mitigation: injected command contracts, independent post-command inspection, no direct cache edits, no copied fallback, and real mutation only within explicit authorization.
- Codex/Claude portable public runners may still use the pinned npm package while OpenCode runs its adapter in Bun and its memory core in a package-relative Node child. This is intentional host asymmetry, not separate memory behavior; packed tests compare the same core/lifecycle version and six-tool contract.
- Claude structural success cannot prove model consumption. Mitigation: keep the paid-session dimension `RISK` and record no inferred PASS.
- Existing inert OpenCode files are not automatically deleted because path/name is insufficient ownership. The previously verified old-v1 removal is complete; the current receipt-owned inert v2 directory can be removed later only through exact local evidence or explicit user authorization.
- Removing repository-owned copied OpenCode assets can leave stale documentation or tests that falsely describe support. Mitigation: repurpose the first-product packaging test and both copied-canary suites before removal, update runtime and JSON inventories together, refresh `docs/agent/native-lifecycle.md`, and require full-suite plus packed-smoke success.
- The v2 rewrite incorrectly treated the native OpenCode identity tool as a seventh MCP tool and dropped the model-visible identity header even though both had prior Oracle PASS. Mitigation: keep the registries distinct in code and tests, reuse the bounded versioned OpenCode contract, propagate only already verified lifecycle identity, and reject invented host fallbacks.
- No database migration is required. The existing v2 database remains authoritative and provider configuration selects it without modifying its content.

## Convergence implementation ownership

- **Owner**: adaptive root.
- **Net-gain rationale**: the correction is one ordered, compatibility-coupled chain across the already loaded native plugin, shared runner, generated Skill copies, SDD evidence, and focused tests; delegating a writer would duplicate discovery and risk overlapping the active distribution diff. Independent judgment remains delegated to a fresh Oracle.
- **Mutable surface**: `src/integration/opencode/plugin.ts`; host identity references under `integrations/` and `plugin/`; `plugin/runners/public-runner.mjs`; focused integration/packaging tests; synchronization/verification scripts only if their declared mappings require change; this change's SDD reports.
- **Accepted scope**: FR-042 through FR-044 and SC-011 through SC-012, preserving FR-002, FR-014, FR-017, and the exact six MCP tools.
- **Non-goals**: no seventh MCP tool, database migration, vector/graph restoration, Claude environment convention, publication, or paid Claude model use.
- **Checks**: focused OpenCode plugin, public runner, package-v2, and distribution suites first; then build, full tests, `integration:verify`, `integration:smoke`, and `git diff --check`; final approval belongs to a fresh Oracle.

## Bun-runtime convergence implementation ownership

- **Owner**: adaptive root.
- **Net-gain rationale**: the defect spans one tightly ordered dependency boundary between the already loaded native plugin, its package-relative executable, packed smoke, and release gate. Keeping one writer avoids conflicting changes to the active OpenCode entry while a fresh Oracle supplies independent verification.
- **Mutable surface**: OpenCode lifecycle client/plugin source, its focused tests, packed verification, Bun provisioning in CI/release, and this change's SDD reports.
- **Accepted scope**: FR-010, FR-012, FR-045, and SC-013 while preserving the exact six MCP tools, identity-only native tool, provider configuration, and shared v2 database.
- **Non-goals**: replacing SQLite with `bun:sqlite`, adding an HTTP daemon, changing the database schema, restoring legacy compatibility, publishing, or certifying paid Claude model use.
- **Checks**: TDD red under actual Bun first; focused child-boundary and native-plugin tests; build; packed smoke under Bun; full tests; inventory verification; diff hygiene; then fresh Oracle verification before the user retries OpenCode.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — All hosts expose the same exact six MCP tools; OpenCode additionally exposes one bounded host-native identity-only tool that performs no memory workflow or persistence operation and is not part of the MCP registry.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The design changes only distribution/configuration; lifecycle and MCP resolve one deterministic SQLite core with optional projections still absent from activation.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Host-native package/manager differences terminate in one runtime config, adapter, lifecycle, and memory contract with outcome parity tested explicitly.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — OpenCode native injection and portable runner output both consume the shared bounded recovery result; explicit MCP escalation remains unchanged.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The copied OpenCode bundle and legacy setup fallback are declared removed, native host ownership is explicit, and no compatibility layer is introduced for the old main entry.
