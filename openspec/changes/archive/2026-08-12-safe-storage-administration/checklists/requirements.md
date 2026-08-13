# Requirements checklist: Safe Storage Administration

**Activation reason**: Database compaction mutates the only durable SQLite file, coordinates WAL state and concurrent locks, may consume substantial temporary disk space, and must not weaken existing stale-preview safeguards while simplifying the CLI.

## Initial validation

- [x] CHK001 [Completeness] The operator actor, repair preview/apply, retention preview/single-batch/complete-loop, compaction preview/apply/no-op, custom data directory, and separate live-data authorization are all present in US1-US3 and FR-001-FR-006.
- [x] CHK002 [Completeness] Missing target, read-only filesystem, insufficient capacity, busy checkpoint, busy `VACUUM`, integrity failure, foreign-key failure, concurrent candidate drift, partial binding input, no progress, and bounded-growth failure are explicitly covered by scenarios or edge cases.
- [x] CHK003 [Clarity] “No longer required” means absent CLI bindings are derived from one internal preview; it does not mean Store/HTTP bindings are removed or that explicitly supplied CLI values are ignored.
- [x] CHK004 [Clarity] “Crash-safe compaction” is concretely defined as SQLite-managed transactional `VACUUM`, no application file replacement, no raw sidecar operations, pre-commit preservation through no mutation or SQLite recovery, and post-commit no-success reporting without a rollback claim.
- [x] CHK005 [Consistency] US1 and FR-001 preserve preview default, exact scope, one internal binding, and no stale retry; SC-001 measures the same behaviors.
- [x] CHK006 [Consistency] US2 and FR-002 preserve one fixed effective instant, fresh later fingerprints, bounded progress, and truthful partial completion; SC-002 measures the same behaviors.
- [x] CHK007 [Consistency] US3 and FR-003-FR-005 use ordinary SQLite-managed `VACUUM` everywhere; staging, backup, rename, replacement, and raw sidecar deletion are explicitly out of scope.
- [x] CHK008 [Measurability] SC-001-SC-006 are buildable checks with observable inputs, failure boundaries, exact counts/metrics, disposable files, and named regression gates.
- [x] CHK009 [Measurability] SC-007 is correctly marked as an operator outcome requiring separate authorization and is not used to justify an implementation task against live data.
- [x] CHK010 [Coverage] US1 maps to FR-001/SC-001, US2 maps to FR-002/SC-002, and US3 maps to FR-003-FR-006/SC-003-SC-007; every FR and buildable SC has at least one story and verification seam.

## Domain lenses

- [x] CHK011 [Storage safety] Preview forbids config/database/directory/sidecar creation and durable database/WAL mutation through immutable no-sidecar access, paired-sidecar read-only access, and partial-sidecar rejection; paired access permits only volatile SQLite SHM read-mark changes while preserving SHM identity/size; apply forbids raw copy/rename/delete and leaves checkpoint, lock, rebuild, commit, and recovery to SQLite APIs.
- [x] CHK012 [Concurrency] Store apply remains the repair/retention race boundary, stale first apply is never retried, later retention batches are fresh intentional previews, and compaction treats busy checkpoint/lock as non-zero failure.
- [x] CHK013 [Capacity/performance] Requirements expose physical/logical/WAL/SHM/page/freelist/free-space metrics, require twice the greater of physical and logical database bytes before checkpoint and again after refreshed checkpoint metrics, bound output, and acknowledge validation cost.
- [x] CHK014 [Compatibility] Existing CLI binding flags remain optional and effective, partial retention pairs fail, and Store/HTTP/OpenAPI contracts remain explicit and unchanged.
- [x] CHK015 [Privacy] Compaction output contains only paths, byte/page counts, checkpoint counters, and validation flags; no prompts, observations, trace payloads, SQL rows, or unbounded diagnostics are exposed.
- [x] CHK016 [Operational authorization] FR-006 and the out-of-scope section prohibit any implementation or automated verification against the operator's live data directory.
- [x] CHK017 [Coverage] FR-004 is measured by compact CLI grammar/dispatch/output tests, SC-004 by successful disposable shrinkage and identity checks, and SC-005 by every named failure-injection boundary with no false success.

## Revalidation

- [x] CHK018 [Consistency] After Oracle rejection, US3, FR-003, SC-005, plan, tasks, and CLI contract now distinguish pre-commit preservation from post-commit validation failure and make no impossible rollback claim.
- [x] CHK019 [Capacity/performance] After Oracle rejection, FR-003/FR-005, SC-003/SC-005, metrics, plan, and tasks use the greater of physical/logical bytes and mandate a second capacity check after checkpoint, including an uncheckpointed-WAL test.
- [x] CHK020 [Storage safety] After Oracle rejection, FR-003/SC-003, research, model, plan, and tasks define immutable no-sidecar preview, normal read-only only for a readable WAL/SHM pair, and failure for partial or ambiguous sidecars.
- [x] CHK021 [Buildability] After the second Oracle rejection, FR-003/SC-003, research, model, CLI contract, plan, and tasks define the installed driver's one-time `SQLITE_USE_URI=1` initialization boundary, exact resolved-target proof, a fresh-process test, and fail-closed behavior after incompatible prior initialization.
- [x] CHK022 [Storage safety] Implementation evidence refined the paired-sidecar requirement consistently: database/WAL content and SHM identity/size remain stable, while only non-durable SQLite SHM read-mark bytes may vary during normal read-only WAL access.
- [x] CHK023 [Scope] User clarification confirms compact apply is independent and never invokes or requires trace pruning or journal repair; the three CLI workflows remain separate while repair/retention keep their approved binding simplification.
