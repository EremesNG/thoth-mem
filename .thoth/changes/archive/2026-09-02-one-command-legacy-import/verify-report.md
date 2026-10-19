# Verification Report: One-Command Legacy Import

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: FR-001 and every buildable success criterion SC-001 through SC-005 are implemented and covered; SC-006 remains an explicit operational outcome risk until the authorized stopped-host cutover.
- **Correctness**: The one-command wrapper delegates to the sealed planner and atomic apply engine, exact committed replay uses receipt-bound v4 plan custody, and changed or tampered request identity fails closed.
- **Coherence**: Specification, plan, convergence tasks, implementation, CLI help, README, tests, and package checks agree on one normal command with advanced `plan`/`apply` retained.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/cli.ts:13`, `src/cli.ts:239`, `src/memory-core/import/contracts.ts:53`, `src/memory-core/import/legacy-v1.ts:94` | Focused CLI/core tests; build; prepublish; independent adversarial probes | PASS |
| SC-001 `[buildable]` | `src/cli.ts:239`, `tests/cli/import-legacy.test.ts:70` | Packaged disposable `dist/index.js import-legacy` probe and focused suite | PASS |
| SC-002 `[buildable]` | `src/cli.ts:300`, `src/cli.ts:318` | Exact JSON counts, human output, nullable artifacts, and privacy-marker tests | PASS |
| SC-003 `[buildable]` | `src/cli.ts:147`, `src/cli.ts:329`, `tests/cli/import-legacy.test.ts:217` | Locked, aliased, invalid, changed, and tampered disposable cases | PASS |
| SC-004 `[buildable]` | `src/memory-core/import/contracts.ts:67`, `src/memory-core/import/contracts.ts:189`, `src/cli.ts:245`, `src/cli.ts:256` | Exact/reordered replay, stale retry, null/empty/populated mapping, copied plan/binding, altered binding, and re-hashed tamper probes | PASS |
| SC-005 `[buildable]` | `src/cli.ts:203`, `src/cli.ts:335` | Existing advanced `plan`/`apply` tests within focused suite | PASS |
| SC-006 `[outcome]` | `README.md:114` | Not executed: configured live target remains open in the active host | RISK |

## Commands and results

- `pnpm exec vitest run --config vitest.config.ts tests/cli/import-legacy.test.ts tests/memory-core/importer.test.ts` — PASS, 55/55.
- `pnpm run build` — PASS.
- `pnpm run prepublishOnly` — PASS, including integration verification, build, 51 files and 413/413 tests.
- `pnpm run integration:smoke` — PASS for OpenCode, Codex, and Claude Code.
- `pnpm run benchmark:fixture` — PASS; volatile generated report restored afterward.
- `node .../thoth-sdd/scripts/validate.mjs --change openspec/changes/one-command-legacy-import --through ready` — PASS.
- `git diff --check` — PASS; only informational LF-to-CRLF notices.
- Fresh Oracle packaged and adversarial disposable probes — PASS; no live database accessed.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | No unresolved findings after convergence rounds V1 through V4; final reviewer was `oracle_one_command_import_final_verify_5`. | — |

## Residual risks

- SC-006: The real `~/.thoth/thoth.db` cutover and post-cutover integrity/recall inspection remain unobserved until every host using the configured target is stopped and the user runs the documented one-command import.
