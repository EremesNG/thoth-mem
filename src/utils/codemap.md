# src/utils/

## Responsibility

Pure helper utilities used across the persistence and memory tools.
The folder handles privacy stripping, FTS query sanitization, content normalization for hash-based deduplication, markdown/preview formatting, and topic-key normalization or suggestion.

## Design Patterns

Small single-purpose functions with no shared mutable state.
Each module exposes deterministic helpers that transform strings or coordinate a narrow database update, keeping policy-free logic reusable from tool handlers and store code.

## Data & Control Flow

`privacy.ts` removes `<private>...</private>` blocks before content is persisted or shown.
`sanitize.ts` first normalizes text for hashing, and also wraps user search terms as quoted FTS5 tokens so SQLite receives safe `MATCH` input.
`dedup.ts` hashes normalized content with SHA-256, checks the `observations` table for a recent matching row, and increments duplicate counters when a repeat is detected.
`content.ts` turns observations and search results into readable markdown and short previews, preserving the raw content/preview strings already prepared by upstream code.
`topic-key.ts` derives a stable topic key by preferring the title, falling back to the first content line, then slugifying and prefixing it based on observation type.

## Integration Points

These helpers are consumed by store logic and MCP tool handlers that create, search, deduplicate, and render observations.
Key touchpoints include SQLite FTS queries, the `observations` table, observation/search-result formatting, and memory/topic-key workflows that rely on consistent normalized strings.
