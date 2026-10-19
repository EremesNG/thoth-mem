# Archive Report: Transformers local execution device selection

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-09-transformers-local-device-selection/`

## Completed scope

- Added the five-value local embedding execution-device contract with environment-over-persistence precedence and CPU default/backfill.
- Forwarded the selected device through both Transformers.js loading paths without changing model-specific dtype behavior or silently retrying explicit failures.
- Kept device selection outside semantic lineage so device-only changes do not enqueue rebuilds.
- Updated complete typed configurations, public JSON schema, focused tests, and operator documentation.
- Completed FR-001 through FR-007 and SC-001 through SC-007, including a real configured Windows DirectML outcome smoke.

## Verification lineage

- `verify-report.md` records independent Oracle PASS with complete FR/buildable-SC mapping, 143 focused passing tests, production build, 1,131 passing full-suite tests with 1 skipped, fresh IDE diagnostics, diff/status audits, and observed SC-006 evidence.

## Canonical specification sync

- Updated: `config`, `retrieval`.
## Deviations and residual warnings

- The executor-path RED produced five focused assertion failures rather than the task's initial two-count prediction; the task evidence was corrected without changing accepted behavior.
- CUDA and CoreML hardware execution were not observed on the Windows verification host; exact forwarding is covered deterministically and platform availability is documented.
- Git emitted non-blocking LF-to-CRLF working-copy advisories while `git diff --check` passed.

## Follow-up

- None.
