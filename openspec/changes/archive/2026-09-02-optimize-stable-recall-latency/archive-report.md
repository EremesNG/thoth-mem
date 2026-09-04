# Archive Report: Optimize Stable Recall Latency

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-02-optimize-stable-recall-latency/`

## Completed scope

- FR-001 through FR-004 and SC-001 through SC-005 are complete: stable scoring preserves frozen score/order semantics across locale-sensitive normalization, reuses bounded compiled work, and exposes no public or persistence-contract change.
- The final 470-question same-build evaluation preserves every stable ranked/delivered output and aggregate quality metric while reducing retrieval p95 from `13.0459 ms` to `9.3504 ms`, passing the accepted absolute `10-ms` budget.
- The contemporaneous RRF result is `1.6164 ms`; its `5.7847x` ratio remains visible as diagnostic evidence and is not a promotion blocker.

## Verification lineage

- `verify-report.md` records two independent Oracle rejections, their red/green locale convergence, the fully corrected round-5 evidence, repository/package gates, and a fresh final Oracle PASS.
- Final Oracle independently completed 3,456 exact differential comparisons across six locales with no mismatch and found no blocking risk.

## Canonical specification sync

- Updated: `retrieval`.
## Deviations and residual warnings

- No accepted-scope deviation. The unconditional ASCII shortcut and one-pass non-ASCII tokenization were rejected and corrected before approval; their immutable benchmark reports remain historical evidence.
- Stable p95 retains a finite `0.6496-ms` margin below the budget and is `5.7847x` slower than RRF. Future same-condition stable results above `10 ms` must fail the gate; the ratio remains diagnostic.
- A pre-convergence full-suite run timed out once in the temporary marketplace repository test; the isolated test and all later untouched full suites passed.
- Native addons/extensions and real-home database access remained outside scope and were not used.

## Follow-up

- Reopen bounded JavaScript/SQLite profiling only if a comparable stable run exceeds `10 ms` or product latency requirements tighten; preserve frozen scoring semantics and immutable evidence in either case.
