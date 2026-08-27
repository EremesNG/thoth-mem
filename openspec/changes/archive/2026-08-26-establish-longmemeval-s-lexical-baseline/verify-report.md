# Verification Report: Establish LongMemEval-S Lexical Baseline

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: All accepted scope in FR-001 through FR-008 and SC-001 through SC-005 is implemented and evidenced. The first Oracle round found two gaps; convergence tasks T021 and T022 closed both before this fresh review.
- **Correctness**: Dataset identity, occurrence semantics, offline product retrieval, metrics, provenance, budgets, truncation, schema integrity, resource accounting, and non-promotion behavior match their contracts.
- **Coherence**: Specification, plan, tasks, implementation, tests, operator documentation, strict JSON Schema validation, JavaScript validation, and the regenerated official report agree.
- **Verification identity**: Fresh independent round `oracle_verify_longmemeval_round2`.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `benchmarks/longmemeval/contract.mjs:6`, `benchmarks/longmemeval/prepare.mjs`, `benchmarks/longmemeval/run.mjs:76` | Pinned SHA-256/byte audit; official prepare and offline run | PASS |
| FR-002 | `benchmarks/longmemeval/contract.mjs:113`, `benchmarks/longmemeval/contract.mjs:147` | Focused contract/preparation tests; streamed 500-record audit | PASS |
| FR-003 | `benchmarks/longmemeval/run.mjs:110` | Runner tests plus official 470-question execution | PASS |
| FR-004 | `benchmarks/longmemeval/run.mjs:117`, `benchmarks/retrieval-report.mjs:221` | 22,419 ordered occurrence mappings reconciled with zero mismatches | PASS |
| FR-005 | `benchmarks/longmemeval/run.mjs:149`, `benchmarks/retrieval-report.mjs:190` | Top-20/20,000 ranking and separate 4,000-unit delivery assertions | PASS |
| FR-006 | `benchmarks/retrieval-report.mjs:19` | Duplicate-aware hand-computed scoring and aggregate recomputation | PASS |
| FR-007 | `benchmarks/longmemeval/run.mjs:47`, `benchmarks/longmemeval/run.mjs:165`, `benchmarks/retrieval-report.mjs:254` | Per-query budget and aggregate reconciliation; strict report validation | PASS |
| FR-008 | `benchmarks/manifest.json`, `benchmarks/retrieval-report.mjs:279` | Fixture lane remains unavailable; official report remains incomplete for promotion | PASS |
| SC-001 `[buildable]` | `tests/benchmarks/longmemeval-contract.test.ts`, `tests/benchmarks/longmemeval-prepare.test.ts` | Focused lane: 5 files / 20 tests PASS | PASS |
| SC-002 `[buildable]` | `tests/benchmarks/longmemeval-runner.test.ts` | Isolation, exact-once occurrence ingestion, leakage, provenance, cleanup, and offline tests PASS | PASS |
| SC-003 `[buildable]` | `benchmarks/longmemeval/run.mjs`, `tests/benchmarks/longmemeval-runner.test.ts` | Candidate and delivery budget checks PASS; optional lanes absent | PASS |
| SC-004 `[buildable]` | `benchmarks/retrieval-report.schema.json`, `benchmarks/retrieval-report.mjs:138`, `tests/benchmarks/retrieval-report.test.ts` | Strict Ajv accepts official report; 25 closed-shape mutations plus forged hash/budget mutations fail closed; focused tests PASS | PASS |
| SC-005 `[outcome]` | `benchmarks/results/longmemeval-s-fts5-report.json` | Observed 500 total / 470 evaluated / 30 excluded, 22,419 mappings, zero calls/errors, schema-valid, non-promoting | PASS |

## Commands and observed results

- `pnpm exec vitest run tests/benchmarks/longmemeval-contract.test.ts tests/benchmarks/longmemeval-prepare.test.ts tests/benchmarks/longmemeval-runner.test.ts tests/benchmarks/retrieval-report.test.ts tests/benchmarks/adapters.test.ts --config vitest.unit.config.ts`: 5 files / 20 tests PASS.
- `pnpm run build`: PASS.
- `pnpm test`: 36 files / 167 tests PASS.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: packed OpenCode, Codex, and Claude Code PASS.
- `pnpm run benchmark:fixture`: PASS; generated timing/RSS delta restored to HEAD.
- `pnpm run prepublishOnly`: 36 files / 167 tests PASS.
- `pnpm run benchmark:prepare:longmemeval`: exact 277,383,467-byte source prepared with SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.
- `pnpm run benchmark:longmemeval`: official report generated offline and atomically.
- Strict Ajv 8.20 plus formats: current schema compiled, official report PASS, extra-property mutation FAIL as required.
- SDD `ready` gate after convergence: valid with zero errors/warnings.
- `git diff --check`: PASS; the 277 MB cache remains ignored and the official report remains trackable.

## Observed external baseline

- Ranking RecallAny@20: `0.1297872340`; fractional Recall@20: `0.0980141844`; MRR-any: `0.1287234043`; NDCG@10: `0.1045054431`.
- Ranking and delivery each reconcile source `1,135,556`, evidence `1,135,536`, returned `18,957`, and truncated `1,116,599` UTF-16 code units.
- Network, model, and LLM calls during evaluation: `0`.
- Promotion remains `incomplete` with reason `lexical_baseline_only_no_candidate_comparison`.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| W-001 | Warning | Correctness hardening | The JavaScript validator uses `Date.parse`, which accepts some date-only values rejected by strict schema; the runner emits ISO date-time and the official report passes Ajv. | Optional future validator hardening; not an accepted-path blocker. |
| W-002 | Warning | Product quality | Lexical coverage is low even though protocol and report correctness pass. | Compare a less brittle lexical query construction under the same runner before considering dense retrieval. |

## Residual risks

- SC-005: None. The outcome is directly observed and PASS.
- Duplicate-position scoring is fixture-proven; repeated official session IDs were preserved, but none of the repeated IDs were relevant in this run.
