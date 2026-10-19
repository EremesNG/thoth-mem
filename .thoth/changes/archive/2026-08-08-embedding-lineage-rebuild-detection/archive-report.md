# Archive Report: Reliable embedding-lineage rebuild detection

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-08-embedding-lineage-rebuild-detection/`

## Completed scope

- US1 / FR-001 / FR-002 / FR-004 / SC-001: Semantic migration preserves the prior lane hash long enough for startup to detect A→B lineage changes, enqueue exactly one rebuild, and mark both lanes pending/stale.
- US2 / FR-002 / FR-003 / SC-002: Startup and readiness inspect live vector hashes, recover old or null lineage even when lane metadata was already overwritten, and never report mixed-lineage coverage ready.
- US3 / FR-004 / SC-003: Rebuild requests reactivate terminal rows, preserve active rows, retain one row per dedupe key, suppress fully covered vector-only churn, and still repair partial or unrelated child coverage.
- SC-004: Focused tests, build, full suite, diff validation, and independent Oracle probes passed without public or schema-shape changes.

## Verification lineage

- `verify-report.md` records independent Oracle PASS with 92/92 focused tests, a successful build, 1,115 passing full-suite tests with 1 skip, terminal/coverage probes, and clean diff checks.
- `plan-review.md` records the optional pre-implementation Oracle `[OKAY]` decision at the reviewed artifact digests.

## Canonical specification sync

- None: no durable behavior delta.
- All FRs are `[INTERNAL]` because the patch restores the existing canonical store staleness and indexing rebuild contracts rather than adding or changing a durable requirement.

## Deviations and residual warnings

- The accepted FR wording and implementation scope are unchanged; delta markers were refined from capability modifications to `[INTERNAL]` at closeout after confirming the canonical requirements already mandate staleness detection and idempotent automatic rebuild.
- Non-blocking Git LF→CRLF conversion warnings remain for changed TypeScript files.
- `RR-SC-005` remains: the real database still requires a separately authorized rebuild and post-run lineage/readiness verification.

## Follow-up

- Install or run the verified code version, confirm LM Studio exposes `text-embedding-embeddinggemma-300m`, obtain explicit authorization, process the real semantic rebuild to completion, and verify every live vector has the active hash with no active/failed semantic jobs and both lanes ready.
