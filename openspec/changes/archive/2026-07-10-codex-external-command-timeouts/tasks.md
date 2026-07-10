# Tasks: Codex External Command Timeouts

> **Acceptance reference:** This is an accelerated SDD change. The success criteria in `proposal.md` are the acceptance reference; no delta spec or design artifact exists for this change. The `Spec:` tags below are stable proposal-derived trace tags.
>
> **Locked timing policy:** Short capability/help/list probes use **5,000 ms**. Marketplace registration and plugin installation mutations use **120,000 ms**, chosen as a finite allowance above the observed approximately 60-second network operation. Ambiguous mutation reconciliation uses a **30,000 ms total elapsed-time cap**, a **1,000 ms interval**, and at most **30 list polls**, including the initial poll; every poll is additionally bounded by the lesser of the 5,000 ms probe deadline and the remaining reconciliation budget. Timeout selection, clock, and scheduler are injectable so tests advance virtual time and never sleep in real time.
>
> **TDD ordering:** Although the repository configuration disables the TDD toggle, this change deliberately authors the controlled-executor and fake-scheduler failures in Phase 1 before production changes in Phase 2 because timing, cancellation, and checkpoint ordering are correctness-sensitive.
>
> ⚠️ **Deferred external prerequisite:** Do not run a real marketplace registration or plugin installation. No installable published remote ref currently contains the required marketplace/plugin assets. Deterministic controlled executors and isolated fixtures are the acceptance path; remote publication remains a separate follow-up, not an implementation task in this change.
>
> ⚠️ **Rollback boundary:** Codex external marketplace/plugin rollback remains unsupported and deferred. Preserve the existing receipt-backed filesystem rollback and manual inspection/retry actions; do not add or claim rollback ownership for ambiguous external mutations.

## Phase 1: Test-First Contract and Failure Scenarios

- [x] 1.1 Author failing controlled-executor tests for the timeout-class contract — `tests/setup/codex-cli.test.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Bounded Timeout Classes`
  **Independent Test:** Extend the controlled executor to capture the requested execution class/deadline and assert 5,000 ms for capability/help/list calls, 120,000 ms for marketplace/plugin mutations, and a mutation simulated beyond 5 seconds but within 120 seconds without real waiting. The assertions must fail against the current universal-timeout contract.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: The new timeout-class assertions execute and fail before Task 2.1 because the current executor exposes only one 5,000 ms deadline.

- [x] 1.2 Author failing deterministic reconciliation tests — `tests/setup/codex-cli.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `proposal/Bounded Ambiguous-Outcome Reconciliation`
  **Independent Test:** Add a fake clock/scheduler or equivalent controlled fixture proving delayed identity visibility confirms within the 30,000 ms budget, permanent non-visibility expires within both the elapsed-time and 30-poll caps, confirmation stops polling, and only the existing scoped list arguments are repeated; mutation arguments must appear exactly once. Cover timeout and successful-but-not-yet-visible ambiguous outcomes, with no real sleeps.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: The new delayed-visibility and expiry assertions execute and fail before Task 2.2 because the current flow performs only one immediate verification call.

- [x] 1.3 Author failing terminal-safety, checkpoint, and aggregate-status tests — `tests/setup/codex-cli.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `proposal/Checkpointed Safety and Status Derivation`
  **Independent Test:** Record checkpoint and executor events to prove the attempted mutation outcome is durably checkpointed before any reconciliation poll, the independently verified final outcome is checkpointed afterward, and failure of either checkpoint halts safely. Add output-limit/spawn-safety terminal cases that do not poll, plus confirmation, expiry, `partial` for one confirmed operation, `failed` for neither, consistent receipt final status/step outcomes, and the existing safe manual recovery actions.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: The new event-order, checkpoint-failure, terminal-stop, mixed-status, and receipt assertions execute and expose the missing bounded reconciliation behavior before production changes.

## Phase 2: Bounded Execution and Reconciliation

- [x] 2.1 Implement the internal timeout-class executor API — `src/setup/codex-cli.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Bounded Timeout Classes`
  **Independent Test:** Make each call select the locked short-probe or network-mutation deadline while keeping every timeout finite and retaining the existing default output cap and command launcher behavior. Keep any compatibility surface minimal and internal.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Task 1.1 passes: all help/list probes select 5,000 ms, both mutations select 120,000 ms, and the controlled slow mutation is not prematurely timed out.
  - Run: `pnpm exec tsc --noEmit`
  - Expected: The revised executor contract and all controlled executor implementations typecheck without suppressions.

- [x] 2.2 Implement bounded, non-mutating ambiguous-outcome reconciliation — `src/setup/codex-cli.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `proposal/Bounded Ambiguous-Outcome Reconciliation`
  **Independent Test:** After the attempt checkpoint, reconcile only ambiguous mutation outcomes by polling the operation's existing exact list arguments through the injected clock/scheduler. Enforce the 30,000 ms total cap and 30-poll cap, bound each list invocation by the remaining budget, stop on exact identity confirmation, and never retry marketplace/plugin mutation arguments. Treat output truncation, unsafe spawn failure, and other terminal safety failures as immediate failures rather than pollable success evidence.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Task 1.2 passes under virtual time, including delayed confirmation, finite expiry, exact scoped list polling, early stop, and zero mutation retries.
  - Run: `pnpm exec tsc --noEmit`
  - Expected: Reconciliation policy, clock, scheduler, and result types compile cleanly.

- [x] 2.3 Thread deterministic timing through setup while preserving receipt checkpoint semantics — `src/setup/engine.ts`, `src/setup/codex-cli.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `proposal/Checkpointed Safety and Status Derivation`
  **Independent Test:** Pass the internal timing/scheduler policy needed by isolated setup tests without changing public CLI flags or receipt schema. Preserve attempt-then-final checkpoint ordering, hard failure when either checkpoint cannot be confirmed, and final receipt status derivation from independently confirmed marketplace/plugin steps.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Task 1.3 passes, including attempt/final ordering, checkpoint write failures, consistent receipt outcomes, `partial`/`failed` aggregation, and manual actions.
  - Run: `pnpm exec tsc --noEmit`
  - Expected: Engine integration compiles without changing unrelated filesystem setup or rollback APIs.

## Phase 3: Safety and Compatibility Regressions

- [x] 3.1 Preserve launcher, cancellation, output, and diagnostic safety regressions — `src/setup/codex-cli.ts`, `tests/setup/codex-cli.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Executor Safety Invariants`
  **Independent Test:** Adapt and extend focused tests so the per-call deadlines still kill timed-out children, the combined stdout/stderr cap still kills truncated children, Windows processes stay hidden, argument arrays run with `shell: false`, shell-like values remain literal, and diagnostics expose only allowlisted OS codes without command paths, stderr secrets, or oversized output.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Existing and updated cancellation, output-cap, literal-argument, Windows launcher, safe-code, and privacy assertions all pass under the new executor API.

- [x] 3.2 Preserve exact grammar, identity, and scope selection regressions — `src/setup/codex-cli.ts`, `tests/setup/codex-cli.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Exact Scoped Verification Identity`
  **Independent Test:** Keep exact global and `--project` marketplace/plugin argument arrays, both legacy and marketplace-qualified plugin selectors, exact marketplace/plugin identity matching, unavailable-grammar zero-mutation behavior, and verified no-op behavior. Reconciliation must reuse these exact verification arrays and identities rather than reconstructing or broad-matching them.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: Global/project arguments, launcher selectors, exact identity checks, unavailable grammar, and no-op regression cases all pass with no extra mutation calls.

- [x] 3.3 Run the real CLI in read-only plan mode only — existing CLI entrypoint
  **[USN-6]** | Priority: P2
  **Spec:** `proposal/Read-Only Local Verification Boundary`
  **Independent Test:** Execute setup with `--plan --json` and inspect the JSON plan/capability result without allowing marketplace registration or plugin installation. Do not remove `--plan`, and do not run a real mutating Codex setup while the installable remote ref is absent.
  **Verification**:
  - Run: `pnpm exec tsx src/index.ts setup codex --plan --json`
  - Expected: The command emits bounded machine-readable plan/capability output and performs no filesystem, marketplace, or plugin mutation; local Codex availability may determine the reported non-success status without invalidating the read-only check.

## Phase 4: Completion Gates

- [x] 4.1 Run focused tests and the standalone TypeScript gate — affected setup modules
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Deterministic Local Acceptance`
  **Independent Test:** Confirm the entire controlled Codex setup suite is green and all production/test contracts typecheck after the test-first implementation, with no real external mutations or real-time sleeps added to reconciliation tests.
  **Verification**:
  - Run: `pnpm test -- tests/setup/codex-cli.test.ts`
  - Expected: All focused timeout, reconciliation, checkpoint, status, safety, grammar, and scope cases pass deterministically.
  - Run: `pnpm exec tsc --noEmit`
  - Expected: TypeScript completes with no errors.

- [x] 4.2 Run repository build and full regression suite — repository
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Repository Completion Gates`
  **Independent Test:** Exercise the packaged build/integration verification and every Vitest domain after focused acceptance is green; do not substitute or invent a lint command.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript, package build/integration verification, and dashboard build complete successfully.
  - Run: `pnpm test`
  - Expected: The full Vitest suite passes with no Codex marketplace/plugin mutation against a personal or global installation.

## Deferred Follow-ups (Not Implementation Tasks)

- Publish or otherwise provide an installable remote repository ref containing the Codex marketplace/plugin assets, then schedule a separately approved real end-to-end apply verification.
- Design public Codex rollback/ownership semantics separately before adding any external marketplace/plugin rollback command; until then, retain manual inspection and retry guidance.
