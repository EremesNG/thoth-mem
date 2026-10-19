# Archive Report: One-Command Legacy Import

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-02-one-command-legacy-import/`

## Completed scope

- Made `thoth-mem import-legacy` the normal migration workflow with conventional source/configured target defaults, optional bounded overrides, importer-owned custody, bounded output, actionable locked-target retry, and no manual plan/report choreography.
- Preserved the advanced explicit `plan` and `apply` subcommands and the existing verified backup, candidate, publication, recovery, privacy, taxonomy, and idempotency behavior.
- Advanced the sealed plan contract to v4 so its receipt-bound hash includes canonical null/empty/populated mapping request identity and rejects substituted or tampered custody.

## Verification lineage

- `verify-report.md` records independent Oracle round-5 PASS after four artifact-backed convergence rounds, with focused, full, integration, packed-smoke, fixture, prepublish, diff, and adversarial evidence.

## Canonical specification sync

- Updated: `cli`.
## Deviations and residual warnings

- SC-006 remains an explicit outcome risk: the real stopped-host cutover and post-cutover recall/integrity inspection have not run because the configured live target is open in this Codex session.

## Follow-up

- After closing every host that can hold the current database, run the single documented import command and inspect its retained report before removing any legacy or recovery artifact.
