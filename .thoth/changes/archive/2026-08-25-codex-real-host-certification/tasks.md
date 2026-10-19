# Tasks: Codex real-host lifecycle certification

## Authoring contract

Task identifiers are globally sequential. Every task names one owned repository path and an observable verification outcome. Behavior tests precede implementation, and outcome-only host criteria remain verification targets rather than artificial product work.

## MVP scope

US1 is the MVP: all five official Codex event types and the complete `SessionStart` source matrix normalize without `event_id`; retries deduplicate when documented stable identity exists; missing stable turn identity is persisted and returned as degraded; `SessionEnd`, not `Stop`, finalizes the durable session.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T015 -> T017 -> T018 -> T019 -> T020 -> T021 -> T022 -> T023 -> T024 -> T014 -> T016`. US2 depends on US1 because the installed runner invokes the corrected adapter and service, and US3 depends on a rebuilt, reinstalled, preflighted US2 bundle.

## Implementation ownership

- **Owner**: adaptive root; one writer for the full ordered behavior and packaging chain.
- **Net-gain rationale**: the same lifecycle identity contract is consumed by the service, adapter, runner, manifest, installer, and packed verifier. Root already holds the host/config evidence, while splitting writers would require repeated contract handoffs across overlapping tests and mutable surfaces.
- **Owned paths**: `src/memory-core/contracts.ts`, `src/memory-core/service.ts`, `src/integration/adapters/v2.ts`, `integrations/codex/`, `src/setup/install.ts`, `src/index.ts`, `tests/index.test.ts`, `tests/integration/adapters-v2.test.ts`, `tests/integration/lifecycle-v2.test.ts`, and `scripts/verify-packed-plugins.mjs`.
- **Accepted scope**: FR-001 through FR-005 and buildable SC-001 through SC-003; SC-004 and SC-005 remain real-host outcome gates.
- **Non-goals**: no schema migration, published package/database mutation, new MCP tools, legacy shim, OpenCode/Claude real-host certification, or optional retrieval module.
- **Checks**: focused Vitest files, build, integration verification, packed smoke, prepublish, installed canary preflight, diff check, and fresh Oracle final verification.

## Story US1

- [x] T001 [US1] Add failing official-payload source-matrix, SessionEnd, duplicate, distinct-turn, and missing-stable-identity cases covering FR-001, FR-004, and SC-001 in `tests/integration/adapters-v2.test.ts` | Verify: the new tests fail against the current event-id requirement, startup enrollment mapping, and Stop finalization mapping.
- [x] T002 [US1] Add failing service-level degraded-receipt and duplicate-result cases covering FR-001 and SC-001 in `tests/integration/lifecycle-v2.test.ts` | Verify: a lifecycle input marked with degraded identity currently returns confirmed and the test fails for that exact reason.
- [x] T003 [US1] Represent host-neutral lifecycle identity confidence for FR-001 and SC-001 in `src/memory-core/contracts.ts` | Verify: type checking accepts confirmed/degraded identity without adding a Codex wire field to the core contract.
- [x] T004 [US1] Persist and return degraded outcomes when lifecycle identity is not confirmed for FR-001 and SC-001 in `src/memory-core/service.ts` | Verify: the service-level red tests pass and duplicate delivery returns the same degraded receipt without a second canonical effect.
- [x] T005 [US1] Derive Codex event keys only from documented stable fields, implement the SessionStart source matrix, and make SessionEnd the sole finalize event for FR-001, FR-004, and SC-001 in `src/integration/adapters/v2.ts` | Verify: all official fixtures pass without event_id, startup/resume/clear recover, compact guides recovery, identical retries share a key, distinct turns differ, absent turn_id degrades, and Stop is unsupported.

## Story US2

- [x] T006 [US2] Add failing installed-runner recovery-output, valid-empty-output, manifest/MCP shape, path-with-spaces, and version/path consistency coverage for FR-002, FR-003, FR-004, SC-002, and SC-003 in `tests/setup/v2-plugins.test.ts` | Verify: tests expose the current flat hooks, escaping manifest paths, legacy mcp field, and leaked internal lifecycle stdout.
- [x] T007 [US2] Convert the Codex runner into a thin official stdin/internal lifecycle/official stdout adapter for FR-002 and SC-003 in `integrations/codex/runner.mjs` | Verify: each supported event exits zero with valid Codex JSON, recovery uses hookSpecificOutput additionalContext, and internal lifecycle JSON is not emitted.
- [x] T008 [US2] Replace the Codex hook bundle with one current nested handler per declared event using installed-root resolution and bounded execution for FR-003 and SC-002 in `integrations/codex/hooks/hooks.json` | Verify: the hook parser finds exactly five supported event types whose commands resolve the installed runner through PLUGIN_ROOT, including a plugin path with spaces.
- [x] T009 [US2] Correct the Codex manifest to current plugin-root references and component field names for FR-003 and SC-002 in `integrations/codex/.codex-plugin/plugin.json` | Verify: manifest validation resolves hooks and mcpServers inside the plugin root and its version matches the package.
- [x] T010 [US2] Align the Codex MCP component with the corrected manifest and local runtime contract for FR-003 and SC-002 in `integrations/codex/mcp.json` | Verify: the plugin loader recognizes the declared MCP component and its command/arguments resolve without escaping the installed bundle.
- [x] T011 [US2] Verify setup inventory and installation receipts for the corrected Codex manifest, MCP, hook, and runner assets for FR-003 and SC-002 in `tests/setup/v2-plugins.test.ts` | Verify: a temporary Codex installation contains exactly the declared files with version-consistent managed receipts and no stale component declaration.
- [x] T012 [US2] Update packed-plugin verification to use official Codex fixtures, the SessionStart source matrix, installed host output, and consistent bundle inventory for FR-003, FR-004, SC-002, and SC-003 in `scripts/verify-packed-plugins.mjs` | Verify: packed verification rejects event_id and Stop fixtures and passes manifest, MCP, runner, receipt, and recovery assertions against the packed bundle.

## Parallel execution

- None: US1 changes the lifecycle contract consumed by the runner, while US2 tests, runner, hook manifest, plugin manifest, MCP declaration, setup inventory, and packed verification form one ordered installed-bundle chain with overlapping observable contracts.

## Story US3

- [x] T013 [US3] Rebuild, reinstall, and preflight the authorized local marketplace canary while preserving the published control for FR-005, SC-002, and SC-003 in `openspec/changes/codex-real-host-certification/verify-report.md` | Verify: plugin add/list, MCP list, every installed-runner fixture, isolated database receipts, and trust-pending state are evidenced without published database mutation.
- [x] T014 [US3] Complete the post-restart real-host certification targets SC-004 and SC-005 in `openspec/changes/codex-real-host-certification/verify-report.md` | Verify: `/hooks` showed exactly one active personal-canary handler for each declared event and no active published handler; all 233 published-control files retained the exact same path/size/mtime hash; a clean ephemeral startup reproduced the unique recovered decision absent from its prompt.

## Final verification

- [x] T015 Run focused tests first and the required build, integration, packed-smoke, and prepublish checks for FR-001 through FR-004 and SC-001 through SC-003 in `openspec/changes/codex-real-host-certification/verify-report.md` | Verify: every executed command and exact result is recorded, with failures remaining explicit.
- [x] T016 Complete fresh Oracle verification of all implemented requirements and certification evidence in `openspec/changes/codex-real-host-certification/verify-report.md` | Verify: the fresh post-restart Oracle reported PASS across FR-001 through FR-005 and SC-001 through SC-005 with no unresolved critical or major findings.

## Convergence

- [x] T017 Resolve CDX-MCP-001 by replacing the wrapped declaration with a direct collision-safe server map and installed-root working directory for FR-003 and SC-002 in `integrations/codex/mcp.json` | Verify: the declaration has the exact thoth_mem key, runner.mjs --mcp arguments, and cwd set to the plugin root.
- [x] T018 Add red-then-green CDX-MCP-001 contract coverage that rejects both wrapped shapes and requires the direct installed-root map for FR-003 and SC-002 in `tests/setup/v2-plugins.test.ts` | Verify: the focused test failed against the wrapped declaration and then all 6 setup tests passed.
- [x] T019 Harden packed verification for the exact CDX-MCP-001 loader-compatible direct server map for FR-003 and SC-002 in `scripts/verify-packed-plugins.mjs` | Verify: packed smoke passes for all three harnesses and rejects either wrapper or a missing installed-root working directory.
- [x] T020 Rebuild, reinstall, prove loader resolution, and restore the normal two-active-MCP control for CDX-MCP-001, FR-003, FR-005, and SC-002 in `openspec/changes/codex-real-host-certification/verify-report.md` | Verify: `codex mcp get thoth_mem --json` resolves the cache working directory, source/cache hashes match, and only published `thoth-mem` plus explicit `thoth-mem-canary` remain enabled.

## Post-restart convergence

- [x] T021 Add a red CDX-MCP-002 entrypoint-routing regression for the real mcp invocation in `tests/index.test.ts` | Verify: the focused test failed because the data-directory value was misclassified as a CLI command.
- [x] T022 Resolve CDX-MCP-002 by routing MCP from its leading command token in `src/index.ts` | Verify: the exact configured canary command returns an MCP initialize response with server name thoth-mem.
- [x] T023 Add an explicit-data-directory packed handshake for CDX-MCP-002 in `scripts/verify-packed-plugins.mjs` | Verify: packed smoke exercises the real argument shape and rejects a missing initialize response.
- [x] T024 Rebuild and rerun the focused, full, inventory, packed, and prepublish verification lanes for CDX-MCP-002 in `openspec/changes/codex-real-host-certification/verify-report.md` | Verify: 1 focused test, 66 full tests, build, integration inventory, packed smoke, and prepublish all pass after the dispatcher fix.
