# Verification Report

## Round

round 1

## Completeness

- Proposal recovered from `openspec/changes/include-superseded-http-history/proposal.md`.
- Tasks recovered from `openspec/changes/include-superseded-http-history/tasks.md`.
- Accelerated pipeline verified against proposal success criteria; no spec/design artifacts expected.
- Tasks 1.1-3.3 are checked complete in `tasks.md:19`, `tasks.md:27`, `tasks.md:37`, `tasks.md:45`, `tasks.md:53`, `tasks.md:62`, `tasks.md:74`, `tasks.md:83`, `tasks.md:92`, `tasks.md:101`, `tasks.md:110`, `tasks.md:121`, `tasks.md:130`, and `tasks.md:139`.

## Build and Test Evidence

- Root evidence: `pnpm exec vitest run tests/http-server.test.ts tests/http-viz.test.ts` passed, 2 files and 41 tests.
- Root evidence: `pnpm run build` passed.
- Root evidence: `pnpm test` passed, 50 files and 644 tests.
- Root evidence: `git diff --check` found no whitespace errors; only line-ending warnings.

## Compliance Matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| `/projects/{project}/graph` omits superseded facts by default and includes tagged historical facts only when `include_superseded=true`. | Compliant | Explicit-true parser at `src/http-routes.ts:320`; project graph passes flag at `src/http-routes.ts:1206` and `src/http-routes.ts:1208`; Store filters superseded rows unless opted in at `src/store/index.ts:5259` and `src/store/index.ts:5265`; tests cover false-like defaults at `tests/http-server.test.ts:1247` and opt-in tagged history at `tests/http-server.test.ts:1299`. |
| `/observatory/ledger/{id}` omits superseded facts by default and includes tagged historical facts only when `include_superseded=true`. | Compliant | Ledger handler parses and forwards the flag at `src/http-routes.ts:1157` and `src/http-routes.ts:1158`; Store ledger detail passes it into fact retrieval at `src/store/index.ts:4678` and `src/store/index.ts:4681`; tests cover false-like defaults at `tests/http-viz.test.ts:258` and opt-in tagged history at `tests/http-viz.test.ts:302`. |
| OpenAPI documents `include_superseded` for both HTTP surfaces and optional `superseded` on fact payloads. | Compliant | Ledger parameter documented at `src/http-openapi.ts:691` and `src/http-openapi.ts:697`; project graph parameter documented at `src/http-openapi.ts:798` and `src/http-openapi.ts:806`; optional `superseded` field is documented at `src/http-openapi.ts:2130` and omitted from required fields at `src/http-openapi.ts:2135`; ledger facts reuse `ProjectGraphFact` at `src/http-openapi.ts:1943`; tests assert parameters and optional schema at `tests/http-server.test.ts:1918`, `tests/http-server.test.ts:1926`, and `tests/http-server.test.ts:1933`. |
| Existing Store behavior is reused; no schema migration, MCP registry change, or new graph persistence path is introduced. | Compliant | HTTP routes reuse `store.getObservationFacts` at `src/http-routes.ts:346`; ledger detail reuses `getObservationFacts` at `src/store/index.ts:4681`; existing KG fact path owns include/filter/tag behavior at `src/store/index.ts:5229`, `src/store/index.ts:5259`, and `src/store/index.ts:5326`; diff scope is limited to HTTP routes, types, OpenAPI, and tests. |
| Focused HTTP/OpenAPI tests cover default current-only behavior, opt-in history behavior, and documented parameters/schemas. | Compliant | Project graph default and opt-in tests at `tests/http-server.test.ts:1247` and `tests/http-server.test.ts:1299`; observatory ledger default and opt-in tests at `tests/http-viz.test.ts:258` and `tests/http-viz.test.ts:302`; OpenAPI assertions at `tests/http-server.test.ts:1918` through `tests/http-server.test.ts:1937`. |

## Issues Found

### Critical

None.

### Warnings

None.

## Verdict

pass

All 5 proposal success criteria are compliant. No critical issues or warnings were found. The governance auto-suggest heuristic did not match: the proposal, tasks, and changed files do not touch constitution/principle artifacts or named governance principles.
