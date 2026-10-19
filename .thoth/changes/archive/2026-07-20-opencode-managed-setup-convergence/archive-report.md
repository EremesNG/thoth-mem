# Archive Report: OpenCode managed setup convergence

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-07-20-opencode-managed-setup-convergence/`

## Completed scope

- US1 / FR-001, FR-002, FR-003, FR-010, FR-011 / SC-001, SC-006: global and project OpenCode setup now converges older, newer, absent, malformed, and same-version-diverged state from current packed assets, replaces the whole managed target and plugin entry link-safely, and repeats as an exact no-op.
- US2 / FR-005, FR-006, FR-007, FR-008 / SC-002, SC-004: temporary target-bound signed journals provide in-process and crash restoration, invalid evidence resets safely, successful setup removes durable rollback evidence, and cleanup faults return bounded success warnings with later retry.
- US3 / FR-004 / SC-003: JSONC precedence, parseable unrelated-setting preservation, canonical MCP repair, and raw-byte non-colliding malformed-config quarantine are implemented.
- US4 / FR-009, FR-010, FR-011 / SC-005, SC-006, SC-007: plan mode stays zero-write, human/JSON result semantics and restart guidance agree, packed global/project flows pass, and all repository gates pass.

## Verification lineage

- `plan-review.md` records optional Oracle `[OKAY]` before implementation.
- The first `verify-report.md` result identified ORA-VERIFY-001, a junction-ancestor journal containment defect; convergence task T024 added physical trusted-root validation and global/project outside-sentinel regressions.
- `verify-report.md` now records independent oracle PASS with executed evidence for FR-001 through FR-011 and SC-001 through SC-007.
- Final Oracle coherence review confirmed the behavior-neutral `[ADDED cli]` and `[ADDED packaging]` delta refinement preserves the PASS result and has no canonical title collision.

## Canonical specification sync

- Updated: `cli`, `packaging`.
## Deviations and residual warnings

- The accepted contract intentionally permits destructive replacement, downgrade, and removal of post-success OpenCode rollback evidence; this is recorded as a scoped P5 justified exception while CLI names, fields, statuses, and exit codes remain stable.
- One POSIX-only file-mode test was skipped on Windows; Oracle reviewed the explicit `0o600` request, while Windows junction security tests executed and passed.
- No real user-home setup, host restart, publication, release, or generated `dist/` edit was performed.

## Follow-up

- None required for the verified change. Any real-host smoke or publication remains a separately authorized stateful operation.
