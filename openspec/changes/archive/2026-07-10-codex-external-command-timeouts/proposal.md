# Proposal: Codex External Command Timeouts

## Intent

Make Codex setup resilient to legitimate network latency without weakening the
bounded, safety-first behavior of its external command runner. Today one shared
5-second deadline applies both to cheap capability/help/list probes and to
network-backed marketplace registration and plugin installation. A mutation can
therefore time out even though Codex is still completing the remote operation,
after which setup performs only one immediate independent state check before
recording failure.

The change will separate short probe/list deadlines from materially longer but
still bounded network-mutation deadlines. When a mutation times out or otherwise
has an ambiguous completion outcome, setup will use a bounded verification/polling
window before deciding whether independent state evidence confirms success. It
will preserve subprocess cancellation, output caps, argument-array execution with
no shell, safe diagnostics, durable receipt checkpoints, and the existing
explicit `complete`, `partial`, and `failed` result behavior.

## Scope

### In Scope

- Classify Codex external commands into bounded timeout classes:
  - short deadlines for capability, help, grammar, and list probes;
  - a materially longer finite deadline for network-backed marketplace and
    plugin mutations;
  - a finite reconciliation window for independent state verification after an
    ambiguous mutation result.
- Route each command through the correct timeout class without changing its
  exact argument-array grammar, selected global/project scope, or identity being
  verified.
- Treat mutation timeout as indeterminate rather than confirmed success. Re-run
  only the existing non-mutating verification/list command on a bounded cadence
  until the expected marketplace or plugin identity appears or the reconciliation
  window expires.
- Preserve the executor's output-byte cap, child-process cancellation, safe OS
  error-code allowlist, `shell: false`, hidden Windows process behavior, and
  privacy-safe diagnostics.
- Preserve receipt durability and ordering: record the attempted external command
  outcome before reconciliation, persist the final independently verified outcome,
  and fail safely if either checkpoint cannot be confirmed.
- Preserve the existing step outcome vocabulary and final setup status derivation,
  including explicit partial/failure results and manual recovery actions when one
  or both operations remain unverified.
- Add deterministic tests with controlled executors and isolated fixtures that
  simulate slow mutations, delayed visibility, exhausted reconciliation windows,
  cancellation, output limits, checkpoint failure, and mixed marketplace/plugin
  outcomes without invoking or mutating a real personal/global Codex installation.

Material behavior change:

- **From:** one 5-second executor deadline governs both cheap local probes/list
  checks and potentially slow network marketplace/plugin mutations. **To:** each
  operation uses a bounded timeout class appropriate to its cost, with network
  mutations receiving a materially longer finite deadline. **Reason:** remote
  marketplace operations can legitimately take longer than local capability
  inspection. **Impact:** executor construction and Codex setup orchestration must
  select deadlines per operation while retaining cancellation and output limits.
- **From:** an ambiguous mutation timeout is followed by one immediate verification
  check, which can report failure before remote state becomes visible. **To:**
  ambiguous outcomes enter bounded, non-mutating reconciliation polling and become
  confirmed only when independent list evidence appears. **Reason:** command
  completion and remote visibility are not necessarily simultaneous. **Impact:**
  setup may wait longer within an explicit cap, receipts capture the attempt and
  final evidence, and unresolved outcomes remain failed or partial rather than
  false successes.

### Deferred / Needs Discovery

- The exact longer mutation deadline, reconciliation window, polling interval,
  and retry count need selection during task planning from deterministic test
  constraints and acceptable CLI latency. Every selected value must be finite,
  cancellation-aware, and demonstrably longer than the short probe class; no
  unbounded wait policy is acceptable.
- A real end-to-end Codex marketplace/plugin apply remains deferred until an
  installable remote repository ref exists. At present no published thoth ref
  contains the required marketplace/plugin assets, so real apply cannot provide
  valid success evidence. This external prerequisite must remain visible in task
  and verification reporting; controlled executors and fixtures are the acceptance
  path until the prerequisite is satisfied.

### Out of Scope

- Publishing, pushing, merging, or otherwise creating the missing remote
  marketplace/plugin assets or installable ref.
- Adding public Codex rollback support for external marketplace/plugin mutations
  that a failed receipt did not previously own.
- Changing Codex home, project path, scope resolution, or managed filesystem target
  behavior.
- Copying any unbounded wait, retry, or polling policy.
- Changing OpenCode, Claude Code, or any other harness integration.
- Changing the six-tool MCP surface, SQLite schema, memory lifecycle, retrieval,
  packaging inventory, or native hook behavior.
- Weakening shell safety, output bounds, process cancellation, privacy-safe error
  reporting, independent verification, or receipt checkpoint requirements.

## Approach

1. Extend the internal Codex executor/orchestration contract so callers select a
   bounded command class or equivalent explicit deadline rather than inheriting
   one universal default. Keep command execution argument-based and preserve all
   existing safety limits.
2. Keep capability discovery and ordinary list verification on the short class.
   Run marketplace registration and plugin installation on the longer network
   mutation class.
3. After any mutation result that cannot prove final state, persist the existing
   attempt checkpoint and enter a bounded reconciliation loop using only the
   operation's existing verification arguments. Stop immediately on confirmed
   identity, cancellation, unsafe executor failure, output-limit failure, or
   expiry of the reconciliation budget.
4. Persist the final checkpoint from independent evidence. Confirmation requires
   the expected marketplace/plugin identity; otherwise preserve the current
   failed step, partial/failed aggregate status, safe diagnostic, and manual retry
   action. A checkpoint persistence failure remains a hard setup failure.
5. Prove the behavior with controlled executors/fake clocks or equivalent fixtures,
   including a mutation that lasts beyond 5 seconds but within the network budget,
   delayed state visibility, permanent non-visibility, and mixed-operation results.
   Do not run a real external mutation until the remote prerequisite exists.

## Affected Areas

- `src/setup/codex-cli.ts`: command timeout classification, executor invocation,
  ambiguous-outcome reconciliation, verification polling, cancellation, and safe
  diagnostics.
- `src/setup/engine.ts`: only if needed to pass bounded execution policy or preserve
  exact external receipt checkpoint sequencing; filesystem setup behavior is not
  otherwise changed.
- `src/setup/receipt.ts` and receipt helpers: compatibility verification only unless
  a minimal internal adjustment is required to preserve the current attempt/final
  checkpoint semantics. No new public rollback claim is introduced.
- `tests/setup/codex-cli.test.ts` and nearest setup tests: controlled executor,
  timing/reconciliation, checkpoint, status, output-bound, and shell-safety
  coverage.
- Main OpenSpec domains affected by the eventual implementation: managed Codex
  setup behavior under `harness-integration`; no other harness domain is changed.

## Risks

- A longer mutation deadline could make genuine failures feel hung. Mitigation:
  keep every class finite, cancel the child at its deadline, expose bounded safe
  diagnostics, and test elapsed-budget behavior deterministically.
- Polling could become an accidental unbounded retry loop or multiply network
  load. Mitigation: use an explicit total reconciliation budget and interval/count
  cap, poll only the non-mutating list command, and stop on terminal executor safety
  failures.
- A timed-out mutation may complete after setup reports failure, leaving external
  state changed without public rollback support. Mitigation: reconcile before
  failure, keep the result explicit and receipt-backed, provide manual inspection
  and retry guidance, and do not claim rollback ownership for ambiguous external
  state.
- Reconciliation could falsely confirm an unrelated entry or stale output.
  Mitigation: retain the existing exact identity matching and selected scope, reject
  truncated/nonzero/unsafe results, and require independent list evidence.
- Receipt state could drift if polling bypasses checkpoints or checkpoint writes
  fail. Mitigation: preserve the existing attempt-then-final checkpoint order and
  make checkpoint persistence failure a hard failure before further setup progress.
- Tests could accidentally mutate a developer's global Codex state. Mitigation:
  acceptance tests use injected controlled executors, fake timing, and isolated
  filesystem fixtures; no test invokes a real Codex mutation.
- Remote apply cannot currently validate the happy path because the published ref
  lacks marketplace/plugin assets. Mitigation: report the prerequisite explicitly
  and separate deterministic local acceptance from later real-install evidence.

## Rollback Plan

- Revert the timeout-class selection and reconciliation loop to the current single
  bounded executor path if the change causes regressions. Existing argument arrays,
  output caps, cancellation, diagnostics, and receipt format remain compatible.
- Disable reconciliation independently while retaining distinct bounded mutation
  and probe deadlines if polling introduces unsafe or incorrect behavior; ambiguous
  outcomes then continue to fail explicitly after independent verification.
- Existing receipt-backed filesystem rollback remains unchanged and restores only
  managed filesystem state. External Codex marketplace/plugin mutations remain
  outside public rollback support and require the existing manual recovery path.
- Because tests never mutate personal/global Codex state, rolling back the test
  harness requires no external cleanup.

## Success Criteria

- Controlled executor tests prove that capability/help/list probes still use the
  short bounded class and are cancelled when that deadline expires.
- A controlled network mutation that exceeds 5 seconds but completes within the
  longer mutation budget is not prematurely classified as timed out, and the step
  becomes `confirmed` only after independent list evidence contains the expected
  identity.
- A controlled mutation timeout followed by delayed list visibility is reconciled
  within the finite polling budget, with receipt evidence showing the attempted
  outcome before the final confirmed checkpoint.
- A mutation whose state never becomes visible stops within the configured total
  reconciliation bound, leaves the step failed, returns `failed` when neither
  operation confirms or `partial` when exactly one confirms, and emits the existing
  safe manual recovery action without false success.
- Tests prove reconciliation performs no mutation retries, uses only the existing
  scoped list arguments, stops on confirmation, and cannot exceed its count/time
  budget.
- Existing tests continue to prove the combined output cap, process cancellation,
  literal shell-like arguments under `shell: false`, safe error-code reporting,
  exact marketplace/plugin identity matching, and project/global argument arrays.
- Checkpoint-failure tests prove setup fails safely when either attempt or final
  external outcome cannot be durably recorded; receipt final status and step
  outcomes remain consistent with the existing contract.
- The focused setup test suite passes without calling a real Codex marketplace or
  plugin mutation. `pnpm run build` and the full `pnpm test` suite pass before the
  change is considered complete.
- Real remote apply remains explicitly not executed until an installable published
  ref contains the marketplace/plugin assets; its absence is reported as an
  external prerequisite, not interpreted as implementation failure or hidden from
  verification.
