# Verification Report: Promote E0 as the Lexical Default

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

Oracle instance: `oracle_verify_promote_e0_default_r1`.

## Review dimensions

- **Completeness**: PASS — every accepted FR and SC is represented by implementation, test, documentation, immutable evidence, and an executed check.
- **Correctness**: PASS — no-override recall uses E0; explicit strategies and historical evidence remain stable; local-only/public/persistence contracts are unchanged.
- **Coherence**: PASS — specification, plan, tasks, source, tests, documentation, prior archive, and immutable report consistently distinguish the later lexical promotion from the former hybrid-parity decision.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/sqlite/fts.ts:5`, `src/memory-core/service.ts:202`, `tests/memory-core/retrieval.test.ts` | Retrieval plus schema-migration suites: 2 files, 27/27 | PASS |
| FR-002 | `benchmarks/results/longmemeval-s-lexical-recall-at-5-report.json`, `docs/agent/testing.md:29` | Direct report validation, exact SHA, comparison-report suite 18/18 | PASS |
| FR-003 | `docs/agent/testing.md:31`, `docs/research/recall-at-5-latency-2026-08-28/report-source.md:8` | Oracle source/README evidence inspection and metric-label reconciliation | PASS |
| FR-004 | `src/memory-core/sqlite/fts.ts`, `tests/packaging/first-product.test.ts`, `package.json` | Four-strategy hash comparison, packaging 4/4, schema/dependency/public-surface diff inspection | PASS |
| SC-001 `[buildable]` | `tests/memory-core/retrieval.test.ts` | No-override default, explicit strategies, exact-first, cap, limits, empty query and diagnostics: 21/21 | PASS |
| SC-002 `[buildable]` | `tests/packaging/first-product.test.ts`, `src/memory-core/sqlite/schema.ts` | Integration-config packaging 4/4; exact six tools and schema revision 5 verified | PASS |
| SC-003 `[buildable]` | `tests/memory-core/retrieval.test.ts`, `docs/agent/testing.md:37` | Exact report SHA/decision test, validator, documentation chronology inspection | PASS |
| SC-004 `[outcome]` | Official report SHA `de9137eaba9cdeb30db14f2f315c23fddbf6ea5da75804a0dc59ad36b11faa17` | 419/470 versus 409/470; p95 2.0552 ms versus 2×1.1471 ms; equal 1,519,955,968 bytes; provenance 1; zero errors/calls | PASS |

## Executed verification

- Accelerated `ready` validator: valid, zero errors and warnings.
- TDD red: retrieval produced four expected failures against the old default while 17 cases passed.
- TDD green and final focused retrieval: 21/21 passed.
- Build and TypeScript no-emit: passed.
- Packaging/first-product: 4/4 passed under the integration config.
- Full suite: 41 files/240 tests passed twice, including `prepublishOnly`.
- `integration:verify`: passed for local/public Codex, Claude Code, and OpenCode inventories.
- `integration:smoke`: packed smoke and lifecycle fixtures passed for OpenCode, Codex, and Claude Code.
- `benchmark:fixture`: passed; transient timing/memory samples were restored exactly.
- Official report validator and SHA recomputation: passed; historical `retain_default` retained.
- `git diff --check`: passed; tracked benchmark result diff is clean.
- Fresh Oracle independently repeated retrieval/schema 27/27, packaging 4/4, comparison report 18/18, TypeScript, report/hash/config validation, ready validation, and diff checks.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| — | — | — | No findings. | — |

## Residual risks

- None. A future semantic phase remains a separate authorized SDD and is not a residual obligation of this lexical promotion.
