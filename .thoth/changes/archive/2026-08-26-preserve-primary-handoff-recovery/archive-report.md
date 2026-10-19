# Archive Report: Preserve primary handoff recovery

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-26-preserve-primary-handoff-recovery/`

## Completed scope

- FR-001 through FR-004 and SC-001 through SC-003 preserve a complete individually fitting primary handoff before remaining-budget secondary selection while retaining the 1,000-code-point cap, deterministic safety behavior, and truthful oversized truncation.
- FR-005 and SC-004 are observed PASS in fresh Codex and OpenCode sessions: both recovered the same hidden marker, title, path, and complete pending action from automatic hook context with zero tool calls or tool parts.

## Verification lineage

- `verify-report.md` records independent oracle PASS with executed evidence.
- Two fresh Oracle verification rounds separated buildable correctness from the final dual-host outcome; the final round found no accepted-scope residual risk.

## Canonical specification sync

- None: no durable behavior delta.
## Deviations and residual warnings

- None within the accepted Codex and OpenCode scope. Paid Claude Code model-use certification remains explicitly out of scope.
- Unrelated dirty hook-timeout, distribution-lock, packaging-test, and generated benchmark-report changes are preserved outside this change's verification verdict.

## Follow-up

- Resume the product sequence from the archived handoff; certify paid Claude Code model consumption when access becomes available without blocking this closeout.
