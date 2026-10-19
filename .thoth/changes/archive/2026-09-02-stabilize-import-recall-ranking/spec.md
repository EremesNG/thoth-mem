# Feature Specification: Stabilize Import Recall Ranking

**Change ID**: `stabilize-import-recall-ranking`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Importing the valuable legacy corpus must not make unchanged current memories move or disappear from their established recall results merely because FTS corpus statistics changed.<br>
**Impact**: Normal lexical recall will preserve the exact pre-import Top-K sequence for pre-existing eligible memories while admitting relevant imported memories through separately ranked, monotonically sequenced legacy cohorts when protected capacity remains. Revision 9 adds only immutable cohort order to the import audit boundary; the public response shape, exact six-tool MCP surface, budgets, privacy rules, and explicit cutover authorization boundary remain unchanged.<br>
**Affected capabilities**: `retrieval`, `store`

## User stories

### US1 - Preserve established recall across a legacy corpus extension (Priority: P1)

As an operator importing prior memories, I can add the legacy corpus without changing the Top-K IDs or order returned from the unchanged current corpus for the same project, query, mode, history flag, limit, and budget.

**Independent test**: Run identical recall probes before and after adding a large deterministic imported cohort whose terms reproduce BM25 corpus-statistic drift, then compare the complete ordered pre-existing Top-K sequence.

**Covers**: FR-001, FR-002, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** an unchanged current project and a deterministic set of recall probes, **When** thousands of matching imported memories are added, **Then** every pre-import Top-K memory ID remains present in the same position and order for each identical probe.
2. **Given** equal-ranked pre-existing candidates, **When** an imported cohort changes term and document frequencies, **Then** the declared pre-existing tie rules remain deterministic and corpus extension cannot invert the candidates.
3. **Given** exact memory-ID or topic-key lookup, **When** imported lexical rows also match the input, **Then** exact authoritative matches remain first and the caller limit is unchanged.

### US2 - Keep imported history genuinely retrievable (Priority: P1)

As an agent, I can still retrieve imported memories by their distinctive title, content, or topic so that ranking stability does not turn quarantine recovery into inaccessible storage.

**Independent test**: Query current and historical imported heads/revisions in mapped and isolated projects after the stable cohort merge and verify their order, provenance, and lineage through public recall/get seams.

**Covers**: FR-002, FR-003, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** imported current memories whose queries have fewer pre-existing matches than the caller limit, **When** normal recall runs, **Then** deterministic imported results fill the remaining positions without displacing the established pre-existing Top-K sequence.
2. **Given** a distinctive imported title or content phrase and fewer older-cohort matches than the caller limit, **When** recall runs, **Then** the corresponding imported memory fills protected capacity; exact imported ID/topic lookup remains guaranteed and retains structured precedence regardless of lexical capacity.
3. **Given** imported superseded or historical lineage, **When** recall runs with history enabled and the selected memory is expanded, **Then** the expected revisions remain searchable and linked without entering current-only recall.

### US3 - Prove stability before authorizing cutover (Priority: P2)

As the operator, I receive repeatable evidence that the fix preserves retrieval quality, latency bounds, database integrity, and the real rehearsal baseline before any production database is replaced.

**Independent test**: Pass disposable corpus-scale regression, migration/rebuild checks, existing retrieval benchmarks, and a separately authorized isolated-copy rehearsal with exact pre/post recall comparison.

**Covers**: FR-004, FR-005, SC-004, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** a revision-8 database, a clean revision-9 database, or a rebuilt lexical projection, **When** stable ranking storage is created, **Then** every committed import has exactly one durable monotonic cohort sequence, every eligible memory resolves to exactly one queryable cohort, and collective FTS coverage equals authoritative memory coverage.
2. **Given** the committed retrieval fixtures and equal-budget benchmark gates, **When** verification runs, **Then** existing non-import retrieval order, quality, payload, purity, and bounded-work contracts remain passing.
3. **Given** separately authorized copies of the real legacy and current databases, **When** plan/apply/replay and the 17 established probes run, **Then** all 17 pre-existing ordered Top-K lists are byte-for-byte identical before and after import, imported bugfix examples remain retrievable, and source/current originals remain unchanged.
4. **Given** a passing rehearsal, **When** verification completes, **Then** it reports readiness evidence without performing or implying authorization for real cutover.

## Edge cases

- A memory linked to legacy evidence by exact dedup remains in the pre-existing cohort and MUST NOT gain a duplicate legacy lexical row.
- Multiple committed imports MUST receive strictly increasing durable cohort sequences, even when supplied timestamps are equal or move backward; each newly materialized imported memory enters one cohort exactly once and replay preserves zero delta.
- Imported rows that are historical, superseded, retracted, quarantined, or deleted retain existing eligibility rules; cohort membership MUST NOT make an ineligible row visible.
- A target created from an absent database, revision-8 migration, interrupted rebuild, or failed candidate publication MUST fail closed without partial or double-indexed cohort state.
- Query sanitization, Unicode, phrases, prefix matching, repeated terms, punctuation-only input, limits below five, history mode, exact ID/topic matches, and payload truncation retain their declared behavior.
- A query with enough pre-existing matches to fill the limit may return no lexical imported rows; this is the intentional stability boundary, not loss of imported storage, and distinctive/exact-topic queries remain the retrieval path.

## Functional requirements

- **FR-001 — FTS5 Lexical Retrieval MUST Sanitize Untrusted Queries**: `[MODIFIED retrieval]` For identical recall inputs, the system MUST preserve the complete ordered Top-K sequence selected from unchanged pre-existing eligible memories when imported memories are added; imported rows MUST NOT influence the pre-existing cohort's lexical corpus statistics, candidate ranks, or stable tie breaks, and existing query sanitation, exact precedence, stable fusion, limits, and query-plan identity MUST remain intact.
- **FR-002 — Deterministic Cohort Merge**: `[INTERNAL]` Retrieval MUST resolve exact authoritative matches first, select the pre-existing lexical cohort with its declared strategy and limit, and only then fill unused positions from a separately ranked imported cohort while deduplicating memory IDs and preserving the caller limit.
- **FR-003 — Legacy Import MUST Preserve Source Data and Report Disposition**: `[MODIFIED store]` The importer and retrieval path MUST keep every eligible imported current/history memory indexed in its resolved project, guarantee access by exact memory ID or topic key, return textual matches when protected older cohorts leave caller capacity, preserve exact-dedup provenance without duplicate indexing, and retain temporal status and lineage behavior.
- **FR-004 — Cohort Projection Integrity**: `[INTERNAL]` Revision 9, import writes, deletion, verification, and rebuild MUST assign every committed import a unique strictly increasing durable cohort sequence and every eligible memory exactly one derived lexical cohort; they MUST fail closed on missing, duplicated, stale, non-monotonic, or mismatched cohort state before reporting a committed import.
- **FR-005 — Stable Ranking Diagnostics and Compatibility**: `[INTERNAL]` Recall MUST retain the existing public response, query-plan identity discipline, exact/structured precedence, query sanitation, bounded stages, privacy behavior, and diagnostic accounting while reporting work from both lexical cohorts truthfully.

## Success criteria

- **SC-001** `[buildable]`: A disposable regression with at least 17 pre-existing current memories, 1,000 imported matching memories, and 17 fixed title-derived probes preserves 17/17 complete ordered pre-existing Top-K ID sequences before and after import.
- **SC-002** `[buildable]`: The same regression produces zero pairwise inversions and zero missing pre-existing Top-K IDs; representative imported current/history memories return for exact ID/topic queries and for distinctive title/content queries only when older cohorts leave capacity, while a full older-cohort noisy query documents intentional lexical starvation.
- **SC-003** `[buildable]`: Exact dedup, mapped/isolated projects, current/history modes, equal/backward import timestamps, multiple imports, and replay retain strictly increasing cohort sequences, one lexical row per eligible memory, and zero logical replay delta.
- **SC-004** `[buildable]`: Focused retrieval/import/schema suites, build, full tests, packed integrations, benchmark fixture, prepublish verification, and diff hygiene pass without changing the exact six-tool MCP surface.
- **SC-005** `[buildable]`: The named offline `benchmark:import-ranking` lane uses one deterministic corpus/query manifest, fixed warmup and measured sample counts, paired control/candidate execution, a create-only validated report, and zero model/network calls; candidate recall p95 MUST be no greater than 2x control while diagnostics reconcile all visited cohorts.
- **SC-006** `[outcome]`: A separately authorized isolated-copy rehearsal preserves 17/17 exact pre-existing ordered Top-K lists, retains 17/17 self-retrieval at rank 1, retrieves sampled imported bugfix memories, passes all import integrity/replay checks, and leaves both real originals byte-identical.

## Assumptions

- Cohort precedence is durable across imports: native memories precede import cohort sequence 1, which precedes sequence 2 and later; revision-9 audit state is the authority and timestamps never determine this order.
- Exact pre-existing Top-K preservation takes precedence over inserting legacy lexical matches into an already full result set; legacy rows fill available positions and remain reachable through sufficiently distinctive content or exact topic/ID lookup.
- The previously authorized rehearsal artifacts may be read as evidence, but another isolated-copy rehearsal and every real cutover remain separately authorized stateful operations.

## Dependencies

- SQLite FTS5, revision-8 import lineage migrated to revision-9 cohort sequencing, the current E0 lexical strategy, and existing public `MemoryService.recall`/`get` seams.
- Installed TDD and simplify skills for implementation, plus a fresh Oracle for plan review if selected and mandatory final verification.

## Out of scope

- Changing the public six-tool MCP contract, adding vector/embedding/model/network retrieval, importing `manual` or `pattern`, or changing privacy/taxonomy decisions.
- Re-ranking pre-existing results to improve relevance, retrospectively rewriting immutable benchmark reports, or weakening the exact stability criterion to self-retrieval-only.
- Performing the real stopped-host cutover, deleting quarantine, or mutating `~/.thoth/thoth.db` or the active current database.
