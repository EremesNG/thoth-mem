# Archive Report: OpenCode packaged skill delivery

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-07-20-opencode-packaged-skill-delivery/`

## Completed scope

- OpenCode project and global setup install the complete packaged `thoth-mem` skill under receipt-owned plugin assets and report a specific failure when the packaged source is unavailable.
- The installed OpenCode plugin registers its native absolute bundled `skills` parent once while preserving existing user skill configuration.
- Managed inspection, replacement, rollback, packed-install verification, and inventory verification cover the bundled skill without mutating the user's shared OpenCode skills directory.

## Verification lineage

- `verify-report.md` records an independent oracle PASS for FR-001 through FR-006 and SC-001 through SC-006, backed by build, package verification, focused tests, full-suite evidence, diff checks, and IDE diagnostics.

## Canonical specification sync

- Updated: `harness-integration`, `packaging`.
## Deviations and residual warnings

- The implementation plan was refined to bind the exact OpenCode `./skills` runtime declaration to the shared packaged-skill inventory. No scope deviation or residual warning remains.

## Follow-up

- None. Real-host setup and publication remain intentionally out of scope.
