# Change: migration-resilience

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

Live dogfooding of master `929cbca` (lazy sessions + revision 11) on 2026-10-19, measured read-only on the user's database and on snapshot copies, plus two Explorer reports:

- Slow cleanup: the revision-11 empty-session cleanup (`migrateRevisionTen`, `src/memory-core/sqlite/migrations.ts:487-527`) uses correlated `NOT EXISTS` subqueries. EXPLAIN shows `SCAN evidence`, `SCAN legacy_import_rows`, and `SCAN observation_reviews` once per session, because `evidence.session_id`, `legacy_import_rows.session_id`, and `observation_reviews.reviewer_session_id` have no index (`schema.ts:102,199,332`). It also runs one `DELETE` per session with foreign keys on, which scans those tables again. On the user's 137 MB database (7,996 sessions, 23,296 evidence, 30,233 legacy import rows) the SELECT alone took 42,185 ms and a full migration on a snapshot copy took 79,478 ms. A set-based query (one `UNION` of referenced session IDs) returned the same 555 rows in 59 ms. `VACUUM INTO` took 543 ms, `integrity_check` 784 ms, `foreign_key_check` 90 ms, and one `logicalState` pass 605 ms.
- Startup ordering: `MemoryService` runs `migrateCurrentSchema` in its constructor (`service.ts:315-323`), which `createServer` calls before the MCP transport connects (`server.ts:20-21`, `index.ts:29-49`). The `lifecycle` CLI also builds the service before dispatch (`cli.ts:201-213`). During a migration no host gets any answer; it only sees a timeout. Timeouts are 5 s per connect and per request in Pi (`mcp-client.ts:9,104-123`), 5 s with `child.kill()` in OpenCode (`node-lifecycle-client.ts:20,243,285-288`), and 10-15 s in the Codex/Claude hooks (`plugin/hooks/*.json`). The better-sqlite3 busy timeout defaults to 5,000 ms.
- Consequence: Pi showed `thoth-mem degraded: pi_lifecycle_request_failed` and memory stayed unavailable. Every new request launched a child that restarted the migration, and nothing committed. With user authorization, the migration was completed out-of-band in 70,736 ms (sessions 7,996 → 7,441, lifecycle_receipts 5,988 → 4,732; evidence and memories unchanged). No `migrate` command exists (`cli.ts:14` HELP lists setup, adoption, project rename, import-legacy, and lifecycle). A user who installs the plugin has no documented way out.
- Concurrency: every `ensure*Backup` helper (`migrations.ts:84-100,156-172,206-222,283-298,338-353,388-402,470-484`) writes `VACUUM INTO "${backupPath}.tmp"`, so one process can delete another's in-progress temporary file. It then publishes with `renameSync` after an existence check, which is racy. The revision branch is chosen before the immediate transaction (`:541,611-612`), so a process that waited for the lock can fail the locked-source comparison after another process has already committed the revision.
- Diagnostics: Pi collapses every failure into a code and discards the detail (`pi/index.ts:81-93`; `mcp-client.ts:128-139` invalidates on every error). OpenCode logs `OpenCode lifecycle degraded: <code>` and discards the child's stderr (`node-lifecycle-client.ts:292-297`, `plugin.ts:71-78`). The Codex/Claude public runner forwards bounded stderr `thoth-mem public plugin: <detail>` (`public-runner.mjs:209-251`). A timeout does not prove that a migration is pending.
- Nearest tests: `tests/memory-core/schema-migration.test.ts` (revision-11 fixtures `:138-192`, lock `:232-245`, rollback `:248`, mismatch `:263`), `tests/cli.test.ts`, `tests/integration/pi-mcp-client.test.ts:31-113`, `tests/integration/pi-native-plugin.test.ts:115,140`, `tests/integration/opencode-native-plugin.test.ts:188,675`, `tests/integration/public-plugin-runner.test.ts:515`.

## Intent

A pending schema migration never leaves memory down indefinitely. Revision 11 completes in a few seconds on large databases. Concurrent host processes cannot corrupt or block each other's migration. Every host tells the user truthfully what failed and how to recover. `thoth-mem migrate` lets anyone complete a migration manually without host timeouts.

## Non-goals

- No background or detached migration process, and no explicit-only migration policy: hosts keep migrating at startup (user decision).
- No new schema revision, DDL, or indexes. Databases already at revision 11 are unaffected.
- No change to what revision 11 deletes, or to existing backups and verification semantics, beyond concurrency safety.
- No change to MCP tool definitions or recovery caps.
- No automatic deletion of orphaned temporary backup files from killed processes.
- No push, publish, or real-host smoke.

## Acceptance

- AC-1: The revision-11 cleanup selects candidates in set-based passes and deletes them without scanning a referencing table per session. Its query plan has no correlated scan of `evidence`, `legacy_import_rows`, or `observation_reviews`, and foreign-key validity is verified before commit. On every existing revision-11 fixture it removes exactly the same sessions and receipts as before. A synthetic file-backed revision-10 database of about 8,000 sessions, 25,000 evidence rows, and 30,000 legacy import rows migrates to revision 11 within a generous test bound. On a copy of the user's `memory.sqlite.pre-v11.bak`, the built migration finishes in under 10 s and leaves 7,441 sessions and 4,732 lifecycle receipts.
- AC-2: Concurrent migration is safe. Each pre-migration backup is written to a process-unique temporary file and published only if no backup exists yet. A process that loses publication verifies the existing backup and never deletes or overwrites another process's file. A process that acquires the migration lock after another process has applied that revision treats it as complete. Exactly one process applies each revision. This applies to every `ensure*Backup` helper.
- AC-3: `migrateCurrentSchema` returns a migration report: starting and resulting revision, the backups created or verified, and the sessions and lifecycle receipts removed by revision 11. `MemoryService` exposes the report without duplicating migration logic. An already-current database reports a no-op.
- AC-4: `thoth-mem migrate [--data-dir <dir>] [--json]` resolves the data directory like the other commands, opens the existing `memory.sqlite`, applies pending migrations without any host timeout, and prints the report (human-readable by default; `--json` emits `thoth-mem.migrate.v1`). It first reads the revision from an isolated snapshot: it copies the database and any existing `-wal` file into a disposable temporary directory, reads the revision there, and deletes the snapshot, following `projectSelectorExists` (`src/memory-core/service.ts:252-273`). It never opens the source read-only and never uses immutable mode. An already-current database prints a no-op without any connection to the source, so its bytes, journal mode, and directory contents stay unchanged for DELETE-mode databases, WAL databases without sidecars, and WAL databases with existing sidecars. Only a pending migration opens the database writable, again with `fileMustExist`. A missing database exits 1 without creating storage, even if the file disappears between the check and the writable open. Unknown, duplicate, or malformed options exit 2 before opening storage. HELP lists the command.
- AC-5: When a schema migration fails or the database is locked by another process, the error is bounded, names the failing revision step, and recommends running `thoth-mem migrate`. It does not claim a cause it did not observe. The message reaches the MCP server's startup error, the `lifecycle` CLI's stderr (and therefore the Codex/Claude public runner's bounded stderr), and OpenCode's lifecycle log, which keeps a bounded stderr detail.
- AC-6: Pi distinguishes a memory-server startup (connect) timeout from other failures. It shows at most one bounded warning per session saying that memory-server startup timed out and that, if memory stays unavailable, the user can run `thoth-mem migrate`. Other failures keep their existing codes. Prompts are never rejected, no unverified memory is injected, and the extension still does not open SQLite.
- AC-7: OpenCode reports a lifecycle timeout with the same bounded conditional hint, and reports a lifecycle failure with the bounded child stderr detail from AC-5.
- AC-9: The canonical store requirement for derived summaries states the generator without a transitional generation label, so once archived the canonical specs satisfy `tests/packaging/canonical-product-contract.test.ts` ("keeps current invariants and no affirmative retired requirements"), which has failed since the `lazy-sessions-summary-quality` archive added the label (found by M1). The derivation rules and code are unchanged.
- AC-8: The README gains a troubleshooting section covering the symptoms per host, `npx thoth-mem migrate` and the bin path, `--data-dir`, what backups are kept, and orphaned temporary backup files. Agent docs describe the migration report, concurrency rules, and host diagnostics.

## Clarifications

- Immediate recovery: complete the pending migration now, out-of-band (done with user authorization, 70,736 ms).
- Fix scope: the `migrate` command, fast migration, concurrent-safe migrations, a clear host notice, and README troubleshooting (all selected).
- Diagnostic design: truthful notices plus the manual command, with hosts still migrating at startup. Background migration and explicit-only migration were rejected.

## Decisions

- D1: Hosts keep migrating automatically at startup. `thoth-mem migrate` is the documented manual path with no host timeout.
- D2: Revision-11 candidates come from one materialized set of referenced session IDs (a `UNION` over evidence, session_events, session_summaries, observations, observation_reviews.reviewer_session_id, and legacy_import_rows) plus lifecycle receipts that cite evidence or a summary for the same (harness, project_id, root_session_key). Deletion runs in set form, with foreign-key enforcement disabled around the immediate transaction following the revision-10 precedent (`migrations.ts:425-452`), and `foreign_key_check` passes before the revision is recorded. No DDL.
- D3: Backup publication uses a per-process unique temporary name in the same directory and publishes it with a same-directory hard link (`linkSync`, which fails if the backup already exists), following `src/integration/project-identity.ts` `publishMarker`. `COPYFILE_EXCL` is not used as an atomic fallback. The loser verifies the winner's backup. Each process removes only its own temporary file. Orphaned temporary files are documented, not auto-deleted.
- D4: After acquiring the immediate migration lock, a step re-reads the current revision. If another process already recorded the target revision or advanced beyond it, the step returns as complete. This also covers a winner that commits between the loser's absent-backup check and its `VACUUM INTO` or backup verification.
- D5: Diagnostics never claim that a migration is pending on a mere timeout. Timeout hints are conditional ("if memory stays unavailable, run `thoth-mem migrate`"). Migration errors state the observed failure.
- D6: `migrate` reads the revision from an isolated snapshot first (copy the database plus any existing `-wal` into a disposable temporary directory, inspect, delete), like `projectSelectorExists`, because even a read-only SQLite connection can create or leave `-wal`/`-shm` sidecars. It never uses immutable mode against a live WAL database. A current database is a source-side-effect-free no-op. (Repair after the plan-review REJECT, round 2.) Only a pending migration opens the database writable, through an existing-only path (`fileMustExist`, which may require a `MemoryService` option). A missing database exits 1 without creating it. Legacy or unrecognized schemas keep their existing errors. Exit codes are 0 success, 1 operational failure, 2 argument error. (Repair after the plan-review REJECT, round 1.)
- D8 (added during implementation, after M1): The archived `lazy-sessions-summary-quality` delta wrote the generator identifier with its generation suffix into `.thoth/specs/store/spec.md:545,551`. The packaging contract forbids that label in canonical specs. A MODIFIED store delta rewords the requirement to "the current harness generator, distinct from the one used before these rules" without naming the suffix. Code, persisted summaries, and docs keep the existing identifier. Root applies this through the archive; there is no direct spec edit.
- D7: Timing coverage combines a deterministic query-plan assertion with a synthetic scale test under a generous bound, plus a root live check on a copy of `pre-v11.bak`.

## Durable deltas

- `ADDED cli` **Migrate Command MUST Complete Pending Schema Migrations Without Host Timeouts** — `thoth-mem migrate [--data-dir <dir>] [--json]` MUST resolve the data directory like the other commands, open the existing `memory.sqlite`, apply every pending schema migration with the standard backups and without any host timeout, and report the starting and resulting revisions, the backups created or verified, and the sessions and lifecycle receipts removed; on an already-current database it MUST report a no-op without writes; it MUST NOT create a missing database, MUST reject unknown, duplicate, or malformed options before opening storage, and MUST exit 0 on success, 1 on operational failure, and 2 on argument errors.
  - GIVEN a revision-10 database with empty host sessions and a missing data directory; WHEN `thoth-mem migrate --json` runs twice on the first and once on the second; THEN the first run reports revision 10 to 11 with its backup and removal counts, the second reports an already-current no-op without writes, and the missing database exits 1 without creating a file.
- `MODIFIED store` **Schema Migration MUST Remove Empty Host Sessions** — The schema migration that introduces lazy session creation MUST, after the standard pre-migration backup, delete every session of a non-import harness that no session event, evidence, summary, memory, observation, receipt citing evidence or summary, or other row references, together with that root session's lifecycle receipts that cite no evidence or summary, and MUST keep import-harness sessions and every referenced session unchanged; it MUST select candidates in set-based passes and delete them without scanning any referencing table once per session, and MUST verify foreign-key validity before recording the revision.
  - GIVEN a revision-10 database with about 8,000 sessions, 25,000 evidence rows, and 30,000 legacy import rows, including an empty Pi session with only enroll, recover, and finalize receipts, an empty import session, and a Codex session with one root prompt; WHEN the migration runs; THEN only the unreferenced non-import sessions and their lifecycle-only receipts are removed, its query plan contains no per-session scan of a referencing table, it completes within the test bound, a backup exists, and rerunning it changes nothing.
- `ADDED store` **Concurrent Schema Migrations MUST Be Safe Across Processes** — When several processes open the same database while a migration is pending, each pre-migration backup MUST be written to a process-unique temporary file and published only if no backup exists yet, a process that loses publication MUST verify the existing backup without deleting or overwriting another process's file, a process that acquires the migration lock after another process applied that revision MUST treat it as complete, and exactly one process MUST apply each revision; `migrateCurrentSchema` MUST report the starting and resulting revisions, the backups created or verified, and the sessions and receipts removed.
  - GIVEN two processes opening the same revision-10 database at the same time; WHEN both run startup migrations; THEN exactly one applies revision 11, the published backup is intact and verified, neither deletes the other's temporary file, and the other either opens the revision-11 database or fails with a bounded busy error without partial changes.
- `MODIFIED harness-integration` **Native Failures MUST Degrade Without Blocking the Host Prompt** — Child launch, timeout, nonzero exit, protocol failure, oversized output, invalid envelope, tool bridge failure, or unverifiable identity in any native adapter, including Pi, MUST produce bounded safe diagnostics, inject no unverified memory, and MUST NOT reject an otherwise valid host prompt; a schema migration failure or locked database MUST surface a bounded diagnostic naming the failing revision step and recommending `thoth-mem migrate` through the MCP server startup error, the lifecycle CLI stderr forwarded by the public runner, and the OpenCode lifecycle log; Pi and OpenCode MUST distinguish a memory-server startup or lifecycle timeout and show at most once per session a bounded hint that the user can run `thoth-mem migrate` if memory stays unavailable, without claiming that a migration is pending; Pi tool calls MUST cross the package-relative Node boundary to the existing MCP server with the same storage, identity, privacy, validation, and error semantics as direct MCP use; the Pi extension MUST NOT open SQLite directly, and concurrent MCP/lifecycle cold start MUST preserve the database bootstrap safety contract.
  - GIVEN Pi's memory server does not finish starting within its timeout and, separately, a lifecycle child whose migration fails; WHEN session start, the next prompt, and an OpenCode or Codex lifecycle hook run; THEN prompts continue without injected memory, Pi shows one bounded startup-timeout warning that suggests `thoth-mem migrate` if memory stays unavailable, and the hook diagnostics carry the bounded migration error with the same recommendation.

- `MODIFIED store` **Session Summaries MUST Be Derived Deterministically When Not Supplied** — When `checkpoint_pre_compact` or `finalize` carries no submitted summary, or the previous session needed by automatic recovery has no current summary covering its latest non-summary evidence, the service MUST derive a harness-generated summary under the current harness generator identity, distinct from the identity used before these derivation rules, without any model or network call from that session's own evidence: substantive root prompts (at least 40 code points after whitespace normalization; the first and the latest distinct one, or only the first prompt when none is substantive) as objective bounded to 300 code points; promoted decision, convention, architecture, and preference memories as decision; discovery and project-structure memories as completed; failure memories as completed with outcome failed; open handoffs as next action; closed handoffs as completed; and the newest parsed host compaction claims; each memory-derived claim MUST state the memory title with its primary labeled line (Result for direct memories, First pending action for open handoffs, the closing Result for closed handoffs, otherwise the first line) bounded to 300 code points, claims with identical kind and content MUST collapse into one claim citing their combined supports within the support limit, every claim MUST cite in-session evidence inside its coverage and respect the existing claim and size limits, a session without citable evidence MUST receive no summary, and a lazily derived summary MUST be final only when the session has ended and checkpoint otherwise.
  - GIVEN an ended Codex session whose root prompts are "Ya hice /reload" and a 120-code-point request, one decision memory with long Result and Rationale lines, one open handoff, and no submitted summary; WHEN finalize runs or a later session's recovery needs it; THEN exactly one harness final summary from the current generator exists whose only objective is the substantive request, whose decision claim is the memory title with its Result line within 300 code points, and whose next-action claim carries the handoff's first pending action, all citing in-session evidence within coverage.

## Plan

The work is sequential and test-first (`tdd`), with one worker per unit followed by a `simplify` pass. Code is strict TypeScript with ESM `.js` imports. There are no commits and no edits to `dist/`. Workers do not edit this record. After the unit vitest config, restore `benchmarks/results/fixture-report.json` with `git checkout --`. Never touch `~/.thoth-mem`.

1. **Fast cleanup + report (AC-1, AC-3).** In `migrations.ts`, rewrite `migrateRevisionTen` per D2 with the revision-10 pragma pattern (`foreign_keys = OFF` outside the transaction, restored in `finally`, `foreign_key_check` before and after). Make `migrateCurrentSchema` return a report that each step contributes to; `MemoryService` keeps the last report (`migrationReport`). Tests: the existing revision-11 fixtures stay green with identical results; add a deterministic query-plan assertion and a synthetic scale test (bulk inserts in one transaction) that times only the migration, not fixture construction, against an explicitly generous bound.
2. **Concurrency (AC-2).** Add one shared backup-publication helper (unique temporary name, exclusive publish-if-absent, verify the existing winner, remove only its own temporary file) used by every `ensure*Backup`. Re-read the revision under the immediate lock per D4. Tests: another process's temporary file survives; a backup published by another process is verified and reused; a revision applied, or advanced beyond, by another process between branch selection and lock is treated as complete, including a winner that commits between the loser's absent-backup check and its `VACUUM INTO` or verification (use the existing `MigrationHooks` seams or a second connection); the existing lock, rollback, and mismatch tests stay green.
3. **`migrate` command (AC-4).** In `src/cli.ts`, add a strict argument parser following `adoptionArguments`/`importRunArguments`. Read the revision from an isolated snapshot of the database plus any existing `-wal` (reuse or factor the `projectSelectorExists` snapshot approach, never a source connection or immutable mode); when current, report the no-op without touching the source. Otherwise open through an existing-only writable path (`fileMustExist`; add a `MemoryService` option if needed) and render the report (human-readable or `thoth-mem.migrate.v1`). Update HELP and `tests/cli.test.ts`: arguments; missing database; unchanged source bytes, journal mode, and directory contents for current DELETE-mode databases, WAL databases without sidecars, and WAL databases with existing sidecars; 10→11 with a fixture; and existing-only protection when the file disappears before the writable open.
4. **Core and host diagnostics (AC-5, AC-7).** Wrap migration failures (including `SQLITE_BUSY`/locked) in a bounded error that names the revision step and recommends `thoth-mem migrate`. Surface it on MCP server startup and in the `lifecycle` CLI stderr. In OpenCode's `node-lifecycle-client.ts`/`plugin.ts`, keep bounded stderr detail for nonzero exits and add the conditional hint for timeouts. Seams: `tests/integration/opencode-native-plugin.test.ts`, `tests/integration/public-plugin-runner.test.ts`, the lifecycle CLI tests.
5. **Pi diagnostics (AC-6).** In `mcp-client.ts`, classify connect/startup timeouts distinctly (for example, an error with a code) without changing reconnect semantics. In `pi/index.ts`, map that classification to one bounded per-session warning with the conditional hint; other codes are unchanged. Seams: `tests/integration/pi-mcp-client.test.ts`, `tests/integration/pi-native-plugin.test.ts`.
6. **Docs (AC-8).** README troubleshooting; `docs/agent/persistence-retrieval.md` (report, concurrency); `docs/agent/native-lifecycle.md` (host diagnostics).

Verification: `pnpm exec tsc --noEmit`; `pnpm exec vitest run --config vitest.unit.config.ts`; `pnpm run build` then `pnpm exec vitest run --config vitest.integration.config.ts`. The known environmental failures are the CRLF report hashes, adjacent `npm-cli.js`, and the OpenCode checkout name. Root live check after build: copy `~/.thoth-mem/memory.sqlite.pre-v11.bak` to a temp data directory, run `node dist/index.js migrate --data-dir <tmp> --json` twice (expect 10→11 in under 10 s with 7,441 sessions and 4,732 receipts, then a no-op), and delete the temp directory.

Risks:
- Foreign keys disabled during deletion: mitigated by the set-based proof and `foreign_key_check` before commit.
- Hard-link publication must work on Windows (NTFS) and POSIX: publication either succeeds with a same-directory hard link or fails closed; there is no non-atomic copy fallback (D3). Tests cover both outcomes.
- Timing tests may be flaky: generous bound plus the deterministic query-plan assertion.
- Diagnostic wording must stay truthful (D5).

## Tasks

- [x] AC-1: Set-based revision-11 cleanup with foreign-key verification and scale coverage
  - Outcome: the cleanup selects candidates from one referenced-ID set and deletes in set form with foreign keys off and `foreign_key_check` before recording the revision; results are identical on existing fixtures; the query plan has no per-session scan; a synthetic scale test passes within the bound
  - Known entrypoints and skill paths: src/memory-core/sqlite/migrations.ts (migrateRevisionTen ~487-527, migrateRevisionNine pragma pattern ~425-452, migrateCurrentSchema ~528-617), src/memory-core/sqlite/schema.ts, tests/memory-core/schema-migration.test.ts; skills tdd, simplify, SQLite at C:\Users\EremesNG\orca\workspaces\thoth-mem\context\.agents\skills\sqlite\SKILL.md
  - Inputs: Exploration (measurements), D2, D7
  - Dependencies: none
  - Output: code + tests
  - Owner: thoth-worker (one unit covering AC-1 and AC-3)
  - Writes: src/memory-core/sqlite/migrations.ts, src/memory-core/service.ts (report exposure only), tests/memory-core/schema-migration.test.ts
  - Interface boundaries: deletion semantics of the store delta; MigrationHooks test seams; no DDL
  - Focused check and PASS evidence: existing revision-11 tests green with unchanged expectations; a deterministic query-plan test and a scale test that times only the migration against an explicitly generous bound are green; tsc clean
  - Return milestone: tests green with the diff summary
  - Stop / reassessment: a reference the set-based selection cannot express, or foreign-key toggling that is impossible at this point in the migration flow
- [x] AC-3: Migration report from migrateCurrentSchema exposed by MemoryService
  - Outcome: starting and resulting revisions, backups created or verified, sessions and receipts removed; no-op for already-current databases
  - Known entrypoints and skill paths: src/memory-core/sqlite/migrations.ts (migrateCurrentSchema), src/memory-core/service.ts:315-323
  - Inputs: D2
  - Dependencies: the same unit as AC-1
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: as in AC-1
  - Interface boundaries: MemoryService constructor signature unchanged
  - Focused check and PASS evidence: tests assert the report for 10→11, 9→10→11, and an already-current open
  - Return milestone: delivered with AC-1
  - Stop / reassessment: a report shape that would require duplicating step logic
- [x] AC-2: Concurrency-safe backup publication and revision re-check under the lock
  - Outcome: a shared helper for every ensure*Backup (unique temporary name, exclusive publish-if-absent, verify the winner, remove only its own file); a re-read revision under the immediate lock treats an already-applied step as complete
  - Known entrypoints and skill paths: src/memory-core/sqlite/migrations.ts (ensureRevision*Backup helpers listed in Exploration), tests/memory-core/schema-migration.test.ts; skills tdd, simplify
  - Inputs: accepted AC-1/AC-3 unit; D3, D4
  - Dependencies: AC-1/AC-3 unit
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: src/memory-core/sqlite/migrations.ts, tests/memory-core/schema-migration.test.ts
  - Interface boundaries: existing backup verification and mismatch semantics unchanged
  - Focused check and PASS evidence: tests show another process's temporary file survives, a winner's backup is verified and reused, and a revision applied or advanced beyond by another process (including between the loser's absent-backup check and its VACUUM INTO or verification) is completed without error; existing tests green
  - Return milestone: tests green
  - Stop / reassessment: no portable exclusive publication primitive on Windows
- [x] AC-4: thoth-mem migrate CLI command
  - Outcome: strict arguments, isolated-snapshot revision check, source-side-effect-free no-op, existing-only writable path for pending migrations, human-readable and thoth-mem.migrate.v1 output, exit codes, HELP
  - Known entrypoints and skill paths: src/cli.ts (HELP :14, adoptionArguments :18-35, importRunArguments :105-127, project rename :215-235), src/index.ts:15-18,53-56, tests/cli.test.ts; skills tdd, simplify
  - Inputs: accepted AC-3 report
  - Dependencies: AC-2 unit (sequential worker rule)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: src/cli.ts, src/memory-core/service.ts (existing-only open option only, if needed), tests/cli.test.ts
  - Interface boundaries: existing commands unchanged
  - Focused check and PASS evidence: CLI tests for arguments, the missing database (no file created, including disappearance before the writable open), 10→11 with the report, and a no-op rerun whose source bytes, journal mode, and directory contents are unchanged for DELETE-mode databases, WAL databases without sidecars, and WAL databases with existing sidecars
  - Return milestone: tests green
  - Stop / reassessment: a conflict with existing argument conventions
- [x] AC-5: Bounded actionable migration errors through MCP startup and lifecycle CLI
  - Outcome: migration and busy failures wrapped with the revision step and the `thoth-mem migrate` recommendation, visible in MCP startup errors, lifecycle CLI stderr, and the public runner's bounded stderr
  - Known entrypoints and skill paths: src/memory-core/sqlite/migrations.ts, src/memory-core/service.ts:315-323, src/index.ts, src/server.ts, src/cli.ts:201-213, plugin/runners/public-runner.mjs (read-only unless required); skills tdd, simplify
  - Inputs: D5
  - Dependencies: AC-4 unit
  - Output: code + tests
  - Owner: thoth-worker (one unit covering AC-5 and AC-7)
  - Writes: src/memory-core/sqlite/migrations.ts or src/memory-core/service.ts (error wrapping), src/cli.ts, src/index.ts, related tests
  - Interface boundaries: bounded diagnostics (500-560 code-point caps already in use); no unverified injection
  - Focused check and PASS evidence: tests show the injected migration failure and busy error produce the bounded message with the recommendation in lifecycle CLI stderr and the public runner output
  - Return milestone: delivered with AC-7
  - Stop / reassessment: a host path that cannot carry the message without changing host contracts
- [x] AC-7: OpenCode lifecycle timeout hint and bounded stderr detail
  - Outcome: OpenCode logs the conditional hint on timeout and the bounded child stderr detail on failure
  - Known entrypoints and skill paths: src/integration/opencode/node-lifecycle-client.ts (:20, 238-303), src/integration/opencode/plugin.ts:71-78, tests/integration/opencode-native-plugin.test.ts:188,675
  - Inputs: D5
  - Dependencies: the same unit as AC-5
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: the two OpenCode files and their tests
  - Interface boundaries: OpenCode callbacks are never rejected; output limits are preserved
  - Focused check and PASS evidence: OpenCode tests for timeout (hint logged once) and nonzero exit (bounded stderr detail logged)
  - Return milestone: the unit returns with AC-5 and AC-7
  - Stop / reassessment: an output-limit conflict
- [x] AC-6: Pi startup-timeout classification with one bounded per-session hint
  - Outcome: the connect/startup timeout is classified distinctly; one warning per session with the conditional hint; other codes and reconnect semantics unchanged
  - Known entrypoints and skill paths: src/integration/pi/mcp-client.ts (:9, 93-139), src/integration/pi/index.ts (:81-93, report/dispatch), tests/integration/pi-mcp-client.test.ts, tests/integration/pi-native-plugin.test.ts; skills tdd, simplify
  - Inputs: D5
  - Dependencies: AC-5/AC-7 unit
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: the two Pi files and their tests
  - Interface boundaries: the Pi extension never opens SQLite; tool call errors still reject per existing tests; existing stale-connection tests stay green
  - Focused check and PASS evidence: tests show a slow connect produces the startup-timeout code and exactly one hint per session, with prompts usable and no injection
  - Return milestone: tests green
  - Stop / reassessment: classification that requires changing reconnect semantics
- [x] AC-9: Reworded canonical generator requirement without the transitional label
  - Outcome: the MODIFIED store delta above replaces the generator wording; once archived, the canonical-product-contract test passes
  - Known entrypoints and skill paths: .thoth/specs/store/spec.md:543-551 (read-only), tests/packaging/canonical-product-contract.test.ts:61-72
  - Inputs: M1 finding; D8
  - Dependencies: none (root-owned record delta)
  - Output: durable delta in this record
  - Owner: root
  - Writes: this record only (the canonical spec changes only at archive)
  - Interface boundaries: derivation code and persisted generator names unchanged
  - Focused check and PASS evidence: the test's regex matches nothing in the delta statement or scenario; after archive, `pnpm exec vitest run tests/packaging/canonical-product-contract.test.ts --config vitest.integration.config.ts` passes
  - Return milestone: before final verification (delta check); after archive (test run)
  - Stop / reassessment: another canonical spec containing the label
- [x] AC-8: README troubleshooting and agent docs
  - Outcome: README troubleshooting section (symptoms per host, npx thoth-mem migrate and the bin path, --data-dir, backups, orphaned temporary files); agent docs for the report, concurrency, and diagnostics
  - Known entrypoints and skill paths: README.md (~172-185), docs/agent/persistence-retrieval.md, docs/agent/native-lifecycle.md
  - Inputs: accepted outputs of all code units
  - Dependencies: AC-6 unit
  - Output: documentation edits
  - Owner: thoth-worker
  - Writes: README.md, docs/agent/persistence-retrieval.md, docs/agent/native-lifecycle.md
  - Interface boundaries: packaged Skill copies unchanged (report if they need a change)
  - Focused check and PASS evidence: docs cover each item; git diff --check passes
  - Return milestone: docs diff ready
  - Stop / reassessment: packaged Skill text that needs a lock refresh

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 (fresh Oracle): REJECT, because the migrate no-op opened the database writable (WAL set before the revision check). Repaired with an existing-only writable path.
Round 2 (fresh Oracle): REJECT, because a read-only preflight can create or leave WAL/SHM sidecars. Repaired with an isolated snapshot preflight following projectSelectorExists; Risks aligned with D3.
Round 3 (fresh Oracle): OKAY, validated with validate-result.mjs --review-kind plan-review (exit 0, no issues). Nonblocking caution: treat snapshot copy/read failures as operational failures.
The user explicitly selected Oracle review and then Implement on 2026-10-19.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 404a3cb24a233bdf2e688facf85c071d396219a2bcb1f44337d1ab112d84fc3c

A fresh read-only Oracle (not an implementer) produced this envelope. Root validated it with validate-result.mjs --review-kind final-verification --record-sha256 404a3cb2…fc3c (exit 0, valid, no issues).
Known failures: 7 unit tests (CRLF report hashes); 6 integration tests (4 adjacent npm-cli.js, 1 OpenCode checkout name, and canonical-product-contract, which needs the AC-9 archive). Root reruns the canonical test after archive.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The actual diff satisfies AC-1–AC-9 and D1–D8. All observed suite failures match the declared baseline/environmental exceptions; no blocking correctness finding remains.",
  "evidence": [
    {
      "id": "binding",
      "kind": "record-and-baselines",
      "locator": ".thoth/changes/migration-resilience/migration-resilience.md",
      "claim": "Independently computed exact-byte prefix SHA-256 is 404a3cb24a233bdf2e688facf85c071d396219a2bcb1f44337d1ab112d84fc3c, unchanged at review end. Source digests match: cli=38725a2fe670b197ddb6e698efb05381154541eb1b3d0f2cd07057168e666248; store=0fbd06d552f73ac4dcc44c2918a1075b22606d008c3c24d387dfec297798e7a5; harness-integration=72a77cf37af191e50f55fdf46843fedae31ec75d03ed15e06876e17ada4630b9. All five durable deltas align with their canonical baselines.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "cleanup",
      "kind": "implementation-and-tests",
      "locator": "src/memory-core/sqlite/migrations.ts:483-543; tests/memory-core/schema-migration.test.ts",
      "claim": "The materialized UNION excludes NULL references and is equivalent to the former six NOT EXISTS predicates; composite receipt protection and import exclusion remain intact. Set deletes run under BEGIN IMMEDIATE, with FK verification before recording revision 11 and enforcement restored in finally. Exact-row, rollback, mismatch, query-plan, and 8000-session/25000-evidence/30000-import-row scale tests passed, including the 15000 ms bound.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "live",
      "kind": "supplied-execution-evidence",
      "locator": "Delegated task: root live-copy execution",
      "claim": "Root reports built migration 10→11 in 5451.35 ms, removing 555 sessions and 1256 receipts; final counts 7441 sessions, 4732 receipts, 23296 evidence and 8549 memories match the old-code outcome. Rerun reports a no-op.",
      "basis": "inferred",
      "uncertainty": "Accepted as expressly supplied root evidence; not independently replayed against real user data."
    },
    {
      "id": "concurrency",
      "kind": "implementation-and-tests",
      "locator": "src/memory-core/sqlite/migrations.ts:133-169; migration steps; tests/memory-core/schema-migration.test.ts",
      "claim": "All seven backup helpers share exclusive unique-temp reservation and hard-link publication, with no rename/copy fallback or removal of another process's file. Winner backups are verified. Every step rechecks revision under its immediate lock before mutation/comparison; genuine mismatch rejection remains. Publication races, collisions, unsupported links, revision races and two-process exactly-once coverage passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "report-cli",
      "kind": "implementation-and-tests",
      "locator": "src/cli.ts; src/memory-core/service.ts:309-341; tests/cli.test.ts",
      "claim": "MigrationReport is returned centrally and exposed by MemoryService. CLI preflight connects only to a disposable database-plus-WAL copy; current sources remain byte-, mode- and sidecar-identical. Pending opens use requireExisting/fileMustExist. Report rendering, strict arguments, missing/disappeared files, unsupported schemas, copy failures and HELP coverage passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "diagnostics",
      "kind": "implementation-and-tests",
      "locator": "MigrationError; src/memory-core/service.ts; src/integration/opencode/{node-lifecycle-client,plugin}.ts; CLI/public-runner/OpenCode tests",
      "claim": "Migration errors preserve the observed step and recovery recommendation within 500 UTF-16 units. Startup and lifecycle propagation tests passed. OpenCode retains a decoded, sanitized 500-code-point stderr tail with a 560-code-point log cap; timeout hints are conditional and deduplicated. Output limits and safe degradation remain covered.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "pi",
      "kind": "implementation-and-tests",
      "locator": "src/integration/pi/{mcp-client,index}.ts; tests/integration/pi-{mcp-client,native-plugin}.test.ts",
      "claim": "Only connect-phase timer expiry receives the startup-timeout classification. Request failures retain existing codes; generation, invalidation and late-connection closure logic are unchanged. Once-per-session warnings, usable prompts, no unverified injection, bounded tool errors and reconnect tests passed. No SQLite access was added to the extension.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "docs-tools",
      "kind": "diff-review",
      "locator": "README.md; docs/agent/{native-lifecycle,persistence-retrieval,surfaces}.md; tool-budget tests",
      "claim": "Documentation covers host symptoms, manual command/bin path, data directory, reports, backups, restoration and orphan candidates. Tool descriptions/input schemas and schema DDL are unchanged; both MCP and Pi budget guards passed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "canonical",
      "kind": "test-and-in-memory-projection",
      "locator": "tests/packaging/canonical-product-contract.test.ts:61-70; .thoth/specs/store/spec.md:545,551; AC-9 delta",
      "claim": "The canonical test reaches its final label assertion; its only forbidden-label matches are store lines 545 and 551. The MODIFIED summary delta and scenario contain no regex match. Replacing that requirement in memory removes every canonical match without modifying files; derivation code remains unchanged.",
      "basis": "observed",
      "uncertainty": "Canonical application and the post-archive test remain root closeout work."
    },
    {
      "id": "checks",
      "kind": "execution",
      "locator": "Independent required checks",
      "claim": "tsc, build and diff-check exited 0. Unit: 38 files passed/3 failed; 599 tests passed/7 failed. Integration: 23 files passed/4 failed; 227 tests passed/6 failed/1 skipped. No failures outside the listed exceptions occurred.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "exceptions",
      "kind": "failure-attribution",
      "locator": "Required-suite failures; benchmark hashes; src/setup/opencode-config.ts:35-40",
      "claim": "Seven unit failures correspond exactly to lexical-comparison-report (3), longmemeval-compare (3), and retrieval:233 (1); CRLF→LF normalization independently restores all three expected immutable report hashes. Integration failures are adjacent npm-cli.js lookup (4), the unchanged checkout-name classifier (1), and the canonical label (1).",
      "basis": "observed",
      "uncertainty": "Packed activation cannot be verified in this Node/npm layout."
    },
    {
      "id": "workspace",
      "kind": "workspace-integrity",
      "locator": "git status --short; git diff; git diff --exit-code -- benchmarks/results/fixture-report.json",
      "claim": "Reviewed HEAD 6d02569 and the complete 17-file tracked diff plus change record. The unit suite rewrote fixture-report.json; restored exactly that file with the authorized git checkout command and confirmed no remaining diff. No implementation, record or canonical-spec edits were made.",
      "basis": "observed",
      "uncertainty": "webstorm-index was unavailable; authorized read-only filesystem fallback was used."
    }
  ],
  "verification": [
    {
      "check": "Record binding and structural gate",
      "method": "Independent SHA-256 calculation; node C:/DEV/Proyectos/Webstorm/thoth-agents/skills/thoth-sdd/scripts/validate.mjs --change .thoth/changes/migration-resilience --through verify --json",
      "outcome": "pass",
      "evidenceIds": ["binding"],
      "reason": "Expected prefix hash and all Source digests match; validator exit 0 with no errors. Existing-capability addition warnings were reviewed."
    },
    {
      "check": "AC-1; D2, D7",
      "method": "Old/new predicate comparison, schema reference inspection, required unit suite and supplied live-copy evidence",
      "outcome": "pass",
      "evidenceIds": ["cleanup", "live"],
      "reason": "Deletion equivalence, set-based plan, FK restoration/rollback and scale bounds are satisfied."
    },
    {
      "check": "AC-2; D3, D4",
      "method": "Shared-helper and lock-order inspection plus race/publication tests",
      "outcome": "pass",
      "evidenceIds": ["concurrency"],
      "reason": "Exclusive publication and revision rechecks preserve exactly-once application and mismatch rejection."
    },
    {
      "check": "AC-3",
      "method": "Report flow inspection and migration/service report tests",
      "outcome": "pass",
      "evidenceIds": ["report-cli", "cleanup"],
      "reason": "Reports distinguish created/verified backups, committed cleanup and current no-ops without duplicated migration logic."
    },
    {
      "check": "AC-4; D1, D6",
      "method": "CLI/service diff and source-preservation, argument, report and existing-only tests",
      "outcome": "pass",
      "evidenceIds": ["report-cli"],
      "reason": "Manual migration has no host timeout; current preflight never connects to the source."
    },
    {
      "check": "AC-5; D5",
      "method": "Error-bound review and startup/lifecycle/public-runner propagation tests",
      "outcome": "pass",
      "evidenceIds": ["diagnostics"],
      "reason": "Bounded observed-step errors reach the required surfaces with actionable guidance."
    },
    {
      "check": "AC-6; D5",
      "method": "Pi diff, timeout classification, session-warning and reconnect coverage",
      "outcome": "pass",
      "evidenceIds": ["pi", "docs-tools"],
      "reason": "Startup timeout is distinguished without changing reconnect semantics or tool contracts."
    },
    {
      "check": "AC-7; D5",
      "method": "OpenCode child-output, timeout and nonzero-exit tests",
      "outcome": "pass",
      "evidenceIds": ["diagnostics"],
      "reason": "Conditional bounded timeout hint and bounded stderr detail preserve safe host continuation."
    },
    {
      "check": "AC-8",
      "method": "Documentation diff against implemented behavior",
      "outcome": "pass",
      "evidenceIds": ["docs-tools"],
      "reason": "All required troubleshooting and agent-documentation topics are covered."
    },
    {
      "check": "AC-9; D8",
      "method": "Exact packaging regex against all canonical specs, declared delta and in-memory replacement",
      "outcome": "pass",
      "evidenceIds": ["canonical", "binding"],
      "reason": "The reviewed delta removes the sole canonical failure cause; canonical files appropriately remain unchanged before archive."
    },
    {
      "check": "Type checking",
      "method": "pnpm exec tsc --noEmit",
      "outcome": "pass",
      "evidenceIds": ["checks"],
      "reason": "Exit 0."
    },
    {
      "check": "Unit suite",
      "method": "pnpm exec vitest run --config vitest.unit.config.ts",
      "outcome": "fail",
      "evidenceIds": ["checks", "exceptions", "workspace"],
      "reason": "599 passed, 7 failed across 41 files; only the declared CRLF hash cases. Rewritten fixture-report.json was restored."
    },
    {
      "check": "Build",
      "method": "pnpm run build",
      "outcome": "pass",
      "evidenceIds": ["checks"],
      "reason": "Exit 0."
    },
    {
      "check": "Integration suite",
      "method": "pnpm exec vitest run --config vitest.integration.config.ts",
      "outcome": "fail",
      "evidenceIds": ["checks", "exceptions", "canonical"],
      "reason": "227 passed, 6 failed, 1 skipped across 27 files; only four npm-layout failures, one checkout-name failure and the expected pre-archive canonical-label failure."
    },
    {
      "check": "Diff hygiene",
      "method": "git diff --check",
      "outcome": "pass",
      "evidenceIds": ["checks", "workspace"],
      "reason": "Exit 0; no unexpected tracked changes remain."
    }
  ],
  "risks": [
    {
      "description": "Packed smoke/activation remains unverified because the executing Node lacks adjacent npm-cli.js; the broader suites are not wholly green.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["exceptions", "checks"]
    },
    {
      "description": "The canonical packaging assertion remains red until archive applies AC-9; rerun its focused test after canonical application.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["canonical"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Validate this unchanged envelope, record acceptance evidence, run closeout, then archive the five deltas and rerun the focused canonical-product-contract test.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/migration-resilience/migration-resilience.md",
    "reviewedRecordSha256": "404a3cb24a233bdf2e688facf85c071d396219a2bcb1f44337d1ab112d84fc3c"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | tests/memory-core/schema-migration.test.ts query-plan and 8,000-session scale tests (15 s bound) plus unchanged revision-11 fixtures; root live copy of pre-v11.bak: `node dist/index.js migrate` 10→11 in 5,451 ms, 555 sessions and 1,256 receipts removed, final 7,441 sessions and 4,732 receipts (identical to the 70,736 ms old-code run) | Oracle evidence cleanup, live
- AC-2: PASS | schema-migration publication, collision, unsupported-link, revision-race, and two-child-process exactly-once tests | Oracle evidence concurrency
- AC-3: PASS | migration and service report tests (10→11, 9→10→11, current no-op) | Oracle evidence report-cli
- AC-4: PASS | tests/cli.test.ts migrate tests (arguments, missing or disappeared file, DELETE/WAL/WAL-with-sidecars source preservation, report rendering); live rerun alreadyCurrent in 56.53 ms | Oracle evidence report-cli
- AC-5: PASS | MigrationError bound and propagation tests across MCP startup, lifecycle/migrate CLI, and the public runner (Codex/Claude) | Oracle evidence diagnostics
- AC-6: PASS | pi-mcp-client startup-timeout classification and pi-native-plugin once-per-session warning tests; reconnect tests unchanged | Oracle evidence pi
- AC-7: PASS | opencode-native-plugin timeout-hint dedup and bounded stderr-tail tests | Oracle evidence diagnostics
- AC-8: PASS | review of README troubleshooting and docs/agent native-lifecycle, persistence-retrieval, and surfaces | Oracle evidence docs-tools
- AC-9: PASS | the packaging regex matches nothing in the MODIFIED store delta; the in-memory replacement clears every canonical match | Oracle evidence canonical; post-archive rerun of canonical-product-contract by root
- Source: .thoth/specs/cli/spec.md | sha256:38725a2fe670b197ddb6e698efb05381154541eb1b3d0f2cd07057168e666248
- Source: .thoth/specs/store/spec.md | sha256:0fbd06d552f73ac4dcc44c2918a1075b22606d008c3c24d387dfec297798e7a5
- Source: .thoth/specs/harness-integration/spec.md | sha256:72a77cf37af191e50f55fdf46843fedae31ec75d03ed15e06876e17ada4630b9

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
