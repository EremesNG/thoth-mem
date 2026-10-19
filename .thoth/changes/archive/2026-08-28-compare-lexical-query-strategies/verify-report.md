# Verification Report: Compare Lexical Query Strategies

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — every accepted requirement and success criterion has implementation, test, or official outcome evidence.
- **Correctness**: PASS — deterministic query construction, equal-lane reconciliation, atomic publication, and promotion gates match the specification; convergence findings F-001 through F-005 are closed.
- **Coherence**: PASS — specification, plan, tasks, runtime default, documentation, schemas, tests, and the immutable official report agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/sqlite/fts.ts` defines stable strategy IDs, configuration hashes, and bounded query plans. | Focused Vitest suite, 30/30 | PASS |
| FR-002 | `src/memory-core/sqlite/fts.ts` sanitizes Unicode, punctuation, phrases, operators, repetitions, and overlong input. | `tests/memory-core/retrieval.test.ts` | PASS |
| FR-003 | `all-prefix-v1` preserves the archived repeated-term control behavior and remains the default. | Focused retrieval tests and built export inspection | PASS |
| FR-004 | `benchmarks/longmemeval/run.mjs` and the comparison validator enforce identical datasets, exclusions, conditions, mappings, budgets, and non-strategy configuration. | Miniature runners, adversarial drift tests, official report reconciliation | PASS |
| FR-005 | Lane reports bind configuration and per-query plan hashes to ranked, delivered, occurrence, memory, evidence, and source identities. | Retrieval/comparison validators and official artifact audit | PASS |
| FR-006 | Both runners publish complete validated reports through a same-directory atomic no-clobber hard-link commit and clean temporary state. | Concurrent publisher and cleanup tests | PASS |
| FR-007 | Promotion uses exact rational RecallAny@20 gain, non-regression, 2x latency, exact SQLite bytes, zero error/call, provenance, completeness, and unique-winner gates. | Policy boundary/adversarial tests, including F-005 control-error and promotion-tamper probes | PASS |
| FR-008 | `MemoryService` executes deterministic lexical stages while the projection-independent SQLite path remains authoritative. | Focused retrieval tests and default inspection | PASS |
| FR-009 | The comparison is opt-in, local, offline, and adds no MCP tool, service, model, or projection dependency. | MCP exports, package inventory, integration verify/smoke | PASS |
| SC-001 `[buildable]` | Control and candidate strategies cover all declared safe-query edge cases. | Focused Vitest suite | PASS |
| SC-002 `[buildable]` | The miniature fixture executes and validates all three equal-budget lanes. | Focused Vitest suite | PASS |
| SC-003 `[buildable]` | Incomplete, drifted, regressing, resource-exceeding, error-containing, provenance-invalid, tied, and exact-boundary cases fail closed. | Focused Vitest suite plus Oracle adversarial probes | PASS |
| SC-004 `[outcome]` | The official report contains three complete 470-question lanes, identical 30 exclusions, provenance coverage 1, and zero errors or calls. | Executable validation and exact digest audit | PASS |
| SC-005 `[outcome]` | Both candidates fail only the 2x p95 latency gate; decision is `retain_control` and default remains `all-prefix-v1`. | Official report and runtime default inspection | PASS |

## Official outcome evidence

- Artifact: `benchmarks/results/longmemeval-s-lexical-comparison-report.json`
- Size: 27,354,247 bytes
- SHA-256: `319dd6155059afcc180f7638deb841a9ca56c1c242f8d63c6a6c87209c9cb358`
- Executable validation: `{ "valid": true, "errors": [] }`
- Control: RecallAny@20 0.1297872340, Recall@20 0.0980141844, NDCG@10 0.1045054431, p95 1.4320 ms
- Any-prefix: RecallAny@20 0.9936170213, Recall@20 0.9656737589, NDCG@10 0.8536981728, p95 6.8333 ms
- All-then-any: RecallAny@20 0.9936170213, Recall@20 0.9656737589, NDCG@10 0.8538289016, p95 8.1297 ms
- Aggregate SQLite bytes: 1,028,173,824 in every lane
- Promotion: `retain_control`; both candidates rejected only for `retrieval_p95_above_2x_control`

## Executed verification

- Accelerated SDD validation through `ready`: valid, zero errors and warnings.
- Focused unit verification: 5 files, 30 tests passed.
- `pnpm run build`: passed.
- `pnpm test`: 41 files, 213 tests passed.
- `pnpm run integration:verify`: passed.
- `pnpm run integration:smoke`: packed and lifecycle smoke passed for OpenCode, Codex, and Claude Code.
- `pnpm run benchmark:fixture`: passed; volatile fixture measurements were not retained.
- `pnpm run prepublishOnly`: passed with 41 files and 213 tests.
- `git diff --check`: passed; line-ending notices only.
- Fresh Oracle round 4 independently reproduced F-005 on the pure assessor and validated-envelope paths, rejected persisted-promotion tampering, rechecked exact rational boundaries, and returned PASS.

## Finding closure

| ID | Status | Evidence |
| --- | --- | --- |
| F-001 | CLOSED | Atomic no-clobber publication and concurrent publisher tests cover both runners. |
| F-002 | CLOSED | Exact exclusions and non-strategy candidate configuration equality are enforced. |
| F-003 | CLOSED | Integer cross-multiplication admits the exact 0.05 boundary and rejects immediately sub-threshold gains without epsilon. |
| F-004 | CLOSED | The Accelerated `ready` validator accepts every task with no warnings. |
| F-005 | CLOSED | Any control-lane error makes both pure and envelope promotion assessment incomplete; tampered promotion evidence is rejected. |

## Findings

None.

## Residual risks

- SC-004: The official corpus was intentionally not rerun after policy-only convergence; the immutable artifact was instead verified by exact digest and full executable reconciliation.
- SC-005: Latency is host-specific by design and supports only the predeclared same-run ratio decision; the measured quality gain does not justify changing the runtime default until latency is improved and remeasured.
