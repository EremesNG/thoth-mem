# MCP and CLI surfaces

The model-visible MCP registry is exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. Pi exposes only the first five as native tools; its extension hooks call `mem_session` through the shared MCP client. `src/tools/index.ts` owns validation and structured envelopes; `src/server.ts` constructs one `MemoryService`; `src/index.ts` owns stdio lifetime; `src/cli.ts` exposes scoped setup, manual migration, read-only adoption reporting, lifecycle, one-way import, and the bounded `project rename` display-name operation.

`thoth-mem migrate [--data-dir <dir>] [--json]` resolves the standard runtime data directory and requires an existing `memory.sqlite`. Its revision preflight copies the database and any existing `-wal` into a disposable temporary directory, inspects only that snapshot, and removes it. It never connects to the source for preflight or uses immutable mode. An already-current database reports a no-op without altering source bytes, journal mode, or directory contents; only a pending migration opens the source writable through `MemoryService` with `requireExisting` (`fileMustExist`). Human output reports revisions, backups created/verified, cleanup counts, and elapsed milliseconds. JSON is `{ schema: 'thoth-mem.migrate.v1', data: { ...MigrationReport, alreadyCurrent, durationMs } }`; the report is defined in [persistence and retrieval](persistence-retrieval.md#schema-migrations). Exit codes are 0 success, 1 operational failure (including a missing database, never created), and 2 argument error. Unknown, duplicate, or malformed options are rejected before storage is opened; HELP includes the command.

Published input schemas are compact projections, not the complete validation contract: they preserve fields, types, enums, and required lists, omit length/count/range/pattern and nested `additionalProperties` constraints, and flatten evidence into one object with optional metadata variants. The MCP SDK retains the original strict Zod schemas; publication-only metadata changes its JSON Schema output, not parsing. Handlers retain strict validation and branch refinements, including unknown nested key rejection and existing error forms (SDK text-only errors versus handler JSON envelopes). Pi uses the same published catalog without `$schema`; MCP keeps the SDK-generated marker. Tool descriptions and server instructions stay unchanged. Budget tests pin names and aggregate serialized definition sizes (`JSON.stringify(...).length`, not tokens): Pi 9,478 chars and MCP 11,332, with about 5% headroom and at least 20% savings from the prior baselines. Budget increases require a deliberate definition change.

`project_key` is the exact opaque verified identity on every project-scoped call. `project_name` is creation/display metadata only and never participates in identity equality. `mem_project action=list` exposes at most 256 exact aliases per project, `aliasCount`, `aliasesTruncated`, and shadowed historical path rows without mutating, merging, or limiting exact alias resolution.

There is no v1 schema negotiation, graph action, HTTP route, dashboard, model provider, or hidden Store fallback. Errors use bounded safe messages. Every tool's text is valid JSON of at most 20,000 characters (serialized UTF-16 units), exactly `JSON.stringify(structuredContent)`; both outputs carry the same bounded envelope. Results that fit are unchanged.

`src/tools/bounded-json.ts` shrinks oversized envelopes deterministically and puts `payload_truncated` first in `warnings`. It repeatedly clips the longest string value over 64 code points to `max(64, floor(length / 2))` code points, including the trailing `…`, breaking ties by traversal order. Only when no such string remains does it drop trailing elements from the largest array by serialized size until the result fits. Object keys, numbers, booleans, nulls, and strings of at most 64 code points are never rewritten. If these reductions cannot fit, it returns the bounded `thoth-mem.mcp.error` envelope with code `output_too_large`.

`mem_get` returns the selected memory, summary, observation, or evidence once in `data.record`. Its `data.lineage` is empty without `history: true`; with history it contains only predecessors, newest first, never the selected record. Evidence always has empty lineage. `mem_project action=history` is unchanged: it lists the selected record followed by its predecessors.

`mem_project action=timeline` is the project-wide chronological read for promoted memories. It requires the exact `project_key`, accepts optional inclusive `since`/`until` ISO instants plus an opaque cursor, and returns a bounded page ordered by semantic `validFrom` descending and ID ascending. All four memory statuses are eligible by default. Compact items expose stable IDs and bounded memory/validity metadata only; raw evidence, summaries, observations, and session events remain behind their existing explicit routes, and selective memory expansion remains a `mem_get` operation. Pages are sized against the complete serialized MCP envelope before computing the final cursor, so output bounding never clips a cursor or drops delivered items. Timeline cursors are bound to the project and normalized bounds, represent a live traversal rather than a database snapshot, and reject reuse under a different scope. Timeline-only fields fail on every other project action.

Non-native MCP connections attribute sessionless `mem_save` calls to one
server-assigned `mcp` session, with root key
`thoth-mem:mcp-connection:<uuid>`. Sessionless `mem_context` and briefing use it
for recovery selection, not root authority; it cannot authorize observation
review, promotion, or `mem_session`. Native MCP launches set
`THOTH_MEM_NATIVE_HOST=opencode|codex|claude|pi` to the active host and preserve
existing attribution. See [MCP launch attribution](native-lifecycle.md#mcp-launch-attribution)
for shutdown and lazy-summary behavior.

`mem_save` is one strict four-branch union:

- direct `{ evidence, memory? }` preserves the deliberate save path; metadata is forbidden except for the closed evidence-only `observation_validation` and `observation_review_attestation` forms, which require paired verified session identity, a stable event key, an existing same-project candidate, and no memory;
- `{ observation }` submits one source-supported session- or project-scoped candidate with an exact proposed memory but does not write memory or FTS;
- `{ observation_review }` appends one terminal root-authorized accepted/rejected verdict under `root_user_confirmed`, `observable_validation`, or `independent_review` and its exact support matrix;
- `{ observation_promotion }` explicitly promotes one accepted candidate without accepting new prose.

The branches are mutually exclusive, reject unknown nested keys and partial identity pairs, and bind idempotent replay to the original payload/project/session. Observation proposed memory deliberately omits `supersedes_id`; a stable `topic_key` applies the existing current-memory supersession rule at promotion time. Raw `observation`, `observation_review`, and `observation_promotion` evidence kinds are internal canonical records, not direct public evidence inputs.

`mem_project action=observations` lists a project-scoped bounded queue with optional exact-session, state, and `current|history` filters. Current means correction-chain leaves; history means non-leaf predecessors. Results are ordered by pending/accepted/rejected/promoted state priority, creation time, then ID, and never include raw support content. `mem_get` expands one observation ID into its candidate, facets, support IDs, terminal review, promotion mapping, and correction metadata, with predecessor records only when history is requested. `mem_recall`, `mem_context`, `mem_session`, and `mem_project action=briefing` continue to consume summaries and promoted memories only.

`plugin/skills/thoth-mem/SKILL.md` is the canonical agent guidance. It routes topic/query needs to `mem_recall`, chronological needs to the bounded timeline, and selected IDs to `mem_get`, while preserving the existing recall/save/handoff, identity, privacy, and confirmation cadence. `pnpm run integration:sync` copies that body byte-for-byte to the OpenCode, Codex, Claude Code, and Pi `SKILL.md` destinations. It also copies the canonical `plugin/skills/thoth-mem/references/observation-review.md` to each host's `references/observation-review.md`, including `integrations/pi/skills/thoth-mem/references/observation-review.md`. Do not edit synchronized host copies independently.

The Pi synchronization route owns only those two generated Pi outputs; its
host-specific `references/pi.md` remains a separate canonical Pi identity and
lifecycle reference. The command continues to refresh the public distribution
lock for the Codex/Claude `plugin/` assets. Adding Pi synchronization does not
change memory-tool semantics, recall/save/handoff behavior, or the Codex/Claude
distribution-lock ownership boundary.
