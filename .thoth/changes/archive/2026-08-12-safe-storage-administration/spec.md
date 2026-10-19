# Feature Specification: Safe Storage Administration

**Change ID**: `safe-storage-administration`<br>
**Route**: Full<br>
**Status**: Ready for review

## Intent and scope

**Why**: Operators should not have to copy preview fingerprints and timestamps between safe administrative commands, and they need a supported way to return SQLite freelist space to the operating system without risking the only durable memory database.<br>
**Impact**: CLI apply commands for journal repair and trace retention become self-binding: they compute the authoritative preview inside the same process and pass its preconditions to the unchanged fail-closed Store apply API. Existing explicit CLI preconditions remain accepted when supplied. A new preview-first `compact-database` command performs guarded SQLite-managed `VACUUM` with preflight and post-verification. Store and HTTP apply contracts keep their explicit fingerprint and effective-time requirements.<br>
**Affected capabilities**: `cli`, `store`

## User stories

### US1 - Apply a repair without copying an internal fingerprint (Priority: P1)

As an operator, I can explicitly apply journal repair for one project or all projects without copying a fingerprint so that the CLI remains safe but practical.

**Independent test**: Seed a disposable repair candidate, invoke CLI apply without precondition flags, and observe that the CLI previews internally, applies exactly the bound batch, and rejects a concurrent candidate change without partial repair.

**Covers**: FR-001, SC-001

**Acceptance scenarios**:

1. **Given** a repairable unchanged scope, **When** the operator invokes `repair-sync-journal --apply` with exactly one scope, **Then** the CLI obtains an internal preview and applies its fingerprint through the existing Store precondition contract.
2. **Given** repair candidates change between the internal preview and Store apply, **When** apply re-evaluates the scope, **Then** it fails non-zero without repair writes and does not retry a different unreviewed batch.
3. **Given** the operator does not select apply, **When** repair runs, **Then** it remains a read-only preview.

### US2 - Prune a bounded or complete backlog without copying bindings (Priority: P1)

As an operator, I can explicitly prune one batch or the complete eligible trace backlog without copying a fingerprint or timestamp so that large retention operations remain safe and usable.

**Independent test**: Seed a disposable backlog larger than one configured batch, invoke apply with and without `--until-complete`, and verify internal first-preview binding, a fixed effective instant, bounded progress, exact deletion, and fail-closed interruption.

**Covers**: FR-002, SC-002

**Acceptance scenarios**:

1. **Given** an eligible trace scope, **When** the operator invokes `prune-operation-traces --apply`, **Then** the CLI creates one internal preview and applies exactly its fingerprint and effective instant.
2. **Given** an eligible backlog spans multiple batches, **When** the operator adds `--until-complete`, **Then** the first internal preview fixes the effective instant and each later batch uses a fresh internal fingerprint until no eligible rows remain.
3. **Given** candidates change, a Store apply fails, no progress occurs, or eligible work grows beyond the initial bounded batch count, **When** the loop detects it, **Then** it exits non-zero, reports completed work truthfully, and does not claim rollback of already committed batches.
4. **Given** apply is not selected, **When** the command runs, **Then** it returns the existing read-only preview.

### US3 - Compact a database with guarded failure handling (Priority: P1)

As an operator, I can preview and explicitly compact a thoth-mem database so that freed SQLite pages return to the operating system while failures never produce false success and pre-commit failures preserve the original through no mutation or SQLite recovery.

**Independent test**: Create a disposable WAL database with substantial freelist space, preview compaction, apply it, and verify size reduction, full integrity and schema preservation; inject failures at free-space, checkpoint, pre-validation, `VACUUM`, and post-reopen boundaries, proving pre-commit preservation separately from post-commit no-success reporting.

**Covers**: FR-003, FR-004, FR-005, FR-006, SC-003, SC-004, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** an existing database, **When** `compact-database` runs without apply, **Then** it performs no checkpoint, file creation, rename, deletion, or database mutation; uses an immutable open when no sidecars exist, normal read-only only when both readable WAL and SHM exist, and otherwise fails read-only; and reports page size, page count, freelist count, physical and logical size, estimated reclaimable bytes, journal mode, sidecar state, and available-versus-required free space.
2. **Given** a clean preflight and sufficient free space, **When** `compact-database --apply` runs, **Then** it estimates capacity from at least the greater of main-file and logical page bytes, checkpoints committed WAL state, rechecks capacity against refreshed metrics, verifies integrity, obtains SQLite write exclusivity, executes SQLite-managed `VACUUM`, reopens the database, verifies integrity, foreign keys, schema identity, journal mode, and durable readability, and reports exact before/after bytes.
3. **Given** another SQLite client prevents checkpoint or write exclusivity, **When** apply starts, **Then** it fails non-zero without claiming compaction or deleting any database file.
4. **Given** preflight, checkpoint, validation before `VACUUM`, or `VACUUM` before commit fails, **When** the command unwinds, **Then** no mutation or SQLite transaction recovery preserves the pre-operation logical database and the CLI never reports successful compaction.
5. **Given** verification fails after a committed `VACUUM`, **When** the command unwinds, **Then** the CLI exits non-zero, preserves the database and sidecar files for diagnosis, never reports successful compaction, and makes no claim that it restored the pre-operation physical database.
6. **Given** a custom data directory, **When** preview or apply runs, **Then** every database, sidecar, free-space check, and result path remains confined to that directory.

## Edge cases

- Repair or retention may have zero selected candidates; apply MUST return a truthful zero-change result without fabricating a stale error.
- Existing CLI `--expected-fingerprint` and `--effective-now` options remain optional compatibility inputs; when supplied they MUST remain effective preconditions and MUST never be ignored.
- Store and HTTP callers continue to require explicit preview preconditions and retain stale-conflict behavior.
- Retention `--until-complete` MUST keep the first preview's effective instant fixed even if wall-clock time advances.
- A concurrent write after the CLI preview MUST be detected by the Store transaction and MUST NOT be silently retried against a different candidate set.
- Compaction may encounter a missing database, read-only filesystem, insufficient free space, a busy WAL checkpoint, an external reader/writer, an interrupted SQLite transaction, or post-VACUUM validation failure.
- A smaller database may still be corrupt, foreign-key-invalid, schema-incompatible, or unreadable after reopen; size reduction alone is never sufficient validation.
- A database with zero reclaimable pages MUST preview truthfully and apply MUST avoid an unnecessary `VACUUM`.
- WAL/SHM handling MUST use SQLite checkpoint and connection APIs; the CLI MUST NOT raw-copy, rename, or delete live sidecar files.
- Preview with no sidecars MUST use an immutable SQLite open; preview with both readable WAL and SHM MAY use normal read-only; exactly one sidecar, a non-file sidecar, or unreadable sidecar state MUST fail before SQLite can create or repair a sidecar.
- The package MUST enable better-sqlite3 URI processing before the first native database constructor in the compact-command process. Immutable preview MUST verify that SQLite resolved the URI to the exact real target path; a process whose driver was already initialized incompatibly MUST fail read-only instead of degrading to a mutable open.
- Paired-sidecar preview MUST preserve database and WAL contents byte-for-byte and MUST preserve SHM path, file identity, and size. SQLite-managed volatile SHM read-mark bytes MAY change during normal read-only WAL access and are not durable database mutation.

## Functional requirements

- **FR-001 — Journal Repair CLI Administration**: `[MODIFIED cli]` The CLI MUST expose preview-first `repair-sync-journal` with exactly one project or all-projects scope and explicit `--apply`. Apply without a fingerprint MUST obtain a bounded preview internally and pass its exact fingerprint to the unchanged Store apply contract. A supplied fingerprint MUST remain an effective binding. Any stale or persistence failure MUST surface without retrying a different batch.
- **FR-002 — Trace Retention CLI Administration**: `[MODIFIED cli]` The CLI MUST expose preview-first `prune-operation-traces` with exactly one project or all-projects scope and explicit `--apply`, without requiring operator-supplied fingerprint or effective-time flags. Apply without those values MUST bind itself to one internal preview; supplied values MUST remain effective bindings. `--until-complete` MUST keep the first effective instant fixed, bind each subsequent batch to a fresh internal preview, emit compact progress and a final aggregate, and stop non-zero on stale state, failure, bounded-growth violation, or lack of progress.
- **FR-003 — Crash-Safe Database Compaction**: `[ADDED store]` The system MUST provide sidecar-safe read-only compaction inspection and explicit compaction apply for exactly one resolved database. The compact-command module MUST enable better-sqlite3 URI handling before its first native constructor, use and verify the exact immutable target for sidecar-free preview, and fail closed if URI semantics are unavailable. Apply MUST estimate free-space capacity from at least the greater of main-file and logical page bytes, checkpoint committed WAL state, recheck capacity before `VACUUM`, validate integrity and schema identity, obtain SQLite write exclusivity, execute SQLite-managed `VACUUM`, reopen and validate integrity, foreign keys, schema identity, journal mode, and representative durable readability, and rely on SQLite transaction recovery for failures before or during commit rather than application-level raw replacement.
- **FR-004 — Database Compaction CLI Administration**: `[ADDED cli]` The CLI MUST expose preview-first `compact-database` for the resolved data directory with explicit `--apply`, bounded human-readable and machine-copyable results, non-zero exit on validation, exclusivity, space, checkpoint, `VACUUM`, reopen, or recovery failure, and no project scope or MCP tool registration. It MUST remain independent and MUST NOT invoke, require, or imply `prune-operation-traces` or `repair-sync-journal`.
- **FR-005 — Verified Compaction Preconditions and Results**: `[ADDED store]` Compaction MUST report exact page, freelist, physical-size, logical-size, sidecar-state, journal, checkpoint, free-space, and before/after metrics; MUST check capacity before checkpoint and again from refreshed post-checkpoint metrics before `VACUUM`; MUST fail before `VACUUM` on integrity, space, or checkpoint precondition failure; MUST never manipulate database sidecars outside SQLite APIs; and MUST return success only after all post-compaction checks pass.
- **FR-006 — Live Database Compaction Requires Separate Authorization**: `[INTERNAL]` Repository implementation and automated verification MUST use disposable databases only and MUST NOT compact, checkpoint, lock, copy, rename, or otherwise mutate the operator's live data directory.

## Success criteria

- **SC-001** `[buildable]`: CLI repair tests prove preview remains read-only; apply succeeds with zero manual preconditions; the internal fingerprint reaches Store apply; supplied fingerprints remain effective; and concurrent drift or persistence failure exits non-zero with zero repair writes.
- **SC-002** `[buildable]`: CLI retention tests prove one-batch and until-complete apply require zero manual preconditions, keep one effective instant, bind every batch internally, report exact progress/aggregate counts, preserve ordinary preview behavior, and stop truthfully on stale, failure, growth, or no progress.
- **SC-003** `[buildable]`: Compaction preview on disposable databases performs zero durable writes and reports exact page/freelist/physical/logical/sidecar/capacity estimates; immutable preview leaves every tracked file byte-for-byte unchanged; paired WAL/SHM preview preserves database and WAL content plus SHM path, identity, and size while permitting only SQLite-managed volatile SHM read-mark changes; a fresh child process beginning with URI handling disabled proves the package initializer enables and honors immutable access before the first native constructor; and missing, partial, non-file, unreadable, URI-incompatible, or ambiguous targets fail read-only without sidecar creation.
- **SC-004** `[buildable]`: Successful disposable compaction reduces a database with at least 50% freelist space, preserves every durable table/index/trigger and representative row, passes `integrity_check` and `foreign_key_check`, and reopens in WAL mode with zero application-created replacement artifacts.
- **SC-005** `[buildable]`: Free-space checks before and after checkpoint, WAL checkpoint, pre-VACUUM integrity, and interrupted or failed `VACUUM` produce zero false-success results and preserve the pre-operation logical database through no mutation or SQLite recovery; injected post-reopen verification failure also produces zero false success and leaves all SQLite-owned files untouched for diagnosis without claiming rollback.
- **SC-006** `[buildable]`: Focused CLI, Store, sync repair, retention, HTTP regression, registry, build, and full Vitest gates pass with exactly six MCP tools.
- **SC-007** `[outcome]`: After separate authorization, production preview and compaction report estimated and exact physical-size changes separately, explain that additional page packing may exceed the freelist estimate, and preserve every durable memory and sync integrity check.

## Assumptions

- `--apply` itself is the explicit human confirmation; no second `--yes` flag is required.
- CLI simplification does not alter Store or HTTP request contracts; those surfaces keep explicit fingerprints and effective instants.
- Existing CLI precondition flags remain optional and effective for callers that still supply them.
- Compaction targets the entire resolved database and therefore accepts `--data-dir` but no project scope.
- SQLite-managed in-place `VACUUM` is preferred because SQLite performs the rebuild and original overwrite using its transaction journal/WAL; the application will not implement file replacement.
- A conservative free-space threshold requires at least twice `max(main_database_bytes, page_size * page_count)` before checkpoint and repeats from refreshed main/logical metrics after successful checkpoint and before `VACUUM`.
- No background compaction scheduler or automatic startup compaction is introduced.

## Dependencies

- Existing better-sqlite3 connection lifecycle and its process-start `SQLITE_USE_URI` switch, WAL pragmas, Store repair/retention preview and apply APIs, CLI parsing/dispatch, configuration resolution, and Node filesystem/process primitives.
- SQLite support for transactional `VACUUM`, integrity checks, foreign-key checks, WAL checkpointing, and write-lock enforcement.
- No new external runtime dependency.

## Out of scope

- Changing Store or HTTP repair/retention precondition schemas or stale-conflict semantics.
- Compacting an open database without exclusive access or forcibly terminating other processes.
- Automatic periodic compaction, startup compaction, or compaction as an implicit side effect of retention.
- Compacting individual projects, tables, indexes, or attached databases.
- Running trace retention or sync-journal repair as part of database compaction; all three commands remain independent administrative workflows.
- Application-managed stage, backup, lock, rename, or sidecar deletion protocols.
- Running the new command against `C:\Users\EremesNG\.thoth` during implementation or verification.
