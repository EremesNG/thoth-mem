# Verification Report: Optimize Stable Recall Latency

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — every FR and SC is implemented, evidenced, and independently verified; both rejected locale rounds and their remediation remain in the audit trail.
- **Correctness**: PASS — the final Oracle confirmed frozen score/order semantics, both locale fixes, full-corpus parity, and the absolute latency result with no blocker.
- **Coherence**: PASS — specification, plan, tasks, implementation, tests, immutable reports, and routed documentation agree after correcting two non-blocking wording/evidence nuances from final review.

## Immutable and paired evidence

- Immutable stable baseline: `benchmarks/results/longmemeval-s-stable-v1-current-2026-09-02.json`, SHA-256 `7c52da902418bcdf6c89f5c55713631ca406d95a0ae76d78406e5f928e873fda`, p95 `13.0459 ms`.
- Oracle round 1 independently validated performance and report identity but returned FAIL because the unconditional ASCII shortcut changed frozen `toLocaleLowerCase()` semantics under Turkish/Azeri defaults. Archive remained prohibited.
- Locale convergence round 1 used a red/green regression: simulated Turkish default folding first produced optimized score `5` versus frozen score `0`; the implementation now enables ASCII `toLowerCase()` only when `ABCDEFGHIJKLMNOPQRSTUVWXYZ` has the same default-locale fold.
- Oracle round 2 returned FAIL because removing the historical second field normalization changed Azerbaijani combining-mark tokenization: optimized score `0` versus frozen score `2`. Archive again remained prohibited.
- Locale convergence round 2 added that exact red/green case and now retains the second normalization for non-ASCII field token sources while preserving the guarded one-pass ASCII path.
- Final invocation: one `node --input-type=module` process imported `runLongMemEval` once, sealed the build, then ran `strict-selected-any-cap5-stable-v1` to `longmemeval-s-stable-v1-optimized-round5-2026-09-03.json` followed by `strict-selected-any-cap5-rrf-v1` to `longmemeval-s-rrf-v1-optimized-control-round5-2026-09-03.json`; both paths were fresh and create-only.
- Final build identity: complete `dist/` tree SHA-256 before and after `7add93dd99d8951c1c0ab26be59f260551c6e063df9d60b770e40da0e7ee6238`; `dist/index.js` SHA-256 before and after `907e93274a177277be1caad7a9799c40615dcdd3c30273742b6586f845362ba2`; no source or build mutation occurred between lanes.
- Final stable: SHA-256 `00fdc79d9174002acc05247bc9651a549a3f19966865370063de3754595538ec`, p95 `9.3504 ms`, `28.3%` below baseline, absolute-budget PASS.
- Final RRF diagnostic: SHA-256 `3791327b83ce7263a5064d43309aaf9089d1630759f3eefe856fb1d11ee6de46`, p95 `1.6164 ms`, stable/RRF ratio `5.7847x`.
- All three final inputs validate over 470 eligible questions, and stored p95 values equal independent recomputation from raw samples. Optimized stable has zero complete ranked/delivered source/session mismatches and equal aggregate quality versus the immutable stable baseline. Stable and RRF have identical dataset, conditions, mappings, query order, and SQLite samples; every report records zero errors and literal zero network/model/LLM calls.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/retrieval/stable-lexical-rank.ts`; service-local ranker use in `src/memory-core/service.ts` | Frozen scorer comparisons including Turkish ASCII `I` and Azerbaijani combining marks, plus all 470 baseline-to-final stable output sequences | PASS |
| FR-002 | Same-build sequential stable/RRF reports and accepted absolute budget | Fully corrected final stable `9.3504 ms`, at most `10 ms`; RRF `1.6164 ms` and `5.7847x` ratio retained as diagnostics | PASS |
| FR-003 | Compiled query terms, guarded one-pass ASCII fields, preserved non-ASCII second normalization, first-character prefix buckets, bounded service-local cache | Unicode/locale, prefix, phrase, repetition, long-content, cache-reset, and cache-capacity tests | PASS |
| FR-004 | Stable strategy admitted by semantic and strict JSON report contracts; immutable create-only reports | Three-report semantic validation, raw p95 recomputation, identity/SQLite/call/error reconciliation, and SHA-256 sealing | PASS |
| SC-001 `[buildable]` | Frozen scorer oracle and immutable stable report | Focused equivalence cases and zero mismatches across 470 complete ranking/delivery outputs | PASS |
| SC-002 `[outcome]` | Fresh paired measurement from the fully locale-corrected build | Stable p95 `9.3504 ms` within the absolute `10-ms` budget | PASS |
| SC-003 `[buildable]` | Retrieval/import coverage and retained `benchmark:import-ranking` report | 17/17 exact Top-K lists, zero inversions, retained ratio `1.2267`, valid diagnostics; later fresh-temp ratio `1.1363` also passed | PASS |
| SC-004 `[buildable]` | Repository, packaging, six-tool, and diff surfaces | Focused 8 files/81 tests; build; full 51 files/403 tests; integration verify/smoke; prepublish; exact six-tool audit; `git diff --check` | PASS |
| SC-005 `[outcome]` | Fresh stable/RRF reports from the same loaded build | Matching corpus/conditions/mappings/query order/SQLite, zero errors/calls, stable output parity, and absolute-budget PASS | PASS |

## Executed verification

- Turkish-locale red/green slice — RED observed optimized `5` versus frozen `0`; GREEN passed after the locale-equivalence guard.
- Azerbaijani combining-mark red/green slice — RED observed optimized `0` versus frozen `2`; GREEN passed after preserving the non-ASCII second normalization.
- `pnpm exec vitest run tests/memory-core/retrieval.test.ts tests/benchmarks/longmemeval-contract.test.ts tests/benchmarks/longmemeval-prepare.test.ts tests/benchmarks/longmemeval-runner.test.ts tests/benchmarks/retrieval-report.test.ts tests/benchmarks/lexical-comparison-report.test.ts tests/benchmarks/longmemeval-compare.test.ts tests/benchmarks/adapters.test.ts --config vitest.unit.config.ts` — PASS, 8 files/81 tests.
- `pnpm run build` — PASS.
- `pnpm test` — pre-convergence initial run had one 10-second timeout in `tests/release-marketplace.test.ts`; the isolated file passed 4/4 without mutation, and subsequent untouched full runs passed. Final corrected build passed 51 files/403 tests through `prepublishOnly`.
- `pnpm run integration:verify` — PASS for local/public Codex, Claude Code, and OpenCode plugin inventories.
- `pnpm run integration:smoke` — PASS for packed plugins and lifecycle fixtures.
- Retained `benchmarks/results/import-ranking-stable-latency-2026-09-03.json` — PASS, 17/17 exact lists, zero inversions, ratio `1.2267294512314306` within the `2x` synthetic guard. A later corrected-build fresh-temp run also passed at `1.136328868325813`.
- `pnpm run prepublishOnly` — PASS, including integration verification, build, and 51 files/403 tests.
- Built `ALL_TOOLS` audit — PASS with exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
- `git diff --check` — PASS; CRLF conversion notices only.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| W-001 | Warning | Reliability | The first full-suite invocation timed out once in the temporary-repository marketplace test; that file passed 4/4 in isolation and the untouched full suite then passed 401/401. | Treat recurrence as release-harness timing work; it is outside the retrieval path and did not require a product-code change. |
| W-002 | Warning | Performance | Fully corrected stable remains `5.7847x` slower than same-process RRF even though it passes the accepted absolute budget. | Keep the ratio visible as a diagnostic; reopen bounded JavaScript/SQLite profiling only if stable exceeds `10 ms` or product latency needs tighten. |

## Independent Oracle judgment

- Final verdict: PASS; archive eligible after root persistence, T024 completion, and closeout validation.
- Frozen scoring order/formula and both locale corrections were verified at the direct and compiled seams. An independent differential probe completed 3,456 exact `Object.is` comparisons across six locales and 192 crafted/random Unicode, normalization, combining-mark, astral-letter, prefix, long-term, and cache fixtures with no mismatch.
- Baseline/final/RRF hashes, validation, 470-query parity, quality, p95 recomputation, paired identity, SQLite samples, and zero-call/error counters all passed. No prohibited schema, public-tool, native-addon, package, integration, real-home, or unrelated fixture change was found.
- Blocking risks: none. Non-blocking risks remain the `0.6496-ms` latency margin and diagnostic `5.7847x` RRF ratio.

## Residual risks

- Tail latency is environment-sensitive. The fully corrected same-build observation passes with finite margin (`0.6496 ms`); future comparable regressions above `10 ms` must fail the gate rather than reinterpret it.
- The RRF comparison is algorithmically directional rather than output-equivalent. Stable output equivalence is enforced against the immutable pre-optimization stable oracle, while RRF is used only as the same-build performance diagnostic.
- Native addons and extensions remain explicitly excluded; no real home database was read or mutated.
