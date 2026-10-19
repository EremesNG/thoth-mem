# Tasks: Codex Plugin Manager Ownership

> Planning flags: `rules.tasks.parallel_markers` is disabled, so this plan emits no `[P]` markers. `rules.tasks.tdd` is absent and `rules.apply.tdd` is `false`; nevertheless, behavior-changing work is deliberately sequenced test-first so each red case precedes its implementation.

## Preserved Handoff Constraints

- Keep one immutable strategy per mutating attempt; never recover from a modern operational failure by installing the legacy path.
- Preserve exact, independent, scope-bound marketplace/plugin verification, including fail-closed advertised JSON and strict legacy parsing only when JSON is unavailable.
- Preserve clean modern, clean legacy, proven dual-owned, ambiguous, partial, interrupted, global/project, repeat no-op, and executable-path-variation cases.
- Checkpoint verified manager state before legacy removal; require the pinned receipt-or-complete-corroboration ownership proof; `--force` never creates ownership.
- Keep Receipt V1 readable only for its original claims, add bounded Receipt V2 evidence, reread final post-command state, and roll back fragments rather than whole config files.
- Keep automated Codex coverage isolated and credential-free, retain checkout-independent OpenCode/Claude coverage, and leave real Codex mutation behind the separate manual gate at the end.

## Phase 1: Resolve Design Anchors

- [x] 1.1 Resolve the receipt/type extension symbols before adding V2 contracts — `src/setup/types.ts`, `src/setup/receipt.ts`, `src/setup/engine.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Every Mutating Attempt MUST Emit an Ownership Receipt`
  **Independent Test:** Record in the task completion note the exact exported or internal V1 symbols that will be extended, the V2 discriminant location, and the bounded V1-read boundary; do not introduce a parallel wrapper without this decision.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/setup/rollback.test.ts`
  - Expected: Existing receipt/recovery baselines pass, and the completion note names concrete symbols from the three inspected files.

- [x] 1.2 Fix the compatibility-table and immutable strategy-decision location — `src/setup/codex-cli.ts`, `src/setup/engine.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `harness-integration/Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy`
  **Independent Test:** Record the chosen existing module and exact version/capability inputs; the decision must be computable without mutation and freeze before receipt creation.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts tests/setup/engine.test.ts`
  - Expected: Current capability and setup baselines pass, and the completion note identifies one concrete compatibility/decision anchor without inventing a new module path.

- [x] 1.3 Bound supported manager removal and project-scope grammar — `src/setup/codex-cli.ts`, `tests/setup/codex-cli.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Rollback MUST Restore Only Receipt-Owned Changes`
  **Independent Test:** Enumerate only removal/scope forms whose help grammar and post-removal state can both be independently verified; classify every other form as manual-only.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Existing grammar tests pass, and the completion note records supported argument arrays plus explicit unsupported/manual-only cases.

- [x] 1.4 Select the managed TOML fragment parse/remove/restore boundary — `src/setup/harnesses/codex.ts`, `src/setup/managed-config.ts`, `src/setup/filesystem.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Setup MUST Merge Only Managed Configuration`
  **Independent Test:** Record whether the existing Codex marker helpers can be extended or must expose a narrow fragment contract; whole-file restore must not appear in the selected interface.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/setup/rollback.test.ts`
  - Expected: Existing managed-config/rollback baselines pass, and the completion note identifies the exact helper boundary for fragment-only operations.

- [x] 1.5 Map the controlled packed-fixture anchors — `tests/packaging/packed-install.test.ts`
  **[USN-5]** | Priority: P2
  **Spec:** `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`
  **Independent Test:** Record the existing inline fixture helpers to extend (`packAndInstall`, `runPackedCli`, Codex fixture generation, isolated environment helpers) and the assertions that prove no real Codex home is touched.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: The current packed-install suite passes, and the completion note references existing helpers rather than a fabricated fixture directory.

- [x] 1.6 Freeze documentation timing after controlled behavior is stable — `README.md`, `codemap.md`, `src/codemap.md`
  **[USN-5]** | Priority: P3
  **Spec:** `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`
  **Independent Test:** Record that operator wording is updated only after focused modern/legacy/migration/rollback and packed tests pass, so documentation cannot promise an unverified command grammar.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: The pre-change build baseline succeeds, and the completion note fixes documentation as a post-controlled-verification task.

## Phase 2: Manager Evidence and Strategy

- [x] 2.1 Complete red structured-verifier cases already started — `tests/setup/codex-cli.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `harness-integration/Codex Manager State Verification MUST Be Exact and Fail Closed`
  **Independent Test:** Add or retain cases for independent per-command `--json`, exact Git provenance, exact installed-and-enabled identity, malformed/schema-mismatched JSON, lookalikes, strict legacy tables, scoped arrays, output caps, and privacy-safe diagnostics.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: The new assertions execute and fail only where the structured verifier is incomplete; unrelated Codex CLI tests remain green.

- [x] 2.2 Finish the structured verifier and strict legacy fallback — `src/setup/codex-cli.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `harness-integration/Codex Manager State Verification MUST Be Exact and Fail Closed`
  **Independent Test:** Run only the Codex CLI suite and confirm advertised malformed JSON never reaches text matching while non-JSON commands accept only recognized exact legacy rows.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: All structured, mixed-capability, lookalike, bounded-output, and strict-legacy cases pass.

- [x] 2.3 Author red capability/strategy matrix cases — `tests/setup/codex-cli.test.ts`, `tests/setup/engine.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `harness-integration/Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy`
  **Independent Test:** Cover tested-version plus complete scoped capability, version-only evidence, unavailable scope, unclassifiable existing manager state, and post-selection failure without legacy fallback.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts tests/setup/engine.test.ts`
  - Expected: New matrix cases fail on the missing immutable selector or forbidden fallback, while existing setup behavior remains characterized.

- [x] 2.4 Implement immutable modern/legacy strategy selection — `src/setup/codex-cli.ts`, `src/setup/engine.ts`, `src/setup/paths.ts`, `src/setup/types.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `harness-integration/Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy`
  **Independent Test:** Verify each version/scope/capability state selects exactly one strategy or blocks before mutation; modern operational failure must preserve the selected modern classification.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts tests/setup/engine.test.ts`
  - Expected: The capability matrix passes with exact `complete`, `partial`, `failed`, and `requires_user_action` outcomes and no implicit legacy mutation.

- [x] 2.5 Author red bounded-degradation and ambiguity cases — `tests/setup/codex-cli.test.ts`, `tests/setup/engine.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `harness-integration/Unproven Codex Ownership Evidence MUST Be Explicit and Non-Destructive`
  **Independent Test:** Inject secrets, unrelated entries, malformed evidence, partial manager state, and legacy lookalikes; assert zero destructive mutation and bounded, redacted operator guidance.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts tests/setup/engine.test.ts`
  - Expected: New cases fail only on missing fail-closed classification, mutation blocking, or diagnostic redaction/bounds.

- [x] 2.6 Implement bounded non-destructive degradation — `src/setup/codex-cli.ts`, `src/setup/engine.ts`, `src/setup/harnesses/codex.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `harness-integration/Unproven Codex Ownership Evidence MUST Be Explicit and Non-Destructive`
  **Independent Test:** Confirm unknown/conflicting manager or legacy evidence never establishes ownership, never leaks raw output/config, and never triggers a guessed mutation.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts tests/setup/engine.test.ts`
  - Expected: All ambiguity, partial-state, privacy, and bounded-diagnostic cases pass with zero unsafe mutation.

- [x] 2.7 Author red ordered marketplace/plugin orchestration cases — `tests/setup/engine.test.ts`, `tests/setup/codex-cli.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely`
  **Independent Test:** Assert independent plan/attempt/checkpoint/verify steps, exact aggregate status, selected-scope arrays, command-success-without-state failure, and absence of legacy copy/config actions.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts tests/setup/engine.test.ts`
  - Expected: New orchestration cases fail before implementation on ordering, status, checkpoint, or exclusivity gaps only.

- [x] 2.8 Implement safe manager orchestration without legacy fallback — `src/setup/codex-cli.ts`, `src/setup/engine.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely`
  **Independent Test:** Run the focused suites with injected executors and verify marketplace success cannot mask plugin failure or create a direct-copy/config fallback.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts tests/setup/engine.test.ts`
  - Expected: Ordered independent operations, checkpoints, rereads, exact verification, and aggregate statuses all pass without legacy actions.

## Phase 3: Receipt V2 and Stable Legacy Identity

- [x] 3.1 Author red Receipt V2 and bounded V1-read cases — `tests/setup/engine.test.ts`, `tests/setup/rollback.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Every Mutating Attempt MUST Emit an Ownership Receipt`
  **Independent Test:** Cover strategy/evidence fields, pre-existing versus attempt-created manager state, write-ahead persistence, per-command and per-fragment checkpoints, checkpoint failure, final reread evidence, signing/tamper checks, and V1 claim bounds.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/setup/rollback.test.ts`
  - Expected: New receipt assertions execute red for missing V2/order semantics while current V1 validation remains green.

- [x] 3.2 Implement strategy/evidence contracts, Receipt V2, and V1 dispatch — `src/setup/types.ts`, `src/setup/receipt.ts`, `src/setup/engine.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Every Mutating Attempt MUST Emit an Ownership Receipt`
  **Independent Test:** Verify an `in_progress` signed receipt exists before any mutation, every attempted command/removal is durably checkpointed, and final evidence comes from post-external rereads rather than a pre-command whole-config hash.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/setup/rollback.test.ts`
  - Expected: V2 write-ahead/checkpoint/finalization and bounded V1-read cases pass; secrets, raw config, and unrelated cache content are absent from receipts.

- [x] 3.3 Author red stable legacy identity cases — `tests/setup/engine.test.ts`, `tests/packaging/packed-install.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Legacy Codex Installation Freshness MUST Use Stable Package and Content Identity`
  **Independent Test:** Separate executable/shim-path-only variation from package, manifest/content, scope, target, harness, and owned-content drift; include old metadata with insufficient destructive authority.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/packaging/packed-install.test.ts`
  - Expected: Path-only cases expose the current false-staleness behavior, while true content drift and insufficient old metadata remain rejected.

- [x] 3.4 Implement stable metadata/content freshness — `src/setup/engine.ts`, `src/setup/filesystem.ts`, `src/setup/paths.ts`, `src/setup/types.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Legacy Codex Installation Freshness MUST Use Stable Package and Content Identity`
  **Independent Test:** Repeat a controlled legacy setup through a different executable path and verify zero asset/config/metadata/receipt mutation; then change content identity and verify a safe stale/conflict outcome.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/packaging/packed-install.test.ts`
  - Expected: Path-only variation is a verified no-op, real identity drift remains actionable, and executable paths are diagnostic rather than authoritative.

## Phase 4: Planning, Migration, Rollback, and Idempotency

- [x] 4.1 Author red zero-write plan cases for global and project scope — `tests/setup/engine.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `cli/Plan-Only Setup MUST Perform Zero Writes`
  **Independent Test:** Cover clean modern, clean legacy, proven dual, and ambiguous states; assert exact ordered strategy actions with no file, backup, receipt, registration, or mutating executor call.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: New plan cases fail only where strategy-specific action lists or zero-write guarantees are incomplete.

- [x] 4.2 Split modern and legacy inspection/planning paths — `src/setup/engine.ts`, `src/setup/paths.ts`, `src/setup/harnesses/codex.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `cli/Plan-Only Setup MUST Perform Zero Writes`
  **Independent Test:** Modern plans contain manager operations/checkpoints/verification only; legacy plans contain owned copy/config/metadata only; dual plans show verify-before-remove ordering.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: All global/project plan cases pass with deterministic steps, selected strategy/evidence, and zero mutation.

- [x] 4.3 Author red managed-fragment preservation cases — `tests/setup/engine.test.ts`, `tests/setup/rollback.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Setup MUST Merge Only Managed Configuration`
  **Independent Test:** Assert modern setup never writes legacy activation/global MCP definitions; legacy setup changes exact marker fragments only; force cannot claim ambiguity; later unrelated Codex/user edits survive completion and rollback.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/setup/rollback.test.ts`
  - Expected: New semantic/byte-preservation assertions fail only on whole-file or over-broad fragment behavior.

- [x] 4.4 Implement fragment-only legacy config mutation and restore — `src/setup/harnesses/codex.ts`, `src/setup/managed-config.ts`, `src/setup/filesystem.ts`, `src/setup/engine.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Setup MUST Merge Only Managed Configuration`
  **Independent Test:** Mutate and restore an exact managed fragment around unrelated later edits, then compare unrelated TOML semantics/bytes and confirm no whole-config replacement API is used.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/setup/rollback.test.ts`
  - Expected: Modern exclusivity, legacy fragment ownership, force boundaries, and later-change preservation all pass.

- [x] 4.5 Author red safe dual-migration and interruption cases — `tests/setup/engine.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Codex Setup MUST Safely Migrate Proven Dual-Owned State`
  **Independent Test:** Cover signed-receipt proof, complete corroborating proof, each partial/ambiguous proof component, no-force migration, global/project scope, manager-checkpoint failure, interruption after each fragment removal, and final reread.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: New scenarios fail before implementation on proof, order, checkpoint, recovery, or state-preservation gaps; ambiguous fixtures remain unchanged.

- [x] 4.6 Implement verify-checkpoint-remove-reread migration — `src/setup/engine.ts`, `src/setup/harnesses/codex.ts`, `src/setup/filesystem.ts`, `src/setup/receipt.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Codex Setup MUST Safely Migrate Proven Dual-Owned State`
  **Independent Test:** Prove a usable dual state survives every pre-removal failure, proven fragments are removed one-by-one only after durable manager evidence, and recovery converges to verified dual or modern state without force.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: Proven global/project migrations finish single-owned; ambiguous/partial proof is zero-write; every interruption has a receipt-backed usable recovery path.

- [x] 4.7 Author red strategy-bounded rollback cases — `tests/setup/rollback.test.ts`, `tests/setup/codex-cli.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Rollback MUST Restore Only Receipt-Owned Changes`
  **Independent Test:** Cover attempt-created versus pre-existing manager state, supported/unsupported removal grammar, direct-cache/config prohibition, legacy fragment restore, migration fragment restore, divergence/tamper rejection, later edits, and repeated no-op.
  **Verification**:
  - Run: `pnpm test -- tests/setup/rollback.test.ts tests/setup/codex-cli.test.ts`
  - Expected: New rollback cases fail only where authority, removal verification, fragment restoration, divergence, or idempotency is missing.

- [x] 4.8 Implement modern, legacy, and migration rollback boundaries — `src/setup/engine.ts`, `src/setup/codex-cli.ts`, `src/setup/receipt.ts`, `src/setup/filesystem.ts`, `src/setup/harnesses/codex.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Rollback MUST Restore Only Receipt-Owned Changes`
  **Independent Test:** Modern rollback uses only verified manager commands for receipt-created state; unsupported grammar is manual-only; legacy/migration rollback touches only exact receipt fragments and preserves later unrelated changes.
  **Verification**:
  - Run: `pnpm test -- tests/setup/rollback.test.ts tests/setup/codex-cli.test.ts`
  - Expected: All strategy, authority, divergence, preservation, and repeat no-op rollback cases pass without direct manager cache/config mutation.

- [x] 4.9 Author red repeat no-op cases across successful routes — `tests/setup/engine.test.ts`, `tests/packaging/packed-install.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Repeated Setup MUST Be Idempotent`
  **Independent Test:** Repeat clean modern, clean legacy, migrated dual, global/project, and executable-path-variation setups; assert `complete`, `changed=false`, zero mutating command, and no backup/receipt/config/asset write.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/packaging/packed-install.test.ts`
  - Expected: New repeat assertions expose any remaining unnecessary manager, filesystem, metadata, backup, or receipt mutation.

- [x] 4.10 Implement verified-state idempotency — `src/setup/engine.ts`, `src/setup/codex-cli.ts`, `src/setup/paths.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Repeated Setup MUST Be Idempotent`
  **Independent Test:** Run each successful controlled route twice and confirm the second inspection derives a no-op from manager evidence or stable legacy identity before creating a mutation receipt.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts tests/packaging/packed-install.test.ts`
  - Expected: Every successful repeat case returns `complete`/`changed=false` with zero mutation and no receipt; actual drift still plans a bounded action.

## Phase 5: Packed Identity and Controlled Smoke

- [x] 5.1 Author red canonical modern/legacy package-identity assertions — `tests/packaging/packed-install.test.ts`
  **[USN-5]** | Priority: P2
  **Spec:** `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`
  **Independent Test:** Compare `.agents/plugins/marketplace.json`, `integrations/codex/.codex-plugin/plugin.json`, `integrations/codex/.mcp.json`, `integrations/codex/hooks/hooks.json`, `integrations/codex/runners/hook-runner.mjs`, `integrations/codex/skills/thoth-mem/SKILL.md`, `integrations/inventory.json`, and the packed package version without resolving checkout files.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: New identity/content assertions execute red only for missing compatibility or checkout-independent verification; existing OpenCode/Claude coverage stays intact.

- [x] 5.2 Enforce one canonical packed identity for both strategies — `scripts/verify-integration-package.mjs`, `integrations/inventory.json`, `.agents/plugins/marketplace.json`, `integrations/codex/.codex-plugin/plugin.json`, `integrations/codex/.mcp.json`
  **[USN-5]** | Priority: P2
  **Spec:** `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`
  **Independent Test:** Verify manager-facing descriptors and legacy-consumed runtime assets resolve the same plugin/package version and declared content, while modern setup still performs no direct copy.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Read-only integration verification and the full build pass; any divergent or missing declared Codex asset fails with its exact packed path.

- [x] 5.3 Author red controlled tarball scenarios — `tests/packaging/packed-install.test.ts`
  **[USN-5]** | Priority: P2
  **Spec:** `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`
  **Independent Test:** Extend existing inline fixtures for modern, legacy, proven dual, ambiguous with/without force, global/project, repeat no-op, path variation, interruption/recovery, and checkout isolation; assert the real personal/global Codex home and credentials are never read or mutated.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: New packed scenarios execute against isolated homes and fail only on unimplemented setup behavior; no real Codex mutation command runs.

- [x] 5.4 Complete controlled packed fixtures and production integration gaps — `tests/packaging/packed-install.test.ts`, `src/setup/engine.ts`, `src/setup/codex-cli.ts`, `src/setup/paths.ts`
  **[USN-5]** | Priority: P2
  **Spec:** `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`
  **Independent Test:** Install the actual tarball, execute every controlled Codex route in isolated global/project homes, repeat successful routes, and verify checkout independence plus preserved OpenCode/Claude smoke behavior.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: All controlled packed scenarios pass without credentials, source-checkout runtime references, or mutation of a real Codex home.

## Phase 6: Documentation and Release Gates

- [x] 6.1 Document verified ownership, migration, and recovery behavior — `README.md`, `codemap.md`, `src/codemap.md`
  **[USN-5]** | Priority: P3
  **Spec:** `packaging/Published Package MUST Contain Native Assets for All Three Harnesses`
  **Independent Test:** Describe modern exclusive manager ownership, capability-gated legacy fallback, safe dual migration, strategy-bounded rollback, repeat no-op behavior, manual-only unsupported removal, and the separate real-smoke authorization gate using only verified command forms.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Documentation matches the implemented file/command ownership model, codemaps name the final module responsibilities, and the build remains green.

- [x] 6.2 Run focused setup/rollback/packed verification, then build and full tests — affected setup and packaging modules
  **[USN-5]** | Priority: P1
  **Spec:** `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`
  **Independent Test:** Execute focused suites first to localize failures, then verify TypeScript/build/package integrity and the entire Vitest suite without a real Codex mutation.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts tests/setup/engine.test.ts tests/setup/rollback.test.ts tests/packaging/packed-install.test.ts`
  - Run: `pnpm run build`
  - Run: `pnpm test`
  - Expected: Focused suites, package/build verification, and the full suite all pass; no test accesses or mutates a real personal/global Codex installation.

- [x] 6.3 Run the publish gate from the final working tree — package release surface
  **[USN-5]** | Priority: P1
  **Spec:** `packaging/Installation Smoke Tests MUST Execute From the Packed Artifact`
  **Independent Test:** Execute the repository's existing release gate after all focused and full checks; do not add or invoke a nonexistent lint command.
  **Verification**:
  - Run: `pnpm run prepublishOnly`
  - Expected: The packaged build and full test suite complete successfully with controlled Codex fixtures only.

## Manual Gate: Real Codex Mutation Smoke (Not Part of Automated `sdd-apply`)

Do not execute a real `codex plugin marketplace add`, `codex plugin add/remove`, or mutating `thoth-mem setup codex` smoke as part of these tasks. After deterministic controlled verification and plan review pass, request separate explicit user authorization. Any authorized smoke must use disposable controlled global and project Codex homes, a known installable marketplace ref, and independent post-command verification; otherwise it remains manual-only.
