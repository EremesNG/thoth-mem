# Verification Report: Safe WAL Publication for Legacy Import

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — Successful non-empty-WAL publication, all three WAL recovery boundaries, DELETE after-candidate restoration, held-reader checkpoint busy, absent-target sidecar occupancy, locked and changed targets, retained backup/report, CLI retry guidance, and all eight previously canonical import scenarios are covered.
- **Correctness**: PASS — The sealed physical/logical identity is checked before normalization; checkpoint status is inspected; the snapshot is captured after connection close; custody is revalidated; recovery uses integrity, foreign-key, and logical proof; and moves use create-only hard-link semantics.
- **Coherence**: PASS — Code, tests, fresh Full-route artifacts and plan review, report v3, plan v4, and unchanged public apply/CLI contracts align; the `[MODIFIED cli]` delta retains the canonical requirement title and all prior Given/When/Then payloads while adding the WAL scenarios.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/import/legacy-v1.ts:131` retains sealed planning/apply, verified backup/candidate, report v3, retry, replay, and idempotency; `tests/memory-core/importer.test.ts:465` proves publication from a genuinely non-empty plan-bound WAL; US5 retains all eight canonical CLI scenarios verbatim. | Fresh Oracle focused importer/CLI 63/63, build, scenario comparison 8/8; root full suite 421/421, integration and prepublish gates | PASS |
| FR-002 | `src/memory-core/import/backup.ts:117` validates the sealed state, inspects checkpoint busy/log/checkpointed, reacquires the barrier, closes, and captures the normalized post-close snapshot; `src/memory-core/import/backup.ts:152` revalidates before movement. | WAL publication and held-reader focused tests; Oracle disposable WAL probe | PASS |
| FR-003 | `src/memory-core/import/backup.ts:168` detaches the complete active file set, restores with no-overwrite moves, and requires expected file-set presence plus SQLite integrity, foreign keys, and logical equality. | Three WAL failure boundaries plus DELETE after-candidate restoration tests | PASS |
| FR-004 | `src/memory-core/import/backup.ts:100` fails closed on filesystem sharing errors; `src/memory-core/import/backup.ts:132` rejects incomplete checkpoints; recovery custody and target main/WAL/SHM occupancy are revalidated; CLI retains the locked-target retry action. | Held-reader busy, exclusive lock, target mutation, absent-sidecar occupancy, and CLI failure-report tests | PASS |
| SC-001 `[buildable]` | Non-empty-WAL apply test asserts a bound WAL hash and positive WAL size, committed report, one receipt, preserved baseline, integrity, and valid recovery database. | `pnpm exec vitest run tests/memory-core/importer.test.ts --config vitest.unit.config.ts` — 41/41 | PASS |
| SC-002 `[buildable]` | Non-empty-WAL tests cover after-target, after-candidate, and before-reopen; DELETE covers after-candidate; every case verifies integrity, FK validity, exact logical baseline, zero receipt, and truthful restoration. | Oracle combined focused run — 63/63 | PASS |
| SC-003 `[buildable]` | Held-reader busy, locked target, pre-publication logical mutation, and absent-target sidecar occupancy fail without partial commit and retain relevant backup/report evidence. | Core and CLI focused suites; Oracle IDE diagnostics zero errors | PASS |
| SC-004 `[buildable]` | Existing defaults, mapping, advanced plan/apply, retry/replay, custody, taxonomy/quarantine, ranking, packaging, and host integrations remain covered; report stays v3 and plan v4. | `pnpm test` — 51 files/421 tests; `integration:verify`; `integration:smoke`; `benchmark:fixture`; `prepublishOnly`; `git diff --check` | PASS |
| SC-005 `[outcome]` | No real importer or user database was accessed during implementation; separately authorized stopped-host cutover remains required. | N/A during implementation verification | RISK |

## Executed checks

- Root: `pnpm exec vitest run tests/memory-core/importer.test.ts --config vitest.unit.config.ts` — PASS, 41/41.
- Root: `pnpm exec vitest run tests/cli/import-legacy.test.ts --config vitest.unit.config.ts` — PASS, 22/22.
- Root: `pnpm run build` — PASS.
- Root: `pnpm test` — PASS, 51 files and 421/421 tests.
- Root: `pnpm run integration:verify` — PASS.
- Root: `pnpm run integration:smoke` — PASS for OpenCode, Codex, and Claude Code packed smoke/lifecycle fixtures.
- Root: `pnpm run benchmark:fixture` — PASS.
- Root: `pnpm run prepublishOnly` — PASS, including build and 421/421 tests.
- Root: `git diff --check` — PASS; CRLF conversion notices only.
- Fresh Oracle round 2: combined importer/CLI focused run — PASS, 63/63.
- Fresh Oracle round 2: `pnpm run build` — PASS.
- Fresh Oracle round 2: Full-route validator through `ready` — PASS with no errors or warnings.
- Fresh Oracle round 2: `git diff --check` — PASS; CRLF notices only.
- Fresh Oracle round 2: programmatic durable-delta comparison — PASS, 8/8 prior canonical Given/When/Then scenario payloads preserved in the same order.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| V1-N001 | Low | Coverage | The narrow post-snapshot/post-move timing race and candidate-with-sidecars detachment branches are code-inspected rather than reached through a dedicated timing hook; mutation, occupancy, WAL recovery, and cleanup tests cover their public contracts. | Optional future deterministic publication hook around `src/memory-core/import/backup.ts` snapshot/move boundaries. |

## Residual risks

- SC-005: Real cutover remains unobserved by design. After separate authorization, run the packaged one-command import with all hosts stopped and verify its report, SQLite integrity, and bounded recall examples.
- Cross-platform atomic exclusion after SQLite close is unavailable without the rejected native-locking approach. Observable changes fail closed; stopped hosts remain mandatory.
- Exclusive publication depends on same-filesystem hard-link support. Import artifacts are allocated beside the target, and unsupported filesystems fail closed without claiming commit.
