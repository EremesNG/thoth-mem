# Archive Report: Harness session identity guidance

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-07-19-harness-session-identity-guidance/`

## Completed scope

- Added progressive identity routing plus bounded Codex, Claude Code, and OpenCode procedures for FR-001 through FR-004 and SC-001 through SC-002.
- Exposed lifecycle-resolved root identity in bounded model-visible recovery output for FR-005 through FR-006 and SC-003 through SC-004.
- Synchronized, inventoried, and verified all published harness references for FR-007 through FR-008 and SC-005 through SC-006.

## Verification lineage

- `verify-report.md` records independent oracle PASS with executed evidence.

## Canonical specification sync

- Updated: `harness-integration`, `packaging`.

## Deviations and residual warnings

- No scope deviations. `CODEX_THREAD_ID` remains explicitly documented as observed current-runtime recovery behavior rather than a public cross-version contract, with fail-closed degradation when absent or ambiguous.

## Follow-up

- None.
