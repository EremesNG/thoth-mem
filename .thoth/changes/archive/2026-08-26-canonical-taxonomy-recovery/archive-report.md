# Archive Report: Canonical taxonomy recovery

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-26-canonical-taxonomy-recovery/`

## Completed scope

- FR-001 through FR-007 and buildable SC-001 through SC-006 pass for canonical runtime taxonomies, pre-transaction and SQLite enforcement, atomic revision-3 convergence, the strict Bun-to-Node OpenCode boundary, item-aware bounded recovery, and the unchanged exact six-tool surface.
- Outcome SC-007 passes in real OpenCode 1.18.23: a fresh no-tools session returned the absent-from-prompt SC008-A marker, recorded confirmed `enroll`, `capture_root`, and `recover` receipts, and produced no lifecycle diagnostic.

## Verification lineage

- `verify-report.md` records independent Oracle PASS after convergence, 30 files and 127 tests, build/inventory/packed/prepublish gates, a read-only real-ledger renderer replay, and the final independent real-host outcome audit.

## Canonical specification sync

- Updated: `harness-integration`, `store`, `tools`.
## Deviations and residual warnings

- The initial post-migration real-host smoke exposed a second host-rendering budget defect; convergence C001 added item-aware complete-line allocation before final PASS.
- The validator's semantic-overlap warning for the added store requirement was reviewed throughout planning and both Oracle rounds; it is non-blocking because the requirement adds closed V2 taxonomy enforcement rather than duplicating an existing behavior.
- T012 names inventory verification while the packed Bun execution is owned by `integration:smoke`; both gates passed.
- Pre-existing unrelated `benchmarks/results/fixture-report.json` and `openspec/changes/restore-native-bundle-activation/` changes were preserved.

## Follow-up

- Continue the separately scoped real-host lifecycle certification for pre/post-compaction and finalization; Claude model-consumption certification remains deferred until a paid Claude Code environment is available.
