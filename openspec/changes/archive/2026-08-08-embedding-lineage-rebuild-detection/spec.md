# Feature Specification: Reliable embedding-lineage rebuild detection

**Change ID**: `embedding-lineage-rebuild-detection`<br>
**Route**: Accelerated<br>
**Status**: Implemented

## Intent and scope

**Why**: Changing an embedding model or preprocessing lineage must never leave old vectors reported as fresh. The current startup order can overwrite persisted lineage metadata before comparison, suppress the automatic rebuild, and make a mixed-lineage index appear healthy.<br>
**Impact**: Store startup and semantic-state reconciliation will preserve enough prior lineage evidence to detect configuration changes, recover databases whose lane metadata was already overwritten while vectors remain old, and enqueue rebuild work without duplicating active jobs.<br>
**Affected capabilities**: `indexing`, `store`

## User stories

### US1 - Automatic rebuild after an embedding change (Priority: P1)

As an operator, I can change the effective embedding model or preprocessing configuration and have the next store initialization invalidate the prior semantic index so that retrieval never treats vectors from the old lineage as fresh.

**Independent test**: Build semantic state with one embedding hash, reopen the same database with a different active hash, and assert that one rebuild job is active while both semantic lanes are pending and stale.

**Covers**: FR-001, FR-002, FR-004, SC-001, SC-004

**Acceptance scenarios**:

1. **Given** persisted semantic lane metadata and vectors use embedding hash A, **When** the store initializes with active embedding hash B, **Then** an idempotent rebuild is enqueued and both lanes are marked pending and stale under hash B.
2. **Given** a rebuild for hash B is already pending or running, **When** another store instance evaluates the same mismatch, **Then** no duplicate active rebuild is created.

### US2 - Recovery from falsely healthy mixed lineage (Priority: P1)

As an operator, I can reopen a database whose lane metadata already claims the current hash while stored vectors still carry an older hash so that the system repairs the previously masked mismatch automatically.

**Independent test**: Seed lane metadata with active hash B and vector-row lineage with hash A, initialize the store with hash B, and assert that semantic readiness is false and rebuild work is enqueued.

**Covers**: FR-002, FR-003, FR-004, SC-002, SC-003, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** semantic lane metadata equals active hash B but at least one live vector row has hash A or no embedding hash, **When** startup lineage evaluation runs, **Then** the affected semantic index is marked stale and rebuild work is enqueued.
2. **Given** vector counts equal their source counts but one or more live vectors have a non-active hash, **When** readiness is reconciled, **Then** the affected lane is not reported ready.

### US3 - Repeatable rebuild requests (Priority: P2)

As an operator, I can request the same logical rebuild again after its prior job reached a terminal state so that idempotent deduplication does not permanently suppress necessary future work.

**Independent test**: Complete a rebuild job, request the same dedupe key again, and assert that the existing terminal row becomes pending while repeated requests during pending or running state remain a single active job.

**Covers**: FR-004, SC-003

**Acceptance scenarios**:

1. **Given** a rebuild job with a matching dedupe key is done or failed, **When** the same rebuild is required again, **Then** the existing row is reset to pending without creating another row.
2. **Given** a rebuild job with a matching dedupe key is pending or running, **When** the same rebuild is requested again, **Then** its active execution state is preserved and no duplicate row is created.

## Edge cases

- Existing semantic lane rows have a null hash from an earlier schema version.
- Only one lane contains old-lineage vectors.
- No vectors exist yet, so a fresh database must not enqueue a configuration-mismatch rebuild solely because it has no vector lineage.
- A configuration cycles from hash A to B and later back to A after the earlier A rebuild job is already done.
- A rebuild job has queued child chunk or sentence jobs when another process performs startup evaluation.
- Vector counts are complete while lineage hashes are mixed.
- Embedding dimensions change and vector tables are recreated during the same startup.

## Functional requirements

- **FR-001 — Preserve prior lineage through migration**: `[INTERNAL]` Semantic schema migration MUST preserve the previously persisted embedding configuration hash on existing lane rows until startup staleness evaluation has compared it with the active hash; newly created lane rows MAY initialize directly with the active hash.
- **FR-002 — Evaluate metadata and vector lineage**: `[INTERNAL]` Startup staleness evaluation MUST treat either a semantic lane metadata hash mismatch or any live semantic vector whose embedding hash is null or differs from the active hash as an embedding-lineage mismatch.
- **FR-003 — Lineage-aware readiness**: `[INTERNAL]` Semantic-state reconciliation MUST NOT report a lane ready while any live vector in that lane has a null or non-active embedding hash, even when source and vector counts match.
- **FR-004 — Idempotent but repeatable rebuild enqueue**: `[INTERNAL]` Rebuild enqueue MUST maintain at most one row per dedupe key, preserve pending or running work, and reactivate a matching done or failed row when the same rebuild is required again; startup MUST avoid reactivating a completed rebuild solely because child semantic jobs for the same active lineage are already pending or running.

## Success criteria

- **SC-001** `[buildable]`: An automated persistent-database regression test changes the active embedding hash across store initialization and observes exactly 1 active rebuild plus pending and stale chunk/sentence lanes.
- **SC-002** `[buildable]`: At least one automated regression test reproduces lane metadata at the active hash with old or null vector hashes and proves startup enqueues repair work and readiness remains false.
- **SC-003** `[buildable]`: All automated queue tests prove terminal rebuild rows are reactivated, pending/running rows are not duplicated or reset, and active child semantic work prevents startup requeue churn for an otherwise matching active lineage.
- **SC-004** `[buildable]`: Focused store and migration tests, the TypeScript build, and the full Vitest suite pass without changing public MCP, CLI, HTTP, configuration, or database schema shapes.
- **SC-005** `[outcome]`: After the verified code is installed and an explicitly authorized rebuild is processed against `C:\Users\EremesNG\.thoth\thoth.db`, every live chunk and sentence vector records the active EmbeddingGemma lineage hash and both lanes report ready with no active or failed semantic jobs.

## Assumptions

- `semantic_vector_rowids.embedding_hash` is the authoritative per-vector embedding lineage and should equal the active embedding configuration hash for every live vector.
- Existing rebuild processing remains responsible for replacing vector embeddings and their lineage hashes; this change repairs detection, queue semantics, and readiness truthfulness rather than changing embedding generation.
- A rebuild of the user's real database is a separate stateful operation requiring explicit authorization after implementation verification.

## Dependencies

- Existing semantic metadata tables, rebuild worker, sqlite-vec integration, and embedding configuration hash resolution.
- LM Studio must expose `text-embedding-embeddinggemma-300m` before the real rebuild is processed.

## Out of scope

- Changing the selected embedding model, dimensions, preprocessing profile, or LM Studio endpoint.
- Redesigning semantic job scheduling, worker concurrency, chunking, sentence splitting, or KG extraction.
- Automatically executing the rebuild against the user's real database as part of code tests or archive.
- Adding a filesystem watcher for live `config.json` reload inside already initialized stores.
