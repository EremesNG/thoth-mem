# Design: Output Caps for getContext-backed Responses

> Change A — **Output Caps Only**. This design implements exactly the finalized
> deltas in `specs/{tools,store,config}/spec.md` and the locked Caps-Design
> Decisions in `proposal.md`. Pruning is **deferred** (D-1/D-2 →
> `production-hardening-dashboard-v2`, D-3 → `sync-and-resilience`) and is NOT
> touched here. `observation_facts` and `ZodRawShapeCompat` are KEEP/verified-live
> and are NOT touched here.

## Technical Approach

`Store.getContext` (`src/store/index.ts:1169-1242`) is the single shared renderer
behind every unbounded surface: the MCP `mem_context` tool
(`src/tools/mem-context.ts:35`), `formatProjectSummary`
(`src/tools/project-views.ts:10-16`) which backs both `mem_project action=summary`
(`src/tools/mem-project.ts:60-66`) and the HTTP `/projects/{project}/summary`
payload (`src/http-routes.ts:1032`), and the CLI `context` command
(`src/cli.ts:380`). Today `getContext` joins **full** `obs.content` via
`formatObservationMarkdown` (`src/utils/content.ts:28-38`) with no per-item or
total cap (`observationBlocks` join at `src/store/index.ts:1212`), producing the
observed ~104K / ~74K dumps.

The fix introduces ONE budget enforcement point inside `getContext`, reusing the
two existing budget primitives already in the codebase rather than inventing a new
algorithm:

1. **Previews** via `truncateForPreview(content, previewLength=300)`
   (`src/utils/content.ts:3-12`) — already used by `formatPreviewResult`,
   `formatSearchResults`, and `getContext`'s own prompt rendering (`:1209`).
2. **Total trim-to-budget** via the `mem_recall` pattern in `trimToBudget`
   (`src/tools/mem-recall.ts:24-29`) and the incremental-accumulation loop in
   `formatContextResults` (`src/utils/content.ts:87-119`) / `formatProjectGraph`
   (`src/tools/project-views.ts:54-77`).

Because the bound lives at `getContext`, all four surfaces inherit it with zero
per-surface bounding code (tools spec "Output Bound MUST Be Applied At The Shared
getContext Layer"). `mem_context` and `mem_project action=summary` additionally
gain an **optional per-call override** that they thread into `getContext`.

## Architecture Decisions

### Decision: Enforce the bound inside `Store.getContext`, not per caller

**Choice**: Add a `maxOutputChars` budget parameter to `getContext` and perform
preview-rendering + trim-to-budget there. Callers pass through (or supply an
override); none re-implement bounding.

**Alternatives considered**:
- *Cap in each tool wrapper (`mem-context.ts`, `project-views.ts`)* — rejected:
  duplicates logic across 4 surfaces, risks divergence, and the HTTP/CLI paths
  would each need their own copy. Violates the tools-spec shared-layer requirement.
- *Post-hoc `trimToBudget(getContext(...))` at each call site* — rejected: a blind
  tail-slice would cut mid-observation and could amputate the `## Memory ...`
  header or the memory-stats footer, violating the store-spec "MUST preserve
  existing section structure" requirement. It also cannot convert full bodies to
  previews (the previews-by-default requirement).

**Rationale**: One implementation, one behavior, four inheriting surfaces; matches
the locked "shared budget at `Store.getContext`" decision and the
`formatProjectGraph`/`formatContextResults` precedent of structure-aware trimming.

### Decision: Previews-by-default via a new mode flag on `formatObservationMarkdown`

**Choice**: Extend `formatObservationMarkdown(obs)` to
`formatObservationMarkdown(obs, options?: { preview?: boolean; previewLength?: number })`.
When `preview` is true it renders `truncateForPreview(obs.content, previewLength)`
in place of `obs.content`; the header/metadata lines are unchanged. Default
(`preview` omitted/false) preserves the exact current full-content output so
non-context callers are not silently changed (store-spec "Full mode remains
available").

**Alternatives considered**:
- *New separate function `formatObservationPreview`* — rejected: `formatPreviewResult`
  (`src/utils/content.ts:74-85`) already exists but emits a **different** header
  (`**Revisions:** | **Duplicates:**`) and lacks the `**Created:**`-only line shape
  `getContext` uses; reusing it would change the context block layout. A mode flag
  on the existing function keeps the section structure identical (store-spec
  "MUST retain the observation header metadata (id, type, title)").

**Rationale**: Minimal surface change, preserves the existing block format,
satisfies both the preview-mode and "full mode preserved" scenarios.

### Decision: `maxContextChars` config knob, resolved env > persisted > default = 8000

**Choice**: Add `maxContextChars: number` to `ThothConfig`
(`src/config.ts:45-59`), `PersistedConfig` (`:65-81`), `defaultPersistedConfig`
(`:193-216`, value `8000`), and resolve in `getConfig`
(`src/config.ts:417-434`) as
`parseNumber(process.env.THOTH_MAX_CONTEXT_CHARS) ?? persisted.maxContextChars ?? 8000`,
mirroring the `maxContentLength` line exactly (`src/config.ts:420`). Also add
`maxContextChars: 8000` to the store's `DEFAULT_CONFIG` (`src/store/index.ts:183-192`)
so `new Store(':memory:')` and partial-config construction have the default
available via `this.config` (`Store.config` is `public readonly`,
`src/store/index.ts:259`).

**Alternatives considered**:
- *Reuse `maxContentLength`* — rejected by spec: that knob is INPUT warn-only and
  MUST stay distinct (config-spec "maxContentLength MUST Be Input-Validation
  Warn-Only And Distinct").
- *Per-surface defaults* — rejected by locked decision (single documented default;
  per-call override instead).

**Rationale**: Matches the locked knob name/env/resolution/default verbatim and the
established scalar-resolution pattern; `8000` ≈ 20 previews × ~300 chars + headers,
modestly above `mem_recall`'s `MAX_CONTEXT_CHARS = 6000`.

### Decision: Sentinel `0` = unbounded, handled at the single guard

**Choice**: In `getContext`, resolve `budget = input.maxOutputChars ?? this.config.maxContextChars`.
If `budget === 0`, skip preview-truncation and skip the total trim — render the
historical full-content path (so rollback restores prior behavior). Any positive
value enforces previews + trim.

**Alternatives considered**: A separate boolean `unbounded` flag — rejected:
redundant with the locked sentinel semantics and widens the surface.

**Rationale**: Single sentinel, single branch; satisfies tools/store/config
"unbounded sentinel" scenarios and the rollback plan.

### Decision: Preview-first, then incremental trim with a structural escalation footer

**Choice**: `getContext` renders sessions + prompts + memory-stats unconditionally
(these are small, bounded already — sessions capped at 5, prompts at 10 with
100-char previews). For observations it accumulates preview blocks one at a time
(the `formatContextResults` loop pattern), stopping when adding the next block
would exceed the remaining budget. It then appends a shown/omitted line plus the
`mem_get` pointer, e.g.:
`> Showing N of M observations (budget Kc). Use mem_get(id=...) for full content; N more omitted.`
A final defensive `trimToBudget` guarantees the returned string length `<= budget`
even after the footer is appended.

**Rationale**: Preserves all structural sections (store-spec), reports
boundedness "measured, not claimed" (P4 / tools-spec), and mirrors the existing
`formatSearchResultMarkdown` footer "Use `mem_get` with an ID for full content."

## Data Flow

```mermaid
sequenceDiagram
    participant Caller as mem_context / mem_project(summary) / HTTP / CLI
    participant Tool as Tool wrapper
    participant GC as Store.getContext
    participant FMT as formatObservationMarkdown(preview)

    Caller->>Tool: invoke (optional max_chars override)
    Note over Tool: budget resolution<br/>override > config.maxContextChars (env>persisted>default 8000)
    Tool->>GC: getContext({..., maxOutputChars: budget})
    GC->>GC: budget = input.maxOutputChars ?? config.maxContextChars

    alt budget === 0 (unbounded sentinel)
        GC->>FMT: render FULL content (legacy path)
        FMT-->>GC: full blocks (no trim)
        GC-->>Tool: full context (rollback behavior)
    else budget > 0 (bounded, default)
        GC->>GC: render sessions + prompts + stats (already bounded)
        loop each recent observation while remaining budget allows
            GC->>FMT: render PREVIEW block (truncateForPreview, len 300)
            FMT-->>GC: preview block
            GC->>GC: accumulate if fits; else stop (record omitted count)
        end
        GC->>GC: append "Showing N of M ... use mem_get(id=...)" footer
        GC->>GC: trimToBudget(text, budget)  // defensive final guard
        GC-->>Tool: bounded context (len <= budget)
    end
    Tool-->>Caller: response
```

Edge branch — **single observation larger than the whole budget**: the loop's
first block does not fit; instead of dropping it silently, `getContext` emits a
`truncateForPreview`-trimmed-then-`trimToBudget`-clamped fragment of that one
observation plus the `mem_get` pointer (store-spec: "MUST NOT drop ... never
silent drop"). Result still satisfies `len <= budget`.

## File Changes

### Modified

- **`src/config.ts`** — add the output-cap knob (4 edits):
  - `ThothConfig` interface (`:45-59`): add `maxContextChars: number;`.
  - `PersistedConfig` interface (`:65-81`): add `maxContextChars?: number;`.
  - `defaultPersistedConfig()` (`:193-216`): add `maxContextChars: 8000,`.
  - `getConfig()` return (`:417-434`): add
    `maxContextChars: parseNumber(process.env.THOTH_MAX_CONTEXT_CHARS) ?? persisted.maxContextChars ?? 8000,`.
  - Add a doc comment on `maxContentLength` clarifying it is INPUT warn-only and
    DISTINCT from the OUTPUT `maxContextChars` (config-spec MODIFIED-intent
    requirement; behavior of `validateContentLength` is unchanged).

- **`src/store/index.ts`**:
  - `DEFAULT_CONFIG` (`:183-192`): add `maxContextChars: 8000,` so in-memory/partial
    construction has the default.
  - `getContext` (`:1169-1242`): resolve
    `const budget = input.maxOutputChars ?? this.config.maxContextChars;`
    Branch on `budget === 0` (legacy full render) vs `> 0` (preview + incremental
    accumulation + shown/omitted + `mem_get` footer + final `trimToBudget` guard).
    Replace the unconditional `observationBlocks` full join (`:1212`) accordingly.
    Sessions/prompts/stats sections unchanged.

- **`src/store/types.ts`** — `ContextInput` (`:147-152`): add
  `maxOutputChars?: number;` (the per-call budget; `undefined` ⇒ use config
  default, `0` ⇒ unbounded).

- **`src/utils/content.ts`** — `formatObservationMarkdown` (`:28-38`): add optional
  `options?: { preview?: boolean; previewLength?: number }`; when `preview`,
  substitute `truncateForPreview(obs.content, options.previewLength ?? 300)` for the
  final `obs.content` line. Header lines unchanged. May factor the small
  `trimToBudget` helper here (or import the `mem-recall` one) so the store and recall
  share one trimmer; keep `mem_recall`'s existing `MAX_CONTEXT_CHARS=6000` and its
  local copy untouched if simpler — no behavior change to recall is permitted.

- **`src/tools/mem-context.ts`** (`:26-35`): add an optional
  `max_chars: z.number().min(0).max(...).optional()` parameter (sentinel `0`
  allowed; mirror `mem_project`'s `max_chars` shape but with `min(0)` to admit the
  sentinel) and thread it as
  `store.getContext({ project, session_id, scope, limit, maxOutputChars: max_chars })`.
  Extend the tool description to note bounded-by-default output + `mem_get`
  escalation (kept terse per constitution P1; no new tool).

- **`src/tools/project-views.ts`** — `formatProjectSummary` (`:10-16`): add an
  optional `maxOutputChars?: number` param and pass it into
  `store.getContext({ project, limit, maxOutputChars })`.

- **`src/tools/mem-project.ts`** (`action=summary`, `:60-66`): pass the existing
  `max_chars` parameter (`:29`) through to
  `formatProjectSummary(store, project, limit, max_chars)` on the `action=summary`
  branch only.

  **Mechanism for relaxing `max_chars` validation without weakening `graph`/`topic`**:
  `max_chars` is a SINGLE shared zod field validated BEFORE `action` dispatch
  (`:29`). Simply changing `min(200)` to `min(0)` would silently allow
  `max_chars=0` on `graph`/`topic` paths — where `0` produces empty output — which
  is incorrect behavior.

  The correct mechanism (implement EXACTLY as described):
  1. Change the base field declaration to `z.number().int().min(0).max(<existing max>)` —
     allowing `0` at the schema level.
  2. ADD a `.superRefine` (or `.refine`) on the **mem_project input schema** (the
     whole input object, not just the field) that enforces: when `action === 'graph'`
     or `action === 'topic'`, `max_chars` (if provided and not `undefined`) MUST be
     `>= 200`; the sentinel `0` and any value `< 200` are only valid when
     `action === 'summary'`. Emit a descriptive validation error otherwise, e.g.
     `"max_chars must be >= 200 when action is 'graph' or 'topic'"`.
  3. In the handler: thread `max_chars` into `getContext` (via `formatProjectSummary`)
     ONLY on the `action=summary` branch (sentinel `0` means unbounded there).
     `action=graph` and `action=topic` keep their EXISTING `max_chars` semantics and
     defaults (e.g. `formatProjectGraph` default `6000`) completely unchanged.

  **Rationale**: A single shared field validated before dispatch cannot be
  path-selectively relaxed without a cross-field refinement. The `.superRefine`
  scopes the relaxation precisely to `action=summary` without weakening the
  `graph`/`topic` validation paths.

### Inherited (no change — verified)

- **`src/http-routes.ts`** `handleProjectSummary` (`:1032`) calls
  `formatProjectSummary(store, project, limit)`; it inherits the default budget.
  No HTTP-specific bounding code (tools-spec scenario). (The separate JSON
  `getContextObservations`/`getContextSessions` endpoints at `:389/:413` do NOT use
  `getContext` and are out of scope.)
- **`src/cli.ts`** `handleContext` (`:380`) calls `store.getContext({ project })`;
  inherits the default budget. No CLI-specific bounding code.

### NOT touched (scope guard)

- `src/tools/tracing.ts`, `saveOperationTrace`, `src/http-server.ts`,
  `src/http-openapi.ts`, `src/sync/index.ts`, `dashboard/src/api/client.ts`
  (deferred D-1/D-2/D-3).
- `observation_facts` machinery, `src/server/zod-compat.js` (KEEP/verified-live).
- `validateContentLength` / `maxContentLength` behavior (doc-only clarification).
- `mem_recall`'s `MAX_CONTEXT_CHARS = 6000` and its trim (must stay untouched —
  edge case in test plan asserts this).

## Interfaces / Contracts

```ts
// src/store/types.ts
export interface ContextInput {
  project?: string;
  session_id?: string;
  scope?: ObservationScope;
  limit?: number;
  maxOutputChars?: number; // undefined => config.maxContextChars; 0 => unbounded
}

// src/utils/content.ts
export function formatObservationMarkdown(
  obs: Observation,
  options?: { preview?: boolean; previewLength?: number },
): string;

// src/tools/project-views.ts
export function formatProjectSummary(
  store: Store,
  project: string,
  limit?: number,
  maxOutputChars?: number,
): string;

// src/config.ts (ThothConfig)
maxContextChars: number; // OUTPUT cap; env THOTH_MAX_CONTEXT_CHARS > persisted > 8000; 0 = unbounded
```

Budget resolution precedence (single source of truth in `getContext`):
`per-call maxOutputChars` (incl. `0`) **>** `config.maxContextChars`
(itself `THOTH_MAX_CONTEXT_CHARS` env **>** persisted `config.json` **>** `8000`).

## Edge Cases

- **Sentinel `0`** (config-resolved or per-call): unbounded branch renders legacy
  full content; no truncation. Asserted at store, tool, and config levels.
- **Single observation > whole budget**: truncate-with-pointer, never silent drop;
  output still `<= budget`.
- **Interaction with `maxContextResults`** (`getContext` `limit`, default 20,
  `src/store/index.ts:1172`): the SQL `LIMIT` (count) applies FIRST, then the char
  budget trims the rendered previews. Both bounds compose; the char budget may show
  fewer than `limit` observations and the footer reports the difference.
- **Empty / zero results**: existing `'No recent observations.'` placeholder
  preserved; footer/`mem_get` pointer is only meaningful when observations exist
  (omit or render "0 omitted" — keep current empty-state text intact so
  `tests/store/context.test.ts` "returns markdown with all sections" still passes).
- **`mem_recall` untouched**: its `MAX_CONTEXT_CHARS = 6000` and `trimToBudget`
  remain as-is; a regression test asserts recall output is unaffected by
  `maxContextChars`.
- **`maxContentLength` independence**: changing one knob does not change the other's
  behavior (config-spec scenario).

## Testing Strategy

vitest, in-memory SQLite (`new Store(':memory:')`) per repo convention
(`tests/store/context.test.ts`); config via `getConfig()` + `THOTH_DATA_DIR`/env
manipulation (`tests/config.test.ts`). Phased to the spec scenarios:

1. **Regression — the bug is fixed** (`tests/store/context.test.ts` /
   `tests/tools/mem-context.test.ts` / `tests/tools/mem-project.test.ts`): seed a
   store with many large observations (rendering ≫ 8000, reproducing ~104K/~74K);
   assert `getContext({}).length <= 8000`, `mem_context` text `<= 8000`, and
   `mem_project action=summary` text `<= 8000`. Assert the ~104K/~74K magnitudes do
   not recur.
2. **Preview-mode rendering** (`tests/utils/content.test.ts`,
   `tests/store/context.test.ts`): an observation longer than 300 chars renders a
   `...`-suffixed preview, NOT the full body; header (id/type/title) retained; full
   mode still emits complete content. Bounded `getContext` contains the recent-
   sessions/prompts/observations/stats sections AND a `mem_get` pointer.
3. **Per-call override** (`tests/tools/mem-context.test.ts`,
   `tests/tools/mem-project.test.ts`): `max_chars` below default bounds tighter;
   a later call without override returns to the default bound; override does not
   mutate persisted config.
4. **Sentinel `0` = unbounded** (store + tools + config): budget `0` (per-call and
   via `THOTH_MAX_CONTEXT_CHARS=0`) yields untruncated full output; default config
   still enforces the bound.
5. **Config resolution** (`tests/config.test.ts`): default `maxContextChars === 8000`;
   `THOTH_MAX_CONTEXT_CHARS` env wins over persisted; persisted wins when env unset;
   `0` resolves as the sentinel.
6. **HTTP + CLI inheritance** (`tests/http-server.test.ts`, `tests/cli.test.ts`):
   `/projects/{project}/summary` payload and CLI `context` output are bounded with
   no surface-specific bounding code.
7. **Independence / no-regression**: `maxContentLength` save-time warn behavior
   unchanged when `maxContextChars` changes (and vice versa); `mem_recall` output
   unaffected by `maxContextChars`.

`test_command: pnpm test`; `build_command: pnpm run build` (config.yaml).

## Migration / Rollout

- **Behavior change (not a breaking API removal)**: `mem_context`,
  `mem_project action=summary`, HTTP `/projects/{project}/summary`, and CLI
  `context` switch from full-content dumps to **previews-by-default** bounded at
  8000 chars. Same tools, same routes, same response shape (Markdown) — only
  smaller, with a `mem_get` escalation pointer. Full bodies remain reachable via
  `mem_get` (the P4 third tier).
- **Config-defaulted**: ships enabled via the `8000` default; no schema migration
  needed (the knob is additive; `mergePersistedConfig` backfills it on next load).
- **Rollback**: set `maxContextChars=0` (env `THOTH_MAX_CONTEXT_CHARS=0` or
  persisted) to restore prior unbounded behavior with no code revert; or revert the
  single `getContext` render diff (pass-through callers need no change).

## Constitution Check (self-review)

- **P1 Compact surface** — no tool added/removed/renamed; only `max_chars` params
  and output behavior change. PASS.
- **P2 Deterministic lexical+KG fallback** — `observation_facts` untouched. PASS.
- **P4 Bounded, progressive recall** — the central goal: bounded output + `mem_get`
  escalation, measured shown/omitted reporting. PASS.
- **P5 Deprecation discipline** — no destructive removal; behavior change is
  config-defaulted with a documented rollback sentinel. PASS.
- Multi-harness parity (MCP/HTTP/CLI) — all inherit one shared bound. PASS.

No principle violations detected; finalization not blocked.

## Open Questions

None. The four caps-design decisions are LOCKED by `sdd-clarify`
(default 8000; key `maxContextChars` / env `THOTH_MAX_CONTEXT_CHARS`; resolution
env > persisted > default; shared budget at `getContext` + per-call override;
sentinel `0`) and adopted as-is. Scope is caps-only; no deferred/KEEP items are
touched.
