# Implementation Plan: Reliable embedding-lineage rebuild detection

## Technical context

`Store` initializes schema and semantic migrations before calling `enqueueRebuildOnConfigMismatch`. `runMigrationsWithSemantic` currently overwrites `semantic_index_state.embedding_config_hash` on every conflict, so startup can erase the prior hash before comparison. Readiness reconciliation then checks active jobs, failures, and vector counts but not `semantic_vector_rowids.embedding_hash`, allowing complete-count mixed-lineage vectors to appear ready. Rebuild job keys are unique and currently use `ON CONFLICT DO NOTHING`, which deduplicates active work but also prevents a completed or failed logical rebuild from being requested again.

The change remains internal to SQLite migration/state and semantic queue behavior. It does not change schema shapes, configuration resolution, MCP tools, CLI/HTTP contracts, embedding providers, or the contents of the user's real database during implementation.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design changes only internal store migration, semantic readiness, and job enqueue logic; the six-tool MCP registration is untouched.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Lineage-aware stale signaling prevents invalid semantic vectors from being treated as ready while preserving lexical and KG fallback behavior.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Detection is based on host-neutral SQLite lineage metadata and does not add harness-specific fields or semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall rendering, limits, scoring, and progressive expansion are outside the changed surfaces.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — No MCP, HTTP, CLI, taxonomy, or schema-shape contract changes are planned.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | On `semantic_index_state` conflict, migration will retain the stored `embedding_config_hash`; inserts for new lanes still use the active hash. Dimension and sqlite-vec readiness handling remain unchanged. | `src/store/migrations.ts`; `runMigrationsWithSemantic` | Focused migration test runs two semantic migrations with different hashes and asserts the existing lane hash remains available for later comparison. |
| FR-002 | Startup mismatch evaluation will inspect both lane metadata and per-vector `embedding_hash` for live chunk/sentence sources. Null or non-active vector lineage will trigger the same rebuild path as metadata mismatch. | `src/store/index.ts`; `enqueueRebuildOnConfigMismatch` | Persistent-database store test covers both ordinary hash change and already-clobbered lane metadata with old vector lineage. |
| FR-003 | `reconcileSemanticIndexState` will count live vectors with null or non-active lineage per lane and include that condition in pending/stale readiness calculations. | `src/store/index.ts`; semantic readiness query | Store test proves full source/vector counts with mixed lineage cannot produce `ready=true`. |
| FR-004 | `requestSemanticRebuild` will keep pending/running rows unchanged but reset matching done/failed rows to pending with retry/error timestamps cleared. Startup will not reactivate a terminal rebuild when the only remaining mismatch is per-vector lineage and semantic child work is already active for the current lane metadata hash. | `src/store/index.ts`; `requestSemanticRebuild`, `enqueueRebuildOnConfigMismatch` | Queue tests cover terminal reactivation, active dedupe, and no requeue churn while child jobs remain active. |

The startup sequence remains migration → recovery → mismatch detection → missing-coverage detection → reconciliation. Preserving the prior lane hash makes this order safe; vector-lineage inspection also repairs databases already affected by the old overwrite behavior. Once a mismatch is accepted, startup records the active hash on both lanes and marks them pending/stale. The existing rebuild worker remains responsible for recreating child jobs and updating each vector's `embedding_hash` as embeddings are replaced.

### Optional support artifacts

- `research.md`: Not needed; the root cause is reproduced from current code and the live read-only database evidence.
- `data-model.md`: Not needed; no table, column, constraint, or durable data-shape change is introduced.
- `contracts/`: Not needed; no public adapter or external interface changes.
- `quickstart.md`: Not needed; operational rebuild instructions remain separate until code verification and explicit authorization.

## Risks and migrations

- Preserving the stored lane hash could expose previously masked mismatches on upgrade. This is intended; tests will prove new databases initialize cleanly and existing equivalent hashes do not enqueue work.
- Per-vector lineage checks add bounded aggregate work during startup and state reconciliation. Queries will be lane-scoped and join indexed semantic source/observation keys so no vector payloads are read.
- Reactivating terminal rebuild rows can cause churn if another process starts while child work is active. The startup decision will distinguish metadata mismatch from vector-only mismatch and suppress terminal reactivation while active semantic child jobs already represent the current lineage transition.
- Null legacy vector hashes will cause one rebuild, after which the existing vector upsert records the active hash. No destructive schema migration is needed.
- Rollback is a source-code revert before the real rebuild. After an authorized rebuild, vector contents cannot be restored to the prior model without another explicit rebuild using the prior embedding configuration.
- The user's `C:\Users\EremesNG\.thoth\thoth.db` remains outside automated tests. Operational execution will require LM Studio model readiness, a uniquely evidenced code/runtime version, a bounded processing strategy, status checks, and explicit user authorization.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped files are limited to store/migration internals and tests; no tool registration or administrative surface is added.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — The design makes stale semantic lineage explicit and keeps semantic readiness false until active-lineage vectors converge, preserving deterministic fallback.
- **P3 — Harness-Agnostic Memory Contract**: PASS — All decisions operate on existing provider-neutral hashes and shared SQLite jobs with no host coupling or destructive schema change.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No retrieval output, ranking, budget, or compact/context/get behavior is modified.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Requirement mapping confirms unchanged MCP, CLI, HTTP, configuration, taxonomy, and schema shapes.
