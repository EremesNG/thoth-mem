# Verification Report: Establish Ordered Session Summaries

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

Verification instance: `oracle_final_verification_round2`.

## Review dimensions

- **Completeness**: PASS. All accepted FR-001 through FR-013 and SC-001 through SC-005 are represented in the implementation, tests, lifecycle bundles, documentation, and committed evaluation evidence.
- **Correctness**: PASS. The fresh read-only Oracle mapped every requirement to implementation evidence and executed checks; no critical issue remains.
- **Coherence**: PASS. Specification, plan, tasks, schema revision, public six-tool contract, three-host lifecycle behavior, documentation, and the corrected isolated benchmark agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/contracts.ts`, `src/memory-core/sqlite/schema.ts`, `src/memory-core/sqlite/ledger.ts`, `src/memory-core/service.ts` | Focused contracts, migration, and service lane; full suite | PASS |
| FR-002 | `src/memory-core/service.ts`, `src/memory-core/session-summaries.ts`, `docs/agent/persistence-retrieval.md` | Summary, continuation, lifecycle, and packed-smoke checks | PASS |
| FR-003 | `src/memory-core/service.ts`, including duplicate-receipt session binding, and `src/memory-core/sqlite/ledger.ts` | `tests/memory-core/service.test.ts`; focused and full suites | PASS |
| FR-004 | `src/memory-core/session-summaries.ts`, revision-4 summary tables and lineage constraints | `tests/memory-core/session-summaries.test.ts`; migration checks | PASS |
| FR-005 | `src/memory-core/sqlite/schema.ts`, `src/memory-core/sqlite/migrations.ts`, `src/memory-core/import/legacy-v1.ts` | `tests/memory-core/schema-migration.test.ts`; build and full suite | PASS |
| FR-006 | `src/tools/index.ts`, `src/integration/package-inventory.ts` | MCP and packaging tests; integration inventory | PASS |
| FR-007 | `src/memory-core/service.ts`, `src/tools/index.ts` | Summary and MCP transaction/rollback checks | PASS |
| FR-008 | `src/tools/index.ts`, `src/memory-core/service.ts` | MCP submit/current/history/get and deferred-support checks | PASS |
| FR-009 | `src/tools/index.ts`, shared continuation selection in `src/memory-core/service.ts` | MCP project-history and briefing checks | PASS |
| FR-010 | `src/integration/core/lifecycle.ts`, `src/integration/adapters/index.ts`, native clients and shared hook runner | Lifecycle/adapter/public-runner suites and packed three-host smoke | PASS |
| FR-011 | `src/memory-core/continuation.ts`, native lifecycle integrations | Continuation, lifecycle, and packed-smoke checks | PASS |
| FR-012 | `src/memory-core/service.ts`, `src/memory-core/continuation.ts` | Context/continuation/MCP suites | PASS |
| FR-013 | `benchmarks/run.mjs`, `benchmarks/report.mjs`, `benchmarks/report.schema.json`, committed fixture report | Benchmark report/runner tests, `pnpm run benchmark:fixture`, independent report validation | PASS |
| SC-001 `[buildable]` | Revision-4 schema, verified migration/backup, atomic sequence allocation, duplicate stability, session-bound receipts, closed taxonomies, rollback, and no backfill | Focused migration/service lane; full suite | PASS |
| SC-002 `[buildable]` | Immutable derived summaries outside memories; atomic lifecycle submission, evidence, supersession, receipt, state, and watermark; strict support/scope/range validation | Summary, service, and MCP tests | PASS |
| SC-003 `[buildable]` | Summary-first exact-session recovery, untrusted-data delimiters, stable IDs, host caps, support withholding, legacy fallback, and no automatic promotion across three hosts | Continuation/lifecycle/adapter suites and packed smoke | PASS |
| SC-004 `[buildable]` | Exact six tools, closed schemas, bounded lineage inspection, and deferred supports | MCP, package inventory, integration verification | PASS |
| SC-005 `[outcome]` | Corrected isolated fixture recovers the same 869 useful code points in both paths; control `869/1992 = 0.4362449799196787`; summary `869/1899 = 0.4576092680358083`; three hosts and three non-empty checkpoints; zero candidate memories, unsupported claims, support leakage, promoted handoffs, model calls, or network calls | `pnpm run benchmark:fixture`; report schema/semantic validation; fresh Oracle inspection | PASS |

## Executed evidence

- Focused ordered-summary lane: 50/50 tests PASS.
- WebStorm diagnostics: zero errors across the touched TypeScript surface inspected before verification.
- `pnpm run build`: PASS.
- `pnpm test`: 39 files, 194/194 tests PASS.
- `pnpm run integration:verify`: PASS after synchronizing the repository-owned distribution lock with `pnpm run integration:sync`.
- `pnpm run integration:smoke`: PASS for OpenCode, Codex, and Claude; OpenCode proves identity-only fallback and Claude proves structured-summary recovery.
- `pnpm run benchmark:fixture`: PASS with the SC-005 measurements recorded above.
- `pnpm run prepublishOnly`: PASS.
- `git diff --check`: PASS; only existing line-ending warnings were emitted.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | The independent Oracle returned PASS with no critical issues or unresolved questions. | — |

## Historical stop gate and corrective convergence

The first SC-005 experiment failed and remains part of the audit trail. It measured an archived-handoff control ratio of `0.6985645933014354` and a summary ratio of `0.5846883242300996`; increasing one claim from `repeat(8)` to `repeat(16)` did not change the summary ratio. The prior Oracle correctly returned `FAIL` because the comparison mixed a legacy handoff into the candidate path, counted equivalent fields asymmetrically, omitted actionable source fields, accepted an incompletely validated report envelope, exercised a weak no-promotion probe, and exposed cross-session save-receipt identity drift.

On 2026-08-27 the user explicitly authorized a bounded second convergence without relaxing SC-005. That convergence repaired receipt identity binding, report/schema validation, experimental isolation and symmetric accounting, equivalent actionable fields, non-empty checkpoints, and packed lifecycle expectations. The corrected experiment and fresh independent Oracle supersede the interim stage pause; the failed numbers are retained here rather than overwritten.

## Residual risks

- The migration reuses an existing valid `.pre-v4.bak` after checking integrity and revision, but does not compare it byte-for-byte with the current revision-3 source. A backup left by a failed attempt could therefore predate later source writes. This is a hardening opportunity under the accepted deterministic-backup contract, not a blocker for this change.
- Benchmark `model_calls` and `network_calls` are emitted as zero constants. Code and dependency inspection support the claim, but runtime instrumentation would strengthen the evidence.
- Pre-existing LongMemEval work remains a distinct user-owned change and was not folded into this archive.
