# Verification Report: Codex External Command Timeouts

## Round

round 1

## Completeness

- Pipeline: accelerated SDD.
- Acceptance reference: `proposal.md`.
- Tasks: 11 of 11 complete.
- Proposal success criteria: 9 of 9 satisfied.
- Deferred boundaries remain explicit: publishing an installable remote marketplace ref and adding public Codex rollback support are outside this change.

## Build and Test Evidence

- `pnpm test -- tests/setup/codex-cli.test.ts`: passed, 24 of 24 tests.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm run build`: passed.
- `pnpm exec tsx src/index.ts setup codex --plan --json`: returned `complete`, `changed: false`, and `receipt: null`; the literal plan-mode run reported no filesystem, marketplace, or plugin writes.
- `pnpm test`: passed after one retry, 60 of 60 test files, 840 tests passed, 1 skipped. The earlier registry and inventory timeouts were transient: isolated reruns passed 9 of 9 and 10 of 10 respectively, and no production change was made for them.

## Static Coverage Summary

The implementation keeps probe/help/list calls on a 5,000 ms deadline and marketplace/plugin mutations on a 120,000 ms deadline. Ambiguous mutation outcomes use a 30,000 ms reconciliation budget with a 1,000 ms interval and at most 30 polls, including the initial poll; each poll is clamped to the lesser of 5,000 ms and the remaining budget. Clock and scheduler injection provide virtual timing without real sleeps.

Reconciliation never retries a mutation and reuses only the exact scoped list arguments and exact marketplace/plugin identity. Terminal spawn, output-limit, and cancellation behavior remains bounded. Attempt and final checkpoints preserve their ordering and hard-failure semantics. Aggregate `partial` and `failed` outcomes and manual recovery actions remain explicit. Windows launcher behavior, `shell: false`, combined output caps, privacy-safe diagnostics, plugin selector grammar, global/project scope, and exact identity invariants are preserved.

## Compliance Matrix

| ID | Proposal success criterion | Evidence | Result |
| --- | --- | --- | --- |
| SC1 | Capability/help/list probes use the short bounded class and are cancelled at expiry. | Focused controlled-executor coverage asserts the 5,000 ms probe timeout and child cancellation; the focused suite passed 24/24. | Satisfied |
| SC2 | A network mutation beyond 5 seconds but within the longer budget is not timed out prematurely and confirms only from independent list evidence. | Controlled timing coverage uses the 120,000 ms mutation deadline and exact list-based identity confirmation; the focused suite passed. | Satisfied |
| SC3 | A timed-out mutation with delayed visibility reconciles within the finite budget, with attempt evidence before the final confirmed checkpoint. | Virtual-time reconciliation coverage verifies delayed visibility, attempt-before-poll ordering, and final confirmed checkpoint ordering under the 30,000 ms budget. | Satisfied |
| SC4 | Permanent non-visibility stops within the configured bound and yields correct `failed`/`partial` outcomes and manual recovery without false success. | Expiry and mixed-operation tests cover the 30-poll/time caps, neither/one confirmed aggregation, preserved step failures, receipt status, and manual actions. | Satisfied |
| SC5 | Reconciliation performs no mutation retries, uses only existing scoped list arguments, stops on confirmation, and respects count/time bounds. | Exact call-sequence assertions prove each mutation appears once, only list commands poll, exact global/project arguments are reused, and confirmation or budget exhaustion terminates polling. | Satisfied |
| SC6 | Executor safety, launcher behavior, output limits, literal arguments, diagnostics, identity matching, and scope arrays remain intact. | Focused regressions cover `shell: false`, Windows hidden launch, timeout cancellation, combined stdout/stderr cap, literal shell-like arguments, allowlisted OS codes, diagnostic privacy, exact identity matching, selector grammar, and global/project arrays. | Satisfied |
| SC7 | Failure to persist either attempt or final external outcome fails safely with consistent receipt and step state. | Checkpoint-failure tests verify hard stops at both checkpoint boundaries, attempt/final ordering, preserved failures, and consistent aggregate outcomes. | Satisfied |
| SC8 | Focused tests, build, and full tests pass without a real Codex mutation. | Focused 24/24, TypeScript pass, build pass, full suite 60/60 files with 840 passed and 1 skipped; plan-only CLI evidence confirms no writes. | Satisfied |
| SC9 | Real remote apply is not executed until an installable published ref exists, and the prerequisite remains visible. | Verification used only controlled executors and literal `--plan --json`; remote marketplace publication remains documented as a deferred external prerequisite. | Satisfied |

## Issues Found

### Critical

None.

### Warnings

None.

## Deferred Boundaries

- Remote marketplace branch publication and installable asset availability remain external prerequisites.
- Public Codex rollback ownership and support for external marketplace/plugin mutations remain outside this change.

## Constitution Suggestion

None.

## Verdict

pass
