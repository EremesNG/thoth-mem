# Proposal: Sync and Resilience for thoth-mem

## Intent
Deliver a reliability-focused persistence upgrade that removes version drift, makes `topic_key` retrieval first-class, and makes sync converge correctly across machines (including deletes) without repeatedly exporting/importing the full dataset.

## Scope
### In Scope
- Unify runtime version reporting so `package.json` is the single source of truth for:
  - CLI version/help output (`src/cli.ts`)
  - MCP server version (`src/server.ts`)
  - OpenAPI info version (`src/http-openapi.ts`)
- Extend observation search/indexing with `topic_key` support by:
  - Adding `topic_key` to `observations_fts`
  - Rebuilding FTS safely via migration
  - Adding an exact `topic_key` lookup path that bypasses FTS for exact-match requests
- Add incremental sync state tracking with a new `sync_chunks` table to:
  - Record exported chunks
  - Record imported chunks
  - Export only new data since the last export cursor
  - Skip already-processed chunks during import (chunk ID and/or content hash)
- Add deletion-aware convergence via `sync_mutations` journal and tombstones:
  - Record create/update/delete mutations
  - Emit tombstones in new sync chunks so remote soft-deletes converge
  - Keep importer backward-compatible with legacy chunks that do not include tombstones
- Replace blind/exception-driven migration style with explicit migration helpers, including:
  - `addColumnIfNotExists`-style helper(s)
  - FTS rebuild helper(s) for schema changes
  - idempotent, deterministic startup migrations

### Out of Scope
- Tool profile flags (`--tools`) and tool-surface segmentation changes.
- Plugin/adaptor lifecycle systems for specific agent platforms.
- TUI or other interactive terminal UX work.
- Introducing a separate `mem_session_end` tool.
- Silent truncation behavior changes.
- Replacing SQLite/better-sqlite3 or changing the project to a non-ESM module system.

## Approach
1. **Version source-of-truth consolidation**
   - Introduce a shared version accessor module consumed by CLI, server bootstrap, and OpenAPI generation.
   - Ensure there are no hardcoded semantic version literals in runtime surfaces beyond package metadata.
   - Add regression tests that assert all public version surfaces match `package.json`.

2. **`topic_key` FTS + exact lookup shortcut**
   - Update FTS virtual table definition and triggers to include `topic_key`.
   - Execute a controlled FTS rebuild migration (`drop/create/repopulate`) under transaction boundaries where safe.
   - Extend search flow so exact `topic_key` requests use indexed SQL (`WHERE topic_key = ?`) before any FTS query.
   - Keep existing FTS search behavior for non-exact queries.

3. **Incremental sync with chunk tracking**
   - Add `sync_chunks` table to track local chunk metadata (`chunk_id`, hash, direction, created_at, status).
   - Move sync export from snapshot-based (`exportData`) to mutation-window-based selection.
   - Export path computes delta since last successful export watermark and writes only new mutations.
   - Import path records processed chunks and skips previously-seen chunk IDs/hashes.
   - Keep manifest compatibility for file ordering, but rely on DB state for idempotent chunk processing.

4. **Mutation journal + tombstones**
   - Add `sync_mutations` table with ordered mutation IDs and operation types (`create`, `update`, `delete`).
   - Write journal rows from observation/prompt create/update/delete code paths.
   - New chunk format (v2) carries mutation records, including tombstones for deletes.
   - Importer supports both:
     - Legacy full-export chunk shape (no tombstones)
     - New mutation chunk shape (with tombstones)
   - Tombstone application performs idempotent soft-delete propagation by stable record identity (`sync_id`).

5. **Structured migrations and safety**
   - Replace current `try ALTER ... catch ignore` pattern with explicit schema introspection.
   - Implement reusable migration helpers (column existence checks, table existence checks, FTS rebuild).
   - Version migration steps and keep them re-runnable without side effects.
   - Add migration-focused tests for fresh DB, partially-migrated DB, and fully-migrated DB scenarios.

## Affected Areas
- `package.json` — canonical version source.
- `src/cli.ts` — version/help output wired to shared version source.
- `src/server.ts` — MCP server version wiring.
- `src/http-openapi.ts` — OpenAPI `info.version` wiring.
- `src/store/schema.ts` — FTS schema update, new sync tables, explicit migration definitions/helpers.
- `src/store/index.ts` — exact `topic_key` query path, mutation journal writes, structured migration execution.
- `src/sync/index.ts` — delta export logic, chunk dedupe tracking, v1/v2 chunk import compatibility, tombstone handling.
- `src/config.ts` — optional sync/migration toggles only if required for safe rollout.
- `tests/**` — coverage for version consistency, migration idempotency, incremental export/import, and delete convergence.

## Risks
- **FTS rebuild risk**: incorrect rebuild could temporarily degrade search accuracy.
  - *Mitigation*: deterministic rebuild helper + post-rebuild row-count sanity checks.
- **Sync divergence risk**: incorrect mutation ordering may cause stale updates or delete conflicts.
  - *Mitigation*: strictly ordered mutation IDs and idempotent apply semantics.
- **Backward-compatibility risk**: mixed old/new chunk repositories may parse inconsistently.
  - *Mitigation*: explicit chunk version detection with dual-path import parser.
- **State inflation risk**: mutation/chunk tables can grow over time.
  - *Mitigation*: scoped retention/compaction policy defined in follow-up ops guidance.
- **Operational complexity risk**: more moving pieces during startup migrations.
  - *Mitigation*: helper-based migrations with exhaustive tests on repeated startup.

## Rollback Plan
1. Keep legacy chunk reader path active permanently so old data remains importable.
2. If delta sync causes instability, switch export path to legacy full-snapshot generation while leaving import dual-format support intact.
3. If mutation-journal application causes issues, disable mutation-based export selection and fall back to `exportData` semantics.
4. If FTS migration regresses search, rebuild `observations_fts` using the prior schema and rely on indexed exact `topic_key` lookup until fixed.
5. Recovery procedure: restore from SQLite backup, re-run startup with stable build, then re-import sync directory incrementally.

## Success Criteria
- All externally visible versions (CLI, MCP server, OpenAPI) match `package.json` with no hardcoded drift.
- Exact `topic_key` search path resolves through indexed lookup and does not require FTS tokenization.
- Re-running export without new mutations produces no data replay (delta-only behavior).
- Re-importing previously processed chunks produces no duplicate records and reports them as skipped.
- Deletes made on one node propagate as tombstones and converge as soft-deletes on another node.
- Startup migrations are idempotent across repeated runs and across pre-existing databases at different schema states.
