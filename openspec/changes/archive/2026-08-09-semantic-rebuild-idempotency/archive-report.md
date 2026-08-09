# Archive Report: Idempotent semantic rebuild detection

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-09-semantic-rebuild-idempotency/`

## Completed scope

- US1 / FR-001 / SC-001: `rebuild-index --status` opens SQLite read-only, hydrates persisted state, and leaves semantic jobs and lanes byte-equivalent.
- US2 / FR-002 / FR-003 / FR-005 / SC-002 / SC-004: clean repeated startup converges for valid zero-unit content, and the supplied LM Studio configuration retains stable lineage across device-only changes.
- US3 / FR-002 / FR-004 / SC-003: genuine nonblank coverage and lineage defects continue to request exactly one active deduplicated rebuild.

## Verification lineage

- `verify-report.md` records independent Oracle PASS: 156 focused tests, 1,135 full-suite passes with 1 skip, successful build, zero WebStorm errors, and clean diff checks.
- The live user database and in-progress rebuild were excluded from implementation and verification.

## Canonical specification sync

- Updated: `indexing`, `tools`.
- Declared durable targets are `tools` and `indexing`.

## Deviations and residual warnings

- SC-005 remains an explicit outcome risk until the user observes three consecutive real MCP restarts or status inspections after upgrading and after the current rebuild completes.
- Before closeout, durable delta metadata was corrected from `retrieval` to the canonical `indexing` capability and existing canonical requirement names; FR/SC intent and implementation did not change.
- Non-blocking verification warnings remain VER-W001 (line-ending notices with clean diff) and VER-W002 (SQL datasource inspection noise with zero errors).

## Follow-up

- After release and completion of the current live rebuild, run three consecutive MCP restarts or read-only status inspections and confirm that no new rebuild becomes active.
