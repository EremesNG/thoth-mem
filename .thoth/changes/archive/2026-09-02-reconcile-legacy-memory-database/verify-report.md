# Verification Report: Reconcile Legacy Memory Database

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: All accepted buildable scope is represented in the artifacts, implementation, tests, CLI, and routed documentation; SC-010 and SC-011 remain explicitly unexecuted operational outcomes.
- **Correctness**: The fourth fresh Oracle found no actionable blocker after three convergence rounds covering publication binding, semantic receipt verification, cross-source identity, backup concurrency, and SQLite-maintained sequence state.
- **Coherence**: Spec, plan, tasks T001-T032, contracts, revision-8 schema, implementation, CLI guidance, and executed evidence agree; the Full ready gate passes without errors or warnings.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/import/inspect.ts`, `writer.ts`, `verify.ts`, and revision-8 audit schema preserve and reconcile authoritative legacy rows with exact dispositions, provenance, temporal lineage, privacy, and FTS equality. | Oracle focused 75-test review plus root 46-test importer/schema run and full 379-test suite. | PASS |
| FR-002 | `src/cli.ts`, `backup.ts`, and `legacy-v1.ts` implement zero-write sealed planning, verified backup/candidate publication, restoration, stopped-target checks, and replay. | CLI/importer focused tests, integration smoke, and publication failure fixtures. | PASS |
| SC-001 | `inspect.ts` produces deterministic hash-bound plans without mutating source or target. | Deterministic zero-write planner and CLI create-only artifact tests. | PASS |
| SC-002 | Legacy inventory classifies metadata without selecting unavailable virtual modules. | Extension-bearing legacy fixture with unavailable virtual module. | PASS |
| SC-003 | Exact/explicit project mapping, deterministic isolation, and ambiguity/placeholder quarantine are closed. | Mapping matrix covering keys, aliases, conflicts, placeholders, and no fuzzy mapping. | PASS |
| SC-004 | Sessions, prompts, summaries, observation revisions/heads, deletions, unsupported kinds, and privacy failures receive complete receipts. | Importer disposition and complete-row reconciliation fixtures. | PASS |
| SC-005 | Candidate reconciliation preserves all populated current baseline families and existing FTS rows. | Fully populated baseline-family preservation fixture and revision migration tests. | PASS |
| SC-006 | Imported history remains retrievable without demoting existing current winners or changing prior recall order. | Retrieval regression tests for mapped/isolated history and winner/order stability. | PASS |
| SC-007 | Publication revalidates target state, verifies the moved recovery bundle, and restores on injected failures. | Changed/locked target, boundary mutation, move/reopen failure, restoration, and cleanup fixtures. | PASS |
| SC-008 | Schema, SQLite, foreign keys, exact per-row receipts/header, provenance, temporal chains, FTS payloads, backup freshness, and `sqlite_sequence` are verified. | Fifteen corruption cases, concurrent writer test, AUTOINCREMENT-only stale-backup test, and Oracle focused review. | PASS |
| SC-009 | Stable IDs include source identity and exact plan replay verifies all child receipts with zero logical delta. | Cross-source same-session-ID collision test, tamper cases, and exact replay delta assertions. | PASS |
| SC-010 `[outcome]` | Real legacy/current database rehearsal was intentionally not authorized or executed. | Deferred to a separately authorized isolated-copy rehearsal. | RISK |
| SC-011 `[outcome]` | Real stopped-host cutover and post-cutover recall comparison were intentionally not authorized or executed. | Deferred to a separately authorized production cutover. | RISK |

## Commands and results

- `pnpm exec vitest run tests/memory-core/importer.test.ts tests/memory-core/schema-migration.test.ts --config vitest.unit.config.ts`: 46/46 PASS after final convergence.
- Oracle independent focused run across importer, import CLI, schema migration, and retrieval: 75/75 PASS.
- `pnpm run build`: PASS.
- `pnpm test`: 50 files, 379 tests PASS; `prepublishOnly` repeated the same 379-test result.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS for OpenCode, Codex, and Claude Code.
- `pnpm run benchmark:fixture`: PASS; its generated report was restored byte-identical to HEAD after verification.
- Full `ready` validator: PASS with zero errors and zero warnings.
- `git diff --check`: PASS; only line-ending warnings were emitted.

## Findings

- No open blockers or correctness warnings. Earlier Oracle findings B-001 through V3-B001 are resolved and covered by regression tests.

## Residual risks

- SC-010: The real `~/.thoth/thoth.db` row accounting, byte preservation, retrieval sample, and apply report remain unobserved until an isolated-copy rehearsal is explicitly authorized.
- SC-011: The real stopped-host publication, recovery bundle, reopen verification, and current-memory recall comparison remain unobserved until a production cutover is explicitly authorized.
- Publication assumes a stopped target, successful exclusive-lock acquisition, same-volume rename semantics, and local SQLite support for FTS5, `VACUUM INTO`, online backup, and `pragma_table_list`.
- The sealed plan is integrity-hashed rather than cryptographically authenticated; local plan-file custody is an operator boundary.
