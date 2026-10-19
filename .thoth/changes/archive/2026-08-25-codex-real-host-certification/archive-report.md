# Archive Report: Codex real-host lifecycle certification

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-25-codex-real-host-certification/`

## Completed scope

- Certified official Codex lifecycle identity, native hook I/O, installed plugin packaging, isolated canary storage, exclusive lifecycle hooks, strict published-data control, and model consumption across FR-001 through FR-005 and SC-001 through SC-005.
- Resolved CDX-MCP-001 direct-map loader compatibility and CDX-MCP-002 executable routing for an explicit data directory.

## Verification lineage

- `verify-report.md` records fresh independent Oracle PASS from `oracle_codex_post_restart_final_verify` with no critical or major findings.
- Post-fix verification includes 19 files and 66 tests, build, integration inventory, packed tarball MCP/lifecycle smoke, prepublish, exact installed-canary handshake, trusted-hook inspection, confirmed canary receipts, strict published-control metadata equality, and token-free model recovery.

## Canonical specification sync

- Updated: `harness-integration`, `packaging`.
## Deviations and residual warnings

- Unrelated local index MCP connection failures and Codex model-cache, skill-budget, and plugin-path warnings did not prevent certified lifecycle behavior.
- Node `DEP0190` remains a non-failing warning from the pre-existing Windows npm-pack invocation.

## Follow-up

- None for this change.
