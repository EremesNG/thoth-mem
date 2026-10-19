# Verification Report: Stabilize Import Recall Ranking

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — all accepted repository scope is implemented and verified; SC-006 remains an explicitly unexecuted operational outcome.
- **Correctness**: PASS — stable scoring, numeric cohort precedence, import integrity, exact access, bounded diagnostics, and benchmark gates match the accepted contracts.
- **Coherence**: PASS — specification, plan, tasks, implementation, tests, package inventory, and routed documentation agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/retrieval/stable-lexical-rank.ts`; `src/memory-core/sqlite/fts.ts`; `src/memory-core/service.ts` | Focused retrieval suite and 17-probe/1,000-import regression | PASS |
| FR-002 | `src/memory-core/service.ts` exact-first and numeric oldest-first cohort fill | Capacity, starvation, exact-access, and repeated-call tests | PASS |
| FR-003 | `src/memory-core/import/writer.ts`; `src/memory-core/import/verify.ts` | Importer and retrieval mapped/isolated/history/dedup tests | PASS |
| FR-004 | `src/memory-core/sqlite/schema.ts`; `src/memory-core/sqlite/migrations.ts`; writer/verifier cohort checks | Revision-8 migration, clean revision-9, backward timestamps, corruption, and replay tests | PASS |
| FR-005 | Stable config/plan hashes, aggregate diagnostics, unchanged public response and six-tool registry | Retrieval diagnostics, full suite, packed smoke, exact tool audit | PASS |
| SC-001 `[buildable]` | 17 protected memories, 1,000 matching imported memories, 17 fixed probes | `tests/memory-core/retrieval.test.ts` | PASS |
| SC-002 `[buildable]` | Exact Top-K equality, capacity fill, starvation boundary, exact ID/topic and lineage | Retrieval regression plus benchmark semantic validation | PASS |
| SC-003 `[buildable]` | Durable multiple cohorts, exact dedup, mapped/isolated history, replay zero delta | Importer and schema suites | PASS |
| SC-004 `[buildable]` | Package and repository verification surfaces | Focused 5 files/93 tests; build; full 51 files/397 tests; integration verify/smoke; fixture; prepublish; diff check | PASS |
| SC-005 `[buildable]` | `benchmarks/import-ranking/`; `package.json`; `tests/benchmarks/import-ranking-report.test.ts` | 10 warmups, 100 measured batches, 1,700 recalls/lane, 17/17 exact lists, zero inversions, p95 ratio 1.1863, zero external calls | PASS |
| SC-006 `[outcome]` | Separately authorized isolated-copy rehearsal contract retained in spec/docs | N/A — no real database access authorized or executed | RISK |

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| W-001 | Warning | Correctness | `stableLexicalRank` uses locale-default `toLocaleLowerCase()`; same-environment determinism is proven, while explicit Turkish `I/İ` portability coverage is absent. | Consider locale-independent folding and a dedicated Unicode portability case in a future change. |
| W-002 | Warning | Completeness | The strict benchmark JSON schema is packaged; dedicated mutation tests exercise the semantic validator rather than an independent JSON Schema engine. | Add schema-engine parity coverage if the repository later standardizes a schema validator dependency. |

## Residual risks

- SC-006: behavior against separately authorized copies of the real legacy/current databases remains unobserved. The future rehearsal must preserve 17/17 exact Top-K lists, 17/17 self-retrieval at rank 1, sampled imported bugfix recall, import integrity/replay, and byte-identical originals before any cutover decision.
