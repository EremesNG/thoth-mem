# Tasks: KG Supersedes / Temporal Edges (Change B3)

> **Scope**: B3 Option B only — deterministic supersession marking over
> `kg_triples` with additive nullable columns. NO bi-temporal, NO
> point-in-time, NO LLM path, NO `CONTRADICTS`/`REPLACES` relations
> (CL-1, CL-2). Mechanism: per-observation DIFF-and-mark-superseded inside
> the shared writer `persistKgExtraction` (`src/indexing/jobs.ts:502`).
> Builds on shipped+archived B1 (`graph-lite-consolidation`) and B2
> (`kg-multi-hop-recall`).
>
> **REMOVED from prior stale tasks.md**: all cross-observation
> `markSupersededByTopicKey` sweep tasks (tasks 2.3, 2.4 in the old plan).
> That mechanism was inert in normal usage (CL-3 resolved) and is fully
> replaced by the per-observation diff inside `persistKgExtraction`.

## Traceability Note

Every task carries a `Spec:` tag tracing to:
- `knowledge-graph/spec.md` (B3 delta) — KG delta requirements
- `store/spec.md` (B3 delta) — Store delta requirements
- `config/spec.md` (B3 delta) — Config delta requirements
- `evals/spec.md` (B3 delta) — Evals delta requirements
- `design.md` — Architecture Decisions, File Changes, Diff Algorithm, Testing Strategy

---

## Phase 1: Infrastructure

- [x] 1.1 Append `SUPERSEDES` to `KG_RELATION_TYPES`; add `SUPERSESSION_CONTENT_PATTERNS` constant — `src/indexing/kg-extractor.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `knowledge-graph/SUPERSEDES MUST Be Added to the KG Relation Vocabulary`
  **Design anchor:** `File Changes` row `src/indexing/kg-extractor.ts`; Architecture Decision "`SUPERSEDES` joins `KG_RELATION_TYPES` but is EXCLUDED from the multi-hop allow-list"
  - Append `'SUPERSEDES'` to `KG_RELATION_TYPES` (currently 26 entries at `:11-15`); total becomes 27.
  - Add constant `SUPERSESSION_CONTENT_PATTERNS`: array of `{ pattern: RegExp, confidence: number }` objects (phrases: "no longer", "replaced by", "deprecated", "changed to", "superseded by"), modelled on `RELATION_PATTERNS` (`:55-103`). Confidence values MUST be below the primary diff signal.
  - Do NOT add `SUPERSEDES` to `RELATION_PATTERNS` (no structural triple emission) and do NOT add it to `DEFAULT_KG_RELATION_ALLOW_LIST` (`src/config.ts:136-155`).
  **Independent Test:** `KG_RELATION_TYPES.includes('SUPERSEDES')` evaluates to true; length is 27; `SUPERSESSION_CONTENT_PATTERNS` is exported; `SUPERSEDES` is NOT in the default allow-list.
  **Verification:**
  - Run: `pnpm test -- -t "kg-extractor"`
  - Expected: Existing KG extractor tests pass; `KG_RELATION_TYPES` length is 27; `SUPERSEDES` is present; constant is exported.

- [x] 1.2 Add four B3 config knobs to `KnowledgeGraphConfig`, defaults, and env resolver — `src/config.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `config/Supersession Knobs MUST Resolve Deterministically With Env Overrides`; `config/Supersession Master Flag MUST Gate All B3 Behavior`
  **Design anchor:** Architecture Decision "Single master flag gates everything"; `Interfaces / Contracts` — `KnowledgeGraphConfig`
  - Extend `KnowledgeGraphConfig` interface (`:39-47`) with: `kgSupersedeEnabled: boolean`, `kgSupersedeContentPatterns: boolean`, `kgSupersedeConfidenceThreshold: number`, `kgSupersedeDeprioritizeWeight: number`.
  - Extend `DEFAULT_KNOWLEDGE_GRAPH_CONFIG` (`:157-165`) with defaults: `true`, `false`, `0.8`, `0.5`.
  - In `resolveKnowledgeGraphConfig` (`:447-474`), add env resolution for `THOTH_KG_SUPERSEDE_ENABLED`, `THOTH_KG_SUPERSEDE_CONTENT_PATTERNS`, `THOTH_KG_SUPERSEDE_CONFIDENCE_THRESHOLD`, `THOTH_KG_SUPERSEDE_DEPRIORITIZE_WEIGHT` via `parseBoolean`/`parseNumber`. Resolution order: env > persisted > default.
  - Leave `DEFAULT_KG_RELATION_ALLOW_LIST` (`:136-155`) unchanged — `SUPERSEDES` is NOT added.
  **Independent Test:** `resolveKnowledgeGraphConfig({})` returns `kgSupersedeEnabled: true`, `kgSupersedeContentPatterns: false`, `kgSupersedeConfidenceThreshold: 0.8`, `kgSupersedeDeprioritizeWeight: 0.5`; env vars override persisted.
  **Verification:**
  - Run: `pnpm test -- -t "config"`
  - Expected: Config tests pass; four knobs present with correct defaults; env override precedence validated.

- [x] 1.3 Document four B3 knobs in `config.schema.json`; add `"SUPERSEDES"` to relation enum — `config.schema.json`
  **[USN-2]** | Priority: P1
  **Spec:** `config/config.schema.json MUST Document the Supersession Knobs`
  **Design anchor:** `File Changes` row `config.schema.json`; Architecture Decision "`SUPERSEDES` joins `KG_RELATION_TYPES`"
  - Under `knowledgeGraph.properties` (`:158-221`), add property entries for `kgSupersedeEnabled` (boolean), `kgSupersedeContentPatterns` (boolean), `kgSupersedeConfidenceThreshold` (number, minimum 0, maximum 1), `kgSupersedeDeprioritizeWeight` (number, minimum 0). Respect `additionalProperties: false`.
  - Add `"SUPERSEDES"` to the `kgRelationAllowList.items.enum` (`:191-218`).
  **Independent Test:** A JSON config carrying all four knobs plus `"SUPERSEDES"` in the relation list passes schema validation.
  **Verification:**
  - Run: `pnpm test -- -t "config"`
  - Expected: Schema validation test passes for a config object carrying all four B3 knobs and `"SUPERSEDES"` in the relation list.

- [x] 1.4 Add `superseded_by_triple_id` / `superseded_at` to `kg_triples` DDL (fresh-DB schema) — `src/store/schema.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `store/kg_triples MUST Gain Nullable Supersession Columns via Additive Migration`
  **Design anchor:** Architecture Decision "Record supersession as two additive nullable columns"; `File Changes` row `src/store/schema.ts`
  - In the `kg_triples` DDL (`:195-213`), add: `superseded_by_triple_id INTEGER` (nullable, no FK) and `superseded_at TEXT` (nullable).
  - Optionally add `CREATE INDEX IF NOT EXISTS idx_kg_triples_superseded ON kg_triples(superseded_by_triple_id)` in `SEMANTIC_METADATA_INDEXES_SQL` (`:216-229`).
  **Independent Test:** Fresh-DB `kg_triples` table includes both new columns; schema test passes.
  **Verification:**
  - Run: `pnpm test -- -t "schema"`
  - Expected: `tests/store/schema.test.ts` passes; fresh `kg_triples` contains both nullable supersession columns.

- [x] 1.5 Add additive migration for the two supersession columns via `addColumnIfMissing` — `src/store/migrations.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `store/kg_triples MUST Gain Nullable Supersession Columns via Additive Migration`
  **Design anchor:** Architecture Decision "Record supersession as two additive nullable columns"; `File Changes` row `src/store/migrations.ts`; `addColumnIfMissing` (`:103`), `LEGACY_COLUMN_MIGRATIONS` (`:27-30`)
  - Inside `runMigrationsWithSemantic` (`:213-217`) transaction, call: `addColumnIfMissing(db, 'kg_triples', 'superseded_by_triple_id', 'INTEGER')` and `addColumnIfMissing(db, 'kg_triples', 'superseded_at', 'TEXT')`.
  - Optionally add the supporting index in the same runner.
  **Independent Test:** Run `runMigrationsWithSemantic` on a legacy DB missing the columns; both appear; repeat call is a no-op.
  **Verification:**
  - Run: `pnpm test -- -t "migration"`
  - Expected: Both columns added when absent; migration is idempotent; pre-B3 rows remain readable with both columns NULL.

---

## Phase 2: Implementation

- [x] 2.1 Add optional `superseded?: boolean` to `LaneCandidate.kg` evidence type — `src/retrieval/ranking.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `store/queryKnowledgeLane MUST Deprioritize and Flag Superseded Triples, Not Drop Them`
  **Design anchor:** `Interfaces / Contracts` — `LaneCandidate.kg`; `File Changes` row `src/retrieval/ranking.ts`
  - Add optional `superseded?: boolean` field to the `kg` evidence sub-type in `LaneCandidate` (`:27-32`). Additive; no change to comparison math in `fuseCandidates`/`compareCandidates` (`:46-113`). Deprioritization is applied upstream as a pre-scaled `score`.
  **Independent Test:** TypeScript compiles with the additive field; existing ranking tests pass; adding `superseded: true` to a `kg` evidence object does not error.
  **Verification:**
  - Run: `pnpm test -- -t "ranking"`
  - Expected: Existing ranking tests pass; TypeScript compilation succeeds with the additive field.

- [x] 2.2 Add optional `include_superseded?: boolean` to `ObservationFactsInput` and `ObservationFact` — `src/store/types.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `store/queryKnowledgeLane MUST Deprioritize and Flag Superseded Triples, Not Drop Them` (current-state default for graph view)
  **Design anchor:** `Interfaces / Contracts` — `ObservationFactsInput`; `File Changes` row `src/store/index.ts` (`getObservationFactsFromKg`)
  - Add optional `include_superseded?: boolean` to `ObservationFactsInput` (`:137-141`). Default: false.
  - Optionally add `superseded?: boolean` to `ObservationFact` (additive, for history-annotation path).
  **Independent Test:** TypeScript compiles without breaks; existing callers are unaffected (field is optional).
  **Verification:**
  - Run: `pnpm test`
  - Expected: TypeScript compilation succeeds; no existing test breaks due to the additive field.

- [x] 2.3 **CORE DIFF TASK** — Replace blind DELETE with diff-and-mark-superseded in `persistKgExtraction`; extend `ON CONFLICT` to revive superseded rows — `src/indexing/jobs.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `store/The Deterministic Writer MUST Diff and Mark Superseded Instead of Delete-and-Reinsert`; `knowledge-graph/Supersession MUST Be Detected by Diffing an Observation's Re-Extracted Facts`; `knowledge-graph/Superseded Facts MUST Be Preserved, Not Deleted`
  **Design anchor:** Architecture Decision "Diff-and-mark-superseded inside the shared writer"; Diff Algorithm pseudocode; `File Changes` row `src/indexing/jobs.ts`
  - **Flag-off branch (byte-identical pre-B3):** When `kgSupersedeEnabled` is false, keep the existing `DELETE FROM kg_triples WHERE source_type='observation' AND source_id = ?` at `:537` plus reinsert. No supersession column is touched.
  - **Flag-on diff (replaces `:537`):**
    1. Before any inserts, `SELECT t.id, t.triple_hash, t.relation, se.canonical_name AS subject, oe.canonical_name AS object FROM kg_triples t JOIN kg_entities se ON se.id = t.subject_entity_id JOIN kg_entities oe ON oe.id = t.object_entity_id WHERE t.source_type='observation' AND t.source_id = obs.id`. Build `priorByHash` map.
    2. For each new triple: upsert entity, then `INSERT ... ON CONFLICT(triple_hash) DO UPDATE SET ... superseded_by_triple_id=NULL, superseded_at=NULL, updated_at=datetime('now')` (revive-on-reassert; also refreshes unchanged rows). Collect `newRows` with resolved ids/names.
    3. For each entry in `priorByHash` whose `triple_hash` is NOT in `newHashes` (removed/replaced): find the first `newRow` with same `subject` + `relation` but different `object` (replacement); `UPDATE kg_triples SET superseded_at=datetime('now'), superseded_by_triple_id=(replacement.id or NULL) WHERE id=pr.id`. KEEP the row (no DELETE).
    4. Unchanged prior rows (hash present in both): already refreshed by step 2's ON CONFLICT path; no additional action.
  - **Replacement target determinism:** when multiple new triples share the same subject+relation, use the first by insertion order (lowest new id). This is the tie-breaking rule (design open point resolved).
  - Read the flag from `store.config.knowledgeGraph.kgSupersedeEnabled`.
  **Independent Test:** After flag-on re-extraction with X→Y: X row has `superseded_at` non-NULL and `superseded_by_triple_id = Y.id`; Y row has both NULL; X row is still present (not deleted). Flag-off: prior rows are deleted and reinserted (as pre-B3).
  **Verification:**
  - Run: `pnpm test -- -t "supersed|persist|kg.triple"`
  - Expected: Replace X→Y test passes; X is kept and marked; Y is current; flag-off is byte-identical; idempotent re-extract supersedes nothing.

- [x] 2.4 **CRITICAL — LLM union fix in `processKgJob`** — ensure enriched second `persistKgExtraction` receives `deterministic ∪ llm` — `src/indexing/jobs.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `knowledge-graph/Supersession MUST Be Detected by Diffing an Observation's Re-Extracted Facts#Detection requires no model or remote service` (LLM MUST NOT gate deterministic supersession); design Architecture Decision "`extract_kg` LLM double-write must not mass-supersede deterministic facts"
  **Design anchor:** `File Changes` row `src/indexing/jobs.ts` — `processKgJob` (`:427-474`), enriched second write (`:472`); Design open question: "prefer rebuilding the merged extraction via `extractKnowledgeTriples({...extractionInput, llmTriples})`"
  - Current code: `processKgJob` calls `writeDeterministicKgFacts` at `:451` (deterministic set), then `persistKgExtraction(store, obs, extraction)` at `:472` (LLM-enriched set). With a naive diff, the second call diffs the LLM-only set against the just-written deterministic set and SUPERSEDES every deterministic fact the LLM did not reproduce — violates P2/CL-4.
  - Fix: before the second `persistKgExtraction` call, rebuild the merged extraction via `extractKnowledgeTriples({...extractionInput, llmTriples})` (or equivalent union) so the second write receives `deterministic ∪ llm`. Deterministic facts remain present (unchanged in the diff); LLM-only facts are inserted as new; only genuinely removed/replaced facts supersede.
  - Confirm the merged extraction is a strict superset of the deterministic set (all deterministic triples appear in the merged set before passing to the diff).
  **Independent Test:** With LLM path `used`, deterministic facts the LLM did not reproduce are still present (not superseded) after the second `persistKgExtraction` call; LLM-only additions are inserted as current.
  **Verification:**
  - Run: `pnpm test -- -t "llm|extract.kg|processKgJob|mass.supersed"`
  - Expected: LLM double-write test (task 3.9) passes; deterministic facts are NOT mass-superseded by LLM enrichment.

- [x] 2.5 Apply gated content-pattern supersession hints in the same-source diff path — `src/indexing/jobs.ts`
  **[USN-6]** | Priority: P2
  **Spec:** `knowledge-graph/Content-Pattern Supersession Hints MUST Be Gated and Lower-Confidence`; `knowledge-graph/Supersession MUST NOT Falsely Cross Unrelated Facts`
  **Design anchor:** Diff Algorithm optional secondary signal; `File Changes` row `src/indexing/kg-extractor.ts`; Testing Strategy item 9
  - When `kgSupersedeContentPatterns` is false, do not apply content-pattern supersession hints; the primary diff still operates.
  - When `kgSupersedeContentPatterns` is true, scan only the current observation content with `SUPERSESSION_CONTENT_PATTERNS`, require `confidence >= kgSupersedeConfidenceThreshold`, and require a concrete same-`source_id` prior fact match before marking anything.
  - Mark only matched prior facts from the same observation; do not supersede unrelated observations or broad unmatched facts.
  - Keep the secondary signal lower-confidence than the primary diff; the primary per-observation diff remains deterministic and model-free.
  **Independent Test:** Above-threshold concrete content hint marks one matched prior fact; disabled flag, below-threshold hint, or no concrete match produces no content-pattern marking.
  **Verification:**
  - Run: `pnpm test -- -t "content.pattern|supersed"`
  - Expected: Content-pattern hints are gated by flag + threshold + concrete same-source match; no unrelated fact is superseded.

- [x] 2.6 Deprioritize and flag superseded triples in `queryKnowledgeLane` — `src/store/index.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `store/queryKnowledgeLane MUST Deprioritize and Flag Superseded Triples, Not Drop Them`; `retrieval/Superseded KG Evidence MUST Be Deprioritized in Fusion While Preserving the Four-Lane Contract`; `retrieval/Supersession Deprioritization MUST Be Byte-Identical to Baseline When Disabled`
  **Design anchor:** `File Changes` row `src/store/index.ts` — `queryKnowledgeLane` (`:2074-2164`), KG SELECT (`:2095-2096`), candidate emission (`:2112-2130`); Architecture Decision "Deprioritize-and-flag in retrieval (never delete)"
  - When `kgSupersedeEnabled` is true: add `t.superseded_by_triple_id, t.superseded_at` to the SELECT (`:2095-2096`); for rows where `superseded_by_triple_id IS NOT NULL OR superseded_at IS NOT NULL`, multiply the candidate `score` by `kgSupersedeDeprioritizeWeight`; set `kg.superseded = true` on the emitted candidate (`:2112-2130`).
  - When `kgSupersedeEnabled` is false: do NOT add columns or alter scoring — SQL and results are byte-identical to pre-B3.
  - Legacy `observation_facts` fallback (`:2136-2163`): unchanged.
  **Independent Test:** After X→Y supersession: recall query returns Y with higher score than X; X candidate has `kg.superseded === true`; X is not absent from the result set; flag-off produces identical scores/shape to pre-B3.
  **Verification:**
  - Run: `pnpm test -- -t "query|knowledge.lane|recall|supersed"`
  - Expected: Superseded candidate emitted with `kg.superseded=true` and down-weighted score; flag-off identical to pre-B3; no candidate dropped.

- [x] 2.7 Deprioritize superseded bridge edges in `buildKnowledgeMultiHopTraversalSql` / `queryKnowledgeMultiHopLane` — `src/store/index.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `retrieval/Multi-Hop Traversal MUST Prefer Current Truth Over Superseded Edges`; `retrieval/Supersession Deprioritization MUST Be Byte-Identical to Baseline When Disabled`; ``knowledge-graph/`SUPERSEDES` MUST Be Added to the KG Relation Vocabulary``
  **Design anchor:** `File Changes` row `src/store/index.ts` — `buildKnowledgeMultiHopTraversalSql` (`:2237-2333`); Design Architecture Decision "multi-hop CTE deprioritize (index.ts:2288-2316, flag-off byte-identical)"; Open Question resolved: CASE-on-column inside `candidate_edges` CTE
  - When `kgSupersedeEnabled` is true: in `candidate_edges` (`:2288-2314`), wrap edge confidence contribution with `CASE WHEN t.superseded_by_triple_id IS NOT NULL OR t.superseded_at IS NOT NULL THEN confidence * :deprioritizeWeight ELSE confidence END`. Build SQL string conditionally so flag-off emits no CASE expression at all.
  - When `kgSupersedeEnabled` is false: emit `candidate_edges` SQL with no CASE — byte-identical to B2.
  - Preserve ALL B2 invariants: cycle-guard (`visited` entities set), `kgMaxDepth`, `kgNeighborhoodLimit`, allow-list filter, bidirectional expansion, elapsed-guard. `SUPERSEDES` MUST NOT appear as a bridge edge (not in default allow-list).
  **Independent Test:** With a superseded bridge edge in the graph, traversal does not preferentially advance through it; B2 test suite passes unchanged; `SUPERSEDES` does not appear in traversal results; flag-off SQL is byte-identical to B2.
  **Verification:**
  - Run: `pnpm test -- -t "multi.hop|multihop|supersed"`
  - Expected: Superseded bridge edges deprioritized; B2 bounds (cycle-guard, depth, cap) unchanged; `SUPERSEDES` not traversed; flag-off byte-identical.

- [x] 2.8 Dangling-ref cleanup in `deleteObservation` hard-delete path — `src/store/index.ts`
  **[USN-7]** | Priority: P2
  **Spec:** `store/The Deterministic Writer MUST Diff and Mark Superseded Instead of Delete-and-Reinsert` (delete-path interaction assumption); Design Architecture Decision "Tolerate dangling `superseded_by_triple_id` with best-effort delete-path cleanup"
  **Design anchor:** `File Changes` row `src/store/index.ts` — `deleteObservation` hard-delete txn (`:1583-1588`), `deleteKnowledgeArtifactsForObservation` (`:1148-1153`)
  - Before deleting O's triples by `source_id` inside the hard-delete transaction, execute (when `kgSupersedeEnabled` is true): `UPDATE kg_triples SET superseded_by_triple_id = NULL, superseded_at = NULL WHERE superseded_by_triple_id IN (SELECT id FROM kg_triples WHERE source_type='observation' AND source_id = :obsId)`.
  - This NULLs dangling refs from prior triples that pointed at O's (now-deleted) triples, making those prior triples current history again.
  - No FK added (additive-only migration constraint). Readers already use `IS NOT NULL` predicate, so a dangling ref is harmless even if cleanup is incomplete.
  **Independent Test:** Hard-delete the superseding observation; prior triple's `superseded_by_triple_id` is NULL; prior triple still present; no error thrown.
  **Verification:**
  - Run: `pnpm test -- -t "delete|hard.delete|supersed"`
  - Expected: Delete-path test passes; orphaned prior triple NULLed and treated as current; no error.

- [x] 2.9 Update `getObservationFactsFromKg` to honor `include_superseded` flag and current-state default — `src/store/index.ts`
  **[USN-5]** | Priority: P1
  **Spec:** ``tools/`mem_project action=graph` MUST Default to a Current-State View With History Reachable``; `store/queryKnowledgeLane MUST Deprioritize and Flag Superseded Triples, Not Drop Them`
  **Design anchor:** `File Changes` row `src/store/index.ts` — `getObservationFactsFromKg` (`:3293-3383`), content-row query (`:3323-3333`), `getObservationFacts` (`:3260`); Open Question resolved: `include_superseded` on `ObservationFactsInput`
  - When `kgSupersedeEnabled` is true and `input.include_superseded` is false (default): in the content-row query, add `AND (t.superseded_at IS NULL AND t.superseded_by_triple_id IS NULL)` to exclude superseded content facts from the current-state ledger. Metadata facts (`HAS_TYPE`, `IN_PROJECT`, `HAS_TOPIC_KEY`) are synthesized and never superseded.
  - When `include_superseded=true` or `kgSupersedeEnabled=false`: include all rows; optionally annotate `superseded: true` for history rows.
  - `getObservationFacts` (`:3260`) passes the flag through.
  **Independent Test:** Default call omits superseded facts; `include_superseded=true` returns history; flag-off returns all rows as before (no filtering).
  **Verification:**
  - Run: `pnpm test -- -t "graph|getObservation|visualization|observation.facts"`
  - Expected: Default returns current-state only; history reachable with `include_superseded=true`; flag-off byte-identical to pre-B3.

- [x] 2.10 Update `formatProjectGraph` / `ProjectGraphOptions` to pass current-state default and accept history toggle — `src/tools/project-views.ts`
  **[USN-5]** | Priority: P2
  **Spec:** ``tools/`mem_project action=graph` MUST Default to a Current-State View With History Reachable``
  **Design anchor:** `File Changes` row `src/tools/project-views.ts` — `formatProjectGraph` (`:31-70`), `ProjectGraphOptions` (`:4-9`)
  - Add optional `includeSuperseded?: boolean` to `ProjectGraphOptions` (default false).
  - `formatProjectGraph` passes `include_superseded: options.includeSuperseded ?? false` to `store.getObservationFacts`.
  - When `kgSupersedeEnabled` is false: flag-off branch in `getObservationFactsFromKg` returns all rows → byte-identical ledger output.
  - `max_chars` min-200 / no `0` sentinel unchanged.
  **Independent Test:** Default `formatProjectGraph` omits superseded facts from the ledger; `includeSuperseded: true` includes them; `max_chars` behavior unchanged.
  **Verification:**
  - Run: `pnpm test -- -t "project.view|graph|visualization"`
  - Expected: Default `mem_project action=graph` omits superseded; history reachable with `includeSuperseded: true`; `max_chars` behavior unchanged; flag-off byte-identical.

- [x] 2.11 Update `rebuildObservationFacts` KG branch counters — `src/store/index.ts`
  **[USN-6]** | Priority: P2
  **Spec:** `store/The Deterministic Writer MUST Diff and Mark Superseded Instead of Delete-and-Reinsert#Re-extracting identical content converges with no new supersession`; Design Open Question resolved (recommendation (a))
  **Design anchor:** `File Changes` row `src/store/index.ts` — `rebuildObservationFacts` KG branch (`:3413-3421`); Design requirement: rebuild steady-state supersedes ZERO facts
  - With the blind delete removed, the pre/post `COUNT(*)` probes at `:3413-3421` no longer mean deleted/created once rows are kept.
  - Redefine: count NEWLY-superseded prior rows (those with `superseded_at` set in this run) as `facts_superseded`; count net-new inserts as `facts_created`. Alternatively keep the two-probe shape but document semantics.
  - When `kgSupersedeEnabled` is false: retain pre-B3 counter semantics (blind delete+reinsert; pre/post COUNT = deleted/created).
  - Assert: on a steady-state DB (stored triples already match current extractor output), rebuild supersedes ZERO facts (`facts_superseded = 0`). This is the #1 regression guard (idempotent rebuild must not mass-supersede).
  **Independent Test:** Running `rebuild-graph` twice on unchanged data: second run reports `facts_superseded = 0`; no prior triples gain `superseded_at`.
  **Verification:**
  - Run: `pnpm test -- -t "rebuild|rebuild.graph|supersed"`
  - Expected: Steady-state rebuild supersedes zero facts; counters reflect the new semantics; flag-off retains pre-B3 counter meaning.

- [x] 2.12 Add supersession-wins eval case and OFF/ON B2 no-regression gate to `src/evals/retrieval.ts`
  **[USN-8]** | Priority: P1
  **Spec:** `evals/Evals MUST Validate That an Updated Fact Outranks the Fact It Replaced`; `evals/Eval Suite MUST Gate on No Retrieval Regression With Supersession Enabled`
  **Design anchor:** `File Changes` row `src/evals/retrieval.ts`; Evals delta "RE-SCOPED FIXTURE — save-then-update, NOT pre-seeded cross-obs facts"
  - **Supersession-wins case (save-then-update fixture):** SAVE an observation under a `topic_key` whose facts include X; then UPDATE/re-save the same `topic_key` observation so re-extraction replaces X with Y (same subject+relation, different object). The on-update diff marks X superseded. Assert: Y's evidence ranks above X; X is still present (`kg.superseded=true`); X is not deleted. With `kgSupersedeEnabled=false`: no supersession, no error.
  - **OFF/ON no-regression gate (including B2 multi-hop):** Run the existing eval suite once with `kgSupersedeEnabled=false` (baseline) and once with `true`; assert ON is no worse than OFF on all pass/rank criteria. This is the documented acceptance condition for default-ON.
  - Seed ALL graph-fact fixtures through the KG path (`saveObservation` + `writeDeterministicKgFacts` / `kg_entities` + `kg_triples`), never `observation_facts` (B1 fixture convention).
  - Do NOT use a cross-observation pre-seeded fixture (the removed cross-obs scan cannot fire). The fixture MUST use save-then-update on the SAME observation row.
  **Independent Test:** Eval file is syntactically valid; supersession-wins case exercises the diff path; B2 multi-hop cases are included in the no-regression comparison.
  **Verification:**
  - Run: `pnpm run eval:retrieval`
  - Expected: Supersession-wins case passes; OFF/ON no-regression gate passes with 0% regression; B2 multi-hop cases still surface their expected answers under supersession ON.

---

## Phase 3: Testing

- [x] 3.1 Write diff-core tests: replace X→Y supersedes X (kept); unchanged-not-superseded; pure removal — `tests/store/kg-supersedes.test.ts` (new or extend `tests/store/kg-facts-cutover.test.ts`)
  **[USN-9]** | Priority: P1
  **Spec:** `knowledge-graph/Supersession MUST Be Detected by Diffing an Observation's Re-Extracted Facts#Updating a topic_key observation replaces a fact`; `#Unchanged facts are not superseded`; `#A removed fact with no replacement is superseded with a null pointer`
  **Design anchor:** Testing Strategy items 1, 2, 3; Diff Algorithm properties "Update-safe", "Idempotent"
  - **Replace X→Y:** Save an observation; re-save/update so re-extraction replaces X with Y (same subject+relation, different object). Assert immediately after save: X has `superseded_at` non-NULL and `superseded_by_triple_id = Y.id`; Y has both NULL; X row still present (not deleted); no background job required.
  - **Unchanged-not-superseded:** Triple Z present in both prior and new sets is NOT marked superseded and NOT duplicated.
  - **Pure removal (no replacement):** Removed fact with no same-subject-and-relation replacement → `superseded_at` set, `superseded_by_triple_id` NULL.
  **Independent Test:** All three cases verifiable against the in-memory SQLite store directly after the write returns.
  **Verification:**
  - Run: `pnpm test -- -t "supersed"`
  - Expected: All three diff-core cases pass; X is kept and marked; Z unchanged; pure removal with NULL pointer.

- [x] 3.2 Write first-extract no-op and idempotent re-extract no-op tests
  **[USN-9]** | Priority: P1
  **Spec:** `knowledge-graph/Supersession MUST Be Detected by Diffing an Observation's Re-Extracted Facts#First-ever extraction supersedes nothing`; `knowledge-graph/Superseded Facts MUST Be Preserved, Not Deleted#Re-extracting identical content supersedes nothing`
  **Design anchor:** Testing Strategy items 4, 5; Diff Algorithm properties "First-ever extract", "Idempotent"
  - **First-extract no-op:** New `topic_key` observation on first save → all triples current (both columns NULL); no supersession marking produced.
  - **Idempotent re-extract:** Re-extract byte-identical content → triple set unchanged; nothing newly superseded; no duplicate rows or markings. Running the same extraction twice yields the same DB state.
  **Independent Test:** Both assertions verifiable by direct DB query after the write.
  **Verification:**
  - Run: `pnpm test -- -t "supersed|idempotent"`
  - Expected: First-extract produces zero superseded rows; idempotent re-extract produces no new supersession; no duplicates.

- [x] 3.3 Write revive-on-reassert test
  **[USN-9]** | Priority: P1
  **Spec:** `knowledge-graph/Superseded Facts MUST Be Preserved, Not Deleted` (revive via ON CONFLICT)
  **Design anchor:** Architecture Decision "Revive a superseded row on re-assert via `ON CONFLICT(triple_hash) DO UPDATE`"; Testing Strategy item 6 (re-assert revive)
  - Supersede X (save then update removing X); then re-assert X (update again restoring X's content). Assert: the existing superseded row is revived (both `superseded_by_triple_id` and `superseded_at` become NULL); single row for X in `kg_triples` (no duplicate); X is current.
  **Independent Test:** After revive, `SELECT COUNT(*) FROM kg_triples WHERE triple_hash = X.hash` = 1 and both columns are NULL.
  **Verification:**
  - Run: `pnpm test -- -t "supersed|revive|reassert"`
  - Expected: Revive-on-reassert test passes; single row; supersession cleared.

- [x] 3.4 Write no-false-cross-observation and no-model-required tests
  **[USN-9]** | Priority: P1
  **Spec:** `knowledge-graph/Supersession MUST NOT Falsely Cross Unrelated Facts#No supersession across different observations`; `knowledge-graph/Supersession MUST Be Detected by Diffing an Observation's Re-Extracted Facts#Detection requires no model or remote service`
  **Design anchor:** Testing Strategy items 7, 8; Diff Algorithm property "No false cross-observation supersession"; Diff Algorithm property "Deterministic / model-free"
  - **No false cross-obs:** Two distinct observations each with their own stored facts; re-extracting one does NOT mark the other's triples superseded.
  - **No model required:** With embeddings and `kgLlm` unavailable, the diff still marks supersession (deterministic, no remote call).
  **Independent Test:** After re-extracting observation A, observation B's `kg_triples` rows have unchanged `superseded_at` and `superseded_by_triple_id`.
  **Verification:**
  - Run: `pnpm test -- -t "supersed|cross.obs|model.free"`
  - Expected: No cross-observation supersession; diff operates without any model/remote.

- [x] 3.5 Write content-pattern gated tests
  **[USN-9]** | Priority: P2
  **Spec:** `knowledge-graph/Content-Pattern Supersession Hints MUST Be Gated and Lower-Confidence`
  **Design anchor:** Testing Strategy item (content-pattern); Design Architecture Decision "content-pattern secondary signal gated"
  - `kgSupersedeContentPatterns=false` → no content-based supersession markings even when supersession phrase is present in content; diff-based supersession still works.
  - `kgSupersedeContentPatterns=true` with a recognized phrase + concrete matching prior fact + above-threshold confidence → marking produced.
  - Below-threshold or no concrete same-`source_id` match → no marking (no false supersession).
  **Independent Test:** Each of the three branches produces the expected marking / no-marking outcome in isolation.
  **Verification:**
  - Run: `pnpm test -- -t "content.pattern|supersed"`
  - Expected: Flag-off produces no content-pattern markings; above-threshold hit marks; below-threshold does not.

- [x] 3.6 Write recall deprioritization test: current outranks superseded; superseded still emitted with marker
  **[USN-10]** | Priority: P1
  **Spec:** `store/queryKnowledgeLane MUST Deprioritize and Flag Superseded Triples, Not Drop Them`; `retrieval/Superseded KG Evidence MUST Be Deprioritized in Fusion While Preserving the Four-Lane Contract`
  **Design anchor:** Testing Strategy item 10; Recall / multi-hop data flow diagram
  - Seed a supersession via the diff path (save-then-update).
  - Call `queryKnowledgeLane` (or `hybridRetrieve`) and assert: (a) the current fact's candidate has a higher score than the superseded fact's candidate; (b) the superseded candidate is still present (`kg.superseded === true`); (c) the superseded candidate is NOT absent from the output (not dropped).
  **Independent Test:** Both candidates present; score ordering confirmed; marker visible.
  **Verification:**
  - Run: `pnpm test -- -t "supersed|recall|deprioritize"`
  - Expected: Current outranks superseded; superseded candidate present with `kg.superseded=true`.

- [x] 3.7 Write multi-hop deprioritization test + B2 no-regression test + flag-off byte-identical test
  **[USN-10]** | Priority: P1
  **Spec:** `retrieval/Multi-Hop Traversal MUST Prefer Current Truth Over Superseded Edges`; `retrieval/Supersession Deprioritization MUST Be Byte-Identical to Baseline When Disabled`; ``knowledge-graph/`SUPERSEDES` MUST Be Added to the KG Relation Vocabulary``
  **Design anchor:** Testing Strategy items 11, 12; Architecture Decision "flag-off byte-identical"
  - **Multi-hop deprioritization:** Superseded bridge edge in the graph; traversal does not preferentially advance through it; B2 bounds (cycle-guard, depth, cap, allow-list) remain intact; `SUPERSEDES` not in default traversal allow-list.
  - **Flag-off byte-identical:** `kgSupersedeEnabled=false` → `queryKnowledgeLane` output, multi-hop SQL results, `hybridRetrieve` fused output match pre-B3 (compare against flag=false control with same fixtures); writer does delete+reinsert (prior rows are gone, not superseded).
  - **B2 no-regression (#3):** B2 multi-hop test cases (cycle-guard, depth, neighborhood cap, allow-list, bidirectional, elapsed-guard) all pass unchanged with `kgSupersedeEnabled=true`.
  **Independent Test:** Each of the three cases can run with independent fixtures.
  **Verification:**
  - Run: `pnpm test -- -t "multi.hop|multihop|supersed"`
  - Expected: Superseded bridge deprioritized; B2 bounds unchanged; flag-off byte-identical; B2 cases pass under supersession ON.

- [x] 3.8 Write migration idempotency and backward-compat test — `tests/store/migration.test.ts`
  **[USN-11]** | Priority: P1
  **Spec:** `store/kg_triples MUST Gain Nullable Supersession Columns via Additive Migration`
  **Design anchor:** Testing Strategy item 13; Architecture Decision "addColumnIfMissing"
  - Both columns added when absent from a legacy `kg_triples` schema.
  - `runMigrationsWithSemantic` is idempotent (repeated calls do not error or duplicate columns).
  - Seed a legacy `kg_triples` table (without the new columns) and upgrade; rows readable with both columns NULL (backward-compat).
  **Independent Test:** In-memory SQLite; create `kg_triples` without the columns; run migration; both columns present; re-run migration is a no-op.
  **Verification:**
  - Run: `pnpm test -- -t "migration"`
  - Expected: All migration tests pass; idempotent; backward-compat confirmed.

- [x] 3.9 **CRITICAL TEST** — Write LLM double-write no-mass-supersede test (#2 risk)
  **[USN-6]** | Priority: P1
  **Spec:** `knowledge-graph/Supersession MUST Be Detected by Diffing an Observation's Re-Extracted Facts#Detection requires no model or remote service` (LLM MUST NOT gate/remove deterministic supersession); Design Architecture Decision "`extract_kg` LLM double-write must not mass-supersede deterministic facts"
  **Design anchor:** Testing Strategy item 15; design critical risk #2
  - Simulate the `used` LLM path in `processKgJob`: write deterministic facts first (via `writeDeterministicKgFacts`), then call the enriched `persistKgExtraction` with a set that includes LLM-only triples but is missing SOME deterministic triples (simulating an LLM that did not reproduce all deterministic facts verbatim).
  - Assert: deterministic facts that the LLM did not reproduce are NOT marked superseded; LLM-only additions are present as current triples; no deterministic fact has `superseded_at` set as a result of the LLM enrichment write alone.
  **Independent Test:** The test must control the LLM-enriched extraction set to reproduce only a subset of deterministic triples. The union fix in task 2.4 is what makes this test pass.
  **Verification:**
  - Run: `pnpm test -- -t "llm|mass.supersed|extract.kg|double.write"`
  - Expected: REQUIRED — deterministic facts NOT superseded by LLM enrichment; LLM additions inserted as current.

- [x] 3.10 **CRITICAL TEST** — Write rebuild-graph steady-state supersedes-zero test (#1 risk)
  **[USN-6]** | Priority: P1
  **Spec:** `store/The Deterministic Writer MUST Diff and Mark Superseded Instead of Delete-and-Reinsert#Re-extracting identical content converges with no new supersession`; Design Open Question "rebuild-graph counters"
  **Design anchor:** Testing Strategy item 16; design critical risk #1; `File Changes` row rebuild counters (`:3413-3421`)
  - Seed a set of observations with known deterministic facts; run `rebuild-graph` once to establish the base state.
  - Run `rebuild-graph` again on the same unchanged data.
  - Assert: zero facts are newly superseded (`facts_superseded = 0` or equivalent counter); no prior triple gains a new `superseded_at` in the second run; the triple set is unchanged.
  - Also assert: if an observation's stored triples ARE stale vs the current extractor (simulate extractor version change), rebuild DOES mark the genuinely-changed prior facts superseded (correct behavior, not a regression).
  **Independent Test:** Two rebuild runs on identical data; `SELECT COUNT(*) FROM kg_triples WHERE superseded_at IS NOT NULL` is identical before and after the second run.
  **Verification:**
  - Run: `pnpm test -- -t "rebuild|rebuild.graph|supersed"`
  - Expected: REQUIRED — steady-state rebuild supersedes zero facts; counters reflect new semantics; stale-triple case correctly supersedes when extractor output genuinely changes.

- [x] 3.11 Write delete-path no-error test
  **[USN-7]** | Priority: P2
  **Spec:** `store/The Deterministic Writer MUST Diff and Mark Superseded Instead of Delete-and-Reinsert` (delete-path interaction)
  **Design anchor:** Testing Strategy item 14; Architecture Decision "Tolerate dangling superseded_by_triple_id"
  - Seed a supersession (X superseded by Y, where Y belongs to observation O). Hard-delete observation O.
  - Assert: no error thrown; X's `superseded_by_triple_id` is NULL after the delete (cleanup succeeded); X's triple is still present in `kg_triples` (history not lost); X is treated as current history.
  **Independent Test:** After hard-delete, `SELECT * FROM kg_triples WHERE id = X.id` returns one row with both supersession columns NULL.
  **Verification:**
  - Run: `pnpm test -- -t "delete|hard.delete|supersed"`
  - Expected: No error; X's marker NULLed; history intact.

- [x] 3.12 Write `mem_project action=graph` current-state default and history-reachable test — `tests/store/visualization.test.ts` or `tests/http-viz.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** ``tools/`mem_project action=graph` MUST Default to a Current-State View With History Reachable``
  **Design anchor:** Testing Strategy item 17; Architecture Decision "graph-view history surface via `include_superseded`"
  - Flag ON + superseded observation: default `formatProjectGraph` omits superseded content facts; `formatProjectGraph({ includeSuperseded: true })` returns full history including superseded facts.
  - `max_chars` min-200 / no `0` sentinel unchanged (#4 non-regression).
  - Flag OFF: ledger output byte-identical to pre-B3 (each `subject -- relation --> object`).
  **Independent Test:** Three assertions verifiable independently: default view, history view, flag-off view.
  **Verification:**
  - Run: `pnpm test -- -t "visualization|graph|project.view"`
  - Expected: Default hides superseded; history reachable; `max_chars` behavior unchanged; flag-off byte-identical.

- [x] 3.13 Write config env precedence and schema validation tests — `tests/config.test.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `config/Supersession Knobs MUST Resolve Deterministically With Env Overrides`; `config/config.schema.json MUST Document the Supersession Knobs`
  **Design anchor:** Testing Strategy item 18; Architecture Decision "env > persisted > default"
  - Env > persisted > default precedence for all four B3 knobs (`THOTH_KG_SUPERSEDE_ENABLED`, `THOTH_KG_SUPERSEDE_CONTENT_PATTERNS`, `THOTH_KG_SUPERSEDE_CONFIDENCE_THRESHOLD`, `THOTH_KG_SUPERSEDE_DEPRIORITIZE_WEIGHT`).
  - Defaults exactly: `true`, `false`, `0.8`, `0.5`.
  - `config.schema.json` validates a config carrying all four B3 knobs plus `"SUPERSEDES"` in the relation list.
  **Independent Test:** Three sub-cases (env override, persisted fallback, defaults) plus schema validation; all independent of store.
  **Verification:**
  - Run: `pnpm test -- -t "config"`
  - Expected: All config precedence and schema validation tests pass.

- [x] 3.14 Write export/import unchanged test — `tests/store/export-import.test.ts`
  **[USN-12]** | Priority: P2
  **Spec:** `store/Supersession Columns MUST NOT Enter the Portable Export/Import Format`
  **Design anchor:** Testing Strategy item 19; proposal "Out of Scope — portable export/import format unchanged"
  - Assert export shape + `version` are unchanged: no `kg_triples`, no supersession columns in export payload.
  - Assert import is unaffected by the presence of the new schema columns.
  **Independent Test:** Export an observation after supersession; parse the export JSON; no `superseded_by_triple_id` or `superseded_at` key found; `version` unchanged.
  **Verification:**
  - Run: `pnpm test -- -t "export|import"`
  - Expected: Export/import tests pass; no new supersession fields in export payload; version unchanged.

- [x] 3.15 Write MCP tool registry unchanged test — `tests/tools/mem-project.test.ts` or nearest tool-registration suite
  **[USN-12]** | Priority: P1
  **Spec:** `tools/B3 MUST NOT Change the MCP Tool Surface`
  **Design anchor:** Tools delta "B3 MUST NOT Change the MCP Tool Surface"; proposal "No change to the MCP tool count/names"
  - Assert the registered MCP tool names remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
  - Assert no supersession-specific MCP tool is registered.
  - Keep B3 behavior inside existing tools only (`mem_project action=graph` default view and `mem_recall` superseded annotation/deprioritization).
  **Independent Test:** Tool registration can be inspected without executing KG supersession writes.
  **Verification:**
  - Run: `pnpm test -- -t "tool|registry|mem_project|supersed"`
  - Expected: Tool registry is unchanged; no supersession-specific tool appears.

---

## Phase 4: Verification and Close

- [x] 4.1 Full test suite green gate
  **[USN-13]** | Priority: P1
  **Spec:** all B3 requirements in scope
  **Design anchor:** Testing Strategy "vitest + in-memory SQLite (`pnpm test`)"
  Run the full test suite and confirm zero failures across all new and existing tests.
  **Independent Test:** All prior passing tests still pass; all B3 tests pass.
  **Verification:**
  - Run: `pnpm test`
  - Expected: All tests pass with zero failures; no pre-existing test regressed.

- [x] 4.2 Eval gate: supersession-wins pass + B2 no-regression (0% regression condition for default-ON)
  **[USN-13]** | Priority: P1
  **Spec:** `evals/Evals MUST Validate That an Updated Fact Outranks the Fact It Replaced`; `evals/Eval Suite MUST Gate on No Retrieval Regression With Supersession Enabled`
  **Design anchor:** Testing Strategy item 20; Architecture Decision "Default ON is conditional on the eval no-regression gate"
  - Run the retrieval eval suite with `kgSupersedeEnabled=true` (default ON).
  - Assert: (1) supersession-wins case passes (Y ranks above X; X is retained/flagged); (2) OFF/ON no-regression: all existing + B2 multi-hop fixtures pass ON with no worse rank than OFF.
  - If ON regresses: document the regression, flip `kgSupersedeEnabled` default to `false` in `DEFAULT_KNOWLEDGE_GRAPH_CONFIG`, and record the decision in the checklist.
  **Independent Test:** Eval run is a terminal `pnpm run eval:retrieval`; result is deterministic given the fixture set.
  **Verification:**
  - Run: `pnpm run eval:retrieval`
  - Expected: Supersession-wins passes; OFF/ON 0% regression; B2 multi-hop cases surface expected answers under supersession ON.

- [x] 4.3 Build clean gate
  **[USN-13]** | Priority: P1
  **Spec:** all requirements in scope
  **Design anchor:** `openspec/config.yaml` `verify.build_command: 'pnpm run build'`
  Run the full TypeScript build; confirm zero errors.
  **Independent Test:** `pnpm run build` produces dist artifacts with no error.
  **Verification:**
  - Run: `pnpm run build`
  - Expected: Build succeeds with zero TypeScript errors; dist artifacts produced.

- [x] 4.4 Record shipped `kgSupersedeEnabled` default and update checklist
  **[USN-13]** | Priority: P2
  **Spec:** `config/Supersession Master Flag MUST Gate All B3 Behavior`; proposal success criteria "flag-gated, default ON conditional on eval gate"
  **Design anchor:** Architecture Decision "Default ON is conditional on the eval no-regression gate"; `Migration / Rollout` — MINOR version bump
  - After task 4.2 eval result:
    - If eval passes with ON: confirm `kgSupersedeEnabled` default remains `true` in `DEFAULT_KNOWLEDGE_GRAPH_CONFIG`; document "shipped ON" in the checklist.
    - If eval regresses: set `kgSupersedeEnabled` default to `false` in `DEFAULT_KNOWLEDGE_GRAPH_CONFIG`; document "shipped OFF pending regression fix" in the checklist.
  - Confirm version bump label: MINOR (additive, backward-compatible, no data/contract loss).
  - Update `openspec/changes/kg-supersedes-edges/checklists/requirements.md` with final eval outcome and shipped default decision.
  **Independent Test:** Checklist file updated; `DEFAULT_KNOWLEDGE_GRAPH_CONFIG.kgSupersedeEnabled` matches the shipped decision.
  **Verification:**
  - Run: `pnpm test && pnpm run build`
  - Expected: Suite green; build clean; checklist updated with shipped default and eval outcome.

- [x] 4.5 Remediate verify round 2 C2: prevent structural `SUPERSEDES` triple emission
  **[USN-13]** | Priority: P1
  **Spec:** `knowledge-graph/SUPERSEDES MUST Be Added to the KG Relation Vocabulary`; design invariant "B3 emits NO `SUPERSEDES` triple rows"
  **Design anchor:** Architecture Decision "`SUPERSEDES` joins `KG_RELATION_TYPES` but is EXCLUDED from the multi-hop allow-list"; Handoff Hint "No `SUPERSEDES` triple rows emitted"
  - Keep `SUPERSEDES` in vocabulary/schema for diagnostics.
  - Reject `SUPERSEDES` as a structural relation from explicit graph notation, structured triple blocks, and LLM triple ingestion.
  - Add tests proving `A -- SUPERSEDES --> B`, structured `relation: SUPERSEDES`, and LLM `SUPERSEDES` inputs produce no emitted KG triples.
  **Independent Test:** Structural extractor paths return zero `SUPERSEDES` triples while `KG_RELATION_TYPES.includes('SUPERSEDES')` remains true.
  **Verification:**
  - Run: `pnpm exec vitest run tests/indexing/kg-extractor.test.ts tests/store/index.test.ts`
  - Expected: `SUPERSEDES` remains vocabulary-only and no structural extraction path emits it.

---

## Handoff Hints (Preserved from Design Phase — Preservation Constraints for Apply)

1. **Diff is per-`source_id`, not cross-observation:** `persistKgExtraction` diffs ONLY the rows where `source_type='observation' AND source_id=obs.id`. Re-extracting one observation MUST NOT touch another observation's triples.
2. **`SUPERSEDES` excluded from traversal allow-list:** `DEFAULT_KG_RELATION_ALLOW_LIST` (`src/config.ts:136-155`) MUST NOT gain `SUPERSEDES`. Vocabulary entry in `KG_RELATION_TYPES` and `config.schema.json` enum is for diagnostics/validation only; `SUPERSEDES` triple rows are NEVER emitted by B3.
3. **No FK on `superseded_by_triple_id`:** SQLite additive migration constraint; dangling refs are tolerated and cleaned up explicitly in the delete path. Readers use `IS NOT NULL`, not a JOIN on the referenced id.
4. **Flag-off byte-identical guarantee:** When `kgSupersedeEnabled=false`, the writer does the exact pre-B3 blind DELETE+reinsert; `queryKnowledgeLane`, multi-hop CTE SQL+results, and `hybridRetrieve` fused output MUST be identical to pre-B3. Do not read the column or apply the CASE expression in the flag-off code path.
5. **No `SUPERSEDES` triple rows emitted:** Supersession is column-only; no triples with `relation='SUPERSEDES'` are inserted by B3.
6. **Replacement determinism:** When multiple new triples share the same subject+relation, the first by insertion order (lowest new id) is the replacement target. Deterministic and sufficient.
7. **Multi-hop CASE expression:** Flag-off = build SQL string with NO CASE expression; flag-on = `CASE WHEN t.superseded_by_triple_id IS NOT NULL OR t.superseded_at IS NOT NULL THEN confidence * :deprioritizeWeight ELSE confidence END` inside `candidate_edges`. Spec mandates deprioritize, not hard-skip.
8. **Graph-view history surface:** `include_superseded` on `ObservationFactsInput`; `formatProjectGraph` passes it through. `mem_project action=graph` default = current-state (flag ON); flag-off = legacy all-rows.
9. **LLM double-write MUST use union:** The second `persistKgExtraction` in `processKgJob` (`:472`) MUST receive `deterministic ∪ llm` (via `extractKnowledgeTriples({...extractionInput, llmTriples})` or equivalent); otherwise it mass-supersedes deterministic facts. This is the #2 apply-time critical requirement.
10. **Rebuild steady-state MUST supersede zero:** The diff's idempotency property guarantees this if the extractor output is unchanged. Confirm in the rebuild counter task (2.10) and the steady-state test (3.10). This is the #1 apply-time critical regression guard.
