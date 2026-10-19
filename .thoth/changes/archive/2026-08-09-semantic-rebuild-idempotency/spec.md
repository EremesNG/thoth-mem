# Feature Specification: Idempotent semantic rebuild detection

**Change ID**: `semantic-rebuild-idempotency`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Operators must be able to inspect semantic-index status and restart an MCP client without repeatedly spending embedding, LLM, CPU, or GPU resources when neither the effective embedding configuration nor the indexed content changed.<br>
**Impact**: `rebuild-index --status` becomes strictly read-only, clean MCP/store restarts remain stable after a completed rebuild, and genuine semantic lineage or coverage mismatches continue to self-heal through one deduplicated rebuild.<br>
**Affected capabilities**: `tools`, `indexing`

## User stories

### US1 - Inspect rebuild status without mutation (Priority: P1)

As an operator, I can inspect semantic rebuild progress without changing durable index state so that diagnostics cannot trigger the work they are meant to observe.

**Independent test**: Prepare a completed semantic index, snapshot its jobs and index-state rows, run the status-only CLI path, and prove that the report is returned while the durable snapshot remains identical.

**Covers**: FR-001, SC-001

**Acceptance scenarios**:

1. **Given** a completed semantic index with unchanged effective embedding configuration, **When** the operator runs `rebuild-index --status`, **Then** progress is reported without inserting, reactivating, retrying, or updating semantic jobs or semantic index state.
2. **Given** semantic work already pending or failed, **When** the operator runs `rebuild-index --status`, **Then** the existing state is reported without recovery or queue mutation.
3. **Given** an operator explicitly requests a semantic rebuild, **When** the CLI rebuild command runs without `--status`, **Then** the rebuild is initiated with observable status and remains outside the compact MCP tool surface.

### US2 - Restart the MCP without another rebuild (Priority: P1)

As an MCP consumer, I can reconnect to an already-complete index without starting the same rebuild again so that ordinary client restarts are inexpensive and predictable.

**Independent test**: Complete semantic indexing in a disposable database, reopen it twice with the same effective configuration, and prove that both semantic lanes remain ready with no active rebuild job.

**Covers**: FR-002, FR-003, FR-005, SC-002, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** all active observations have reached a valid terminal semantic representation and the effective embedding configuration is unchanged, **When** the store or MCP starts repeatedly, **Then** no semantic rebuild is requested and ready lanes remain ready.
2. **Given** the same LM Studio embedding settings are materialized repeatedly, including `device: "auto"`, **When** configuration lineage is compared, **Then** the rebuild identity remains stable because execution-device selection is not index lineage.

### US3 - Preserve automatic repair for real mismatches (Priority: P1)

As an operator, I retain automatic semantic-index repair when stored lineage or valid coverage truly disagrees with the effective embedding configuration.

**Independent test**: Seed a genuine lineage mismatch or incomplete valid coverage, reopen the store repeatedly, and prove that exactly one active rebuild request exists until it is processed.

**Covers**: FR-002, FR-004, SC-003

**Acceptance scenarios**:

1. **Given** a stored embedding lineage hash that differs from the current effective configuration, **When** the MCP starts, **Then** exactly one deduplicated semantic rebuild is requested.
2. **Given** an active observation that should produce semantic units but lacks valid coverage, **When** the MCP starts, **Then** exactly one deduplicated semantic rebuild is requested.

## Edge cases

- A completed observation may legitimately produce zero chunks or sentences after normalization or splitting; this terminal outcome must not be mistaken indefinitely for unprocessed work.
- Active, failed, retryable, and stale semantic jobs must remain observable through status without being recovered by the status-only command.
- Terminal rebuild rows must not be repeatedly reactivated by concurrent or repeated store openings.
- Missing, null, or outdated vector embedding lineage remains a genuine repair condition when a semantic unit exists.
- Environment overrides that alter the effective embedding provider, model, endpoint, dimensions, profile, or normalization are real configuration changes and may require a rebuild.
- Degraded `sqlite-vec` availability must not fabricate successful vector coverage.

## Functional requirements

- **FR-001 — Manual Rebuild Surface MUST Remain CLI-Controlled**: `[MODIFIED tools]` The system MUST keep manual `thoth-mem rebuild-index` control for semantic/KG reindexing on the CLI rather than the compact MCP tool surface, and `rebuild-index --status` MUST report persisted semantic progress without running startup recovery, reconciliation, coverage repair, or any other database mutation.
- **FR-002 — Jobs MUST Be Idempotent and Retryable**: `[MODIFIED indexing]` Indexing and rebuild jobs MUST remain restart-safe and converge without duplicate side effects: repeated store or MCP initialization with unchanged effective embedding configuration and valid terminal coverage, including normalized content that legitimately produces zero semantic units, MUST NOT enqueue, reactivate, or retry a rebuild; a genuine lineage mismatch or missing required nonblank coverage MUST request exactly one active rebuild across repeated or concurrent initialization.
- **FR-003 — Convergent semantic completion**: `[INTERNAL]` After all work spawned by a semantic rebuild reaches a valid terminal result, persisted semantic coverage and lineage MUST be sufficient for the next initialization to recognize the index as complete.
- **FR-004 — Deduplicated genuine repair**: `[INTERNAL]` A genuine effective-configuration lineage mismatch or missing required semantic coverage MUST continue to request exactly one active semantic rebuild across repeated or concurrent initialization.
- **FR-005 — Stable rebuild identity**: `[INTERNAL]` Repeated materialization of the same effective embedding settings MUST produce a stable semantic configuration hash, and execution-only device selection MUST remain excluded from that hash.

## Success criteria

- **SC-001** `[buildable]`: A status-only CLI regression test demonstrates zero inserted, deleted, or updated semantic job and index-state rows after the command.
- **SC-002** `[buildable]`: A completed-index regression test performs at least two consecutive clean store reopenings and observes zero active `rebuild_semantic` jobs with semantic lanes still ready.
- **SC-003** `[buildable]`: Mismatch tests demonstrate exactly 1 active rebuild request after repeated initialization while preserving automatic repair.
- **SC-004** `[buildable]`: Three materializations of the supplied LM Studio embedding configuration in a disposable fixture produce one identical semantic configuration hash, and changing only `device` produces zero hash changes.
- **SC-005** `[outcome]`: After upgrading, 100% of three consecutive real MCP restarts or status inspections following a completed rebuild create zero new rebuilds, provided content and effective embedding lineage remain unchanged.

## Assumptions

- The user-provided configuration represents the intended effective configuration; tests may use its embedding fields with mocked providers and disposable databases rather than contacting LM Studio.
- Existing semantic rebuild self-healing is desired and must be narrowed only where it causes false positives or status mutations.
- `device` affects local ONNX execution only and is not part of semantic vector lineage.

## Dependencies

- Existing semantic job, vector lineage, configuration hashing, CLI reporting, and store initialization contracts.

## Out of scope

- Mutating or rebuilding the user's real database during diagnosis or verification.
- Changing embedding providers, models, dimensions, normalization, or LM Studio behavior.
- Addressing the LM Studio GGUF tokenizer `SEP` warning.
- Removing automatic rebuilds for genuine semantic configuration or coverage mismatches.
- Adding a persistence schema migration unless the demonstrated root cause requires durable terminal-coverage metadata.
