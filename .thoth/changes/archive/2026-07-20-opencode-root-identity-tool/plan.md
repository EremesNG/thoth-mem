# Implementation Plan: OpenCode root identity tool

## Technical context

The published OpenCode entry point is the JavaScript plugin factory in `integrations/opencode/plugin.mjs`. It already derives project context, classifies immediate root/delegated sessions through `client.session.get`, and owns lifecycle hooks, but it exposes no model-callable `tool` entry. OpenCode 1.18.x accepts raw plugin tool definitions shaped as `{ description, args, execute }`; execution context supplies the active `sessionID`, `directory`, and `worktree`.

This change adds one identity-only native plugin tool without touching the six-tool MCP server, persistence, lifecycle dispatcher, setup layout, or inventory. Root resolution is a bounded read of the OpenCode session graph. The public verification seam is `loadPlugin()` → `createOpenCodePlugin()` → returned `hooks.tool.thoth_mem_root_identity.execute(...)` in `tests/integration/opencode-runtime.test.ts`.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the change adds an OpenCode-native plugin tool, not an MCP registration; the six MCP tools remain unchanged.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — no retrieval lane changes; identity traversal is local, deterministic, bounded, and fails closed.
- **P3 — Harness-Agnostic Memory Contract**: PASS — OpenCode-specific `sessionID`/`parentID` handling remains inside `integrations/opencode/plugin.mjs` and does not enter storage or host-neutral lifecycle schemas.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — recall behavior is untouched; the new JSON output has a fixed field set, bounded identifiers, bounded ancestry depth, and bounded reason codes.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — `thoth_mem_root_identity` and schema `thoth-mem.opencode.identity.v1` are additive, versioned contracts with no rename or removal.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001, SC-001 | Add exactly one raw OpenCode tool definition named `thoth_mem_root_identity` with `args: {}` to the plugin return object. Avoid a runtime dependency on `@opencode-ai/plugin` because its `tool()` helper returns the same definition unchanged. | `integrations/opencode/plugin.mjs`; returned plugin `tool` map | Assert the loaded factory exposes exactly the expected tool ID and zero args. |
| FR-002, SC-002 | Serialize deterministic JSON with schema `thoth-mem.opencode.identity.v1`. Verified results contain status, root/caller IDs, caller role, project, and authorization. Root callers use `authorization: "root_lifecycle"`; delegated callers use `authorization: "none"`. | Plugin identity-result helper and tool `execute` | Parse output and compare complete fixed objects for root and nested delegated callers. |
| FR-003, SC-003 | Resolve from the invoking session to the root through `client.session.get`, validating each requested/returned ID, following only bounded `parentID` values, tracking visited IDs, and stopping at a fixed maximum depth. An absent `parentID` proves the root; malformed presence does not. | Plugin-local ancestry resolver; existing `isRecord` and identifier validation | Table-driven public-tool tests for unavailable lookup, missing data, mismatched IDs, malformed/broken links, cycle, and depth overflow. |
| FR-004, SC-002 | Preserve the original invoking ID while returning the terminal root ID. Derive `caller_role` from whether traversal occurred; delegated results expose root identity but always deny lifecycle authorization. | Tool result mapping | A 2-level delegated-chain test asserts root ID, original caller ID, role, project, and `authorization: "none"`. |
| FR-005, SC-004 | Keep tool execution separate from `ensureEnrollment`, `emitEffect`, and `dispatch`; it performs session reads and pure serialization only. Existing lifecycle hooks remain unchanged. | `integrations/opencode/plugin.mjs`; injected dispatch spy | Execute root/delegated tools and assert zero dispatch requests, then retain existing lifecycle suite as regression evidence. |
| FR-006, SC-003 | Return schema-versioned degraded JSON with one stable reason code and `authorization: "none"`; omit root/caller/project fields unless the full identity is verified. Catch lookup failures without exposing host error text. | Plugin degraded-result helper | Exact-object assertions for every failure class and explicit absence of `root_session_id`. |
| SC-005 | Run focused OpenCode runtime tests first, then integration/package verification, build, and full Vitest suite. | `tests/integration/opencode-runtime.test.ts`; package scripts | Command results recorded in Oracle verification. |
| SC-006 | Do not perform real-host installation in this change. Record reinstall/restart confirmation as an outcome criterion with explicit residual risk until separately authorized and observed. | `verify-report.md`, `archive-report.md` | Outcome disposition only; no fake implementation task. |

### Implementation structure

1. Add stable constants for the schema and ancestry bound near existing OpenCode bounds.
2. Add small plugin-local pure serializers for verified and degraded JSON.
3. Inside `ThothMemory(context)`, add a read-only ancestry resolver using the existing client call shape and project derivation helpers. Keep the existing immediate `resolveSessionKind` lifecycle path unchanged to minimize regression risk.
4. Register `thoth_mem_root_identity` in the returned `tool` map. The execute callback validates the invocation context, resolves the root, derives a bounded project name from plugin/tool context, and returns only the versioned JSON string.
5. Extend the test-only `OpenCodeHooks` interface with the public tool shape and implement TDD in vertical slices: root success, delegated success, then failure classes.

### Optional support artifacts

- `research.md`: Not needed; current OpenCode 1.18.x tool and `ToolContext` source contracts were already confirmed during requirements discovery.
- `data-model.md`: Not needed; no persistent or in-memory domain model changes beyond bounded local traversal state.
- `contracts/`: Not needed; the exact v1 JSON object is normative in `spec.md` and asserted as a complete object at the public tool seam.
- `quickstart.md`: Not needed; real-host installation and reference guidance are explicitly deferred.

## Risks and migrations

- **Root leakage grants perceived authority**: delegated output intentionally includes the root ID per user decision, but always carries `caller_role: "delegated"` and `authorization: "none"`; tests assert the complete object.
- **Malformed ancestry loops or fans out**: traversal follows one parent only, uses a visited set and a fixed depth bound, and returns degraded output on every inconsistency.
- **Lifecycle regression**: the new resolver does not reuse or modify enrollment/dispatch state; existing lifecycle tests remain unchanged and must pass.
- **Tool ID collision**: use the stable namespaced ID `thoth_mem_root_identity`; expose exactly one definition.
- **Project disclosure**: output includes only the derived project basename, never directory, worktree, session title, transcript, or host error text.
- **Compatibility**: raw definitions avoid a new runtime import. Package inventory/layout does not change because the existing `plugin.mjs` asset is already declared and delivered.
- **Migration**: none. Existing installations gain the tool only after a separately authorized reinstall/restart.
- **Rollback**: remove the tool map, ancestry/result helpers, focused tests, and this additive durable requirement delta; no persisted data or setup receipt migration is involved.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — design contains no MCP registration or schema change and explicitly verifies the existing six-tool surface remains intact.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — no retrieval dependency is introduced; all identity failures map deterministically to bounded degraded output.
- **P3 — Harness-Agnostic Memory Contract**: PASS — native session graph traversal and tool registration remain entirely at the OpenCode adapter/plugin boundary.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — no recall output changes; identity output is structurally bounded and contains no transcript or path dump.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — the plan introduces one additive v1 contract with exact tests and no compatibility removal.
