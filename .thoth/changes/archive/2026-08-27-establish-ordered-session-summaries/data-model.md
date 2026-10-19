# Data Model: Ordered Session Summaries

## Authority model

```text
sessions
  └─ evidence (immutable source/submission records)
       └─ session_events (ordered trust metadata for attributable new events)
            └─ session_summaries (materialized current/history projection)
                 └─ session_summary_claims
                      └─ session_summary_claim_supports → evidence

memories remain a separate deliberately promoted corpus.
```

An evidence row remains the authoritative statement that content was captured or submitted. A summary row is a derived view of what an identified external generator asserted over an ordered range. It never acquires more authority than its supports.

## New and changed records

### `sessions`

Add `next_event_sequence INTEGER NOT NULL DEFAULT 0`.

- Updated only inside the same transaction that inserts a new `session_events` row.
- Duplicate receipts are resolved before allocation, so replay consumes no sequence.
- Existing revision-3 sessions start at zero; historical evidence is not backfilled or assigned an inferred order.

### `evidence`

Retain the current immutable shape. Add `session_summary` to the closed evidence-kind taxonomy.

- `session_summary` content is the deterministic sanitized JSON submission described by `contracts/session-summary.md`.
- It is evidence that the named generator submitted the claims, not evidence that every claim is true.
- Existing `root_prompt`, `checkpoint`, `handoff`, `explicit_save`, and legacy kinds retain their meaning.

### `session_events`

| Column | Rule |
| --- | --- |
| `evidence_id` | Primary key and FK to `evidence(id)` |
| `session_id` | Required FK to `sessions(id)`; must equal the evidence session |
| `sequence` | Required positive integer; unique with `session_id` |
| `actor` | Closed: `user`, `system`, `agent`, `tool` |
| `authority` | Closed: `root_user`, `harness`, `agent`, `tool`, `untrusted_external` |
| `retention_class` | Closed: `project`, `session`, `ephemeral`, `external_reference` |
| `privacy_class` | Closed: `standard`, `sensitive`, `restricted` |

The table is immutable. New verified session-attributed writes require an event row; migrated historical evidence may legitimately have none.

### `session_summaries`

| Column | Rule |
| --- | --- |
| `id` | Stable UUID; primary key |
| `project_id` | Required FK to projects |
| `session_id` | Required FK to sessions |
| `submission_evidence_id` | Unique FK to `evidence(id)` of kind `session_summary` |
| `kind` | Closed: `checkpoint`, `final` |
| `version` | Positive integer; unique with session and kind |
| `status` | Closed: `current`, `superseded` |
| `source_sequence_from` | Positive integer; initial value must be `1` |
| `source_sequence_to` | At least `source_sequence_from`; strictly advances the current summary |
| `generator_kind` | Closed: `root_agent`, `harness`, `model` |
| `generator_name` | Required bounded display identifier |
| `generator_version` | Optional bounded version string |
| `generator_config_hash` | Optional lowercase SHA-256 |
| `supersedes_id` | Optional FK to prior same-session/same-kind summary |
| `created_at` | Durable commit timestamp |

A partial unique index permits only one `current` summary for each `(session_id, kind)`. Content-bearing fields are immutable; only the prior row's `status` may transition from `current` to `superseded` in the same transaction that inserts its successor.

### `session_summary_claims`

| Column | Rule |
| --- | --- |
| `id` | Stable UUID; primary key |
| `summary_id` | Required FK to session summary |
| `ordinal` | Zero-based stable order; unique with summary |
| `kind` | `objective`, `completed`, `decision`, `changed_surface`, `verification`, `pending`, `blocker`, `next_action` |
| `content` | Required privacy-filtered text |
| `outcome` | Optional canonical memory outcome for verification/completed claims |

Submission limits are closed and centrally named: 1–32 claims, 1–2,000 Unicode code points per claim, 1–16 unique support IDs per claim, and at most 20,000 UTF-16 code units in the sanitized canonical submission.

### `session_summary_claim_supports`

| Column | Rule |
| --- | --- |
| `claim_id` | FK to claim |
| `evidence_id` | FK to evidence |
| `relation` | Initially only `supports` |

Primary key is `(claim_id, evidence_id)`. Each support must resolve to the same project/session and to a `session_events.sequence` within the summary's inclusive coverage. Every claim requires at least one support.

### Lifecycle receipts

Add nullable `summary_id` to `lifecycle_receipts`. The payload hash includes the sanitized structured summary. A duplicate lifecycle key returns the original evidence/summary IDs; reuse with a different payload fails.

## Summary state transitions

```text
no summary ──valid submit──> current v1
current vN ──valid wider coverage──> superseded vN + current vN+1
current vN ──duplicate receipt──> unchanged current vN
current vN ──late/equal/regressing coverage──> rejected
any state ──invalid support/scope/payload──> rejected with zero side effects
```

`final` and `checkpoint` have independent version lineages. Selection chooses the eligible current summary with the greatest `source_sequence_to`, then `final` before `checkpoint`, then commit time and stable ID. Native recovery supplies the verified session identity; project briefing without session identity does not guess a session summary.

## Projection rebuild

An internal projector parses all `session_summary` submission evidence in durable session-event order, revalidates the closed contract, and reconstructs summaries, claims, supports, versions, and current/superseded state. Rebuild operates transactionally into empty projection tables and fails closed on an invalid authoritative submission. The core does not regenerate semantics and does not call a model.

## Migration and rollback

- Revision 3 file-backed databases use SQLite `VACUUM INTO` to create a temporary consistent backup before schema mutation; the backup is opened read-only and must pass `integrity_check`, `foreign_key_check`, and revision verification before atomic rename to the documented pre-v4 backup path.
- Migration then creates the new tables/triggers/indexes, adds the session counter and lifecycle summary reference, updates taxonomy guards, and records revision 4 in one transaction.
- Existing projects, sessions, evidence, memories, relationships, receipts, FTS rows, and watermarks remain byte-semantically unchanged. No event, summary, claim, actor, authority, retention, or privacy row is inferred.
- Failure before revision-4 commit leaves revision 3 usable. Recovery after a successful upgrade restores the verified backup as an operator action; no down-migration is supplied.
- Clean and in-memory databases create revision 4 directly and need no filesystem backup.

