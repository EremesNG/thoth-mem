# Implementation Plan: Codex real-host lifecycle certification

## Technical context

The local Codex bundle is installed and enabled from the `personal` marketplace while the published `thoth-mem@thoth-mem` plugin is disabled. Its preflight fails before SQLite because `normalizeNativePayload('codex', payload)` requires undocumented `event_id`. The bundle also ships a legacy flat hook shape and forwards internal lifecycle JSON directly to Codex stdout. Current Codex requires nested command handlers, installed-root path resolution, official native payloads, event-specific output, explicit hook trust, and evidence beyond asset installation.

The design follows the repository's shared-core boundary and the external comparison recorded in `research.md`: agentmemory and engram both keep native host adapters thin, test installed paths and manifests, bound hook latency, and avoid moving persistence semantics into plugin scripts.

Affected surfaces are `src/integration/adapters/v2.ts`, `src/memory-core/contracts.ts`, `src/memory-core/service.ts`, `integrations/codex/`, packed-plugin verification, nearby adapter/lifecycle/setup tests, and the existing isolated canary installation. No schema migration, published package mutation, or legacy compatibility layer is required.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change does not add, remove, or rename any MCP tool; both explicit MCP servers retain the exact six-tool core.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Identity derivation, lifecycle receipts, recovery, and certification remain local and deterministic with SQLite/FTS5; no optional projection, LLM, or remote service enters the hot path.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Codex wire fields are consumed only in its adapter and runner; lifecycle persistence stays behind the shared host-neutral contract.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recovery continues to use the existing bounded context result, and Codex `additionalContext` receives only that bounded recovery payload.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The active v2 Codex contract is corrected directly; no shim for invented `event_id` or old hook nesting is retained, and the published database remains untouched.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001, SC-001 | Add deterministic Codex event-key derivation and a host-neutral identity-confidence input consumed by `MemoryService.lifecycle`. `SessionStart(startup|resume|clear)` recovers, `SessionStart(compact)` guides post-compaction recovery, turn events require `turn_id`, and `SessionEnd` finalizes from session/reason evidence. Missing stable identity produces a persisted and returned degraded result. | `src/integration/adapters/v2.ts`; `src/memory-core/contracts.ts`; `src/memory-core/service.ts` | Public `normalizeNativePayload` source-matrix fixtures plus service-level duplicate, distinct-turn, degraded-receipt, and SessionEnd finalization assertions. |
| FR-002, SC-003 | Make the Codex runner a thin protocol adapter: read official stdin once, invoke `lifecycle-v2`, parse its result, emit only valid Codex hook JSON, and wrap recovery items as `hookSpecificOutput.additionalContext`. Empty-success events emit `{}`; internal lifecycle JSON is never leaked to host stdout. | `integrations/codex/runner.mjs`; lifecycle result contract | Spawn installed `runner.mjs` with native stdin and assert stdout/exit plus SQLite receipts and recovery output. |
| FR-003, SC-002 | Replace the Codex hook file with the current event → matcher group → command handler structure; resolve the installed runner via `${PLUGIN_ROOT}`; use plugin-root `./` manifest references and current `mcpServers`; set bounded timeouts/status; keep exactly one hook source and version-consistent package inventory. | `integrations/codex/.codex-plugin/plugin.json`; `integrations/codex/hooks/hooks.json`; `integrations/codex/mcp.json`; setup inventory/manifests if their declarations change | Static manifest/MCP/path/version/event tests; path-with-spaces execution; `codex plugin add` and `codex plugin list` against the local marketplace. |
| FR-004, SC-001, SC-003 | Replace invented packed fixtures with the official five-event types, the complete `SessionStart` source matrix, and no `event_id`. Exercise the actual packed/installed runner instead of asserting the internal CLI payload as host output. | `tests/integration/adapters-v2.test.ts`; nearest lifecycle/setup tests; `scripts/verify-packed-plugins.mjs` | Focused Vitest tests first, then `pnpm run integration:verify`, `pnpm run integration:smoke`, and `pnpm run prepublishOnly`. |
| FR-005, SC-004, SC-005 | Preserve the existing published npm MCP as control, disable its plugin hooks, enable only `thoth-mem@personal`, and use `C:\Users\EremesNG\.thoth-canary-v2-codex-cert`. The Codex runner maps the certification-only `THOTH_MEM_CODEX_DATA_DIR` override into the shared runtime and otherwise falls back to the host-provided `PLUGIN_DATA`. Snapshot published database metadata before and after the smoke. Trust and inspect the current canary hooks only after reinstall. | `integrations/codex/runner.mjs`; external authorized `C:\Users\EremesNG\.codex\config.toml`; local marketplace/install roots; certification database | Installed-runner environment test, `codex mcp list`, `codex plugin list`, `/hooks`, pre/post file metadata snapshot, unique two-session recall challenge. |

### TDD seams

The behavior-first tests will target three public boundaries before implementation:

1. `normalizeNativePayload` with exact official Codex objects, the `SessionStart` source matrix, `SessionEnd`, and stable/degraded identity assertions.
2. `MemoryService.lifecycle` against a temporary SQLite database, proving degraded identity is persisted and returned rather than silently confirmed.
3. The installed `runner.mjs` stdin/stdout/exit contract, including paths containing spaces and recovery JSON.
4. Packed plugin ingestion through the local marketplace plus `codex plugin add/list`, with filesystem, manifest/MCP, and version consistency checks.

No private helper will be exposed only for testing, and no SQLite internals will be mocked where a temporary database can verify the observable lifecycle effect.

## Optional support artifacts

- `research.md`: Created because current host contracts and two comparable repositories resolve concrete manifest, path, input, output, and testing risks.
- `data-model.md`: Not needed; no SQLite schema or durable record shape changes.
- `contracts/`: Not needed; official host links, exact public seams, and lifecycle deltas are sufficiently bounded in this plan and spec.
- `quickstart.md`: Not needed; real-host actions are certification evidence, not a new user workflow.

## Risks and migrations

- **Identity collision on undocumented/missing fields**: turn events without `turn_id` are explicitly degraded by the shared lifecycle service; they do not become confirmed merely because a deterministic fallback can be computed.
- **Lifecycle semantic drift**: `Stop` is deliberately excluded from durable finalization. `SessionEnd` owns finalize, while every `SessionStart` source has an explicit tested recovery mapping.
- **Recovery output accepted but not consumed**: runner tests prove only delivery shape. SC-005 remains an outcome gate requiring a second real session and model behavior evidence.
- **Additive hook sources**: published plugin hooks stay disabled, user/repo hook sources are inspected in `/hooks`, and certification fails if more than one thoth-mem handler is enabled per event.
- **Trust invalidation after reinstall**: reinstalling changed hooks intentionally requires review of the new hash before smoke.
- **Path and platform failures**: `${PLUGIN_ROOT}` plus quoted commands are tested through a path with spaces on Windows. No shell-only dependency is introduced into the Node runner.
- **Canary contamination**: the certification data directory is explicit in MCP and lifecycle environment configuration; the published data tree is snapshotted and must remain byte-size/timestamp stable.
- **Rollback**: disable `thoth-mem@personal`, restore the timestamped config backup if needed, remove the canary-only environment values, and leave the published package/database intact. No data migration is performed.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Every planned verification preserves the existing six-tool MCP inventory and changes only lifecycle packaging and certification.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The design derives identity deterministically, persists through SQLite receipts, and adds no vector, graph, reranker, LLM, or network dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Official Codex parsing and stdout formatting remain adapter concerns; only host-neutral identity confidence crosses into lifecycle result classification.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Existing bounded recovery items are serialized once into `additionalContext`; no unbounded transcript or database dump is introduced.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The plan removes reliance on the accidental old contract, preserves user-owned published data, defines a clean reinstall, and has an explicit rollback without compatibility shims.
