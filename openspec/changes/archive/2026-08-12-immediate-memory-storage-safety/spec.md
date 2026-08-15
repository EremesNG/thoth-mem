# Feature Specification: Immediate Memory Storage Safety

**Change ID**: `immediate-memory-storage-safety`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Operators with long-lived databases need schema upgrades, synchronization journaling, and operational tracing to remain correct and bounded. A legacy schema currently permits primary records to succeed without their required sync mutations, while successful liveness probes can accumulate unbounded trace rows.<br>
**Impact**: Legacy databases converge to the current sync schema; primary writes become fail-closed when their sync mutation cannot commit; operators gain explicit preview/apply repair and trace-retention controls; successful `GET /health` probes stop producing trace rows; successful traces default to seven-day retention and error traces to thirty-day retention. This intentionally changes the failure behavior of writes that previously appeared successful despite journal failure.<br>
**Affected capabilities**: `store`, `sync`, `observability`, `config`, `cli`, `http-api`

## User stories

### US1 - Trust every successful durable write (Priority: P1)

As an operator, I can trust that a successful observation, prompt, or session write includes its ordered synchronization mutation so that later incremental synchronization cannot silently omit committed state.

**Independent test**: Open a legacy fixture whose `sync_mutations` table lacks `project`, verify startup converges the schema, force mutation persistence to fail and observe that the corresponding primary write also fails, then import an inbound chunk and observe zero outbound-journal growth.

**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a legacy database with `sync_mutations` but no `project` column, **When** the current store opens it one or more times, **Then** the column and current indexes exist without duplicate-column failures or data loss.
2. **Given** a create, update, or delete whose mutation insert fails or lacks a non-empty stable identity, **When** the public write is attempted, **Then** it fails and neither the primary change nor a partial mutation is committed.
3. **Given** a primary write and its mutation can both persist, **When** the public write returns success, **Then** the matching ordered journal event contains a non-empty stable identity and is visible to incremental export.
4. **Given** an inbound legacy or V2 sync import, **When** it creates or enriches a session while applying remote state, **Then** it does not append a new outbound mutation or create a replication loop.

### US2 - Repair sync-visible legacy gaps explicitly (Priority: P1)

As an operator, I can preview and explicitly repair sync-eligible records missing current-state journal coverage so that historical gaps become exportable without fabricating identities or changing memory content.

**Independent test**: Seed active and deleted records with stable sync identities but missing journal coverage, preview a bounded scope, apply the repair, verify the reported events are appended and exportable, then repeat the operation and observe zero additional repairs.

**Covers**: FR-004, FR-005, FR-006, FR-007, FR-015, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** sync-eligible rows with stable identities and missing current-state journal coverage, **When** an operator requests repair preview for exactly one project or all projects, **Then** the system reports bounded counts by entity and operation without mutating any row.
2. **Given** an unchanged repair preview, **When** the operator explicitly applies the same scope with the preview's selection fingerprint, **Then** the system appends deterministic current-state mutations for exactly the reported rows without changing their memory content, titles, identities, timestamps, or deletion state.
3. **Given** a successfully repaired scope, **When** repair is previewed or applied again, **Then** zero duplicate repair mutations are created.
4. **Given** a legacy record without a stable sync identity, **When** repair evaluates it, **Then** the record is reported as ineligible and no identity is allocated implicitly.
5. **Given** an operator has not selected apply mode, **When** either administrative surface is invoked, **Then** the operation remains read-only.
6. **Given** candidates change after preview or the supplied fingerprint is missing or stale, **When** apply is attempted, **Then** it fails before writes and requires a fresh preview.
7. **Given** a downstream store has a tombstoned observation with the repaired stable identity while the source observation is active, **When** it imports the repaired current-state event, **Then** the observation is idempotently restored to the active source state.

### US3 - Keep liveness checks from becoming telemetry data (Priority: P1)

As an operator, I can run owner and non-owner HTTP bridge liveness checks without creating durable trace amplification while retaining traces for meaningful HTTP and MCP work.

**Independent test**: Exercise repeated successful `GET /health` requests and another traced HTTP route, then observe zero health traces and the expected non-health trace.

**Covers**: FR-008, FR-014, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** the owner bridge is healthy, **When** a non-owner polls `GET /health` repeatedly, **Then** no operation trace is persisted for those requests.
2. **Given** a meaningful HTTP operation completes, **When** tracing runs, **Then** its sanitized bounded trace remains available through the existing list and detail contracts.
3. **Given** MCP tools are invoked, **When** their handlers complete or fail, **Then** their existing trace contract remains unchanged.

### US4 - Enforce bounded operation-trace retention safely (Priority: P1)

As an operator, I can preview and explicitly prune expired operation traces under a conservative status-aware policy so that storage growth is bounded without erasing recent failures or touching memory records.

**Independent test**: Seed traces on both sides of the success and error cutoffs, preview the policy at a fixed clock, apply the bounded deletion, and verify exact preview/apply agreement, preservation rules, continuation state, and repeat safety.

**Covers**: FR-009, FR-010, FR-011, FR-012, FR-013, SC-007, SC-008, SC-009, SC-010

**Acceptance scenarios**:

1. **Given** default configuration, **When** retention is previewed at a fixed instant, **Then** successful traces older than seven days and error traces older than thirty days are eligible while newer rows are protected.
2. **Given** more eligible rows than one run may delete, **When** apply is invoked, **Then** only the deterministic bounded batch is deleted and the result reports that eligible rows remain.
3. **Given** an unchanged preview whose eligible set fits within one run, **When** apply supplies the preview fingerprint and exact effective instant so the same cutoffs are derived, **Then** it deletes exactly the previewed rows transactionally and no other table is changed.
4. **Given** no explicit apply selection, **When** the CLI or HTTP retention operation runs, **Then** it returns a preview and performs no deletion.
5. **Given** retention has removed all eligible rows, **When** it runs again at the same instant, **Then** zero rows are deleted and recent success and error traces remain queryable.

## Edge cases

- A legacy `sync_mutations` table may exist with rows and indexes but without `project`; repeated startup must remain idempotent.
- Existing mutation rows may have a null project even after the column is added; structural migration must not rewrite or discard them.
- A current record may have an update or delete mutation but no create mutation; the newest stable-identity event is sufficient when its operation is compatible with current state, and repair appends only a missing or state-incompatible current-state event.
- Soft-deleted observations require current-state delete coverage rather than an active-state create event.
- Records with null or malformed stable sync identities are ineligible for automatic repair and must be counted separately.
- Repair and concurrent writes must not produce duplicate coverage or allow a repair preview to authorize a different unreported identity set silently.
- Repair apply with a missing or mismatched expected fingerprint must fail before inserting a mutation.
- A mutation failure during maintenance-reflection creation is subject to the same fail-closed atomicity as user-authored writes.
- Trace timestamps exactly on a cutoff boundary must have deterministic eligibility, documented as strictly older than the cutoff.
- Malformed trace timestamps must be preserved and reported as skipped rather than deleted by age inference.
- A retention run may contain fewer, equal, or more eligible rows than its configured per-run maximum; ordering and continuation must be deterministic.
- The trace-retention request itself may be traced after completion, but that new trace is recent and therefore ineligible for the run that created it.
- Trace-retention apply with a missing or mismatched expected fingerprint, changed policy, or different effective instant must fail before deleting a trace.
- Read-only store modes must never attempt structural migration, journal repair, or trace deletion.

## Functional requirements

- **FR-001 — Legacy Sync Mutation Schema Convergence**: `[ADDED store]` Writable startup MUST idempotently add the nullable `project` column to an existing `sync_mutations` table before any current-version mutation can be recorded, while preserving existing rows and indexes.
- **FR-002 — Atomic Primary and Journal Persistence**: `[ADDED store]` Every locally-originated sync-eligible create, update, and delete of an observation, prompt, or session MUST commit its primary change and ordered mutation in one transaction or roll back both; inbound sync application remains an idempotent replication boundary and MUST NOT be re-journaled by this requirement.
- **FR-003 — Fail-Closed Journal Contract**: `[ADDED sync]` A mutation-journal persistence failure or missing stable identity MUST propagate as an explicit failed local write and MUST NOT be converted into a successful, null-identity, or merely logged primary operation. Inbound legacy/V2 import MUST use an origin-aware non-journaling path and MUST produce zero outbound mutation growth from applied remote state.
- **FR-004 — Deterministic Journal Repair Preview**: `[ADDED sync]` The system MUST provide a read-only repair preview for exactly one project or all projects that identifies current sync-eligible records with stable identities lacking sufficient journal coverage, reports active/delete repair counts by entity type, bounds any returned identifiers, and returns a deterministic selection fingerprint that binds scope and the ordered candidate batch.
- **FR-005 — Idempotent Journal Repair Apply and Convergence**: `[ADDED sync]` Explicit repair apply MUST require the expected preview fingerprint, re-evaluate under an immediate transaction, fail without writes on mismatch, append current-state mutations for exactly the bound candidates, preserve primary source memory state, avoid duplicates on repeated runs, and report repaired, skipped, and remaining counts. Inbound application of a repaired non-delete observation event MUST idempotently upsert by stable identity and restore a matching soft-deleted row to the active payload state.
- **FR-006 — Journal Repair CLI Administration**: `[ADDED cli]` The CLI MUST expose `repair-sync-journal` with exactly one `--project <name>` or `--all` scope, default preview behavior, explicit `--apply --expected-fingerprint <sha256>`, bounded output, and non-zero exit on validation, stale-preview, or persistence failure.
- **FR-007 — Journal Repair HTTP Administration**: `[ADDED http-api]` The HTTP API MUST expose separate journal-repair preview and apply operations with the same scopes, result fields, validation, and failure semantics as the store and CLI contracts; apply MUST require `expected_fingerprint` and return conflict without writes when stale.
- **FR-008 — Health Trace Exclusion**: `[ADDED observability]` Successful and failed `GET /health` route handling MUST NOT persist operation-trace rows, while the health response and bridge takeover behavior remain unchanged.
- **FR-009 — Status-Aware Trace Retention Policy**: `[ADDED observability]` Operation-trace retention MUST use independent UTC age cutoffs for successful and error traces, with strictly-older-than eligibility and deterministic oldest-first ordering.
- **FR-010 — Transactional Bounded Trace Pruning**: `[ADDED store]` The system MUST provide trace-retention preview and explicit apply operations. Preview MUST return its effective instant and a fingerprint binding scope, effective policy/cutoffs, and ordered selected batch. Apply MUST require both values, re-evaluate under an immediate transaction, fail without writes on mismatch, delete at most the configured per-run maximum transactionally, and report before, eligible, deleted, remaining, skipped, and after counts.
- **FR-011 — Conservative Trace Retention Defaults**: `[ADDED config]` Configuration MUST default successful trace retention to seven days, error trace retention to thirty days, and a finite positive per-run deletion maximum; explicit environment and persisted configuration overrides MUST follow existing precedence and validation behavior.
- **FR-012 — Trace Retention CLI Administration**: `[ADDED cli]` The CLI MUST expose `prune-operation-traces` with exactly one `--project <name>` or `--all` scope, default preview behavior, explicit `--apply --expected-fingerprint <sha256> --effective-now <UTC-ISO>`, effective policy output, bounded counts, and non-zero exit on validation, stale-preview, or deletion failure.
- **FR-013 — Trace Retention HTTP Administration**: `[ADDED http-api]` The HTTP API MUST expose separate operation-trace retention preview and apply operations with the same scopes, effective policy, result fields, validation, and failure semantics as the store and CLI contracts; apply MUST require `expected_fingerprint` and `effective_now` and return conflict without writes when stale.
- **FR-014 — Existing Trace Contracts Remain Intact**: `[ADDED observability]` Non-health HTTP and MCP traces MUST retain existing sanitization, truncation, privacy, metrics, non-recursion, filtering, listing, and detail behavior after health exclusion and retention are introduced.
- **FR-015 — Live Database Repair Requires Separate Authorization**: `[INTERNAL]` Repository implementation and automated tests MUST use disposable fixtures only and MUST NOT invoke journal repair, trace pruning, schema-changing commands, or file compaction against the operator's live data directory.

## Success criteria

- **SC-001** `[buildable]`: A fixture with a populated legacy `sync_mutations` table lacking `project` opens twice successfully, preserves its rows, exposes the new column and indexes, and records a current mutation containing project identity.
- **SC-002** `[buildable]`: All forced journal failures across representative observation, prompt, session, and maintenance-reflection writes return failure and leave zero partial primary or journal rows; successful controls commit both with non-empty stable identities; inbound legacy/V2 import produces zero outbound-journal growth.
- **SC-003** `[buildable]`: Repair tests demonstrate preview performs zero writes, apply with the expected fingerprint creates exactly the previewed current-state events, stale or missing fingerprints create zero events, repeated apply creates zero duplicates, ineligible identities are reported, and an export/import round trip restores an active repaired observation over a downstream tombstone.
- **SC-004** `[outcome]`: After release and separate operator authorization, the known legacy database reports all 44 missing maintenance-reflection journal events as repairable and applies them with zero observation-content changes.
- **SC-005** `[buildable]`: Repeated owner/non-owner health checks create zero `GET /health` traces, while one meaningful HTTP operation and representative MCP calls continue to produce their expected sanitized traces.
- **SC-006** `[outcome]`: A continuously running non-owner bridge produces zero durable trace growth attributable to liveness polling over a twenty-four-hour observation window.
- **SC-007** `[buildable]`: At the preview's fixed effective clock and fingerprint, retention preview and apply agree on 100% of the deterministic batch; missing/stale preconditions delete zero rows; only successes older than seven days and errors older than thirty days are deleted; malformed, boundary, recent, and out-of-scope traces remain.
- **SC-008** `[buildable]`: All CLI, HTTP, route catalog, OpenAPI, and MCP-registry contract tests pass, prove both admin workflows require preview-bound apply preconditions, return stale-preview conflict without writes, and add zero MCP tools.
- **SC-009** `[buildable]`: Configuration tests prove 7/30-day defaults, override precedence, invalid-value fallback, and a finite positive per-run maximum.
- **SC-010** `[outcome]`: An authorized production preview can identify the historical health-trace backlog as eligible while reporting zero observation, prompt, session, embedding, graph, and sync-journal deletions.

## Assumptions

- `sync_id` or the existing session identity is the stable identity boundary for repair; this change does not invent identities for legacy rows that lack one.
- Appending a current-state create or delete mutation after the latest export watermark is sufficient to make the present row state converge through the existing idempotent importer.
- A preview is advisory until apply supplies its exact fingerprint; retention also supplies the preview's exact effective instant. Any intervening candidate or policy change invalidates apply and requires a new preview.
- Inbound observation create/update envelopes are convergence operations by stable identity: they may insert a missing row or update/restore an existing soft-deleted row, and replay remains idempotent.
- Sufficient repair coverage is evaluated from the newest journal event with the same stable identity: `create`/`update` is compatible with an active row and `delete` with a soft-deleted observation. Because historical mutation rows contain no payload hash, repair does not claim to infer a stale payload hidden behind an already compatible event.
- Successful `GET /health` traces have no durable diagnostic value; liveness failure is already observable to the polling caller and takeover loop.
- Retention is explicit and operator-triggered in this change; no background scheduler is introduced.
- The finite per-run maximum will use an implementation-selected conservative default documented in configuration and output.
- Existing trace privacy and payload bounds remain authoritative for all retained traces.

## Dependencies

- Existing SQLite transaction, migration, sync export/import, operation tracing, configuration precedence, CLI parsing, HTTP routing, route catalog, and OpenAPI infrastructure.
- No new external runtime dependency.

## Out of scope

- Running repair, pruning, `VACUUM`, `VACUUM INTO`, or any other mutation against `C:\Users\EremesNG\.thoth\thoth.db` during implementation or verification.
- Physical SQLite file compaction or automatic page reclamation after logical trace deletion.
- Retention or deletion of observations, prompts, sessions, versions, embeddings, semantic chunks/sentences/jobs, FTS content, knowledge-graph data, maintenance metadata, sync chunks, or sync mutations.
- Allocating new stable sync identities to legacy rows that lack them.
- Reconstructing hard-deleted rows or historical payload freshness that is not represented in the existing mutation journal.
- Automatic startup journal backfill beyond the structural `project` column migration.
- A background trace-retention scheduler, health-trace sampling/aggregation, or new telemetry summary tables.
- Dashboard controls or dashboard layout changes for the new admin operations.
- Adding repair or retention to the six-tool MCP surface.
