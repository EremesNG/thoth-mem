# Implementation Plan: Safe Storage Administration

## Technical context

The existing repair and retention Store methods already own the concurrency guarantee: apply re-evaluates the selected batch inside an immediate transaction and rejects a stale fingerprint before mutation. The usability problem is confined to `src/cli.ts`, which currently forces an operator to copy preview values manually. The CLI can obtain those values internally without weakening Store or HTTP contracts. Existing binding flags remain optional, effective compatibility inputs rather than being removed or ignored.

Deleting almost one million operation traces demonstrated the separate SQLite behavior this change addresses: deletion makes pages reusable but does not return them to the filesystem when `auto_vacuum` is disabled. The supported compaction surface must avoid opening a normal writable Store during preview, avoid raw manipulation of the coordinated database/WAL/SHM files, and avoid application-level replacement. A dedicated Store-domain module will use SQLite's own transactional `VACUUM`, checkpoint API, locking, and recovery, with conservative capacity checks and pre/post validation.

The implementation stays within strict TypeScript/ESM, Node 22 filesystem APIs, `better-sqlite3`, existing CLI dispatch, and the six-tool MCP registry. It adds no dependency, HTTP route, dashboard action, scheduler, automatic maintenance, or live-data execution.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — `compact-database` is CLI-only and repair/retention remain existing CLI/Store workflows; registry tests keep exactly six MCP tools.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Retrieval code is untouched. Administrative selections remain deterministic and compaction validation is fail-closed rather than a retrieval degradation path.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The design is host-neutral and changes no lifecycle adapter, memory format, sync envelope, or host-specific contract.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall remains unchanged; all new administrative output is a fixed-size metrics/result object with no row payloads.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The new command is additive. Existing CLI binding flags remain accepted and effective, while Store and HTTP schemas remain unchanged.

## Design

### 1. Preserve Store precondition ownership and simplify only the CLI

- Relax `parseAdminOptions()` in `src/cli.ts` so repair apply accepts an optional fingerprint and retention apply accepts either no bindings or the complete fingerprint/effective-time pair. Preview still rejects apply-only inputs; repair still rejects retention-only options; a partial retention pair fails before Store opening.
- Repair apply without a fingerprint calls `previewSyncJournalRepair()` once and passes that exact fingerprint into `applySyncJournalRepair()`. A supplied fingerprint goes directly to Store apply.
- Retention apply without bindings calls `previewOperationTraceRetention()` once and passes that pair into `applyOperationTraceRetention()`. A supplied complete pair goes directly to Store apply.
- Preserve the current fail-closed boundary: a stale first apply is not silently previewed and retried. `--until-complete` intentionally obtains later previews only after a committed batch, keeps the first `effective_now`, and keeps the existing bounded-growth and no-progress guards.
- Keep `src/store/types.ts`, Store apply signatures, HTTP validation, OpenAPI, and stale conflict semantics unchanged for these two workflows.

### 2. Resolve a compaction target without mutation

- Extract a small pure path resolver in `src/config.ts` that uses the existing home/environment/data-directory precedence and returns absolute `dataDir` and `dbPath` values without loading or materializing persisted configuration.
- Make `getConfig()` consume that resolver so ordinary behavior retains the same precedence. The compact command uses only the pure resolver and never calls `resolveDataDir()`.
- A missing, non-file, or non-SQLite target fails without creating the directory, database, `config.json`, or sidecars.

### 3. Add bounded Store-domain compaction inspection

- Add explicit exported result types in `src/store/types.ts`, a tiny `src/store/sqlite-uri-runtime.ts` initializer, and a focused `src/store/compaction.ts` module. The module accepts one resolved database path rather than a Store instance because normal Store startup can migrate and a live Store connection conflicts with `VACUUM` lifecycle requirements.
- Import the initializer before better-sqlite3 in the compaction module. It sets `SQLITE_USE_URI=1` before the fresh CLI process performs its first native `Database` construction, matching the installed driver's one-time configuration seam. This does not remove the runtime check: a host that initialized the addon earlier with URI handling disabled must fail closed.
- Classify the WAL/SHM paths before opening SQLite. When neither exists, open through an immutable file URI so SQLite cannot create sidecars. When both are readable regular files, use normal `readonly` plus `fileMustExist` so committed WAL content is visible. Reject partial, non-file, unreadable, or otherwise ambiguous sidecar state before SQLite open.
- After immutable open, query `PRAGMA database_list`, resolve its main-file path, and require equality with the real target path. Open failure or mismatch becomes a bounded URI-runtime error; never retry using normal read-only.
- Read page size/count/freelist, journal mode, main/WAL/SHM sizes, and target-filesystem free space. Report logical database bytes as page size times page count, reclaimable bytes as page size times freelist pages, and conservative required free bytes as twice the greater of main-file and logical database bytes.
- Preview performs no checkpoint, pragma assignment, schema migration, directory creation, file replacement, or application-managed sidecar manipulation. It re-stats directory entries and tracked files after close. Immutable preview requires byte-for-byte equality for every tracked file; paired WAL/SHM preview requires byte-for-byte equality for the database and WAL plus stable SHM path, identity, and size, while allowing SQLite's volatile SHM read-mark bytes. It returns a fixed-size JSON-safe object and fails if its durable zero-write invariant cannot be demonstrated.
- When the freelist is empty, apply returns an explicit no-op without checkpointing or executing `VACUUM`.

### 4. Apply compaction through SQLite's transaction and lock boundary

- Open one dedicated writable, file-must-exist connection. Set bounded busy timeout and foreign-key checking for the connection; do not open a normal Store concurrently.
- Re-evaluate metrics and fail before checkpoint if available target-filesystem space is below twice the greater of main-file bytes and logical page bytes, so committed growth visible only in WAL is included.
- Execute `PRAGMA wal_checkpoint(TRUNCATE)` and require the busy result to be zero. Refresh main-file/page metrics and filesystem free space after checkpoint, enforce the conservative capacity threshold again before `VACUUM`, and treat checkpoint disk exhaustion as failure. No direct WAL/SHM copy, truncate, rename, or delete is permitted.
- Before `VACUUM`, require `PRAGMA integrity_check` to return only `ok`, require zero `foreign_key_check` rows, compute a stable SHA-256 schema identity from ordered `sqlite_schema` rows plus application/user versions, and capture exact counts for every non-internal, non-virtual application table.
- Execute ordinary `VACUUM`. SQLite itself acquires the necessary write/schema lock and transactionally rebuilds and overwrites the database; busy/locked/interrupted execution is an error and SQLite owns rollback/recovery.
- Close and reopen a fresh connection, restore/confirm WAL mode, checkpoint any committed post-VACUUM WAL, repeat integrity and foreign-key checks, and require identical schema identity and durable table counts. Only then return success with exact before/after metrics, checkpoint counters, reclaimed bytes, duration, and validation flags.
- Any failed phase throws a bounded contextual error and never returns success. Preflight and pre-commit failures preserve the prior logical state through no mutation or SQLite transaction recovery. A post-reopen validation failure preserves all SQLite-owned files for diagnosis but does not claim it can undo a committed `VACUUM` or restore the prior physical file.

### 5. Add the public CLI command without expanding MCP/HTTP

- Add `compact-database` help, parsing, handler, and dispatch in `src/cli.ts`, plus command detection in `src/index.ts`.
- Grammar is `compact-database [--apply] [--data-dir <path>]`. Reject project/all scope, extra positionals, repair/retention bindings, and `--until-complete` before opening SQLite.
- Keep compact apply independent: it calls only the compaction Store-domain module and never previews or applies trace retention or sync-journal repair. Those commands retain their separate simplified CLI handlers.
- Print bounded Markdown followed by one machine-copyable JSON object. Preview names estimates; apply names exact before/after values and every completed validation. All failures flow through the existing CLI non-zero boundary.
- Update `README.md` and canonical CLI/Store specifications. Add no MCP tool, route, OpenAPI schema, or dashboard control.

### 6. TDD, simplification, and verification seams

Behavior is implemented red-first in vertical slices:

1. CLI repair tests prove apply without a fingerprint internally previews and passes the exact binding, while an explicitly supplied stale value remains effective and fails without retry.
2. CLI retention tests prove apply without bindings, multi-batch fixed-time binding, partial-pair rejection, supplied-pair preservation, and truthful stale/failure/no-progress termination.
3. Compaction preview tests use temporary databases and snapshots to prove exact metrics and zero durable mutation: immutable state preserves every tracked byte; paired WAL/SHM state preserves database/WAL content and SHM path, identity, and size while permitting only volatile SQLite read-mark bytes. Partial/non-file/unreadable sidecars, missing target, and zero-freelist cases fail or report as specified. A spawned fresh Node process starts with `SQLITE_USE_URI=0`, imports the TypeScript compaction module before any native constructor, and proves initialization, exact-path verification, immutable access, and zero sidecar creation. A separately preinitialized-incompatible child proves bounded fail-closed behavior.
4. Compaction apply tests create substantial freelist space and a separate large uncheckpointed-WAL case, prove physical shrinkage and full validation, and inject both capacity gates, busy checkpoint, integrity, `VACUUM`, and post-reopen failures. Pre-commit cases assert prior logical-state preservation; post-commit validation injection asserts non-zero/no-success and untouched SQLite-owned files without a rollback claim. Every fixture is disposable; no command targets the operator's live directory.
5. CLI compaction tests prove grammar, preview/apply output, pure target resolution, no creation on missing paths, and non-zero contextual failures.
6. Index/registry tests prove command dispatch and exactly six MCP tools. HTTP regression tests prove their explicit repair/retention request contracts are unchanged.

After each green slice, use the mandatory simplify skill without behavior changes. Run focused suites first, then typecheck/build and the full Vitest suite. A fresh Oracle performs final read-only verification and owns the PASS/FAIL judgment.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Internally preview only when repair apply omits its still-effective fingerprint. | `src/cli.ts` admin parser and repair handler | Preview/apply spies, explicit stale binding, drift and persistence failure tests. |
| FR-002 | Internally bind missing retention pair; preserve supplied pair and fixed-time continuation. | `src/cli.ts` retention handler | One/multi-batch, partial pair, stale, growth, and no-progress tests. |
| FR-003 | Process-first URI initializer plus dedicated file-backed compaction module using verified immutable preview, checkpoint, validation, SQLite-managed `VACUUM`, and fresh reopen. | `src/store/sqlite-uri-runtime.ts`, `src/store/compaction.ts`, `src/store/types.ts` | Fresh-child URI initialization/path proof, sidecar snapshots, filesystem-backed success and failure-injection suite. |
| FR-004 | Add preview-first CLI grammar and bounded Markdown/JSON without HTTP/MCP registration. | `src/cli.ts`, `src/index.ts` | CLI help/grammar/dispatch/output tests and registry invariant. |
| FR-005 | Sidecar-safe preview, physical/logical metrics, capacity checks before and after checkpoint, busy rejection, identity/count validation, and no raw sidecar operations. | `src/store/compaction.ts` | Immutable/paired/partial sidecar snapshots, large uncheckpointed WAL, insufficient-space, busy, integrity, injected failure, and post-reopen tests. |
| FR-006 | Never execute tests or implementation commands against live operator data. | Test fixtures and execution procedure | Command/path audit and temp-directory assertions. |

## Optional support artifacts

- `research.md`: Required because SQLite checkpoint, free-space, lock, transaction, and live-file replacement behavior materially determine the safety design.
- `data-model.md`: Required to make optional CLI binding states, compaction metrics, validation identity, and success/no-op semantics executable.
- `contracts/cli.md`: Required because public grammar, compatibility behavior, output, and failure semantics change.
- `quickstart.md`: Not created. Live compaction remains separately authorized and implementation verification is limited to disposable data.

## Risks and migrations

- **Preview accidentally writes**: normal config/Store startup can materialize/migrate state, ordinary read-only WAL access may create sidecars, and installed better-sqlite3 disables URI handling unless initialized explicitly. The compact path owns the pre-constructor URI environment boundary, verifies the resolved immutable target, uses normal read-only only for an existing readable WAL/SHM pair, and fails for unavailable URI semantics or partial/ambiguous sidecars; fresh-process and snapshot tests prove the boundary.
- **Process-global URI setting**: better-sqlite3 exposes URI enablement only as a one-time process setting. The compact initializer sets it before the first constructor in the packaged CLI. If an embedding host already initialized the addon incompatibly, exact immutable-path verification fails and compaction does not degrade to a mutable preview.
- **Disk exhaustion**: SQLite documents temporary space up to twice the logical database size. Apply gates on twice the greater of main-file and logical page bytes before checkpoint, then refreshes and repeats after checkpoint; a large uncheckpointed-WAL fixture and injectable capacity reads cover underestimation.
- **Concurrent clients**: checkpoint or `VACUUM` can be blocked. Busy results/errors fail non-zero; the implementation does not kill clients, delete locks, or retry against changing state.
- **WAL coordination**: raw database/WAL/SHM file operations are forbidden. SQLite APIs own checkpoint, rebuild, commit, and recovery.
- **Validation cost**: integrity checks and exact durable table counts add time, but compaction is an explicit maintenance operation whose safety outweighs latency. Output remains bounded.
- **Virtual tables**: FTS/vector shadow structures are not counted as application tables. Schema identity, SQLite integrity, foreign keys, and fresh normal reads cover them without depending on unstable internal layouts.
- **Post-commit validation failure**: a committed `VACUUM` cannot be application-rolled-back after close. The CLI returns failure and never claims success; SQLite transaction recovery protects interruption during the operation.
- **Optional legacy flags**: making them optional could hide accidental partial retention input. The parser rejects a one-field pair and tests prove a complete supplied binding is never ignored.
- **Pure resolver regression**: extracting path resolution could alter home/environment precedence. Existing config tests plus new pure-resolution tests lock the current order.
- **Rollback**: code rollback removes the new command and restores manual CLI binding requirements. A successfully compacted SQLite database needs no data migration or rollback because its logical schema/data are unchanged.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The concrete registration plan adds one CLI command and no MCP tool; the registry remains exactly six.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Retrieval remains unchanged, while fixed selection bindings and ordered validation inputs make administration deterministic and fail-closed.
- **P3 — Harness-Agnostic Memory Contract**: PASS — All changed behavior is host-neutral CLI/Store administration with no integration or portable-format change.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall is untouched and compaction emits only fixed-size metrics and validation flags.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The public change is additive/relaxing: old binding syntax still works and retains force, Store/HTTP contracts stay explicit, and no removal requires deprecation.
