# Proposal: Graph-Lite Consolidation

> **Sub-change B1 of the Change B (graph evolution) program.** The program is
> sequenced B1 → B2 → B3:
> - **B1 (this change)** — Graph-lite consolidation: make `kg_triples` the single
>   source of graph truth and retire the redundant `observation_facts` precursor.
> - **B2 (FUTURE)** — Entity-anchored multi-hop recall (`WITH RECURSIVE` over
>   `kg_triples`). Referenced only; OUT OF SCOPE here.
> - **B3 (FUTURE)** — Bi-temporal / supersedes edges. Referenced only; OUT OF
>   SCOPE here.
> - **Change C (FUTURE)** — Community summaries (Leiden / LazyGraphRAG).
>   Referenced only; OUT OF SCOPE here.
>
> B1 is the foundational, LOW-risk step. It unblocks B2/B3 by removing the
> parallel-duplication that would otherwise have to be carried through traversal
> and temporal work.

## Intent

thoth-mem currently maintains **two** deterministic graph stores that are
populated from the same observation content:

1. `observation_facts` (the **"graph-lite"** precursor) — string-subject rows
   (`subject/relation/object`), written **synchronously** on save via
   `refreshObservationFacts`.
2. `kg_entities` + `kg_triples` (the **rich KG**) — typed entities with
   provenance and confidence, populated **eventually** by the `extract_kg`
   background job.

Per the validated discovery finding (`review/thoth-mem/graph-gap`, REV3 —
supersedes REV2's "keep as fallback"), `observation_facts` is **redundant legacy**:

- **Precursor, not fallback.** `observation_facts` shipped 2026-05-19
  ("graph-lite derived facts"); `kg_entities`/`kg_triples` shipped 2026-05-30.
  The `hybrid-core-retrieval` design explicitly kept `observation_facts` "as a
  compatibility fallback/source" — an **incomplete migration**, not a designed
  degraded-mode safety net.
- **Strict subset.** Its 7 relations
  (`HAS_TYPE`, `IN_PROJECT`, `HAS_TOPIC_KEY`, `HAS_WHAT`, `HAS_WHY`,
  `HAS_WHERE`, `HAS_LEARNED`) are all among the rich KG's relation set; its
  string subjects are a lossy form of the KG's typed entities.
  `observation_facts` ⊂ `kg_triples`.
- **Not a real fallback.** Both populate **deterministically** from the same
  content (the deterministic `extractKnowledgeTriples` always runs first in
  `processKgJob`; the LLM is optional enrichment only). There is no separate
  `observation_facts` ranking lane that survives when `kg_triples` is absent —
  in `queryKnowledgeLane` the two are summed side-by-side. This is parallel
  duplication, not safe degradation.

Carrying two stores doubles the write path, the migration surface, and the
reader surface, and would force B2/B3 to reconcile both. **Consolidating onto
`kg_triples` as the single source of graph truth is a prerequisite** for the
traversal (B2) and temporal (B3) work.

> **Why this is safe to do now (it was deliberately deferred before).** The
> immediately-prior change `output-caps-and-pruning` (Change A) explicitly listed
> `observation_facts` as **KEEP — verified LIVE** and out of scope, precisely
> because removal belongs to Change B. This proposal is that Change-B work.

## Scope

> Scope is authoritative and encoded faithfully below. The single objective is to
> make `kg_triples` the only graph-facts source and remove `observation_facts`,
> **without** changing the public behavior of the HTTP graph endpoint (whose
> removal is owned elsewhere — see Boundary).

### In Scope

#### A. Read adapter — derive `ObservationFact` from the rich KG

- **A-1. Add `getObservationFactsFromKg` (adapter).** Add a store method that
  produces the existing `ObservationFact` shape (`src/store/types.ts:92-102`:
  `id, observation_id, subject, relation, object, project, topic_key, type,
  created_at`) by reading `kg_triples` joined to `kg_entities` (for subject/object
  canonical names) and to `observations` (for `type`, and to enforce
  `deleted_at IS NULL`), filtered to `source_type = 'observation'`. It MUST accept
  the same filters as today's `getObservationFacts`
  (`ObservationFactsInput`: `observation_id?`, `project?`, `topic_key?`).
  - `Mapping`: `observation_id ← kg_triples.source_id`;
    `subject ← kg_entities.canonical_name` (subject side);
    `object ← kg_entities.canonical_name` (object side);
    `project`/`topic_key ← kg_triples`; `type ← observations.type`;
    `created_at ← kg_triples.created_at`; `id ← kg_triples.id` (stable synthetic).
  - `Reason`: single source of graph truth; preserve the `ObservationFact`
    consumer contract so reader migration is shape-preserving.

#### B. Migrate every reader of `observation_facts` to the adapter

> Anchors below were re-verified against the working tree; line numbers have
> drifted from the discovery notes and are corrected here.

- **B-1. `getObservationFacts`** (`src/store/index.ts:2969-2996`) — redirect to
  the adapter (becomes a thin wrapper, or callers switch to
  `getObservationFactsFromKg` directly).
- **B-2. `queryKnowledgeLane` fallback block** (`src/store/index.ts:2060-2087`)
  — remove the `observation_facts` `factCandidates` branch; the
  `kg_triples` `tripleCandidates` branch (2040-2058) already emits the same
  `subject relation object` text and stays as the sole KG-lane source.
- **B-3. Ranking sort tiebreaker** (`src/store/index.ts:1785-1789`) — the
  `a.source === 'observation_facts' ? -1 : 1` tiebreaker becomes dead once the
  `observation_facts` source is gone; simplify to score-then-`observationId`.
- **B-4. `getStats` relation distinct** (`src/store/index.ts:2666-2673`) —
  source distinct relations from the KG instead of `observation_facts`.
- **B-5. `getVisualizationRows`** (`src/store/index.ts:2683-2698+`) — source
  edges (`f.relation, f.object`) from the KG-backed adapter/view.
- **B-6. `getObservatoryLedgerDetail` (timeline/ledger detail)**
  (`src/store/index.ts:2500-2509+`) — uses `getObservationFacts(...)` and
  extracts by relation (`HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED`); inherits
  the adapter automatically once B-1 redirects.
- **B-7. `formatProjectGraph`** (`src/tools/project-views.ts:31-37`, calls
  `store.getObservationFacts({ project, topic_key })`) — inherits the adapter via
  B-1; no behavior change to the rendered ledger.
- **B-8. HTTP `getProjectGraphFacts`** (`src/http-routes.ts:307-311`, called by
  `handleProjectGraph` at `:1037`) — inherits the adapter via B-1. **Endpoint
  behavior preserved** (see Boundary).

#### C. Deterministic `kg_entities` backfill

- **C-1. Backfill typed entities for legacy string subjects/objects.** For
  existing `observation_facts` rows (and any KG rows) whose subject/object string
  lacks a corresponding `kg_entities` row, create a deterministic
  `kg_entities` entry with `entity_type = 'inferred'` (and the corresponding
  `kg_triples`) so the adapter returns complete results for already-saved data.
  This MUST be deterministic (no model required), consistent with constitution
  **P2**.
  - `Mechanism`: reuse the existing rebuild path rather than inventing a new one
    — see Approach step 3 and the [NEEDS CLARIFICATION] on backfill trigger.

#### D. Stop writing `observation_facts`

- **D-1. Remove/redirect `refreshObservationFacts`.** The synchronous writer
  (`src/store/index.ts:1094-1096`, delegating to `replaceObservationFacts`
  `:1068-1092`) is called at `saveObservation` (`:1483`), `updateObservation`
  (`:1513`), and `upsertObservation` (`:1632`) — each immediately beside
  `planSemanticJobsForObservation` (`:1484`/`:1514`/`:1633`, which already
  enqueues the `extract_kg` job). After cutover the consolidated KG path is the
  single graph writer. **This change interacts with the SYNC-vs-EVENTUAL question
  — see [NEEDS CLARIFICATION] CL-1.**
- **D-2. Clean the unified delete path.**
  `deleteKnowledgeArtifactsForObservation` (`src/store/index.ts:1118-1121`)
  already deletes BOTH `kg_triples` (by `source_id`) and `observation_facts`;
  drop the now-obsolete `observation_facts` delete once the table is gone.

#### E. Drop the table (LAST, after backfill + readers verified)

- **E-1. DROP `observation_facts` + its 3 indexes via migration.** Table at
  `src/store/schema.ts:281-292`; indexes
  (`idx_observation_facts_observation`/`_project`/`_topic`) at
  `src/store/schema.ts:350-352`. Remove the DDL from `SCHEMA_SQL`/index SQL and
  add a `DROP TABLE IF EXISTS observation_facts` migration step. **Ordering and
  rollback are defined below; this is the final, gated step.**
- **E-2. Repoint `rebuild-graph` CLI + writer plumbing.**
  `store.rebuildObservationFacts` (`src/store/index.ts:2998-3019+`) and the
  `rebuild-graph` CLI command (`src/cli.ts:34`, handler `:570-585`, dispatch
  `:700`) today rebuild the **legacy** table. Repoint them to rebuild the
  KG-backed graph (deterministic `kg_triples`/`kg_entities`) so the command does
  not reference a dropped table and remains the operator-facing rebuild entry
  point. The HTTP `POST /graph/rebuild` operation
  (`src/http-routes.ts:61`, `src/http-server.ts:98`) MUST keep working against
  the KG-backed rebuild.

### Boundary (entanglement with in-flight `production-hardening-dashboard-v2`)

- **PRESERVE** `GET /projects/{project}/graph` behavior. The route
  (`src/http-server.ts:123`), handler (`handleProjectGraph`,
  `src/http-routes.ts:1037`), fact-fetch (`getProjectGraphFacts`, `:307-311`),
  and OpenAPI entry (`src/http-openapi.ts:629-651`, already labeled "legacy
  compatibility route") all stay. This change ONLY repoints the underlying
  `getObservationFacts` call to the KG-backed adapter (B-1/B-8). The response
  shape and semantics are unchanged.
- **OUT OF SCOPE:** removal/deprecation of that endpoint. Per
  `output-caps-and-pruning` item **D-2**, deprecate-then-remove of
  `GET /projects/{project}/graph` (and migrating the dashboard client that calls
  it, `dashboard/src/api/client.ts:686`) is **owned by
  `production-hardening-dashboard-v2`** (it owns the `http-api` spec domain and
  the dashboard client). We coordinate, we do not remove.

### Out of Scope

- **B2 — entity multi-hop / neighborhood traversal** (`WITH RECURSIVE` over
  `kg_triples`). Future change.
- **B3 — bi-temporal / supersedes edges** (`SUPERSEDES`/`CONTRADICTS`/`REPLACES`,
  point-in-time queries). Future change.
- **Change C — community summaries** (Leiden / LazyGraphRAG). Future change.
- **Removal/deprecation of `GET /projects/{project}/graph`** — owned by
  `production-hardening-dashboard-v2` (Boundary above).
- **Adding or removing any MCP tool.** The compact six-tool surface
  (constitution **P1**) is unchanged.
- **Changing the sync/export portable format.** Verified not required — see
  Conflict Notes (EXPORT/SYNC).

## Approach

1. **Adapter first (A).** Land `getObservationFactsFromKg` and unit-test it
   against fixtures that exercise all 7 relations, so the derived shape matches
   the legacy `getObservationFacts` output for the same observations.
2. **Migrate readers (B).** Redirect `getObservationFacts` to the adapter (B-1)
   so the indirect readers (B-6/B-7/B-8) inherit it; then update the direct
   `observation_facts` SQL sites (B-2/B-3/B-4/B-5). Keep each reader's external
   output shape identical.
3. **Backfill (C) via the existing rebuild path.** `processRebuildJob`
   (`src/indexing/jobs.ts:359-416`) already enqueues `extract_kg` for every
   observation, and `processKgJob` (`:418-515`) writes `kg_entities`/`kg_triples`
   deterministically. Reuse this (repointed `rebuild-graph`, E-2) for the
   one-time backfill; add a deterministic `inferred`-entity step for any
   subject/object string that the extractor would not already entity-ize. (Open
   question CL-2: whether the backfill must also run automatically as a startup
   migration step or remain operator-triggered.)
4. **Stop synchronous writes (D)** only after A–C are verified, resolving CL-1
   (synchronous deterministic `kg_triples` write-on-save vs. accepting eventual).
5. **Drop the table (E)** last, behind the ordering + rollback below.
6. **Update evals** to populate/assert against `kg_triples` instead of
   `observation_facts`.

## Affected Areas

| Module | Files | Nature |
| --- | --- | --- |
| store | `src/store/index.ts` — adapter (new); readers `getObservationFacts` (2969), `queryKnowledgeLane` fallback (2060-2087), ranking tiebreaker (1785-1789), `getStats` relations (2666-2673), `getVisualizationRows` (2683+), ledger detail (2500+); writers `refreshObservationFacts`/`replaceObservationFacts` (1068-1096) + call sites (1483/1513/1632); delete path (1118-1121); `rebuildObservationFacts` (2998+) | add adapter; migrate readers; remove/redirect writer; repoint rebuild |
| store (schema) | `src/store/schema.ts` — table (281-292), indexes (350-352) | remove DDL |
| store (migrations) | `src/store/schema.ts` migration section / migration helpers (per `sync-and-resilience` structured-migration style) | add `DROP TABLE IF EXISTS observation_facts` step (gated) |
| tools | `src/tools/project-views.ts` (`formatProjectGraph` 31-37) | inherits adapter (no shape change) |
| http | `src/http-routes.ts` (`getProjectGraphFacts` 307-311, `handleProjectGraph` 1037, `rebuild-graph` op 61); `src/http-server.ts` (route 123, `/graph/rebuild` 98) | repoint to adapter; **endpoint preserved** |
| cli | `src/cli.ts` (`rebuild-graph` 34/570-585/700) | repoint to KG-backed rebuild |
| indexing | `src/indexing/jobs.ts` (`processRebuildJob` 359-416, `processKgJob` 418-515) | reuse for backfill; (optional) synchronous deterministic write helper if CL-1 → synchronous |
| evals | `src/evals/retrieval.ts` (fixtures insert into `observation_facts` 677-684; filter `source === 'observation_facts'` 767); `src/evals/kg-quality.ts` | migrate fixtures/assertions to `kg_triples` |
| types | `src/store/types.ts` (`ObservationFact` 92-102 — **retained**; it remains the adapter return type) | none (shape preserved) |

### Affected OpenSpec specs

> Delta specs are authored in the `sdd-spec` phase; this proposal records the
> mapping (per config rule "Identify affected modules/packages").

- `openspec/specs/knowledge-graph/spec.md` — **MODIFIED/ADDED:** `kg_triples` is
  the single source of graph-derived facts; the `ObservationFact` projection MUST
  be derivable from `kg_entities` + `kg_triples`; deterministic `inferred`-entity
  backfill for legacy string subjects/objects; the `observation_facts` store is
  removed.
- `openspec/specs/store/spec.md` — **MODIFIED:** `getObservationFacts` MUST be
  backed by the KG adapter (`getObservationFactsFromKg`); the synchronous
  `observation_facts` writer is removed; `rebuildObservationFacts` /
  `rebuild-graph` rebuild the KG-backed graph; **REMOVED:** the
  `observation_facts` table and indexes (destructive migration — see
  Breaking-Change Surface).
- `openspec/specs/tools/spec.md` — **MODIFIED (behavior-preserving):**
  `mem_project action=graph` (`formatProjectGraph`) and the ledger/timeline
  views continue to return the same `ObservationFact`-shaped ledger, now sourced
  from `kg_triples`. Compact six-tool surface unchanged.
- `openspec/specs/evals/spec.md` — **MODIFIED:** retrieval/KG eval fixtures and
  assertions reference `kg_triples` instead of `observation_facts`.
- `openspec/specs/indexing/spec.md` — **MODIFIED (if CL-1 → synchronous):** a
  deterministic `kg_triples` write occurs synchronously on save (in addition to,
  or replacing the immediacy gap left by, the eventual `extract_kg` job).
- *(note)* **http-api spec is NOT modified here.** `GET /projects/{project}/graph`
  keeps its current contract; its spec/deprecation lives under
  `production-hardening-dashboard-v2`.

## Breaking-Change Surface and Deprecation Strategy

Per constitution **P3** (schema migrations MUST be additive or backward
compatible; **destructive migrations require a MAJOR version bump and archive
warn**), **P5** (deprecation discipline), and the config rule "Warn before
merging destructive deltas":

- **Internal table drop (`observation_facts`) — DESTRUCTIVE but INTERNAL.**
  `observation_facts` is **not** part of the public contract: it is not an MCP
  tool, not an HTTP route, not a CLI command name, not an observation-type, and
  (verified) **not part of the sync/export format**. Its contents are fully
  derivable from `kg_triples`. The drop is therefore a safe internal
  consolidation. It still triggers the config "warn before merging destructive
  deltas" gate at archive, and — because it is a destructive schema migration —
  this change SHOULD carry the corresponding **MAJOR** version consideration per
  P3. (Recommended: confirm the semver intent at design; the data is
  reconstructable so user-facing breakage is nil.)
- **Public `ObservationFact` consumer shape — PRESERVED.** Every reader keeps its
  output shape; the adapter returns the same `ObservationFact` interface. No MCP
  tool / HTTP route / CLI command is renamed or removed. No deprecation notice is
  required for the public contract.
- **`GET /projects/{project}/graph` — PRESERVED (repointed only).** No breaking
  surface here; its deprecate-then-remove is owned by
  `production-hardening-dashboard-v2`.

## Migration Ordering and Rollback Plan

**Safe ordering (each step independently shippable / verifiable):**

1. **Adapter (A) + reader migration (B)** — additive; both stores still exist, so
   readers can be A/B compared. No data change.
2. **Backfill (C)** — populate `kg_entities`/`kg_triples` (incl. deterministic
   `inferred` entities) for all existing observations; verify adapter output
   covers the legacy `observation_facts` rows (row-count / relation-set parity
   check).
3. **Stop synchronous writes (D)** — only after (2) is verified and CL-1 is
   resolved.
4. **Drop table + indexes (E)** — last, after (1)–(3) verified.

**Rollback plan (staged, mirrors the ordering):**

- **Before E (table still present):** revert is trivial — restore the
  `getObservationFacts` body to read `observation_facts` and re-enable
  `refreshObservationFacts` at the three call sites. Both stores still hold data.
- **Cutover guard (recommended):** gate the reader source and the
  write-suppression behind a config flag (working name `graphFactsSource`:
  `kg` | `legacy`, default `legacy` until verified, then `kg`). This lets the
  cutover and rollback happen via config rather than code revert, consistent with
  the `output-caps-and-pruning` "unbounded sentinel" rollback pattern and
  `sync-and-resilience`'s "keep legacy path active" discipline.
- **After E (table dropped):** rollback = re-add the table DDL + indexes
  (`CREATE TABLE/INDEX IF NOT EXISTS` — idempotent) and run the existing
  `rebuildObservationFacts` (kept available, or restored from git) to repopulate
  from observations. Because `observation_facts` is fully derivable, no data is
  lost; a SQLite backup taken before E is the belt-and-suspenders recovery (same
  procedure `sync-and-resilience` documents).
- **Migration safety:** the DROP step MUST be `DROP TABLE IF EXISTS` and
  idempotent across repeated startups, following the structured-migration helper
  style introduced by `sync-and-resilience` (avoid the legacy
  `try ALTER … catch ignore` pattern).

## Conflict Notes and Coordination

- **`production-hardening-dashboard-v2` (in-flight) — `/graph` endpoint &
  dashboard.** Owns the `http-api` spec and the dashboard client
  (`dashboard/src/api/client.ts:686` calls `GET /projects/{project}/graph`). This
  change **preserves** the endpoint and only repoints its data source; the
  **removal/deprecation** of the endpoint stays with that change
  (`output-caps-and-pruning` D-2). Coordination: confirm the dashboard graph view
  still renders against KG-sourced facts; do not delete the route here.
- **`sync-and-resilience` (in-flight) — export format & migrations.**
  - *Export/versions:* **No conflict.** Verified that `exportData`
    (`src/store/index.ts:3156-3193`, `version: 1`) and `importData`
    (`:3195-3268`) serialize only `sessions`/`observations`/`prompts` — **never**
    `observation_facts`, `kg_triples`, or `kg_entities`. Dropping
    `observation_facts` does **not** change the portable format (constitution
    **P2** preserved). No coordination required for the format.
    - *Side note:* `importData` does not currently trigger graph derivation, so
      imported observations already rely on a subsequent `rebuild-graph`/job pass
      for graph facts. This pre-existing asymmetry is **not worsened** by
      consolidation (it applies equally to `kg_triples`); flagged only so the
      design accounts for it.
  - *Migrations:* reuse `sync-and-resilience`'s structured-migration helpers for
    the DROP step rather than the legacy try/catch style. Sequence the DROP after
    that change's migration helpers land if they are a shared dependency.
- **`output-caps-and-pruning` (archived) — predecessor.** It deliberately marked
  `observation_facts` KEEP/out-of-scope and routed the `/graph` removal to D-2.
  This change executes the Change-B consolidation that A deferred.

## [NEEDS CLARIFICATION]

> Per config `clarification.max_markers_per_spec: 3`. Each carries a recommended
> default; the orchestrator/clarify phase resolves these before `sdd-spec`.

- **CL-1 — Synchronous vs. eventual availability of graph facts (PRIMARY).**
  Today `observation_facts` is written **synchronously** on save, so graph facts
  are immediately queryable; `kg_triples` is written **eventually** by the
  `extract_kg` background job. After consolidation, do graph facts become
  eventual? **Recommended default: add a synchronous deterministic `kg_triples`
  write-on-save** (reusing the deterministic `extractKnowledgeTriples` path that
  `processKgJob` already runs first) so immediate availability is preserved and
  the existing `extract_kg` job remains for optional LLM enrichment. This keeps
  parity with current behavior and honors constitution **P2** (deterministic,
  no-model availability). The alternative (accept eventual graph facts, rely
  solely on the background job) is simpler but regresses immediate availability
  and is **not** recommended.
- **CL-2 — Backfill trigger.** Reuse the existing rebuild path
  (`rebuild-graph` CLI → `processRebuildJob`/`processKgJob`) — but should backfill
  of legacy rows run **automatically as a one-time startup migration step**, or
  remain **operator-triggered** via `rebuild-graph --all`? **Recommended default:
  operator-triggered `rebuild-graph --all` documented as a required upgrade step,
  PLUS an idempotent guard so a partial/absent backfill degrades gracefully**
  (the adapter simply returns fewer rows until rebuild runs — no error). An
  automatic startup backfill is heavier and risks long startup on large DBs;
  defer unless required.
- **CL-3 — Subject-semantics nuance for the `inferred`-entity backfill.** Legacy
  `observation_facts.subject` is **always the observation title**, whereas the
  KG-derived subject is the extracted entity's `canonical_name`. For the
  relation-extraction readers (`HAS_WHAT`/`HAS_WHY`/`HAS_WHERE`/`HAS_LEARNED` in
  `getObservatoryLedgerDetail` and `formatProjectGraph`) only `relation`/`object`
  are consumed, so behavior is preserved. **Recommended default: accept the
  KG-native subject** (canonical entity name) as the adapter's `subject` and
  document the minor difference; do **not** synthesize title-subjects to
  byte-match the legacy table. Confirm no consumer depends on `subject` equaling
  the title.

## Success Criteria

- `getObservationFactsFromKg` returns `ObservationFact`-shaped rows derived from
  `kg_entities` + `kg_triples` that match the legacy `getObservationFacts` output
  (relation set + per-observation coverage) for the same observations.
- Every former `observation_facts` reader (B-1…B-8) returns equivalent results
  sourced from `kg_triples`; `mem_project action=graph`, the ledger/timeline
  detail, and `GET /projects/{project}/graph` are behavior-preserved.
- No code path reads or writes `observation_facts`; `refreshObservationFacts` no
  longer runs on save; the unified delete path no longer references the table.
- The `observation_facts` table and its 3 indexes are dropped via an idempotent
  migration, executed only after backfill + reader migration are verified.
- `rebuild-graph` (CLI + `POST /graph/rebuild`) rebuilds the KG-backed graph and
  does not reference the dropped table.
- The sync/export portable format is unchanged (no `observation_facts` in
  export/import — verified).
- `pnpm run build` and `pnpm test` pass; retrieval/KG evals pass against
  `kg_triples`.
- The compact six-tool MCP surface and the deterministic lexical+KG availability
  guarantee (constitution **P1**/**P2**) are preserved.

## Future Changes (program context)

- **B2 — Entity-anchored multi-hop recall** (`WITH RECURSIVE` over `kg_triples`;
  existing `idx_kg_triples_subject`/`_object`/`_relation` indexes suffice for
  1–2 hops). Depends on B1. Separate proposal; OUT OF SCOPE here.
- **B3 — Bi-temporal / supersedes edges** (`SUPERSEDES`/`CONTRADICTS`/`REPLACES`,
  point-in-time queries; `observation_versions` already exists). Depends on B1.
  Separate proposal; OUT OF SCOPE here.
- **Change C — Community summaries** (Leiden / LazyGraphRAG, external lib).
  Separate proposal; OUT OF SCOPE here.
