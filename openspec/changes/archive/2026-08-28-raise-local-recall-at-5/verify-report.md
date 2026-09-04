# Verification Report: Raise Local Recall at 5

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

Oracle instance: `oracle_verify_recall5_e0_r1`.

## Review dimensions

- **Completeness**: PASS — every accepted FR and buildable SC is implemented and exercised; the authorized outcome run is immutable and its failed quality gate is represented explicitly.
- **Correctness**: PASS — E0 behaves as the specified bounded exact-first RRF candidate, promotion fails closed, and `any-prefix-v1` remains the runtime default.
- **Coherence**: PASS — specification, plan, completed tasks, implementation, tests, documentation, baseline manifests, and the official v3 report agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/sqlite/fts.ts:3`, `src/memory-core/sqlite/fts.ts:28`, `src/memory-core/sqlite/fts.ts:85` | Focused retrieval and planner contracts; build | PASS |
| FR-002 | `src/memory-core/sqlite/fts.ts:85`, `tests/memory-core/retrieval.test.ts:41` | Adversarial sanitization and stable plan-identity cases | PASS |
| FR-003 | `src/memory-core/service.ts:202`, `src/memory-core/service.ts:277`, `src/memory-core/retrieval/rank-fusion.ts` | Exact-first service, fusion, scope, limit, provenance, and diagnostic cases | PASS |
| FR-004 | `benchmarks/retrieval-report.mjs:7`, `benchmarks/longmemeval/compare.mjs:21`, `benchmarks/lexical-comparison-report.mjs:7` | Retrieval-report, comparison-report, runner, baseline, and immutable official-report validation | PASS |
| FR-005 | `benchmarks/lexical-comparison-report.mjs:200`, `benchmarks/lexical-comparison-report.mjs:232` | Known-answer and adversarial Top-5 metric/promotion tests; official 470-question recomputation | PASS |
| FR-006 | `src/memory-core/sqlite/fts.ts:5`, `benchmarks/lexical-comparison-report.mjs:200`, `tests/memory-core/retrieval.test.ts:79` | Evidence-gated default test and official `retain_default` recomputation | PASS |
| FR-007 | `tests/packaging/first-product.test.ts`, `src/memory-core/sqlite/schema.ts`, `package.json` | Exact-six, schema revision, dependency, package, vector/embedding, integration, and packed-smoke checks | PASS |
| SC-001 `[buildable]` | `tests/memory-core/retrieval.test.ts:22`, `tests/memory-core/retrieval.test.ts:41` | Focused retrieval suite | PASS |
| SC-002 `[buildable]` | `tests/memory-core/retrieval.test.ts:168`, `src/memory-core/retrieval/rank-fusion.ts` | Focused retrieval suite, including caller limits 1–10 and diagnostics | PASS |
| SC-003 `[buildable]` | `tests/packaging/first-product.test.ts`, official equal-byte evidence | Package inventory, full suite, integrations, packed smoke, and official report validation | PASS |
| SC-004 `[buildable]` | `tests/benchmarks/retrieval-report.test.ts:209`, `tests/benchmarks/lexical-comparison-report.test.ts:225`, `tests/benchmarks/longmemeval-runner.test.ts:92` | Focused benchmark/report suites plus historical and v3 report/hash validation | PASS |
| SC-005 `[outcome]` | `benchmarks/results/longmemeval-s-lexical-recall-at-5-report.json`, SHA-256 `de9137eaba9cdeb30db14f2f315c23fddbf6ea5da75804a0dc59ad36b11faa17` | Offline four-lane 470-question run: E0 419/470, p95 2.0552 ms, equal bytes, zero errors/calls | RISK |
| SC-006 `[outcome]` | `benchmarks/results/longmemeval-s-lexical-recall-at-5-report.json:1038978`, `src/memory-core/sqlite/fts.ts:5` | Recomputed decision is `retain_default`; source default remains `any-prefix-v1` | PASS |

## Executed verification

- Full SDD `ready` validation: valid, zero errors and warnings.
- `pnpm run build`: passed.
- Focused retrieval/report/runner/package verification: 6 files, 59 tests passed.
- `pnpm test`: 41 files, 240 tests passed.
- `pnpm run integration:verify`: passed.
- `pnpm run integration:smoke`: OpenCode, Codex, and Claude packed smoke passed.
- `pnpm run benchmark:fixture`: passed; transient fixture output restored.
- `pnpm run prepublishOnly`: passed.
- `git diff --check`: passed.
- Oracle independently repeated artifact validation, build, 5 focused files/55 tests plus 1 package file/4 tests, full 41 files/240 tests, report/schema reference validation, immutable hashes, and diff checks.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| — | — | — | No correctness, completeness, or coherence defects found. | — |

## Residual risks

- SC-005: E0 did not reach the 447/470 RecallAny@5 floor and regressed fractional Recall@5, RecallAll@5, and NDCG@10 versus the broad co-run reference. This is valid experimental evidence, not an implementation defect; promotion correctly failed closed. Any IDF/projection or later retrieval hypothesis requires a new specification and Oracle review.
