# src/store/

## Responsibility

Implements the persistence layer for sessions, user prompts, observations, and observation history on top of SQLite.
Owns schema bootstrapping, FTS5-backed retrieval, deduplication, soft deletion, and topic-key based versioned writes.

## Design Patterns

* Repository/DAO boundary: `Store` wraps a single `better-sqlite3` connection and exposes focused methods for each lifecycle and query shape.
* Idempotent bootstrap: constructor applies `PRAGMAS` and `SCHEMA_SQL` on every startup; schema uses `IF NOT EXISTS` so initialization is repeatable.
* Soft delete + audit trail: observations are marked with `deleted_at`, while prior states are copied into `observation_versions` before updates and upserts.
* FTS5 projection tables: `observations_fts` and `prompts_fts` are maintained by SQLite triggers, not by application-side sync code.
* Upsert-by-topic-key: `saveObservation()` treats `topic_key` as the stable identity for versioned updates within the same project/scope.

## Data & Control Flow

1. `Store` construction loads `PRAGMAS` from `schema.ts`, then executes the full schema SQL to create tables, indexes, FTS tables, and triggers.
2. `startSession()` / `ensureSession()` create session rows idempotently; `savePrompt()` also ensures a backing session exists before inserting into `user_prompts`.
3. `saveObservation()` strips private tags, validates content length, derives default `session_id`, `project`, `scope`, and `type`, then hashes the sanitized content.
4. Before insert, `checkDuplicate()` probes recent observations inside the dedupe window using hash + project + scope + type + title; duplicates increment counters via `incrementDuplicate()` and return the existing observation.
5. If `topic_key` is present, the store looks up the latest live observation for the same key/project/scope, snapshots the current row into `observation_versions`, then updates the observation in place and increments `revision_count`.
6. If no duplicate or topic-key match exists, `saveObservation()` inserts a new observation and reloads it through `getObservation()`.
7. `updateObservation()` always snapshots the current row to `observation_versions`, then applies field-level changes and refreshes `updated_at`, `revision_count`, and `normalized_hash` when content changes.
8. `deleteObservation()` performs soft delete by default, or hard-deletes the observation plus its version history when requested.
9. `searchObservations()` sanitizes the FTS query, queries `observations_fts` joined to live observations, applies optional filters, and returns ranked previews.
10. `getTimeline()` loads a focus observation and then fetches surrounding live observations from the same session by numeric id ordering.
11. `getContext()` combines recent sessions, recent prompts, recent observations, and global stats into a markdown memory block for downstream prompt assembly.
12. `getStats()` returns aggregate counts and distinct projects across live observations; `recentSessions()` and `recentPrompts()` provide the source lists for context and summaries.

## Integration Points

* Depends on `src/store/schema.ts` for PRAGMAS, schema SQL, FTS5 tables, triggers, and indexes.
* Depends on `src/store/types.ts` for row models and input/output contracts used by all persistence methods.
* Depends on `src/utils/privacy.ts` for tag stripping before persistence.
* Depends on `src/utils/sanitize.js` for safe FTS5 query handling.
* Depends on `src/utils/dedup.js` for hash generation and duplicate-window accounting.
* Depends on `src/utils/content.js` for length validation, preview truncation, and observation markdown formatting.
* Consumed by CLI/tooling layers that need session tracking, prompt capture, observation storage, search, timeline retrieval, and stats.
