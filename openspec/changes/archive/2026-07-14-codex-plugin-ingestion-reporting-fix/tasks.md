# Tasks: Codex Plugin Ingestion and Reporting Fix

> ⚠️ Warning: the working tree already contains unrelated edits, including edits in planned and protected setup files. Preserve them. Task 1.1 records the protected-surface baseline; later checks compare against that baseline rather than assuming `HEAD` matches the working tree. Do not reset, overwrite, or reformat unrelated hunks.

## Preservation Constraints

- Exact selected-scope marketplace and plugin lists remain the only authority for manager state; command output and hidden paths remain diagnostic evidence only.
- Marketplace and plugin operations remain independent, and `requires_user_action` outranks `partial` when safe recovery is ambiguous or unsupported.
- The automatic orphan-reconciliation budget is zero. Never directly delete, rename, rewrite, or repair Codex-owned state; render the fixed manual remove command only when the selected-scope grammar is recognized.
- The public status/step vocabulary, V1/V2 receipt schemas, 64 KiB command-output bound, 512-character diagnostic bound, 256-checkpoint limit, 1 MiB receipt limit, plugin bundle, inventory, package version, legacy fallback rules, and unrelated harnesses remain unchanged.
- All automated coverage uses injected or controlled commands, disposable homes/projects, credential-scrubbed environments, and explicit real-home isolation.
- `openspec/config.yaml` disables parallel markers, so this plan emits no `[P]` tasks. Tests are nevertheless ordered before their corresponding implementation work as required by this change handoff.

## Phase 1: Protected Baseline and Red Codex CLI Tests

- [x] 1.1 Capture protected public-contract, receipt, and bundle hashes before implementation — `src/setup/types.ts`, `src/setup/receipt.ts`, `src/cli.ts`, `package.json`, `.agents/plugins/marketplace.json`, `integrations/inventory.json`, `integrations/codex/**`
  **[USN-6]** | Priority: P1
  **Spec:** `cli/Codex Manager Operations MUST Be Independent and Verification-Authoritative#Clean current plugin installation verifies complete`
  **Independent Test:** Hash the protected files without modifying them and retain the ordered output in the apply progress evidence for comparison in task 5.6.
  **Verification**:
  - Run: `git hash-object src/setup/types.ts src/setup/receipt.ts src/cli.ts package.json .agents/plugins/marketplace.json integrations/inventory.json integrations/codex/.codex-plugin/plugin.json integrations/codex/.mcp.json integrations/codex/hooks/hooks.json integrations/codex/runners/hook-runner.mjs integrations/codex/skills/thoth-mem/SKILL.md`
  - Expected: One hash is produced for each listed existing file, with no working-tree mutation.

- [x] 1.2 Author red tests for allowlisted failure synthesis, redaction-before-truncation, and output-limit rereads — `tests/setup/codex-cli.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `cli/Codex Failure Diagnostics MUST Be Bounded, Redacted, and Actionable#Secret-bearing command output is redacted before persistence`
  **Independent Test:** Add controlled nonzero results containing authorization values, token-like fields, URL credentials, raw configuration, unrelated entries, absolute home prefixes, and output beyond 64 KiB; assert only a fixed <=512-character diagnostic survives and an exact reread still occurs.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: The new diagnostic/privacy cases fail before `src/setup/codex-cli.ts` normalizes command evidence safely; unrelated existing cases still run.

- [x] 1.3 Author red tests for exact-list precedence, independent operations, nonzero-then-verified success, and aggregate status precedence — `tests/setup/codex-cli.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `cli/Codex Manager Operations MUST Be Independent and Verification-Authoritative#Marketplace failure does not suppress a safe plugin attempt`
  **Spec:** `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely#Manual-recovery ambiguity overrides one verified operation`
  **Spec:** `cli/Setup Results and Exit Codes MUST Be Deterministic#Manual action exits three and outranks partial`
  **Spec:** `harness-integration/Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy#Modern operational failure does not activate legacy fallback`
  **Independent Test:** Drive clean, mixed, neither-verified, nonzero-then-present, and one-success-plus-ambiguity cases through the controlled executor; assert immutable scope, both safely available attempts, exact reread authority, and deterministic `complete`/`partial`/`failed`/`requires_user_action` results.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: The new authority/independence/status cases fail before structured per-operation evidence and precedence are implemented.

- [x] 1.4 Author red tests for corroborated orphan classification and fail-closed manual recovery — `tests/setup/codex-cli.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `harness-integration/Codex Orphan Residue Classification MUST Require Corroborated Safe Evidence#Collision plus exact absence classifies stale residue`
  **Independent Test:** Cover collision-plus-stable-exact-absence, path-only, message-only, wrong-scope, conflicting/malformed state, divergent source, escaped link/reparse evidence, and material/concurrent state change without inspecting or mutating a real Codex home.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: The new classification cases fail until only corroborated same-scope evidence identifies stale residue and every ambiguous case fails closed.

- [x] 1.5 Author red tests for capability-gated manual remove guidance, zero automatic cleanup, force invariance, and attempt/reread checkpoint order — `tests/setup/codex-cli.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `harness-integration/Codex Orphan Reconciliation MUST Be Supported, Scoped, and Fail Closed#No supported reconciliation returns user action`
  **Independent Test:** Assert recognized global help renders exactly `codex plugin marketplace remove thoth-mem --json`, project help uses a `<selected-project>` placeholder, unknown grammar invents no command, neither normal nor `--force` invokes remove/direct cleanup, and checkpoint failure halts before reread or the next mutation.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: The new manual-action/no-cleanup/checkpoint-order cases fail until the fixed grammar and phase-aware checkpoint contract exist.

## Phase 2: Codex CLI Evidence and Manual-Recovery Implementation

- [x] 2.1 Implement safe command-evidence normalization and bounded diagnostics — `src/setup/codex-cli.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `cli/Codex Failure Diagnostics MUST Be Bounded, Redacted, and Actionable#Oversized nonzero output is handled deterministically`
  **Independent Test:** Run the adapter suite and inspect that raw successful help/list output stays parser-local while nonzero output is classified, synthesized from allowlisted fields, redacted, then truncated to <=512 characters.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Diagnostic, secret-bearing, and oversized-output cases pass; raw nonzero output, unrelated entries, credentials, and absolute home prefixes never reach execution evidence.

- [x] 2.2 Add immutable initial/final exact state and semantic per-operation execution evidence — `src/setup/codex-cli.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `harness-integration/Hidden Codex Manager Residue MUST NOT Equal Registered State#Nonzero command cannot negate exact verified state`
  **Independent Test:** Verify each `codex-marketplace` and `codex-plugin` result carries the selected-scope initial state, safe-attempt state, command reason/class, exact reread state, final outcome, and manual-action flag without exposing raw output.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Exact same-scope rereads decide final outcomes, nonzero-then-present confirms, and other-scope/hidden residue never establishes state.

- [x] 2.3 Execute marketplace and plugin operations independently and derive deterministic aggregate status — `src/setup/codex-cli.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `cli/Codex Manager Operations MUST Be Independent and Verification-Authoritative#Exactly one verified manager operation is partial`
  **Spec:** `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely#One modern operation has an ordinary failure after another succeeds`
  **Spec:** `cli/Setup Results and Exit Codes MUST Be Deterministic#Ordinary partial external completion exits two`
  **Spec:** `harness-integration/Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy#Modern operational failure does not activate legacy fallback`
  **Independent Test:** Exercise all verified-count and ambiguity combinations while asserting one operation never suppresses or rewrites the other and modern execution never activates `legacy_filesystem`.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Both exact states present yields `complete`; one present plus one ordinary safe failure yields `partial`; neither present after safe attempts yields `failed`; ambiguity or unsupported recovery yields `requires_user_action`.

- [x] 2.4 Implement attempt/reread checkpoint phases and stop at the last durable boundary — `src/setup/codex-cli.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven#Attempt checkpoint precedes verification checkpoint`
  **Independent Test:** Capture controlled call order and inject failures at the attempt and reread checkpoint boundaries for each operation.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Each attempted operation persists attempt evidence before exact reread and reread evidence before the next mutation; any checkpoint failure stops later mutation and final execution evidence contains no `planned` outcome.

- [x] 2.5 Implement corroborated orphan classification and capability-gated manual remove rendering — `src/setup/codex-cli.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `harness-integration/Codex Orphan Reconciliation MUST Be Supported, Scoped, and Fail Closed#Force cannot create cleanup authority`
  **Independent Test:** Run the orphan matrix with and without recognized remove help, at global/project scope, and with `--force`; inspect executor calls to prove remove/direct cleanup is never invoked.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Stable collision-plus-exact-absence produces bounded `requires_user_action`; only recognized grammar renders the fixed manual command/template; ambiguous evidence produces generic safe guidance; zero automatic/direct cleanup and no legacy fallback occur.

## Phase 3: Red Engine Consistency Tests and Semantic Projection

- [x] 3.1 Author red tests for semantic ID/phase projection and cross-surface agreement — `tests/setup/engine.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven#Renderings agree with signed evidence`
  **Independent Test:** Feed structured marketplace/plugin operation evidence with mixed outcomes and assert ordered operation, checkpoint, reread, and final-verification rows agree across `SetupResult`, JSON formatting, human formatting, and the final signed V2 receipt.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: The new consistency cases fail while engine projection still joins by display name or blanket-promotes planned rows.

- [x] 3.2 Author red tests for checkpoint-failure recovery boundaries, final status precedence, and unchanged V2 limits — `tests/setup/engine.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven#Checkpoint failure stops the flow truthfully`
  **Independent Test:** Inject attempt/reread persistence failures and near-limit checkpoint/diagnostic payloads; assert later mutations stop, the last valid signed receipt stays authoritative, final mutating rows contain no `planned`, and existing V2 limits reject overflow.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: The new recovery/limit/no-blanket-promotion cases fail before evidence-driven receipt finalization is implemented.

- [x] 3.3 Replace name-based Codex receipt mapping with semantic ID/phase projection — `src/setup/engine.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven#Failed attempt does not confirm later planned rows`
  **Independent Test:** Project the existing ordered display vocabulary from `codex-marketplace`/`codex-plugin` evidence and deterministic attempt/reread phases, then compare every projected row with the signed receipt boundary.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: Failed, skipped, and unavailable rows remain truthful; only persisted checkpoints and completed exact rereads can confirm; no final mutating row is promoted merely because it appeared in the plan.

- [x] 3.4 Finalize V2 receipt and `SetupResult` from the same operation evidence — `src/setup/engine.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven#Nonzero then verified is rendered consistently`
  **Independent Test:** Exercise complete, partial, failed, orphan `requires_user_action`, nonzero-then-verified, and checkpoint-failure flows and compare final receipt status/steps with the single `SetupResult` object consumed by both renderers.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: Final receipt persistence precedes result projection; receipt, human, and JSON surfaces agree; V2 schema/limits remain unchanged; checkpoint failure reports the last durable boundary and stops later mutation.

## Phase 4: Packed Disposable-Home Recovery Regression

- [x] 4.1 Add a packed orphan-residue regression with a real-home isolation guard — `tests/packaging/packed-install.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `cli/Automated Codex Setup Verification MUST Be Isolated From Real User State#Real-home target is rejected by automated verification`
  **Independent Test:** Extend the controlled launcher so the orphan exists only under a disposable `CODEX_HOME`, exact lists remain absent, add emits the recognized collision, remove is help-advertised, credentials are scrubbed, resolved overlap with the active real home fails before mutation, and an outside sentinel is hashed before/after.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: Packed setup exits 3 with bounded manual guidance, preserves the orphan, does not call remove, never targets the real home, and leaves the outside sentinel unchanged.

- [x] 4.2 Prove controlled manual remove followed by a fresh packed setup rerun — `tests/packaging/packed-install.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `cli/Automated Codex Setup Verification MUST Be Isolated From Real User State#Packed-flow regression remains disposable`
  **Independent Test:** Invoke the controlled Codex-supported remove command exactly once outside setup, verify exact absence, rerun packed setup from a fresh preflight, and assert exact marketplace/plugin success in the same disposable home.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: Manual remove succeeds only in disposable state, the rerun returns `complete`, exact lists contain the current marketplace/plugin identities, the outside sentinel and real home remain untouched, and no source checkout or ambient credential is required.

## Phase 5: Focused and Repository Verification

- [x] 5.1 Run the complete focused Codex CLI adapter suite — `tests/setup/codex-cli.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `cli/Codex Failure Diagnostics MUST Be Bounded, Redacted, and Actionable#Recognized orphan collision remains useful and bounded`
  **Independent Test:** Run only the adapter test file after all adapter and engine changes.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: All adapter tests pass, including privacy/output bounds, exact authority, independent operations, status precedence, manual-only recovery, and checkpoint order.

- [x] 5.2 Run the complete focused setup engine suite — `tests/setup/engine.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven#Renderings agree with signed evidence`
  **Independent Test:** Run only the engine test file after semantic projection and finalization changes.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: All engine tests pass, with no planned-row promotion, status/rendering drift, checkpoint-order drift, or V2 bound regression.

- [x] 5.3 Run the complete packed-install suite — `tests/packaging/packed-install.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `cli/Automated Codex Setup Verification MUST Be Isolated From Real User State#Clean and orphan regressions use controlled execution`
  **Independent Test:** Run only the packed artifact suite with its controlled launchers and disposable homes.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: All packed tests pass without real-home access, ambient credentials, source-checkout dependency, direct orphan cleanup, or outside-sentinel mutation.

- [x] 5.4 Run the repository build gate — project-wide
  **[USN-6]** | Priority: P1
  **Spec:** `cli/Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven#Renderings agree with signed evidence`
  **Independent Test:** Execute the packaged build script exactly as defined in `package.json`.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript no-emit checking, package build/integration verification, and dashboard build all complete successfully.

- [x] 5.5 Run the full Vitest suite — project-wide
  **[USN-6]** | Priority: P1
  **Spec:** `cli/Codex Manager Operations MUST Be Independent and Verification-Authoritative#Clean current plugin installation verifies complete`
  **Independent Test:** Execute the repository test script without filters.
  **Verification**:
  - Run: `pnpm test`
  - Expected: The complete Vitest suite passes with no regression in legacy setup, rollback, OpenCode, Claude Code, packaging, or unrelated MCP behavior.

- [x] 5.6 Compare protected hashes and verify the unchanged integration bundle — protected surfaces and packaged assets
  **[USN-6]** | Priority: P1
  **Spec:** `harness-integration/Codex Orphan Reconciliation MUST Be Supported, Scoped, and Fail Closed#Reconciliation failure does not activate legacy ownership`
  **Independent Test:** Re-run the exact task 1.1 hash command and compare the ordered hashes with the recorded pre-implementation baseline, then execute the existing read-only integration verifier.
  **Verification**:
  - Run: `git hash-object src/setup/types.ts src/setup/receipt.ts src/cli.ts package.json .agents/plugins/marketplace.json integrations/inventory.json integrations/codex/.codex-plugin/plugin.json integrations/codex/.mcp.json integrations/codex/hooks/hooks.json integrations/codex/runners/hook-runner.mjs integrations/codex/skills/thoth-mem/SKILL.md`
  - Expected: Every hash exactly matches the task 1.1 baseline, proving this change added no public result, receipt schema, formatter, package-version, inventory, or Codex bundle drift.
  - Run: `pnpm run integration:verify`
  - Expected: The existing integration inventory and packaged Codex assets verify successfully without synchronization or mutation.

## Requirement Traceability

| Delta requirement | Covered by tasks |
| --- | --- |
| `cli/Codex Manager Operations MUST Be Independent and Verification-Authoritative` | 1.1, 1.3, 2.3, 5.5 |
| `cli/Codex Failure Diagnostics MUST Be Bounded, Redacted, and Actionable` | 1.2, 2.1, 5.1 |
| `cli/Codex Receipt Checkpoints and Result Renderings MUST Be Evidence-Driven` | 2.4, 3.1-3.4, 5.2, 5.4 |
| `cli/Automated Codex Setup Verification MUST Be Isolated From Real User State` | 4.1, 4.2, 5.3 |
| `harness-integration/Hidden Codex Manager Residue MUST NOT Equal Registered State` | 2.2 |
| `harness-integration/Codex Orphan Residue Classification MUST Require Corroborated Safe Evidence` | 1.4 |
| `harness-integration/Codex Orphan Reconciliation MUST Be Supported, Scoped, and Fail Closed` | 1.5, 2.5, 5.6 |
| `cli/Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely` | 1.3, 2.3 |
| `cli/Setup Results and Exit Codes MUST Be Deterministic` | 1.3, 2.3 |
| `harness-integration/Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy` | 1.3, 2.3 |

Coverage: 10 of 10 delta requirements (100%).
