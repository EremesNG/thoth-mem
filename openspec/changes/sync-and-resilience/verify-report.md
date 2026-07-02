# sync-and-resilience verification

- Verdict: BLOCKED
- Date: 2026-07-02
- Critical issue: Spec drift against current compact MCP contract (Constitution P1 and active MCP registry).
- Evidence anchors:
  - `openspec/changes/sync-and-resilience/specs/tools/spec.md` contains added requirements for MCP tools `mem_search`, `mem_sync_export`, and `mem_sync_import`.
  - `openspec/changes/sync-and-resilience/specs/sync/spec.md` requires sync tool behavior changes that imply sync capability on MCP surface.
  - `openspec/changes/sync-and-resilience/tasks.md` includes tool registration scope item `4.4 Update tool exposure updates in src/tools/index.ts and tests/tools/registry.test.ts (ensure sync tools are intentionally exposed)`.
  - `src/tools/index.ts` currently registers exactly six MCP tools: `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, `mem_session`.
  - `tests/tools/registry.test.ts` enforces the compact six-tool surface and explicitly rejects legacy/sync/admin MCP tools.
  - `openspec/memory/constitution.md` P1 requires the MCP surface to remain exactly six tools and places admin/sync operations on CLI/HTTP.
- Decision: do not archive this change until scope is aligned to the compact six-tool surface and legacy sync tool registration requirements are re-scoped.