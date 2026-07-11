# Archive Report: atomic-observation-writes

- Change: atomic-observation-writes
- Archive path: openspec/changes/archive/2026-06-30-atomic-observation-writes/
- Pipeline: accelerated SDD
- Spec merge: skipped (accelerated pipeline, no delta specs)

## Verification Lineage
- Source verification artifact: openspec/changes/archive/2026-06-30-atomic-observation-writes/verify-report.md
- Verdict: round 1 pass
- Compliance: 7/7 proposal success criteria (wrap-only verified +6/-0 under `git diff -w`, atomicity proven, no nested-tx error in `kg`/`legacy` modes, flag-off parity, both gates green)
- Critical issues: none
- Warnings: 1 non-blocking (W1 — `refreshSemanticRuntimeFromState()` intentionally stays outside the transaction, consistent with proposal's Out-of-Scope note; no action required)

## Build and Test Evidence
- `pnpm test` (vitest run): PASS — 46 files, 535 tests, 0 failures
- `pnpm run build` (`tsc --noEmit && node scripts/build.mjs && pnpm --dir dashboard build`): PASS, exit 0, no TypeScript diagnostics

## Outcome Summary
Implemented and verified round-1 pass. `Store.saveObservation` (both the
topic_key-upsert and new-insert paths) and `Store.updateObservation` in
`src/store/index.ts` now wrap their synchronous write bodies in a single
`this.db.transaction(() => { ... })()` each, mirroring the existing
`deleteObservation` hard-delete pattern — making the observation row, its
`observation_versions` history, its KG-triple diff, and its queued semantic
jobs commit or roll back together. Capability ownership: **store**
(transactional persistence of the observation write), reinforcing the
**knowledge-graph** capability's existing update-safe KG extraction
requirement. Three new rollback regression tests
(`tests/store/observations.test.ts`) prove a mid-write throw rolls back the
observation row, its version history, its `kg_triples`, and its
`sync_mutations` journal row together; mode-safety (`kg` and `legacy`
`graphFactsSource`) and flag-off (`kgSupersedeEnabled=false`) parity are
covered by dedicated tests, with all existing suites green.

The proposal's own "recordMutation coordination point" with the sibling
`sync-and-resilience` change (mutation-journal writes potentially landing
half in / half out of the new transaction boundary) was closed IN-CHANGE:
tasks.md documents (Task 6.1) that the pre-existing `recordMutation` calls at
`src/store/index.ts:1525/1555/1674` are already swept inside the new
transaction as a natural consequence of the wrap-only approach, and the new
rollback tests explicitly assert the `sync_mutations` row rolls back
alongside the observation row and KG triples — closing the coordination flag
rather than deferring it. Any *additional* journal writes `sync-and-resilience`
adds later to these same two methods must still be placed inside the existing
transaction boundaries, per the note left for that change's task author.

## Archive Action
- Moved only openspec/changes/atomic-observation-writes/ to openspec/changes/archive/2026-06-30-atomic-observation-writes/.
- Preserved required artifacts: proposal.md, tasks.md, verify-report.md, archive-report.md.
