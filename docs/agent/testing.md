# Testing and verification

This document is the canonical owner for test selection and verification thresholds.

## Test layout

- `vitest.test-patterns.ts` is the canonical lane map. Every `tests/**/*.test.ts` file belongs to exactly one unit, integration, browser-smoke, or browser-performance lane.
- Real-browser files end in `.browser.test.ts`; scheduled timing and long-task cases end in `.performance.test.ts`. The default `vitest.config.ts` aggregate excludes both browser suffixes.
- Integration owns `tests/integration.test.ts`, root `tests/http-*.test.ts`, and the `tests/integration/`, `tests/setup/`, and `tests/packaging/` directories. Unit owns the remaining non-browser files.
- Suites mirror behavior: `tests/store/`, `tools/`, `retrieval/`, `indexing/`, `sync/`, `integration/`, `setup/`, `packaging/`, `dashboard/`, and `utils/`.
- Most storage tests use `new Store(':memory:')`; prefer deterministic in-memory SQLite when filesystem behavior is not the subject.
- Use Vitest APIs (`describe`, `it`, `expect`, `beforeEach`, `afterEach`), behavior-focused names, and the nearest matching test directory.
- Mirror source relative imports with explicit `.js` extensions. Close stores and clean temporary directories in teardown.

## Verified commands

From the repository root:

| Purpose | Command | Notes |
| --- | --- | --- |
| One non-browser file | `pnpm test -- tests/tools/mem-save.test.ts` | Preferred first check; builds package output before the filterable aggregate |
| One unit file, direct | `pnpm exec vitest run tests/tools/mem-save.test.ts --config vitest.unit.config.ts` | Avoids the aggregate package build when package output is irrelevant |
| One named test | `pnpm exec vitest run tests/tools/mem-save.test.ts -t "saves a new observation and returns created action"` | Narrowest example |
| Non-browser aggregate | `pnpm test` | Builds package output, then runs unit and integration files; excludes real-browser tests |
| Unit lane | `pnpm run test:unit` | Fast tests without package-build or browser prerequisites |
| Integration lane | `pnpm run test:integration` | Builds package output first, then runs HTTP, setup, packaging, and integration contracts |
| Browser smoke lane | `pnpm run test:browser` | Builds the dashboard once, starts one shared Chrome process, and runs deterministic acceptance cases |
| Browser performance lane | `pnpm run test:browser:performance` | Builds the dashboard once and runs only timing/long-task cases; scheduled/manual CI, not pull requests |
| Watch | `pnpm run test:watch` | Interactive only; do not use as a terminating verification command |
| Root build/type/package gate | `pnpm run build` | Runs `tsc --noEmit`, the build script, and dashboard build |
| Ad hoc root type-only | `pnpm exec tsc --noEmit` | Not a packaged script |
| Dashboard typecheck | `pnpm run dashboard:typecheck` | Packaged root forwarding script |
| Integration package verification | `pnpm run integration:verify` | Read-only package/inventory verifier; use for delivery changes |
| Release gate | `pnpm run prepublishOnly` | Build plus full tests |

There is no root lint script. Do not invent one. The dashboard manifest has build, dev, preview, and typecheck scripts but no dashboard test script; dashboard-focused tests use the root browser Vitest configurations.

Each browser Vitest run owns one headless Chrome process. Each test invocation gets a fresh incognito browser context and page target plus a fresh in-memory Store and HTTP bridge. The bridge serves the previously built dashboard and APIs from one origin, so tests do not start Vite per case. Per-test cleanup disposes the page/context, bridge, and Store; global teardown owns Chrome and its temporary profile.

Unexpected browser acceptance failures in CI attempt to write bounded evidence under ignored `test-results/browser/`: a JPEG up to 2 MiB, a UTF-8-safe DOM snapshot up to 512 KiB, and JSON metadata up to 32 KiB. Passing cases and intentional lifecycle fault injections write nothing. Artifact capture must never replace the original test result.

## Selection and escalation

1. Run the nearest focused file or named test first.
2. Expand to related domain suites when shared behavior, contracts, or data flow changes.
3. Run `pnpm run build` for TypeScript API, module/export, bundle, dashboard-build, or package-output changes.
4. Run both `pnpm run build` and `pnpm test` when changing build behavior, non-browser discovery, schema logic, or MCP tool registration.
5. Add dashboard typecheck and focused browser smoke for dashboard TypeScript/UI changes; add relevant HTTP integration tests when its API contract changes.
6. Add integration verification and packaging suites for inventory, published assets, setup delivery, or package layout changes.
7. Pull-request CI has four independent jobs: quality/unit, integration, browser smoke, and retrieval evaluation. Browser failures upload available diagnostics with missing-file tolerance. Dense-atlas performance runs daily or manually in `.github/workflows/dashboard-performance.yml` and does not block pull requests.

Never report a command as passed unless it ran. Separate pre-existing failures from failures caused by the change, and state any intentionally unexecuted checks.
