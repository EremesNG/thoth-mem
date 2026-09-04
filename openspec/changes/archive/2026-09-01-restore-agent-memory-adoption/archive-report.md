# Archive Report: Restore agent memory adoption

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-01-restore-agent-memory-adoption/`

## Completed scope

- US1/FR-001/FR-003: balanced server discovery and six distinct workflow descriptions preserve the exact six-tool MCP contract.
- US2/FR-002/FR-004: the shared Skill now prompts proactive recall, durable saves, and conditional handoffs while routing uncertain claims to a complete conditional review reference.
- US3/FR-005/FR-006: deterministic host/public distribution and public-seam adoption regression tests cover the shipped contract.
- SC-001 through SC-004 passed with SDK, package, full-suite, smoke, benchmark, prepublish, and diff-hygiene evidence.

## Verification lineage

- `verify-report.md` records independent oracle PASS with executed evidence and no findings.
- `plan-review.md` records the pre-implementation Oracle `[OKAY]` decision.

## Canonical specification sync

- Updated: `harness-integration`, `tools`.
## Deviations and residual warnings

- No implementation deviation.
- `RISK-SC005`: static discovery and package contracts do not prove actual model adoption; a later authorized real-host evaluation remains required.
- Nonblocking Windows LF-to-CRLF notices produced no diff-hygiene defect.

## Follow-up

- When separately authorized, run a fresh-host behavioral evaluation and observe 3/3 positive workflow selections plus zero durable writes for 2/2 negative controls.
