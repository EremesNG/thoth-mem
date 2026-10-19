# Data Model: Safe Storage Administration

## CLI binding state

### Repair

| Mode | Supplied fingerprint | CLI action |
| --- | --- | --- |
| Preview | No | Call Store preview only. |
| Preview | Yes | Reject before opening Store. |
| Apply | No | Preview once, then pass that fingerprint to Store apply. |
| Apply | Yes | Pass the supplied fingerprint directly to Store apply. |

### Retention

| Mode | Supplied fingerprint/effective instant | CLI action |
| --- | --- | --- |
| Preview | Neither | Call Store preview only. |
| Preview | Either or both | Reject before opening Store. |
| Apply | Neither | Preview once, then apply that exact pair. |
| Apply | Both | Apply the supplied pair directly. |
| Apply | Partial pair | Reject before opening Store. |

For `--until-complete`, the first pair is either supplied or internally previewed. Its `effective_now` remains fixed. Every later iteration previews with that fixed instant and applies the new exact fingerprint. The existing maximum-batch and no-progress guards remain authoritative.

## Compaction metrics

`DatabaseCompactionMetrics` is a bounded, JSON-safe snapshot:

| Field | Type | Meaning |
| --- | --- | --- |
| `database_path` | string | Absolute resolved path to the existing `thoth.db`. |
| `database_bytes` | number | Main database file size at the snapshot boundary. |
| `logical_database_bytes` | number | `page_size * page_count`, including committed logical growth visible through WAL. |
| `wal_bytes` | number | WAL file size, or zero when absent. |
| `shm_bytes` | number | SHM file size, or zero when absent. |
| `page_size` | number | SQLite page size. |
| `page_count` | number | SQLite main database page count. |
| `freelist_count` | number | Pages currently on the freelist. |
| `reclaimable_bytes` | number | `page_size * freelist_count`. |
| `estimated_compacted_bytes` | number | `max(page_size, logical_database_bytes - reclaimable_bytes)`; an estimate because `VACUUM` can pack partially filled pages too. |
| `filesystem_free_bytes` | number | Free bytes available on the target filesystem. |
| `required_free_bytes` | number | Conservative `2 * max(database_bytes, logical_database_bytes)` apply threshold. |
| `journal_mode` | string | Current SQLite journal mode, expected `wal`. |
| `wal_present` | boolean | Whether the WAL path exists. |
| `shm_present` | boolean | Whether the SHM path exists. |
| `sidecar_state` | `'none' | 'wal-and-shm'` | Safe preview state selected before SQLite open; partial/ambiguous states fail instead of producing metrics. |

## Compaction results

### Preview

`DatabaseCompactionPreview` contains:

- `dry_run: true`
- `can_compact: boolean`, true only when reclaimable pages exist and the free-space threshold is met
- `no_op_reason: 'no-reclaimable-pages' | null`
- `metrics: DatabaseCompactionMetrics`

Preview does not promise that apply will succeed: checkpoint and exclusivity are re-evaluated only during explicit apply.

Preview open policy is deterministic:

- `none`: open an immutable SQLite URI so the driver cannot create WAL/SHM state.
- `wal-and-shm`: require both sidecars to be readable regular files and use a normal read-only, file-must-exist connection.
- any partial, non-file, or unreadable sidecar state: fail before opening SQLite.

The directory entry set is unchanged after preview. Immutable preview preserves every tracked content hash and size. Paired WAL/SHM preview preserves database and WAL hashes and preserves SHM path, file identity, and size; SQLite-managed volatile SHM read-mark bytes may differ because SHM is lock/index coordination state rather than durable database content.

Before the first native better-sqlite3 constructor in the compact-command process, a dedicated runtime initializer sets `SQLITE_USE_URI=1`. Immutable open success also requires `PRAGMA database_list` to resolve the main database to the same real path as `database_path`; mismatch or open failure is `uri-runtime-unavailable`, never a fallback to ordinary read-only.

### Apply

`DatabaseCompactionResult` contains:

- `dry_run: false`
- `skipped: boolean`
- `skip_reason: 'no-reclaimable-pages' | null`
- `before` and `after` metrics
- `reclaimed_bytes: max(0, before.database_bytes - after.database_bytes)`
- `duration_ms`
- checkpoint counts: `busy`, `log`, and `checkpointed`
- checks: pre/post integrity status, pre/post foreign-key violation counts, schema identity preservation, durable count preservation, and final journal mode

Success is not returned until a fresh post-`VACUUM` connection produces the complete result. A no-op result has identical before/after metrics, zero reclaimed bytes, and no checkpoint or `VACUUM` mutation.

## Validation identity

### Schema identity

Build a SHA-256 digest from ordered rows of `sqlite_schema` using `type`, `name`, `tbl_name`, and normalized nullable `sql`, plus `PRAGMA user_version` and `PRAGMA application_id`. The before and after digests must match.

### Durable count identity

Collect exact row counts for every non-internal, non-virtual application table discovered from `sqlite_schema`, quoted as identifiers rather than interpolated unchecked. The before and after ordered table/count map must match. Virtual tables and their shadow tables are covered by schema identity, `integrity_check`, and normal readability rather than unstable implementation-detail counts.

## State transitions

```text
missing target -> fail without creation
existing target -> classify sidecars -> immutable or paired read-only preview -> report
existing target + apply + no reclaimable pages -> successful no-op
existing target + apply -> logical capacity check -> checkpoint -> refreshed capacity check -> pre-checks
  -> VACUUM obtains SQLite lock and commits transactionally
  -> close -> reopen -> post-checks -> success
precondition or pre-commit failure -> non-zero, no mutation or SQLite recovery preserves prior logical state
post-commit verification failure -> non-zero, preserve files for diagnosis, no success or rollback claim
```

## Invariants

- The target is one absolute `thoth.db` under the resolved data directory.
- Preview never creates the directory, database, configuration, checkpoint, or sidecar and never uses normal read-only with a partial sidecar set. It never changes durable database/WAL content; paired read-only access may change only volatile SHM read-mark bytes while preserving that file's identity and size.
- Immutable preview never runs without process-level URI enablement and exact post-open target verification.
- The application never copies, renames, replaces, or deletes the database, WAL, or SHM files.
- Apply never runs against an in-memory database.
- Store/HTTP binding types do not change.
- Exactly six MCP tools remain registered.
