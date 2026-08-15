# Implementation Plan: Immediate Memory Storage Safety

## Technical context

`thoth-mem` stores primary memory state and its incremental-sync journal in the same SQLite database, but the current writable-startup migrator does not add `sync_mutations.project` to legacy databases even though the fresh schema and mutation insert require it. `Store.recordMutation()` also catches insertion failures, so several public writers can commit primary state while silently omitting the convergence event. The affected local-writer inventory includes observation create/upsert/update/delete and duplicate refresh, prompt create, session create/enrichment/end/checkpoint, maintenance reflection creation, project migration, and project deletion. Inbound sync application remains a separate idempotent replication boundary and is not re-journaled by this change.

The HTTP bridge currently persists a trace for every matched route while non-owner bridges poll `GET /health` every five seconds. In the inspected live database this produced more than one million successful health traces and made `operation_traces` the dominant storage consumer. This change does not mutate that live database. It adds explicit, preview-first administration that can be exercised later only under separate operator authorization.

The implementation stays within the existing strict TypeScript/ESM, `better-sqlite3`, CLI, HTTP route catalog, and OpenAPI patterns. It adds no dependency, scheduler, dashboard control, or MCP tool. Read-only Store openings remain mutation-free.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Both new workflows are administrative Store operations exposed only through CLI and HTTP; the six registered MCP tools remain unchanged.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Retrieval code and its lexical/KG degradation paths are untouched; repair and retention use deterministic SQLite ordering and explicit skipped/degraded counts.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Schema, journal, CLI, and HTTP behavior remain host-neutral, and each new CLI administration operation has an equivalent REST operation.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall behavior and limits are unchanged; new administrative results expose exact counts plus bounded identifier samples rather than unbounded row payloads.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The design is additive at the CLI/HTTP/schema level, removes no route or command, and documents the intentional correction from false write success to explicit failure.

## Design

### 1. Converge the legacy schema before journaling

- Add `sync_mutations.project TEXT` to `LEGACY_COLUMN_MIGRATIONS` in `src/store/migrations.ts`. The existing table/column introspection and migration transaction make repeated startup idempotent and preserve all rows and indexes.
- Keep fresh creation in `src/store/schema.ts` authoritative. Add no startup backfill and no data rewrite; old mutation rows retain nullable `project` values.
- Read-only Store mode continues to bypass migration entirely.

### 2. Make local primary writes and journal events one commit boundary

- Change the private `Store.recordMutation()` helper in `src/store/index.ts` to accept only a validated non-empty `string` stable identity and to throw a contextual error instead of logging and returning. SQLite remains the source error/cause; null-identity events cannot be inserted.
- Wrap every locally-originated sync-eligible primary change and its matching mutation in one `better-sqlite3` transaction. Existing outer transactions may use nested savepoints; no caller may observe primary success without the journal row.
- Introduce an origin-aware internal session-row helper that distinguishes `local` from `inbound`. Public `ensureSession()` and `startSession()` use `local`, distinguish create, real enrichment update, and no-op, and emit create/update mutations only for actual changes. `importData()` and `applyV2Chunk()` use `inbound`, may ensure a referenced session inside their existing import transaction, and emit no outbound mutation.
- Keep prompt insertion and its mutation together; keep observation insert, topic-key upsert, duplicate refresh, update, soft delete, and hard delete with their respective mutations; keep session end/checkpoint with their update mutations.
- Keep maintenance reflection and project deletion inside their existing outer transactions. Move any mutation currently emitted after commit into the transaction. Maintenance-reflection updates load and validate the persisted observation `sync_id` instead of journaling `null`; a missing identity fails before the primary update.
- Extend `migrateProject()` to preflight every affected observation and prompt before mutation. If any affected row lacks a non-empty stable `sync_id`, fail the entire migration before changing primary rows or journaling. Otherwise append mutations for sessions, prompts, and active observations as `update`, and for soft-deleted observations as `delete`, all inside the same migration transaction.
- Do not re-journal `applyV2Chunk()` or legacy `importData()` inbound replication effects. Focused tests assert total `sync_mutations` count is unchanged by inbound application, including implicit session creation/enrichment.

### 3. Add deterministic, idempotent journal-gap repair

- Add Store-domain types in `src/store/types.ts` and Store methods in `src/store/index.ts` for preview and apply. Scope is the discriminated union `{ project: string } | { all: true }`.
- Evaluate only rows currently present in `observations`, `user_prompts`, and `sessions`. Observation/prompt `sync_id` and session `id` must be non-empty stable identities. No identity is generated.
- Define sufficient coverage by the newest mutation with the same entity type and stable `sync_id`: active rows are covered by `create` or `update`; soft-deleted observations are covered by `delete`. An absent or state-incompatible latest event becomes one repair candidate. This intentionally repairs observable journal gaps; it does not claim to reconstruct deleted rows that no longer exist or infer payload history absent from the journal.
- Derive the repair operation deterministically: soft-deleted observation → `delete`; live row with no valid history → `create`; live row with valid but state-incompatible history → `update`.
- Sort by entity type, entity id, and stable identity; cap one repair run at 10,000 events; return exact per-entity/per-operation counts, `ineligible_identity`, and `skipped`, where `skipped` counts scanned rows whose newest compatible journal event already covers their current state. The invariant is `scanned = candidates + skipped + ineligible_identity`; `remaining = candidates - selected`. Also return `has_more`, a SHA-256 selection fingerprint binding scope, batch limit, and every ordered candidate tuple, plus at most 50 identifier samples. Even an empty selection has a fingerprint.
- Preview performs only reads. Apply requires `expected_selection_fingerprint`, recomputes the candidate batch inside one immediate transaction, and compares before inserting. A missing/malformed/mismatched fingerprint throws `StaleAdminPreviewError` before writes; HTTP maps it to `409 Conflict`, and CLI exits non-zero. The just-inserted compatible latest events make repeated preview safe; applying an already-consumed fingerprint fails and requires a fresh preview.
- Appended mutation IDs are greater than the current export watermark, so the existing incremental exporter will load and emit current row state or a tombstone without any exporter-specific backfill path.
- Update `applyV2Chunk()` observation non-delete handling to converge by `sync_id`: insert when absent, update when present, and restore a soft-deleted row when the incoming current payload has `deleted_at: null`. Both `create` and `update` remain replay-idempotent, refresh derived state only after an actual convergent change, and never append outbound mutations. A source-repair → incremental export → tombstoned-target import test proves active-state resurrection.

### 4. Exclude liveness routes from durable tracing

- Add `trace?: boolean` to the internal `RouteDefinition` in `src/http-server.ts`, defaulting to traced, and set only `GET /health` to `trace: false`.
- Route all matched-route success and error trace calls through one conditional helper. This excludes both successful and failed health handling while retaining 404, non-health HTTP, MCP, sanitization, truncation, metrics, list/detail, and takeover behavior.
- Keep the health response and five-second non-owner polling interval unchanged.

### 5. Add status-aware bounded trace retention

- Add `OperationTraceRetentionConfig` to `src/config.ts`, `ThothConfig`, persisted config merge/default generation, Store config merge, and `config.schema.json`.
- Export `DEFAULT_OPERATION_TRACE_RETENTION_CONFIG` with `successRetentionDays: 7`, `errorRetentionDays: 30`, and `maxRowsPerRun: 50_000`.
- Resolve environment overrides before persisted values using `THOTH_OPERATION_TRACE_SUCCESS_RETENTION_DAYS`, `THOTH_OPERATION_TRACE_ERROR_RETENTION_DAYS`, and `THOTH_OPERATION_TRACE_MAX_ROWS_PER_RUN`. Each value must be an integer of at least one; invalid values fall back through existing resolution behavior.
- Preview captures one effective UTC instant and derives canonical ISO cutoffs. A trace is eligible only when `started_at` is canonical UTC ISO-8601, its status is `ok` or `error`, and it is strictly older than its status cutoff. Boundary, recent, malformed/noncanonical, unsupported-status, and out-of-scope rows are preserved and counted.
- Select exact batches oldest-first by `started_at ASC, id ASC`, with project equality for project scope and all rows (including null project) for all scope. Reuse the existing `(started_at, id)` index; do not add another large trace index.
- Preview returns the transaction-snapshot counts, exact `effective_now`, effective policy/cutoffs, and a SHA-256 fingerprint binding scope, instant, policy, cutoffs, limit, and ordered selected IDs, plus a bounded sample without writes. Apply requires `expected_selection_fingerprint` and the preview's exact `effective_now`, derives policy/cutoffs again, reselects inside one immediate transaction, and compares the fingerprint before deletion. Missing/malformed/mismatched preconditions throw `StaleAdminPreviewError` before writes. A matching apply deletes no more than the selected 50,000 IDs in SQLite-safe chunks and reports before, eligible, selected, deleted, remaining, skipped, after-at-commit, `has_more`, policy, effective instant, and fingerprint.
- The HTTP request trace for a retention call is written after the Store result is computed. It is recent and outside the reported transaction snapshot, so it cannot be selected by the run that triggered it.

### 6. Expose additive CLI and HTTP administration

- Add CLI commands in `src/cli.ts` and dispatch registration in `src/index.ts`:
  - `repair-sync-journal --project <name>|--all [--apply --expected-fingerprint <sha256>]`
  - `prune-operation-traces --project <name>|--all [--apply --expected-fingerprint <sha256> --effective-now <UTC-ISO>]`
- Both commands default to preview, reject missing/conflicting scopes, reject partial or malformed apply preconditions, print bounded Markdown summaries with copyable fingerprint/instant values, and propagate stale-preview/Store errors to the existing non-zero CLI failure path.
- Add handlers and operation-catalog entries in `src/http-routes.ts`, route definitions in `src/http-server.ts`, and schemas/paths in `src/http-openapi.ts`:
  - `POST /sync/journal/repair/preview`
  - `POST /sync/journal/repair/apply`
  - `POST /operation-traces/retention/preview`
  - `POST /operation-traces/retention/apply`
- Each preview body contains exactly one scope selector (`project` or `all: true`). Repair apply additionally requires `expected_fingerprint`; retention apply requires `expected_fingerprint` and `effective_now`. Preview/apply response shapes are shared with the Store contract; stale apply maps to HTTP `409` with zero writes. No route invokes live data by default; it operates only on the Store opened for the caller's explicit `--data-dir` or running HTTP instance.

### 7. TDD and verification seams

Tests are written red-first against public behavior before each implementation slice:

1. A populated legacy database missing `sync_mutations.project` opens twice, preserves rows/indexes, and accepts a project-bearing mutation.
2. An abort trigger on `sync_mutations` proves representative observation, prompt, session, maintenance-reflection, project migration, and deletion writers roll back primary and journal effects; successful controls commit both with non-empty identities. Project migration additionally fails before writes when any affected observation or prompt lacks a stable identity and journals soft-deleted observations as `delete`. Inbound legacy/V2 import tests prove implicit sessions and remote entity application add zero outbound journal rows.
3. Repair preview/apply tests cover active/create, state-mismatch/update, soft-delete/tombstone, null identity, project/all scope, deterministic ordering/fingerprint, missing/stale fingerprint rejection, 10,000-row continuation, repeat safety, and a source export → tombstoned target import resurrection round trip.
4. HTTP bridge tests prove repeated health requests (including the non-owner poll path) create zero health traces while a meaningful HTTP route still traces normally.
5. Trace-retention Store tests use a fixed preview clock and cover required fingerprint/effective-instant binding, stale/missing precondition rejection, policy drift, success/error cutoffs, exact boundary, malformed timestamps, project/null-project scope, deterministic 50,000-row continuation, preview immutability, transaction rollback, and repeat safety.
6. Config, CLI, HTTP route catalog, OpenAPI, and MCP registry tests prove default/override validation, preview-bound apply inputs, HTTP `409` on stale previews, bounded output, and exactly six MCP tools.

Focused tests run first, followed by the repository-required build and broader test commands from `docs/agent/testing.md`. A fresh Oracle performs final read-only verification; the implementation writer does not self-approve.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add the missing nullable column through the idempotent legacy-column migrator before current inserts. | `src/store/migrations.ts`, `src/store/schema.ts` | Populated legacy fixture, two openings, row/index preservation, current insert. |
| FR-002 | Put each locally-originated primary mutation and journal row in the same SQLite transaction/savepoint, including project migration with identity preflight and state-compatible operations. | `src/store/index.ts` public writers and `recordMutation()` | Abort-trigger rollback matrix, identity-less migration rejection, soft-delete migration event, plus successful controls. |
| FR-003 | Remove catch-and-log success, require non-empty identities before local writes, and isolate inbound session/entity application from outbound journaling. | `src/store/index.ts#recordMutation`, project-migration preflight, origin-aware session helper, import paths | Public local calls throw/roll back; inbound import causes zero journal growth. |
| FR-004 | Deterministic current-row evaluator, exact scope, bounded batch/sample, and scope-bound fingerprint, with no writes. | `src/store/types.ts`, `src/store/index.ts` | Preview row/mutation counts unchanged; ordered expected candidates and stable empty/non-empty fingerprints. |
| FR-005 | Require expected fingerprint under immediate transaction; upsert/resurrect repaired non-delete observations on inbound apply. | `src/store/index.ts` repair and `applyV2Chunk` paths | Mismatch writes zero; matching apply exact; export/import round trip restores active state; replay idempotent. |
| FR-006 | Add preview-first `repair-sync-journal` CLI with required apply fingerprint. | `src/cli.ts`, `src/index.ts` | CLI scope/precondition/output/stale/failure tests. |
| FR-007 | Add separate repair preview/apply REST operations with conflict semantics. | `src/http-routes.ts`, `src/http-server.ts`, `src/http-openapi.ts` | Handler, route catalog, OpenAPI, validation, `409`, and zero-write tests. |
| FR-008 | Mark health route non-traceable at route metadata boundary. | `src/http-server.ts` | Owner/non-owner repeated health tests report zero trace rows. |
| FR-009 | Use fixed UTC status cutoffs, canonical timestamps, strict age, oldest-first ordering. | `src/config.ts`, `src/store/index.ts` | Fixed-clock cutoff/boundary/malformed/order tests. |
| FR-010 | Bind preview to fingerprint/effective instant/policy; validate under immediate transaction before bounded chunked deletion. | `src/store/types.ts`, `src/store/index.ts` | Exact selection agreement; missing/stale/policy-drift inputs delete zero; rollback, continuation, unrelated-table invariants. |
| FR-011 | Add 7/30/50,000 defaults and env/persisted precedence. | `src/config.ts`, `config.schema.json`, Store config merge | Defaults, precedence, invalid fallback, schema tests. |
| FR-012 | Add preview-first `prune-operation-traces` CLI with required fingerprint/effective instant and policy output. | `src/cli.ts`, `src/index.ts` | CLI preview/apply/scope/precondition/stale/failure/bounded output tests. |
| FR-013 | Add separate retention preview/apply REST operations with conflict semantics. | `src/http-routes.ts`, `src/http-server.ts`, `src/http-openapi.ts` | Handler, catalog, OpenAPI, scope, precondition, `409`, and result-shape tests. |
| FR-014 | Preserve all non-health trace writers/readers and MCP instrumentation. | `src/http-server.ts`, existing trace Store APIs | Existing trace suite plus non-health HTTP/MCP regression tests. |
| FR-015 | Use only in-memory/temp fixtures; keep production execution and compaction out of implementation. | Tests and execution procedure | Git diff/command audit; no command targets `C:\\Users\\EremesNG\\.thoth`. |

## Optional support artifacts

- `research.md`: Not needed; the Full exploration phase resolved the repository behavior and no external dependency or unsettled technology choice remains.
- `data-model.md`: Required to make repair sufficiency, idempotence, batch selection, cutoff, and count semantics executable rather than implicit.
- `contracts/`: Required because two CLI commands and four REST routes add public request/response contracts whose exact names and validation must agree across tests.
- `quickstart.md`: Not needed; live execution is intentionally outside this change and requires separate authorization rather than an operator walkthrough here.

## Risks and migrations

- **Legacy migration cost/failure**: `ALTER TABLE ... ADD COLUMN` is additive and transactionally guarded. If startup fails, SQLite rolls back the migration and the Store does not open writable. Rolling code back leaves an unused nullable column, which older code tolerates.
- **Broader rollback behavior**: Callers that previously received false success will now receive an error. Tests cover each public writer boundary; no degraded-success mode is retained because the user selected fail-closed semantics.
- **Nested transactions**: Session helpers and reflection paths can run under existing transactions. `better-sqlite3` nested transactions use savepoints; focused rollback tests guard against accidental partial commits.
- **Historical repair observability**: The existing journal does not store payload hashes, so repair can prove missing or state-incompatible event coverage but cannot reconstruct already-hard-deleted rows or infer every historical payload version. Future writes are protected atomically; the explicit limitation is reported, not hidden.
- **Concurrent/stale administration**: Both apply paths require preview outputs, then recompute and compare a context-bound fingerprint under an immediate transaction before mutation. Competing writers, clock/policy changes, replayed fingerprints, or different scopes fail closed and require a fresh preview.
- **Inbound replication loops**: A dedicated inbound session/entity path never calls the local journal helper. Tests compare total mutation counts before/after legacy and V2 imports, including resurrection.
- **Resurrection semantics**: Non-delete observation envelopes become idempotent upserts by stable identity so a repaired active source can override an earlier tombstone. Tests cover missing, active, and soft-deleted targets and derived-state refresh.
- **Large trace backlog**: Deletion is explicit, oldest-first, capped at 50,000, and chunked below SQLite parameter limits. Operators rerun while `has_more` is true. No automatic `VACUUM` follows.
- **Irreversible logical deletion**: Preview is the default and apply is explicit. Automated tests use disposable stores. A later live apply should be preceded by the operator's own backup; this implementation does not create or mutate that backup.
- **HTTP count timing**: Retention results describe the commit snapshot; the route's own recent trace may appear immediately afterward. Contract fields name this boundary explicitly.
- **Rollback**: Code rollback stops new admin operations and restores old behavior, but cannot restore traces already explicitly pruned. No other primary-memory table is touched by retention.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The concrete file map adds Store, CLI, and HTTP administration only, and registry verification explicitly locks the MCP surface at six tools.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — The completed design leaves retrieval untouched and defines deterministic ordering, fixed clocks, explicit skipped reasons, and fail-closed persistence rather than silent degradation.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Repair and retention contracts are expressed in host-neutral Store types with equivalent CLI and HTTP surfaces and no harness adapter changes.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall contracts remain unchanged, while both new administrative workflows cap mutation/deletion batches and identifier samples.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Exact additive command/route names are documented, existing commands/routes remain, and the only incompatible behavior is a specified correctness fix that converts invalid false success into explicit failure.
