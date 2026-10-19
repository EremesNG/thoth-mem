# Verification Report: Graph Navigation V2

## Round
round 2

## Completeness
Round 1 C1 is remediated. Focused lineage now fetches `observation_id` before timeline pagination and gates it by project/topic scope at `src/tools/project-views.ts:246`, `src/tools/project-views.ts:248`, and `src/tools/project-views.ts:249`, then uses the normal timeline path only for non-focused lineage at `src/tools/project-views.ts:252`.

## Build and Test Evidence
- Ran `pnpm exec vitest run tests/tools/mem-project.test.ts -t "focused lineage"`: 1 file / 1 test passed.
- Ran `pnpm exec vitest run tests/tools/mem-project.test.ts -t "graph navigation modes"`: 1 file / 1 test passed.
- Ran `pnpm exec vitest run tests/tools/mem-project.test.ts tests/store/visualization.test.ts`: 2 files / 31 tests passed.
- Root-reported after remediation: `pnpm run build` passed; `pnpm test` passed with 50 files / 678 tests.
- OpenSpec preflight passed: `openspec/config.yaml`, `openspec/specs`, and `openspec/changes` exist.

## Compliance Matrix
- PASS - tools/Omitted navigation keeps existing ledger: default dispatch falls to ledger at `src/tools/mem-project.ts:122`, `src/tools/mem-project.ts:188`; regression at `tests/tools/mem-project.test.ts:279`.
- PASS - tools/Explicit ledger navigation matches default: same formatter path; test at `tests/tools/mem-project.test.ts:314`.
- PASS - tools/MCP registry remains compact: six registrations at `src/tools/index.ts:22`; test at `tests/tools/mem-project.test.ts:380`.
- PASS - tools/Legacy callers remain valid: additive fields are optional at `src/tools/mem-project.ts:37`; legacy/default test at `tests/tools/mem-project.test.ts:279`.
- PASS - tools/Focused neighborhood returns frontier evidence: dispatch validates `obs:<id>` and formatter emits focus/frontier at `src/tools/mem-project.ts:123`, `src/tools/project-views.ts:217`.
- PASS - tools/Neighborhood output is bounded: limit/max chars/frontier state at `src/tools/project-views.ts:191`, `src/tools/project-views.ts:224`, `src/tools/project-views.ts:236`.
- PASS - tools/Project lineage is deterministic and bounded: non-focused path uses scoped timeline and emits pivot fields at `src/tools/project-views.ts:252`, `src/tools/project-views.ts:262`; store ordering at `src/store/index.ts:4828`.
- PASS - tools/Focused lineage narrows scope: fixed pre-pagination focused fetch and project/topic checks at `src/tools/project-views.ts:246`, `src/tools/project-views.ts:248`; regression covers wrong topic/project at `tests/tools/mem-project.test.ts:491`, `tests/tools/mem-project.test.ts:500`.
- PASS - tools/Default ledger hides superseded facts: ledger ignores `include_superseded` dispatch and uses default current-state facts at `src/tools/mem-project.ts:188`; test at `tests/tools/mem-project.test.ts:536`.
- PASS - tools/Superseded view includes tagged history: explicit formatter requests history and tags facts at `src/tools/project-views.ts:294`, `src/tools/project-views.ts:318`; test at `tests/tools/mem-project.test.ts:551`.
- PASS - tools/Community view reports summary state: state, coverage, freshness, sources at `src/tools/project-views.ts:334`, `src/tools/project-views.ts:351`.
- PASS - tools/Community view avoids deferred claims: negative assertions at `tests/tools/mem-project.test.ts:455`, `tests/tools/mem-project.test.ts:456`.
- PASS - tools/Compact MCP registry unchanged: same six-tool evidence at `src/tools/index.ts:22`.
- PASS - visualization/Scoped context can back MCP navigation: MCP views reuse context/frontier/timeline/community primitives at `src/tools/project-views.ts:193`, `src/tools/project-views.ts:198`, `src/tools/project-views.ts:252`, `src/tools/project-views.ts:334`.
- PASS - visualization/API primitives remain bounded: frontier and timeline enforce limits/continuation at `src/store/index.ts:4742`, `src/store/index.ts:4762`, `src/store/index.ts:4812`, `src/store/index.ts:4834`.
- PASS - visualization/Ledger default excludes superseded facts: store filters history unless explicitly included at `src/store/index.ts:5389`; test at `tests/store/visualization.test.ts:235`.
- PASS - visualization/Ledger opt-in includes tagged superseded facts: opt-in and superseded marker at `src/store/index.ts:5389`, `src/store/index.ts:5456`; test at `tests/store/visualization.test.ts:236`.
- PASS - visualization/Frontier distinguishes new and visible nodes: `added_node_ids` and `already_visible_node_ids` at `src/store/index.ts:4762`; test at `tests/store/visualization.test.ts:314`.
- PASS - visualization/Frontier continuation/exhaustion: continuation/reason at `src/store/index.ts:4766`, `src/store/index.ts:4770`; test at `tests/store/visualization.test.ts:323`.
- PASS - visualization/Community inspection metadata: bounded summaries/sources at `src/tools/project-views.ts:335`, `src/tools/project-views.ts:340`.
- PASS - visualization/Missing or stale communities explicit: state/degraded/no summaries at `src/tools/project-views.ts:353`, `src/tools/project-views.ts:359`.
- PASS - visualization/Shared scope drives dashboard and MCP: shared observatory scope normalization and context token at `src/store/index.ts:4606`; MCP reuse at `src/tools/project-views.ts:193`.
- PASS - visualization/Ledger-capable payload has provenance: ledger detail provenance at `src/store/index.ts:4791`; text output IDs/topic/timestamps at `src/tools/project-views.ts:48`.

## Design Coherence
Design remains coherent: no new MCP tool, default graph stays ledger, navigation is opt-in, outputs are bounded, superseded history is explicit, community remains inspection-oriented, and no HTTP/OpenAPI parity change was required. The round 1 failure is specifically fixed without breaking non-focused lineage continuation, which still uses `getObservatoryTimeline` with `continuation` at `src/tools/project-views.ts:253`.

Constitution auto-suggest is surfaced because `design.md` references the constitution and named principles at `openspec/changes/graph-navigation-v2/design.md:118`. This is advisory only.

## Issues Found

### Critical
None.

### Warnings
None.

## Verdict
pass
