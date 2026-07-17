# Testing and verification

This document is the canonical owner for test selection and verification thresholds.

## Test layout

- Vitest discovers `tests/**/*.test.ts` with a 10-second timeout from `vitest.config.ts`.
- Suites mirror behavior: `tests/store/`, `tools/`, `retrieval/`, `indexing/`, `sync/`, `integration/`, `setup/`, `packaging/`, `dashboard/`, and `utils/`.
- Most storage tests use `new Store(':memory:')`; prefer deterministic in-memory SQLite when filesystem behavior is not the subject.
- Use Vitest APIs (`describe`, `it`, `expect`, `beforeEach`, `afterEach`), behavior-focused names, and the nearest matching test directory.
- Mirror source relative imports with explicit `.js` extensions. Close stores and clean temporary directories in teardown.

## Verified commands

From the repository root:

| Purpose | Command | Notes |
| --- | --- | --- |
| One file | `pnpm test -- tests/tools/mem-save.test.ts` | Preferred first check for a focused change |
| One file, direct | `pnpm exec vitest run tests/tools/mem-save.test.ts` | Equivalent direct runner form |
| One named test | `pnpm exec vitest run tests/tools/mem-save.test.ts -t "saves a new observation and returns created action"` | Narrowest example |
| Full suite | `pnpm test` | Runs Vitest once |
| Watch | `pnpm run test:watch` | Interactive only; do not use as a terminating verification command |
| Root build/type/package gate | `pnpm run build` | Runs `tsc --noEmit`, the build script, and dashboard build |
| Ad hoc root type-only | `pnpm exec tsc --noEmit` | Not a packaged script |
| Dashboard typecheck | `pnpm run dashboard:typecheck` | Packaged root forwarding script |
| Integration package verification | `pnpm run integration:verify` | Read-only package/inventory verifier; use for delivery changes |
| Release gate | `pnpm run prepublishOnly` | Build plus full tests |

There is no root lint script. Do not invent one. The dashboard manifest has build, dev, preview, and typecheck scripts but no dashboard test script; existing dashboard-focused tests run through the root Vitest suite.

## Selection and escalation

1. Run the nearest focused file or named test first.
2. Expand to related domain suites when shared behavior, contracts, or data flow changes.
3. Run `pnpm run build` for TypeScript API, module/export, bundle, dashboard-build, or package-output changes.
4. Run both `pnpm run build` and `pnpm test` when changing build behavior, test discovery, schema logic, or MCP tool registration.
5. Add dashboard typecheck for dashboard TypeScript/UI changes; add relevant HTTP/dashboard tests when its API contract changes.
6. Add integration verification and packaging suites for inventory, published assets, setup delivery, or package layout changes.
7. CI additionally runs dashboard typecheck, build, full tests, and `pnpm run eval:retrieval`. Treat eval changes as their own evidence-sensitive route rather than running them by default for every change.

Never report a command as passed unless it ran. Separate pre-existing failures from failures caused by the change, and state any intentionally unexecuted checks.
