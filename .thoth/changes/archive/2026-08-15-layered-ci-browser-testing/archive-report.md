# Archive Report: Layered CI browser testing

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-15-layered-ci-browser-testing/`

## Completed scope

- Split 103 test files into disjoint unit, integration, browser-smoke, and browser-performance ownership while preserving a filterable non-browser aggregate.
- Replaced per-test Chrome/Vite startup with one suite-owned Chrome process and isolated per-invocation context, target, Store, and HTTP bridge lifecycles.
- Moved two timing/long-task atlas scenarios to a scheduled/manual workflow while retaining three deterministic full-atlas scenarios in pull-request smoke.
- Added bounded failure-only browser diagnostics and missing-file-tolerant failure artifact publication.
- Updated contributor guidance and completed FR-001–FR-008 plus buildable SC-001–SC-005 and SC-007.

## Verification lineage

- `verify-report.md` records independent Oracle PASS with focused reruns, complete local lane gates, lane enumeration, cleanup scans, and diff hygiene evidence.
- The fresh Oracle found no critical issues and independently observed zero owned Chrome/profile residue.

## Canonical specification sync

- None: no durable behavior delta.
- All declared requirements are `[INTERNAL]`, so no canonical capability specification is expected to change.

## Deviations and residual warnings

- SC-006 remains an outcome risk until three consecutive scheduled post-merge performance runs pass.
- The global teardown's 20-second wrapper is shorter than the combined extreme internal OS cleanup budgets, although normal and injected cleanup passed.
- `plan.md` retains a non-behavioral `dashboard/dist` path typo; implementation and canonical documentation correctly use `dist/dashboard`.

## Follow-up

- After merge, observe three consecutive scheduled `Dashboard performance` workflow runs and record whether SC-006 passes.
