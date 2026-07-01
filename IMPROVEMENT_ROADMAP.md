# thoth-mem — Improvement Program Roadmap

> **Living document.** Durable, file-based mirror of the multi-change improvement
> program for `thoth-mem`. Created because the `thoth-mem` memory MCP was
> disconnected during planning, so this Markdown file is the source of truth for
> resuming without re-discovery. When memory reconnects, mirror this into the
> `review/thoth-mem/improvement-roadmap` topic.

- **Last updated:** 2026-06-30
- **Branch:** `full-graph` (NOT `master` — no branch-before-commit needed)
- **Repo:** `C:\DEV\Proyectos\Webstorm\thoth-mem` · package version `0.3.6`
- **Program status:** A · B1 · B2 · B3 · atomic-writes **SHIPPED** · **C1 planned (at plan gate, not implemented)** · C2 / C3 / cross-harness deferred

---

## 1. North Star

`thoth-mem` is a **persistent-memory MCP server for AI coding agents** across
harnesses (Codex, OpenCode, Claude Code, …). Two driving goals:

1. **Maximize the knowledge graph's potential** — make the graph actually drive
   recall, not just get built and ignored.
2. **Be extremely token-efficient** — an agent must not have to re-read or
   re-discover decisions/discoveries from prior sessions; bounded, high-signal
   recall.

Reference/inspiration projects: engram (`C:\DEV\Proyectos\Webstorm\engram`),
graphify (`C:\DEV\Proyectos\PythonProjects\graphify`), claude-mem
(`C:\DEV\Proyectos\Webstorm\claude-mem`), ArcRift
(`C:\DEV\Proyectos\Webstorm\ArcRift`).

The program is the output of a **deep review** of the project, converted into an
executable **SDD improvement program**, delivered **change by change**.

---

## 2. Operating Model

**Per-change flow (established, consistent across A→C1):**

1. `requirements-interview` (step 0) → route decision.
2. **Full SDD** pipeline: `sdd-explore` → `sdd-propose` → `sdd-spec` →
   `sdd-clarify` → `sdd-design` → `sdd-tasks`.
3. **Plan gate** → review plan with **oracle** (`plan-reviewer`) until `[OKAY]`.
4. Deep approved-plan overview → user **implement-or-stop** gate.
5. **User implements externally** (their own session), then asks for review.
6. Orchestrator runs **oracle code-review + verification**; if GREEN →
   **commit** (`feat` + `chore archive`) and archive.

**Conventions:**

- **Persistence mode:** `openspec` (repo files only; no thoth-mem writes for SDD
  artifacts). Chosen for the whole program.
- **Change dirs:** `openspec/changes/{change}/` → archived to
  `openspec/changes/archive/{YYYY-MM-DD}-{change}/` with deltas merged into
  `openspec/specs/{domain}/spec.md`.
- **Constitution:** `openspec/memory/constitution.md` — 5 principles:
  - **P1** compact MCP surface (exactly 6 tools).
  - **P2** deterministic-first with safe degradation.
  - **P3** harness-agnostic contract/parity.
  - **P4** token-efficient bounded recall.
  - **P5** stable public contract + supersede-not-delete + deprecation discipline.
- **Verification commands** (`openspec/config.yaml`): `pnpm test` (vitest),
  `pnpm run build` (`tsc --noEmit` + esbuild + dashboard build), and
  `pnpm run eval:retrieval` for retrieval/graph changes. (`pnpm` ≡ `npm` here.)
- **Language:** user-facing replies in Spanish; all sub-agent prompts + SDD
  artifacts in English.

**⚠️ Memory status:** the `thoth-mem` MCP server (`mem_*` tools) was
**disconnected** for this planning session (verified via ToolSearch; a client
restart did not recover it — likely memory pressure: a JVM OOM `hs_err` was
observed, and the thoth-mem server loads heavy ONNX embedding models). Durable
memory writes (observations, roadmap topic, session summary) **could not run**.
This file is the fallback. **On reconnect:** `mem_session(action="start")` →
save this roadmap to `review/thoth-mem/improvement-roadmap` → save "B3 shipped",
"atomic-writes shipped", "C1 planned" observations → session summary.

---

## 3. Status Snapshot

| # | Change (dir) | What | State | Commits |
|---|---|---|---|---|
| **A** | `output-caps-and-pruning` | Bound `mem_context`/`mem_project` output (token bug) | ✅ Shipped + archived | `2d4f958` feat · `4be721f` plan · `872d546` constitution/config · `a3e39ba` archive |
| **B1** | `graph-lite-consolidation` | Consolidate legacy `observation_facts` into `kg_triples` (single source) | ✅ Shipped + archived | `62f2fab` plan · `6ec1913` feat · `8c16641` archive |
| **B2** | `kg-multi-hop-recall` | Entity-anchored multi-hop KG recall | ✅ Shipped + archived | `3e27e25` plan · `dfcbdfc` feat · `c12d52d` archive |
| **B3** | `kg-supersedes-edges` | Supersede-on-update (mark, don't blind-delete) | ✅ Shipped + archived | `d378bd7` plan · `b7c1b5d` feat · `aee8131` archive |
| **—** | `atomic-observation-writes` | Wrap sync observation writes in a transaction (hardening from B3 review) | ✅ Shipped + archived | `54ac604` fix · `f9a2a2f` archive |
| **C1** | `kg-superseded-pruning` | keep-N retention/pruning of superseded triples | 📝 **Planned — at plan gate (not reviewed, not implemented)** | plan artifacts uncommitted → committing with this roadmap |
| **C2** | *(not started)* | Consolidation / reflection / decay | ⏳ Backlog | — |
| **C3** | *(not started)* | Community summaries (LazyGraphRAG / Leiden) | ⏳ Backlog | — |
| **G3** | *(cross-repo)* | Harness parity: deterministic memory hooks for Claude Code + Codex | ⏳ Deferred | — |
| **MIG** | *(cross-repo)* | Move `MemoryIntegrationCore` into thoth-mem | ⏳ Deferred | — |

---

## 4. Architecture Primer (resume without re-discovery)

**Stack:** TypeScript/ESM, Node ≥18, SQLite (`better-sqlite3`) + `sqlite-vec` +
FTS5, `zod` ^4, `@modelcontextprotocol/sdk` ^1.29, `@huggingface/transformers` +
`onnxruntime-node`, vitest, pnpm.

**MCP surface (6 tools, P1):** `mem_save`, `mem_recall`, `mem_context`,
`mem_get`, `mem_project`, `mem_session`. Admin ops (`rebuild-graph`,
`rebuild-index`, sync, migrate, and the planned `prune-graph`) are **CLI + HTTP
only — intentionally NOT MCP tools** (`src/evals/retrieval.ts:284-286`).

**Retrieval:** 4-lane hybrid fusion (sentence / chunk / lexical / kg), HyDE,
deterministic + optional-LLM KG extraction.

**Knowledge graph:** `kg_entities` + `kg_triples`. `kg_triples` columns
(`src/store/schema.ts:195-216`): `id`, `subject_entity_id`, `relation`,
`object_entity_id`, `source_type`, `source_id`, `source_sync_id`, `project`,
`topic_key`, `provenance`, `confidence`, `triple_hash` (UNIQUE),
`extractor_version`, `superseded_by_triple_id` (nullable, self-ref),
`superseded_at` (nullable), `created_at`, `updated_at`. FK cascade is
**entity→triple only** (deleting a triple does NOT remove its entities).

**Key files/anchors:**

- Writer: `persistKgExtraction` (`src/indexing/jobs.ts:503-610`),
  `writeDeterministicKgFacts` (`:484-501`). Now runs **inside the caller's
  transaction** on save/upsert/update (`src/store/index.ts:1536/1527/1680`)
  after `atomic-observation-writes`.
- Retrieval KG lane: `queryKnowledgeLane` (`src/store/index.ts` ~`:2107/:2139`);
  multi-hop CTE (~`:2279`).
- Delete path: `deleteKnowledgeArtifactsForObservation`
  (`src/store/index.ts:1148-1164`); B3 dangling-ref NULL idiom (`:1151-1158`);
  hard-delete txn (`:1594-1599`).
- Maintenance: `rebuildObservationFacts` (`src/store/index.ts:3435-3506`) with
  before/after COUNT pattern (`:3464-3476`, delta `:3485-3497`).
- Admin op pattern: CLI `handleRebuildGraph` (`src/cli.ts:569-588`, dispatch
  `:700`); HTTP route catalog (`src/http-routes.ts:54-73`), `rebuild-graph`
  route (`:61`), handler (`:573-581`).
- Config knobs: `KnowledgeGraphConfig` (`src/config.ts:39-51`),
  `DEFAULT_KNOWLEDGE_GRAPH_CONFIG` (`:161-173`), `resolveKnowledgeGraphConfig`
  env>persisted>default (`:455-498`), `config.schema.json` knowledgeGraph block
  (`:158-242`). B3 knobs use `THOTH_KG_*` envs.
- Export/import: `exportData`/`importData` (`src/store/index.ts:3626-3663`) —
  does **not** touch `kg_triples`; `version: 1`.

---

## 5. Completed Changes (detail)

### A — `output-caps-and-pruning` ✅
- **Problem:** `getContext` emitted an uncapped join → token blow-up (the
  "critical token bug").
- **Shipped:** `getContext` output bounded via `maxContextChars` (default
  **8000**, env `THOTH_MAX_CONTEXT_CHARS`); previews-by-default (full content via
  `mem_get`); sentinel `0` = unbounded = rollback. Constitution + SDD mechanism
  sections added to `openspec/`.
- **Commits:** `2d4f958`, `4be721f`, `872d546`, `a3e39ba`.

### B1 — `graph-lite-consolidation` ✅
- **Problem:** redundant legacy `observation_facts` table duplicated
  `kg_triples` ("used ≠ needed").
- **Shipped:** removed `observation_facts`; single graph source = `kg_triples`.
  Removed the 500-char section cap for content parity (safe because A bounds
  output downstream). Migrated 6 legacy test suites.
- **Commits:** `62f2fab`, `6ec1913`, `8c16641`.

### B2 — `kg-multi-hop-recall` ✅
- **Shipped:** entity-anchored multi-hop recall via a two-direction UNION
  recursive CTE with cycle-guard, `kgMaxDepth`, `kgNeighborhoodLimit`,
  allow-list, elapsed-guard. Surfaces bridge-only observations. Eval 22/22, 0%
  regression. Closes **Brecha #1** (graph built-but-not-traversed) together with
  B1.
- **Commits:** `3e27e25`, `dfcbdfc`, `c12d52d`.

### B3 — `kg-supersedes-edges` ✅
- **Problem:** the writer blind-deleted prior triples on update (violated P5,
  lost history).
- **Shipped:** **supersede-on-update** — a deterministic per-observation diff in
  `persistKgExtraction` MARKS removed/replaced triples as superseded (nullable
  `superseded_by_triple_id`, `superseded_at`) and KEEPS them; retrieval
  deprioritizes-but-keeps superseded; `SUPERSEDES` added to vocabulary only
  (excluded from traversal allow-list, never emitted as a structural triple);
  revive-on-reassert via `ON CONFLICT(triple_hash)`; LLM path receives
  `deterministic ∪ llm` (no mass-supersede); flag `kgSupersedeEnabled`
  **default true**, flag-off byte-identical.
- **Verification:** 529 tests, build clean, eval 23 cases, OFF/ON no-regression
  100%, flag-off 100%, supersession-wins PASS. Oracle code-review **GREEN**
  (10/10 critical checkpoints).
- **Commits:** `d378bd7`, `b7c1b5d`, `aee8131`.

### atomic-observation-writes ✅ (unplanned hardening from B3 review)
- **Origin:** oracle's B3 review flagged pre-existing non-atomicity in
  `saveObservation`/`updateObservation` (bodies not transaction-wrapped;
  a crash mid-write could half-update `kg_triples`). Spawned as background task
  `task_f9d7bd50`; user implemented in a separate session.
- **Shipped:** sync observation write bodies now wrapped in `db.transaction()`
  (all-or-nothing observation row + embeddings + KG diff). **This is the
  foundation C1's design builds on** (nested-txn-forbidden → plain-core/
  wrapped-entry split).
- **Commits:** `54ac604`, `f9a2a2f`.

---

## 6. In Progress — C1 `kg-superseded-pruning` (PLANNED, AT PLAN GATE)

**Why:** After B3, superseded `kg_triples` are marked and **kept forever**. No
retention/pruning/TTL/VACUUM exists anywhere (greenfield). With
`kgSupersedeEnabled` default-ON, accumulation is **already happening** →
unbounded graph growth → erodes P4 token-efficiency. C1 bounds it.

**Confirmed decisions (user-approved):**

| Decision | Value | Owner |
|---|---|---|
| Retention strategy | **keep-N-most-recent** per slot | user |
| Slot definition | `(source_id, subject_entity_id, relation)` (per-observation; never crosses observations) | design |
| keep-N default | `kgSupersededKeepN = 10`, global, overridable per-project | design default |
| Trigger | **BOTH** — manual `prune-graph` (CLI+HTTP+dry-run) **and** automatic incremental enforcement | user |
| Master flag default | `kgPruneEnabled = true` (**ON**), **gated by eval no-regression**; fallback `false` if it regresses | **user** |
| Orphan cleanup | `kgPruneOrphanEntities = true` | design default |
| Version bump | MINOR (additive, backward-compatible) | — |

**Ordering rule:** retain the N most-recent SUPERSEDED per slot ordered by
`superseded_at DESC, id DESC`; prune older superseded; **CURRENT
(non-superseded) triples are NEVER pruned**; `keep-N=0` prunes all superseded.

**Design highlights** (`openspec/changes/kg-superseded-pruning/design.md`):

- **Plain-core / wrapped-entry split** (the load-bearing choice): `persistKgExtraction`
  already runs inside the caller's `db.transaction()` and better-sqlite3 forbids
  nested transactions → `runSupersededPrune(db, opts)` (plain, no txn, shared by
  both triggers) + `pruneSupersededTriples({project?, dryRun?})` (wraps the core
  in `db.transaction()` for the manual op). The **automatic hook** calls the
  plain core so it inherits the caller's txn.
- **Automatic hook:** inside `persistKgExtraction` after B3 marking, scoped ONLY
  to slots the current write touched (`collectTouchedSlots`); entered only when
  `kgSupersedeEnabled && kgPruneEnabled` → **flag-off byte-identical** (no new
  SQL on the off path). Retrieval reads no C1 knob (also byte-identical).
- **Selection:** `ROW_NUMBER() OVER (PARTITION BY source_id, subject_entity_id,
  relation ORDER BY superseded_at DESC, id DESC)`, prune `rn > keep-N`; current
  rows excluded by `WHERE`; fully parameterized.
- **Prune order (in txn):** NULL dangling `superseded_by_triple_id` refs on
  survivors pointing at pruned rows (B3 idiom) → delete pruned → orphan-entity
  cleanup (gated).
- **Dry-run:** identical selection, SELECT-only, returns counts, zero mutation.
- **Schema:** one additive `CREATE INDEX IF NOT EXISTS
  idx_kg_triples_slot_superseded` — **no new column**.
- **Counter shape** mirrors `RebuildObservationFactsResult`.
- **Rebuild interaction:** `rebuildObservationFacts` triggers per-observation
  enforcement when both flags on; steady-state converges (no oscillation).
- **Residual for implementation:** add `subject_entity_id` to the B3 prior
  SELECT (`src/indexing/jobs.ts:544-551`) so `collectTouchedSlots` gets slot
  keys without an extra query.

**Artifacts (11 files, in `openspec/changes/kg-superseded-pruning/`):**
`proposal.md` · `design.md` · `tasks.md` (**35 tasks / 4 phases**) ·
`checklists/requirements.md` · `specs/{config,knowledge-graph,store,indexing,
retrieval,tools,evals}/spec.md` (20 requirements, 51 scenarios; all
`[NEEDS CLARIFICATION]` resolved; note: **`indexing` is a new baseline spec
domain** created on archive).

**tasks.md phases:** Phase 1 Infrastructure (4) · Phase 2 Implementation (10) ·
Phase 3 Testing (16, covering ~27 design tests) · Phase 4 Verification & Close
(5, incl. the eval-gated default-rollout + MINOR bump). 100% traceability
(`Spec:` + `Design anchor:` + Independent Test + Verification per task); no
unsatisfiable gates.

**Current status:** plan **complete**, **NOT** oracle-reviewed, **NOT**
implemented. Stopped at the plan gate by user (time).

---

## 7. Resume Checklist (exact next actions for C1)

1. **Plan gate → oracle `plan-reviewer`** on `openspec/changes/kg-superseded-pruning/`.
   Look for: unsatisfiable gates, correctness/data-loss risks, flag-off
   byte-identity proof soundness, spec↔design↔tasks coherence, the nested-txn/
   plain-core reasoning, eval-gated default. Loop until `[OKAY]`.
2. On `[OKAY]` → give the deep approved-plan overview → **implement-or-stop**
   gate (user).
3. Implementation (user externally, or `sdd-apply`) — watch the C1-specific
   risks: flag-off byte-identical (automatic path + retrieval); nested-txn
   avoidance (automatic hook must NOT wrap a txn); dangling-ref NULLing +
   orphan cleanup; `subject_entity_id` prior-SELECT fix; dry-run == real
   selection; steady-state rebuild does not over-prune.
4. **Verify** (`sdd-verify`): `pnpm test` + `pnpm run build` +
   `pnpm run eval:retrieval`. The **OFF-vs-ON no-regression eval gate governs
   the shipped `kgPruneEnabled` default** (pass → ship ON; regress → flip to
   `false`, document). Bounded verify-loop (≤3 rounds).
5. If GREEN → **commit** (`feat` + `chore archive`), merge deltas, archive to
   `openspec/changes/archive/{date}-kg-superseded-pruning/`. Update this roadmap.

---

## 8. Backlog / Deferred (toward the full goal)

- **C2 — consolidation / reflection / decay:** merge duplicate / near-duplicate
  observations & facts; periodic reflection pass to synthesize durable
  learnings; decay of low-value memories.
- **C3 — community summaries:** LazyGraphRAG / Leiden clustering over the KG for
  hierarchical, cheap high-level recall. (Largest; depends on a mature graph.)
- **Brecha #3 — harness parity:** bring deterministic memory hooks to **Claude
  Code + Codex** (today only **OpenCode** has them; the `thoth-agents` plugin at
  `C:\DEV\Proyectos\Webstorm\thoth-agents` is an OpenCode plugin —
  `@opencode-ai/plugin` — with native hooks; CC/Codex get memory
  instruction-only).
- **Cross-repo migration:** move `MemoryIntegrationCore` into thoth-mem so any
  harness gets deterministic memory. (Architecture decision was saved at memory
  topic `review/thoth-mem/architecture-decision` — re-verify when memory is back.)
- **Constitution note (PATCH):** run `sdd-constitution` to record that C1's
  bounded keep-N retention is **not** a reversal of P5 supersede-not-delete
  (preserves the N most-recent history). Deferred, non-blocking.

**Follow-ups from the B3 code review:**

- ✅ **Non-atomic writers** — DONE (`atomic-observation-writes`, `54ac604`).
- ⬜ **W1** — the current-state filter in `getObservationFactsFromKg` also
  filters superseded facts for the observatory ledger detail + HTTP facts route
  (not only `mem_project action=graph`). Behaviorally benign ("prefer current
  truth"); history still in DB. Decide: accept + doc-note, or wire an
  `include_superseded` escape at those callers. Candidate for C-series or a doc
  fix.
- ⬜ **W2** — content-pattern secondary supersession pass
  (`kgSupersedeContentPatterns`, opt-in, default OFF) has substring-match
  precision risk. Doc the knob's caveat; not default-on.

---

## 9. Commit Ledger (program, newest first)

```
f9a2a2f chore(openspec): archive atomic-observation-writes
54ac604 fix(store): wrap sync observation writes in a transaction for atomicity
aee8131 chore(openspec): archive kg-supersedes-edges; merge deltas into baseline
b7c1b5d feat(graph): supersede-on-update for KG facts instead of blind delete (B3)
d378bd7 docs(openspec): add kg-supersedes-edges (B3) change plan
c12d52d chore(openspec): archive kg-multi-hop-recall; merge deltas into baseline
dfcbdfc feat(retrieval): entity-anchored multi-hop KG recall (B2)
3e27e25 docs(openspec): add kg-multi-hop-recall (B2) change plan
8c16641 chore(openspec): archive graph-lite-consolidation; merge deltas into baseline
6ec1913 feat(graph): consolidate observation_facts into kg_triples (B1)
62f2fab docs(openspec): add graph-lite-consolidation (B1) change plan
a3e39ba chore(openspec): archive output-caps-and-pruning
872d546 chore(openspec): add constitution and SDD mechanism sections
4be721f docs(openspec): add output-caps-and-pruning change plan
2d4f958 feat(memory): bound mem_context and mem_project summary output
d3ca25e 0.3.6   ← program baseline
```
