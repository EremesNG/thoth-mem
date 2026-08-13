# CLI Contract: Safe Storage Administration

## `repair-sync-journal`

```text
thoth-mem repair-sync-journal (--project <name> | --all)
thoth-mem repair-sync-journal (--project <name> | --all) --apply [--expected-fingerprint <sha256>]
```

- Preview is the default and rejects apply-only preconditions.
- Apply without `--expected-fingerprint` obtains one preview and applies its exact fingerprint.
- Apply with `--expected-fingerprint` uses that value as the effective Store precondition; it is not ignored or replaced.
- `--effective-now` and `--until-complete` are invalid for this command.
- Stale or malformed fingerprints and Store failures exit non-zero without retry.

## `prune-operation-traces`

```text
thoth-mem prune-operation-traces (--project <name> | --all)
thoth-mem prune-operation-traces (--project <name> | --all) --apply
  [--expected-fingerprint <sha256> --effective-now <UTC-ISO>]
  [--until-complete]
```

- Preview is the default and rejects apply-only preconditions.
- Apply with neither binding obtains one internal preview and applies its exact pair.
- Apply with both bindings uses both as effective Store preconditions.
- Supplying only one binding is invalid and fails before Store apply.
- `--until-complete` requires `--apply`.
- The loop fixes the first effective instant, previews a fresh fingerprint for each later batch, preserves bounded-growth and no-progress guards, and reports already committed batch progress truthfully on failure.

## `compact-database`

```text
thoth-mem compact-database [--apply] [--data-dir <path>]
```

- Without `--apply`, the command is a read-only preview.
- `--apply` is the sole mutation confirmation; there is no implicit apply and no second confirmation flag.
- Project selectors, `--all`, repair/retention bindings, `--until-complete`, and positional arguments are invalid.
- The target must already exist at the pure resolved database path; the command never creates a missing data directory or database.
- Preview uses immutable SQLite access when neither sidecar exists, normal read-only only for a readable regular WAL/SHM pair, and fails without mutation for partial or ambiguous sidecar state.
- The packaged command enables better-sqlite3 URI processing before its first native constructor and verifies the immutable URI resolved to the exact real target. An embedding process that initialized the driver incompatibly receives a bounded non-zero error rather than a mutable fallback.
- The command is not registered as an MCP tool and has no HTTP route in this change.
- The command is independent: it never invokes or requires `prune-operation-traces` or `repair-sync-journal`; those remain separate commands with their own preview/apply semantics.

## Compaction output

Human-readable Markdown is followed by one bounded JSON object.

Preview includes:

- mode and absolute database path
- main/logical/WAL/SHM bytes and classified sidecar state
- page size, page count, freelist count
- estimated reclaimable and compacted bytes
- filesystem available and required bytes
- journal mode and whether compaction is currently worth attempting

Apply includes:

- mode (`apply` or `apply-no-op`)
- exact before/after metrics
- bytes reclaimed and duration
- checkpoint counters
- all post-validation results

The command prints success only after post-reopen validation. Errors go through the existing CLI stderr/non-zero boundary and must name the failed phase without dumping raw SQL, row payloads, or unbounded paths.

## Error classes

| Condition | Result |
| --- | --- |
| Missing/non-file database | Non-zero; no file or directory creation. |
| Read-only filesystem | Non-zero; no success claim. |
| Insufficient free space | Non-zero at the initial or refreshed post-checkpoint gate, always before `VACUUM`. |
| Partial, non-file, or unreadable preview sidecars | Non-zero before SQLite open; no sidecar creation or repair. |
| SQLite URI runtime unavailable or resolved target mismatch | Non-zero; no fallback open and no sidecar creation. |
| Busy `TRUNCATE` checkpoint | Non-zero before `VACUUM`. |
| Pre-integrity or foreign-key failure | Non-zero before `VACUUM`. |
| SQLite busy/locked during `VACUUM` | Non-zero; SQLite owns rollback/recovery. |
| Post-reopen identity/integrity/readability mismatch | Non-zero; preserve SQLite-owned files for diagnosis, with no compaction success or rollback claim. |
| Zero reclaimable pages | Zero exit with explicit no-op result and no checkpoint/`VACUUM`. |

## Unchanged public contracts

- Store repair apply still requires `expected_selection_fingerprint`.
- Store retention apply still requires `expected_selection_fingerprint` and `effective_now`.
- HTTP repair and retention apply bodies remain unchanged and explicit.
