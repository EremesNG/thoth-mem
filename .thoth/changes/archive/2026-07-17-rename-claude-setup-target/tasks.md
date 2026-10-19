# Tasks: Rename the Claude Setup Target

## Phase 1: TDD Contract Tests (RED First)

- [x] 1.1 Update CLI contract tests for `claude` acceptance and `claude-code` rejection — `tests/cli.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code`
  **Independent Test:** The CLI help and eager-dispatch tests assert `setup <opencode|codex|claude>`, dispatch `claude` with the existing controls, and reject `claude-code` before the setup runner is called.
  **Verification**:
  - Run: `pnpm test -- tests/cli.test.ts`
  - Expected: The newly authored assertions execute and fail RED because the implementation still advertises and accepts `claude-code`.

- [x] 1.2 Update parser/result tests for the renamed setup-contract union — `tests/setup/engine.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `cli/Setup Results and Exit Codes MUST Be Deterministic`
  **Independent Test:** Parser tests accept `claude`, reject `claude-code`, and keep scope, plan, JSON, rollback, status, and exit-code fields unchanged for the accepted request/result shape.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: The updated parser and result expectations fail RED until `SetupHarness` and validation are changed.

- [x] 1.3 Update Claude setup, receipt, rollback, and ownership tests before implementation — `tests/setup/claude-code.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `cli/Every Mutating Attempt MUST Emit an Ownership Receipt`
  **Independent Test:** Claude setup requests and newly written receipts use `harness: 'claude'`; loading a receipt with `harness: 'claude-code'` is rejected; plan, no-op, rollback, ownership, and asset-path assertions retain Claude Code product paths and behavior.
  **Verification**:
  - Run: `pnpm test -- tests/setup/claude-code.test.ts`
  - Expected: The contract/receipt assertions fail RED because production receipt validation and Claude strategy comparisons still require `claude-code`.

- [x] 1.4 Update packed-install setup expectations and legacy-target rejection coverage — `tests/packaging/packed-install.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code`
  **Independent Test:** Disposable packed flows invoke `setup claude` for plan, apply, JSON, rollback, coexistence, and unavailable-capability scenarios, expect `harness: 'claude'`, and prove `setup claude-code` is rejected without mutation.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: The packed assertions fail RED until the packaged CLI and setup contract accept only `claude`.

## Phase 2: Setup Contract and Routing Implementation

- [x] 2.1 Rename the public parser and shared harness union to `claude` — `src/cli.ts`, `src/setup/types.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code`
  **Independent Test:** Help, missing-target errors, invalid-target errors, normal parsing, eager dispatch, and all setup controls expose only `opencode`, `codex`, and `claude`; `claude-code` fails validation before dispatch or mutation.
  **Verification**:
  - Run: `pnpm test -- tests/cli.test.ts`
  - Expected: CLI acceptance, rejection, help, and dispatch tests pass with no setup-runner call for the removed target.

- [x] 2.2 Propagate `claude` through setup paths, engine comparisons, strategy dispatch, and receipt validation while preserving product/asset identities — `src/setup/paths.ts`, `src/setup/engine.ts`, `src/setup/receipt.ts`, `src/setup/harnesses/claude-code.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `cli/Managed Claude Code Setup MUST Be Capability- and Ownership-Gated`
  **Independent Test:** Accepted Claude requests route to the existing Claude Code strategy, map to `.claude`, `.claude-plugin`, and `integrations/claude-code/**`, serialize and validate `harness: 'claude'`, reject old Claude receipt values, and preserve scope, ownership, plan-only, rollback, idempotency, diagnostics, and status semantics for other harnesses.
  **Verification**:
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: Engine parsing, routing, receipt, result, and unchanged OpenCode/Codex behavior tests pass.
  - Run: `pnpm test -- tests/setup/claude-code.test.ts`
  - Expected: Claude capability, coexistence, ownership, rollback, receipt, and stable product-path tests pass with the `claude` contract value.

## Phase 3: Durable Contract and Public Documentation

- [x] 3.1 Update the active CLI OpenSpec requirement and scenarios to advertise the renamed contract — `openspec/specs/cli/spec.md`
  **[USN-1]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code`
  **Independent Test:** The managed-setup requirement and Claude global-scope scenario name `setup claude`; the setup-results requirement states that Claude receipts/results use exactly `claude`; Claude Code product wording and all unrelated receipt compatibility requirements remain intact.
  **Verification**:
  - Run: `rg -n "setup claude-code|accept .*claude-code.* as a harness|harness[^[:alnum:]]+claude-code" openspec/specs/cli/spec.md`
  - Expected: No match remains for the removed public or persisted setup-contract value, while Claude Code branding remains in the requirement/scenario prose.

- [x] 3.2 Update operator-facing examples and setup-contract guidance without renaming product-branded paths or module names — `README.md`, `docs/agent/managed-delivery.md`
  **[USN-4]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code`
  **Independent Test:** Public examples and managed-delivery guidance list only `opencode`, `codex`, and `claude` as setup targets, while references to Claude Code product branding, `claude-code-cli.ts`, `integrations/claude-code/**`, and runtime evidence remain unchanged.
  **Verification**:
  - Run: `rg -n "setup claude-code|public .*claude-code|public Claude naming" README.md docs/agent/managed-delivery.md`
  - Expected: No removed setup command or public-target guidance remains; intentional Claude Code product/path references are retained.

## Phase 4: Focused, Packed, and Broader Verification

- [x] 4.1 Run focused CLI and setup suites after implementation — `tests/cli.test.ts`, `tests/setup/engine.test.ts`, `tests/setup/claude-code.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `cli/Setup Results and Exit Codes MUST Be Deterministic`
  **Independent Test:** The focused suites jointly cover accepted normal/plan/JSON/scoped/rollback flows, pre-dispatch rejection, receipt round trips and invalid legacy values, path routing, ownership/coexistence, and unchanged rollback/status semantics.
  **Verification**:
  - Run: `pnpm test -- tests/cli.test.ts`
  - Expected: All CLI tests pass.
  - Run: `pnpm test -- tests/setup/engine.test.ts`
  - Expected: All engine/parser/result/receipt tests pass.
  - Run: `pnpm test -- tests/setup/claude-code.test.ts`
  - Expected: All Claude setup, ownership, capability, and rollback tests pass.

- [x] 4.2 Verify disposable packed-install setup and packaging inventory behavior — `tests/packaging/packed-install.test.ts`, `tests/packaging/inventory.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `cli/Claude Code Coexistence and Migration MUST Preserve Ownership Boundaries`
  **Independent Test:** Packed tarball flows invoke `setup claude`, observe `harness: 'claude'`, prove coexistence/mutation/rollback/unavailable-capability behavior, and retain stable Claude Code inventory paths and contents.
  **Verification**:
  - Run: `pnpm test -- tests/packaging/packed-install.test.ts`
  - Expected: All packed setup, rollback, coexistence, disposable-home, and old-target rejection tests pass.
  - Run: `pnpm test -- tests/packaging/inventory.test.ts`
  - Expected: Published asset inventory tests pass with `integrations/claude-code/**` unchanged.
  - Run: `pnpm run integration:verify`
  - Expected: The package/inventory verifier reports a valid published integration package.

- [x] 4.3 Run the required build/type/package gate — `package.json`, `scripts/build.mjs`, `dashboard/package.json`
  **[USN-5]** | Priority: P1
  **Spec:** `cli/Every Mutating Attempt MUST Emit an Ownership Receipt`
  **Independent Test:** TypeScript, source packaging, and dashboard build complete with the renamed union and all explicit `.js` imports resolved.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: `tsc --noEmit`, source build, and dashboard build complete successfully.

- [x] 4.4 Run the full Vitest suite for cross-surface contract regressions — `tests/**/*.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `cli/Repeated Setup MUST Be Idempotent`
  **Independent Test:** All existing harness, integration, privacy, receipt, setup, and packaging tests pass, demonstrating that only setup-contract identifiers changed and Claude Code product/runtime identities remain stable.
  **Verification**:
  - Run: `pnpm test`
  - Expected: The complete Vitest suite passes with no regressions outside the intentional `claude` contract rename.

- [x] 4.5 Audit remaining `claude-code` occurrences for intentional product, asset, runtime-evidence, or upstream-version meaning — accepted affected areas
  **[USN-4]** | Priority: P1
  **Spec:** `cli/CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code`
  **Independent Test:** A bounded occurrence review confirms no public parser/help/example, setup request/result, receipt validator/serializer, or packed invocation still treats `claude-code` as the setup-contract value.
  **Verification**:
  - Run: `rg -n "claude-code" src/cli.ts src/setup tests/cli.test.ts tests/setup tests/packaging/packed-install.test.ts README.md docs/agent/managed-delivery.md openspec/specs/cli/spec.md`
  - Expected: Every remaining match is classified as intentional Claude Code branding, product-branded path/module/test name, runtime/inventory evidence, or upstream CLI/version text; no setup-contract alias or legacy receipt acceptance remains.

## Execution Order

One deep execution agent should complete Phase 1 test edits and run each focused suite to record the expected RED failures, then implement Phase 2 in shared-contract-to-routing order, update Phase 3 specifications/docs, and finish Phase 4 focused, packed, build, full-suite, and occurrence-audit checks. No parallel markers are emitted; each phase depends on the prior phase's evidence, and production changes must not begin until the corresponding tests are observed RED.
