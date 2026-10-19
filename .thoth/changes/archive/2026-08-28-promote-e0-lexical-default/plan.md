# Implementation Plan: Promote E0 as the Lexical Default

## Technical context

E0 (`strict-selected-any-cap5-rrf-v1`) is already implemented, versioned, independently verified, and measured in the immutable four-lane report. `MemoryService.recall` selects `input.lexicalStrategy ?? DEFAULT_LEXICAL_QUERY_STRATEGY`; therefore the runtime behavior change is one internal constant, while explicit strategy calls remain stable. The current source default is `any-prefix-v1`, and retrieval tests deliberately assert it because the preceding SDD used a hybrid-parity promotion gate.

The new user decision changes product policy, not retrieval mechanics: this embeddings-free phase competes against agentmemory BM25-only, which E0 exceeds on the common 470-question subset. Agentmemory's `95.2%` BM25+Vector result is reserved for a future semantic phase. The official v3 report and its `retain_default` field remain immutable historical evidence under the superseded policy; the new default decision is recorded by source, tests, documentation, canonical deltas, and this SDD rather than by mutating the report or its validator.

No schema, persisted state, projection, dependency, public input, MCP tool, benchmark corpus, strategy configuration, plan hash, or generated `dist/` output changes. The worktree contains the completed uncommitted E0 implementation and archive; this change builds on those owned surfaces and preserves all unrelated changes.

## Ownership

- **Owner**: adaptive root implementation writer.
- **Net-gain rationale**: the implementation is a short ordered change to one default constant plus directly coupled expectations and documentation. Root continuity avoids rediscovering the just-completed E0 evidence; independent Oracle instances still own optional plan review and mandatory final verification.
- **Mutable surface**: `src/memory-core/sqlite/fts.ts`, nearest retrieval/package tests, `docs/agent/testing.md`, the existing research decision note, and this change's OpenSpec artifacts. Benchmark reports, schemas, and strategy configuration are read-only in this change.
- **Checks**: mandatory TDD red/green at the service/default seam, focused retrieval and packaging suites, build, full tests and routed integration/package checks, immutable SHA verification, simplify review, and fresh Oracle verification.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — promotion remains an internal default and adds no public field or MCP tool.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — E0 is deterministic bounded SQLite FTS5 retrieval and uses no projection, embedding, graph, reranker, LLM, or remote service.
- **P3 — Harness-Agnostic Memory Contract**: PASS — the default changes beneath the shared `MemoryService`; no harness adapter, schema, taxonomy, or transport contract changes.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — E0's five-row lexical cap remains subordinate to caller limits and existing compact/context/get character budgets.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — the plan explicitly distinguishes lexical and future semantic targets, preserves immutable evidence, and introduces no compatibility shim or dual runtime path.

## Design

### 1. Establish the promotion policy at the behavioral seam

First change the nearest retrieval assertions so the default constant and no-override `MemoryService.recall` path are expected to select E0's stable strategy/configuration identity and bounded fusion behavior. Keep explicit assertions for all four strategy IDs, empty normalized queries, exact priority, caller limits, diagnostics, and the official report's historical `retain_default` value. The initial focused run must fail because source still selects `any-prefix-v1`.

### 2. Promote E0 with the smallest production change

Change only `DEFAULT_LEXICAL_QUERY_STRATEGY` in `src/memory-core/sqlite/fts.ts` to `strict-selected-any-cap5-rrf-v1`. Do not edit the E0 configuration, RRF helper, service branching, strategy IDs, hashes, report, baseline manifests, report validators, schema, or public surfaces. Because `MemoryService.recall` already resolves its default through the constant, the no-override path adopts E0 without a second selection mechanism.

### 3. Preserve historical evidence while recording the later decision

Update retrieval tests and routed documentation to make the chronology explicit:

- the immutable v3 report remains SHA-bound and says `retain_default` under the former hybrid-parity/no-regression gate;
- the later user-approved lexical-only policy compares E0 `419/470` with agentmemory BM25-only `409/470` on the common subset;
- E0 becomes the runtime lexical default because it also passed same-run p95, equal-byte, provenance, and zero-call gates;
- agentmemory BM25+Vector `95.2%` uses `all-MiniLM-L6-v2` embeddings and no LLM in that retrieval benchmark, and is reserved for a future semantic SDD.

Add no new mutable benchmark artifact. The archived previous SDD remains historical; this new SDD is the canonical superseding decision lineage.

### 4. Verify public and persistence invariants

Run the focused retrieval and first-product/package tests, build, full suite, integration verification, packed smoke, fixture, prepublish, immutable report hash, and diff/status checks required by `docs/agent/testing.md`. Apply `simplify` only to the new owned diff; the expected result is likely no structural refactor because the production change is one constant.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Make E0 the single internal default used by the existing no-override service path | `src/memory-core/sqlite/fts.ts`, `src/memory-core/service.ts` | `MemoryService.recall` fixture and default strategy diagnostics |
| FR-002 | Keep v3 evidence immutable and represent the later lexical-only policy outside the historical report | `tests/memory-core/retrieval.test.ts`, `docs/agent/testing.md`, OpenSpec change | SHA/decision/default contract assertions |
| FR-003 | State BM25-only and BM25+Vector denominators and roles without relabelling embeddings or LLM use | `docs/agent/testing.md`, `docs/research/recall-at-5-latency-2026-08-28/report-source.md` | Documentation assertions/review against accepted evidence |
| FR-004 | Leave all configuration, hashes, public schemas, tools, persistence, dependencies, and evidence unchanged | `src/memory-core/sqlite/fts.ts`, `tests/packaging/first-product.test.ts`, `package.json` | Exact-six/schema/dependency/package tests and hash checks |

## Optional support artifacts

- `research.md`: not needed; the local agentmemory README audit and existing decision report supply the evidence, while `spec.md` records the accepted interpretation.
- `data-model.md`: not needed; no data model or persistence change exists.
- `contracts/`: not needed; no public or serialized contract changes.
- `quickstart.md`: not needed; users configure nothing and receive the improved default automatically.

## Risks and migrations

- **Historical report appears contradictory**: retain its exact bytes and validator semantics, and explicitly document that `retain_default` belongs to the superseded hybrid-parity policy. Tests assert both historical truth and the later source decision.
- **Implicit callers receive more lexical work**: E0's official p95 `2.0552 ms` is within twice its co-run control, its final lexical cap is five, and existing caller/budget limits remain authoritative. Rollback is the one-line default constant plus its current expectations.
- **Explicit benchmark lanes accidentally drift**: they already pass `lexicalStrategy` explicitly; focused runner/report tests and stable config hashes detect any accidental change.
- **Semantic claim inflation**: documentation must say E0 beats BM25-only, not BM25+Vector, and must state the latter uses embeddings but no LLM in the published retrieval loop.
- **Database/package growth**: no migration exists; schema revision, dependency inventory, six-tool surface, and SQLite-byte evidence remain checked.
- **Migration**: none. No stored data, receipt, projection, or configuration requires conversion.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design changes one internal default and verifies the exact six-tool registry and unchanged public schemas.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — E0 remains a deterministic SQLite FTS5/RRF path with explicit stable identity and no optional component made load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — every host continues through the same core default without adapter-specific fields or behavior.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — exact-first results, five lexical candidates, caller limits, progressive modes, snippets, and payload accounting remain unchanged and tested.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — lexical and future semantic objectives are separated explicitly, immutable evidence is preserved, and rollback requires no shim or data migration.
