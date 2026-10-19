# Implementation Plan: Layered CI browser testing

## Technical context

The root Vitest configuration currently discovers every `tests/**/*.test.ts` file with one worker, `pnpm test` has no lane distinction, and `.github/workflows/ci.yml` executes dashboard typecheck, build, all tests, and retrieval evaluation sequentially in one job. Thirteen dashboard files contain 52 `withDashboardBrowser(...)` invocations. Each normal invocation creates an in-memory Store, HTTP bridge, Vite development server, Chrome process/profile, and CDP connection before destroying all of them.

The HTTP bridge already serves `dashboard/dist` and therefore provides a production-representative origin for both static dashboard files and API routes. Vitest 4 global setup runs once before workers and can publish a serializable shared Chrome endpoint through `project.provide`, while tests read it through `inject`. Existing custom CDP transport, executable discovery, startup retries, deadlines, and owned-profile cleanup remain reusable; no new browser dependency is necessary.

Primary ownership is managed delivery and test infrastructure. Product dashboard behavior, HTTP response contracts, Store schema, and generated `dist/` are unchanged. Browser test files stay sequential (`maxWorkers: 1`); independent GitHub jobs provide broader parallelism.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The plan changes only test/CI infrastructure and adds no MCP tools or registrations.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Retrieval behavior is unchanged and its evaluation becomes an independent CI signal rather than a downstream step that can be skipped.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Browser-test harness changes do not alter host integration payloads, SQLite schemas, HTTP operations, or memory semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall output modes, limits, trimming, and evidence metadata are outside the mutable surface.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Public MCP, HTTP, CLI, and observation taxonomy contracts remain unchanged; package test scripts are internal contributor tooling and retain `pnpm test` as the non-browser aggregate.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Introduce shared test-pattern constants and dedicated Vitest configs. Keep `vitest.config.ts` as all non-browser tests so `pnpm test -- <file> -t <name>` remains filterable. Add explicit unit, integration, browser-smoke, and performance scripts. Prefix `pnpm test` and `test:integration` with `node scripts/build.mjs` so packaging coverage has `dist/index.js` on a clean checkout; unit remains build-free. | `vitest.test-patterns.ts`, `vitest.config.ts`, `vitest.unit.config.ts`, `vitest.integration.config.ts`, `vitest.browser.config.ts`, `vitest.browser-performance.config.ts`, `package.json` | Delivery contract test parses patterns/scripts, asserts the package-build prerequisite precedes Vitest for both packaging-owning commands, and focused command probes demonstrate lane selection. |
| FR-002 | Replace the single sequential CI job with four independent jobs: `quality`, `integration`, `browser-smoke`, and `retrieval-eval`. Only `quality` performs full build/typecheck; browser smoke builds its dashboard through its own script. | `.github/workflows/ci.yml` | Delivery contract test parses job names, commands, and absence of `needs` between test lanes; all four local commands pass. |
| FR-003 | Extract owned Chrome process startup/termination/profile logic into a reusable test-support module. Vitest global setup starts one process, publishes debug port/PID/profile metadata via `project.provide`, and tears it down with bounded cleanup. Keep setup/teardown callable through an isolated unit-test seam so post-teardown process/profile state is observable. | `tests/dashboard/dashboard-browser-process.ts`, `tests/dashboard/dashboard-browser-global-setup.ts`, `vitest.browser*.config.ts` | Browser lifecycle contract observes one provided PID across two harness runs; process/profile fault tests and an isolated global-setup helper test observe zero resources after returned teardown completes. |
| FR-004 | Extend browser-level CDP use to create one incognito browser context and target per harness invocation. Preserve per-test Store/bridge creation. Cleanup closes page CDP, target, context, bridge, and Store; normal cleanup never sends `Browser.close` to the shared process. | `tests/dashboard/dashboard-browser-harness.ts`, `tests/dashboard/dashboard-browser-harness-faults.browser.test.ts` | Public `withDashboardBrowser` seam plus bounded `harnessFaultTestApi` evidence proves distinct context/target IDs, no storage carry-over, and zero leaked per-test resources. |
| FR-005 | Remove Vite creation/proxy/cleanup from the harness. Navigate directly to the per-test HTTP bridge, which serves the dashboard build and APIs from one origin. Browser scripts build the dashboard once before Vitest starts. | `tests/dashboard/dashboard-browser-harness.ts`, `package.json`, browser configs | Browser smoke loads `/` from the bridge origin; harness fault tests retain bridge collision/ownership coverage and contain zero Vite lifecycle cases. |
| FR-006 | Rename browser files to explicit `.browser.test.ts` ownership. Split the two timing/long-task cases from `full-atlas-browser.test.ts` into `.performance.test.ts`; keep the three deterministic failure/recovery cases in browser smoke and share only fixture builders. Add scheduled/manual performance workflow. | `tests/dashboard/*.browser.test.ts`, `tests/dashboard/full-atlas.performance.test.ts`, `tests/dashboard/full-atlas-fixtures.ts`, `.github/workflows/dashboard-performance.yml` | Delivery contract test proves disjoint globs; focused smoke/performance list commands show 3 functional and 2 performance full-atlas cases respectively. |
| FR-007 | On an unexpected CI-mode browser acceptance failure, capture one screenshot capped at 2 MiB, one UTF-8-safe DOM snapshot truncated to 512 KiB, and one JSON metadata record capped at 32 KiB before disposing the target. Disable capture for intentional fault-injection cases. Use an ignored `test-results/browser/` directory. | `tests/dashboard/dashboard-browser-harness.ts`, `.gitignore` | Fault test injects one non-lifecycle acceptance failure with artifact output redirected to a temp directory, asserts all 3 byte caps and original-error preservation, and asserts a pass creates zero files. |
| FR-008 | Add failure-only artifact upload steps to smoke and performance workflows with missing-file tolerance. | `.github/workflows/ci.yml`, `.github/workflows/dashboard-performance.yml` | Delivery contract test asserts `if: failure()`, `actions/upload-artifact`, owned path, and `if-no-files-found: ignore`. |

### Test ownership and naming

- `*.browser.test.ts`: functional real-browser smoke required on pull requests.
- `*.performance.test.ts`: dense browser timing/long-task evidence, scheduled/manual only.
- Integration patterns: HTTP bridge/API, native integration, setup, packaging, and their fixtures.
- Unit patterns: every remaining `tests/**/*.test.ts` file after explicit integration/browser exclusions.
- `pnpm test`: unit plus integration in one filterable Vitest invocation, excluding both browser classes.

### TDD seams confirmed by the accepted architecture

1. **Delivery configuration seam**: package scripts, exported Vitest patterns/configs, and workflow YAML are observable contributor/CI contracts.
2. **Browser lifecycle seam**: `withDashboardBrowser` must expose isolated browser state and deterministic resource cleanup while global setup owns the shared process.
3. **Suite-selection seam**: Vitest file discovery is the source of truth for which scenarios block pull requests versus scheduled performance evidence.
4. **Failure-evidence seam**: the artifact directory and workflow upload policy are observable only after a failed CI-mode acceptance invocation.

Implementation uses vertical slices: add one failing delivery/lifecycle contract, make the smallest configuration/harness change that passes it, then proceed to the next requirement. Tests will not assert private dashboard implementation details.

## Optional support artifacts

- `research.md`: Not needed; current repository evidence plus official Vitest global-setup/provide semantics resolve the only external lifecycle question.
- `data-model.md`: Not needed; no production or persistent data model changes.
- `contracts/`: Not needed; public product protocols remain unchanged and the internal seams are fully specified above.
- `quickstart.md`: Not needed; canonical contributor commands will be updated in `docs/agent/testing.md`.

## Risks and migrations

- **Package/dashboard build freshness**: Packaging integration needs `dist/index.js`, while browser lanes need `dist/dashboard`. Mitigation: `pnpm test` and `test:integration` run `node scripts/build.mjs` before Vitest, browser commands run `dashboard:build`, and the delivery contract asserts command ordering. Focused low-level Vitest commands are documented with their prerequisites.
- **Shared-browser catastrophic failure**: One Chrome crash can affect later files. Mitigation: fail clearly on endpoint loss, keep browser tests sequential, bound every CDP request, and let Vitest global teardown own process/profile cleanup. Retry belongs to the run level, not silent per-test replacement.
- **Context cleanup after partial setup**: A context or target may exist without a page CDP connection. Mitigation: record resource IDs immediately and dispose them in reverse order with independent bounded steps.
- **Intentional harness fault tests**: Shared global ownership would make browser-startup/profile fault injection unsafe. Mitigation: keep an explicit isolated-browser path only for lifecycle fault cases; ordinary acceptance always uses the provided shared process.
- **File-classification drift**: New test files could bypass a lane. Mitigation: one contract test enumerates repository test files and fails if ownership is missing or overlapping.
- **Performance visibility**: Moving timing cases out of PR removes immediate blocking. Mitigation: scheduled/manual workflow remains explicit, uploads diagnostics, and SC-006 tracks three consecutive remote outcomes before claiming stability.
- **Rollback**: Revert configs/scripts/workflows and restore original test filenames/harness lifecycle. No data migration, schema rollback, or product compatibility step is required.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped files are tests, configs, workflows, and contributor docs; no MCP registry is touched.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — `retrieval-eval` is independent and unchanged, improving evidence availability without changing retrieval execution.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Per-test Stores and the production HTTP bridge keep the same host-neutral contracts; only test-process ownership changes.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No retrieval output code or limits appear in the requirement mapping.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Product public names and schemas are untouched; existing `pnpm test` filtering remains supported while new internal scripts are additive.
