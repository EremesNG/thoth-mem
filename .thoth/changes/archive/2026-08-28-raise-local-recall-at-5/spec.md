# Feature Specification: Raise Local Recall at 5

**Change ID**: `raise-local-recall-at-5`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: The current local default is fast but reaches only RecallAny@5 `82.553%` on the 470 non-abstention LongMemEval-S questions. The existing broad lexical plan reaches `94.894%`, near agentmemory hybrid's recomputed `95.106%`, but exceeds the frozen latency ceiling. thoth-mem needs to recover the missing Top-5 coverage without reintroducing embeddings, vector storage, remote services, or opaque database growth.<br>
**Impact**: Maintainers can evaluate one versioned E0 lexical candidate that keeps the current three longest sanitized terms, raises the internal lexical cap from two to five, and explicitly fuses deterministic lexical ranks. The current `any-prefix-v1` default and its immutable round-4 evidence remain unchanged until a fresh equal-budget run proves the candidate meets every quality, latency, footprint, provenance, and zero-call gate.<br>
**Affected capabilities**: `retrieval`, `evals`

## User stories

### US1 - Retrieve a useful local Top-5 without vector state (Priority: P1)

As a coding agent using thoth-mem, I can receive up to five deterministically ranked lexical memories from the authoritative local SQLite core so that relevant sessions are less likely to be omitted from compact recall.

**Independent test**: Through the `MemoryService.recall` seam, a disposable SQLite fixture proves that the E0 candidate retains exact-match priority, returns a stable fused Top-5 from the declared lexical plan, respects the caller limit and budget, and leaves public MCP behavior and persistence unchanged.

**Covers**: FR-001, FR-002, FR-003, FR-006, FR-007, SC-001, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** a query with more than five eligible lexical memories, **When** the E0 candidate runs with a caller limit of at least five, **Then** it selects the same three longest sanitized terms as the current default, admits at most five lexical rows, and returns a deterministic fused order.
2. **Given** exact, strict, or relaxed candidates that overlap, **When** the result lists are fused, **Then** exact authoritative matches remain first, memory IDs are deduplicated, rank ties use declared stable rules, and the caller limit is never exceeded.
3. **Given** a limit below five, punctuation-only input, Unicode, repeated terms, FTS operators, phrase-like input, or an empty normalized query, **When** recall runs, **Then** the candidate remains bounded, syntax-safe, deterministic, and honest about skipped stages and work; an empty normalized query retains the existing null-plan contract with null configuration/plan hashes.

### US2 - Compare E0 against the preserved default (Priority: P1)

As a product maintainer, I can compare the E0 candidate with the frozen control and current default under one equal-budget offline run so that a RecallAny@5 improvement cannot hide latency, ranking, footprint, or provenance regressions.

**Independent test**: The benchmark runner and report validator execute and validate isolated control, current-default, existing broad-reference, and E0 lanes over the same ordered corpus and recompute every Top-5 quality and promotion decision from per-question evidence.

**Covers**: FR-001, FR-004, FR-005, FR-006, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** the pinned 470-question corpus, exclusions, occurrence mapping, query order, Top-20 measurement allowance, 4,000-unit delivery budget, and diagnostics, **When** the comparison runs, **Then** strategy configuration and ranking/fusion behavior are the only intended lane differences.
2. **Given** a completed report, **When** it is validated, **Then** RecallAny@5, fractional Recall@5, RecallAll@5, NDCG@10, MRR, p50/p95/p99, SQLite bytes, memory, work, provenance, errors, and literal model/network/LLM calls reconcile with the per-question evidence.
3. **Given** missing, compensated, differently configured, unequal-budget, non-finite, footprint-changing, or provenance-invalid evidence, **When** validation runs, **Then** it fails closed and cannot promote the candidate.

### US3 - Promote only demonstrated parity within the latency budget (Priority: P1)

As a product maintainer, I can retain the current default unless E0 demonstrates agentmemory-level RecallAny@5 within the local latency and footprint contracts so that an experiment never becomes production behavior by assumption.

**Independent test**: Promotion logic is exercised with passing and adversarial reports and changes the runtime default only for one uniquely eligible candidate whose current source configuration hash matches the validated evidence.

**Covers**: FR-004, FR-005, FR-006, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** one unique E0 candidate with RecallAny@5 at least `95%`, no fractional Recall@5, RecallAll@5, or NDCG@10 regression against the best co-run lexical candidate, p95 no greater than twice the co-run control, equal aggregate SQLite bytes, complete provenance, and zero errors or calls, **When** promotion is assessed, **Then** it may replace the runtime default.
2. **Given** E0 misses any required gate, **When** verification completes, **Then** `any-prefix-v1` remains the default and the report identifies the failed criterion without weakening the threshold.
3. **Given** E0 fails the outcome target but confirms a bounded next hypothesis such as IDF-based term selection, **When** work continues under the same intent, **Then** the canonical spec and plan are revised and re-reviewed before that new behavior is implemented.

## Edge cases

- A caller limit from one through four MUST override the candidate's internal cap of five without changing its plan identity.
- Exact matches may consume all, part, or none of the caller limit; fusion MUST NOT evict an exact match or fabricate unused capacity.
- The E0 candidate may have only a relaxed lexical list in its initial plan; explicit fusion MUST still define deterministic rank handling rather than depending on `Map` insertion as an undocumented ranking policy.
- Repeated base session IDs remain separate occurrence source IDs and Top-K positions in LongMemEval-S scoring.
- A candidate may improve RecallAny@5 while degrading fractional coverage or ranking; all declared quality metrics remain visible and gated.
- Timer samples may be zero and absolute milliseconds are host-specific; same-run ratios remain authoritative.
- Interrupted or concurrent official runs MUST clean temporary state and MUST NOT overwrite immutable prior evidence.
- The historical embedding implementation and `sqlite-vec` dependency in `thoth-mem-master-prev` are evidence for the exclusion only and MUST NOT be copied into this change.

## Functional requirements

- **FR-001 — E0 Candidate Plans MUST Be Versioned and Bounded**: `[INTERNAL]` The system MUST expose one non-public, configuration-hashed E0 lexical strategy distinct from the current default. It MUST use the current bounded 32-term candidate window, select the same three longest unique sanitized terms with stable positional tie-breaking, declare an internal maximum of five lexical results, and produce stable configuration and plan hashes for every non-empty normalized query plan. An empty normalized query MUST preserve the existing `null` plan with `null` diagnostic configuration and plan hashes.
- **FR-002 — FTS5 Lexical Retrieval MUST Sanitize Untrusted Queries**: `[MODIFIED retrieval]` Retrieval MUST safely combine exact IDs or topic keys with a selected deterministic lexical query strategy, including phrase-capable BM25 search, bounded prefix expansion, and declared stable rank fusion, without allowing punctuation-only input, code symbols, repeated terms, overlong input, FTS operators, or a Top-5 optimization to fail global recall or change declared query-plan identity.
- **FR-003 — Core Retrieval MUST Be Lexical-First and Projection-Aware**: `[MODIFIED retrieval]` The default path MUST rank authoritative structured SQLite matches before evidence-admitted deterministic FTS5 candidates and MUST NOT require an optional projection. E0 MUST fuse its lexical ranks explicitly and deterministically while preserving exact priority, source identity, evidence lineage, history/project scope, bounded snippets, payload accounting, and caller limits. It MUST add no embedding, vector extension, semantic index, schema migration, projection row, or new runtime dependency.
- **FR-004 — Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline**: `[MODIFIED evals]` The LongMemEval-S comparison MUST preserve the frozen corpus, observed exclusions, query order, session occurrence mapping, public Top-20 measurement allowance, 4,000-UTF-16-unit delivery budget, scoring, diagnostics, zero-model/zero-network boundary, and timing boundaries while comparing the frozen control, current default, existing broad reference, and E0 candidate in four isolated sequential lanes. The base retrieval-report validator, its closed schema, and tests MUST explicitly admit E0 without changing the `thoth-mem.retrieval-benchmark-report.v1` document shape or invalidating any historical report.
- **FR-005 — External Metrics MUST Retain Their Published Meaning**: `[MODIFIED evals]` Reports and promotion logic MUST separately compute RecallAny@5, fractional Recall@5, RecallAll@5, NDCG@10, and MRR from positional candidate evidence. RecallAny@5 MUST NOT be relabelled as fractional recall, and a `95%` target MUST mean at least 447 hits among the same 470 non-abstention questions.
- **FR-006 — E0 Promotion MUST Fail Closed**: `[INTERNAL]` The current `any-prefix-v1` default MUST remain unchanged unless one fresh, immutable, schema-valid, same-run report uniquely demonstrates E0 RecallAny@5 of at least `95%`; no regression against the best co-run lexical candidate in fractional Recall@5, RecallAll@5, or NDCG@10; p95 no greater than `2.0` times control; exactly equal aggregate SQLite bytes; complete provenance; matching source configuration identity; and literal zero errors, model calls, network calls, and LLM calls.
- **FR-007 — The Six-Tool and Local-Only Contracts MUST Remain Stable**: `[INTERNAL]` The change MUST NOT add or rename an MCP tool, expose strategy selection or diagnostics in public tool schemas, add remote retrieval, add a model, add embeddings, add `sqlite-vec`, add vector columns or tables, or alter authoritative memory/evidence/session persistence.

## Success criteria

- **SC-001** `[buildable]`: Planner tests prove E0's distinct strategy/configuration identity, three-term selection, five-row cap, syntax safety, stable non-empty hashes, null empty-query plan/hashes, and unchanged `any-prefix-v1` default behavior across all declared empty, single-term, repeated, Unicode, operator-like, phrase-like, overlong, and caller-limit inputs.
- **SC-002** `[buildable]`: `MemoryService.recall` seam tests prove exact-first priority, explicit deterministic fusion, deduplication, stable tie-breaking, project/history isolation, caller limits from one through ten, bounded snippets, evidence lineage, and behavior-neutral diagnostics for every declared case without inspecting private database state as the assertion seam.
- **SC-003** `[buildable]`: Source, schema, package, and six-tool inventory checks prove E0 introduces zero schema revisions, projection rows, embedding/vector code, `sqlite-vec`, public tool fields, network/model calls, or aggregate SQLite-byte differences attributable to persisted state.
- **SC-004** `[buildable]`: Base retrieval-report and comparison-report tests admit all four declared strategy IDs, recompute Top-5 metrics, rank fusion evidence, latency/work aggregates, footprint equality, configuration identity, and promotion, preserve validation of every historical v1/v2 artifact, bind the separate v3 baseline manifest, and reject every declared adversarial compensated mutation and persisted promotion claim.
- **SC-005** `[outcome]`: An explicitly authorized offline comparison completes all four 470-question lanes with identical corpus/order/budgets and aggregate SQLite bytes, complete provenance, zero errors/calls, and an E0 candidate with RecallAny@5 at least `0.95`, no fractional Recall@5, RecallAll@5, or NDCG@10 regression against the best co-run lexical candidate, and p95 no greater than `2.0` times control.
- **SC-006** `[outcome]`: Exactly `1` E0 candidate is eligible and its validated configuration hash matches the implemented runtime default before promotion; otherwise `any-prefix-v1` remains the default and E0 evidence becomes the bounded input for a re-specified next experiment.

## Assumptions

- The Deep Research report at `docs/research/recall-at-5-latency-2026-08-28/report-source.md` is the decision input; immutable benchmark reports remain the authoritative measurements.
- The original `benchmarks/lexical-comparison-baseline.json` remains bound to `benchmarks/results/longmemeval-s-lexical-comparison-report.json`, SHA-256 `319dd6155059afcc180f7638deb841a9ca56c1c242f8d63c6a6c87209c9cb358`. A separate `benchmarks/lexical-recall-at-5-baseline.json` MUST bind `benchmarks/results/longmemeval-s-lexical-latency-report-r4.json`, SHA-256 `842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36`, and its exact three lane configuration hashes, Top-5 metrics, NDCG@10, MRR, and SQLite bytes.
- The prepared LongMemEval-S file matching the pinned revision and digest remains locally available, so the official evaluation requires no network access.
- E0 can be implemented without a schema migration, new projection, or database growth because it changes only query planning, rank fusion, diagnostics, and benchmark evidence.
- Same-run latency ratios, not absolute milliseconds from another host or project, determine eligibility.

## Dependencies

- Existing `MemoryService`, SQLite FTS5 schema, query-plan hashing, retrieval diagnostics, benchmark runner/validators, Vitest, and the prepared offline LongMemEval-S corpus.
- Existing immutable round-4 report and research comparison with agentmemory; no runtime dependency is added.

## Out of scope

- Embeddings, vector columns/tables, `sqlite-vec`, semantic indexes, local encoders, rerank models, HyDE, graph/entity retrieval, or remote services.
- IDF/document-frequency term selection, impact/posting projections, confidence routing, or residual semantic retrieval in the first E0 implementation. If E0 evidence requires one of these, the canonical artifacts MUST be revised and re-reviewed before implementation.
- Changing the pinned corpus, 470-question denominator, exclusions, Top-K meanings, scoring, delivery budget, latency multiplier, footprint equality, provenance, or zero-call gates to make E0 pass.
- Adding a public strategy selector or seventh MCP tool, changing persistence/taxonomy/session-summary behavior, or editing generated `dist/` directly.
