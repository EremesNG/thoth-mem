# Verification Report: Layered CI browser testing

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: All accepted FR-001–FR-008 scope and every buildable success criterion are represented. SC-006 remains an explicit post-merge outcome risk.
- **Correctness**: Independent focused reruns, static lane enumeration, cleanup scans, and the root-executed full gates match the behavioral contracts.
- **Coherence**: Specification, plan, tasks, implementation, tests, workflows, and contributor documentation agree on lane ownership and browser lifecycle.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Dedicated Vitest configs and package scripts; `scripts/build.mjs` precedes aggregate/integration Vitest | Delivery contract 3/3; static enumeration 103/103 exactly once, aggregate 88 with 0 browser | PASS |
| FR-002 | `.github/workflows/ci.yml` defines `quality`, `integration`, `browser-smoke`, and `retrieval-eval` without `needs` | Delivery contract plus all root lane commands | PASS |
| FR-003 | Global setup owns one Chrome PID/profile; browser configs use one worker | Focused lifecycle test observed one PID across two invocations; residue scan found 0 owned processes/profiles | PASS |
| FR-004 | Each harness invocation owns Store, bridge, browser context, and target; cleanup preserves the shared browser | Lifecycle/fault matrix 41/41 with distinct context/target IDs and storage isolation | PASS |
| FR-005 | Browser scripts build once; HTTP bridge serves `dist/dashboard`; no Vite lifecycle remains | Smoke and performance suites passed against built assets; static inspection | PASS |
| FR-006 | `.browser.test.ts` and `.performance.test.ts` ownership plus scheduled/manual-only performance workflow | Full-atlas smoke 3/3; performance 2/2; delivery contract | PASS |
| FR-007 | Bounded JPEG, UTF-8-safe DOM, and JSON metadata; capture failures preserve original failures | Diagnostics included in focused 41/41 run | PASS |
| FR-008 | Both workflows upload `test-results/browser/` only on failure with missing-file tolerance | Delivery contract 3/3 | PASS |
| SC-001 `[buildable]` | 103 unique files with no overlap/missing ownership; aggregate excludes browser and preserves packaging build order | Static Vitest enumeration and delivery contract | PASS |
| SC-002 `[buildable]` | Four independent PR jobs | Typecheck; build; unit 868; integration 419 + 1 skipped; browser 104; retrieval eval all passed | PASS |
| SC-003 `[buildable]` | Shared process with isolated context and target per invocation | One PID and two distinct context/target pairs observed | PASS |
| SC-004 `[buildable]` | Bounded setup/cleanup across six setup phases and six cleanup resources | Focused lifecycle matrix 41/41; 0 residual processes, profiles, ports, or diagnostics | PASS |
| SC-005 `[buildable]` | Three deterministic smoke scenarios and two timing/long-task scenarios | Smoke 3/3 and performance 2/2 | PASS |
| SC-006 `[outcome]` | Scheduled workflow exists; three consecutive post-merge results do not yet exist | N/A until post-merge scheduled execution | RISK |
| SC-007 `[buildable]` | Failure-only bounded diagnostics and failure-only workflow uploads | One failing acceptance produced 3 files; passing and intentional-fault cases produced 0 | PASS |

## Commands and results

- Focused delivery contract: 1 file, 3/3 passed.
- Focused lifecycle and diagnostics: 2 files, 41/41 passed.
- Full-atlas smoke: 3/3 passed.
- Full-atlas performance: 2/2 passed.
- Static Vitest lane enumeration: 103/103 uniquely owned; aggregate contains 0 browser files.
- `pnpm run dashboard:typecheck`: passed.
- `pnpm run build`: passed.
- `pnpm run test:unit`: 69 files, 868/868 passed.
- `pnpm run test:integration`: 19 files, 419 passed and 1 skipped.
- `pnpm run test:browser`: 14 files, 104/104 passed in 144.17 seconds.
- `pnpm run test:browser:performance`: 1 file, 2/2 passed in 14.22 seconds.
- `pnpm run eval:retrieval`: exit 0; all reported gates passed.
- `pnpm test`: 88 files, 1,287 passed and 1 skipped; no browser files.
- Accelerated `ready` validator: valid with 0 errors and 0 warnings.
- `git diff --check`: passed.
- Post-run cleanup: 0 owned Chrome processes/profiles, `test-results`, or `.vitest-attachments`; generated visual evidence was removed.

## Findings

No critical issues.

## Stable findings

- CI lanes are disjoint and independent.
- Browser process ownership is suite-level; context, target, Store, and bridge ownership is per invocation.
- Per-test Vite startup is removed.
- Diagnostics and contributor documentation match the implementation.
- Worktree contents are limited to declared implementation and OpenSpec surfaces.

## Warnings

- The global teardown's outer 20-second bound is shorter than the combined worst-case internal process-termination and profile-removal budgets. Normal and injected cleanup passed, but an extreme OS-level stall could outlive the wrapper before eventual completion.
- `plan.md` contains one non-behavioral `dashboard/dist` path typo; implementation, later plan sections, and documentation correctly use `dist/dashboard`.

## Residual risks

- SC-006: three consecutive scheduled post-merge runs must pass before stability can be claimed.
- GitHub-hosted Chrome discovery and runner variance remain remote-environment assumptions until those scheduled runs execute.
