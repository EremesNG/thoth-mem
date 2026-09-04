# Archive Report: Establish LongMemEval-S Lexical Baseline

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-26-establish-longmemeval-s-lexical-baseline/`

## Completed scope

- Added a pinned, explicit-network preparation boundary and separate offline LongMemEval-S runner over the real SQLite FTS5/BM25 product path.
- Preserved official ordered session occurrences, repeated base session IDs, empty string turn content, assistant-evidence eligibility, and `_abs`-only exclusion without answer/gold leakage.
- Added duplicate-aware retrieval scoring, exact occurrence provenance, separate Top-20 and 4,000-UTF-16 delivery budgets, per-query truncation evidence, resource accounting, strict closed report validation, operator scripts, tests, and documentation.
- Produced the official external baseline report with 500 records, 470 evaluated questions, 30 abstentions, 22,419 mappings, zero evaluation-time network/model/LLM calls, and no optional-module promotion.

## Verification lineage

- `verify-report.md` records fresh independent Oracle PASS after one failed verification and convergence tasks T021/T022.
- Focused tests, build, full suite, integration inventory, packed three-host smoke, fixture benchmark, prepublish verification, strict Ajv schema validation, real report validation, and diff hygiene passed.

## Canonical specification sync

- Updated: `evals`.
- Synced declared `[MODIFIED evals]` deltas; `[INTERNAL]` requirements remain change-local.

## Deviations and residual warnings

- The pinned official dataset exposed repeated haystack session IDs and empty string turn content not represented in the initial fixture. The accepted intent did not change; canonical artifacts were refined and revalidated, and occurrence-preserving tests were added.
- The first final Oracle round found missing truncation evidence and validator/schema drift. Both were repaired through the recorded convergence round before the fresh PASS.
- Non-blocking: JavaScript `Date.parse` is looser than strict schema for date-only strings, while all runner-produced reports use ISO date-time and pass strict Ajv validation.
- Product-quality warning: the correct lexical baseline is low (RecallAny@20 `0.1298`); this is evidence for a subsequent equal-budget lexical-query experiment, not a correctness defect or vector-promotion decision.

## Follow-up

- In a separate change, compare less brittle lexical query construction under this same corpus, Top-K, delivery budget, metrics, and report contract before evaluating dense or hybrid retrieval.
