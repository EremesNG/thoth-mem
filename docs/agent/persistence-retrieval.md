# Persistence and retrieval

## Responsibility

Owns SQLite schema/state, prompts/sessions/observations, privacy and identity normalization, lexical/vector/KG retrieval, derived indexing and maintenance, and incremental sync. It does not own public transport shape unless a surface contract changes.

## Entry points and flow

- `src/store/index.ts`, `schema.ts`, `types.ts`, `migrations.ts`, `identity.ts`, `maintenance.ts`: durable state and contracts.
- `src/retrieval/` and `src/indexing/`: hybrid recall providers/ranking, semantic jobs, KG extraction, and rollout logic.
- `src/utils/privacy.ts`, `sanitize.ts`, `dedup.ts`, `content.ts`, `topic-key.ts`: sanitization, normalization, formatting, and identity helpers.
- `src/sync/index.ts`: watermark-based export and v1/v2 import behavior.
- MCP/CLI/HTTP adapters call these capabilities; they should not duplicate durable rules.

Typical save flow strips private content, validates/normalizes inputs, resolves identity, checks recent duplicates, applies topic-key versioned upsert or insert, and queues/updates derived state. Recall sanitizes FTS input and combines bounded evidence lanes. Sync uses mutation watermarks, content-addressed chunks, import ordering, and recorded outcomes.

## Invariants and hazards

- Strip `<private>` content before persistence. Sanitize FTS queries before SQLite FTS5.
- Keep schema evolution idempotent and consistent with SQL `CHECK` constraints, FTS tables/triggers, and indexes.
- Preserve the observation taxonomy, normalized deduplication/duplicate accounting, and topic-key revision/upsert semantics.
- Preserve explicit project/session identity and nullability; changes can affect prompts, observations, summaries, sync, and retrieval together.
- Do not silently truncate durable content. Pagination/preview limits and warnings are public behavior.
- Sync format/order, mutation watermarks, payload hashes, and imported-chunk status are compatibility behavior; test both current and legacy paths when touched.

## Tests and verification

Start in `tests/store/`, `tests/retrieval/`, `tests/indexing/`, `tests/sync/`, or `tests/utils/`, with tool/surface tests only when adapters change. Schema changes require the focused schema/migration tests, then `pnpm run build` and `pnpm test`. See [testing](testing.md).

## Escalate context

- Load [surfaces](surfaces.md) if inputs, output shapes, error mapping, tool descriptions, or routes change.
- Load [native lifecycle](native-lifecycle.md) if session/prompt effects are used by host lifecycle events.
- Load [architecture](architecture.md) for changes spanning store, retrieval, sync, and public runtimes.

Evidence: current store/retrieval/indexing/sync entrypoints, their imports and registrations, schema/types, and matching tests.
