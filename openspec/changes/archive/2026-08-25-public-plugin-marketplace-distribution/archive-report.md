# Archive Report: Public plugin marketplace distribution

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-25-public-plugin-marketplace-distribution/`

## Completed scope

- Published repository-discoverable Codex and Claude catalogs over one shared public plugin root.
- Added a receipt-independent pinned-package lifecycle runner, validator-compatible host manifests, one shared MCP descriptor, one shared v2 Skill, full asset synchronization/integrity sealing, isolated installed-cache smoke, and local-canary write isolation.
- Closed all round-one Oracle major findings through T015-T018 and received an independent round-two PASS with no critical or major defect.

## Verification lineage

- `verify-report.md` records independent Oracle PASS with per-FR/per-SC evidence and the executed 84-test, build, integration, packed-smoke, prepublication, Codex-validator/manager, and Claude-validator checks.

## Canonical specification sync

- Updated: `harness-integration`, `packaging`.
## Deviations and residual warnings

- Convergence replaced the planned custom Codex manifest hook/direct-MCP paths with the installed validator's supported default `hooks/hooks.json` discovery and one shared `.mcp.json`; `plan.md` now records the implemented topology.
- SC-005 and SC-006 remain explicit real-host outcome risks until matching published-version certification runs.
- Windows packed smoke retains a non-failing Node `DEP0190` warning for the fixed-argument npm subprocess seam.

## Follow-up

- Run real public-profile Codex restart/recovery and Claude new-session/recovery certification after publication; address the Windows subprocess warning in a separate bounded maintenance change.
