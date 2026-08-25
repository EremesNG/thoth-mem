# Archive Report: SQLite-first persistent memory core v2

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-25-sqlite-first-memory-core/`

## Completed scope

- FR-001–FR-063: SQLite-authoritative v2 ledger, lexical retrieval, optional rebuildable projections, exact six MCP tools, three native lifecycle bundles, read-only legacy importer, fail-closed benchmark program, atomic package/runtime cutover, and retirement of deferred v1 surfaces.
- SC-001–SC-012 and SC-014 have independent PASS evidence. SC-013 is recorded as an explicit external outcome risk rather than fabricated success.

## Verification lineage

- `verify-report.md` records independent Oracle rounds 1–4 FAIL, their convergence tasks T055–T066, and fresh round-5 PASS with executed focused, full, migration, package, lifecycle, benchmark, and restart-atomicity evidence.

## Canonical specification sync

- Updated: `evals`, `harness-integration`, `indexing`, `packaging`, `retrieval`, `store`, `tools`.
## Deviations and residual warnings

- `R-SC013-EXTERNAL`: LongMemEval-S, LoCoMo, AMB BEAM/PersonaMem, and SDEBench external outcome baselines remain unavailable; no optional lane is promoted.
- `R-HOST-001`: disposable native-shaped plugin runners pass, but real OpenCode/Codex/Claude binaries and model consumption remain unobserved.
- Validator semantic-overlap warnings were reviewed as intentional destructive v2 deltas that replace/remove the prior Frankenstein boundaries during archive.
- Node `DEP0190` and CRLF conversion warnings are non-blocking.

## Follow-up

- Run licensed external decision lanes when available; any optional lane remains disabled until the same-budget promotion gate passes.
