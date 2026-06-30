# Proposal: Output Caps and Pruning

> Change A of a 3-change program. Change B (graph traversal) and Change C
> (consolidation/decay) are future, separately-owned changes referenced here for
> sequencing only and are OUT OF SCOPE for this proposal.

## Intent

Two `getContext()`-backed MCP responses return unbounded full-content dumps and
are blowing the agent context budget:

- `mem_context` was observed at **~104K characters** in a single response.
- `mem_project action=summary` was observed at **~74K characters** in a single
  response.

This is a correctness-critical token bug, not a polish item. It directly
violates the project constitution's **P4 — Token-Efficient, Bounded Recall
Outputs** ("Retrieval responses MUST be bounded and progressive ... Surgical
trimming MUST be applied before output is returned"). Every other retrieval
surface already honors a budget — `mem_recall` (`MAX_CONTEXT_CHARS = 6000`,
`trimToBudget`), `formatProjectGraph` (`maxChars`, default 6000), and
`formatContextResults` (`maxChars`, default 4000) — but the two `getContext`
paths bypass all of them.

Root cause: `Store.getContext` (`src/store/index.ts:1212`) renders every recent
observation through `formatObservationMarkdown` (`src/utils/content.ts:28-38`),
which emits the **full** `obs.content` with no per-item and no total cap. Both
`mem_context` (`src/tools/mem-context.ts`, returns `getContext` verbatim) and
`formatProjectSummary` (`src/tools/project-views.ts:10-16`, wraps `getContext`
directly) inherit the unbounded output. The same unbounded text reaches the HTTP
surface via `handleProjectSummary` (`src/http-routes.ts:1032`).

> **Scope decision (confirmed by user, authoritative).** This change is
> **OUTPUT CAPS ONLY**. The pruning items originally bundled here have been
> **routed to the in-flight changes that own that code** (they are *deferred and
> tracked*, NOT abandoned) — see "Deferred — routed to owner change" below. This
> narrowing is a deliberate, scope-faithful decision: deferred items remain
> visible with cross-references rather than being silently dropped.

## Scope

> Scope is authoritative. The sole in-scope work is the PRIMARY output-cap
> behavior (P-1..P-3). All pruning items are deferred to their owner changes and
> listed for traceability. The caps-design decisions are resolved under
> "Caps-Design Decisions" below; no open clarification markers remain.

### In Scope

#### PRIMARY — Bound output size of getContext()-backed responses (critical bug)

- **P-1. Add a config-driven total output character budget** for context/summary
  responses (working name `maxContextChars`), mirroring the existing capped
  patterns (`mem_recall` `MAX_CONTEXT_CHARS=6000`; `formatProjectGraph`
  `maxChars`; `formatContextResults` `maxChars=4000`). The budget MUST be
  enforced before the response is returned and MUST be reported (e.g. shown/omitted
  counts), consistent with P4's "measured, not claimed".
  - `From`: `getContext` joins full observation content with no cap
    (`src/store/index.ts:1212`); `mem_context` and
    `formatProjectSummary` return it verbatim.
  - `To`: a bounded, budget-aware render that fits a configured character ceiling.
  - `Reason`: P4 bounded recall; stop the ~104K / ~74K dumps.
  - `Impact`: `mem_context`, `mem_project action=summary`, and the HTTP
    `/projects/{project}/summary` payload become bounded.

- **P-2. Previews-by-default in context/summary responses.** Recent-observation
  blocks render a bounded preview (reuse `truncateForPreview` /
  `previewLength`, default 300) instead of full `obs.content`. Full content
  remains available only via `mem_get` (single-record full fetch — the third
  tier of the P4 funnel). The response MUST direct callers to `mem_get` for full
  bodies (mirrors `formatSearchResultMarkdown`'s existing
  "Use `mem_get` with an ID for full content." footer).

- **P-3. Clarify and enforce `maxContentLength` (default 100000).** Today it
  "warns, never truncates" (`validateContentLength`, `src/utils/content.ts:14-26`;
  `src/config.ts:197`). This change keeps **input** behavior (still warn, do not
  silently truncate writes — aligns with sync-and-resilience's "Silent
  truncation behavior changes" exclusion) but documents the invariant explicitly
  and makes clear that `maxContextChars` governs **output** size independently of
  `maxContentLength`. The output-cap default (`8000`) and the shared-budget +
  per-call-override model are resolved under "Caps-Design Decisions" below.

> No SECONDARY or COORDINATED pruning items remain in scope. They are tracked
> under "Deferred — routed to owner change" below.

### Deferred — routed to owner change

> These items were originally bundled in this proposal. Per the confirmed user
> scope decision they are **deferred to the in-flight change that OWNS the
> relevant code** so the work lands once, in one place, instead of editing
> shared files in parallel. They remain tracked here for traceability; none are
> abandoned. No spec deltas for these items are authored under this change.

- **D-1 → `production-hardening-dashboard-v2`: Operation-trace
  retention/cleanup.** `registerTracedTool` (`src/tools/tracing.ts:41-91`)
  records an operation trace on **every** MCP call via
  `Store.saveOperationTrace` (`src/store/index.ts:807`) with **no retention
  bound** — unbounded growth of `operation_traces`. **Routing rationale:**
  `production-hardening-dashboard-v2` created the tracing layer
  (`src/tools/tracing.ts`, `saveOperationTrace`, and the `observability` spec
  domain at
  `openspec/changes/production-hardening-dashboard-v2/specs/observability/spec.md`).
  Retention/cleanup (and any tracing on/off toggle) belongs there so the policy
  is defined alongside the requirement that creates the rows. Add a SIMPLE
  max-rows/max-age prune and/or toggle there; a full observability redesign
  stays out of scope.

- **D-2 → `production-hardening-dashboard-v2`: Deprecate-then-remove legacy HTTP
  endpoint `GET /projects/{project}/graph`.** Redundant with
  `mem_project action=graph`; the handler (`handleProjectGraph`,
  `src/http-routes.ts:1037-1069`), route (`src/http-server.ts:123`), and OpenAPI
  entry (`src/http-openapi.ts:629-651`, already labeled "legacy compatibility
  route") all exist, and the dashboard still **calls** it
  (`dashboard/src/api/client.ts:686`, `getProjectGraph`) — so it is NOT safe to
  delete outright today. **Routing rationale:**
  `production-hardening-dashboard-v2` owns the `http-api` spec domain
  (`.../specs/http-api/spec.md`) AND the dashboard client that calls the
  endpoint; deprecate-then-remove (mark deprecated MINOR → migrate dashboard →
  remove later MAJOR, per constitution P5) must be sequenced there.

- **D-3 → `sync-and-resilience`: Deprecate-then-remove `SyncImportResult` legacy
  fields** `sessions_imported` / `observations_imported` / `prompts_imported`
  (`src/sync/index.ts:60-70`, already JSDoc-`@deprecated`). Produced by the v1
  `importData` return shape (`src/store/index.ts:3192`) and consumed at
  `src/http-routes.ts:1192-1194`, `src/cli.ts:454-456` (import) and
  `src/cli.ts:493-495` (sync-import), plus tests. **Routing rationale:**
  `sync-and-resilience` owns the sync response shape (its `sync` spec domain is
  reshaping the chunk format v1→v2 with mutation journal and tombstones at
  `.../specs/sync/spec.md`); the deprecation window and field removal MUST
  sequence after that response shape stabilizes.

### Out of Scope — KEEP (verified live, do NOT touch)

- **`observation_facts` — KEEP (verified LIVE).** Populated via
  `refreshObservationFacts` (`src/store/index.ts:1408`, `:1438`, `:1557`) and
  read in 6 places; it is the graph-lite KG fallback consumed by
  `getObservationFacts` / `formatProjectGraph`. Removing it would break the
  deterministic lexical+KG fallback the constitution **P2** guarantees. This was
  re-verified during discovery — it is NOT a pruning candidate. Do not touch.
- **`ZodRawShapeCompat` / `ShapeOutput` shim — KEEP (verified live).**
  `src/server/zod-compat.js` is a live, non-deprecated **public export** on
  `@modelcontextprotocol/sdk` v1.x (installed `^1.29.0`); the aliases still ship
  and removal only becomes meaningful on SDK v2. Do not touch under this change.
  - **Discovery note (out of scope for Change A, recorded for the design phase):**
    `zod ^4.4.3` alongside SDK `1.29` can surface a `TS2322` from a duplicate
    `zod` install. The fix is a `package.json` `zod` **override**, NOT touching
    the shim. Recorded here as a discovery note only; no work under this change.

### Out of Scope — general

- **Config `profiles` overhaul** (fast / balanced / quality presets): deferred as
  a larger standalone change.
- **Change B — graph traversal** and **Change C — consolidation/decay**: separate
  future changes; referenced only for sequencing.
- **Adding or removing any MCP tool.** This change modifies the *behavior* of the
  existing `mem_context` and `mem_project` tools only; the compact six-tool
  surface (constitution P1) is preserved unchanged.
- **Changing `mem_save` input truncation semantics** (writes still warn, never
  silently truncate).

## Approach

1. **Budget primitive (PRIMARY).** Introduce `maxContextChars` in config
   (`src/config.ts`, with `THOTH_*` env override and persisted default, mirroring
   `maxContentLength` resolution). Thread it into a bounded render used by
   `getContext` so the "Recent Observations" section emits previews and the whole
   response is trimmed to budget with an explicit shown/omitted footer. Reuse
   `truncateForPreview` and the `trimToBudget` pattern rather than inventing a new
   trimming algorithm.
2. **Apply at both surfaces (PRIMARY).** `mem_context` and `formatProjectSummary`
   inherit the bounded output automatically because both flow through
   `getContext`; verify the HTTP `/projects/{project}/summary` payload shrinks
   correspondingly. Add a `mem_get` pointer to the rendered output.
3. **Document the input/output split (PRIMARY).** Make explicit in spec + config
   docs that `maxContentLength` governs *input* (warn-only) and `maxContextChars`
   governs *output* (enforced), so the two are not conflated.
4. **Route deferred items (no code in this change).** Trace retention → D-1
   (`production-hardening-dashboard-v2`), HTTP graph-route deprecation → D-2
   (same), `SyncImportResult` field removal → D-3 (`sync-and-resilience`). No
   spec deltas or code for these land here; see "Deferred — routed to owner
   change".

## Affected Areas

| Module | Files | Nature |
| --- | --- | --- |
| store | `src/store/index.ts` (`getContext` ~1200-1242, esp. `observationBlocks` join at :1212) | bounded, preview render at the shared layer |
| tools | `src/tools/mem-context.ts` (returns `getContext` verbatim); `src/tools/project-views.ts` (`formatProjectSummary` 10-16, wraps `getContext`) | inherit bounded output |
| utils | `src/utils/content.ts` (`formatObservationMarkdown` 28-38; `truncateForPreview` 3-12) | preview/truncation render mode |
| config | `src/config.ts` (new `maxContextChars` ~197/~420; `maxContentLength` doc clarification) | new output cap knob |
| http | `src/http-routes.ts` (`handleProjectSummary` 1032 — inherits via shared `getContext`) | bounded summary (inherited, no route change) |
| cli | `src/cli.ts` (~380 project summary path — inherits via shared `getContext`) | bounded summary (inherited) |

> Deferred items touch additional files (`src/tools/tracing.ts`,
> `src/http-server.ts`, `src/http-openapi.ts`, `src/sync/index.ts`,
> `dashboard/src/api/client.ts`); those edits are owned by the routed changes and
> are NOT performed here.

### Affected OpenSpec specs

- `openspec/specs/tools/spec.md` — ADDED: `mem_context` and
  `mem_project action=summary` output MUST be bounded by a configurable total
  character budget; previews-by-default with full content only via `mem_get`;
  per-call budget override; unbounded sentinel; bound applied at the shared
  `getContext` layer so HTTP + CLI inherit it. (Compact-surface requirement
  unchanged.)
- `openspec/specs/store/spec.md` — ADDED: `Store.getContext` MUST accept and
  enforce a max-output-chars budget; `formatObservationMarkdown` MUST support a
  preview/truncation mode used by bounded context rendering.
- `openspec/specs/config/spec.md` — ADDED: `maxContextChars` resolution
  (env > persisted > default); MODIFIED: clarify `maxContentLength` is
  input-validation warn-only (save-time) and DISTINCT from the new output cap.
- (note) No HTTP-API, observability, or sync spec deltas are authored here — the
  `/projects/{project}/summary` payload shrinks automatically from the shared
  `getContext` bound, and all deferred pruning lives in the routed owner changes
  (`production-hardening-dashboard-v2`, `sync-and-resilience`).

## Risks

- **Information loss from previews.** Truncating recent-observation content could
  hide detail callers expected inline. Mitigated by the `mem_get` escalation
  pointer (P4 funnel) and a generous, configurable budget.
- **Budget mis-sizing.** Too small a default starves legitimate context; too
  large fails to fix the bug. Mitigated by aligning the default with existing
  caps and making it env-overridable.
- **Shared-layer regression surface.** Applying the bound at `getContext` means
  every caller (MCP `mem_context`, `mem_project summary`, HTTP summary, CLI
  summary) changes behavior at once. Mitigated by applying the bound at the
  single shared layer (no per-caller divergence) and by the unbounded sentinel
  for rollback.

> Cross-change collision and sync-field-removal risks no longer apply to this
> change: those items are deferred to their owner changes (D-1..D-3).

## Breaking-Change Surface and Deprecation Strategy

Per constitution **P5** (deprecation discipline) and the config rule "Warn before
merging destructive deltas":

- **Output cap (PRIMARY) — NOT breaking.** Delivered as a config-defaulted cap
  with previews + `mem_get` escalation. Same tools, same routes, smaller payload.
  No deprecation notice required; full content remains reachable via `mem_get`.
- **`maxContentLength` clarification (PRIMARY) — NOT breaking.** Input behavior
  unchanged (warn-only); documentation/spec clarified.

> All deprecation-bearing surfaces (HTTP graph route, `SyncImportResult` fields)
> are deferred to their owner changes (D-2, D-3) and carry no breaking surface
> here. The zod-compat shim is KEEP/verified-live and is not touched.

## Rollback Plan

- **PRIMARY output cap:** set `maxContextChars` to a very large value (or the
  documented "unbounded" sentinel) via env/persisted config to restore prior
  full-dump behavior without code revert; or revert the `getContext` render diff
  (single function) — `mem_context` / `formatProjectSummary` need no change since
  they only pass through.

> Deferred items (D-1..D-3) ship no code under this change, so there is nothing
> destructive to roll back here for them.

## Conflict Notes and Routing

This change is deliberately scoped to avoid all cross-change file collisions: it
edits only the shared `getContext` render path, `formatObservationMarkdown`, and
config. The pruning items that touched files owned by other in-flight changes are
routed to those changes rather than implemented here.

- **`production-hardening-dashboard-v2`** (in-flight) owns the tracing layer
  (`src/tools/tracing.ts`, `saveOperationTrace`), the HTTP graph/summary surface
  (`http-api` spec), and `dashboard/src/**`. **D-1** (trace retention) and **D-2**
  (graph-route deprecate-then-remove) are routed there so the policy is defined
  beside the code that creates it.
- **`sync-and-resilience`** (in-flight) owns the sync response shape (`sync`
  spec; v1→v2 chunk format, mutation journal, tombstones) and lists "Silent
  truncation behavior changes" as Out of Scope (consistent with this change's P-3
  input decision). **D-3** (`SyncImportResult` field removal) is routed there and
  sequenced after its response shape stabilizes.
- **Sequencing:** PRIMARY (P-1..P-3) ships independently now with no conflict.
  D-1/D-2/D-3 are owned and sequenced by their respective changes.

## Success Criteria

- `mem_context` and `mem_project action=summary` responses are bounded by
  `maxContextChars` and no longer reproduce the ~104K / ~74K dumps; the bound is
  configurable and reported in output.
- Full observation content is no longer emitted inline by the context/summary
  paths but remains retrievable via `mem_get`.
- The HTTP `/projects/{project}/summary` payload and the CLI summary output
  shrink correspondingly because the bound is applied at the shared `getContext`
  layer (no per-surface code change required).
- `maxContentLength` (input, warn-only) and `maxContextChars` (output, enforced)
  are documented as distinct, non-conflated knobs.
- The compact six-tool MCP surface and the lexical+KG fallback (`observation_facts`)
  are unchanged.

> Deferred success criteria (trace retention bound; HTTP graph route +
> `SyncImportResult` deprecation) are owned and verified by D-1..D-3 in their
> respective changes, not here.

## Caps-Design Decisions (resolved by sdd-clarify)

> Scope reduced to caps-design decisions only. The deferred-item clarifications
> (trace retention, HTTP graph route, sync fields, zod-compat) belong to the owner
> changes (D-1..D-3) and are not carried here. The four caps-design items below
> were resolved in `sdd-clarify` and confirmed authoritatively by the
> orchestrator (low-stakes tunables); no `[NEEDS CLARIFICATION]` markers remain.
> The authoritative wording lives in `specs/config/spec.md`.

1. **Output cap default value — RESOLVED.** Default `maxContextChars = 8000`.
   Modestly above `mem_recall`'s `MAX_CONTEXT_CHARS=6000` because context/summary
   aggregate multiple recent observations (≈ 20 previews at ~300 chars plus
   headers/metadata). A single documented default; no per-surface divergence.
2. **Global vs per-surface budget — RESOLVED.** A single shared budget enforced at
   the `Store.getContext` layer (inherited by `mem_context`,
   `mem_project action=summary`, HTTP summary, and CLI), PLUS an optional per-call
   override on `mem_context` and `mem_project action=summary`. No distinct
   per-surface defaults.
3. **Unbounded sentinel — RESOLVED.** The value `0` means "no output cap"
   (explicit opt-out); selectable only by explicit configuration, never the
   default.
4. **Knob naming — RESOLVED.** Config key `maxContextChars`; env
   `THOTH_MAX_CONTEXT_CHARS`; resolution env > persisted config > default
   (consistent with `src/config.ts`). Distinct from the input-side
   `maxContentLength`.

## Future Changes (program context)

- **Change B — Graph traversal** (separate proposal; out of scope here).
- **Change C — Consolidation / decay** (separate proposal; out of scope here).
