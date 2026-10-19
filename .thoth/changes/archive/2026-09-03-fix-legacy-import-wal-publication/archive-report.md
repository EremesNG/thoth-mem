# Archive Report: Safe WAL Publication for Legacy Import

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-03-fix-legacy-import-wal-publication/`

## Completed scope

- Made stable non-empty-WAL targets publish successfully by separating sealed-plan validation from the importer-controlled checkpoint transition and capturing one normalized post-quiescence publication snapshot.
- Made publication recovery use create-only movement plus SQLite integrity, foreign-key, and logical-baseline proof before reporting `priorTargetRestored=true`.
- Preserved the one-command defaults, optional mapping and path overrides, bounded output, retry/replay, explicit `plan`/`apply`, schema, report, quarantine, taxonomy, ranking, and idempotency contracts.
- Retained all eight previously canonical legacy-import scenarios while adding durable WAL publication, restoration, and bounded-concurrency coverage.

## Verification lineage

- `verify-report.md` records a fresh independent Oracle PASS after the durable-delta completeness correction, with 63/63 focused tests, build, Full-route validation, diff hygiene, and an 8/8 canonical-scenario comparison; root evidence also includes 421/421 full tests, integration, packed smoke, benchmark fixture, and prepublish checks.

## Canonical specification sync

- Updated: `cli`.
## Deviations and residual warnings

- SC-005 remains an explicit outcome risk: the separately authorized real stopped-host cutover and post-cutover recall/integrity inspection have not run.
- Without native locking, the close-to-filesystem handoff remains detectably fail-closed rather than race-free; all hosts must be stopped for the real cutover.
- Exclusive movement relies on same-filesystem hard-link support; importer artifacts are placed beside the target and unsupported filesystems fail without claiming commit.

## Follow-up

- After closing every host that can hold the current database, rerun the same packaged `thoth-mem import-legacy` command and verify the retained report, SQLite integrity, and bounded recall examples.
