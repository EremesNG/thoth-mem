# Feature Specification: Promote E0 as the Lexical Default

**Change ID**: `promote-e0-lexical-default`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The prior promotion gate compared an embeddings-free lexical candidate against agentmemory's `95.2%` BM25+Vector result. The user has now made the product boundary explicit: the current phase competes against agentmemory BM25-only, while `95.2%` becomes a future semantic-retrieval target if embeddings are reconsidered. On the common 470 non-abstention questions, E0 already exceeds agentmemory BM25-only (`419/470` versus `409/470`), improves the current thoth-mem default by 31 hits, satisfies the frozen same-run latency and footprint gates, and uses zero models, embeddings, network, or LLM calls.<br>
**Impact**: `strict-selected-any-cap5-rrf-v1` becomes the internal runtime default for lexical recall. Existing strategy IDs, hashes, public MCP schemas, immutable reports, persistence, and the exact six tools remain unchanged. The prior v3 report retains its historical `retain_default` decision under the superseded hybrid-parity policy; source tests and durable documentation record the new lexical-only product decision without rewriting evidence.<br>
**Affected capabilities**: `retrieval`, `evals`

## User stories

### US1 - Use the strongest bounded lexical default (Priority: P1)

As a coding agent using local persistent memory, I can receive E0's deterministic exact-first fused lexical results by default so that recall improves without configuring embeddings or a strategy selector.

**Independent test**: A disposable `MemoryService` fixture invokes recall without an internal strategy override and proves that diagnostics and result order use E0's stable configuration while explicit legacy strategy selection remains unchanged.

**Covers**: FR-001, FR-004, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a non-empty lexical query and no internal strategy override, **When** `MemoryService.recall` executes, **Then** it uses `strict-selected-any-cap5-rrf-v1`, preserves exact priority, and admits at most five fused lexical rows subject to the caller limit.
2. **Given** benchmark or test code explicitly selecting any existing lexical strategy, **When** recall executes, **Then** the selected plan, configuration hash, ranking semantics, and immutable historical evidence remain unchanged.
3. **Given** public MCP clients, **When** they inspect or invoke the six tools, **Then** no strategy selector, diagnostic field, seventh tool, model, network path, embedding, vector state, or persistence migration is exposed.

### US2 - Compare lexical systems against lexical evidence (Priority: P1)

As a product maintainer, I can distinguish the current lexical-only target from a future semantic target so that an embeddings-free candidate is not rejected for failing to match an embeddings-assisted result.

**Independent test**: Source/documentation contract tests bind the immutable E0 report and verify that the default promotion rationale uses the common-470 agentmemory BM25-only reference while preserving `95.2%` as a non-current semantic benchmark.

**Covers**: FR-002, FR-003, FR-004, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** agentmemory's published LongMemEval-S results, **When** thoth-mem states lexical parity, **Then** it compares against BM25-only (`86.2%` published; `409/470 = 87.021%` on the common subset), not BM25+Vector.
2. **Given** the immutable E0 report with `419/470`, p95 `2.0552 ms`, equal SQLite bytes, and zero errors/calls, **When** the lexical default decision is evaluated, **Then** E0 is accepted without mutating that report's historical `retain_default` field or weakening its original validator.
3. **Given** a future proposal to add embeddings, **When** its acceptance target is defined, **Then** agentmemory BM25+Vector `95.2%` is the relevant comparison and requires a new SDD with explicit latency and footprint budgets.

## Edge cases

- Empty normalized queries MUST keep the null-plan/null-hash contract even though the default strategy constant changes.
- Explicit `any-prefix-v1`, `all-prefix-v1`, and `all-then-any-prefix-v1` calls MUST retain their exact prior behavior for benchmark reproducibility.
- The immutable v3 report MUST continue validating under its original policy and SHA-256; promotion MUST NOT rewrite or relabel historical evidence.
- Product documentation MUST not describe E0 as matching semantic retrieval or describe agentmemory's `95.2%` result as BM25-only or LLM-assisted.
- The future semantic target MUST NOT authorize embeddings, a local model download, vectors, schema growth, or remote calls in this change.

## Functional requirements

- **FR-001 — Core Retrieval MUST Be Lexical-First and Projection-Aware**: `[MODIFIED retrieval]` The default path MUST use the versioned `strict-selected-any-cap5-rrf-v1` E0 strategy, rank authoritative structured SQLite matches before deterministic fused FTS5 candidates, preserve caller limits and evidence lineage, and require no optional projection, embedding, vector extension, semantic index, schema migration, projection row, or new runtime dependency.
- **FR-002 — Evals MUST Compare Equal-Budget Retrieval Lanes Against the Lexical Baseline**: `[MODIFIED evals]` The immutable four-lane LongMemEval-S evidence MUST remain valid and unchanged, while runtime lexical-default decisions MUST compare embeddings-free candidates against the common-subset agentmemory BM25-only reference and the frozen thoth-mem latency, footprint, provenance, and zero-call contracts. A historical decision produced by the former hybrid-parity policy MUST remain attributable to that policy and MUST NOT prevent a later explicit lexical-only product decision.
- **FR-003 — External Metrics MUST Retain Their Published Meaning**: `[MODIFIED evals]` Reports and documentation MUST distinguish agentmemory BM25-only (`86.2%` RecallAny@5 over 500; recomputed `409/470` on the common subset) from BM25+Vector (`95.2%` over 500; `447/470` on the common subset), MUST state that the published retrieval benchmark uses embeddings but no LLM in the retrieval loop, and MUST reserve the hybrid figure for a future semantic phase rather than a current lexical promotion gate.
- **FR-004 — Promotion MUST Preserve Local-Only and Historical Contracts**: `[INTERNAL]` Promoting E0 MUST change only the internal default and its current expectations/documentation. It MUST NOT change any strategy configuration or plan hash, rewrite an immutable report or baseline, add a public selector or tool, add an embedding/vector/LLM/network path, change schema revision 5, or add persisted state or runtime dependencies.

## Success criteria

- **SC-001** `[buildable]`: Source and service tests prove `DEFAULT_LEXICAL_QUERY_STRATEGY` and no-override recall use `strict-selected-any-cap5-rrf-v1`, while all four explicit strategies retain stable plans, hashes, ranking, limits, empty-query behavior, and diagnostics.
- **SC-002** `[buildable]`: Package, schema, dependency, and MCP inventory tests prove exactly six public tools, schema revision 5, and zero embedding/vector/model/network/persistence expansion.
- **SC-003** `[buildable]`: Benchmark and documentation tests preserve the official v3 report SHA-256 and historical `retain_default` semantics while recording the subsequent lexical-only promotion and preventing `95.2%` from being labelled BM25-only or LLM-assisted.
- **SC-004** `[outcome]`: Existing immutable evidence shows E0 at `419/470 = 89.149%` versus agentmemory BM25-only at `409/470 = 87.021%` on the common subset, with p95 `2.0552 ms` within twice the co-run control, equal `1,519,955,968` SQLite bytes across lanes, complete provenance, and zero errors/model/network/LLM calls.

## Assumptions

- The user's explicit product decision supersedes the prior choice to use hybrid parity as the current lexical promotion target.
- The common-470 recomputation in `docs/research/recall-at-5-latency-2026-08-28/report-source.md` and the immutable local v3 report remain the accepted comparison evidence; no new external run is required to change the internal default.
- Agentmemory's `benchmark/LONGMEMEVAL.md` is authoritative for the distinction between BM25-only, BM25+Vector, embeddings, and the absence of an LLM in that retrieval evaluation.

## Dependencies

- Existing E0 implementation, immutable report SHA-256 `de9137eaba9cdeb30db14f2f315c23fddbf6ea5da75804a0dc59ad36b11faa17`, focused retrieval/package tests, and routed testing/research documentation.

## Out of scope

- Embeddings, vector columns/tables, `sqlite-vec`, local encoder downloads, semantic indexes, rerankers, LLM retrieval/query expansion, remote services, graph retrieval, or consolidation changes.
- Re-running or rewriting the four-lane official report, changing E0 configuration/RRF behavior, tuning IDF, adding projections, or attempting to reach `95.2%` in this change.
- Changing the six-tool MCP surface, public tool schemas, authoritative persistence, benchmark corpus, denominator, budgets, metrics, or immutable historical hashes.
