# thoth-mem — Improvement Program Roadmap

> **Living document.** Durable, file-based mirror of the multi-change improvement
> program for `thoth-mem`. Created because the `thoth-mem` memory MCP was
> disconnected during planning, so this Markdown file is the source of truth for
> resuming without re-discovery. When memory reconnects, mirror this into the
> `review/thoth-mem/improvement-roadmap` topic.

- **Last updated:** 2026-07-05
- **Branch:** `full-graph` (NOT `master` — no branch-before-commit needed)
- **Repo:** `C:\DEV\Proyectos\Webstorm\thoth-mem` · package version `0.3.7`
- **Program status:** A · B1 · B2 · B3 · atomic-writes · C1 · C2 · C3
  **SHIPPED** · stable-memory-identity-bootstrap **SHIPPED** · W1
  **SHIPPED** · W2 **SHIPPED** · P6 agent operational health **SHIPPED** ·
  P4 token-savings metrics **SHIPPED** ·
  C1 constitution PATCH **RECORDED** · cross-harness deferred

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

**Per-change flow (established, consistent across A→C3):**

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

**Memory status:** this roadmap remains the durable file mirror for resuming
without re-discovery. On 2026-07-04, the `mem_*` MCP tools were available again
in Codex, root session continuity was restored, and roadmap-level updates should
also be mirrored into `review/thoth-mem/improvement-roadmap`.

---

## 3. Status Snapshot

| # | Change (dir) | What | State | Commits |
|---|---|---|---|---|
| **A** | `output-caps-and-pruning` | Bound `mem_context`/`mem_project` output (token bug) | ✅ Shipped + archived | `2d4f958` feat · `4be721f` plan · `872d546` constitution/config · `a3e39ba` archive |
| **B1** | `graph-lite-consolidation` | Consolidate legacy `observation_facts` into `kg_triples` (single source) | ✅ Shipped + archived | `62f2fab` plan · `6ec1913` feat · `8c16641` archive |
| **B2** | `kg-multi-hop-recall` | Entity-anchored multi-hop KG recall | ✅ Shipped + archived | `3e27e25` plan · `dfcbdfc` feat · `c12d52d` archive |
| **B3** | `kg-supersedes-edges` | Supersede-on-update (mark, don't blind-delete) | ✅ Shipped + archived | `d378bd7` plan · `b7c1b5d` feat · `aee8131` archive |
| **—** | `kg_triples` legacy migration hotfix | Legacy DB startup adds supersession columns before indexes | ✅ Merged from `master` into `full-graph` | `23957d6` cherry-pick · `6139fa5` merge |
| **—** | `atomic-observation-writes` | Wrap sync observation writes in a transaction (hardening from B3 review) | ✅ Shipped + archived | `54ac604` fix · `f9a2a2f` archive |
| **C1** | `kg-superseded-pruning` | keep-N retention/pruning of superseded triples | ✅ Shipped + archived | `6fb20ad` plan · `0771990` feat · `47efb0f` fix · `6986582` archive |
| **C2** | `memory-consolidation-reflection-decay` | Consolidation / reflection / decay | ✅ Shipped + archived | `7595e90` feat · `4b7ce07` archive · `eb021e3` fix · `9538bde` fix |
| **C3** | `community-summaries-lazygraphrag` | Community summaries (LazyGraphRAG / Leiden-inspired MVP) | ✅ Shipped + archived | `722e3cc` feat · `c94a65a` archive |
| **F1** | `stable-memory-identity-bootstrap` | Stable project/session identity and visible deterministic fallback metadata | ✅ Shipped + archived | `ed8780e` store · `d7ebb92` surfaces · `8dcd53e` archive |
| **W1** | `include-superseded-http-history` | HTTP/observatory opt-in for superseded graph history | ✅ Shipped + archived | `3d82aad` feat · `39e0d6a` archive |
| **W2** | `content-pattern-supersession-caveat` | Formal caveat for opt-in content-pattern supersession precision risk | ✅ Shipped (docs/spec) | `d6d0dd4` docs |
| **P6** | `agent-operational-health` | `mem_project(action="health")` and visible/non-fatal legacy KG drift | ✅ Shipped + archived | `e51633e` feat · `0fed83c` archive |
| **P4** | `token-savings-metrics` | Token-savings and recall-efficiency measurement foundation | ✅ Shipped + archived | `00e22b5` evals · `4fa7383` recall · `e43858e` tests · `11b8ed4` archive |
| **G3** | *(cross-repo)* | Harness parity: deterministic memory hooks for Claude Code + Codex | ⏳ Deferred | — |
| **MIG** | *(cross-repo)* | Move `MemoryIntegrationCore` into thoth-mem | ⏳ Deferred | — |

> Drift note: `openspec/changes/production-hardening-dashboard-v2` and
> `openspec/changes/sync-and-resilience` currently exist as active OpenSpec
> change directories with checked task lists. They are not the C3 roadmap item;
> review/verify/archive them only after an explicit user decision.

---

## 4. Architecture Primer (resume without re-discovery)

**Stack:** TypeScript/ESM, Node ≥18, SQLite (`better-sqlite3`) + `sqlite-vec` +
FTS5, `zod` ^4, `@modelcontextprotocol/sdk` ^1.29, `@huggingface/transformers` +
`onnxruntime-node`, vitest, pnpm.

**MCP surface (6 tools, P1):** `mem_save`, `mem_recall`, `mem_context`,
`mem_get`, `mem_project`, `mem_session`. Admin ops (`rebuild-graph`,
`rebuild-index`, sync, migrate, and the planned `prune-graph`) are **CLI + HTTP
only — intentionally NOT MCP tools** (`src/evals/retrieval.ts:284-286`).

**Retrieval:** 4-lane hybrid fusion (sentence / kg / chunk / lexical), HyDE,
deterministic + optional-LLM KG extraction. C3 community summaries contribute
inside the existing KG lane (`source: kg_community_summary`) behind a default-off
read path; there is still **no fifth MCP/retrieval lane**.

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

## 6. Completed — C1 `kg-superseded-pruning` (IMPLEMENTED, VERIFIED, ARCHIVED)

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

**Artifacts (archived in `openspec/changes/archive/2026-07-01-kg-superseded-pruning/`):**
`proposal.md` · `design.md` · `tasks.md` (**35 tasks / 4 phases**) ·
`checklists/requirements.md` · `specs/{config,knowledge-graph,store,indexing,
retrieval,tools,evals}/spec.md` (21 requirements, 55 scenarios; all
`[NEEDS CLARIFICATION]` resolved; note: **`indexing` is a new baseline spec
domain** created on archive).

**tasks.md phases:** Phase 1 Infrastructure (4) · Phase 2 Implementation (10) ·
Phase 3 Testing (16, covering ~27 design tests) · Phase 4 Verification & Close
(5, incl. the eval-gated default-rollout + MINOR bump). 100% traceability
(`Spec:` + `Design anchor:` + Independent Test + Verification per task); no
unsatisfiable gates.

**Current status:** shipped, verified, archived, and committed. The only blocker
found in verify round 1 was real prune orphan cleanup deleting unrelated
pre-existing orphans while dry-run counted only prune-set-caused orphans; fixed
by scoping real orphan deletion to prune candidate entities. No critical issues
or warnings remain.

---

## 7. Completed — C2 `memory-consolidation-reflection-decay` ✅

**Why:** C2 introduced the maintenance layer that C3 can build on: duplicate
suppression/consolidation, deterministic reflection synthesis, and reversible
decay metadata for lower-value or stale memories.

**Shipped:**

- Exact-hash consolidation is scoped by `topic_key`, project, scope, and type so
  retrieval cannot collapse unrelated topical memories.
- Reflection `source_set_hash` is portable across export/import and no longer
  depends on local row IDs or `sync_id`.
- Reflection upsert avoids overwriting user-authored topic collisions and reuses
  existing/imported suffixed maintenance-reflection rows across reruns.
- Legacy consolidation metadata is filtered against active retrieval filters
  before canonical routing.
- Decay cleanup clears stale metadata only for records evaluated by the current
  plan, preserving outside-batch metadata during bounded automatic maintenance.
- `maintenance.enabled=false` defaults read-path metadata consumption off, while
  explicit `readPath.enabled=true` still consumes persisted metadata.

**Artifacts:** archived at
`openspec/changes/archive/2026-07-01-memory-consolidation-reflection-decay/`.

**Verification:** final review was **GREEN** after remediation; focused Vitest
gate passed (`49` files / `586` tests), `pnpm run build` passed, and
`pnpm run eval:retrieval` passed with all Maintenance metrics at `100%`.

**Commits:** `7595e90` feature, `4b7ce07` OpenSpec archive, `eb021e3`
remediation fix, `9538bde` stale-consolidation hardening fix.

---

## 8. Completed — C3 `community-summaries-lazygraphrag` ✅

**Why:** C3 adds bounded, derived community summaries over the knowledge graph so
agents can get cheap high-level recall without expanding the compact MCP
surface. It is a LazyGraphRAG/Leiden-inspired MVP implemented with deterministic
connected components and offline extractive summaries.

**Shipped:**

- Additive community summary tables for derived rebuild artifacts; export/import
  stays source-memory-only.
- Project-scoped transactional rebuild, preview, drop/status surfaces via CLI
  and HTTP only; MCP registry remains exactly six tools.
- Configured community summary budgets and schema validation, default-off read
  path, enrichment disabled/offline-safe by default.
- Retrieval integration inside the KG lane with `kg_community_summary` evidence,
  no fifth lane, degraded fallback markers, and bounded compact annotations.
- Staleness tracking on KG/source mutations and explicit graph-signature drift
  detection.

**Code-review remediation after initial verify:**

- Community recall now filters/ranks summaries by query relevance before applying
  `maxRetrievalCommunities`, so a relevant community beyond the first N is still
  discoverable.
- Runtime community budgets now clamp to the finite maxima advertised by
  `config.schema.json`.
- Normal retrieval no longer recomputes the full community graph signature; the
  full scan remains on explicit state/status paths.
- The first explicit signature-drift caller now receives
  `graph_signature_changed` in `degraded_reasons`.

**Artifacts:** archived at
`openspec/changes/archive/2026-07-01-community-summaries-lazygraphrag/`.

**Verification:** final code review was **GREEN** after remediation. Gates passed:
focused Vitest (`6` files / `97` tests), `pnpm run build`, full `pnpm test`
(`50` files / `621` tests), and `pnpm run eval:retrieval` (`23` cases; all
Community metrics at `100%`).

**Commits:** `722e3cc` feature, `c94a65a` OpenSpec archive.

---

## 9. Resume Checklist (next actions after C3)

1. ✅ Confirmed C1, C2, and C3 are shipped and archived from git/OpenSpec
   evidence.
2. ✅ Confirmed OpenSpec is initialized and not stale:
   `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/`, and
   `openspec/memory/constitution.md` exist.
3. ✅ Confirmed C3 has no active change directory; only the archived path remains.
4. ✅ C3 code review is GREEN after targeted remediation and repeat gates.
5. ✅ Created the C3 feature and OpenSpec/archive commits (`722e3cc`, `c94a65a`).
6. ✅ Recorded the C1/P5 constitution PATCH in
   `openspec/memory/constitution.md` (`1.0.0 → 1.0.1`).
7. ✅ Foundation item `stable-memory-identity-bootstrap` is shipped and archived
   at `openspec/changes/archive/2026-07-04-stable-memory-identity-bootstrap/`.
   Verification passed 32/32 scenarios, focused identity/bootstrap tests, build,
   and full suite.
8. ✅ W1 `include-superseded-http-history` is implemented, verified, and
   archived at
   `openspec/changes/archive/2026-07-04-include-superseded-http-history/`.
   Verification passed 5/5 proposal criteria, focused HTTP suites, build, and
   full test suite.
9. ✅ W2 `content-pattern-supersession-caveat` is closed by `d6d0dd4`; the
   formal config spec now records the substring/phrase-match precision caveat
   and keeps `kgSupersedeContentPatterns` opt-in/default OFF.
10. ✅ P6 `agent-operational-health` is implemented and archived at
   `openspec/changes/archive/2026-07-04-agent-operational-health/`.
   Verification passed round 1, focused/full tests, and build.
11. ✅ P4 `token-savings-metrics` is implemented and archived at
   `openspec/changes/archive/2026-07-05-token-savings-metrics/`.
   Verification passed round 1: focused retrieval/recall/community tests,
   `pnpm run eval:retrieval`, full `pnpm test`, and `pnpm run build`.
12. ⬜ Next local foundation item before **G3 harness parity** / **MIG
   MemoryIntegrationCore migration**: decide whether to plan the broader
   community-summary read-path rollout now that P4 measurement gates exist.

---

## 10. Backlog / Deferred (toward the full goal)

- **Brecha #3 — harness parity:** bring deterministic memory hooks to **Claude
  Code + Codex** (today only **OpenCode** has them; the `thoth-agents` plugin at
  `C:\DEV\Proyectos\Webstorm\thoth-agents` is an OpenCode plugin —
  `@opencode-ai/plugin` — with native hooks; CC/Codex get memory
  instruction-only).
- **Cross-repo migration:** move `MemoryIntegrationCore` into thoth-mem so any
  harness gets deterministic memory. (Architecture decision was saved at memory
  topic `review/thoth-mem/architecture-decision` — re-verify when memory is back.)
- ✅ **Constitution note (PATCH):** DONE in
  `openspec/memory/constitution.md` v`1.0.1`: C1 bounded keep-N retention of
  already-superseded KG history is **not** a reversal of P5
  supersede-before-delete.

**Follow-ups from the B3 code review:**

- ✅ **Non-atomic writers** — DONE (`atomic-observation-writes`, `54ac604`).
- ✅ **W1** — DONE as `include-superseded-http-history`: HTTP
  `/projects/{project}/graph` and `/observatory/ledger/{id}` now preserve
  current-only defaults and expose retained superseded KG history only through
  explicit `include_superseded=true`; OpenAPI and HTTP tests cover the opt-in.
- ✅ **W2** — DONE as `content-pattern-supersession-caveat`: the formal config
  spec now documents the substring/phrase-match precision risk for
  `kgSupersedeContentPatterns`, keeps the knob opt-in/default OFF, and avoids
  any runtime/default change.
- ✅ **P6** — DONE as `agent-operational-health`: `mem_project(action="health")`
  exposes compact semantic/job/coverage/recent-error health through the existing
  six-tool MCP surface, and missing legacy `observation_facts` drift is reported
  without crashing default KG-backed recall paths.
- ✅ **P4** — DONE as `token-savings-metrics`: retrieval evals now expose a
  canonical `token_savings_metrics` envelope, `mem_recall mode=context` reports
  additive returned-context metrics while preserving existing metadata tokens,
  and community-summary read-path safety remains default-off/no-fifth-lane.
- ⬜ **Community read-path rollout** — NEXT CANDIDATE: use P4's measurement
  envelope and existing safety gates to decide whether/how to broaden
  community-summary retrieval usage without token-cost regression.

---

## 11. Commit Ledger (program, newest first)

```
11b8ed4 docs(openspec): archive token savings metrics SDD
e43858e test(store): assert community summaries stay in kg lane
4fa7383 feat(recall): report returned context metrics
00e22b5 feat(evals): add token savings metrics envelope
0fed83c docs(openspec): archive agent operational health
e51633e feat(tools): add project health action
4f7bed9 docs(roadmap): record W2 caveat closure
d6d0dd4 docs(config): document content pattern supersession caveat
ca35c2a docs(roadmap): record stable identity and W1 progress
39e0d6a chore(openspec): archive include superseded HTTP history
3d82aad feat(http): expose superseded graph history opt-in
8dcd53e docs(openspec): archive stable memory identity bootstrap
d7ebb92 feat(identity): surface fallback metadata across APIs
ed8780e feat(store): add stable identity fallback metadata
6139fa5 Merge branch 'master' into full-graph
778d51f docs(governance): record C1 retention constitution patch
23957d6 feat(store): support supersession columns for kg_triples
c94a65a chore(openspec): archive community summaries LazyGraphRAG
722e3cc feat(retrieval): add community summaries LazyGraphRAG
9538bde fix(memory): clear stale maintenance consolidations safely
eb021e3 fix(memory): harden maintenance metadata idempotency
4b7ce07 chore(openspec): archive memory consolidation reflection decay
7595e90 feat(memory): add consolidation reflection and decay maintenance
47efb0f fix(graph): batch KG prune orphan dry-run counting
6986582 chore(openspec): archive kg-superseded-pruning
0771990 feat(graph): prune superseded KG history with keep-N retention
6fb20ad docs(openspec): add kg-superseded-pruning (C1) plan + improvement roadmap
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
