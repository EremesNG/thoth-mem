# Feature Specification: Safe WAL Publication for Legacy Import

**Change ID**: `fix-legacy-import-wal-publication`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: A real one-command import produced a fully verified candidate but rejected publication because the importer's own SQLite WAL checkpoint changed the target's physical file hashes without changing its logical contents. A normal user must be able to import a stable legacy database without understanding WAL files or repairing internal artifacts.<br>
**Impact**: Legacy import will treat importer-controlled WAL normalization as an allowed physical transition, publish only from a verified stable logical baseline, restore failures truthfully, and continue to fail closed when the target is locked or its logical contents change. The CLI syntax, mapping policy, SQLite schema, imported data policy, and retrieval behavior remain unchanged.<br>
**Affected capabilities**: `cli`

## User stories

### US1 - Publish from a stable WAL target (Priority: P1)

As a user upgrading thoth-mem, I can run the one-command legacy import against my normal WAL-mode database so that verified legacy memories become available without manual SQLite or artifact choreography.

**Independent test**: Run the importer through its public apply and CLI seams against a disposable current target whose plan binds a non-empty WAL, then verify a committed report, preserved baseline, valid recovery artifact, and retrievable imported state.

**Covers**: FR-001, FR-002, SC-001, SC-004

**Acceptance scenarios**:

1. **Given** a stable current target with a non-empty WAL that is logically identical to its sealed plan baseline, **When** one-command import publishes a fully verified candidate, **Then** importer-controlled WAL normalization does not produce a target-changed failure and the command reports a committed import.
2. **Given** an equivalent stable target with an absent or empty WAL, **When** the same import runs, **Then** existing successful publication and recovery behavior remains unchanged.

### US2 - Restore publication failures truthfully (Priority: P1)

As a user whose import cannot finish publication, I retain the complete pre-publication database and receive a report that accurately states whether restoration was verified.

**Independent test**: Inject failures after the prior target is placed in recovery and after the candidate is published, then verify through the public apply result that the original logical baseline is restored, SQLite and foreign keys remain valid, no import receipt is committed, and `priorTargetRestored` is true.

**Covers**: FR-001, FR-003, SC-002

**Acceptance scenarios**:

1. **Given** a non-empty-WAL target and an injected failure after the target enters recovery, **When** recovery runs, **Then** the prior logical database is restored and verified even if its WAL/main byte representation was normalized.
2. **Given** a candidate that reached the target path but fails before final commit verification, **When** recovery runs, **Then** the candidate is removed from the active path and the verified prior baseline is restored without overwriting unrelated files.

### US3 - Fail closed on real target activity (Priority: P1)

As a user with another host still using or changing the target, I receive a bounded actionable failure instead of a partial import or a misleading restoration result.

**Independent test**: Exercise locked, logically changed, and publication-gap target activity against disposable databases and verify nonzero failure, unchanged/recovered authoritative contents, retained diagnostic artifacts, and no committed import receipt.

**Covers**: FR-001, FR-004, SC-003

**Acceptance scenarios**:

1. **Given** the target cannot reach the importer's quiescence barrier, **When** publication begins, **Then** the import fails as locked/busy, retains recoverable artifacts, and tells the user to close hosts and rerun the same command.
2. **Given** the target's logical contents change before or during the bounded publication handoff, **When** the importer revalidates the recovery snapshot or target paths, **Then** it refuses candidate publication, restores the captured prior state when possible, and never claims commit.

### US4 - Complete the real cutover after verification (Priority: P2)

As an upgrading user, I can rerun the same one-command import after installing the verified fix so that my legacy history becomes available without a rehearsal-only mapping or manual recovery.

**Independent test**: In a separately authorized stopped-host cutover, run the packaged command against the conventional source and verify the resulting report, target integrity, and bounded recall samples.

**Covers**: FR-001, SC-005

**Acceptance scenarios**:

1. **Given** the fixed packaged build, the conventional legacy source, and a stopped stable target, **When** `thoth-mem import-legacy` runs, **Then** the command commits once and post-cutover integrity plus bounded recall inspection pass.

### US5 - Preserve the established import contract (Priority: P2)

As an upgrading user or advanced operator, I retain the complete one-command, retry, replay, validation, audit, and bounded-output behavior that was already guaranteed before the WAL publication fix.

**Independent test**: Run the existing importer and CLI regression suites and verify conventional defaults, bounded overrides and output, invalid-input rejection, safe retry, exact committed-plan replay, and explicit `plan`/`apply` controls remain unchanged.

**Covers**: FR-001, SC-004

**Acceptance scenarios**:

1. **Given** the conventional legacy database and a configured current data directory, **When** `thoth-mem import-legacy` runs, **Then** it resolves both database paths, creates private run artifacts, plans, applies, verifies, and reports success in that single invocation.
2. **Given** a nonstandard legacy database or reviewed mapping manifest, **When** the operator passes the optional source, mapping, or data-directory override, **Then** the same one-command workflow binds those exact values into the audited plan.
3. **Given** a successful import, **When** the CLI returns, **Then** its bounded output identifies aggregate dispositions, retained plan/report locations, and nullable backup/recovery locations without exposing legacy prose.
4. **Given** the configured target is open or changes between internal planning and apply, **When** one-command import runs, **Then** it exits nonzero, reports a bounded close-host-or-retry action, and leaves the active target recoverable without claiming commit.
5. **Given** an invalid source, mapping, target alias, or unsafe artifact condition, **When** one-command import runs, **Then** it fails closed without requiring the user to inspect or repair an internal plan manually.
6. **Given** the same source fingerprint was already committed, **When** an equivalent one-command import is run again, **Then** it reads the committed plan hash from the target, selects that exact retained sealed plan from matching request custody, the existing importer receipts prevent duplicate authoritative rows, and the command reports the idempotent outcome.
7. **Given** a prior attempt failed safely because the uncommitted target changed after planning, **When** the target becomes stable and the same one-command request is retried, **Then** it creates or selects a fresh baseline-bound plan attempt and can complete without manual artifact cleanup.
8. **Given** an operator explicitly selects `plan` or `apply`, **When** that subcommand runs, **Then** the existing explicit paths, fingerprint binding, create-only artifacts, and stale-plan rejection remain authoritative.

## Edge cases

- The sealed plan contains a non-empty WAL, but acquiring and releasing the publication barrier checkpoints it into the main file without logical change.
- The target begins with no WAL or with a zero-length WAL and SHM sidecar.
- A reader or writer prevents a complete checkpoint or stable publication snapshot.
- A process creates or occupies a target main/WAL/SHM path after quiescence but before candidate placement.
- Recovery verification itself opens a WAL-mode database and creates, truncates, or removes sidecars.
- Publication fails after moving the prior target, after moving the candidate, or before reopening the candidate for final verification.
- The target was absent when planned; no prior database may be invented during recovery.

## Functional requirements

- **FR-001 — Legacy Import MUST Be Explicit and Non-Destructive**: `[MODIFIED cli]` `import-legacy` MUST make one explicit CLI invocation the normal migration workflow; default the source to the conventional legacy database under the user home and the target to `memory.sqlite` under the resolved runtime data directory; accept bounded source, mapping, and data-directory overrides; bind the complete canonical mapping request, including null versus empty mode, inside the sealed plan hash recorded by the target receipt; internally create and retain importer-owned request custody with immutable baseline-bound plan attempts and create-only reports; use a fresh attempt while no matching source import is committed; read the committed plan hash from the target and reuse only that exact retained sealed plan for an equivalent replay; execute fingerprint-bound planning and verified apply without manual artifact choreography; emit bounded aggregate success or actionable failure output; preserve advanced `plan` and `apply` subcommands; reject changed, locked, aliased, invalid, tampered, substituted, or unsafe inputs before claiming commit; allow a later stable retry after an uncommitted failure; preserve a verified backup and recoverable publication; accept importer-controlled physical WAL normalization only when the complete logical baseline remains equal to the sealed plan; verify restoration by SQLite integrity, foreign keys, and logical baseline rather than stale pre-checkpoint byte hashes; and keep repeated imports idempotent.
- **FR-002 — Stable Post-Quiescence Publication Snapshot**: `[INTERNAL]` Apply MUST establish a bounded SQLite quiescence barrier before filesystem publication, reject busy or incomplete quiescence, capture one post-quiescence target snapshot, and use that snapshot consistently for recovery custody and publication revalidation. Physical main/WAL/SHM changes caused solely by the importer's controlled normalization MUST NOT be classified as logical target mutation.
- **FR-003 — Logical Restoration Proof**: `[INTERNAL]` Every failure after target movement MUST restore the captured prior target when one existed and MUST set `priorTargetRestored=true` only after the restored database passes SQLite integrity, foreign-key validation, and logical equality with the captured recovery snapshot. Recovery MUST NOT require byte-identical WAL/main representation and MUST NOT overwrite occupied unrelated target paths.
- **FR-004 — Bounded Concurrency Failure**: `[INTERNAL]` Apply MUST revalidate the moved recovery snapshot and target path set during the publication handoff, refuse candidate placement when observable state differs from the post-quiescence snapshot or target paths become occupied, retain the verified backup and bounded report, and classify locked/busy conditions with the existing close-host-and-rerun action. The importer MUST NOT claim that cross-platform filesystem publication is race-free after releasing SQLite locks.

## Success criteria

- **SC-001** `[buildable]`: A public-seam test starting from a sealed target fingerprint with a non-empty WAL completes with `committed=true`, one import receipt, all integrity booleans true, baseline preservation, and a valid recovery database.
- **SC-002** `[buildable]`: Failure injection after prior-target movement, after candidate movement, and before reopened verification restores the exact pre-import logical baseline with `integrity_check=ok`, zero foreign-key violations, no committed import receipt, and truthful `priorTargetRestored=true` for both DELETE and non-empty-WAL targets.
- **SC-003** `[buildable]`: Locked, checkpoint-busy, logically changed, or observably occupied publication states produce zero partial committed imports and retain a bounded failure report plus recoverable backup.
- **SC-004** `[buildable]`: All existing one-command defaults, optional mapping, explicit plan/apply, absent-target, replay, custody, quarantine, taxonomy, and ranking tests pass without schema, policy, report-schema, or CLI syntax changes.
- **SC-005** `[outcome]`: A separately authorized real cutover using `thoth-mem import-legacy` completes once from the user's conventional legacy source, and post-cutover SQLite integrity plus bounded recall inspection pass with the imported history available.

## Assumptions

- Logical baseline equality, SQLite integrity, foreign-key validity, and retained verified backup are the authoritative no-data-loss guarantees; byte-identical WAL/main layout is not a product requirement.
- All hosts using the current target remain required to stop before cutover. Without native OS locking, the importer detects and fails closed on observable activity but does not promise an impossible atomic lock across SQLite close and multi-file filesystem rename.
- The existing candidate construction, import receipts, mapping, taxonomy, privacy, quarantine, temporal, and retrieval contracts remain authoritative.

## Dependencies

- Existing `planLegacyImport`, `applyLegacyImport`, verified backup/candidate, report v3, plan v4, and SQLite integrity helpers.
- SQLite checkpoint and locking behavior exposed by `better-sqlite3`; no native addon or new dependency is introduced.

## Out of scope

- Automatically terminating Codex, OpenCode, Claude Code, or arbitrary database clients.
- Adding native filesystem/database locking, changing SQLite schema, or replacing the candidate-publication architecture with an in-place merge.
- Changing mapping defaults, quarantine policy, imported taxonomy, ranking, MCP tools, report schema, or CLI syntax.
- Running the real legacy cutover as part of implementation verification; that remains a separate stateful operation.
