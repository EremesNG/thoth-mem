# Archive Report: Native plugin distribution parity

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-25-native-plugin-distribution-parity/`

## Completed scope

- Replaced copied OpenCode activation with exact native npm/file loading, a synchronized global Skill, one package-relative six-tool MCP, verified host identity, and cache-safe recovery.
- Kept SQLite and `better-sqlite3` behind a bounded package-relative Node lifecycle boundary while the OpenCode adapter executes safely in Bun.
- Preserved manager-native Codex and Claude distribution, explicit local/public runtime provenance, shared provider data, bounded setup ownership, repair, rollback, and idempotency.
- Closed all FR-001 through FR-045 and buildable SC-001 through SC-013; observed real prompt-free OpenCode model use and stable cross-host IDs for SC-008 and SC-009.

## Verification lineage

- `verify-report.md` records six independent Oracle rounds, ending in a final outcome-aware PASS with no actionable blockers.
- Build, 28-file/120-test full suite, integration inventory, packed Bun smoke, focused 14-file/76-test final Oracle suite, static compiled-graph inspection, diff hygiene, Codex real-host evidence, Claude structural validation, and the hashed OpenCode export form the audit chain.

## Canonical specification sync

- Updated: `cli`, `harness-integration`, `packaging`.
## Deviations and residual warnings

- Paid Claude real-model consumption remains `RISK-CLAUDE-MODEL` because no paid Claude session is available; structural Claude certification is PASS.
- The unrelated untracked `openspec/changes/restore-native-bundle-activation/` change must remain untouched.

## Follow-up

- Publication, release tagging, and paid Claude model certification remain separate user-authorized work.
