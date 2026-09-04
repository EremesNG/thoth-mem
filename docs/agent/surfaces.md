# MCP and CLI surfaces

The model-visible registry is exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. `src/tools/index.ts` owns validation and structured envelopes; `src/server.ts` constructs one `MemoryService`; `src/index.ts` owns stdio lifetime; `src/cli.ts` exposes scoped setup, lifecycle, one-way import, and the bounded `project rename` display-name operation.

`project_key` is the exact opaque verified identity on every project-scoped call. `project_name` is creation/display metadata only and never participates in identity equality. `mem_project action=list` exposes at most 256 exact aliases per project, `aliasCount`, `aliasesTruncated`, and shadowed historical path rows without mutating, merging, or limiting exact alias resolution.

There is no v1 schema negotiation, graph action, HTTP route, dashboard, model provider, or hidden Store fallback. Errors use bounded safe messages. Structured JSON is authoritative and text is a bounded rendering.

`mem_project action=timeline` is the project-wide chronological read for promoted memories. It requires the exact `project_key`, accepts optional inclusive `since`/`until` ISO instants plus an opaque cursor, and returns a bounded page ordered by semantic `validFrom` descending and ID ascending. All four memory statuses are eligible by default. Compact items expose stable IDs and bounded memory/validity metadata only; raw evidence, summaries, observations, and session events remain behind their existing explicit routes, and full memory expansion remains a `mem_get` operation. Timeline cursors are bound to the project and normalized bounds, represent a live traversal rather than a database snapshot, and reject reuse under a different scope. Timeline-only fields fail on every other project action.

`mem_save` is one strict four-branch union:

- direct `{ evidence, memory? }` preserves the deliberate save path; metadata is forbidden except for the closed evidence-only `observation_validation` and `observation_review_attestation` forms, which require paired verified session identity, a stable event key, an existing same-project candidate, and no memory;
- `{ observation }` submits one source-supported session- or project-scoped candidate with an exact proposed memory but does not write memory or FTS;
- `{ observation_review }` appends one terminal root-authorized accepted/rejected verdict under `root_user_confirmed`, `observable_validation`, or `independent_review` and its exact support matrix;
- `{ observation_promotion }` explicitly promotes one accepted candidate without accepting new prose.

The branches are mutually exclusive, reject unknown nested keys and partial identity pairs, and bind idempotent replay to the original payload/project/session. Observation proposed memory deliberately omits `supersedes_id`; a stable `topic_key` applies the existing current-memory supersession rule at promotion time. Raw `observation`, `observation_review`, and `observation_promotion` evidence kinds are internal canonical records, not direct public evidence inputs.

`mem_project action=observations` lists a project-scoped bounded queue with optional exact-session, state, and `current|history` filters. Current means correction-chain leaves; history means non-leaf predecessors. Results are ordered by pending/accepted/rejected/promoted state priority, creation time, then ID, and never include raw support content. `mem_get` expands one observation ID into its candidate, facets, support IDs, terminal review, promotion mapping, and optional predecessor/successor lineage. `mem_recall`, `mem_context`, `mem_session`, and `mem_project action=briefing` continue to consume summaries and promoted memories only.

`plugin/skills/thoth-mem/SKILL.md` is the canonical agent guidance. It routes topic/query needs to `mem_recall`, chronological needs to the bounded timeline, and selected IDs to `mem_get`, while preserving the existing recall/save/handoff, identity, privacy, and confirmation cadence. `pnpm run integration:sync` copies that body byte-for-byte to the OpenCode, Codex, Claude Code, and Pi `SKILL.md` destinations. It also copies the canonical `plugin/skills/thoth-mem/references/observation-review.md` to each host's `references/observation-review.md`, including `integrations/pi/skills/thoth-mem/references/observation-review.md`. Do not edit synchronized host copies independently.

The Pi synchronization route owns only those two generated Pi outputs; its
host-specific `references/pi.md` remains a separate canonical Pi identity and
lifecycle reference. The command continues to refresh the public distribution
lock for the Codex/Claude `plugin/` assets. Adding Pi synchronization does not
change memory-tool semantics, recall/save/handoff behavior, or the Codex/Claude
distribution-lock ownership boundary.
