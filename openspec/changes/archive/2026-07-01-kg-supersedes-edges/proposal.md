# Proposal: KG Supersedes / Temporal Edges (Change B3)

> Sub-change **B3** of the **Change B** graph-evolution program.
> **B1** (`graph-lite-consolidation` — `kg_triples` is the single graph-fact
> source) and **B2** (`kg-multi-hop-recall` — entity-anchored multi-hop
> traversal) are **SHIPPED + archived**. B3 builds directly on both: it adds
> supersession edges over `kg_triples` and teaches multi-hop traversal + recall
> to prefer current truth. **B4** (community summaries) remains deferred to
> **Change C**.

## Intent

thoth-mem's knowledge graph currently records facts as monotonic, append-only
triples (`kg_triples`, `src/store/schema.ts:195-213`). There is no notion of a
fact being *stale*: when an observation evolves (a decision is reversed, a
service is replaced, a config value changes), the old triples and the new
triples coexist with equal standing. Recall, `mem_project action=graph`, and the
B2 multi-hop traversal can all surface a fact that the agent itself later
overrode, with nothing marking it as outdated. This is the "evolving memory needs
a current-vs-stale distinction" gap called out in the validated discovery
findings:

- `review/thoth-mem/graph-gap` (obs:5829): the KG has "no temporal/supersedes
  edges"; making it traversable (B2) and temporally aware (B3) is the biggest
  remaining opportunity after consolidation.
- `review/thoth-mem/change-b-plan` (obs:5838): B3 = "add SUPERSEDES/CONTRADICTS/
  REPLACES to `KG_RELATION_TYPES`; deterministic supersession detection
  (topic_key + observation_versions + content patterns; LLM optional); schema
  Option B (explicit supersedes edges / `supersedes_triple_id`) **preferred over**
  full bi-temporal `valid_at/invalid_at` (defer that to C if needed)."
- `review/thoth-mem/improvement-roadmap` (obs:5832): B3 is the **first** B
  sub-change that needs a **real schema migration**; the main fork to confirm is
  Option B (explicit supersedes edges, MVP) vs Option C (full bi-temporal +
  point-in-time queries).

The goal of B3 is: **let newer facts mark older facts as superseded, and make
recall / ranking / traversal prefer current truth — WITHOUT deleting history**
(constitution **P5**: supersede, don't delete).

> **MECHANISM RE-SCOPE (supersede-on-update / diff-based).** An earlier draft of
> B3 detected supersession via a deterministic CROSS-OBSERVATION
> `topic_key`-succession scan over `observation_versions`. That mechanism was
> **INERT** in normal usage: a `topic_key` upsert updates the existing
> observation IN PLACE (`src/store/index.ts:1504`), and the shared deterministic
> writer `persistKgExtraction` DELETEs + reinserts that observation's own triples
> by `source_id` on every re-extraction (`src/indexing/jobs.ts:537`). So two
> distinct observations never share `(topic_key, project, scope)` except via
> import/sync, and the per-observation `triple_hash`
> (`observation:${obs.id}:${tripleHash}`, `src/indexing/jobs.ts:552`) is wiped on
> every update — the cross-observation scan had nothing to match. That blind
> delete ALSO violates **P5** (supersede-not-delete) at the graph layer. B3 is
> therefore re-scoped to **SUPERSEDE-ON-UPDATE (diff-based)**: on every
> re-extraction the writer DIFFs the observation's prior triple set against its
> newly-extracted set and marks the removed/replaced prior facts superseded
> (kept, deprioritized) instead of deleting them. This fires on the COMMON
> evolving-memory update case (a `topic_key` re-save re-extracts the same
> `source_id`) and preserves graph history.

## Scope

### In Scope (Option B — recommended MVP)

1. **Supersession relation vocabulary.** Add `SUPERSEDES` (and, pending the
   clarification below, `CONTRADICTS` / `REPLACES`) to `KG_RELATION_TYPES`
   (`src/indexing/kg-extractor.ts:11-15`). These are *meta-edges* between facts /
   observations, kept distinct from the 18-relation structural traversal
   allow-list (`DEFAULT_KG_RELATION_ALLOW_LIST`, `src/config.ts:136-155`) so they
   never act as ordinary bridge edges in B2 traversal.

2. **Deterministic supersession detection (no LLM required) — on-update diff.**
   In the shared deterministic writer `persistKgExtraction`
   (`src/indexing/jobs.ts:502-556`, reached synchronously via `refreshGraphFacts`
   → `writeDeterministicKgFacts`, `src/store/index.ts:1119-1126`, and by the
   `extract_kg` job / `rebuild-graph` at `:3416`), REPLACE the blind
   delete-by-`source_id` + reinsert (`src/indexing/jobs.ts:537`) with a DIFF of
   the observation's prior vs newly-extracted triples for that same `source_id`:
   - **Primary signal — per-observation diff:** a prior triple ABSENT from or
     REPLACED in the new set is marked superseded (kept). A REPLACEMENT is a prior
     triple whose subject + relation match a new triple but whose object differs
     → `superseded_by_triple_id` points at the replacing triple; a pure removal
     leaves it NULL with `superseded_at` only. Triples in BOTH sets are left
     unchanged; triples NEW in the new set are inserted as current. Fully
     deterministic and model-free (constitution **P2**), and it fires on the
     common evolving-memory case (a `topic_key` re-save re-extracts the same
     `source_id`).
   - **Secondary signal — content-pattern hints (optional, lower confidence):**
     phrases such as "no longer", "replaced by", "deprecated", "changed to",
     "superseded by" mark a fact as superseding a matching prior fact even when
     the diff alone would not. Detection emits a confidence; only matches at or
     above a configured threshold and behind the content-pattern flag contribute
     a marking.
   - **Idempotent + update-safe**, reusing B1's `triple_hash` dedup discipline:
     re-extracting identical content converges to the same triple set, supersedes
     nothing new, and never accumulates duplicates.
   - **LLM-assisted contradiction detection is explicitly OUT of the MVP** and
     deferred to Option C / Change C; the background `extract_kg` job MAY later
     *enrich* supersession markings but deterministic supersession MUST NOT depend
     on it (parity with B1's "LLM enrichment is optional, non-blocking"). Because
     the diff lives in the SHARED writer, the synchronous path and the
     `extract_kg`/`rebuild-graph` path stay consistent.

3. **Minimal schema migration (cleanest additive shape — Option B).** Mark a
   triple as superseded without a parallel table or bi-temporal columns. The
   shape is an additive, nullable `superseded_by_triple_id` column (plus a
   `superseded_at` timestamp) on `kg_triples`, set on the *old* triple:
   `superseded_by_triple_id` points at the *replacing* triple when one exists
   (same subject + relation, different object), else NULL for a pure removal with
   `superseded_at` only — preferred over a separate `kg_supersedes` edge table for
   MVP simplicity (final shape is a design decision). The migration is **additive and idempotent**, run via
   `addColumnIfMissing` in the live runner `runMigrationsWithSemantic`
   (`src/store/migrations.ts:213-216`), mirroring the established `LEGACY_COLUMN_
   MIGRATIONS` pattern. No existing column changes; no data loss.

4. **Retrieval integration — prefer current truth, preserve history.**
   - **Direct KG lane** (`queryKnowledgeLane`, `src/store/index.ts:2074-2164`):
     superseded triples are DEPRIORITIZED (score penalty / down-weight) or
     flagged, not dropped, so current facts rank above stale ones.
   - **Multi-hop traversal** (`buildKnowledgeMultiHopTraversalSql`,
     `src/store/index.ts:2237-2303`): superseded edges are skipped or
     deprioritized as bridge edges so the traversal frontier prefers current
     truth. The B2 cycle-guard / depth / neighborhood bounds are unchanged.
   - **Ranking** (`src/retrieval/ranking.ts`): a superseded candidate carries a
     `superseded` marker in its evidence so callers (and evals) can see *why* it
     ranked lower, consistent with constitution **P2** (degraded/secondary state
     signaled, never silently dropped).

5. **Surfacing — change the default current-state view, keep history
   reachable.**
   - `mem_recall` deprioritizes/annotates superseded evidence by default.
   - `mem_project action=graph` (`formatProjectGraph`,
     `src/tools/project-views.ts:31-60`) defaults to a **current-state** ledger
     (superseded facts hidden or visibly flagged), with history still derivable.
     The `max_chars` minimum-of-`200` budget behavior (tools spec line 161-162)
     is unchanged.
   - The visualization edge rows / relation listing expose the supersession
     relation in the vocabulary without breaking the existing relation set.

6. **Config — flag-gated, env-overridable (B2 pattern).** Add knobs to
   `KnowledgeGraphConfig` (`src/config.ts:39-47`), resolved env > persisted >
   default exactly like the B2 multi-hop knobs (`resolveKnowledgeGraphConfig`,
   `src/config.ts:447-474`): a master enable flag (default-safe), a detection
   confidence threshold, and a retrieval deprioritization weight. Mirror the
   `config.schema.json` additions.

7. **Eval — supersession win + no-regression gate.** Add a retrieval eval
   (`src/evals/retrieval.ts`) asserting (a) a newer fact ranks above the
   superseded prior fact for the same `topic_key`, (b) the superseded fact is
   deprioritized/flagged but not deleted, and (c) the full existing retrieval
   suite shows **0% regression** with the feature ON vs OFF — the same
   acceptance gate B2 used to default its flag ON.

### Deferred / Needs Discovery

- **Option C — full bi-temporal model** (`valid_at` / `invalid_at` +
  `created_at` / `expired_at` on `kg_triples`, LLM-assisted contradiction
  detection, and point-in-time "as-of" queries). Larger schema, higher cost,
  needs the optional LLM path to be load-bearing for contradiction detection.
  Recommended to **defer** to a later sub-change or **Change C**. Surfaced as the
  primary `[NEEDS CLARIFICATION]` fork below so the orchestrator/user can choose
  B vs C before spec.
- **Point-in-time / as-of queries** (`mem_recall` / `mem_project` "state as of
  date T"). Deferred with Option C; Option B records *that* a fact was superseded
  and *by what*, not a queryable validity interval.
- **`CONTRADICTS` / `REPLACES` as distinct relations** vs a single `SUPERSEDES`
  meta-edge with a typed sub-reason — see `[NEEDS CLARIFICATION]`.

### Out of Scope

- Deleting, hard-removing, or rewriting superseded triples (constitution **P5**:
  supersede, don't delete; history is preserved).
- Any change to the MCP tool surface count or names (constitution **P1**): no new
  MCP tool is added; B3 changes behavior *within* the existing six tools.
- Changing the portable export/import format or its `version`
  (`exportData`/`importData`, `src/store/index.ts`): export serializes only
  `sessions`/`observations`/`prompts` and never `kg_triples`; B3 does not change
  that (constitution **P2** portability — graph is fully derivable on rebuild).
- B4 community summaries (Leiden / LazyGraphRAG) — owned by **Change C**.
- LLM-assisted contradiction detection — deferred (Option C / Change C).

## Approach

B3 is layered on the B1 + B2 foundation and follows the established per-change
flow (plan → oracle `[OKAY]` → external implementation → review + verify GREEN →
commit → archive). Recommended decomposition for the spec/tasks phases:

1. **Vocabulary + schema (additive):** add the supersession relation(s) to
   `KG_RELATION_TYPES`; add the nullable `superseded_by_triple_id` /
   `superseded_at` column(s) via `addColumnIfMissing` in
   `runMigrationsWithSemantic`. Idempotent, reversible.
2. **Deterministic detection on update (diff):** in the shared writer
   `persistKgExtraction`, replace the blind delete-by-`source_id` + reinsert with
   a diff of prior vs newly-extracted triples for that observation, marking
   removed/replaced prior facts superseded (kept); add the optional
   content-pattern detector behind the confidence threshold. Preserve B1
   idempotency (`triple_hash`) and resolve the re-assert UNIQUE collision (revive
   the superseded row) at design.
3. **Retrieval + traversal integration:** deprioritize/flag superseded triples in
   `queryKnowledgeLane`, skip/deprioritize them as bridge edges in the multi-hop
   CTE, and mark them in ranking evidence.
4. **Surfacing:** default current-state view for `mem_recall` and
   `mem_project action=graph`; expose the relation in visualization.
5. **Config + eval:** flag-gated knobs (env > persisted > default); supersession
   eval + 0%-regression gate as the condition for defaulting the flag ON.

**Detection-confidence + threshold design** reuses the existing extractor
confidence convention (`RELATION_PATTERNS` confidences, `src/indexing/
kg-extractor.ts:55-103`): the deterministic per-observation diff signal is
high-confidence; content-pattern hints are lower-confidence and gated by the
configurable threshold.

## Affected Areas

| Module | File(s) | Change |
| --- | --- | --- |
| KG extractor / writer | `src/indexing/kg-extractor.ts`, `src/indexing/jobs.ts` | Add `SUPERSEDES` to `KG_RELATION_TYPES`; **replace the blind delete+reinsert in `persistKgExtraction` (`:537`) with the prior-vs-new diff** that marks removed/replaced facts superseded (shared by sync + `extract_kg`/`rebuild-graph`); optional content-pattern detector behind the threshold |
| Schema | `src/store/schema.ts` | Additive nullable `superseded_by_triple_id` / `superseded_at` on `kg_triples` (`:195-213`); optional supporting index |
| Migrations | `src/store/migrations.ts` | Idempotent additive column add via `addColumnIfMissing` in `runMigrationsWithSemantic` (`:213-217`); reversible |
| Store | `src/store/index.ts` | Diff write reached via `refreshGraphFacts` → `writeDeterministicKgFacts` (`:1119-1126`; call sites `:1515`,`:1545`,`:1664`,`:3416`); deprioritize/flag superseded triples in `queryKnowledgeLane` (`:2074-2164`); skip/deprioritize superseded bridge edges in `buildKnowledgeMultiHopTraversalSql` (`:2237-2303`); current-state default in graph reads |
| Ranking | `src/retrieval/ranking.ts` | Carry `superseded` marker so superseded evidence is visibly deprioritized, not silently dropped |
| Config | `src/config.ts`, `config.schema.json` | `KnowledgeGraphConfig` knobs (enable flag, confidence threshold, deprioritization weight) resolved env > persisted > default (B2 pattern, `:447-474`) |
| Tools / views | `src/tools/project-views.ts` | `mem_project action=graph` default current-state ledger (history reachable); `mem_recall` superseded annotation |
| Evals | `src/evals/retrieval.ts` | Supersession-wins eval + no-regression gate (B2 precedent) |
| Specs (baseline) | `openspec/specs/{knowledge-graph,store,retrieval,config,evals,tools}/spec.md` | Delta specs for the above |

## Risks

- **Recall regression (false supersession).** Over-aggressive content-pattern
  detection could deprioritize still-current facts. *Mitigation:* the
  deterministic per-observation diff is the primary high-confidence signal (it
  only supersedes a fact the SAME observation removed/replaced); content patterns
  are gated by a configurable threshold, default OFF, and the 0%-regression eval
  gate is the condition for defaulting the flag ON.
- **Shared-writer behavior change (`persistKgExtraction`).** Replacing the blind
  delete+reinsert with a diff changes the core write used by the synchronous path,
  the `extract_kg` job, AND `rebuild-graph`. *Mitigation:* the diff lives in one
  shared function so all paths stay consistent; flag-OFF reverts to the exact
  delete+reinsert; `rebuild-graph` counters (`src/store/index.ts:3413-3421`) must
  be re-checked since they count deleted/created triples around the writer.
- **Multi-hop interaction (B2).** Skipping superseded bridge edges changes the
  traversal frontier. *Mitigation:* default to *deprioritize* rather than hard
  *skip* (behind a knob), and re-run the B2 multi-hop eval cases for no
  regression.
- **Re-assert UNIQUE collision.** Re-asserting a previously-superseded fact
  (same per-observation `triple_hash`) collides on the `triple_hash` UNIQUE
  constraint. *Mitigation:* on conflict, REVIVE the superseded row (clear the
  supersession columns) via the existing `ON CONFLICT(triple_hash) DO UPDATE`
  hook rather than inserting a duplicate; exact rule owned at design (see
  `[NEEDS CLARIFICATION]` item 8).
- **Storage growth (superseded rows retained).** Triples accumulate since
  superseded rows are kept. *Mitigation:* intended **P5** behavior; bounded for
  B3, pruning deferred to Change C (item 9).
- **Graph-view behavior change.** B1/B2 kept `mem_project action=graph`
  byte-for-byte (tools spec line 150-162). B3 *intentionally* changes the default
  view to current-state. *Mitigation:* gate behind the feature flag (OFF →
  identical legacy output), flag the change explicitly in the tools delta, and
  keep history reachable.
- **Schema-migration risk (first real one in Program B).** *Mitigation:*
  additive nullable column only; `IF NOT EXISTS` / `addColumnIfMissing`
  idempotency; reversible (drop the additive column / ignore the relation).

## Rollback Plan

- **Feature flag (primary):** the supersession behavior is gated by a
  default-safe `KnowledgeGraphConfig` flag (env `THOTH_*` override + persisted +
  default, B2 pattern). Setting it OFF restores pre-B3 behavior — no
  supersession detection on save, no deprioritization in recall/traversal,
  legacy `mem_project action=graph` view — *without a code revert*, mirroring the
  established `graphFactsSource` / `kgMultiHopEnabled` rollback discipline.
- **Reversible migration:** the migration is additive (nullable column via
  `addColumnIfMissing`, or `CREATE TABLE IF NOT EXISTS` for the edge-table
  variant). Rollback re-runs as a no-op; the additive column can be dropped or
  simply ignored, and the supersession relation can be removed from the
  vocabulary, with **no data loss** (the underlying facts and `observation_
  versions` history are untouched and fully derivable on `rebuild-graph`).
- **Detection-only kill switch:** because superseded facts are deprioritized
  (not deleted), even with edges present, forcing the retrieval weight to neutral
  restores legacy ranking.

## Breaking-Change Surface + Deprecation Discipline

- **No public-contract break (constitution P1/P3/P5).** No MCP tool is
  added/renamed/removed; HTTP routes, CLI command names, and the observation
  type taxonomy are unchanged. The portable export/import format and its
  `version` are unchanged (graph is derivable).
- **`mem_project action=graph` default-view change** is the one observable
  behavior change; it is flag-gated (OFF = identical legacy output) and history
  remains reachable, satisfying **P5** "supersede, don't delete." It is
  documented in the tools delta as an intentional, reversible default change
  rather than a silent rename/removal.
- **Versioning:** likely **MINOR** (current `0.3.6`). Rationale follows the B1
  precedent (CL-5): the schema change is **additive + backward-compatible**
  (nullable column, idempotent), loses no data, and breaks no observable public
  contract; the constitution **P3** "destructive migrations require MAJOR" clause
  targets data-losing / contract-breaking migrations, which this is not. **Confirm
  at release** (see `[NEEDS CLARIFICATION]`).

## Conflict Notes

- **`sync-and-resilience` (in-flight) — write path:** the re-scoped B3 no longer
  reads `observation_versions` as a signal; supersession is detected purely from
  the per-observation triple diff in `persistKgExtraction`. B3 does **not** alter
  the `observation_versions` schema or its insert order. The remaining overlap is
  the shared synchronous write block (`refreshGraphFacts`, `src/store/index.ts:1119-1126`):
  if `sync-and-resilience` reorders save/upsert/version writes, B3's diff write
  still operates on the post-extraction triple set for the same `source_id` — but
  re-confirm the writer is invoked after the observation row is final at design
  time. Import/sync remains the one path where two observations can share
  `(topic_key, project, scope)`; the diff is per-`source_id`, so it neither
  fires nor false-positives across them.
- **`production-hardening-dashboard-v2` (legacy `/graph`):** B1 already
  coordinated the `/graph` endpoint / `observation_facts` drop with this change.
  B3 adds no new `/graph` coupling beyond the current-state default view.
- **B2 multi-hop:** B3 must re-validate the B2 multi-hop eval cases (no
  regression) since it touches `buildKnowledgeMultiHopTraversalSql`.

## References to Change C

- Full **bi-temporal** model + **point-in-time queries** (Option C) and
  **LLM-assisted contradiction detection** are candidates for Change C if not
  taken here.
- **B4 community summaries** (Leiden / LazyGraphRAG) remain owned by Change C.

## [NEEDS CLARIFICATION]

> Items 1, 2, 4, 5, 6, 7 are **RESOLVED** and encoded as `## Assumptions` in the
> delta specs (Option B; `SUPERSEDES`-only; no LLM; additive nullable columns;
> deprioritize+flag with current-state default only at `action=graph`; MINOR
> bump). Items 3, 8, 9 are the genuine design-phase wrinkles carried forward by
> the re-scope.

1. **RESOLVED — Option B (deterministic, additive, no bi-temporal/point-in-time).**
   User confirmed Option B; Option C (bi-temporal `valid_at`/`invalid_at`,
   LLM-assisted contradiction detection, point-in-time queries) is deferred to a
   later sub-change / Change C.
2. **RESOLVED — `SUPERSEDES` only.** `CONTRADICTS` / `REPLACES` deferred.
3. **Content-pattern scope + threshold (design wrinkle).** The PRIMARY signal is
   now the deterministic per-observation diff (always on under the flag). For the
   OPTIONAL secondary content-pattern detector: default threshold value and which
   patterns ("no longer", "replaced by", "deprecated", "changed to", "superseded
   by") ship in MVP. (Recommendation: diff always on; content patterns
   conservative, default OFF, behind the `0.8` threshold.)
4. **RESOLVED — no LLM in B3.** The diff is deterministic and lives in the shared
   writer; the background `extract_kg` job may only *enrich*, never gate.
5. **RESOLVED — additive nullable columns on `kg_triples`** (not a separate
   `kg_supersedes` table).
6. **RESOLVED — deprioritize + flag** in recall/traversal; current-state default
   only at `mem_project action=graph`.
7. **RESOLVED — MINOR bump** (additive, backward-compatible) — confirm at release.
8. **`triple_hash` UNIQUE collision on re-assert (design wrinkle).** `triple_hash`
   is `TEXT NOT NULL UNIQUE` and per-observation
   (`observation:${obs.id}:${tripleHash}`). If a superseded fact is later
   re-asserted (same content → same `triple_hash` as the retained superseded
   row), the insert collides. (Recommendation: REVIVE the existing superseded row
   — clear `superseded_at` / `superseded_by_triple_id` — rather than insert a
   duplicate; the existing `ON CONFLICT(triple_hash) DO UPDATE` is the hook.
   Design owns the exact revive rule.)
9. **Storage growth / pruning (design wrinkle, tradeoff).** Triples now accumulate
   (superseded rows retained, deprioritized) — the intended **P5** behavior.
   (Recommendation: accept the bounded growth for B3; defer pruning/compaction of
   long supersession chains to Change C.)

## Success Criteria

- Updating an observation so its re-extracted facts change deterministically
  supersedes the removed/replaced prior facts (kept, not deleted) via the
  per-observation diff, with no LLM required (constitution **P2**), and the write
  is idempotent — re-extracting identical content supersedes nothing new
  (`triple_hash` dedup, parity with B1).
- In recall and multi-hop traversal, the current fact ranks above the superseded
  fact; the superseded fact is **deprioritized/flagged, not deleted**
  (constitution **P5**), and the secondary/superseded state is signaled in output
  (constitution **P2**).
- `mem_project action=graph` defaults to a current-state ledger with history
  still reachable; with the flag OFF, output is identical to pre-B3.
- The supersession eval passes AND the full existing retrieval eval suite shows
  **0% regression** with the feature ON vs OFF (B2 acceptance precedent), which
  is the gate for defaulting the flag ON.
- The schema migration is additive, idempotent, and reversible; feature-flag and
  migration rollback both restore pre-B3 behavior without data loss.
- No change to the MCP tool count/names, HTTP/CLI surface, observation taxonomy,
  or portable export format/version (constitution **P1/P3**).
