# Administrative Storage Contracts

## Shared scope validation

All four workflows accept exactly one of:

```json
{ "project": "project-name" }
```

```json
{ "all": true }
```

Missing scope, blank project, `all: false`, or both fields returns CLI failure / HTTP `400` and performs no writes.

## CLI

### `repair-sync-journal`

```text
thoth-mem repair-sync-journal --project <name> [--apply --expected-fingerprint <sha256>] [--data-dir <path>]
thoth-mem repair-sync-journal --all [--apply --expected-fingerprint <sha256>] [--data-dir <path>]
```

- No mode flag: preview (`dry_run: true`).
- `--apply`: execute one deterministic repair batch only when paired with the exact `--expected-fingerprint` printed by preview.
- Missing/malformed/stale fingerprint: no writes, explicit stale-preview error, and non-zero exit.
- Output: mode, scope, 10,000-row limit, scanned/candidate/selected/repaired/remaining/skipped/ineligible counts, entity/operation breakdown, copyable fingerprint, `has_more`, and at most 50 samples. `skipped` means rows already covered by a compatible newest journal event; `ineligible_identity` is separate, and `scanned = candidates + skipped + ineligible_identity`.
- Store/migration/validation/stale-preview failure: existing CLI error path and non-zero exit.

### `prune-operation-traces`

```text
thoth-mem prune-operation-traces --project <name> [--apply --expected-fingerprint <sha256> --effective-now <UTC-ISO>] [--data-dir <path>]
thoth-mem prune-operation-traces --all [--apply --expected-fingerprint <sha256> --effective-now <UTC-ISO>] [--data-dir <path>]
```

- No mode flag: preview (`dry_run: true`).
- `--apply`: delete one deterministic eligible batch only when paired with both the exact preview fingerprint and preview `effective_now`.
- Missing/malformed/stale fingerprint, different instant, changed policy, or changed candidates: no deletions, explicit stale-preview error, and non-zero exit.
- Output: mode, scope, copyable effective UTC instant, 7/30-day or overridden policy, max rows, before/eligible/selected/deleted/remaining/skipped/after-at-commit counts, fingerprint, `has_more`, and at most 50 trace IDs.
- Store/validation/stale-preview failure: existing CLI error path and non-zero exit.

Neither command adds an MCP tool.

## HTTP journal repair

### Preview

```http
POST /sync/journal/repair/preview
Content-Type: application/json

{ "project": "project-name" }
```

Returns `200` with `SyncJournalRepairResult` and `dry_run: true`.

### Apply

```http
POST /sync/journal/repair/apply
Content-Type: application/json

{
  "all": true,
  "expected_fingerprint": "sha256:0123456789abcdef..."
}
```

Returns `200` with `SyncJournalRepairResult` and `dry_run: false`. Missing/malformed/stale fingerprint returns `409 Conflict` with zero writes. Any transactional failure returns the existing structured HTTP error response and commits no partial repair batch.

## HTTP trace retention

### Preview

```http
POST /operation-traces/retention/preview
Content-Type: application/json

{ "project": "project-name" }
```

Returns `200` with `OperationTraceRetentionResult` and `dry_run: true`.

### Apply

```http
POST /operation-traces/retention/apply
Content-Type: application/json

{
  "all": true,
  "expected_fingerprint": "sha256:0123456789abcdef...",
  "effective_now": "2026-08-10T18:00:00.000Z"
}
```

Returns `200` with `OperationTraceRetentionResult` and `dry_run: false`. Missing/malformed/stale fingerprint, changed policy/candidates, or a different/malformed instant returns `409 Conflict` with zero deletions. Any transactional failure returns the existing structured HTTP error response and commits no partial deletion.

The route's own HTTP operation trace is persisted after the Store result and therefore is not included in `after_in_scope_at_commit`; it is recent and cannot be eligible for that same run.

## OpenAPI and operation catalog

All four routes are present in `/openapi.json` and `/operations` with `kind: admin`. Preview request schemas use the shared exclusive scope shape; apply schemas require their preview-binding fields. Response schemas reference the exact Store result contracts above and document `409` stale-preview responses. Existing operation-trace list/detail routes and all six MCP entries remain unchanged.
