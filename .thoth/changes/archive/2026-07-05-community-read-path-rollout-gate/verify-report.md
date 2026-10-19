# Verification Report: Community Read Path Rollout Gate

## Round
round 1

## Completeness
- OpenSpec preflight passed: `openspec/config.yaml`, `openspec/specs/`, and `openspec/changes/` exist.
- Tasks complete: 19/19 checked in `openspec/changes/community-read-path-rollout-gate/tasks.md:5`.
- Scenario coverage complete: 30/30 Given/When/Then scenarios mapped.

## Build and Test Evidence
- Focused matrix passed: `pnpm exec vitest run tests/config.test.ts tests/evals/retrieval.test.ts tests/store/community-summaries.test.ts tests/tools/mem-recall.test.ts tests/tools/mem-project.test.ts` - 111 tests.
- Retrieval eval passed: `pnpm run eval:retrieval`; rollout rows PASS; recall@1 95.7%, recall@5 100.0%.
- Build passed: `pnpm run build`.
- Full regression passed: `pnpm test` - 668 tests.

## Compliance Matrix
| Spec | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| retrieval | Global default stays disabled | Pass | Default false in `src/config.ts:306`; env/persisted/default resolution in `src/config.ts:950`; test in `tests/config.test.ts:466`. |
| retrieval | Opt-in is reversible | Pass | Opt-in/clearing tested in `tests/config.test.ts:475`; docs in `README.md:533`. |
| retrieval | Fresh committed state permits eligibility | Pass | Eligibility gates in `src/retrieval/community-rollout.ts:122`; fresh test in `tests/store/community-summaries.test.ts:449`. |
| retrieval | Stale or rebuilding state blocks eligibility | Pass | Fallback markers in `src/retrieval/community-rollout.ts:92`; tests in `tests/store/community-summaries.test.ts:462` and `tests/store/community-summaries.test.ts:936`. |
| retrieval | Failed or degraded state blocks eligibility | Pass | Non-degraded gate in `src/retrieval/community-rollout.ts:147`; tests in `tests/store/community-summaries.test.ts:462` and `tests/store/community-summaries.test.ts:960`. |
| retrieval | Eligible community evidence is KG sub-source evidence | Pass | Store emits `lane: 'kg'`, `source: 'kg_community_summary'` in `src/store/index.ts:4175`; tested in `tests/store/community-summaries.test.ts:596`. |
| retrieval | Direct KG remains rank-safe | Pass | Lane/rank eval gate in `src/evals/retrieval.ts:1710`; tested in `tests/evals/retrieval.test.ts:646`. |
| retrieval | B2 multi-hop remains no worse | Pass | B2 gate in `src/evals/retrieval.ts:1719`; tested in `tests/evals/retrieval.test.ts:654`. |
| retrieval | Missing summaries fall back to baseline hits | Pass | Missing marker path in `src/retrieval/community-rollout.ts:92`; tested in `tests/store/community-summaries.test.ts:933`. |
| retrieval | Stale or failed summaries fall back to baseline hits | Pass | Fallback preservation tested in `tests/store/community-summaries.test.ts:936` and `tests/store/community-summaries.test.ts:960`. |
| retrieval | Enrichment-unavailable state falls back to deterministic summaries or baseline | Pass | Degraded fallback in `src/retrieval/community-rollout.ts:98`; eval/test coverage in `tests/evals/retrieval.test.ts:620`. |
| retrieval | Community evidence obeys configured bounds | Pass | Store applies retrieval/char bounds in `src/store/index.ts:4141`; tested in `tests/store/community-summaries.test.ts:591`. |
| retrieval | Retrieval does not synthesize global answers | Pass | Design excludes GraphRAG synthesis in `openspec/changes/community-read-path-rollout-gate/design.md:16`; README scopes out GraphRAG in `README.md:224`. |
| evals | Disabled and enabled runs use same corpus and queries | Pass | Same-corpus metadata emitted in `src/evals/retrieval.ts:1612`; tested in `tests/evals/retrieval.test.ts:553`. |
| evals | A/B regression blocks eligibility | Pass | Zero regression gates in `src/evals/retrieval.ts:1613`; tested passed in `tests/evals/retrieval.test.ts:562`. |
| evals | Token-savings envelope is complete | Pass | Token metrics mapped in `src/evals/retrieval.ts:1630`; tests require all P4 rows in `tests/evals/retrieval.test.ts:580`. |
| evals | Token regression blocks rollout | Pass | Returned/evidence char gates in `src/evals/retrieval.ts:1637` and `src/evals/retrieval.ts:1645`; tests assert pass in `tests/evals/retrieval.test.ts:594`. |
| evals | Per-project readiness gate reports each input | Pass | Readiness rows in `src/evals/retrieval.ts:1576`; tests in `tests/evals/retrieval.test.ts:602`. |
| evals | Sparse coverage blocks readiness | Pass | Sparse eligibility gate in `src/evals/retrieval.ts:1603`; tested in `tests/evals/retrieval.test.ts:613`. |
| evals | Community-unavailable states preserve non-empty baseline hits | Pass | Fallback gate rows in `src/evals/retrieval.ts:1841`; tested in `tests/evals/retrieval.test.ts:620`. |
| evals | Fallback failure blocks rollout | Pass | Fallback rows require baseline/source counts in `src/evals/retrieval.ts:1850`; tests assert counts in `tests/evals/retrieval.test.ts:632`. |
| evals | Eval asserts no fifth lane | Pass | No-fifth-lane gate in `src/evals/retrieval.ts:1701`; store tests forbid `community` lane in `tests/store/community-summaries.test.ts:593`. |
| evals | Direct KG and B2 multi-hop do not regress | Pass | Direct/B2 gates in `src/evals/retrieval.ts:1710`; tests in `tests/evals/retrieval.test.ts:636`. |
| evals | Passing rollout evals do not imply deferred work is complete | Pass | README explicitly defers global default-on/P5/GraphRAG/multi-harness in `README.md:224`. |
| tools | MCP registry remains six tools | Pass | Registry exactly six tools in `src/tools/index.ts:22`; test in `tests/tools/mem-recall.test.ts:31`. |
| tools | Admin rollout evidence is not an MCP tool | Pass | README routes admin ops to CLI/HTTP, not MCP, in `README.md:259`. |
| tools | mem_recall surfaces community evidence through existing output | Pass | Existing output annotates community evidence in `src/tools/mem-recall.ts:28`; tested in `tests/tools/mem-recall.test.ts:407`. |
| tools | Full source detail still escalates through mem_get | Pass | `mem_get` remains in tool map/docs in `README.md:253`; summary test keeps `mem_get(id=` escalation in `tests/tools/mem-project.test.ts:191`. |
| tools | Tool output does not imply harness parity | Pass | README deferred-scope wording in `README.md:224`; graph-output tests exclude claims in `tests/tools/mem-project.test.ts:252`. |
| tools | action=graph remains a KG fact ledger | Pass | Graph test expects KG ledger and no community-summary section in `tests/tools/mem-project.test.ts:251`. |

## Design Coherence
- No new MCP tools: `src/tools/index.ts:22` registers only `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, `mem_session`.
- No fifth lane: community candidates stay `lane: 'kg'` with `source: 'kg_community_summary'` in `src/store/index.ts:4175`.
- No new config property: design explicitly rejects new persisted config fields in `openspec/changes/community-read-path-rollout-gate/design.md:16`; schema only clarifies existing `readPath.enabled` in `config.schema.json:265`.
- Default-off and reversible opt-in preserved: `src/config.ts:306`, `src/config.ts:950`, `README.md:533`.
- On-demand per-project eligibility implemented: `src/retrieval/community-rollout.ts:104`; called from store at `src/store/index.ts:4147`.
- Same-corpus A/B gates implemented: `src/evals/retrieval.ts:1612`; tested at `tests/evals/retrieval.test.ts:553`.
- Fallback preservation implemented for missing/stale/rebuilding/failed/degraded states: `src/evals/retrieval.ts:1857`; tested at `tests/evals/retrieval.test.ts:620`.
- P3-only scope preserved: `README.md:224` and `README.md:533`.

## Issues Found

### Critical
None.

### Warnings
None.

## Constitution Suggestion
Surfaced, non-blocking. The change artifacts reference Constitution Check / named native principles in `openspec/changes/community-read-path-rollout-gate/design.md:40` and `openspec/changes/community-read-path-rollout-gate/design.md:42`. Consider running `sdd-constitution` to record a constitution amendment if the root judges this to be a governance/principle change.

## Verdict
pass
