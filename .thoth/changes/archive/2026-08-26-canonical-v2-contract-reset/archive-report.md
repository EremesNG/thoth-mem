# Archive Report: Canonical product contract reset

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-26-canonical-v2-contract-reset/`

## Completed scope

- FR-001/FR-002 and SC-001/SC-002 replace the accumulated active OpenSpec corpus with exactly eight current capabilities and remove ten retired capability directories.
- FR-003 through FR-009 and SC-003/SC-006 establish the generation-neutral CLI, MCP, lifecycle, database, receipt, module, runner, packaging, and Skill contracts for OpenCode, Codex, and Claude Code.
- FR-010 and SC-004/SC-005 retain real numeric machine-format revisions while removing transitional product-generation labels from active owned surfaces.

## Verification lineage

- `plan-review.md` records independent Oracle `[OKAY]` before implementation.
- `verify-report.md` records the fresh post-convergence independent Oracle `PASS`, compliance for every FR and SC, and executed focused, full, build, integration, smoke, benchmark, prepublish, residue, and diff-hygiene evidence.
- Convergence T019 corrected the only first-round artifact blocker, and the Accelerated `ready` validator then passed with zero errors and zero warnings.

## Canonical specification sync

- Updated: `cli`, `harness-integration`, `packaging`, `store`, `tools`.
## Deviations and residual warnings

- The first verification round failed only because FR-003/FR-004 used rename metadata after their old requirement titles were intentionally removed. They now correctly use modified deltas; no product-code remediation was required.
- Repository and disposable-host certification does not certify real-host database adoption, reinstall/restart, or actual model consumption.

## Follow-up

- Before the next real-host restart, close all host processes, create a recoverable backup, and explicitly adopt the selected existing database as `memory.sqlite`; then reinstall the rebuilt local bundle and run fresh Codex/OpenCode smoke tests. Claude real-host certification remains pending until the service is available.
