# Tasks: Native Multi-Harness Parity

## Preserved Handoffs and Boundaries

- Preserve one host-neutral lifecycle contract and exact capability/outcome vocabularies across OpenCode, Codex, and Claude Code.
- Advance lifecycle state only after confirmed six-tool MCP outcomes; unsupported capability and missing stable event evidence degrade explicitly.
- Treat duplicate native event delivery separately from Store cardinality: one effect per event identity, while same-session byte-identical prompt content inside 30 seconds resolves to one canonical `Store.savePrompt` row, including intentional repeats.
- Do not add an idempotency input/key, schema or prompt-cardinality migration, new HTTP semantics, or any MCP tool/input expansion.
- Preserve unrelated user configuration through plan, merge, force, backup, receipt, interruption recovery, and rollback.
- Keep package inventory/version/path checks authoritative, execute smoke tests from the tarball with the source checkout unavailable, and make no cross-repository writes.
- Codex command grammar and future native event names remain runtime-discovered; unavailable capabilities return explicit fallback/manual actions.

## Execution Order

Execute phases and tasks strictly in numeric order. Core contracts precede adapters; adapters/assets precede setup; setup precedes packaging; docs/public-contract regression precede the final verification phase. No task is marked parallel because several tasks share planned test fixtures, package metadata, or generated integration assets.

## Phase 1: Core contracts/state/privacy/MemoryPort

- [x] 1.1 Define normalized lifecycle contracts and the pure planner — `new: src/integration/core/types.ts`, `new: src/integration/core/lifecycle.ts`, `new: tests/integration/lifecycle.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle`; `harness-integration/Each Adapter MUST Expose an Explicit Capability Mapping`
  **Independent Test:** Run the host-neutral planning fixture without loading any host SDK; equivalent normalized events produce equivalent ordered effects and exact capability/outcome values.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts -t "plans host-neutral lifecycle effects"`
  - Expected: The focused planner test passes and asserts no adapter-specific payload enters core effects.

- [x] 1.2 Implement strict root-prompt ownership and privacy sanitization — `new: src/integration/core/sanitizer.ts`, `existing: src/utils/privacy.ts`, `planned: tests/integration/lifecycle.test.ts`, `existing: tests/utils/privacy.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `harness-integration/Automatic Prompt Capture MUST Persist Only Privacy-Safe Root-User Intent`
  **Independent Test:** Exercise root, sub-agent, generated, balanced-private, malformed-private, private-only, Unicode, and 8,001-code-point fixtures in isolation.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts tests/utils/privacy.test.ts -t "sanitizes root prompt capture"`
  - Expected: Only eligible root-user content survives; malformed/private-only content leaks nothing and the retained prefix is at most 8,000 Unicode code points.

- [x] 1.3 Reuse stable identity resolver v2 at the lifecycle boundary — `planned: src/integration/core/lifecycle.ts`, `existing: src/store/identity.ts`, `existing: tests/store/identity.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `harness-integration/Lifecycle Operations MUST Preserve Stable Root Session and Project Identity`
  **Independent Test:** Resolve explicit root identity, deterministic fallback, placeholder/degraded identity, and sub-agent/root conflicts through the integration wrapper.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/identity.test.ts -t "integration lifecycle identity"`
  - Expected: Explicit root identity always wins, fallback metadata is deterministic and visible, and sub-agent identity never takes root ownership.

- [x] 1.4 Implement the six-tool `MemoryPort` and linked MCP client — `new: src/integration/core/memory-port.ts`, `new: src/integration/core/mcp-memory-port.ts`, `existing: src/server.ts`, `planned: tests/integration/lifecycle.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `tools/Native Integrations MUST Use Only the Existing MCP Tool Surface`; `tools/Native Integration MUST Preserve Existing Tool Request and Response Contracts`; `tools/MCP Surface MUST Be Compact and Workflow-Level`
  **Independent Test:** Invoke each allowed lifecycle mapping through a linked MCP client and reject any non-allowlisted tool name without importing Store or tool handlers.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts -t "uses only the six-tool MemoryPort"`
  - Expected: Calls reach only the six registered MCP tools, existing request shapes remain valid, and no seventh/harness-specific tool is exposed.

- [x] 1.5 Implement bounded HMAC lifecycle state, locking, restart recovery, and degradation — `new: src/integration/core/state-store.ts`, `planned: tests/integration/lifecycle.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `harness-integration/Duplicate Events and Retries MUST Be Idempotent`; `harness-integration/Restart Recovery MUST Preserve Confirmed State Without Inventing Success`; `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive`
  **Independent Test:** Persist and reload confirmed event keys/canonical row references, inject lock timeout and state-bound conditions, and inspect privacy-safe degraded outcomes.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts -t "recovers bounded lifecycle state"`
  - Expected: Confirmed state survives restart, pending work is not invented as success, duplicate keys no-op, and lock/bound failures are explicit and retry-safe.

- [x] 1.6 Execute effects only on confirmed MCP success and preserve canonical prompt rows — `planned: src/integration/core/lifecycle.ts`, `planned: tests/integration/lifecycle.test.ts`, `existing: tests/store/context.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `harness-integration/Lifecycle State MUST Advance Only After Confirmed Memory Success`; `harness-integration/Duplicate Events and Retries MUST Be Idempotent`; `harness-integration/Automatic Prompt Capture MUST Persist Only Privacy-Safe Root-User Intent`; `tools/Native Integration MUST Preserve Storage and Retrieval Semantics`
  **Independent Test:** Compare failed/retried calls, repeated delivery of one event, and two distinct byte-identical prompt events inside/after the existing 30-second Store window.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts tests/store/context.test.ts -t "confirms canonical prompt persistence"`
  - Expected: Failure never advances state; duplicate delivery causes one memory effect; distinct events inside 30 seconds can share one returned prompt ID; aged-out content follows unchanged Store behavior.

## Phase 2: Harness adapters and native hook/assets

- [x] 2.1 Implement the OpenCode adapter and capability matrix — `new: src/integration/adapters/opencode.ts`, `new: tests/integration/adapters.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle`; `harness-integration/Each Adapter MUST Expose an Explicit Capability Mapping`; `harness-integration/Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe`; `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive`
  **Independent Test:** Feed supported, partial, unknown-version, sub-agent, compaction, and terminal OpenCode fixtures directly to the adapter.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/adapters.test.ts -t "OpenCode adapter"`
  - Expected: Native events normalize correctly, unproven finalization is not simulated, and unsupported/degraded capabilities include bounded safe diagnostics.

- [x] 2.2 Implement the Codex adapter and capability matrix — `new: src/integration/adapters/codex.ts`, `planned: tests/integration/adapters.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle`; `harness-integration/Each Adapter MUST Expose an Explicit Capability Mapping`; `harness-integration/Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe`; `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive`
  **Independent Test:** Evaluate verified, incomplete, and unknown Codex hook payloads without invoking setup or external commands.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/adapters.test.ts -t "Codex adapter"`
  - Expected: Only evidence-backed triggers are supported; absent prompt/compact/final events degrade or remain unsupported without false success.

- [x] 2.3 Implement the Claude Code adapter and capability matrix — `new: src/integration/adapters/claude-code.ts`, `planned: tests/integration/adapters.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle`; `harness-integration/Each Adapter MUST Expose an Explicit Capability Mapping`; `harness-integration/Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe`; `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive`
  **Independent Test:** Normalize SessionStart, UserPromptSubmit, compact, Stop, and excluded SubagentStop fixtures through the adapter.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/adapters.test.ts -t "Claude Code adapter"`
  - Expected: Root lifecycle effects match core intents, SubagentStop produces no root effect, and compact/finalization outcomes remain explicit and idempotent.

- [x] 2.4 Implement the portable JSON hook command and Node runner contract — `new: src/integration/runtime/hook-command.ts`, `new: integrations/shared/hook-runner.mjs`, `new: tests/integration/hook-command.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `packaging/Hook Execution MUST Use Portable Node Runners`; `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive`
  **Independent Test:** Spawn the runner with JSON stdin from unrelated working directories and Windows/POSIX-style paths containing spaces, including missing executable resolution.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/hook-command.test.ts`
  - Expected: Argument arrays remain intact without shell syntax; package/managed path resolution works and missing runtime returns a bounded explicit degraded result.

- [x] 2.5 Create the native OpenCode plugin assets and protocol instructions — `new: integrations/opencode/plugin.mjs`, `new: integrations/opencode/memory-protocol.md`, `planned: tests/integration/adapters.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`; `packaging/Hook Execution MUST Use Portable Node Runners`; `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle`
  **Independent Test:** Load the plugin fixture from a temporary copied installation and assert it emits only the shared JSON protocol for verified OpenCode events.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/adapters.test.ts -t "packaged OpenCode plugin asset"`
  - Expected: The plugin loads without checkout/cwd assumptions and maps events through the shared core rather than duplicating lifecycle logic.

- [x] 2.6 Create Codex and Claude manifests, hooks, skills, runners, and MCP descriptors — `new: .agents/plugins/marketplace.json`, `new: .claude-plugin/marketplace.json`, `new: integrations/codex/**`, `new: integrations/claude-code/**`, `planned: tests/integration/hook-command.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`; `packaging/Hook Execution MUST Use Portable Node Runners`; `harness-integration/Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe`
  **Independent Test:** Parse every new descriptor, resolve each plugin-root-local path, and execute both runner copies against controlled hook payloads.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/hook-command.test.ts -t "native plugin assets"`
  - Expected: Manifests and hooks are valid, runner copies behave identically, MCP descriptors launch the existing server, and unsupported hooks never claim success.

## Phase 3: Setup engine/merge/receipts/rollback/Codex states

- [x] 3.1 Add command-aware setup parsing and deterministic result rendering — `new: src/setup/types.ts`, `existing: src/cli.ts`, `existing: src/index.ts`, `new: tests/setup/engine.test.ts`, `existing: tests/cli.test.ts`, `existing: tests/index.test.ts`
  **[USN-7]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode and Codex`; `cli/Setup Results and Exit Codes MUST Be Deterministic`
  **Independent Test:** Parse every exact setup flag combination and snapshot human/JSON results for all four statuses without touching the filesystem.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/engine.test.ts tests/cli.test.ts tests/index.test.ts -t "setup command contract"`
  - Expected: Exact flags, JSON field types, step outcomes, and exit codes 0/1/2/3 are preserved while existing CLI commands retain prior behavior.

- [x] 3.2 Implement scope/path inspection and deterministic zero-write plans — `new: src/setup/paths.ts`, `new: src/setup/engine.ts`, `planned: tests/setup/engine.test.ts`
  **[USN-7]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode and Codex`; `cli/Plan-Only Setup MUST Perform Zero Writes`; `cli/Repeated Setup MUST Be Idempotent`
  **Independent Test:** Snapshot clean/conflicting global and explicit project targets before and after plan-only and already-installed inspection.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/engine.test.ts -t "inspects and plans with zero writes"`
  - Expected: Plan-only produces deterministic ordered actions and statuses with byte-identical filesystem snapshots; repeated verified setup plans a no-op.

- [x] 3.3 Implement ownership-aware JSONC and TOML managed merges — `new: src/setup/managed-config.ts`, `new: src/setup/harnesses/opencode.ts`, `new: src/setup/harnesses/codex.ts`, `planned: tests/setup/engine.test.ts`
  **[USN-7]** | Priority: P1
  **Spec:** `cli/Setup MUST Merge Only Managed Configuration`
  **Independent Test:** Apply clean, comment-rich, unrelated-key, managed-conflict, and forced-conflict fixtures for both JSONC and TOML.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/engine.test.ts -t "merges only managed configuration"`
  - Expected: Unrelated bytes/semantics survive, conflicts stop without force, and force replaces only the owned location.

- [x] 3.4 Implement atomic backups, writes, restoration, and verification — `new: src/setup/filesystem.ts`, `planned: src/setup/engine.ts`, `planned: tests/setup/engine.test.ts`
  **[USN-8]** | Priority: P1
  **Spec:** `cli/Mutating Setup MUST Be Backed Up, Atomic, and Verifiable`
  **Independent Test:** Inject failure before write, during replacement, during fsync/rename, and during post-write verification in temporary targets.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/engine.test.ts -t "backs up and applies atomically"`
  - Expected: Every existing target is backed up before mutation, readers see complete files, failed transactions restore managed state, and false `complete` is impossible.

- [x] 3.5 Implement write-ahead receipts, rollback, interruption recovery, and idempotent reruns — `new: src/setup/receipt.ts`, `new: tests/setup/rollback.test.ts`, `planned: src/setup/engine.ts`
  **[USN-8]** | Priority: P1
  **Spec:** `cli/Every Mutating Attempt MUST Emit an Ownership Receipt`; `cli/Rollback MUST Restore Only Receipt-Owned Changes`; `cli/Repeated Setup MUST Be Idempotent`
  **Independent Test:** Stop execution after each step, tamper with a receipt, add unrelated post-install settings, rerun rollback, and exercise ownership-bounded force.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/rollback.test.ts`
  - Expected: `in_progress` is durable before mutation, interruption is detected, rollback preserves unrelated changes, tampering is refused, and repeated setup/rollback returns `complete` with `changed=false`.

- [x] 3.6 Implement Codex CLI capability probes, external step verification, and final states — `new: src/setup/codex-cli.ts`, `planned: src/setup/harnesses/codex.ts`, `new: tests/setup/codex-cli.test.ts`
  **[USN-9]** | Priority: P1
  **Spec:** `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely`; `cli/Setup Results and Exit Codes MUST Be Deterministic`
  **Independent Test:** Run help/probe fixtures for both operations supported, one failed, unavailable grammar, unverifiable success, already installed, and project-only scope.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/codex-cli.test.ts`
  - Expected: Only advertised argument arrays execute; independent verification derives `complete`, `partial`, or `requires_user_action`; marketplace success alone never yields `complete`.

## Phase 4: Packaging/build/inventory/version/tarball smoke

- [x] 4.1 Create and validate the canonical native asset inventory — `new: integrations/inventory.json`, `new: tests/packaging/inventory.test.ts`
  **[USN-10]** | Priority: P1
  **Spec:** `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`; `packaging/NPM Tarball MUST Include the Complete Integration Inventory`
  **Independent Test:** Reconcile each runtime manifest reference against unique inventory owner/role/path entries and deliberate missing/duplicate/undeclared fixtures.
  **Verification**:
  - Run: `pnpm exec vitest run tests/packaging/inventory.test.ts -t "canonical inventory"`
  - Expected: The complete three-harness inventory passes; missing, duplicate, undeclared, or extra required runtime assets fail with the owning harness/path.

- [x] 4.2 Implement version synchronization and lexical/realpath containment checks — `new: scripts/sync-integration-assets.mjs`, `new: scripts/verify-integration-package.mjs`, `planned: tests/packaging/inventory.test.ts`
  **[USN-10]** | Priority: P1
  **Spec:** `packaging/Manifest Versions and Paths MUST Be Internally Consistent`
  **Independent Test:** Validate exact package version, stale/range versions, absolute/traversal paths, and symlink escapes using isolated fixture roots.
  **Verification**:
  - Run: `pnpm exec vitest run tests/packaging/inventory.test.ts -t "version and path integrity"`
  - Expected: Exact versions and contained lexical/real paths pass; version drift, traversal, absolute checkout paths, and link escapes fail before execution.

- [x] 4.3 Publish all native assets and lock required runtime dependencies — `existing: package.json`, `existing: pnpm-lock.yaml`, `planned: integrations/**`
  **[USN-10]** | Priority: P1
  **Spec:** `packaging/NPM Tarball MUST Include the Complete Integration Inventory`; `packaging/Manifest Versions and Paths MUST Be Internally Consistent`
  **Independent Test:** Inspect the package manager's dry-run file list and install with the lockfile frozen after adding JSONC/TOML dependencies and asset allowlists.
  **Verification**:
  - Run: `pnpm install --frozen-lockfile`
  - Expected: Dependency resolution succeeds without changing `pnpm-lock.yaml`, proving package metadata and lockfile agree.

- [x] 4.4 Integrate source/inventory verification into the existing build and release gate — `existing: scripts/build.mjs`, `existing: package.json`, `planned: scripts/verify-integration-package.mjs`
  **[USN-10]** | Priority: P1
  **Spec:** `packaging/NPM Tarball MUST Include the Complete Integration Inventory`; `packaging/Manifest Versions and Paths MUST Be Internally Consistent`
  **Independent Test:** Build after deliberately clean synchronized assets, then assert the verifier rejects a temporary stale/missing fixture without editing source assets.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript and dashboard builds pass and the integration verifier confirms inventory, versions, paths, and bundled entrypoints.

- [x] 4.5 Add packed-tarball OpenCode global/project installation smoke tests — `new: tests/packaging/packed-install.test.ts`
  **[USN-10]** | Priority: P1
  **Spec:** `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`; `cli/CLI MUST Provide Managed Setup for OpenCode and Codex`; `cli/Plan-Only Setup MUST Perform Zero Writes`; `cli/Repeated Setup MUST Be Idempotent`
  **Independent Test:** Pack/install into isolated clean homes/projects with the source checkout hidden; run global, project, plan-only, repeated setup, and runner invocation fixtures.
  **Verification**:
  - Run: `pnpm exec vitest run tests/packaging/packed-install.test.ts -t "packed OpenCode installation"`
  - Expected: Packed assets alone install in the selected scope, plan-only writes nothing, the second run is a verified no-op, and the runner resolves without checkout access.

- [x] 4.6 Add packed-tarball Codex and Claude marketplace/plugin smoke tests — `planned: tests/packaging/packed-install.test.ts`
  **[USN-10]** | Priority: P1
  **Spec:** `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`; `packaging/Hook Execution MUST Use Portable Node Runners`; `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`; `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely`; `cli/Setup Results and Exit Codes MUST Be Deterministic`
  **Independent Test:** Use controlled Codex capability CLIs and a local Claude marketplace fixture from packed assets on Windows/POSIX-style paths containing spaces.
  **Verification**:
  - Run: `pnpm exec vitest run tests/packaging/packed-install.test.ts -t "packed Codex and Claude installation"`
  - Expected: Codex derives exact verified states/manual actions, Claude validates/installs its plugin, and every Node runner works without shell or checkout-relative paths.

## Phase 5: Docs/transition/public-contract regression

- [x] 5.1 Document setup commands, scopes, plans, receipts, rollback, force, statuses, and recovery — `existing: README.md`, `planned: tests/setup/engine.test.ts`
  **[USN-11]** | Priority: P2
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode and Codex`; `cli/Plan-Only Setup MUST Perform Zero Writes`; `cli/Setup MUST Merge Only Managed Configuration`; `cli/Mutating Setup MUST Be Backed Up, Atomic, and Verifiable`; `cli/Every Mutating Attempt MUST Emit an Ownership Receipt`; `cli/Rollback MUST Restore Only Receipt-Owned Changes`; `cli/Repeated Setup MUST Be Idempotent`; `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely`; `cli/Setup Results and Exit Codes MUST Be Deterministic`
  **Independent Test:** Assert documented commands/flags/statuses match the parser/result fixtures and include manual recovery for unavailable Codex capabilities.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/engine.test.ts -t "documentation matches setup contract"`
  - Expected: README examples use exact flags and state/exit semantics and do not claim writes, force scope, rollback behavior, or Codex completion beyond executable behavior.

- [x] 5.2 Align packaged memory protocol and skill guidance with lifecycle capabilities — `existing: skills/thoth-mem/SKILL.md`, `planned: integrations/opencode/memory-protocol.md`, `planned: integrations/codex/skills/thoth-mem/SKILL.md`, `planned: integrations/claude-code/skills/thoth-mem/SKILL.md`, `planned: tests/integration/lifecycle.test.ts`
  **[USN-11]** | Priority: P2
  **Spec:** `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle`; `harness-integration/Each Adapter MUST Expose an Explicit Capability Mapping`; `harness-integration/Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe`; `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive`; `tools/Native Integrations MUST Use Only the Existing MCP Tool Surface`
  **Independent Test:** Compare canonical and packaged guidance for the six-tool flow, capability fallback, root ownership, compaction, finalization, and canonical prompt rows.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts -t "packaged protocol guidance"`
  - Expected: All packaged instructions are semantically aligned, mention only six tools, and describe degraded/manual behavior without false automatic guarantees.

- [x] 5.3 Document transition boundaries and update repository maps without cross-repository mutation — `existing: README.md`, `existing: codemap.md`, `existing: src/codemap.md`, `planned: tests/packaging/inventory.test.ts`
  **[USN-11]** | Priority: P2
  **Spec:** `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive`; `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`
  **Independent Test:** Validate documentation names every new in-repository module/asset and contains a warning for overlapping external integrations without an external write instruction.
  **Verification**:
  - Run: `pnpm exec vitest run tests/packaging/inventory.test.ts -t "documentation and codemap inventory"`
  - Expected: Maps and transition guidance match actual package paths, preserve manual MCP fallback, and keep all external repository changes out of this change.

- [x] 5.4 Lock the exact six-tool registry and existing request/response shapes — `existing: tests/tools/registry.test.ts`, `planned: tests/integration/lifecycle.test.ts`
  **[USN-11]** | Priority: P1
  **Spec:** `tools/Native Integrations MUST Use Only the Existing MCP Tool Surface`; `tools/Native Integration MUST Preserve Existing Tool Request and Response Contracts`; `tools/MCP Surface MUST Be Compact and Workflow-Level`
  **Independent Test:** List tools before/after each adapter is enabled and validate existing requests without any harness/idempotency field.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/registry.test.ts tests/integration/lifecycle.test.ts -t "preserves the six-tool public contract"`
  - Expected: Exactly six names remain, legacy/admin/harness tools are absent, and no existing client request or response contract changes.

- [x] 5.5 Lock 30-second canonical prompt rows and fixed-input retrieval parity — `existing: tests/store/context.test.ts`, `planned: tests/integration/lifecycle.test.ts`
  **[USN-11]** | Priority: P1
  **Spec:** `harness-integration/Automatic Prompt Capture MUST Persist Only Privacy-Safe Root-User Intent`; `harness-integration/Duplicate Events and Retries MUST Be Idempotent`; `tools/Native Integration MUST Preserve Storage and Retrieval Semantics`
  **Independent Test:** Compare duplicate delivery, two distinct intentional identical events inside the window, an aged-out row, and fixed recall/context/get/project fixtures before/after adapter enablement.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/context.test.ts tests/integration/lifecycle.test.ts -t "preserves canonical prompt and retrieval behavior"`
  - Expected: Duplicate delivery has one effect; distinct inside-window events can share one row; aged-out behavior is unchanged; deterministic retrieval output remains byte-identical.

- [x] 5.6 Add explicit non-goal regression coverage — `existing: tests/tools/registry.test.ts`, `existing: tests/store/context.test.ts`, `planned: tests/integration/lifecycle.test.ts`
  **[USN-11]** | Priority: P1
  **Spec:** `tools/Native Integration MUST Preserve Existing Tool Request and Response Contracts`; `tools/Native Integration MUST Preserve Storage and Retrieval Semantics`; `tools/MCP Surface MUST Be Compact and Workflow-Level`
  **Independent Test:** Inspect MCP schemas, SQLite schema, registered HTTP routes, and the implementation diff surface for forbidden integration-only contract expansion.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/registry.test.ts tests/store/context.test.ts tests/integration/lifecycle.test.ts -t "rejects multi-harness contract expansion"`
  - Expected: No idempotency/event input, schema/cardinality migration, new HTTP memory semantic, direct Store adapter access, or seventh MCP tool exists.

## Phase 6: Focused integration plus build/full-suite verification

- [x] 6.1 Run the complete core lifecycle verification gate — `planned: tests/integration/lifecycle.test.ts`, `existing: tests/utils/privacy.test.ts`, `existing: tests/store/identity.test.ts`, `existing: tests/store/context.test.ts`
  **[USN-12]** | Priority: P1
  **Spec:** `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle`; `harness-integration/Automatic Prompt Capture MUST Persist Only Privacy-Safe Root-User Intent`; `harness-integration/Lifecycle Operations MUST Preserve Stable Root Session and Project Identity`; `harness-integration/Lifecycle State MUST Advance Only After Confirmed Memory Success`; `harness-integration/Duplicate Events and Retries MUST Be Idempotent`; `harness-integration/Restart Recovery MUST Preserve Confirmed State Without Inventing Success`
  **Independent Test:** Run only core/privacy/identity/storage suites after implementation and inspect zero flaky timers or external harness dependencies.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts tests/utils/privacy.test.ts tests/store/identity.test.ts tests/store/context.test.ts`
  - Expected: All core lifecycle, privacy, identity, confirmed-success, dedup, canonical-row, and restart scenarios pass deterministically.

- [x] 6.2 Run the complete adapter and hook verification gate — `planned: tests/integration/adapters.test.ts`, `planned: tests/integration/hook-command.test.ts`
  **[USN-12]** | Priority: P1
  **Spec:** `harness-integration/Each Adapter MUST Expose an Explicit Capability Mapping`; `harness-integration/Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe`; `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive`; `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`; `packaging/Hook Execution MUST Use Portable Node Runners`
  **Independent Test:** Run adapter/hook tests without setup, package packing, network access, or real user harness homes.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/adapters.test.ts tests/integration/hook-command.test.ts`
  - Expected: All adapter matrices and portable runner fixtures pass, including explicit unsupported/degraded paths and paths containing spaces.

- [x] 6.3 Run the complete setup transaction verification gate — `planned: tests/setup/engine.test.ts`, `planned: tests/setup/rollback.test.ts`, `planned: tests/setup/codex-cli.test.ts`, `existing: tests/cli.test.ts`, `existing: tests/index.test.ts`
  **[USN-12]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode and Codex`; `cli/Plan-Only Setup MUST Perform Zero Writes`; `cli/Setup MUST Merge Only Managed Configuration`; `cli/Mutating Setup MUST Be Backed Up, Atomic, and Verifiable`; `cli/Every Mutating Attempt MUST Emit an Ownership Receipt`; `cli/Rollback MUST Restore Only Receipt-Owned Changes`; `cli/Repeated Setup MUST Be Idempotent`; `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely`; `cli/Setup Results and Exit Codes MUST Be Deterministic`
  **Independent Test:** Run all setup suites against isolated temporary homes and command fixtures without packing the npm artifact.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/engine.test.ts tests/setup/rollback.test.ts tests/setup/codex-cli.test.ts tests/cli.test.ts tests/index.test.ts`
  - Expected: All setup, merge, atomicity, receipt, rollback, idempotency, Codex state, JSON, and exit-code scenarios pass.

- [x] 6.4 Run the package inventory and packed-install verification gate — `planned: tests/packaging/inventory.test.ts`, `planned: tests/packaging/packed-install.test.ts`
  **[USN-12]** | Priority: P1
  **Spec:** `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`; `packaging/Hook Execution MUST Use Portable Node Runners`; `packaging/NPM Tarball MUST Include the Complete Integration Inventory`; `packaging/Manifest Versions and Paths MUST Be Internally Consistent`; `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`
  **Independent Test:** Run only package tests using generated temporary tarballs/homes with no remote publishing credentials.
  **Verification**:
  - Run: `pnpm exec vitest run tests/packaging/inventory.test.ts tests/packaging/packed-install.test.ts`
  - Expected: Inventory, exact versions, containment, three-harness assets, runners, global/project setup, and checkout-independent packed installs all pass.

- [x] 6.5 Run the TypeScript/bundle/dashboard build gate — `existing: package.json`, `existing: scripts/build.mjs`, all planned source/assets
  **[USN-12]** | Priority: P1
  **Spec:** `tools/Native Integration MUST Preserve Existing Tool Request and Response Contracts`; `tools/MCP Surface MUST Be Compact and Workflow-Level`; `packaging/NPM Tarball MUST Include the Complete Integration Inventory`
  **Independent Test:** Execute the repository's existing build script from a clean process after focused suites pass.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: `tsc --noEmit`, the Node 18 bundle, integration verification, and dashboard build complete successfully with no missing asset or module.

- [x] 6.6 Run the full suite and release gate — entire repository and packed artifact
  **[USN-12]** | Priority: P1
  **Spec:** `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle`; `cli/Setup Results and Exit Codes MUST Be Deterministic`; `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`; `tools/MCP Surface MUST Be Compact and Workflow-Level`
  **Independent Test:** Run the complete Vitest suite, then the existing prepublish gate in a clean environment without credentials or external repository writes.
  **Verification**:
  - Run: `pnpm test && pnpm run prepublishOnly`
  - Expected: The full suite passes; prepublish rebuilds and retests successfully; package verification/smoke completes; no generated `dist/` file is edited directly and no external repository is mutated.

## Requirement Coverage Audit

| Requirement | Covering tasks |
| --- | --- |
| `harness-integration/Harness Adapters MUST Preserve One Host-Neutral Memory Lifecycle` | 1.1, 2.1, 2.2, 2.3, 2.5, 5.2, 6.1, 6.6 |
| `harness-integration/Each Adapter MUST Expose an Explicit Capability Mapping` | 1.1, 2.1, 2.2, 2.3, 5.2, 6.2 |
| `harness-integration/Automatic Prompt Capture MUST Persist Only Privacy-Safe Root-User Intent` | 1.2, 1.6, 5.5, 6.1 |
| `harness-integration/Lifecycle Operations MUST Preserve Stable Root Session and Project Identity` | 1.3, 6.1 |
| `harness-integration/Lifecycle State MUST Advance Only After Confirmed Memory Success` | 1.6, 6.1 |
| `harness-integration/Duplicate Events and Retries MUST Be Idempotent` | 1.5, 1.6, 5.5, 6.1 |
| `harness-integration/Restart Recovery MUST Preserve Confirmed State Without Inventing Success` | 1.5, 6.1 |
| `harness-integration/Compaction and Finalization Outcomes MUST Be Explicit and Retry-Safe` | 2.1, 2.2, 2.3, 2.6, 5.2, 6.2 |
| `harness-integration/Degraded Lifecycle Operation MUST Be Operator-Visible and Non-Destructive` | 1.5, 2.1, 2.2, 2.3, 2.4, 5.2, 5.3, 6.2 |
| `cli/CLI MUST Provide Managed Setup for OpenCode and Codex` | 3.1, 3.2, 4.5, 5.1, 6.3 |
| `cli/Plan-Only Setup MUST Perform Zero Writes` | 3.2, 4.5, 5.1, 6.3 |
| `cli/Setup MUST Merge Only Managed Configuration` | 3.3, 5.1, 6.3 |
| `cli/Mutating Setup MUST Be Backed Up, Atomic, and Verifiable` | 3.4, 5.1, 6.3 |
| `cli/Every Mutating Attempt MUST Emit an Ownership Receipt` | 3.5, 5.1, 6.3 |
| `cli/Rollback MUST Restore Only Receipt-Owned Changes` | 3.5, 5.1, 6.3 |
| `cli/Repeated Setup MUST Be Idempotent` | 3.2, 3.5, 4.5, 5.1, 6.3 |
| `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely` | 3.6, 4.6, 5.1, 6.3 |
| `cli/Setup Results and Exit Codes MUST Be Deterministic` | 3.1, 3.6, 4.6, 5.1, 6.3, 6.6 |
| `packaging/Published Package MUST Contain Native Assets for All Three Harnesses` | 2.5, 2.6, 4.1, 4.6, 5.3, 6.2, 6.4 |
| `packaging/Hook Execution MUST Use Portable Node Runners` | 2.4, 2.5, 2.6, 4.6, 6.2, 6.4 |
| `packaging/NPM Tarball MUST Include the Complete Integration Inventory` | 4.1, 4.3, 4.4, 6.4, 6.5 |
| `packaging/Manifest Versions and Paths MUST Be Internally Consistent` | 4.2, 4.3, 4.4, 6.4 |
| `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact` | 4.5, 4.6, 6.4, 6.6 |
| `tools/Native Integrations MUST Use Only the Existing MCP Tool Surface` | 1.4, 5.2, 5.4 |
| `tools/Native Integration MUST Preserve Existing Tool Request and Response Contracts` | 1.4, 5.4, 5.6, 6.5 |
| `tools/Native Integration MUST Preserve Storage and Retrieval Semantics` | 1.6, 5.5, 5.6 |
| `tools/MCP Surface MUST Be Compact and Workflow-Level` | 1.4, 5.4, 5.6, 6.5, 6.6 |

Coverage: 27 of 27 requirements (100%).
