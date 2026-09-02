# Archive Report: Stabilize Import Recall Ranking

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-02-stabilize-import-recall-ranking/`

## Completed scope

- FR-001 through FR-005 and buildable SC-001 through SC-005 are complete: fixed corpus-independent ranking, immutable revision-9 import cohorts, exact-first capacity-aware recall, fail-closed import verification, diagnostics, packaging, documentation, and the offline benchmark all pass.
- The disposable corpus-scale regression preserves 17/17 complete ordered Top-K lists after 1,000 matching imported memories, with zero inversions.

## Verification lineage

- `verify-report.md` records fresh independent Oracle PASS after focused tests, build, 397-test full suite, integration inventory/smoke, fixture, prepublish, exact-six-tool audit, diff hygiene, and a passing 10/100 paired benchmark.

## Canonical specification sync

- Updated: `retrieval`, `store`.
## Deviations and residual warnings

- No accepted-scope deviation. The benchmark deliberately separates before/after stable-ranking equality from same-extended-corpus E0/stable latency so the p95 ratio isolates strategy cost.
- SC-006 remains an explicit operational risk: no real-copy rehearsal or cutover was authorized or executed.
- Non-blocking follow-ups: locale-independent Unicode case folding coverage and independent JSON Schema-engine parity may be considered in later changes.

## Follow-up

- With separate authorization, run the isolated-copy rehearsal and require 17/17 exact Top-K preservation, 17/17 self-retrieval at rank 1, sampled bugfix recall, import integrity/replay, and byte-identical originals before considering cutover.
