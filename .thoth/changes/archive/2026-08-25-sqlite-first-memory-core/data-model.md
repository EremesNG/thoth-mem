# Data model: SQLite-first memory core v2

## Model boundary

The clean v2 database is not an additive migration of the current database. It has a new schema lineage and is the only authoritative source used by the v2 runtime. The legacy importer opens the old database read-only and writes a separate v2 target.

The model separates four concepts:

1. **Evidence**: immutable material received from a verified source, such as a root-user prompt, explicit agent save, lifecycle checkpoint, or legacy import row.
2. **Memory**: a durable, agent-usable statement promoted from one or more evidence records.
3. **Lineage**: temporal and evidentiary relationships that show support, supersession, retraction, and outcomes.
4. **Projection**: disposable retrieval/index state derived from authoritative rows.

## Authoritative tables

### `projects`

| Column | Contract |
| --- | --- |
| `id` | Stable public UUID text primary key |
| `identity_key` | Unique deterministic project identity key produced by the shared resolver |
| `display_name` | Human-readable project name; not used as identity |
| `root_hint` | Nullable privacy-safe local hint; never required for cross-host identity |
| `created_at`, `updated_at` | UTC timestamps |

### `sessions`

| Column | Contract |
| --- | --- |
| `id` | Stable public UUID text primary key |
| `project_id` | Required foreign key to `projects` |
| `root_session_key` | Stable host-neutral root session key, unique with project and harness |
| `harness` | `opencode`, `codex`, `claude`, `mcp`, `cli`, or `import` |
| `state` | `active`, `compacted`, `ended`, or `degraded` |
| `started_at`, `ended_at` | UTC lifecycle timestamps |

### `evidence`

| Column | Contract |
| --- | --- |
| `id` | Stable public UUID text primary key |
| `project_id` | Required project scope |
| `session_id` | Nullable source session foreign key |
| `kind` | `root_prompt`, `explicit_save`, `checkpoint`, `handoff`, `legacy_prompt`, or `legacy_observation` |
| `content` | Bounded sanitized source content retained locally |
| `content_hash` | Hash of normalized content used for diagnostics and idempotency, not global semantic deduplication |
| `source_ref` | Nullable bounded source locator or legacy table/row reference |
| `captured_at` | UTC source time when known, otherwise import/capture time with degraded metadata |
| `metadata_json` | Versioned bounded JSON for source-specific non-normative metadata |

Evidence rows are append-only after transaction commit. Corrections create new evidence; they do not update prior content.

### `memories`

| Column | Contract |
| --- | --- |
| `id` | Stable public UUID text primary key |
| `project_id` | Required project scope |
| `topic_key` | Nullable deterministic exact-lookup key, unique only among current records in a project |
| `kind` | `decision`, `convention`, `architecture`, `discovery`, `failure`, `project_structure`, `handoff`, or `preference` |
| `title`, `content` | Durable agent-facing statement |
| `outcome` | `unknown`, `succeeded`, `failed`, or `mixed` |
| `status` | `current`, `superseded`, `retracted`, or `historical` |
| `valid_from`, `invalid_at` | UTC temporal validity boundaries |
| `supersedes_id` | Nullable self-reference to the immediately superseded memory |
| `created_at` | UTC creation time; immutable |

Memory records are append-oriented. A new current record can supersede a prior current record atomically; the prior row receives only the lineage/status closure fields required to mark its validity end. Content is never overwritten.

### `memory_evidence`

| Column | Contract |
| --- | --- |
| `memory_id`, `evidence_id` | Composite primary key and foreign keys |
| `relation` | `supports`, `contradicts`, `outcome_of`, or `derived_from` |

At least one supporting evidence link is required before a promoted memory transaction commits.

### `lifecycle_receipts`

| Column | Contract |
| --- | --- |
| `harness`, `project_id`, `root_session_key`, `event_key`, `operation` | Composite idempotency identity |
| `payload_hash` | Normalized privacy-safe delivery hash |
| `outcome` | `confirmed`, `degraded`, or `failed` |
| `confirmed_at` | Nullable UTC confirmation time |
| `diagnostic_code` | Nullable bounded stable reason code |

Only confirmed operations advance lifecycle state. Repeated confirmed delivery returns the same logical result without creating duplicate evidence or memory.

### `schema_migrations`

Ordered v2-only schema migrations. It contains no code path for recognizing or upgrading a v1 database.

## Core retrieval indexes

- `memory_fts` is an FTS5 external-content index over current and historical `memories` title/content/topic fields. Triggers or explicit same-transaction maintenance keep confirmed saves immediately searchable.
- B-tree indexes cover project, session, topic key, kind, status, outcome, validity timestamps, and lineage references.
- Exact ID/topic lookups bypass FTS ranking.
- FTS5 is an index, not a second source of truth; it can be rebuilt from `memories` and verified against authoritative row counts.

## Optional projection registry

### `projection_state`

| Column | Contract |
| --- | --- |
| `projection_id` | Stable implementation/profile ID |
| `config_hash` | Canonical configuration lineage |
| `source_watermark` | Highest fully processed authoritative change watermark |
| `state` | `disabled`, `pending`, `ready`, `stale`, `rebuilding`, or `degraded` |
| `updated_at`, `last_error_code` | Operator-safe state |

Projection-specific tables are not part of the authoritative schema contract. Deleting them and their registry row cannot delete or change evidence, memories, projects, sessions, or receipts.

## Transaction invariants

- Saving evidence and promoting a memory either commits together with its FTS state or does not commit.
- Superseding a topic/current memory closes the old validity interval and inserts the new record in one transaction.
- A confirmed lifecycle receipt and the state/evidence it confirms commit atomically.
- Project/session identity foreign keys are explicit; placeholder identity is never silently treated as verified.
- Default deletion is not part of memory correction. Administrative physical deletion, if later required for privacy, needs a separate specification.

## Legacy importer mapping

| Legacy source | V2 disposition |
| --- | --- |
| `sessions` | Map to projects/sessions when identity is trustworthy; otherwise deterministic degraded project/session plus report entry |
| `user_prompts` | Import as `legacy_prompt` evidence; do not promote automatically |
| `observations` | Import as `legacy_observation` evidence plus one linked memory using mapped type/title/content/topic/time |
| Existing supersession/outcome data that is directly attributable to source observations | Map when deterministic and reportable |
| Vector, sentence/chunk, KG/entity/triple, community, maintenance, visualization, queue, telemetry, trace, sync-journal, and cache tables | Ignore as derived/operational state and report aggregate ignored counts |

The importer uses a target transaction/staging strategy, produces a schema-versioned report, and never imports credentials, raw operational traces, or unverifiable derived facts as authoritative memory.
