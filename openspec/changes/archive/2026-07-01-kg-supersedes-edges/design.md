# Design: KG Supersedes / Temporal Edges (Change B3)

> Sub-change **B3** (`kg-supersedes-edges`) of Change B. Builds on shipped +
> archived **B1** (`graph-lite-consolidation`: `kg_triples` is the single
> graph-fact source) and **B2** (`kg-multi-hop-recall`: entity-anchored
> multi-hop traversal). Implements **Option B only** — deterministic
> supersession marking over `kg_triples` with additive nullable columns. There
> is NO bi-temporal `valid_at`/`invalid_at`, NO point-in-time/"as-of" queries,
> NO LLM path, and NO `CONTRADICTS`/`REPLACES` relations (CL-1, CL-2, CL-4).
>
> **MECHANISM (RE-SCOPED — supersede-on-update / per-observation diff).** This
> design replaces an earlier draft that detected supersession via a
> CROSS-OBSERVATION `(topic_key, project, scope)`-group sweep. That mechanism was
> INERT in normal usage and is fully removed (CL-3). B3 now detects supersession
> by DIFFING a SINGLE observation's PRIOR stored triple set against its
> NEWLY-EXTRACTED triple set on every re-extraction, inside the shared writer
> `persistKgExtraction`. Scope is B3 supersede-on-update ONLY.

## Technical Approach

B3 adds a deterministic "current-vs-stale" distinction to the knowledge graph
without deleting history. The signal is produced where memory actually evolves:
when an observation is re-saved/updated under a `topic_key` (or otherwise
re-extracted), the shared deterministic writer recomputes that observation's
`kg_triples`. Today that writer does a BLIND `DELETE FROM kg_triples WHERE
source_id = ?` (`src/indexing/jobs.ts:537`) and reinserts the fresh set, which (a)
destroys graph history on every update and (b) leaves nothing for any later scan
to compare against.

B3 turns that single write into a DIFF-AND-MARK-SUPERSEDED operation, all inside
`persistKgExtraction` (`src/indexing/jobs.ts:502`), the one shared writer reached
by the synchronous save/update/upsert path (`refreshGraphFacts` →
`writeDeterministicKgFacts`, `src/store/index.ts:1119-1126`, call sites
upsert `:1515`, create `:1545`, update `:1664`), by the background `extract_kg`
job, and by `rebuild-graph` (`src/store/index.ts:3416`). On each re-extraction the
writer compares the observation's prior triples to its new triples for the SAME
`source_id`: a prior fact that is gone or replaced is marked superseded (kept,
deprioritized); an unchanged fact is left alone; a genuinely new fact is inserted.
Recall, the B2 multi-hop traversal, fusion/ranking, and the `mem_project
action=graph` view then prefer current truth while keeping superseded facts
reachable.

Every behavior is gated behind a single master flag (`kgSupersedeEnabled`,
default ON, env > persisted > default). With the flag OFF the writer reverts to
the exact pre-B3 blind delete+reinsert and all observable output is
byte-identical to pre-B3.

### Why per-observation diff is the correct unit (code-accurate)

The literal phrasing "newer fact marks the older fact superseded" must be grounded
in how revisions actually touch the store:

- **Upsert path** (`saveObservation`, `src/store/index.ts:1485-1518`): a re-save
  under an existing `(topic_key, project, scope)` UPDATEs the SAME observation row
  (`existing.id`, `:1504-1506`) after copying prior content into
  `observation_versions` (`:1500-1502`), then calls `refreshGraphFacts`
  (`:1515`). The `source_id` is unchanged.
- **Update path** (`updateObservation`, `src/store/index.ts:1610-1668`): version
  row inserted (`:1617-1619`), row updated in place, then `refreshGraphFacts`
  (`:1664`). Same `source_id`.
- **The writer deletes before inserting** (`persistKgExtraction:537`): on every
  re-extraction it blindly deletes that `source_id`'s triples and reinserts the
  fresh set.

So the common evolving-memory case (a `topic_key` re-save / an `updateObservation`)
re-extracts the SAME `source_id`, and the prior facts are exactly the rows already
stored for that `source_id`. The diff unit is therefore the observation's own
`source_id` triple set — not a cross-observation group. This both fires on the
real update case AND restores **P5** (supersede, don't delete) at the graph layer
by removing the blind delete. (The removed cross-observation scan never had two
distinct same-group rows to compare in normal usage, because the upsert updates in
place; CL-3.)

### Triple identity for the diff (reuses B1's `triple_hash`)

A triple's content identity is the existing per-observation `triple_hash`,
`observation:${obs.id}:${tripleHash}` (`src/indexing/jobs.ts:552`), where the
inner `tripleHash` already encodes subject+relation+object content. The diff is a
set comparison of PRIOR `triple_hash` values vs NEW `triple_hash` values for the
same `source_id`:

- `prior ∩ new` → unchanged (leave current row as-is).
- `prior \ new` → removed/replaced (mark superseded, keep).
- `new \ prior` → new (insert as current).

A REPLACEMENT (for `superseded_by_triple_id`) is a removed prior triple whose
SUBJECT + RELATION match a NEW triple with a DIFFERENT OBJECT. Subject/relation
are resolved from entity names: the new set carries resolved `subject`/`object`
names directly (`ExtractedTriple`); the prior set resolves them by JOINing
`kg_entities` on the stored `subject_entity_id`/`object_entity_id`.

## Architecture Decisions

### Decision: Diff-and-mark-superseded inside the shared writer `persistKgExtraction`

**Choice:** Replace the blind `DELETE ... WHERE source_id = ?`
(`src/indexing/jobs.ts:537`) with a per-`source_id` diff. Load the prior triple
rows (id, `triple_hash`, `relation`, resolved subject/object names) BEFORE
inserting; compute the new triple set; then: keep unchanged rows untouched, insert
genuinely-new triples, and `UPDATE` removed/replaced prior rows to set
`superseded_at`/`superseded_by_triple_id` (kept, never deleted).

**Alternatives considered:**
- *Detect in a separate post-write sweep in `src/store/index.ts`.* Rejected: the
  sweep would have to re-derive the prior set the writer just overwrote; keeping
  the diff inside the one writer is the only place where BOTH prior and new sets
  are available, and it automatically covers the sync path, `extract_kg`, and
  `rebuild-graph` from a single site.
- *Detect in the background `extract_kg` job only.* Violates the store spec's
  "queryable immediately after save returns" requirement and constitution **P2**
  (LLM/job must not be load-bearing). The job MAY enrich later, never gate (CL-4).
- *Cross-observation `(topic_key, project, scope)` group sweep* (the prior draft).
  Removed (CL-3): inert under in-place upsert + delete-by-`source_id` reinsert; it
  also kept the P5-violating blind delete.

**Rationale:** One shared writer → consistent supersession across sync,
`extract_kg`, and `rebuild-graph`; fires on the common update case; preserves graph
history (P5); deterministic and model-free (P2). It reuses B1's `triple_hash` dedup
discipline so identical re-extraction is a no-op.

### Decision: Record supersession as two additive nullable columns on `kg_triples`

**Choice (CL-5):** Add `superseded_by_triple_id INTEGER NULL` and
`superseded_at TEXT NULL` to `kg_triples`, set on the OLD (superseded) triple.
NULL = current/not-superseded. Added via `addColumnIfMissing`
(`src/store/migrations.ts:103`) inside the LIVE runner `runMigrationsWithSemantic`
(`src/store/migrations.ts:213-217`), mirroring `LEGACY_COLUMN_MIGRATIONS`
(`:27-30`). The fresh-DB DDL in `src/store/schema.ts:195-213` also declares both
columns so new databases match; the `addColumnIfMissing` step is what upgrades
existing databases.

**Alternatives considered:**
- *Separate `kg_supersedes(old_triple_id, new_triple_id, at)` edge table.* More
  rows, an extra JOIN in every read lane (`queryKnowledgeLane`, the multi-hop CTE,
  the graph view), and a second write site to keep idempotent. No B3 requirement
  needs many-to-many supersession.
- *Bi-temporal `valid_at`/`invalid_at` columns (Option C).* Out of scope (CL-1):
  larger schema, point-in-time queries, optional-LLM becomes load-bearing.

**Rationale:** A nullable column is the smallest additive, idempotent,
backward-compatible shape (constitution **P3**): existing rows read as current with
no rewrite; the predicate is a cheap `superseded_by_triple_id IS [NOT] NULL` /
`superseded_at IS NOT NULL` on the existing scan; rollback is "ignore/drop the
column." Direct analogue of B1's additive migration discipline.

### Decision: Revive a superseded row on re-assert via `ON CONFLICT(triple_hash) DO UPDATE`

**Choice:** `triple_hash` is `TEXT NOT NULL UNIQUE` (`src/store/schema.ts:207`).
When a previously-superseded fact is later RE-ASSERTED (same content → same
per-observation `triple_hash` as the retained superseded row), the insert collides
on that UNIQUE constraint. Resolve it by EXTENDING the existing
`ON CONFLICT(triple_hash) DO UPDATE` (`src/indexing/jobs.ts:526-534`) to ALSO
clear the supersession columns:

```sql
ON CONFLICT(triple_hash) DO UPDATE SET
  source_id = excluded.source_id,
  ... (existing fields) ...,
  superseded_by_triple_id = NULL,
  superseded_at = NULL,
  updated_at = datetime('now')
```

So re-asserting REVIVES the existing row to current rather than inserting a
duplicate.

**Alternatives considered:** Insert a new row and soft-delete the old — rejected:
violates the UNIQUE constraint and accumulates duplicate identities. Delete the
superseded row first — rejected: loses history (P5) and the `superseded_at`
provenance.

**Rationale:** Reuses the existing conflict hook (no new write path), keeps a
single canonical row per `(observation, triple-content)` identity, and makes
re-assert deterministic and idempotent: assert → supersede → re-assert converges
to one current row.

### Decision: `superseded_by_triple_id` points at the replacement; NULL for a pure removal

**Choice:** A removed prior triple with a same-subject-and-relation,
different-object NEW triple is a REPLACEMENT → `superseded_by_triple_id` =
the replacing triple's id, `superseded_at` = now. A removed prior triple with NO
such replacement is a PURE REMOVAL → `superseded_at` = now,
`superseded_by_triple_id` = NULL. Readers treat "superseded" as
`superseded_by_triple_id IS NOT NULL OR superseded_at IS NOT NULL`, so a pure
removal is still recognized.

**Rationale:** Matches the spec scenarios exactly (replace-X-with-Y vs
removed-with-no-replacement) and lets recall explain *why* a fact ranked lower
(replaced by a specific newer fact, or simply withdrawn).

### Decision: Deprioritize-and-flag in retrieval (never delete); current-state default ONLY for `mem_project action=graph`

**Choice (CL-6):** In `queryKnowledgeLane`, the multi-hop CTE, and fusion,
superseded triples are DOWN-WEIGHTED and FLAGGED, never removed (constitution
**P2** secondary-signal-not-dropped; supersede-not-delete). The hide-or-flag
CURRENT-STATE default applies ONLY at `mem_project action=graph`;
`mem_recall`/multi-hop keep superseded evidence reachable and flagged. The
deprioritization predicate is `superseded_at IS NOT NULL OR
superseded_by_triple_id IS NOT NULL` — never a JOIN-existence check on the
referenced id — so a dangling reference never errors and never loses history.

**Rationale:** Recall must remain able to surface "this was true, now superseded"
as evidence; only the explicit ledger view defaults to current truth. Preserves the
four-lane contract (constitution **P4**) and P5.

### Decision: `SUPERSEDES` joins `KG_RELATION_TYPES` but is EXCLUDED from the multi-hop allow-list, and B3 emits NO `SUPERSEDES` triple rows

**Choice:** Append `'SUPERSEDES'` to `KG_RELATION_TYPES`
(`src/indexing/kg-extractor.ts:11-15`, currently 26 entries) and to the
`config.schema.json` `kgRelationAllowList` enum (`:191-218`), but DO NOT add it to
`DEFAULT_KG_RELATION_ALLOW_LIST` (`src/config.ts:136-155`, the 18 structural
relations). The supersession MARKER is carried by the two columns, NOT by inserting
`SUPERSEDES` triple rows — the relation is reserved/registered for vocabulary
completeness, diagnostics, visualization listings, and future enrichment.

**Alternatives considered:** Emit `SUPERSEDES` edges as real triples — rejected:
would re-introduce a parallel representation to keep idempotent, and the columns
already encode the marker. Add `SUPERSEDES` to the allow-list — rejected: B2
traversal would follow supersession as an ordinary bridge edge, contradicting
"prefer current truth" and the spec's explicit exclusion.

**Rationale:** Vocabulary membership keeps the relation set aware of `SUPERSEDES`
(additive, parity-safe); allow-list exclusion keeps it out of structural traversal;
column-only marking keeps detection from depending on inserting relation rows.

### Decision: Single master flag gates everything; default ON, eval-gated; flag-off byte-identical

**Choice:** `kgSupersedeEnabled` (default `true`) gates detection, the diff write,
retrieval deprioritization (direct + multi-hop), and the graph-view default. Three
sub-knobs: `kgSupersedeContentPatterns` (default `false`),
`kgSupersedeConfidenceThreshold` (default `0.8`),
`kgSupersedeDeprioritizeWeight` (default `0.5`). Resolved env > persisted >
default in `resolveKnowledgeGraphConfig` (`src/config.ts:447-474`), mirrored in
`config.schema.json`. Default ON is conditional on the eval no-regression gate; if
ON regresses the suite (incl. B2 multi-hop), the documented default flips OFF.

**Rationale:** Mirrors the B2 `kgMultiHopEnabled` rollback discipline; gives a
code-free kill switch and a detection-only kill switch (set the weight neutral ≈1).

### Decision: Tolerate dangling `superseded_by_triple_id` with best-effort delete-path cleanup

**Choice:** Hard-deleting an observation deletes its triples by `source_id`
(`deleteKnowledgeArtifactsForObservation`, `src/store/index.ts:1148-1153`, inside
the hard-delete transaction `:1583-1588`). If that observation owned a *replacing*
triple, a prior triple may point at a now-gone id. Readers already treat the marker
as `... IS NOT NULL` (never a JOIN), so a dangling marker is harmless. Best-effort
cleanup: BEFORE deleting O's triples, NULL any
`superseded_by_triple_id`/`superseded_at` in other rows that reference O's triple
ids (treat the orphaned prior triple as current history again).

**Alternatives considered:** A real FK with `ON DELETE SET NULL` — rejected: adding
an FK to an existing table via `ALTER TABLE` requires a full table rebuild in
SQLite, violating the additive-only migration constraint.

**Rationale:** Keeps the migration purely additive, guarantees "MUST NOT error /
MUST NOT lose history" deterministically, and makes cleanup an explicit, testable
step.

### Decision: `extract_kg` LLM double-write must not mass-supersede deterministic facts

**Choice:** `processKgJob` (`src/indexing/jobs.ts:427-474`) calls the writer
TWICE when LLM fallback is `used`: first `writeDeterministicKgFacts`
(`:451`, deterministic set), then `persistKgExtraction(store, obs, extraction)`
(`:472`, LLM-ENRICHED set). With a naive diff, the second call would diff the
LLM-only set against the just-written deterministic set and SUPERSEDE every
deterministic fact the LLM did not reproduce — that would make the optional LLM
path load-bearing/destructive, violating constitution **P2** and CL-4 ("LLM may
only enrich, never gate or remove deterministic supersession"). The enriched second
write therefore MUST be a UNION/merge: the new set passed to the diff is
`deterministic ∪ llm`, so deterministic facts remain present (unchanged), LLM-only
facts are inserted as new, and only genuinely removed/replaced facts supersede.

**Implementation note (owned by sdd-tasks):** the cleanest forms are (a) build the
LLM-enriched extraction by re-running `extractKnowledgeTriples` with `llmTriples`
ON TOP of the deterministic input (it already merges — see `extractionInput` reuse
at `:461-464`) so the second `persistKgExtraction` receives the union, OR (b) pass
an "enrichment mode" flag into `persistKgExtraction` that diffs but never supersedes
prior facts absent from the enrichment-only set. Prefer (a) (it keeps one diff
contract); confirm the merged extraction is a superset during apply.

**Rationale:** Guarantees deterministic supersession is never removed or gated by
the LLM (P2/CL-4) and keeps the two writer entry points behaviorally consistent.

## Data Flow

### Save / update → diff (flag ON)

```text
saveObservation(input) | updateObservation(input) | upsert
  → (upsert/update) INSERT observation_versions(prior)   [index.ts:1500 / :1617]
  → UPDATE observations ... (same row, same source_id)   [:1504 / :1658]
  → refreshGraphFacts(observation)                        [:1515 / :1545 / :1664]
       └─ graphFactsSource==='legacy' ? refreshObservationFacts (out of scope) : ↓
       └─ writeDeterministicKgFacts(store, obs.id)         [jobs.ts:483]
            └─ persistKgExtraction(store, obs, extraction) [jobs.ts:502]
                 if kgSupersedeEnabled:                    (NEW — diff, replaces blind DELETE :537)
                   prior := SELECT id, triple_hash, relation, subj/obj names
                            FROM kg_triples (JOIN kg_entities)
                            WHERE source_type='observation' AND source_id=obs.id
                   new   := extraction.triples (triple_hash, relation, subj/obj)
                   for each new triple:
                       INSERT ... ON CONFLICT(triple_hash) DO UPDATE       (revive: clear superseded_*)
                   removed := prior.triple_hash \ new.triple_hash
                   for pr in removed:
                       repl := new triple with same subject+relation, diff object (else none)
                       UPDATE kg_triples SET superseded_at=now,
                              superseded_by_triple_id = repl.id or NULL   WHERE id = pr.id
                   # unchanged (prior ∩ new): ON CONFLICT path already refreshed in place
                 else (flag OFF):
                   DELETE FROM kg_triples WHERE source_id=obs.id           [pre-B3 :537]
                   INSERT fresh triples                                     [pre-B3 :539-555]
```

### Recall / multi-hop (flag ON)

```text
hybridRetrieve(query)
  → queryKnowledgeLane(...)        direct KG candidates   [index.ts:2074]
       SELECT adds t.superseded_by_triple_id, t.superseded_at;
       superseded row → score *= kgSupersedeDeprioritizeWeight,
       kg.superseded=true marker     [emission :2122-2130]
  → fuseCandidates(...)             current outranks superseded [ranking.ts:46]
  → if kgMultiHopEnabled: queryKnowledgeMultiHopLane       [:2166]
       buildKnowledgeMultiHopTraversalSql                  [:2237]
         superseded bridge edges deprioritized in candidate_edges scoring;
         B2 cycle-guard/depth/limit/allow-list/bidirectional/elapsed-guard intact
```

### Graph view (flag ON) and flag-off branch

```text
mem_project action=graph → formatProjectGraph             [project-views.ts:31]
  → store.getObservationFacts({project, topic_key})        [index.ts:3260]
       → getObservationFactsFromKg                          [:3293]
            default: EXCLUDE content triples whose superseded_* is non-NULL
            include_superseded=true: include + flag (history reachable)

kgSupersedeEnabled === false → NO diff (blind delete+reinsert), NO column read in
scoring/shape, legacy graph view → byte-identical to pre-B3 everywhere.
```

### Sequence diagram (Mermaid)

```mermaid
sequenceDiagram
    participant Caller
    participant Store as Store.save/update
    participant Writer as persistKgExtraction
    participant DB as kg_triples
    participant Recall as hybridRetrieve

    Caller->>Store: save/update obs O (topic_key; same source_id)
    Store->>DB: INSERT observation_versions(prior content)
    Store->>Writer: refreshGraphFacts(O) → writeDeterministicKgFacts(O.id)
    alt kgSupersedeEnabled == true
        Writer->>DB: SELECT prior triples for source_id=O.id
        Note over Writer,DB: first-ever extract → prior set empty → only inserts (no supersession)
        Writer->>DB: INSERT new triples (ON CONFLICT(triple_hash) DO UPDATE → revive)
        Writer->>DB: UPDATE removed/replaced prior rows SET superseded_at, superseded_by_triple_id
        Note over Writer,DB: identical re-extract → prior==new → no supersession, no dup
    else flag OFF
        Writer->>DB: DELETE WHERE source_id=O.id; INSERT fresh set (pre-B3, byte-identical)
    end
    Caller->>Recall: mem_recall(query)
    alt flag ON
        Recall->>DB: read superseded_* in queryKnowledgeLane + multi-hop
        Recall-->>Caller: current fact ranks above superseded (flagged, not dropped)
    else flag OFF
        Recall-->>Caller: baseline-identical candidates/scores/order
    end

    Note over Caller,DB: RE-ASSERT — re-save O so a previously-removed fact returns
    Caller->>Store: save/update O (re-asserts prior fact X)
    Store->>Writer: writeDeterministicKgFacts(O.id)
    Writer->>DB: INSERT X → ON CONFLICT(triple_hash) DO UPDATE clears superseded_* (revive)

    Note over Caller,DB: DELETE-PATH — hard-delete the superseding obj O
    Caller->>Store: deleteObservation(O, hard)
    Store->>DB: NULL superseded_by_triple_id/at that reference O.triples (cleanup)
    Store->>DB: DELETE O.triples by source_id
    Note over Store,DB: orphaned prior triple → current history; no error, no data loss
```

## Diff Algorithm (deterministic, model-free) — precise pseudocode

```text
persistKgExtraction(store, obs, extraction):           # inside the shared writer
  upsert kg_taxonomy_metadata                           # unchanged
  prepare upsertEntity, insertTriple                    # insertTriple: extend ON CONFLICT to clear superseded_*

  if NOT kgSupersedeEnabled:                            # FLAG-OFF == pre-B3, byte-identical
      DELETE FROM kg_triples WHERE source_type='observation' AND source_id = obs.id
      for triple in extraction.triples: insertTriple(...)   # no superseded_* ever touched
      return

  # ---- FLAG-ON: diff-and-mark-superseded ----
  prior := SELECT t.id, t.triple_hash, t.relation,
                  se.canonical_name AS subject, oe.canonical_name AS object
           FROM kg_triples t
           JOIN kg_entities se ON se.id = t.subject_entity_id
           JOIN kg_entities oe ON oe.id = t.object_entity_id
           WHERE t.source_type='observation' AND t.source_id = obs.id
  priorByHash := map prior.triple_hash -> prior row     # full per-obs hash, observation:${id}:${tripleHash}

  newRows := []                                          # resolved + inserted current rows
  newHashes := set()
  for triple in extraction.triples:
      fullHash := `observation:${obs.id}:${triple.tripleHash}`
      newHashes.add(fullHash)
      subjId := upsertEntity(triple.subject); objId := upsertEntity(triple.object)
      insertTriple(...)                                  # ON CONFLICT(triple_hash) DO UPDATE
                                                         #   -> revives a superseded row (clears superseded_*)
                                                         #   -> idempotent for unchanged rows
      newRows.push({ id: <id of inserted/updated row>, relation: triple.relation,
                     subject: triple.subject, object: triple.object })

  # SUPERSEDE removed/replaced prior facts (KEEP them)
  for ph, pr in priorByHash:
      if ph in newHashes: continue                       # unchanged (prior ∩ new) — already refreshed in place
      repl := first nr in newRows where nr.subject == pr.subject
                                       and nr.relation == pr.relation
                                       and nr.object   != pr.object     # same subj+rel, diff obj
      UPDATE kg_triples
         SET superseded_at = datetime('now'),
             superseded_by_triple_id = (repl ? repl.id : NULL)
       WHERE id = pr.id                                  # KEEP the row; never DELETE

  # OPTIONAL secondary (only if kgSupersedeContentPatterns):
  hints := scan obs.content for SUPERSESSION_CONTENT_PATTERNS   # each emits confidence < primary diff
  for h in hints where h.confidence >= kgSupersedeConfidenceThreshold:
      match h to a CONCRETE prior fact of THIS obs (subject/relation/object); if matched and not
      already superseded: UPDATE that prior row SET superseded_at=now (superseded_by_triple_id per match)
      # below-threshold OR no concrete match ⇒ no marking (no false supersession)
```

**Properties**
- **Deterministic / model-free** — no embedding, no LLM (constitution **P2**); the
  diff uses only stored rows and the extractor output.
- **First-ever extract** — `prior` empty → only inserts → no supersession.
- **Idempotent** — identical re-extract: `prior == new` (same `triple_hash` set),
  every insert hits ON CONFLICT and refreshes in place, the removed-set is empty →
  nothing newly superseded, no duplicate rows (reuses B1 dedup discipline).
- **Update-safe** — replace X→Y: X's hash ∈ removed → superseded; Y's hash ∈ new →
  inserted; `superseded_by_triple_id` = Y.id via subject+relation match.
- **Re-assert revive** — re-asserting X hits ON CONFLICT(triple_hash) DO UPDATE,
  clearing `superseded_*` → X is current again, single row.
- **No false cross-observation supersession** — the diff is strictly scoped to one
  `source_id`; another observation's triples are never touched.

## File Changes

| File | Function / anchor | Change |
| --- | --- | --- |
| `src/indexing/kg-extractor.ts` | `KG_RELATION_TYPES` (`:11-15`, 26 entries) | Append `'SUPERSEDES'`. Add `SUPERSESSION_CONTENT_PATTERNS` (phrases + confidences, gated) reusing the `RELATION_PATTERNS` confidence convention (`:55-103`). Do NOT add `SUPERSEDES` to `RELATION_PATTERNS` (no structural emission). |
| `src/indexing/jobs.ts` | `persistKgExtraction` (`:502-556`); `insertTriple` ON CONFLICT (`:526-534`); blind DELETE (`:537`) | Core B3 change. Extend the `ON CONFLICT(triple_hash) DO UPDATE` to also set `superseded_by_triple_id=NULL, superseded_at=NULL` (revive). Replace the blind DELETE with the diff: load prior rows, insert new (ON CONFLICT revives/refreshes), UPDATE removed/replaced prior rows to set `superseded_at`/`superseded_by_triple_id` (keep). Gate the whole diff on `kgSupersedeEnabled`; OFF branch keeps the exact pre-B3 delete+reinsert. Read the flag from `store.config.knowledgeGraph`. |
| `src/indexing/jobs.ts` | `processKgJob` (`:427-474`), enriched second write (`:472`) | Ensure the LLM-enriched `persistKgExtraction` receives `deterministic ∪ llm` (or an enrichment mode that never supersedes prior-absent facts) so LLM enrichment cannot mass-supersede deterministic facts (P2/CL-4). Prefer rebuilding the merged extraction via `extractKnowledgeTriples({...extractionInput, llmTriples})`. |
| `src/config.ts` | `KnowledgeGraphConfig` (`:39-47`), `DEFAULT_KNOWLEDGE_GRAPH_CONFIG` (`:157-165`), `resolveKnowledgeGraphConfig` (`:447-474`), `PersistedConfig.knowledgeGraph` (`:98`) | Add 4 knobs + defaults (`kgSupersedeEnabled=true`, `kgSupersedeContentPatterns=false`, `kgSupersedeConfidenceThreshold=0.8`, `kgSupersedeDeprioritizeWeight=0.5`); resolve env (`THOTH_KG_SUPERSEDE_*`) > persisted > default via `parseBoolean`/`parseNumber`. Leave `DEFAULT_KG_RELATION_ALLOW_LIST` unchanged (exclude `SUPERSEDES`). |
| `config.schema.json` | `knowledgeGraph.properties` (`:158-221`), `kgRelationAllowList.items.enum` (`:191-218`) | Document the 4 knobs (types/min/max: booleans; threshold `number` 0–1; weight `number` min 0); add `"SUPERSEDES"` to the relation enum. `additionalProperties:false` requires both. |
| `src/store/schema.ts` | `kg_triples` DDL (`:195-213`); `SEMANTIC_METADATA_INDEXES_SQL` (`:216-229`) | Add `superseded_by_triple_id INTEGER` + `superseded_at TEXT` to the fresh-DB DDL; optional `CREATE INDEX IF NOT EXISTS idx_kg_triples_superseded ON kg_triples(superseded_by_triple_id)`. |
| `src/store/migrations.ts` | `runMigrationsWithSemantic` (`:213-217`); pattern from `LEGACY_COLUMN_MIGRATIONS` (`:27-30`), `addColumnIfMissing` (`:103`) | Inside the transaction, `addColumnIfMissing(db,'kg_triples','superseded_by_triple_id','INTEGER')` and `(...,'superseded_at','TEXT')`. Idempotent, additive. Optionally add the supporting index here too. |
| `src/store/index.ts` | `queryKnowledgeLane` (`:2074-2164`), KG SELECT (`:2095-2096`), candidate emission (`:2122-2130`) | When flag ON: add `t.superseded_by_triple_id, t.superseded_at` to the SELECT; multiply superseded candidate `score` by `kgSupersedeDeprioritizeWeight`; set `kg.superseded=true`. Flag OFF: do not add columns or alter scoring (byte-identical). Legacy `observation_facts` fallback (`:2136-2163`) unchanged. |
| `src/store/index.ts` | `buildKnowledgeMultiHopTraversalSql` (`:2237-2333`) / `queryKnowledgeMultiHopLane` (`:2166-2235`) | When flag ON: in `candidate_edges` (`:2288-2314`), deprioritize edges whose `t.superseded_by_triple_id IS NOT NULL OR t.superseded_at IS NOT NULL` (down-weight the `confidence` contribution feeding `ranked` ordering `:2316`; keep B2 cycle-guard, `kgMaxDepth`, `kgNeighborhoodLimit`, allow-list, bidirectional expansion, elapsed-guard intact). Flag OFF: identical SQL/params/results to B2. |
| `src/store/index.ts` | `deleteObservation` hard-delete txn (`:1583-1588`), `deleteKnowledgeArtifactsForObservation` (`:1148-1153`) | Before deleting O's triples, NULL `superseded_by_triple_id`/`superseded_at` in rows that reference O's triple ids (dangling-ref cleanup). Behind the flag. |
| `src/store/index.ts` | `getObservationFactsFromKg` (`:3293-3383`), content-row query (`:3323-3333`), `getObservationFacts` (`:3260`), `ObservationFactsInput` (`src/store/types.ts:137-141`) | Add optional `include_superseded?: boolean` (default false). Default (flag ON): in the content-row query add `AND (t.superseded_at IS NULL AND t.superseded_by_triple_id IS NULL)` so superseded content facts are excluded from the current-state ledger. With `include_superseded` or flag OFF: legacy behavior (optionally annotate). Metadata facts (`HAS_TYPE/IN_PROJECT/HAS_TOPIC_KEY`) are synthesized, never superseded. |
| `src/store/index.ts` | `rebuildObservationFacts` KG branch (`:3413-3421`) | Re-check counters: with the blind delete removed, `existingTriples.count` (before) and `createdTriples.count` (after) no longer mean deleted/created. Redefine: count NEWLY-superseded prior rows as `facts_deleted` proxy (or report `facts_superseded`) and net-new inserts as `facts_created`, OR keep the two COUNT probes but document that "deleted" now means "carried forward" (see Edge Cases / Open Questions). Behind the flag; OFF retains pre-B3 counter meaning. |
| `src/retrieval/ranking.ts` | `LaneCandidate.kg` (`:27-32`), `fuseCandidates`/`compareCandidates` (`:46-113`) | Add optional `superseded?: boolean` to the `kg` evidence object so the marker survives fusion. No change to comparison math — deprioritization is applied upstream as a pre-scaled `score`, keeping fusion deterministic and the four-lane contract intact. |
| `src/tools/project-views.ts` | `formatProjectGraph` (`:31-70`), `ProjectGraphOptions` (`:4-9`) | Pass through `getObservationFacts` default current-state behavior; optionally accept a history toggle that maps to `include_superseded`. Keep `max_chars` min-200 / no `0` sentinel unchanged. Flag OFF: byte-identical ledger. |
| `src/evals/retrieval.ts` | suite (B1 facts-source + B2 multi-hop cases live here) | Add supersession-wins case built by SAVE-then-UPDATE of the same `topic_key` observation (X→Y) so the on-update diff supersedes X; assert Y outranks X and X is flagged/retained. Add an OFF/ON no-regression comparison re-validating B2. Seed via the KG path (`saveObservation` + `writeDeterministicKgFacts` / `kg_entities`+`kg_triples`), never `observation_facts`. |

## Interfaces / Contracts

- **`KnowledgeGraphConfig`** gains (design-final): `kgSupersedeEnabled: boolean`,
  `kgSupersedeContentPatterns: boolean`, `kgSupersedeConfidenceThreshold: number`,
  `kgSupersedeDeprioritizeWeight: number`. Env keys:
  `THOTH_KG_SUPERSEDE_ENABLED`, `THOTH_KG_SUPERSEDE_CONTENT_PATTERNS`,
  `THOTH_KG_SUPERSEDE_CONFIDENCE_THRESHOLD`,
  `THOTH_KG_SUPERSEDE_DEPRIORITIZE_WEIGHT`.
- **`LaneCandidate.kg`** gains optional `superseded?: boolean` (additive; existing
  consumers ignore it).
- **`ObservationFactsInput`** gains optional `include_superseded?: boolean`
  (default false → current-state). `ObservationFact` MAY gain an optional
  `superseded?: boolean` when annotating history (additive).
- **DB:** `kg_triples.superseded_by_triple_id INTEGER NULL`,
  `kg_triples.superseded_at TEXT NULL`. NULL ⇒ current. No FK (additive-only).
- **Unchanged contracts:** six MCP tools (P1); `exportData` `version:1` and its
  `sessions`/`observations`/`prompts`-only shape (never `kg_triples`); the
  four-lane set `sentence|chunk|lexical|kg`; `DEFAULT_LANE_WEIGHTS.kg=0.9`; B2
  `kgMultiHopWeight=0.7`; `action=graph` `max_chars` min-200 / no `0`.

## Edge Cases

1. **First-ever extraction (no prior).** `prior` set empty → only inserts → no
   supersession marking produced. (knowledge-graph "First-ever extraction
   supersedes nothing".)
2. **Identical re-extract (no-op).** `prior.triple_hash == new.triple_hash`; every
   insert hits ON CONFLICT and refreshes in place; removed-set empty → nothing
   newly superseded, no duplicate rows. Idempotent.
3. **Pure removal (no replacement).** Removed prior fact with no
   same-subject-and-relation new fact → `superseded_at` set,
   `superseded_by_triple_id` NULL. Recall predicate (`... OR superseded_at IS NOT
   NULL`) still deprioritizes it.
4. **Replacement.** Removed prior fact with a same-subject-and-relation,
   different-object new fact → `superseded_by_triple_id` = the new row's id.
5. **Re-assert revive.** A superseded fact later re-asserted (same per-obs
   `triple_hash`) → ON CONFLICT(triple_hash) DO UPDATE clears `superseded_*`; the
   row becomes current; no duplicate.
6. **`extract_kg` LLM double-write.** Second enriched `persistKgExtraction`
   receives `deterministic ∪ llm`, so deterministic facts are not mass-superseded
   (P2/CL-4). Without the merge this would be a destructive regression — explicit
   apply-time requirement.
7. **`rebuild-graph` full re-extract.** `rebuild-graph` iterates ALL in-scope
   observations and re-runs the writer per `source_id`. EXPECTED BEHAVIOR: each
   observation is diffed against ITS OWN currently-stored triples. On a steady-state
   DB (triples already match the deterministic extraction) this supersedes NOTHING
   (idempotent, edge case 2). It must NOT mass-supersede: because the diff is
   per-`source_id` and the stored set already equals the re-extracted set, the
   removed-set is empty. The only legitimate supersession during rebuild is when an
   observation's stored triples are STALE vs the current extractor (e.g. extractor
   version changed) — then the genuinely-changed prior facts supersede, which is
   correct. Counters must be redefined (see File Changes / Open Questions): the
   pre/post COUNT deltas no longer equal deleted/created once rows are kept.
8. **Flag-off byte-identical.** `kgSupersedeEnabled=false` → writer does the exact
   pre-B3 delete+reinsert; no supersession column is read in scoring/shape;
   `queryKnowledgeLane`, multi-hop SQL+results, fused output, and the graph ledger
   match pre-B3.
9. **Storage growth.** Superseded rows accumulate (deprioritized, kept) — intended
   **P5** behavior, bounded for B3; pruning/compaction of long supersession chains
   deferred to Change C.
10. **B2 multi-hop excludes/deprioritizes superseded bridge edges.** Superseded
    edges are down-weighted (default, not hard-skip) in `candidate_edges` scoring;
    `SUPERSEDES` is not in the default allow-list so it is never a bridge edge;
    all B2 bounds unchanged.
11. **Delete-path dangling reference.** Hard-deleting the superseding observation
    leaves a prior triple pointing at a gone id; readers never JOIN on it (predicate
    is `IS NOT NULL`), and best-effort cleanup NULLs it → treated as current
    history, no error, no data loss.
12. **Legacy `graphFactsSource='legacy'`.** Out of scope: `refreshGraphFacts` takes
    the `refreshObservationFacts` branch (`:1120-1122`); no supersession applies.

## Testing Strategy

vitest + in-memory SQLite (`pnpm test`); eval gate via `pnpm test` on
`src/evals/retrieval.ts`.

1. **On-update replace X→Y** (`tests/store/`): save an observation under a
   `topic_key` whose facts include `X`; update/re-save so re-extraction replaces `X`
   with `Y` (same subject+relation, different object). Assert immediately after save
   returns: `X`'s row carries `superseded_at` and `superseded_by_triple_id` = `Y`'s
   id; `Y` is current (both NULL); no background job required.
2. **Unchanged-not-superseded**: a fact `Z` present in both prior and new sets is
   not marked superseded and not duplicated.
3. **Pure removal**: a removed fact with no same-subject-and-relation replacement →
   `superseded_at` set, `superseded_by_triple_id` NULL.
4. **First-extract no-op**: single observation, new `topic_key` → all triples
   current (both columns NULL).
5. **Idempotent re-extract**: re-extract byte-identical content → triple set
   unchanged, nothing newly superseded, no duplicate rows/markings.
6. **Re-assert revive**: supersede `X`, then re-assert `X` (same content) → the
   existing superseded row is revived (both columns NULL), single row, no duplicate.
7. **No model/remote**: with embeddings + `kgLlm` unavailable, the diff still marks
   supersession (deterministic).
8. **No false cross-observation**: two distinct observations; re-extracting one does
   NOT mark the other's triples superseded.
9. **Content-pattern gated**: flag OFF → no content edges, diff still works; flag ON
   + above-threshold concrete match → marking; below-threshold or no concrete match
   → none.
10. **Recall deprioritization** (`tests/...retrieval`): current fact outranks its
    superseded version after `queryKnowledgeLane` + `fuseCandidates`; superseded
    candidate still emitted with `kg.superseded=true`.
11. **Multi-hop deprioritization + B2 bounds**: superseded bridge edge does not
    preferentially advance the frontier; cycle-guard/depth/limit/allow-list/
    bidirectional/elapsed-guard unchanged; `SUPERSEDES` not in default allow-list.
12. **Flag-off byte-identical**: `queryKnowledgeLane`, multi-hop SQL+results, and
    `hybridRetrieve` fused output match pre-B3 with `kgSupersedeEnabled=false`;
    writer does delete+reinsert (assert prior rows are gone, not superseded).
13. **Migration** (`tests/store/migration.test.ts` pattern): adds both columns when
    absent; idempotent across repeated `runMigrationsWithSemantic`; pre-B3 rows read
    as current; seed a legacy `kg_triples` without the columns and upgrade cleanly.
14. **Delete-path**: hard-deleting the superseding observation does not error; the
    orphaned prior triple is treated as current history (cleanup NULLs the marker);
    history not lost.
15. **`extract_kg` LLM double-write**: simulate the `used` LLM path; assert
    deterministic facts the LLM did not reproduce are NOT mass-superseded (the
    enriched write diffs against `deterministic ∪ llm`).
16. **`rebuild-graph` behavior**: on a steady-state DB, `rebuild-graph` supersedes
    nothing (idempotent); counters reflect the redefined semantics; no spurious
    mass-supersession.
17. **mem_project graph** (`tests/...visualization`/views): flag ON default hides
    superseded content facts and shows current; `include_superseded` path returns
    history; flag OFF ledger byte-for-byte identical (each
    `subject -- relation --> object`); `max_chars` min-200 / no `0` preserved.
18. **Config** (`tests/config.test.ts`): env > persisted > default for all four
    knobs; defaults exactly `true/false/0.8/0.5`; `config.schema.json` validates a
    config carrying the knobs and the `SUPERSEDES` relation.
19. **Export/import** (`tests/store/export-import.test.ts`): export shape +
    `version` unchanged (no `kg_triples`, no supersession columns); import
    unaffected; supersession state re-derived on rebuild.
20. **Eval gate** (`src/evals/retrieval.ts`): supersession-wins case (save-then-
    update) passes; OFF-vs-ON no-regression over existing + B2 fixtures (ON no worse
    than OFF) is the documented condition for default-ON.

## Migration / Rollout

- **Versioning: MINOR** (CL-7). Additive nullable columns, new vocabulary entry,
  new optional flag-gated behavior; no data loss, no public-contract break
  (constitution **P1/P3**; the P3 "destructive migrations require MAJOR" clause
  targets data-losing/contract-breaking migrations, which B3 is not).
- **Rollback (no code revert):** set `kgSupersedeEnabled=false` (env/persisted) →
  the writer reverts to the exact pre-B3 delete+reinsert, no
  detection/deprioritization, legacy graph view, byte-identical output.
  Detection-only kill switch: set `kgSupersedeDeprioritizeWeight` neutral (≈1) to
  restore legacy ranking even with markers present. The additive columns are
  ignorable/droppable; the underlying facts + `observation_versions` are untouched
  and fully derivable on `rebuild-graph`.
- **Forward migration:** `addColumnIfMissing` runs on every startup; idempotent
  no-op once present; existing DBs upgrade transparently.

## Open Questions

None blocking (all CLs resolved as in-spec Assumptions; user confirmed Option B,
mechanism re-scoped to on-update diff). Carry to `sdd-tasks`:

- **`rebuild-graph` counters (`src/store/index.ts:3413-3421`).** With the blind
  delete removed, the pre/post `COUNT(*)` probes no longer equal deleted/created.
  Decide: (a) report a new `facts_superseded` count and keep `facts_created` as
  net-new inserts, or (b) keep the two-probe shape but document "deleted" now means
  "carried-forward/superseded." Recommendation: (a), and assert idempotent rebuild
  reports zero newly-superseded on a steady-state DB. Lowest-risk, most observable.
- **`extract_kg` enriched-write merge form.** Prefer rebuilding the merged
  extraction via `extractKnowledgeTriples({...extractionInput, llmTriples})` so the
  second `persistKgExtraction` receives `deterministic ∪ llm` and one diff contract
  holds; confirm the merged extraction is a superset of the deterministic set during
  apply. Fallback: an enrichment-mode flag that diffs but never supersedes
  prior-absent facts.
- **Multi-hop deprioritization mechanism.** Down-weight via a `CASE` on the
  supersession predicate inside `candidate_edges` scoring vs a post-query penalty.
  Spec mandates *deprioritize, not hard-skip*; pick the lowest-risk form that keeps
  flag-off SQL byte-identical. Re-validate B2 eval either way.
- **Graph-view history surface.** Explicit `include_superseded` param on the view
  vs relying on the underlying KG read. Spec requires only that history be reachable
  and not deleted; finalize the surface in tasks.
- **Representative "newer fact" when multiple new triples share subject+relation.**
  Pick the first by deterministic order (insertion order / lowest new id) as the
  replacement target. Deterministic and sufficient for the marker; confirm in apply.
