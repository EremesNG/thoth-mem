# Proposal: Memory Consolidation, Reflection, and Decay

## Intent

Improve thoth-mem's long-running memory quality by adding an intra-memory
maintenance lifecycle for saved observations and derived facts. The system should
reduce duplicate or near-duplicate memories, periodically synthesize durable
learnings from related memories, and lower the retrieval influence of stale or
low-value memories without breaking the compact MCP surface or the existing
knowledge-graph lifecycle.

Today, memory quality depends mostly on write-time deduplication, topic-key
upserts, KG supersession, and bounded pruning of superseded KG triples. Those
mechanisms protect individual writes and graph history, but they do not actively
consolidate semantically overlapping observations, produce reflective summaries,
or decay low-signal content across time. As stores grow, repeated decisions,
temporary findings, and obsolete exploratory notes can crowd high-value durable
knowledge, increasing token cost and recall noise.

Material behavior changes:

| From | To | Reason | Impact |
| --- | --- | --- | --- |
| Duplicate and near-duplicate observations may coexist indefinitely unless a caller uses the same topic key. | A maintenance pass identifies merge candidates and records a deterministic consolidation outcome. | Topic-key upsert handles exact ownership paths, not broad semantic overlap. | Recall and project context become less repetitive while provenance remains auditable. |
| Durable learnings are saved only when an agent or user explicitly writes them. | A reflection pass can synthesize durable learnings from clusters or sequences of related memories. | High-value patterns often emerge across several observations rather than in one write. | Agents can recall compact, higher-signal summaries without rereading every source. |
| Retrieval mostly treats old low-value memories as available unless they are superseded or pruned at the KG-triple level. | Decay metadata down-weights or otherwise de-emphasizes low-value memories according to explicit policy. | Stores need bounded attention, not just bounded output length. | Low-signal memories remain recoverable unless a later spec chooses archival/prune semantics. |

## Scope

### In Scope

- Intra-memory consolidation for duplicate and near-duplicate observations and
  facts within thoth-mem's own SQLite store.
- Reflection over existing prompts, observations, session summaries, topic keys,
  projects, and KG evidence to synthesize durable learning observations or
  summary-like memory records.
- Decay of low-value or stale memories so retrieval, project context, and graph
  views favor current, durable, high-signal knowledge.
- Deterministic-first behavior with safe degradation when embeddings, sqlite-vec,
  or optional LLM components are unavailable.
- Preservation of provenance: consolidated and reflected memories must remain
  traceable to their source observations/facts.
- Compatibility with shipped B1/B2/B3/C1 graph contracts: `kg_triples` remains
  the graph-derived fact source; superseded KG facts stay governed by B3/C1;
  retrieval continues to degrade by lane.
- Operator/admin surfaces for running or inspecting maintenance, following the
  existing CLI + HTTP pattern for `rebuild-graph` and `prune-graph` when a manual
  trigger is needed.
- Focused evals and tests proving reduced duplicate recall, preserved source
  reachability, no retrieval regression for existing fixtures, and unchanged
  compact MCP registry unless a later spec explicitly modifies behavior inside
  an existing tool.

### Deferred / Needs Discovery

- Reflection trigger shape: decide whether reflection runs as a scheduled/job
  processor, a CLI/HTTP admin operation, both, or an explicitly invoked store
  method reused by multiple surfaces.
- Decay semantics: decide whether decay is purely a retrieval down-weight,
  archival/soft-delete state, hard pruning of selected memory records, or a
  staged combination. The default should be conservative until source
  recoverability is specified.
- Schema and config needs: determine the minimal additive schema for
  consolidation links, reflection provenance, decay score/state, timestamps,
  and operator controls; determine exact config names, defaults, env overrides,
  and persisted-config schema updates.
- Export/import behavior: decide whether consolidation/reflection/decay metadata
  remains fully derivable and internal-only like KG maintenance state, or whether
  some metadata must enter the portable export format with a version bump.
- Near-duplicate detection thresholds: determine how to combine exact hashing,
  topic-key/title similarity, embeddings, lexical overlap, KG overlap, and source
  chronology without merging distinct decisions.
- Reflection output shape: decide whether synthesized learnings are stored as
  ordinary observations, session summaries, a new internal record type, or a
  metadata layer over existing records.
- User/operator review controls: decide whether consolidation and decay can be
  applied automatically or require dry-run/review for destructive or visibility
  changing actions.
- Interaction with B3/C1 history: specify how observation-level decay relates to
  superseded KG triples retained or pruned per C1.

### Out of Scope

- C3 community summaries, graph clustering, Leiden, LazyGraphRAG, or hierarchical
  community-level summaries.
- Cross-harness parity work for Claude Code, Codex hooks, OpenCode plugin parity,
  or deterministic memory hooks outside this repository.
- Moving `MemoryIntegrationCore` into thoth-mem or changing harness integration
  architecture.
- Replacing the compact six-tool MCP surface with granular maintenance tools.
- Reversing B1/B2/B3/C1 graph decisions, reintroducing `observation_facts`, or
  changing the `kg_triples` single-source graph contract.
- Editing archived C1 artifacts or baseline specs during the proposal phase.

## Approach

Define C2 as a maintenance lifecycle layered on top of the current store,
retrieval, and KG architecture:

1. Consolidation identifies exact and near-duplicate memory candidates using
   deterministic signals first, then semantic/KG signals when available. The
   outcome should preserve source rows and provenance by default, using
   supersede-like or alias-like metadata rather than silent deletion.
2. Reflection groups related high-signal memories and produces compact durable
   learnings. Reflection should be idempotent, source-linked, and safe to rerun;
   it must not require remote services for the baseline path.
3. Decay assigns low-value, stale, or redundant memories lower influence in
   recall/context ranking. Any archival, soft-delete, or prune behavior must be
   explicitly specified with rollback and export/import implications.
4. Maintenance entry points should reuse existing store-centric patterns and
   established admin boundaries. If an operator-triggered surface is needed, it
   should mirror `rebuild-graph`/`prune-graph` as CLI + HTTP, not MCP.
5. Retrieval and rendering should consume consolidation/reflection/decay metadata
   conservatively: current high-signal memories rank higher, duplicate source
   noise is reduced, and history remains reachable through `mem_get` or explicit
   history-inclusive paths.
6. Verification should include focused store tests, retrieval ranking tests,
   export/import assertions, no-regression evals, and compact MCP registry checks.

## Affected Areas

- `src/store/`: schema/migrations, observation persistence, retrieval reads,
  export/import behavior, stats, maintenance methods, and provenance queries.
- `src/indexing/`: possible reuse of deterministic KG evidence, embeddings,
  background job infrastructure, and idempotent maintenance jobs.
- `src/retrieval/`: ranking/fusion changes for duplicate suppression,
  reflection promotion, and decay down-weighting.
- `src/tools/`: behavior inside existing MCP tools may need to reflect
  consolidation/decay, while the registered tool set should remain unchanged.
- `src/cli.ts`, `src/http-routes.ts`, `src/http-server.ts`, and
  `src/http-openapi.ts`: likely admin operation surfaces if manual dry-run/apply
  or reflection triggers are adopted.
- `src/config.ts` and `config.schema.json`: likely additive configuration for
  maintenance enablement, thresholds, decay policy, dry-run defaults, and trigger
  controls.
- `src/sync/` and store export/import tests: behavior depends on the deferred
  export/import decision.
- `src/evals/retrieval.ts`: no-regression and quality cases for duplicate
  suppression, reflection usefulness, and current-fact preservation.
- `openspec/specs/`: likely deltas for store, knowledge-graph, indexing,
  retrieval, config, tools, evals, and possibly visualization-api/dashboard if
  maintenance state becomes visible there.

## Risks

- False-positive consolidation could hide or down-rank distinct decisions that
  merely look similar.
- Reflection could synthesize overbroad or stale learnings if source selection is
  weak or chronology is ignored.
- Decay can silently reduce recall of rare but important memories unless the
  policy is measurable, explainable, and reversible.
- Automatic maintenance may add write-path or startup cost if not scoped,
  scheduled, or bounded carefully.
- Export/import handling can become inconsistent if metadata is partly derivable
  and partly persisted without a clear versioning rule.
- Optional semantic/LLM paths may diverge from deterministic behavior unless
  degradation and idempotency are specified first.
- Any delete/archive semantics would create tension with the constitution's
  supersede-not-delete principle and must be justified with bounded-retention or
  recoverability language.

## Rollback Plan

- Gate automatic consolidation, reflection, and decay behind additive config
  flags with conservative defaults chosen during spec/clarify.
- Keep manual/dry-run maintenance available where practical so operators can
  inspect candidate merges, reflected outputs, and decay effects before applying
  them.
- Prefer additive schema and reversible metadata states. Disabling the feature
  should make retrieval behave like the post-C1 baseline without requiring a
  destructive migration.
- If reflected memories are stored as ordinary observations, mark them with
  explicit provenance/type/topic metadata so they can be filtered, soft-deleted,
  or regenerated from sources.
- If decay is implemented as ranking metadata, rollback is config-only: ignore
  decay fields in retrieval and context assembly.
- If archival or pruning is later selected, require a rebuild/regeneration story
  and export/import decision before implementation.

## Success Criteria

- Duplicate or near-duplicate memory clusters are identified deterministically
  enough for repeatable tests and dry-run inspection.
- Consolidation reduces duplicate evidence in recall/context output while source
  observations remain reachable and auditable.
- Reflection produces source-linked durable learnings that improve compact recall
  quality without requiring agents to reread every source observation.
- Decay lowers the influence of low-value or stale memories without regressing
  existing retrieval eval fixtures or hiding current high-signal facts.
- Existing B1/B2/B3/C1 behavior remains intact: `kg_triples` is still the graph
  source, supersession/pruning contracts still hold, retrieval still degrades by
  lane, and the compact six-tool MCP registry remains unchanged.
- Export/import behavior is explicitly specified and covered by tests.
- The implementation can be disabled through configuration and verified to match
  the post-C1 baseline for retrieval/tool behavior when disabled.
