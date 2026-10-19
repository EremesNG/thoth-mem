# Tasks: Portable Harness Runtime Parity

> **Scope guard:** This plan changes only the implementation checklist. It preserves the approved six-tool MCP surface, existing schema and prompt semantics, capability-gated terminal behavior, public `claude-code`, private runtime/inventory `claude`, hermetic credential-free release gates, no auto-start server, no cross-repository edits, and no formal Engram references.
>
> **Existing-file validation:** All existing paths referenced below were revalidated in the checkout. Paths explicitly marked **create** are new fixture, test, or implementation deliverables. Production tasks never import test fixtures; red tests pass fixture values into production APIs. No task imports a `.test.ts` file.
>
> **Execution order:** Run Phase 1 fixture-validation tasks green before later red suites. Then run each red contract test, implement its named production unit, and rerun its focused command. Red commands may fail only on named not-yet-implemented behavior assertions; fixture setup and unrelated assertions remain green. No parallel markers are used because each task is dependency-sensitive.

## Phase 1: Standalone Evidence Fixtures and Foundation

- [x] 1.1 **[deep] Create host-evidence module and green validation test** — create `tests/fixtures/integration/host-evidence.ts` exporting deterministic OpenCode/Codex/Claude Code version families, payload mappings, activation markers, recovery/compaction channels, terminal mappings, unknown cases, and bounded evidence keys; create `tests/fixtures/integration/host-evidence.test.ts` to validate shape, boundedness, and fail-closed unknown cases (Harness Integration: Runtime Activation and Finalization scenarios).
  **Verification**:
  - Run: `pnpm exec vitest run tests/fixtures/integration/host-evidence.test.ts`
  - Expected: Fixture validation passes green and verifies bounded version/payload mappings, explicit capability classifications, and no raw secret/payload persistence.

- [x] 1.2 **[deep] Create Claude manager-evidence module and green validation test** — create `tests/fixtures/setup/claude-manager-evidence.ts` exporting disposable scopes, manager/version probe results, removal-proof variants, manual MCP state, marketplace state, receipt-owned state, ambiguous ownership, and later-user-edit fixtures; create `tests/fixtures/setup/claude-manager-evidence.test.ts` to validate isolation and ownership classification (CLI: Claude plan/coexistence/rollback scenarios).
  **Verification**:
  - Run: `pnpm exec vitest run tests/fixtures/setup/claude-manager-evidence.test.ts`
  - Expected: Fixture validation passes green, uses temporary-only paths, distinguishes ownership classes, and executes no real-home command.

- [x] 1.3 **[quick] Create disposable-harness module and green validation test** — create `tests/fixtures/packaging/disposable-harnesses.ts` exporting isolated home builders, packed tarball inputs, per-harness host facts, fixture-selected native stdout envelopes, cleanup hooks, and source-checkout/credential guards; create `tests/fixtures/packaging/disposable-harnesses.test.ts` to validate isolation and receipt shape (Packaging: disposable activation and packed Claude scenarios).
  **Verification**:
  - Run: `pnpm exec vitest run tests/fixtures/packaging/disposable-harnesses.test.ts`
  - Expected: Fixture validation passes green and proves deterministic cleanup, explicit envelope selection, independent homes, and no real-home/external-server dependency.

- [x] 1.4 **[quick] Lock the unchanged public contract** — modify `tests/tools/registry.test.ts` and `tests/tools/mem-save.test.ts` to assert exactly six tools, unchanged root-prompt canonical-row behavior, no public harness/idempotency field, and no schema/direct-Store runtime path (Harness Integration: Runtime Enrichment scenario).
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/registry.test.ts tests/tools/mem-save.test.ts`
  - Expected: Existing and new assertions pass green; the six-tool registry and fixed prompt behavior are unchanged.

## Phase 2: Core Contracts, Production Claim Resolution, and Neutral Directive Transport

- [x] 2.1 **[deep] Add runtime-delivery red tests with standalone evidence inputs** — create `tests/integration/runtime-delivery.test.ts` importing only `tests/fixtures/integration/host-evidence.ts`; assert core returns a bounded `HostOutputDirective` only after confirmed memory effects, keeps activation/memory confirmation/output readiness/local emission/model consumption distinct, rejects unknown/mismatched delivery mappings, and preserves retryable memory failures (Harness Integration: Recovery and Compaction scenarios).
  **Verification**:
  - Run: `pnpm exec vitest run tests/fixtures/integration/host-evidence.test.ts tests/integration/runtime-delivery.test.ts`
  - Expected: The command fails only on named not-yet-implemented directive/ordering assertions; fixture validation and unrelated assertions remain green, with no `.test.ts` import.

- [x] 2.2 **[deep] Add lifecycle and passive-learning red tests with standalone evidence inputs** — modify `tests/integration/lifecycle.test.ts` and `tests/utils/privacy.test.ts`/`tests/utils/dedup.test.ts`, importing only fixture modules, to assert enrollment→`mem_context`, checkpoint→recovery→directive, observation-only terminal-subagent learning, rejection of unsafe payloads, duplicate replay, and missing stable-key degradation.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts tests/utils/privacy.test.ts tests/utils/dedup.test.ts`
  - Expected: The command fails only on named not-yet-implemented lifecycle/sanitizer assertions; existing privacy/dedup assertions remain green.

- [x] 2.3 **[deep] Implement core directive contracts and confirmed effect ordering** — modify `src/integration/core/types.ts`, `src/integration/core/lifecycle.ts`, `src/integration/core/sanitizer.ts`, and `src/integration/core/state-store.ts` so confirmed memory effects produce only bounded `HostOutputDirective` data (purpose, bounded text, verified delivery-mapping ID), never a callback or raw persisted content; checkpoint precedes recovery/guidance and passive learning remains observation-only.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts tests/integration/runtime-delivery.test.ts tests/utils/privacy.test.ts tests/utils/dedup.test.ts`
  - Expected: Core focused suites pass; no directive appears before memory confirmation, failures remain retryable, and no model-consumption state is claimed.

- [x] 2.4 **[deep] Implement neutral directive validation and response preservation** — create `src/integration/runtime/host-output.ts` for directive bounding, mapping metadata validation, and renderer selection only; modify `src/integration/runtime/integration-event-command.ts` to preserve `LifecycleResult.hostOutputDirective`, and modify `src/integration/runtime/hook-command.ts` plus response types to validate and carry it without narrowing/dropping it.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/runtime-delivery.test.ts tests/integration/hook-command.test.ts`
  - Expected: Bounded directive propagation passes; unknown/mismatched channels fail closed while confirmed memory results remain present and separate.

- [x] 2.5 **[deep] Add production resolver red tests with fixture values passed as inputs** — create `tests/integration/capability-evidence.test.ts` importing only `tests/fixtures/integration/host-evidence.ts`; pass fixture claims into the production API at `src/integration/runtime/capability-evidence.ts` and assert bounded version/payload/channel resolution, rejection of asset self-asserted `supported`/`verifiedEvents`, and explicit degraded/unsupported unknown cases before adapter execution (Runtime Activation scenarios).
  **Verification**:
  - Run: `pnpm exec vitest run tests/fixtures/integration/host-evidence.test.ts tests/integration/capability-evidence.test.ts`
  - Expected: The command fails only on named not-yet-implemented production-resolver assertions; fixture validation remains green and production has no dependency on `tests/fixtures`.

- [x] 2.6 **[deep] Implement production claim parsing/resolution before adapter execution** — create `src/integration/runtime/capability-evidence.ts` with bounded claim parsing/resolution; modify `src/integration/runtime/hook-command.ts` to resolve validated per-event asset/mapping/version/channel facts before selecting an adapter, reject asset self-asserted support/verified events, and return degraded/unsupported unknown claims without reversing confirmed memory effects.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/capability-evidence.test.ts tests/integration/hook-command.test.ts`
  - Expected: Resolver and hook-command suites pass; production imports no test fixture, unknown version/payload/channel fails closed, and adapters receive resolved evidence only.

- [x] 2.7 **[quick] Preserve finalization and fixed contracts after resolver integration** — modify diagnostics in `tests/integration/lifecycle.test.ts`, `tests/integration/hook-command.test.ts`, and `tests/tools/registry.test.ts` so unproven terminal signals remain degraded/unsupported and capability resolution adds no MCP tool, schema, public idempotency input, or prompt semantics.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/lifecycle.test.ts tests/integration/hook-command.test.ts tests/tools/registry.test.ts`
  - Expected: All suites pass with terminal capability independent from recovery/compaction/passive learning and exactly six public tools.

## Phase 3: Dependency-Correct Adapter and Native Asset Binding

- [x] 3.1 **[deep] Add adapter/resolver red tests after production resolver exists** — modify `tests/integration/adapters.test.ts` to pass standalone fixture claims through `src/integration/runtime/capability-evidence.ts` into OpenCode/Codex/Claude adapters; assert independent activation/recovery/compaction/passive-learning/terminal capabilities and no adapter inference from asset paths or exit codes.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/capability-evidence.test.ts tests/integration/adapters.test.ts`
  - Expected: The command fails only on named not-yet-implemented adapter behavior assertions; resolver tests and unrelated adapter assertions remain green.

- [x] 3.2 **[deep] Implement adapter mappings against resolved production evidence** — modify `src/integration/adapters/shared.ts`, `src/integration/adapters/opencode.ts`, `src/integration/adapters/codex.ts`, and `src/integration/adapters/claude-code.ts` to accept resolver output, emit verified mapping IDs, and keep capability states independent; do not import test fixtures.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/capability-evidence.test.ts tests/integration/adapters.test.ts`
  - Expected: Verified mappings pass; unknown/mismatched mappings fail closed with bounded diagnostics and confirmed memory effects are not reversed.

- [x] 3.3 **[deep] Add RED tests for the private two-phase OpenCode flow** — extend `tests/integration/opencode-runtime.test.ts` and, only where needed for nearest existing coverage, `tests/integration/lifecycle.test.ts` and `tests/integration/hook-command.test.ts`; use standalone fixture values, never test-module imports. Cover prepare as eligible-but-not-supported; confirmed memory yielding a bounded directive plus HMAC token; no directive/token on memory failure; exact v1.17.19 payload model/session shape; 1–1000 versus 1001 Unicode bounds; mapping/purpose/channel validation; global system/context deduplication and array identity; mutate→await structured log→confirm ordering; wrong, expired, cross-session, replay, and lock retry; confirmation failure without repeating memory; and `Promise<void>` with no consumption claim.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/capability-evidence.test.ts tests/integration/opencode-runtime.test.ts tests/integration/lifecycle.test.ts tests/integration/hook-command.test.ts`
  - Expected: The command fails only on the named not-yet-implemented two-phase OpenCode behavior assertions; capability, lifecycle, and hook setup assertions remain green, and the RED tests prove no fabricated version or model-consumption result.

- [x] 3.4 **[deep] Implement the private two-phase OpenCode flow** — modify `src/integration/runtime/capability-evidence.ts`, `src/integration/runtime/hook-command.ts`, `src/integration/runtime/integration-event-command.ts`, the core lifecycle/host-output/state-store files required to produce and confirm the bounded directive/token, and `integrations/opencode/plugin.mjs`. Resolve prepare as eligible-but-not-supported, then after confirmed memory issue only a bounded directive with an HMAC token bound to session/event/mapping/purpose/channel facts; preserve it through `integration-event-command` and `HookCommandResponse`. In the plugin, use the allowlisted callback/payload and exact v1.17.19 model/session shape, mutate the existing `output.system` array by merging the final entry or pushing when empty, append compacting guidance to `output.context`, await the structured `client.app.log`, then confirm using existing `confirmedEvents` state. Enforce 1–1000/1001 Unicode bounds, global system/context deduplication and array identity, wrong/expired/cross-session/replay/lock retry, and confirmation failure without repeating memory. The callback is `Promise<void>` with no returned emission object and no consumption claim; missing marker/payload/channel or unavailable host version fails closed without a fake version, duplicate static protocol/recovery context, lifecycle intent, MCP/HTTP tool, or schema change.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/opencode-runtime.test.ts tests/integration/capability-evidence.test.ts tests/integration/hook-command.test.ts tests/integration/lifecycle.test.ts`
  - Expected: All focused OpenCode, capability, hook, lifecycle/state, and directive suites pass; prepare remains distinct from supported activation, mutation→await log→confirm ordering is enforced, tokens are bound and single-use/retry-safe, and emission never claims model consumption.

- [x] 3.5 **[deep] Add Codex/Claude native-hook red tests** — create `tests/integration/native-hook-output.test.ts` importing only `tests/fixtures/integration/host-evidence.ts` and `tests/fixtures/packaging/disposable-harnesses.ts`; assert the shared runner constructs claims from immutable harness/hook/packaged mapping plus validated host facts, renders fixture-selected Codex/Claude native stdout JSON, rejects unknown/mismatched version/payload/channel, and never renders raw `HookCommandResponse`.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/native-hook-output.test.ts`
  - Expected: The command fails only on named not-yet-implemented native-envelope assertions; standalone fixture suites and unrelated runner assertions remain green.

- [x] 3.6 **[deep] Implement shared-runner claim construction and native rendering** — modify `integrations/shared/hook-runner.mjs`, `integrations/codex/hooks/hooks.json`, and `integrations/claude-code/hooks/hooks.json` to construct claims only from immutable packaged/hook/harness mapping plus validated host facts, carry the neutral directive, render exact fixture-selected native stdout JSON, and return `emitted_via_verified_channel` without claiming consumption or allowing asset self-assertion.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/native-hook-output.test.ts tests/integration/hook-command.test.ts`
  - Expected: Native-hook tests pass for verified envelopes and fail closed for unknown/mismatched claims; raw command responses are never rendered.

- [x] 3.7 **[quick] Run the complete native-asset suite only after all bindings exist** — modify `tests/integration/hook-command.test.ts` and `tests/packaging/packed-install.test.ts` only where needed to combine resolver, OpenCode, and Codex/Claude binding evidence.
  **Verification**:
  - Run: `pnpm exec vitest run tests/integration/capability-evidence.test.ts tests/integration/opencode-runtime.test.ts tests/integration/native-hook-output.test.ts tests/integration/hook-command.test.ts tests/packaging/packed-install.test.ts`
  - Expected: The full native-asset suite is green only after all resolver and host bindings pass, with activation, memory confirmation, directive readiness, local emission, and model consumption kept distinct.

## Phase 4: Executable Managed Claude Code Setup (tests first, then one integrated unit)

- [x] 4.1 **[deep] Add Claude manager/setup red tests from standalone fixtures** — create `tests/setup/claude-code.test.ts` importing only `tests/fixtures/setup/claude-manager-evidence.ts`; cover global/project scope, plan-only zero-write, executor/probe injection, manager uncertainty, coexistence, duplicate ownership, receipt mutation, lock acquisition, rollback, and later edits.
  **Verification**:
  - Run: `pnpm exec vitest run tests/fixtures/setup/claude-manager-evidence.test.ts tests/setup/claude-code.test.ts`
  - Expected: The command fails only on named not-yet-implemented Claude setup assertions; fixture validation and unrelated setup assertions remain green.

- [x] 4.2 **[deep] Implement the complete Claude setup unit and canonical routing before green verification** — create `src/setup/claude-code-cli.ts` and `src/setup/harnesses/claude-code.ts`; modify `src/setup/types.ts`, `src/setup/paths.ts`, `src/setup/engine.ts`, `src/setup/receipt.ts`, and `src/setup/transaction-lock.ts` where required to integrate public `claude-code`, private runtime `claude` translation, injected probe/command executor, planning, zero-write inspection, ownership-gated mutation, receipts, lock lifecycle, verification, rollback, and later-edit preservation.
  **Verification**:
  - Run: `pnpm exec vitest run tests/setup/claude-code.test.ts tests/setup/engine.test.ts tests/setup/rollback.test.ts`
  - Expected: The complete Claude setup suite is green before CLI routing; plan mode writes nothing, unsafe capability returns `requires_user_action`, receipts/locking are ownership-bounded, and OpenCode/Codex setup remains green.

- [x] 4.3 **[quick] Add CLI routing and deterministic result tests after setup core is green** — modify `tests/cli.test.ts` and `src/cli.ts` so `thoth-mem setup claude-code` accepts existing scope/plan/force/rollback/JSON controls and renders bounded evidence, receipts, and manual actions without accepting public `claude`.
  **Verification**:
  - Run: `pnpm exec vitest run tests/cli.test.ts tests/setup/claude-code.test.ts`
  - Expected: CLI and setup suites pass with established statuses and no secret/raw-config output.

## Phase 5: Inventory, Hermetic Packaging, and Docs-Only Smoke

- [x] 5.1 **[deep] Implement packed activation/recovery/compaction verification from standalone fixtures** — modify `tests/packaging/packed-install.test.ts` to import only `tests/fixtures/packaging/disposable-harnesses.ts` and `tests/fixtures/integration/host-evidence.ts`, install the packed tarball into isolated homes, exercise supported/unsupported directive channels, and assert activation, bounded output, checkpoint-before-guidance, and no source-checkout/real-home/credential dependency.
  **Verification**:
  - Run: `pnpm exec vitest run tests/fixtures/packaging/disposable-harnesses.test.ts tests/packaging/packed-install.test.ts`
  - Expected: Each harness records activation evidence or exact degraded/unsupported classification; native emission is proven only for verified channels and consumption is never claimed.

- [x] 5.2 **[deep] Add packed Claude coexistence/setup/rollback verification** — modify `tests/packaging/packed-install.test.ts` to import standalone Claude manager fixtures and prove plan zero-write, marketplace/manual preservation, receipt-only rollback, later-edit preservation, lock cleanup, and unavailable-manager manual guidance without cache cleanup.
  **Verification**:
  - Run: `pnpm exec vitest run tests/packaging/packed-install.test.ts tests/setup/claude-code.test.ts`
  - Expected: Disposable Claude setup is scoped, reversible, ownership-bounded, credential-free, and independent of a development checkout.

- [x] 5.3 **[deep] Update inventory and package verifier after packed behavior passes** — modify `integrations/inventory.json`, `scripts/sync-integration-assets.mjs`, and `scripts/verify-integration-package.mjs` to register changed assets and enforce inventory containment and packed disposable verification without editing `dist/`.
  **Verification**:
  - Run: `pnpm run integration:verify`
  - Expected: Inventory, manifest, version, containment, and package checks pass with no stale or out-of-scope asset.

- [x] 5.4 **[quick] Document opt-in real-host smoke without creating an entry point** — modify `README.md` with an operator-only procedure naming the existing host command, disposable/manual home requirement, evidence capture, credential warning, and explicit exclusion from `pnpm run build`, `pnpm test`, and `prepublishOnly`; do not add a package script.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: README is the only deliverable, the build remains hermetic, and no real-host smoke or external-server startup is invoked.

## Phase 6: Documentation, Regression, and Release Gate

- [x] 6.1 **[quick] Align repository maps with corrected resolver, ingress, transport, and setup boundaries** — modify `codemap.md` and `src/codemap.md` to name capability-evidence resolution before adapters, HostOutputDirective propagation, OpenCode protocolRequest/output mutation, Codex/Claude native stdout rendering, `emitted_via_verified_channel` versus consumption, and public/private harness identifiers; do not add formal Engram references.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Maps reference existing paths/commands and preserve six-tool, no-auto-start, capability-gated, and hermetic-release boundaries.

- [x] 6.2 **[deep] Run public-contract regression** — modify `tests/tools/registry.test.ts`, `tests/tools/mem-save.test.ts`, `tests/tools/mem-context.test.ts`, `tests/tools/mem-session.test.ts`, `tests/store/identity.test.ts`, and `tests/utils/privacy.test.ts` only where needed to prove public requests, identity/privacy, retrieval bounds, prompt rows, and exactly six tools remain unchanged.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/registry.test.ts tests/tools/mem-save.test.ts tests/tools/mem-context.test.ts tests/tools/mem-session.test.ts tests/store/identity.test.ts tests/utils/privacy.test.ts`
  - Expected: Fixed public/storage contracts pass with no schema migration, direct Store runtime path, or new tool.

- [x] 6.3 **[deep] Execute focused post-implementation suites after all dependencies complete** — run standalone fixture, resolver, core, adapter, OpenCode, native-hook, setup, packaging, CLI, and registry suites; retain unsupported host capabilities as explicit evidence.
  **Verification**:
  - Run: `pnpm exec vitest run tests/fixtures/integration/host-evidence.test.ts tests/fixtures/setup/claude-manager-evidence.test.ts tests/fixtures/packaging/disposable-harnesses.test.ts tests/integration/capability-evidence.test.ts tests/integration/runtime-delivery.test.ts tests/integration/lifecycle.test.ts tests/integration/adapters.test.ts tests/integration/hook-command.test.ts tests/integration/opencode-runtime.test.ts tests/integration/native-hook-output.test.ts tests/setup/claude-code.test.ts tests/setup/engine.test.ts tests/setup/rollback.test.ts tests/cli.test.ts tests/packaging/inventory.test.ts tests/packaging/packed-install.test.ts tests/tools/registry.test.ts`
  - Expected: All focused suites pass and evidence distinguishes activation, memory confirmation, directive readiness, local emission, model consumption (never claimed), compaction, passive learning, finalization, and setup ownership.

- [x] 6.4 **[quick] Run build and full release suite** — validate the complete change without inventing lint, real-host, credential, or external-server dependencies.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript, bundle, dashboard build, and package verification pass.
  - Run: `pnpm test`
  - Expected: Full Vitest passes, including fixture isolation, resolver/asset ingress, neutral directive transport, six-tool regression, and disposable credential-free release gates.
