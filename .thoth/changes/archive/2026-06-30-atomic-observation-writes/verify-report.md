# Verification Report: Atomic Observation Writes

## Round
round 1

## Completeness
All 13 tasks across 6 phases are marked `[x]` in tasks.md and are substantiated by
code + tests present in the working tree. Working tree matches dispatch: 4 tracked
files modified (`src/store/index.ts` + 3 test files) plus untracked
`openspec/changes/atomic-observation-writes/`. No `.only`/`.skip`/`xit` slipped into
any changed test file.

## Build and Test Evidence
- `pnpm test` (`vitest run`) — **PASS: 46 files, 535 tests, 0 failures** (re-run independently).
- Isolated `tests/store/observations.test.ts` verbose run — 23/23 pass, including all
  three named rollback tests and the happy-path commit test.
- `pnpm run build` (`tsc --noEmit && node scripts/build.mjs && pnpm --dir dashboard build`)
  — **PASS, exit 0**. No TypeScript diagnostics; `src/store/index.ts` type-checks with
  the annotated callback return types (no `any` widening).

## Compliance Matrix (accelerated — proposal success criteria)
| Proposal criterion | Evidence | Status |
|---|---|---|
| Both `saveObservation` paths + `updateObservation` wrapped in a single `this.db.transaction(() => {...})()` each, mirroring hard-delete, same return values | `src/store/index.ts:1511/1536/1632` openers, `:1531/1563/1685` closers; mirrors `deleteObservation` :1598; `git diff -w` = **+6/-0** | PASS |
| Explicit return-type annotations, no `any` widening | `(): SaveResult` x2, `(): Observation \| null` x1; `tsc --noEmit` clean | PASS |
| New rollback test forces mid-write failure and asserts observation row + kg_triples roll back | `observations.test.ts:211/236/273` — spy throws, `toThrow(...)`, `toHaveBeenCalledTimes(1)`, asserts row + versions + kg_triples + sync_mutations rollback | PASS |
| Flag-off (`kgSupersedeEnabled=false`) byte-identical (delete-then-insert, no supersession markers) | `jobs.test.ts:432` asserts single surviving `HAS_WHAT` row, `superseded_*` null, `supersededCount===0`; pre-existing regression test :388 preserved | PASS |
| No nested-tx error in both `kg` and `legacy` modes | `observations.test.ts:305` (kg happy-path), `kg-facts-cutover.test.ts` legacy savepoint smoke test — both green | PASS |
| `pnpm test` green | 535/535 | PASS |
| `pnpm run build` green | exit 0 | PASS |

## Dispatch-Check Results
1. **Wrap-only / byte-identical** — CONFIRMED. `git diff -w -- src/store/index.ts` = exactly
   +6/-0 (3 openers + 3 `})();` closers); raw-diff deltas are re-indentation of pre-existing
   statements only. No statement removed/reordered. Return types explicitly annotated.
2. **Atomicity genuinely proven** — CONFIRMED. Each of the 3 rollback tests injects a throw via
   the `writeDeterministicKgFacts` spy, asserts `toHaveBeenCalledTimes(1)` (throw path exercised),
   and asserts rollback of observations + observation_versions + kg_triples + sync_mutations. Spy
   scoped per-test; `vi.restoreAllMocks()` in `afterEach` (observations.test.ts:190) prevents leak.
   The passing `toHaveBeenCalledTimes(1)` also proves `vi.spyOn(jobs, ...)` genuinely intercepts the
   named import at `src/store/index.ts:1125` — no false-positive.
3. **No nested-tx error (both modes)** — CONFIRMED. Legacy path nesting is real
   (`replaceObservationFacts` opens its own tx at :1088, now inside the outer wrap); the legacy
   smoke test in `kg-facts-cutover.test.ts` passes with no "transaction within a transaction" error.
   better-sqlite3 `^12.10.0` (savepoint flattening) confirmed in package.json.
4. **Flag-off parity** — CONFIRMED. `jobs.test.ts:432` asserts delete-then-insert with zero
   supersession markers; pre-existing flag-off test retained.
5. **Gates** — CONFIRMED. Re-ran both: 535/535 tests, build exit 0, zero diagnostics in
   `src/store/index.ts`.
6. **Task acceptance** — All 13 spot-checked and met; Task 3.2/4.1 helper anchors
   (`createLegacyObservationFactsTable`, `getObservationFacts`) exist so assertions are non-vacuous.

## Issues Found

### Critical
None.

### Warnings
- **[W1]** `saveObservationWithIndex` (`src/store/index.ts:1566-1576`) calls
  `refreshSemanticRuntimeFromState()` AFTER `saveObservation` returns — i.e. OUTSIDE the new
  transaction. This is correct and consistent with the proposal's explicit Out-of-Scope note
  (async embedding/runtime refresh stays outside the tx), so it is not a defect. Flagged only so
  the reviewer is aware the atomic unit deliberately excludes semantic-runtime refresh; no action
  required.
  - file: `src/store/index.ts:1570`
  - criterion: proposal Out-of-Scope "Asynchronous embedding / semantic-job EXECUTION ... stays OUTSIDE the transaction"
  - fix: none required; documentation-level awareness only.

## Constitution Suggestion
None. Change is confined to store-layer transactional wrapping plus tests; no `openspec/project.md`,
governance, or constitution files were touched.

## Verdict
**round 1: pass**

All three synchronous observation write regions are wrapped exactly as specified (verified +6/-0
under `-w`), atomicity is proven by three green rollback tests with genuine throw-path exercise and
anti-leak guards, both mode-safety and flag-off-parity tests pass, and both gates (535/535 tests,
build exit 0, no diagnostics) are green on independent re-run. No blockers; the single warning is a
deliberate, in-scope design boundary requiring no change.
