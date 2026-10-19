# Verification Report: Canonical product contract reset

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS. All accepted scope is represented by FR-001 through FR-010, SC-001 through SC-006, eight active capabilities, and the explicit real-host follow-up boundary.
- **Correctness**: PASS. Current commands, envelopes, database and receipt names, lifecycle adapters, numeric revisions, Skills, and packed three-host behavior match the accepted contract without compatibility aliases.
- **Coherence**: PASS. Specification, plan, tasks, active capability specs, implementation, tests, distribution assets, README, and the Accelerated ready gate agree after convergence T019.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `openspec/specs/`; `tests/packaging/canonical-product-contract.test.ts:1` | Exact inventory audit; canonical contract test | PASS |
| FR-002 | Deleted retired capability specs; `openspec/specs/evals/spec.md:1` | Forbidden-surface audit; canonical contract test | PASS |
| FR-003 | `src/tools/index.ts:62`; `src/integration/opencode/node-lifecycle-client.ts:137` | MCP and integration focused suites | PASS |
| FR-004 | `src/cli.ts:18`; `src/integration/adapters/index.ts:1`; `src/integration/core/lifecycle.ts:1` | Lifecycle, adapter, OpenCode, and public-runner suites | PASS |
| FR-005 | `src/cli.ts:11`; `src/cli.ts:52` | CLI/importer tests and direct removed-command probes | PASS |
| FR-006 | `src/server.ts:16`; `src/memory-core/sqlite/migrations.ts:10`; `src/memory-core/import/legacy-v1.ts:37` | Config, ledger, importer, and migration suites | PASS |
| FR-007 | `integrations/codex/manifest.json:1`; `integrations/claude-code/manifest.json:1`; `plugin/runners/public-runner.mjs:162` | `pnpm run integration:verify`; packed smoke | PASS |
| FR-008 | `src/tools/index.ts:14`; `tests/tools/mcp.test.ts:8` | Exact six-tool registry tests | PASS |
| FR-009 | `plugin/skills/thoth-mem/SKILL.md:8`; `integrations/inventory.json:1` | Four-file Skill SHA-256 equality; package inventory tests | PASS |
| FR-010 | `src/config/runtime.ts:10`; `src/memory-core/sqlite/migrations.ts:10`; `src/memory-core/import/legacy-v1.ts:12` | Numeric revision assertions and active product-label residue audit | PASS |
| SC-001 `[buildable]` | Exactly eight active capability directories | Canonical contract test and directory inventory | PASS |
| SC-002 `[buildable]` | Retired capability directories absent | Forbidden capability/title audit | PASS |
| SC-003 `[buildable]` | Current CLI, MCP, lifecycle, receipt, module, and default database names | Focused 80-test Oracle suite; direct alias probes | PASS |
| SC-004 `[buildable]` | Numeric config, SQLite, manifest, and importer-report revisions retained | Migration/config/importer/package tests | PASS |
| SC-005 `[buildable]` | Active owned product-label residue is zero; only excluded external `setup-bun@v2` action revisions remain | Scoped case-insensitive residue audit | PASS |
| SC-006 `[outcome]` | Repository/disposable-host verification did not mutate real user homes; adoption is explicit and backed up in `README.md:90` | Packed smoke in disposable homes; README inspection | PASS |

## Verification evidence

- Accelerated `ready` validator: `valid=true`, zero errors and zero warnings.
- Focused red/green slices: 23/23 unit and 27/27 integration tests passed during implementation.
- Oracle focused verification: 16 files and 80 tests passed.
- Full `pnpm test`: 31 files and 133 tests passed.
- `pnpm run build`: PASS.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS for OpenCode, Codex, and Claude Code disposable fixtures.
- `pnpm run benchmark:fixture`: PASS; volatile generated metrics were restored and excluded from the product diff.
- `pnpm run prepublishOnly`: PASS.
- `git diff --check`: PASS.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | No unresolved finding after convergence T019 | — |

## Residual risks

- SC-006: Repository and disposable-host certification does not certify adoption of an existing real-host database, plugin reinstall/restart, or actual model consumption. Those stateful steps remain a separate operator-controlled follow-up after closing hosts and creating a recoverable backup.
