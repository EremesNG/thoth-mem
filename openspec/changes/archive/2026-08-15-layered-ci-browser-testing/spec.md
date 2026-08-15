# Feature Specification: Layered CI browser testing

**Change ID**: `layered-ci-browser-testing`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Pull requests need fast, independent, reproducible signals. The current monolithic Vitest run repeatedly starts SQLite, the HTTP bridge, Vite, and Chrome for 52 browser-harness invocations, so resource-sensitive browser performance scenarios can hide otherwise passing build, unit, integration, and retrieval evidence.<br>
**Impact**: Test discovery and GitHub Actions are split into explicit unit, integration, browser-smoke, browser-performance, and retrieval-evaluation lanes. Browser acceptance tests reuse one Chrome process per Vitest browser run while retaining a fresh browser context, target, store, and HTTP bridge for each test. Dense performance scenarios stop blocking ordinary pull requests and run in a dedicated scheduled/manual workflow.<br>
**Affected capabilities**: None

## User stories

### US1 - Independent pull-request signals (Priority: P1)

As a maintainer, I can see build/unit, integration, browser-smoke, and retrieval-evaluation results independently so that one expensive failure does not suppress unrelated evidence.

**Independent test**: Inspect and execute the declared package scripts and CI jobs, then confirm that each lane selects only its owned suite and has no dependency on another test lane.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a pull request, **When** GitHub Actions starts, **Then** quality/unit, integration, browser-smoke, and retrieval-evaluation jobs run independently and each reports its own result.
2. **Given** a browser-smoke failure, **When** the workflow completes, **Then** retrieval evaluation and non-browser test results are still available.
3. **Given** a local maintainer runs `pnpm test`, **When** Vitest discovers tests, **Then** it runs all non-browser tests and does not start a browser or dashboard server.
4. **Given** a clean checkout with ignored `dist/` absent, **When** `pnpm test` or `pnpm run test:integration` runs packaging coverage, **Then** the required package output is built before Vitest starts.

### US2 - Isolated browser acceptance with bounded shared infrastructure (Priority: P1)

As a maintainer, I can run browser acceptance tests without launching a new Chrome and Vite process for every test so that CI resource use is stable without leaking state between tests.

**Independent test**: Run multiple browser-harness invocations in one browser suite and prove that they use distinct browser contexts/targets, distinct in-memory stores and bridge ports, one shared Chrome process, and bounded cleanup.

**Covers**: FR-003, FR-004, FR-005, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** one browser-smoke Vitest run, **When** multiple dashboard tests execute, **Then** Chrome starts once for the run and every harness invocation receives a fresh browser context and page target.
2. **Given** a test mutates browser storage or dashboard state, **When** the next test starts, **Then** that state is absent while its own in-memory store and HTTP bridge are available.
3. **Given** a browser test succeeds, fails, or exceeds its deadline, **When** cleanup runs, **Then** its target, browser context, bridge, store, ports, and temporary per-test resources are released without terminating the shared browser prematurely.
4. **Given** the browser suite exits, **When** global teardown runs, **Then** the shared Chrome process and owned profile are released within bounded time.

### US3 - Dedicated dense-atlas performance evidence (Priority: P2)

As a maintainer, I can evaluate dense-atlas responsiveness separately from functional browser smoke so that variable hosted-runner timing does not create a flaky pull-request gate.

**Independent test**: Confirm functional full-atlas recovery/isolation cases remain in browser smoke while wall-clock and long-task budget scenarios are selected only by the browser-performance command and workflow.

**Covers**: FR-006, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** an ordinary pull request, **When** browser smoke runs, **Then** dense wall-clock and long-task budget scenarios are not selected.
2. **Given** the scheduled or manually dispatched performance workflow, **When** it runs, **Then** only the dedicated dense-atlas performance suite is selected in an isolated job.
3. **Given** full-atlas functional recovery, request cancellation, or stopped-animation behavior, **When** browser smoke runs, **Then** those deterministic functional contracts remain required.

### US4 - Actionable browser failure evidence (Priority: P2)

As a maintainer, I can inspect bounded diagnostics from a failed browser lane so that CI failures do not require repeated blind reruns.

**Independent test**: Force a browser acceptance failure under CI-mode diagnostics and confirm a screenshot, DOM snapshot, and failure metadata are written only for the failing invocation and uploaded by the owning workflow.

**Covers**: FR-007, FR-008, SC-007

**Acceptance scenarios**:

1. **Given** a browser acceptance failure in CI, **When** the harness catches it, **Then** it writes bounded screenshot, DOM, and error metadata artifacts without masking the original failure.
2. **Given** a passing browser run, **When** it completes, **Then** no per-test diagnostic artifact is created.
3. **Given** diagnostics are absent or capture itself fails, **When** the workflow uploads artifacts, **Then** the original test outcome is preserved.

## Edge cases

- Chrome is unavailable or exits before publishing its DevTools port.
- A browser context or page target fails after creation but before the test callback begins.
- Bridge port allocation collides or the bridge does not prove ownership.
- Global teardown runs after a worker crash or a test abort.
- A diagnostic screenshot or DOM snapshot exceeds the bounded artifact policy.
- A CLI file filter selects a browser test through the non-browser command.
- The scheduled performance run and a pull-request browser-smoke run execute concurrently on different runners.

## Functional requirements

- **FR-001 — Explicit self-contained test-lane commands**: `[INTERNAL]` The repository MUST expose non-overlapping `test:unit`, `test:integration`, `test:browser`, and `test:browser:performance` commands, while `pnpm test` MUST remain the aggregate non-browser command and preserve file/name filtering; `pnpm test` and `test:integration` MUST build package output required by packaging tests before Vitest starts on a clean checkout.
- **FR-002 — Independent pull-request jobs**: `[INTERNAL]` The pull-request workflow MUST run quality/unit, integration, browser-smoke, and retrieval-evaluation as independent jobs without test-lane dependencies that suppress unrelated results.
- **FR-003 — Shared browser lifecycle**: `[INTERNAL]` A browser Vitest run MUST start at most one shared Chrome process and owned profile during global setup and MUST release both during bounded global teardown.
- **FR-004 — Per-test browser and data isolation**: `[INTERNAL]` Every browser-harness invocation MUST create a fresh Chrome browser context and page target plus a distinct in-memory Store and HTTP bridge, and MUST dispose all per-test resources after success, failure, or timeout.
- **FR-005 — Built-dashboard serving**: `[INTERNAL]` Browser lanes MUST build the dashboard once before test execution and MUST serve that built dashboard through the per-test HTTP bridge without starting a Vite development server per test.
- **FR-006 — Performance-suite separation**: `[INTERNAL]` Dense-atlas wall-clock and long-task budget scenarios MUST be excluded from ordinary pull-request gates and MUST run only through a dedicated scheduled/manual browser-performance workflow, while deterministic full-atlas functional scenarios remain in browser smoke.
- **FR-007 — Failure-only diagnostics**: `[INTERNAL]` Browser acceptance failures in CI MUST attempt to capture a screenshot of at most 2 MiB, a DOM snapshot of at most 512 KiB, and error metadata of at most 32 KiB, and diagnostic capture failure MUST NOT replace the original test failure.
- **FR-008 — Browser artifact publication**: `[INTERNAL]` Browser workflows MUST upload available diagnostics only after failure and MUST tolerate the absence of diagnostic files.

## Success criteria

- **SC-001** `[buildable]`: Automated contract tests prove 100% of repository test files belong to exactly 1 of unit, integration, browser-smoke, or browser-performance selection, with 0 browser files selected by `pnpm test`, and both packaging-owning commands prepare `dist/index.js` before Vitest.
- **SC-002** `[buildable]`: The CI workflow exposes exactly 4 independent pull-request jobs—quality/unit, integration, browser-smoke, and retrieval-evaluation—and all 4 declared commands execute successfully.
- **SC-003** `[buildable]`: A focused browser lifecycle test observes exactly 1 shared Chrome PID across at least 2 isolated harness invocations and 2 distinct context/target identity pairs.
- **SC-004** `[buildable]`: Browser fault tests cover at least 6 lifecycle boundaries—bridge, target, context, Store, shared-browser setup, and shared-browser teardown—and finish with 0 leaked owned processes, profiles, or ports.
- **SC-005** `[buildable]`: Browser-smoke selection retains the 3 deterministic functional scenarios from the current full-atlas suite and excludes its 2 timing/long-task performance scenarios.
- **SC-006** `[outcome]`: 3 consecutive scheduled browser-performance runs complete with 0 hosted-runner lifecycle timeouts; any remaining timing-budget variance is reported as performance evidence rather than a missing CI signal.
- **SC-007** `[buildable]`: Exactly 1 injected CI-mode browser failure produces bounded diagnostics, 1 passing invocation produces 0 diagnostics, and the workflow artifact step is failure-only with `if-no-files-found: ignore` behavior.

## Assumptions

- GitHub-hosted Ubuntu runners continue to provide a Chrome-compatible executable discoverable by the existing harness; migrating the browser driver or pinning a browser image is not required for this change.
- The HTTP bridge's existing dashboard static-file support is the production-representative server seam for built browser acceptance tests.
- The currently authorized CI-fix commit and push permission applies to this agreed structural implementation; merging or releasing remains out of scope.
- Browser smoke remains sequential within one runner for stability; wider parallelism happens through independent GitHub Actions jobs rather than multiple local browser workers.

## Dependencies

- Existing Vitest 4 runner, Chrome DevTools Protocol harness, dashboard build, HTTP bridge static serving, and GitHub Actions.

## Out of scope

- Migrating the dashboard test suite to Playwright or another browser automation dependency.
- Changing dashboard product behavior, HTTP payload contracts, or persistence semantics.
- Making performance thresholds a required pull-request gate on shared GitHub-hosted runners.
- Cross-browser coverage beyond the existing Chrome/Edge-compatible harness.
- Merging the pull request, publishing npm packages, or creating a release.
