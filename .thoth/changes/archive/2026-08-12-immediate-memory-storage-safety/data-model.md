# Data Model: Immediate Memory Storage Safety

## 1. Sync mutation structural migration

The current logical row remains:

```text
sync_mutations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation 'create'|'update'|'delete',
  entity_type 'observation'|'prompt'|'session',
  entity_id INTEGER,
  sync_id TEXT NULL,
  project TEXT NULL,
  created_at TEXT
)
```

Legacy convergence adds only `project TEXT`. It does not backfill, rewrite, or delete existing journal rows.

## 2. Atomic local-write invariant

For a locally-originated sync-eligible change:

```text
BEGIN / SAVEPOINT
  mutate primary row and any required derived state
  insert exactly one ordered sync_mutations row for the resulting primary state
COMMIT / RELEASE
```

Any error rolls back the whole boundary. `recordMutation` accepts only a non-empty stable identity; a local writer cannot emit a null-identity event. A no-op primary call emits no mutation.

Project migration preflights every affected observation and prompt identity before changing any row. A null or blank stable identity aborts the whole migration with zero primary or journal writes. When preflight succeeds, sessions, prompts, and active observations emit `update`; soft-deleted observations emit `delete` so the newest event remains compatible with current state.

Session row creation/enrichment has an explicit origin:

```ts
type PersistenceOrigin = 'local' | 'inbound';
```

`local` changes use the atomic journal invariant. `inbound` changes run only inside legacy/V2 import transactions and never call the journal helper, including implicit session creation. Applying remote state therefore produces zero outbound mutation growth.

## 3. Journal-repair model

### Scope

```ts
type SyncJournalRepairScope =
  | { project: string }
  | { all: true };
```

Exactly one variant is valid. Project matching is exact. `all` includes null-project rows.

### Current entity projection

| Entity | Stable identity | Current state | Project |
| --- | --- | --- | --- |
| observation | non-empty `observations.sync_id` | `active` when `deleted_at IS NULL`, otherwise `deleted` | nullable `observations.project` |
| prompt | non-empty `user_prompts.sync_id` | `active` | nullable `user_prompts.project` |
| session | non-empty `sessions.id` | `active` | non-null `sessions.project` |

Null/blank identities are ineligible and counted. Repair never generates identities.

### Coverage and candidate rule

For each eligible current row, load the newest journal event ordered by `sync_mutations.id DESC` whose `entity_type` and non-empty `sync_id` equal the current stable identity.

| Current state | Sufficient newest operation | Repair operation when insufficient |
| --- | --- | --- |
| active, no valid history | none | `create` |
| active, valid history | `create` or `update` | `update` when newest is `delete` |
| deleted observation | `delete` | `delete` when absent/newest is `create` or `update` |

An update or delete event can be sufficient without a historical create event because incremental export resolves non-delete payloads from the current row and delete payloads from the stable tombstone identity. The evaluator repairs observable current-state event gaps, not unavailable historical payload versions or already-hard-deleted rows.

### Selection

- Order: entity type rank (`observation`, `prompt`, `session`), `entity_id`, stable identity.
- Maximum selected events per run: 10,000.
- Identifier sample maximum: 50.
- `selection_fingerprint`: `sha256:<lowercase-hex>` over canonical JSON containing the scope, 10,000-row limit, and ordered tuples `(entity_type, entity_id, sync_id, repair_operation)` for the selected batch. Empty selection is fingerprinted too.
- `has_more`: total eligible candidates is greater than selected candidates.

### Preview/apply result

```ts
interface SyncJournalRepairResult {
  dry_run: boolean;
  scope: { project: string } | { all: true };
  max_rows_per_run: 10_000;
  selection_fingerprint: string;
  counts: {
    scanned: number;
    candidates: number;
    selected: number;
    repaired: number;
    remaining: number;
    skipped: number;
    ineligible_identity: number;
    by_entity: Record<'observation' | 'prompt' | 'session', number>;
    by_operation: Record<'create' | 'update' | 'delete', number>;
  };
  has_more: boolean;
  samples: Array<{
    entity_type: 'observation' | 'prompt' | 'session';
    entity_id: number;
    sync_id: string;
    operation: 'create' | 'update' | 'delete';
  }>;
}
```

Preview sets `repaired=0`. Apply input is bound to that preview:

`skipped` counts scanned rows whose newest event already provides compatible current-state coverage, while `ineligible_identity` counts rows excluded because their stable identity is null, blank, or malformed. These categories are disjoint: `scanned = candidates + skipped + ineligible_identity`. `remaining` is `candidates - selected`, and a successful apply reports `repaired = selected`.

```ts
interface ApplySyncJournalRepairInput {
  scope: SyncJournalRepairScope;
  expected_selection_fingerprint: string;
}
```

Apply validates fingerprint syntax, recomputes the full selection and fingerprint in an immediate transaction, and compares before insertion. Missing/malformed/mismatched input throws `StaleAdminPreviewError` and writes nothing. After matching insertion, the same current state has sufficient newest coverage; the consumed fingerprint is stale, while a fresh empty preview can be safely applied with zero additions.

### Inbound active-state convergence

For observation `create` and `update` envelopes, inbound V2 application converges by stable `sync_id`:

- no matching row: insert the payload;
- matching active row: update portable payload fields idempotently;
- matching soft-deleted row and payload `deleted_at: null`: update fields and clear the tombstone, then refresh derived state;
- replayed equivalent payload: no duplicate row and no outbound mutation.

This upsert/resurrection rule allows a repaired active-state event to override a previously imported tombstone. Delete envelopes retain tombstone behavior.

## 4. Operation-trace retention configuration

```ts
interface OperationTraceRetentionConfig {
  successRetentionDays: number; // default 7, integer >= 1
  errorRetentionDays: number;   // default 30, integer >= 1
  maxRowsPerRun: number;        // default 50_000, integer >= 1
}
```

Resolution precedence is environment, persisted config, default.

## 5. Trace-retention model

### Scope and policy

The scope union matches repair. Each evaluation captures one `effective_now` in UTC, then derives:

```text
success_cutoff = effective_now - successRetentionDays
error_cutoff   = effective_now - errorRetentionDays
```

Eligibility is strictly older than the applicable cutoff. Equality is protected.

### Canonical timestamp rule

Only native canonical UTC ISO-8601 millisecond timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`) participate in age deletion. Null, malformed, noncanonical, or unsupported-status rows remain stored and contribute to `skipped` counts. This conservative rule prevents age inference from deleting ambiguous data while preserving index-friendly lexical ordering.

### Selection and deletion

- Filter by exact project or all scope.
- Filter `status='ok' AND started_at < success_cutoff` or `status='error' AND started_at < error_cutoff`.
- Order by `started_at ASC, id ASC`.
- Select at most `maxRowsPerRun`.
- Fingerprint canonical JSON containing scope, exact effective instant, resolved policy/cutoffs, maximum, and ordered selected IDs plus immutable selection fields. Empty selection is fingerprinted too.
- Apply reselects in an immediate transaction and deletes selected IDs in chunks of at most 500, still within the single transaction.
- No table other than `operation_traces` is mutated.

### Result

```ts
interface OperationTraceRetentionResult {
  dry_run: boolean;
  scope: { project: string } | { all: true };
  effective_now: string;
  policy: {
    success_retention_days: number;
    error_retention_days: number;
    max_rows_per_run: number;
    success_cutoff: string;
    error_cutoff: string;
  };
  selection_fingerprint: string;
  counts: {
    before_in_scope: number;
    eligible: number;
    selected: number;
    deleted: number;
    remaining_eligible: number;
    skipped_invalid_timestamp: number;
    skipped_unsupported_status: number;
    after_in_scope_at_commit: number;
  };
  has_more: boolean;
  sample_trace_ids: string[]; // at most 50
}
```

Preview sets `deleted=0` and `after_in_scope_at_commit=before_in_scope`. Apply input is bound to that preview:

```ts
interface ApplyOperationTraceRetentionInput {
  scope: SyncJournalRepairScope;
  expected_selection_fingerprint: string;
  effective_now: string;
}
```

Apply requires the exact canonical `effective_now` returned by preview, resolves current configuration, derives the cutoffs, reselects and re-fingerprints in an immediate transaction, and compares before deletion. A changed scope, candidate set, retention policy, limit, instant, or malformed/missing value throws `StaleAdminPreviewError` and deletes nothing. A successful apply reports the transaction snapshot. An HTTP trace for the retention route may be inserted after this snapshot and is intentionally not folded back into the completed result.

## 6. Health trace metadata

`RouteDefinition.trace` is internal routing metadata:

```ts
interface RouteDefinition {
  handler: HttpRouteHandler;
  method: string;
  pattern: string;
  trace?: boolean; // default true
}
```

Only `GET /health` sets `trace: false`. It creates no operation trace on either the success or error path.
