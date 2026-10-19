# Research: Safe Storage Administration

## Question

How can `thoth-mem` return SQLite freelist pages to the operating system without creating a less safe application-managed database replacement protocol, and how can the CLI remove manual preview binding without weakening the Store concurrency contract?

## Repository evidence

- `Store.applySyncJournalRepair()` and `Store.applyOperationTraceRetention()` already re-evaluate selection inside an immediate transaction and compare the caller's fingerprint before writes. The Store APIs are the correct race boundary and remain unchanged.
- `src/cli.ts` currently requires operators to provide the same preview values the Store requires. The CLI can obtain those values from an internal preview and still use the existing fail-closed apply methods.
- `src/store/schema.ts` configures writable databases with WAL, a 5-second busy timeout, `synchronous=NORMAL`, and foreign keys enabled.
- `getConfig()` may materialize `config.json`, and normal Store construction may migrate a writable database. Compaction preview therefore requires a pure path resolver and a dedicated read-only SQLite connection.
- The MCP registry is intentionally fixed at six tools. Database compaction is an operator command, not an MCP workflow.

## SQLite evidence

### `VACUUM` behavior

The official SQLite `VACUUM` documentation states that ordinary deletes leave free pages in the database, `VACUUM` rebuilds the database to reclaim that space, and the final overwrite uses the same transactional rollback/WAL machinery as other database transactions. It can require up to twice the original database size in free space and fails when an open transaction, unfinished statement, or another connection prevents the required lock.

Source: https://www.sqlite.org/lang_vacuum.html

### WAL checkpoint behavior

The official `wal_checkpoint` documentation states that `TRUNCATE` checkpoints committed WAL content and truncates the WAL on success. Its first result column reports whether the checkpoint was blocked; a busy result must be treated as a failed precondition rather than ignored.

Source: https://www.sqlite.org/pragma.html#pragma_wal_checkpoint

### Read-only WAL behavior

SQLite documents three safe read-only WAL cases: existing readable `-wal` and `-shm` files, write permission that permits those files to be created, or an immutable database open. Because preview forbids writes, it cannot rely on the second case.

Source: https://www.sqlite.org/wal.html#readonly

### Installed better-sqlite3 URI boundary

The installed better-sqlite3 12.10.0 native build defines `SQLITE_USE_URI=0`, does not pass `SQLITE_OPEN_URI` to individual connections, and calls `sqlite3_config(SQLITE_CONFIG_URI, 1)` only when the `SQLITE_USE_URI=1` process environment variable is present during one-time native addon initialization. The JavaScript package defers native addon loading until the first `Database` constructor, so a module evaluated before that first constructor can own this boundary.

Evidence: `node_modules/better-sqlite3/deps/defines.gypi`, `node_modules/better-sqlite3/src/addon.cpp`, `node_modules/better-sqlite3/src/better_sqlite3.cpp`, and `node_modules/better-sqlite3/lib/database.js`.

SQLite URI source: https://www.sqlite.org/uri.html

### File manipulation hazard

SQLite documents that the database and its journal/WAL state form a coordinated persistence unit. Swapping or copying a live main file independently of its current journal state can lose transactions or corrupt the database.

Source: https://www.sqlite.org/howtocorrupt.html

## Decisions

1. Use SQLite-managed in-place `VACUUM`; do not implement `VACUUM INTO` plus application-level rename, backup, or sidecar deletion.
2. Evaluate a small compact-runtime initializer before importing or constructing better-sqlite3 in the compaction module. It sets `SQLITE_USE_URI=1` unconditionally for the fresh CLI process before native addon initialization. A fresh-process test starts with the variable disabled, imports the module, and proves immutable URI handling works. If another embedder initialized the addon incompatibly before this module, the immutable open/path proof fails closed.
3. Resolve the target without `getConfig()` or directory creation, then classify sidecars before SQLite open. With no sidecars, use an immutable file URI plus file-must-exist/read-only semantics and require `PRAGMA database_list` to resolve the exact real target path. With both readable regular WAL and SHM files, use normal read-only. With a partial, non-file, unreadable, or URI-incompatible state, fail before mutation. Re-stat the directory afterward to prove preview created nothing.
4. Run apply through one dedicated writable connection. Before checkpoint, require free bytes of at least twice `max(main_database_bytes, page_size * page_count)`. After a successful `TRUNCATE` checkpoint, refresh physical/logical metrics and filesystem capacity and enforce the threshold again before `VACUUM`. Validate integrity, foreign keys, schema identity, and durable table counts before and after `VACUUM`.
5. Treat `VACUUM` itself as the SQLite exclusivity boundary. Do not create a separate lock file or introduce a check-then-use lock gap.
6. Reopen a fresh connection after apply and report success only after post-compaction checks pass and WAL mode is restored.
7. Skip `VACUUM` truthfully when the preview reports zero reclaimable pages.
8. Keep Store and HTTP repair/retention preconditions explicit. Only the CLI obtains bindings internally when the operator omits them.
9. Preserve existing CLI binding options as optional, effective preconditions. If a retention caller supplies one member of the fingerprint/effective-time pair, reject the partial pair.
10. Never retry a stale first apply against a fresh, unreviewed candidate set. In `--until-complete`, later batches are intentionally new internal previews bound to the first effective instant.

## Rejected alternatives

- **Raw copy plus sidecar copy**: unsafe under concurrent WAL activity and creates a complex recovery protocol.
- **`VACUUM INTO` plus atomic replacement**: produces a compact snapshot but application-level replacement has an exclusivity gap and Windows rename/recovery edge cases not owned by SQLite.
- **Automatic compaction after retention**: combines two separately destructive operations and removes operator control.
- **Removing legacy binding flags**: unnecessary breaking CLI change; optional compatibility inputs provide the requested simplification without ignoring an operator's explicit precondition.

## Residual constraints

- Compaction can be disk- and time-intensive and may block writers.
- A post-reopen validation failure is reported as failure; the implementation does not claim application-level rollback after SQLite has committed a valid `VACUUM`.
- SQLite recovery preserves failures before or during transactional `VACUUM` commit; it does not restore a prior physical file after a committed operation later fails application validation.
- Automated verification uses disposable temporary databases only. Running against the operator's live data requires separate authorization.
