# Verification Report: Rename the Claude Setup Target

## Report Metadata

- Change: `rename-claude-setup-target`
- Topic Key: `sdd/rename-claude-setup-target/verify-report`

## Round

round 1

## Verdict

pass

## Completeness

- Tasks: **13/13 checked**
- Proposal criteria: **7/7**
- Changed tracked files inspected: **13/13**, exactly the expected worktree files:
  - `src/cli.ts`
  - `src/setup/types.ts`
  - `src/setup/paths.ts`
  - `src/setup/engine.ts`
  - `src/setup/receipt.ts`
  - `src/setup/harnesses/claude-code.ts`
  - `tests/cli.test.ts`
  - `tests/setup/engine.test.ts`
  - `tests/setup/claude-code.test.ts`
  - `tests/packaging/packed-install.test.ts`
  - `README.md`
  - `docs/agent/managed-delivery.md`
  - `openspec/specs/cli/spec.md`
- Supporting artifacts and governance inspected: proposal, tasks, plan review, `openspec/config.yaml`, and `openspec/memory/constitution.md`.
- Only expected worktree files are present.

## Verification Evidence

- Focused setup/CLI suites: **3 files, 101/101 tests passed** (`tests/cli.test.ts`, `tests/setup/engine.test.ts`, `tests/setup/claude-code.test.ts`).
- Packed and inventory suites: **2 files, 36/36 tests passed** (`tests/packaging/packed-install.test.ts`, `tests/packaging/inventory.test.ts`).
- `pnpm exec tsc --noEmit`: passed.
- `pnpm run integration:verify`: passed with **15 assets**.
- `git diff --check`: passed.
- IDE diagnostics: **zero errors** across the 10 changed TypeScript files.
- Bounded `claude-code` audit: **25 matches** — 9 rejection assertions/negative contract evidence; 5 branded module/docs references; 4 integration paths; 3 runtime-evidence mappings; 4 upstream version strings. Zero forbidden positive setup-contract acceptance.

### Reused inspected evidence

`pnpm run build` passed all stages, and the full suite passed **68 files / 1,024 tests passed / 1 skipped**. The read-only Oracle did not rerun the build because it writes generated output.

## Compliance Matrix

| # | Proposal acceptance criterion | Evidence | Result |
| --- | --- | --- | --- |
| 1 | `setup claude` is accepted across normal, plan, JSON, scoped, and rollback flows and routes to Claude Code assets. | `src/cli.ts:231`; `src/setup/engine.ts:2953`; `src/setup/paths.ts:83`; Claude tests around `tests/setup/claude-code.test.ts:215`, `:273`, and `:359`. | PASS |
| 2 | The removed target is rejected before dispatch or mutation. | `src/cli.ts:231-237`; runner `src/cli.ts:1180-1202`; CLI test `tests/cli.test.ts:319-342`; packed test `tests/packaging/packed-install.test.ts:1351-1374`. | PASS |
| 3 | Types, results, and receipts use exactly `claude`; old receipt values are rejected. | `src/setup/types.ts:1`; `src/setup/receipt.ts:514`; Claude strategy `src/setup/harnesses/claude-code.ts:94`; Claude tests `tests/setup/claude-code.test.ts:231-269`. | PASS |
| 4 | Help, errors, README, managed-delivery guidance, and the active CLI spec advertise the new target. | CLI `src/cli.ts:51`, `:234-237`; README `README.md:100`, `:180`, `:188`; managed delivery `docs/agent/managed-delivery.md:18-19`; spec `openspec/specs/cli/spec.md:7`, `:41`, `:391`. | PASS |
| 5 | Focused CLI and setup coverage proves acceptance, rejection, receipts, routing, and unchanged ownership/rollback behavior. | Fresh focused result: **101/101 passed** across `tests/cli.test.ts`, `tests/setup/engine.test.ts`, and `tests/setup/claude-code.test.ts`. | PASS |
| 6 | Packed-install and inventory behavior remains correct with stable assets. | Fresh packed/inventory result: **36/36 passed**; packed `tests/packaging/packed-install.test.ts:1377-1441`; inventory `tests/packaging/inventory.test.ts:350-393`; `pnpm run integration:verify` confirms **15 assets**. | PASS |
| 7 | Remaining `claude-code` occurrences are intentional and no old contract acceptance remains. | Bounded audit classified **25 matches** (9 rejection assertions/negative contract evidence, 5 branded module/docs references, 4 integration paths, 3 runtime-evidence mappings, 4 upstream version strings); zero forbidden positive `claude-code` setup-contract acceptance; no asset changes. | PASS |

## Async Error-Boundary Review

`return await handleSetup(...)` at `src/cli.ts:1308` keeps setup rejection inside the surrounding catch at `src/cli.ts:1317-1321`; `main()` remains the process boundary at `src/index.ts:231-238`. Successful values are preserved. Risk: low.

## Issues Found

### Critical

None.

### Warnings

None.

## Constitution Suggestion

None. The exact governance heuristic was not triggered; P1–P5 are satisfied.

## Compliance Summary

**7/7** proposal criteria satisfied. `round 1` verdict: `pass`.
