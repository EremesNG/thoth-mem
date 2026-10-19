# Verification Report: Canonical taxonomy recovery

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: FR-001 through FR-007, buildable SC-001 through SC-006, and outcome SC-007 are represented by implementation and executed evidence.
- **Correctness**: Canonical taxonomy enforcement, atomic revision-3 migration, the strict Bun-to-Node envelope, and converged item-aware host rendering satisfy their behavioral contracts with no critical issue.
- **Coherence**: Specification, plan, tasks, implementation, tests, generated bundle, and package inventory agree on the V2 contract, internal SQLite revision 3, exact six tools, literal-Node persistence boundary, and 1,000-code-point host cap.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/contracts.ts`, tuple-driven schemas in `src/tools/index.ts` | Focused MCP suite and canonical-list source search | PASS |
| FR-002 | Pre-transaction validation in `src/memory-core/service.ts`; SQLite guards in `src/memory-core/sqlite/schema.ts` | Taxonomy, service, and fresh-ledger tests | PASS |
| FR-003 | Internal revision 3 and atomic revision-2 migration in `src/memory-core/sqlite/migrations.ts` | Mapping, unknown-value, rollback, and query-only reopening tests | PASS |
| FR-004 | Canonical envelope validation and literal Node spawn in `src/integration/opencode/node-lifecycle-client.ts` | OpenCode integration and generated-bundle inspection | PASS |
| FR-005 | Item-aware code-point renderer in `src/integration/opencode/plugin.ts`; public-hook regression in `tests/integration/opencode-native-plugin.test.ts` | OpenCode 12-test suite and read-only real-ledger replay | PASS |
| FR-006 | Six-entry MCP registry, one identity-only native tool, shell-free Node boundary | MCP, OpenCode, full-suite, and integration-inventory checks | PASS |
| FR-007 | Migration changes only taxonomy columns while preserving authoritative rows and derived visibility | Migration suite plus foreign-key and FTS assertions | PASS |
| SC-001 `[buildable]` | One production tuple source drives unions, Zod, service, SQLite, and OpenCode validation | Source search, typecheck, and focused tests | PASS |
| SC-002 `[buildable]` | Field-specific rejection occurs before project or ledger mutation | MCP and service tests | PASS |
| SC-003 `[buildable]` | Declared mappings reach revision 3 without authoritative-semantic drift | Migration fixture | PASS |
| SC-004 `[buildable]` | Unknown values and injected revision failures roll back; revision 3 opens under query-only mode | Migration fixture | PASS |
| SC-005 `[buildable]` | Four complete attributed lines render at exactly 1,000 code points; the later SC008 marker survives two longer predecessors | RED→GREEN public-hook regression, generated-bundle inspection, packed smoke, and real-ledger replay | PASS |
| SC-006 `[buildable]` | Exact six-tool registry and all repository gates | Typecheck, 127-test suite, inventory, packed smoke, prepublish, and diff check | PASS |
| SC-007 `[outcome]` | Fresh session `ses_fc106ae11ffefXvo99m9lHQoYM` returned the absent-from-prompt marker exactly; export has one user and one assistant message, zero tool parts, and zero file changes; SQLite records confirmed `enroll`, `capture_root`, and `recover` with null diagnostics; the matching log window has zero lifecycle degradation or native-load errors | Export audit, read-only receipt query, bounded log scan, and fresh independent Oracle review | PASS |

## Executed verification

- Accelerated `ready` validator: PASS; one non-blocking store-overlap warning.
- Convergence RED: the new multi-item public-hook regression failed because the SC008-A marker was absent and a source line was cut mid-content.
- Convergence GREEN: OpenCode native integration PASS — 12 tests, including a four-item source-attributed block at the 1,000-code-point cap.
- Read-only real-ledger replay: PASS — 4 recovered items, all 4 memory IDs rendered in complete lines, SC008-A marker present.
- Focused taxonomy/MCP: PASS — 3 files, 10 tests.
- `pnpm exec tsc --noEmit`: PASS.
- `pnpm run build`: PASS.
- `pnpm test`: PASS — 30 files, 127 tests.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS — packed OpenCode, Codex, and Claude Code lifecycle fixtures.
- `pnpm run prepublishOnly`: PASS — repeated inventory verification, build, and 30-file/127-test suite.
- `git diff --check`: PASS; line-ending notices only.
- Generated `dist/opencode.js`: contains the converged renderer and taxonomy diagnostic, spawns literal Node with `shell:false`, and contains neither `better-sqlite3` nor `MemoryService`.
- Real OpenCode SC-007 retry: PASS — OpenCode 1.18.23 session `ses_fc106ae11ffefXvo99m9lHQoYM` returned `SC008-CROSS-HOST-NATIVE-20260825-A` exactly with zero tool parts and zero file changes; export SHA-256 is `5882D6CCCD13F88E0449D80BC1859CF5B2E8BC270FC255F60B2EAE92DE9A4F11`.
- Real SQLite lifecycle audit: PASS — confirmed `enroll` at `2026-08-26T16:48:42.266Z`, `capture_root` at `2026-08-26T16:48:42.413Z`, and `recover` at `2026-08-26T16:48:42.711Z`; all three have null diagnostic codes and the project identity is `path:C:/DEV/Proyectos/Webstorm/thoth-mem`.
- Real OpenCode log audit: PASS — the complete 16-line matching run window has zero ERROR/FATAL entries and zero `node_lifecycle`, lifecycle-degraded, invalid-envelope, or `ERR_DLOPEN_FAILED` matches.
- Fresh independent outcome Oracle: PASS — SC-007 satisfies every clause and completes the final overall verdict without contradicting FR-004 or FR-005.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | No critical issue or remediation blocker | — |

## Warnings

- T012 names `scripts/verify-integration-package.mjs`, while packed Bun execution is provided by `scripts/verify-packed-plugins.mjs` through `integration:smoke`; both gates passed.
- Unicode code-point safety is established by `Array.from` implementation and inspection; the multi-item regression fixture uses ASCII content.
- The validator's existing store-overlap warning is non-blocking and does not expose behavioral overlap in this change.
- `benchmarks/results/fixture-report.json` and `openspec/changes/restore-native-bundle-activation/` remain pre-existing unrelated work.

## Residual risks

- None blocking. The verified revision-3 online backup remains at `C:\Users\EremesNG\.thoth-mem-v2-local\backups\memory-v2-r3-pre-sc007-20260826T152000Z.sqlite` as operational recovery material.
