# Verification Report: Native Multi-Harness Parity

## Round

round 2

## Completeness

- All 36 tasks in `tasks.md` are checked complete.
- All 27 delta requirements have implementation and test coverage.
- All 90 Given/When/Then scenarios across the four domains are compliant.
- Round-1 warnings W1 and W2 are remediated with executable evidence.
- The requirements-quality checklist is complete with no waivers or unresolved clarification markers.
- No generated `dist/` file was edited directly.
- The current diff contains no change outside the thoth-mem workspace; Engram and thoth-agents remain reference-only.
- The round-2 remediation did not change production behavior: it aligned the authoritative packed Claude fixture with the accepted unqualified command and added real POSIX execution evidence.

## Build and Test Evidence

- Focused Phase 5 validation: 79/79 passed.
- Core lifecycle gate: 45/45 passed.
- Adapter/hook gate: 21/21 passed.
- Setup gate: 117 passed, with one expected POSIX file-mode test skipped on Windows.
- Windows package inventory/packed-install gate after W1 remediation: 17/17 passed.
- Final `pnpm test && pnpm run prepublishOnly`: exit 0.
  - Both full-suite runs: 60/60 files, 828 passed, one expected POSIX-only skip.
  - Prepublish rebuilt through `tsc --noEmit`, Node 18 bundling, native asset verification, dashboard build, and the full test suite.
- Round-1 independent Oracle checks:
  - `pnpm run integration:verify`: exit 0; 15 assets verified for Claude, Codex, and OpenCode.
  - Adapter, Codex CLI, inventory, and six-tool registry sample: 4 files, 39/39 tests passed.
  - `git diff --check`: exit 0.
  - WebStorm diagnostics: zero errors in lifecycle, state, runtime, setup, CLI, index, and server anchors.
- Round-2 independent Oracle checks:
  - Exact Windows Claude smoke: `tests/packaging/packed-install.test.ts -t "accepted unqualified Claude plugin"` — exit 0, 1 passed, 6 skipped.
  - The fixture resolves `thoth-mem` through the previously added marketplace, validates marketplace/plugin identities, installs from the packed source, and runs the packed hook runner.
  - WebStorm diagnostics for `tests/packaging/packed-install.test.ts`: zero errors.
  - Post-check Windows `git status --short` is byte-identical to the pre-check state.
- POSIX remediation evidence:
  - Ubuntu 24.04.4 WSL2 x86_64, Linux 6.6.87.2, Node 22.22.1, project pnpm 11.1.3.
  - Repository copied to an isolated native `/tmp/.../repo with spaces` path.
  - Commands executed under `env -i`; after the expected offline cache miss, installation used the public-registry fallback without inherited credentials.
  - Exact hook test: exit 0, 1 passed, 12 skipped.
  - Exact packed-install suite: exit 0, 7/7 passed, including the unqualified Claude install.
  - Guarded cleanup completed and the Windows worktree status remained unchanged.
- Packed-install tests create the actual npm tarball, install it with scripts disabled in isolated homes containing spaces, clear credential-like environment variables, and execute packed entrypoints and runners from unrelated working directories.

## Compliance Matrix

### Harness Integration

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| H1 | Equivalent supported events produce equivalent lifecycle outcomes | PASS | `tests/integration/lifecycle.test.ts:180`; `tests/integration/adapters.test.ts:30` |
| H2 | Harness-specific event data does not enter the memory contract | PASS | `tests/integration/lifecycle.test.ts:180`; `src/integration/core/types.ts:31` |
| H3 | Supported capabilities identify their native trigger | PASS | `tests/integration/adapters.test.ts:30`, `:197`, `:306` |
| H4 | Missing capability is explicit | PASS | `tests/integration/adapters.test.ts:30`, `:197`, `:306` |
| H5 | Unknown harness version fails closed | PASS | `tests/integration/adapters.test.ts:30`, `:197` |
| H6 | Genuine root-user prompt is captured once | PASS | `tests/integration/lifecycle.test.ts:280`, `:928` |
| H7 | Intentional identical repetition inside the window reuses the canonical row | PASS | `tests/integration/lifecycle.test.ts:928`; `tests/store/context.test.ts:152` |
| H8 | Intentional identical repetition after the window follows existing Store behavior | PASS | `tests/store/context.test.ts:152`; core lifecycle gate |
| H9 | Delegated or generated traffic is excluded | PASS | `tests/integration/lifecycle.test.ts:280`; `tests/integration/adapters.test.ts:325` |
| H10 | Valid private content is removed | PASS | `tests/integration/lifecycle.test.ts:280`; `tests/utils/privacy.test.ts:41` |
| H11 | Malformed private tags fail closed | PASS | `tests/integration/lifecycle.test.ts:280`, `:372` |
| H12 | Fully private prompt creates no content leak | PASS | `tests/integration/lifecycle.test.ts:280` |
| H13 | Overlong sanitized prompt is truncated deterministically | PASS | `tests/integration/lifecycle.test.ts:280`, `:372` |
| H14 | Explicit stable identity is propagated | PASS | `tests/store/identity.test.ts:124`, `:207` |
| H15 | Missing identity degrades deterministically | PASS | `tests/store/identity.test.ts:124`, `:207` |
| H16 | Sub-agent identity cannot take root ownership | PASS | `tests/store/identity.test.ts:124`; `tests/integration/adapters.test.ts:325` |
| H17 | Failed session start remains retryable | PASS | `tests/integration/lifecycle.test.ts:928` |
| H18 | Successful retry advances once | PASS | `tests/integration/lifecycle.test.ts:928` |
| H19 | Failed finalization is not marked complete | PASS | Generic confirmed-success failure path in `src/integration/core/lifecycle.ts:351`; terminal commit only at `src/integration/core/lifecycle.ts:590`; exercised failure path at `tests/integration/lifecycle.test.ts:928` |
| H20 | Duplicate prompt event persists one record | PASS | `tests/integration/lifecycle.test.ts:928`, `:1093` |
| H21 | Duplicate terminal event is a no-op | PASS | Generic confirmed-event guard at `src/integration/core/lifecycle.ts:369`; terminal mapping at `tests/integration/lifecycle.test.ts:180` |
| H22 | Missing stable event evidence degrades cross-restart idempotency | PASS | `tests/integration/lifecycle.test.ts:540`; `src/integration/core/lifecycle.ts:342` |
| H23 | Confirmed prompt remains deduplicated after restart | PASS | `tests/integration/lifecycle.test.ts:540`, `:928` |
| H24 | Unconfirmed operation is retried after restart | PASS | `tests/integration/lifecycle.test.ts:540`, `:734`, `:797` |
| H25 | Supported compaction is confirmed | PASS | `tests/integration/lifecycle.test.ts:180`; shared executor at `src/integration/core/lifecycle.ts:351` |
| H26 | Compaction failure remains visible | PASS | Shared failed-effect path at `src/integration/core/lifecycle.ts:478`, `:559`; adapter/hook gate |
| H27 | Supported finalization completes once | PASS | `tests/integration/lifecycle.test.ts:180`; `tests/integration/adapters.test.ts:325`; terminal commit at `src/integration/core/lifecycle.ts:590` |
| H28 | Unsupported terminal event is not simulated | PASS | `tests/integration/adapters.test.ts:76`, `:197`, `:325` |
| H29 | One degraded capability does not disable supported capabilities | PASS | `tests/integration/adapters.test.ts:30`, `:176`, `:197` |
| H30 | Diagnostic omits sensitive content | PASS | `tests/integration/adapters.test.ts:176`; `tests/integration/hook-command.test.ts:158`, `:213` |

### CLI

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| C1 | OpenCode setup defaults to global scope | PASS | `tests/setup/engine.test.ts:100`, `:455`; packed smoke `tests/packaging/packed-install.test.ts:570` |
| C2 | Codex setup defaults to global scope | PASS | `tests/setup/engine.test.ts:100`, `:455`; packed smoke `tests/packaging/packed-install.test.ts:771` |
| C3 | Explicit project scope stays inside the target project | PASS | `tests/setup/engine.test.ts:455`, `:697`; packed smoke `tests/packaging/packed-install.test.ts:570`, `:771` |
| C4 | Project scope without a target is rejected before mutation | PASS | `tests/setup/engine.test.ts:100`; `tests/cli.test.ts:249` |
| C5 | Plan-only on a clean target writes nothing | PASS | `tests/setup/engine.test.ts:488`; packed smoke `tests/packaging/packed-install.test.ts:570` |
| C6 | Plan-only reports conflicts without forcing them | PASS | `tests/setup/engine.test.ts:637`; `tests/setup/codex-cli.test.ts:577` |
| C7 | Plan-only unresolved conflict requires action | PASS | `tests/setup/engine.test.ts:637` |
| C8 | Unrelated settings survive setup | PASS | `tests/setup/engine.test.ts:758`, `:878` |
| C9 | Managed conflict is refused without force | PASS | `tests/setup/engine.test.ts:637`, `:812`, `:905` |
| C10 | Force replaces only the managed conflict | PASS | `tests/setup/engine.test.ts:812`, `:905`; rollback receipt tests |
| C11 | Successful mutation produces backups and verification | PASS | `tests/setup/engine.test.ts:994`; `tests/setup/rollback.test.ts:177` |
| C12 | Write failure does not leave false success | PASS | `tests/setup/engine.test.ts:1070`; `tests/setup/rollback.test.ts:570`, `:699` |
| C13 | Complete setup emits a usable receipt | PASS | `tests/setup/rollback.test.ts:177` |
| C14 | Failed mutating attempt remains auditable | PASS | `tests/setup/rollback.test.ts:570`, `:590`, `:610` |
| C15 | Interrupted setup remains recoverable | PASS | `tests/setup/rollback.test.ts:248` |
| C16 | Rollback restores prior managed state | PASS | `tests/setup/rollback.test.ts:464` |
| C17 | Repeated rollback is an idempotent complete result | PASS | `tests/setup/rollback.test.ts:532` |
| C18 | Ambiguous rollback stops safely | PASS | `tests/setup/rollback.test.ts:492` |
| C19 | Forced rollback remains ownership-bounded | PASS | `tests/setup/rollback.test.ts:339`, `:492` |
| C20 | Identical OpenCode setup is a no-op | PASS | `tests/setup/engine.test.ts:530`; packed smoke `tests/packaging/packed-install.test.ts:570` |
| C21 | Identical Codex setup does not repeat verified registration | PASS | `tests/setup/codex-cli.test.ts:543` |
| C22 | Both Codex operations verify complete | PASS | `tests/setup/codex-cli.test.ts:413`; packed smoke `tests/packaging/packed-install.test.ts:771` |
| C23 | Supported Codex step fails after another succeeds | PASS | `tests/setup/codex-cli.test.ts:457`; packed smoke `tests/packaging/packed-install.test.ts:771` |
| C24 | Required Codex operation is unavailable | PASS | `tests/setup/codex-cli.test.ts:502`, `:560` |
| C25 | Marketplace success cannot mask unavailable plugin installation | PASS | `tests/setup/codex-cli.test.ts:520`; `tests/setup/engine.test.ts:664` |
| C26 | Complete and no-op results exit zero | PASS | `tests/setup/engine.test.ts:152`; `tests/cli.test.ts:249`; `tests/index.test.ts:154` |
| C27 | Operational failure exits one | PASS | `tests/setup/engine.test.ts:152`; `tests/setup/rollback.test.ts:570` |
| C28 | Partial external completion exits two | PASS | `tests/setup/engine.test.ts:152`; `tests/setup/codex-cli.test.ts:457` |
| C29 | Manual action exits three | PASS | `tests/setup/engine.test.ts:152`; `tests/setup/codex-cli.test.ts:502` |

### Packaging

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| P1 | OpenCode assets are discoverable | PASS | `tests/packaging/inventory.test.ts:182`; packed smoke `tests/packaging/packed-install.test.ts:570` |
| P2 | Codex assets are discoverable | PASS | `tests/packaging/inventory.test.ts:182`; packed smoke `tests/packaging/packed-install.test.ts:771` |
| P3 | Claude marketplace and plugin assets are discoverable | PASS | `tests/packaging/inventory.test.ts:182`; exact unqualified packed smoke `tests/packaging/packed-install.test.ts:858` |
| P4 | Runner works from an unrelated working directory | PASS | `tests/integration/hook-command.test.ts:678`, `:753`; Windows and POSIX packed smoke |
| P5 | Windows path with spaces is supported | PASS | Windows hook/packed gates; `tests/integration/hook-command.test.ts:753`; `tests/packaging/packed-install.test.ts:570`, `:771`, `:858` |
| P6 | POSIX path with spaces is supported | PASS | Actual Ubuntu WSL2 execution from native `/tmp/.../repo with spaces`: exact hook test exit 0, 1 passed/12 skipped; packed-install exit 0, 7/7 |
| P7 | Complete tarball passes inventory verification | PASS | `tests/packaging/inventory.test.ts:182`, `:437`; 15-asset verifier |
| P8 | Missing asset fails packaging verification | PASS | `tests/packaging/inventory.test.ts:208` |
| P9 | Source-tree-only asset is rejected | PASS | `tests/packaging/inventory.test.ts:437`; packed install and checkout-reference scan |
| P10 | Canonical inventory rejects duplicate or undeclared runtime assets | PASS | `tests/packaging/inventory.test.ts:208`, `:275` |
| P11 | Versions and plugin identity agree | PASS | `tests/packaging/inventory.test.ts:304`; package/version verifier |
| P12 | Stale version is rejected | PASS | `tests/packaging/inventory.test.ts:343` |
| P13 | Escaping or absolute checkout path is rejected | PASS | `tests/packaging/inventory.test.ts:368` |
| P14 | Link-based path escape is rejected | PASS | `tests/packaging/inventory.test.ts:368` |
| P15 | OpenCode installs globally from the tarball | PASS | `tests/packaging/packed-install.test.ts:570`; Windows and POSIX package gates |
| P16 | OpenCode installs only in explicit project scope | PASS | `tests/packaging/packed-install.test.ts:570`; Windows and POSIX package gates |
| P17 | Codex setup exercises packed assets and explicit result states | PASS | `tests/packaging/packed-install.test.ts:771`; Windows and POSIX package gates |
| P18 | Codex project scope leaves global state unchanged | PASS | `tests/packaging/packed-install.test.ts:771`; Windows and POSIX package gates |
| P19 | Claude plugin installs from repository marketplace assets | PASS | Fixture resolves the unqualified name through the added marketplace at `tests/packaging/packed-install.test.ts:748`; exact `plugin install thoth-mem` smoke at `:858`, `:895`; Windows 17/17 and POSIX 7/7 |
| P20 | Packed installation detects external checkout dependency | PASS | `assertNoCheckoutReferences` and packed-only runner execution in `tests/packaging/packed-install.test.ts`; Windows and POSIX package gates |

### Tools

| ID | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| T1 | Session lifecycle uses existing tools | PASS | `tests/integration/lifecycle.test.ts:180`, `:476` |
| T2 | Project context uses existing tools | PASS | `tests/integration/lifecycle.test.ts:476`; canonical protocol test `:95` |
| T3 | Existing client remains compatible | PASS | `tests/tools/registry.test.ts:206`; full suite |
| T4 | Integration does not create required harness fields | PASS | `tests/tools/registry.test.ts:206`, `:255` |
| T5 | Stored memory remains harness-independent | PASS | `tests/integration/lifecycle.test.ts:1093`; `tests/store/context.test.ts:152` |
| T6 | Intentional identical prompts inside 30 seconds share one row | PASS | `tests/integration/lifecycle.test.ts:928`, `:1093` |
| T7 | Identical prompt after 30 seconds follows existing behavior | PASS | `tests/store/context.test.ts:152` |
| T8 | Retrieval behavior is unchanged by integration enablement | PASS | Byte-identical comparison at `tests/integration/lifecycle.test.ts:1093` |
| T9 | Existing identity behavior remains authoritative | PASS | `tests/store/identity.test.ts:124`, `:207` |
| T10 | Registry remains exactly six tools | PASS | `tests/tools/registry.test.ts:206`, `:280`, `:291` |
| T11 | Setup and administration stay outside MCP | PASS | `tests/tools/registry.test.ts:255`, `:305`; `tests/http-server.test.ts:1817` |

## Design Coherence

The implementation remains coherent with the approved design:

- `MemoryIntegrationCore` is harness-neutral and accepts normalized events.
- Native payloads remain in the three adapter modules.
- Memory effects pass through the six-tool `MemoryPort`; integration production code has no direct `Store` dependency.
- State advances only after every planned effect confirms.
- Event HMACs and bounded state separate delivery idempotency from `Store.savePrompt` cardinality.
- Root-user ownership, fail-closed private-tag sanitization, and the 8,000-code-point bound occur before persistence.
- Setup follows inspect → plan → backup → write-ahead receipt → apply → verify.
- OpenCode JSONC and Codex TOML changes are ownership-scoped.
- Codex commands use bounded argument arrays with `shell:false` and independent state verification.
- The 15-entry inventory is the single package path authority.
- Runtime declarations, versions, plugin identity, lexical containment, and realpath containment are verified.
- The actual tarball is installed with lifecycle scripts disabled and without credential-like environment variables.
- The additional `integration-event` command is package-internal and routes runners into the shared lifecycle core; it does not add an MCP tool or HTTP semantic.
- README, root skill, OpenCode instructions, Codex skill, Claude skill, server instructions, codemaps, and packaged assets describe the same six-tool lifecycle model.
- The Claude fixture now mirrors the accepted public transition path: marketplace registration precedes unqualified plugin-name resolution. Qualified identity remains accepted as an additional compatibility form.
- The W1 remediation is limited to test-fixture resolution and the authoritative smoke invocation; it introduces no production API, package, setup, storage, or MCP change.
- Actual POSIX execution confirms the Node runner and packed installation remain portable under isolated Linux paths containing spaces.
- Windows and POSIX runs both leave the authoritative Windows worktree unchanged after cleanup.

## Issues Found

### Critical

None.

### Warnings

None.

## Constitution Suggestion

Surfaced.

The change is governance-touching because `design.md` explicitly evaluates and names constitution principles P1–P5. Advisory suggestion:

> This change touched governance/principles — consider running `sdd-constitution` to record a constitution amendment.

This suggestion is report-only and does not affect the verdict.

## Verdict

**pass**

All 90 scenarios are compliant. Round-1 W1 is closed by the exact packed `claude plugin install thoth-mem` smoke, and W2 is closed by actual isolated Ubuntu/WSL2 hook and packed-install execution. No new production, contract, packaging, scope, privacy, or lifecycle issue was introduced.
