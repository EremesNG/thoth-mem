# Proposal: Fix Hybrid Retrieval Architecture

## Intent
Correct architecture-level defects in hybrid retrieval so fused ranking, provenance, and observability are trustworthy under updates, partial failures, and eventual indexing windows, while keeping legacy `/graph` and graph-lite compatibility and making the SQLite knowledge graph the canonical product story.

## Scope
### In Scope
- Fix stale semantic artifacts after updates by enforcing source-version-aware invalidation/reindex across chunk text, sentence splits, and vec rows so retrieval cannot serve outdated semantic evidence.
- Fix stale or wrong-source KG triples by enforcing source lineage, deterministic upsert keys, and tombstone/replace behavior on content updates and retries.
- Define and enforce a canonical fusion/ranking lane policy for sentence-semantic, chunk-semantic, lexical, and KG evidence, including lane eligibility, lane weights/defaults, de-duplication, and provenance-first tie-breaking.
- Fix observatory recall lane reporting so vector and KG lanes are never reported as present when evidence is absent, stale, or downgraded; expose explicit lane state (`ready`, `pending`, `degraded`, `unavailable`) with reasons.
- Reconcile graph-lite (`observation_facts`) and SQLite KG overlap by clarifying canonical naming, source-of-truth boundaries, and fallback behavior without breaking `/graph` contracts.
- Fix non-atomic background job claiming so index/KG workers claim work exactly-once-at-a-time under concurrency and restart conditions, with idempotent retries and no duplicate side effects.
- Strengthen hybrid retrieval eval gates to block regressions in lane correctness, stale-data prevention, provenance accuracy, degraded/pending signaling, and graph-lite/KG contract compatibility.
- Preserve backward-compatible behavior where practical for `/graph`, existing tool response shapes, and legacy graph-lite consumers.

### Out of Scope
- Replacing SQLite with an external graph or vector backend.
- Dashboard redesign or non-retrieval product UX changes.
- Breaking MCP surface changes that require immediate client rewrites.
- Broad unrelated refactors outside retrieval/indexing/KG/store/tools/evals boundaries.

## Approach
1. Establish explicit freshness and lineage invariants for semantic and KG artifacts tied to source revision identity.
2. Update indexing and KG pipelines to enforce atomic claim semantics and deterministic converge-on-retry behavior.
3. Standardize lane policy and lane-state signaling so retrieval output and observatory surfaces expose truthful evidence availability.
4. Define graph-lite vs KG canonical story: SQLite KG is primary; graph-lite remains compatible fallback/source and `/graph` remains stable where possible.
5. Add compatibility shims and migration-safe naming where overlap exists.
6. Expand eval harness and CI gates to validate architecture invariants, not only happy-path relevance metrics.

## Affected Areas
- `openspec/specs/retrieval/spec.md` and related implementation paths for lane policy, freshness checks, and truthful lane-state signaling.
- `openspec/specs/indexing/spec.md` and store/indexing workers for invalidation, background claim atomicity, and retry convergence.
- `openspec/specs/knowledge-graph/spec.md` for KG canonicalization, provenance, and update-safe triple lifecycle.
- `openspec/specs/store/spec.md` for schema/metadata invariants supporting semantic+KG source revision tracking.
- `openspec/specs/tools/spec.md` for backward-compatible tool semantics while exposing accurate lane health/status.
- `openspec/specs/evals/spec.md` for stronger quality gates tied to stale data, provenance, compatibility, and degraded-state behavior.
- `openspec/specs/visualization-api/spec.md` and `openspec/specs/dashboard/spec.md` for observatory contract alignment on lane attribution and health semantics.

## Risks
- Tightening freshness checks can temporarily reduce recall until reindexing converges.
- Stricter lane-truth signaling may surface latent data-quality issues previously hidden by optimistic reporting.
- Atomic claim changes can impact throughput if lock/claim policy is mis-tuned.
- Backward compatibility pressure may constrain cleaner naming in graph-lite/KG boundaries.

## Rollback Plan
1. Keep compatibility fallbacks active: lexical plus graph-lite retrieval remains available if semantic/KG freshness gates are temporarily over-restrictive.
2. Guard new lane-policy strictness and claim strategy behind reversible config flags where needed during rollout.
3. If regressions are detected, revert to prior fusion ordering while retaining provenance/freshness telemetry to isolate failures.
4. Preserve schema/data migrations as additive/idempotent so rollback avoids data loss and allows forward re-apply.

## Success Criteria
- Updated content never returns stale sentence/chunk/vector evidence after declared reindex completion.
- KG triples are source-correct after updates/retries and no wrong-source facts survive reconciliation.
- Fused ranking uses one documented lane policy with deterministic behavior and explicit lane eligibility.
- Observatory recall never reports synthetic/fake vector or KG lane evidence; lane state is accurate and explainable.
- Graph-lite and KG naming/scope are unambiguous: SQLite KG is canonical, `/graph` and legacy contracts remain compatible where possible.
- Background indexing claim/lease behavior is concurrency-safe and idempotent across restarts.
- Eval gates fail on stale-data regressions, provenance mismatches, lane-truth violations, and compatibility breaks.
