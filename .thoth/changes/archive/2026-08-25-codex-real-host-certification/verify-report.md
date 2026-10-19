# Verification Report: Codex real-host lifecycle certification

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS
**Oracle instance**: `oracle_codex_post_restart_final_verify`<br>
**Verdict summary**: Complete, correct, and coherent across FR-001 through FR-005 and SC-001 through SC-005; no critical or major findings remain.

## Review dimensions

- **Completeness**: PASS for FR-001 through FR-005 and SC-001 through SC-005.
- **Correctness**: PASS — the direct MCP server map is the compatible intersection of current documentation and Codex `0.147.0`, and the installed loader resolves its working directory.
- **Coherence**: PASS — code, tests, installed receipts, runtime inventory, post-restart host evidence, and SDD artifacts agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/integration/adapters/v2.ts`; `src/memory-core/contracts.ts`; `src/memory-core/service.ts` | `pnpm exec vitest run tests/integration/adapters-v2.test.ts tests/integration/lifecycle-v2.test.ts tests/setup/v2-plugins.test.ts` | PASS |
| FR-002 | `integrations/codex/runner.mjs` | Installed-cache nine-fixture preflight plus SQLite receipt inspection | PASS |
| FR-003 | `integrations/codex/.codex-plugin/plugin.json`; `integrations/codex/hooks/hooks.json`; `integrations/codex/mcp.json` | Focused setup test, `pnpm run integration:verify`, `codex mcp get thoth_mem --json` | PASS |
| FR-004 | `tests/integration/adapters-v2.test.ts`; `scripts/verify-packed-plugins.mjs` | `pnpm run integration:smoke` | PASS |
| FR-005 | `integrations/codex/runner.mjs`; authorized Codex config and isolated certification DB | Plugin/MCP list, installed runner, trust-state, strict published-control snapshots, and restored normal inventory | PASS |
| SC-001 `[buildable]` | Official five-event fixtures, four-source SessionStart matrix, confirmed/degraded identity receipts | 17 focused tests and packed smoke | PASS |
| SC-002 `[buildable]` | One manifest, one five-event hook source, one direct MCP declaration, managed receipt | Plugin add/list exit `0`; all seven installed/source SHA-256 values match; loader resolves installed `cwd` | PASS |
| SC-003 `[buildable]` | Installed cache runner at `C:\Users\EremesNG\.codex\plugins\cache\personal\thoth-mem\0.4.13\runner.mjs` | Nine native fixtures exit `0`; four SessionStart cases emit documented context; receipts are confirmed or explicitly degraded | PASS |
| SC-004 `[outcome]` | `/hooks` showed one active `thoth-mem@personal` handler for each of the five declared events and no active published handler; the npm MCP was temporarily stopped as the disabled-hook control | Exact pre/post path/size/mtime snapshot of all 233 files under `C:\Users\EremesNG\.thoth` | PASS |
| SC-005 `[outcome]` | Current canary decision `OBSIDIAN-KESTREL-4721` in the isolated DB and confirmed `recover` receipt for a clean ephemeral Codex task | Prompt omitted the token and prohibited files, DB, MCP, and prior conversations; model returned the exact token | PASS |

## Executed checks

- TDD red: `pnpm exec vitest run tests/integration/adapters-v2.test.ts` failed on the old required `event_id` contract as expected.
- TDD red: `pnpm exec vitest run tests/integration/lifecycle-v2.test.ts` failed because degraded identity was previously confirmed as expected.
- TDD red: `pnpm exec vitest run tests/setup/v2-plugins.test.ts` failed because the runner did not route Codex storage through the host-specific override or `PLUGIN_DATA` as expected.
- Focused final: `pnpm exec vitest run tests/integration/adapters-v2.test.ts tests/integration/lifecycle-v2.test.ts tests/setup/v2-plugins.test.ts` — exit `0`, 3 files and 17 tests passed.
- `pnpm run integration:verify` — exit `0`, verified OpenCode, Codex, and Claude Code v2 inventories.
- `pnpm test` — exit `0`, 18 files and 65 tests passed.
- `pnpm run build` — exit `0`.
- `pnpm run integration:smoke` — exit `0`, packed smoke passed for OpenCode, Codex, and Claude Code, including the complete Codex SessionStart source matrix.
- `pnpm run prepublishOnly` — exit `0`, build plus 18 files and 65 tests passed.
- SDD ready validator after task refinement — `valid: true`, no errors or warnings.
- Post-restart TDD red: `pnpm exec vitest run tests/index.test.ts --config vitest.unit.config.ts` failed because `mcp --no-http --data-dir <path>` was routed to the CLI.
- Post-restart TDD green: the same focused command passed after `src/index.ts` routed by the leading command token.
- Exact configured MCP probe: `node dist/index.js mcp --no-http --data-dir C:\Users\EremesNG\.thoth-canary-v2-codex-cert` returned an MCP initialize response for `thoth-mem` `0.4.13`.
- Post-fix `pnpm run integration:smoke` — exit `0`; the packed tarball completed an explicit-data-directory MCP handshake and all three lifecycle inventories passed.
- Post-fix `pnpm run prepublishOnly` — exit `0`, 19 files and 66 tests passed.
- Post-fix `pnpm run integration:verify` — exit `0`, verified OpenCode, Codex, and Claude Code v2 inventories.

## CDX-MCP-001 convergence evidence

- TDD red: the setup contract failed when the installed file still contained the wrapped `mcp_servers` object.
- TDD green: the Codex MCP component now uses the direct server map accepted by both current OpenAI documentation and Codex CLI `0.147.0`; the exact server key is `thoth_mem`, with `node`, `runner.mjs --mcp`, and `cwd: "."`.
- Exact-version source inspection: Codex `rust-v0.147.0` supports a manifest-referenced `mcp.json`, parses the legacy file as camelCase `mcpServers` or a direct server map, and resolves a relative `cwd` against the installed plugin root. The direct map avoids the documented/runtime wrapper mismatch and the known hyphenated-tool exposure defect.
- Rebuilt setup receipt MCP hash: `fb6fe932001974a94bae4a3910bf17ae66c0b9f3fdb08b5d41f5ee7e6cbf76d5`; source and installed-cache hashes match.
- `codex mcp get thoth_mem --json` exited `0` and resolved `cwd` to `C:\Users\EremesNG\.codex\plugins\cache\personal\thoth-mem\0.4.13\.` with command `node` and arguments `runner.mjs --mcp`.
- The plugin-scoped bundled MCP was then returned to `enabled = false`. Normal inventory has exactly two active thoth servers: published `thoth-mem` and explicit local `thoth-mem-canary`; the correctly loadable bundled `thoth_mem` remains visible but disabled.
- Final checks after convergence: 3 focused files / 17 tests PASS; 18 files / 65 tests PASS; build PASS; integration inventory PASS; packed smoke PASS for all three harnesses; prepublish PASS; ready validator PASS with no warnings.
- Historical pre-restart Oracle round 2: PASS for FR-001 through FR-005 and buildable SC-001 through SC-003; at that time SC-004 and SC-005 correctly remained RISK pending restart. The fresh post-restart Oracle verdict below supersedes that outcome status.

## CDX-MCP-002 post-restart convergence evidence

- A real Codex CLI startup reported `thoth-mem-canary` closing during MCP initialization.
- Replaying the configured process boundary returned `Unknown command: mcp`; the dispatcher treated the separate `--data-dir` value as a positional CLI command.
- The retained regression failed red with `expected true to be false`, then passed green after routing by the leading command token.
- Packed smoke now initializes the packed MCP with `mcp --no-http --data-dir <disposable-path>` and requires a `serverInfo` response.
- The exact local canary command, full 66-test suite, build, inventory verifier, packed smoke, and prepublish lane all pass after the correction.

## Installed canary evidence

- `codex plugin add thoth-mem@personal --json` exited `0` and installed version `0.4.13` in the Codex personal cache.
- `codex plugin list` exited `0`: `thoth-mem@personal` is installed/enabled and `thoth-mem@thoth-mem` is installed/disabled.
- `codex mcp list` exited `0`: published `thoth-mem` points to `npx --yes thoth-mem@0.4.13`; `thoth-mem-canary` points to the local `dist/index.js` and the isolated certification directory.
- The bundled personal server `thoth_mem` is loader-resolved but disabled in normal configuration, preventing a third active MCP and preserving the explicit canary boundary.
- Installed and source runner SHA-256 are both `44cd570ce716c001017f7c18c94df538af7422eb410bb9521adc7ea6be2a591b`.
- Official installed-runner preflight results: `SessionStart(startup|resume|clear|compact)` emitted `hookSpecificOutput.SessionStart.additionalContext` containing the unique token; `UserPromptSubmit` with and without `turn_id`, `PreCompact`, `PostCompact`, and `SessionEnd` emitted `{}`; every case exited `0`.
- SQLite receipts for both preflight roots contain one explicitly degraded `capture_root` receipt for the fixture without `turn_id`; every other receipt is confirmed and duplicate delivery produced one canonical receipt.
- The certification database is `C:\Users\EremesNG\.thoth-canary-v2-codex-cert\memory-v2.sqlite`. The unique decision was seeded directly into this file because the already-running MCP canary process belonged to the pre-reinstall host session and was excluded from evidence.
- `config.toml` now contains trusted hashes for exactly the five `thoth-mem@personal` handlers. `/hooks` reported `Installed = 1` and `Active = 1` for `PreCompact`, `PostCompact`, `SessionStart`, `SessionEnd`, and `UserPromptSubmit`; the published plugin remains disabled and contributes zero active hooks.

## Published control snapshot

- Path: `C:\Users\EremesNG\.thoth`
- Captured: `2026-08-25T15:31:27.0068361Z`
- Files: `233`
- Total bytes: `676494331`
- Canonical path/size/mtime metadata SHA-256: `cae523d697f2c9a0d46a5349065b3c2798dcd494d9fd3eb0fa94360e90a173e4`

### Historical pre-restart control contamination

- A later inspection found the published directory still had 233 files but total bytes had changed to `713125515`; SQLite/config metadata was also newer than the original snapshot.
- The drift occurred before restart while the old host session and published MCP process were still alive, so the original snapshot can no longer prove SC-004. No rollback or destructive mutation was attempted.
- At that pre-restart point SC-004 therefore remained RISK. The completed post-restart evidence below supersedes this historical status.

## Post-restart real-host outcome evidence

- Codex CLI version: `0.147.0`.
- Plugin inventory: `thoth-mem@personal` enabled; `thoth-mem@thoth-mem` disabled; the personal bundled `thoth_mem` MCP disabled to avoid a third server.
- Normal MCP inventory was restored after certification with published `thoth-mem` and explicit local `thoth-mem-canary` enabled.
- `/hooks` reviewed the concrete command `node "C:\Users\EremesNG\.codex\plugins\cache\personal\thoth-mem\0.4.13/runner.mjs"`, identified its source as `Plugin - thoth-mem@personal`, and ended with exactly one active handler for each declared event.
- The certification decision was reseeded in `C:\Users\EremesNG\.thoth-canary-v2-codex-cert\memory-v2.sqlite` under project identity `path:C:/DEV/Proyectos/Webstorm/thoth-mem`, topic `certification/codex/real-host-recovery`, and current memory id `8103d144-853a-5029-a195-eae89cbf696f`.
- Controlled task `01a039cc-752e-75c3-83a1-04ab0736a2e6` used an ephemeral fresh Codex context. Its prompt did not contain the token and explicitly prohibited files, databases, MCP tools, and previous conversations. The model returned exactly `OBSIDIAN-KESTREL-4721`.
- The canary DB recorded `recover`, `capture_root`, and `finalize` as confirmed for that task, with an ended durable session.
- For the strict SC-004 control, the published npm MCP was temporarily disabled in config and its already-running four-process tree was stopped after exact command-line verification. The canary remained enabled. The baseline at `2026-08-25T16:41:26.9200623Z` contained 233 files, `1122713371` bytes, and canonical path/size/mtime SHA-256 `0c6b971c6b2bc62a59371ceed4dcdc7a07c5be36cb66dcd688c07f4b95f65ad2`.
- After the clean model-consumption task, the published control still contained 233 files, `1122713371` bytes, and the identical metadata SHA-256. The npm MCP was then restored to enabled in normal configuration.

## Fresh post-restart Oracle verdict

- **Conclusion**: PASS — complete, correct, and coherent across FR-001 through FR-005 and SC-001 through SC-005.
- **CDX-MCP-002**: resolved at the real process boundary; current source and built output route from the leading `mcp` token, strip it before server startup, and parse the separate data-directory value.
- **SC-004**: PASS from exclusive personal handlers and identical strict pre/post published metadata.
- **SC-005**: PASS from the token-free fresh prompt, exact model response, recovered memory, and confirmed task receipts.
- **Critical findings**: none.
- **Major findings**: none.
- **Minor finding DOC-001**: resolved by labeling the pre-restart RISK text as historical and updating the current review dimensions and outcome matrix to PASS.
- **Open questions**: none.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| CDX-MCP-001 | Resolved | Correctness / completeness | The referenced file now uses a direct `thoth_mem` server map. The rebuilt cache is hash-identical, `codex mcp get` resolves the installed root, packed verification rejects both wrapped shapes, and fresh Oracle round 2 passed. | T017-T020 complete |
| CDX-MCP-002 | Resolved | Correctness / process boundary | The entrypoint no longer misclassifies the separate data-directory value; focused red/green coverage, exact handshake, packed smoke, full tests, and the fresh Oracle all pass. | T021-T024 complete |
| DOC-001 | Resolved | Coherence | Historical pre-restart RISK prose is explicitly historical, and current dimensions/matrix record the fresh post-restart PASS. | Verification report corrected before closeout |

## Residual risks

- Unrelated configured index MCPs at `127.0.0.1:29170` and `:29172` failed to initialize during ephemeral tasks. They did not prevent canary hook recovery or model consumption and are outside this change.
- Codex emitted pre-existing model-cache, skill-budget, and plugin-path warnings during the controlled task; none referenced `thoth-mem-canary` after the dispatcher correction.
- The test suite emits Node `DEP0190` from the pre-existing Windows `npm pack` shell invocation; it does not fail a check and is outside this Codex lifecycle contract.
