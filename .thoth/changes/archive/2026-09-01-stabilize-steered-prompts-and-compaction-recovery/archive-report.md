# Archive Report: Stabilize Steered Prompt Capture and Compaction Recovery

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-09-01-stabilize-steered-prompts-and-compaction-recovery/`

## Completed scope

- US1 / FR-001–FR-002 / SC-001–SC-002: Codex, Claude, and OpenCode preserve distinct mid-turn prompt submissions while exact retries remain idempotent and content-derived keys use sanitized input.
- US2 / FR-003 / SC-003–SC-004: Post-compaction guidance selects only an exact-session current summary and otherwise returns truthful identity-only abstention with empty IDs and sources.
- US3 / FR-004 / SC-005: Ordinary recovery, explicit context, and project briefing retain project-wide promoted-memory eligibility.

## Verification lineage

- `verify-report.md` records independent Oracle PASS with complete FR/buildable-SC evidence and independently executed focused checks.
- Root verification passed build, 343/343 full tests, integration verification/smoke, fixture benchmark, prepublish, and whitespace validation.

## Canonical specification sync

- Updated: `harness-integration`, `retrieval`.
## Deviations and residual warnings

- The first full-suite run exposed a stale benchmark expectation that treated project-handoff delivery after summary-less compaction as success. The fixture converged to the accepted confirmed identity-only abstention contract and all checks then passed.
- Claude exposes no native per-submission ID, so prompts that become identical after sanitation remain intentionally indistinguishable from exact retries.
- Preserve attribution for unrelated pre-existing canonical-project-identity changes in the dirty worktree.

## Follow-up

- None.
