# Verification Report: SQLite-first persistent memory core v2

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS

## Review dimensions

- **Completeness**: Every accepted FR and buildable SC has current implementation and executed evidence; SC-013 is explicitly retained as an external outcome risk.
- **Correctness**: All direct failures from verification rounds 1–4 were reproduced, repaired, and independently rerun; round 5 found no blocking defect.
- **Coherence**: Code, tests, package, integrations, documentation, CI, benchmark contracts, tasks, and Full ready artifacts agree on the SQLite-first v2 boundary.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-002 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-003 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-004 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-005 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-006 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-007 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-008 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-009 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-010 | `src/memory-core/` ledger, identity, migration, and importer implementation | Ledger, service, identity, importer focus; full 18 files/61 tests | PASS |
| FR-011 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-012 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-013 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-014 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-015 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-016 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-017 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-018 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-019 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-020 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-021 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-022 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-023 | `src/memory-core/service.ts` and exact six-tool progressive retrieval envelope | Retrieval/context/MCP focus and direct bounded correlation/recovery reproductions | PASS |
| FR-024 | `src/memory-core/retrieval/projections.ts` rebuildable projection contract | Projection 1 file/6 tests plus six drift and two rollback/restart reproductions | PASS |
| FR-025 | `src/memory-core/retrieval/projections.ts` rebuildable projection contract | Projection 1 file/6 tests plus six drift and two rollback/restart reproductions | PASS |
| FR-026 | `src/memory-core/retrieval/projections.ts` rebuildable projection contract | Projection 1 file/6 tests plus six drift and two rollback/restart reproductions | PASS |
| FR-027 | `src/memory-core/retrieval/projections.ts` rebuildable projection contract | Projection 1 file/6 tests plus six drift and two rollback/restart reproductions | PASS |
| FR-028 | `src/memory-core/retrieval/projections.ts` rebuildable projection contract | Projection 1 file/6 tests plus six drift and two rollback/restart reproductions | PASS |
| FR-029 | `src/memory-core/retrieval/projections.ts` rebuildable projection contract | Projection 1 file/6 tests plus six drift and two rollback/restart reproductions | PASS |
| FR-030 | `src/memory-core/retrieval/projections.ts` rebuildable projection contract | Projection 1 file/6 tests plus six drift and two rollback/restart reproductions | PASS |
| FR-031 | `src/tools/index.ts` exact six-tool registry and graph-action removal | Registry/integration tests, CodeGraph runtime audit, 30-entry tarball | PASS |
| FR-032 | `src/tools/index.ts` exact six-tool registry and graph-action removal | Registry/integration tests, CodeGraph runtime audit, 30-entry tarball | PASS |
| FR-033 | `src/tools/index.ts` exact six-tool registry and graph-action removal | Registry/integration tests, CodeGraph runtime audit, 30-entry tarball | PASS |
| FR-034 | `src/tools/index.ts` exact six-tool registry and graph-action removal | Registry/integration tests, CodeGraph runtime audit, 30-entry tarball | PASS |
| FR-035 | `src/tools/index.ts` exact six-tool registry and graph-action removal | Registry/integration tests, CodeGraph runtime audit, 30-entry tarball | PASS |
| FR-036 | `src/tools/index.ts` exact six-tool registry and graph-action removal | Registry/integration tests, CodeGraph runtime audit, 30-entry tarball | PASS |
| FR-037 | `src/tools/index.ts` exact six-tool registry and graph-action removal | Registry/integration tests, CodeGraph runtime audit, 30-entry tarball | PASS |
| FR-038 | `src/tools/index.ts` exact six-tool registry and graph-action removal | Registry/integration tests, CodeGraph runtime audit, 30-entry tarball | PASS |
| FR-039 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-040 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-041 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-042 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-043 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-044 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-045 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-046 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-047 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-048 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-049 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-050 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-051 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-052 | `src/integration/`, `integrations/`, setup receipts, and canonical packed inventory | Package/setup 3 files/9 tests, inventory, packed three-host lifecycle smoke | PASS |
| FR-053 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-054 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-055 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-056 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-057 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-058 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-059 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-060 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-061 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-062 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| FR-063 | `benchmarks/` equal-condition report, fallback controls, and fail-closed evaluator | Benchmark/evaluator 2 files/7 tests and measured fixture benchmark | PASS |
| SC-001 `[buildable]` | Failed-memory supersession and complete immutable lineage | Ledger/service tests | PASS |
| SC-002 `[buildable]` | Clean offline SQLite core with no deferred dependencies | Build and full tests | PASS |
| SC-003 `[buildable]` | Exact six tools and bounded stable-ID responses | MCP focus | PASS |
| SC-004 `[buildable]` | Immediate FTS recall with truthful projection state | Retrieval/projection focus | PASS |
| SC-005 `[buildable]` | Canonical three-host tarball assets resolve and execute | Inventory and pack dry-run | PASS |
| SC-006 `[buildable]` | Disposable native-shaped full lifecycle matrix for all hosts | Packed three-host smoke | PASS |
| SC-007 `[buildable]` | No dashboard, HTTP, graph, model, reranker, or credential startup dependency | Build/package/runtime audit | PASS |
| SC-008 `[buildable]` | Measured fixture latency/memory/database bytes and zero model/network/LLM use | Benchmark fixture | PASS |
| SC-009 `[buildable]` | Root-only automatic capture and passive-stream exclusion | Lifecycle tests | PASS |
| SC-010 `[buildable]` | Atomic projection delete/rebuild, drift healing, and unchanged authority | Direct on-disk drift/rollback reproductions | PASS |
| SC-011 `[buildable]` | Read-only deterministic importer with unchanged source and bounded reports | Importer focus 2 files/7 tests | PASS |
| SC-012 `[buildable]` | One command validates fixture and explicit unavailability for every external lane | benchmark:fixture | PASS |
| SC-013 `[outcome]` | External full-source answer/hidden-test baseline unavailable; outcome not claimed | Fixture unavailable-lane evidence | RISK |
| SC-014 `[outcome]` | Comparable regressions reject; incomparable reports incomplete; lexical remains default | Pathological promotion reproductions | PASS |

## Findings

- No open critical findings.
- Verification rounds 1–4 and their resolved findings O1-F001 through O4-F001 are preserved in `verification-history.md`.
- Round 5 independently passed projection atomicity, all prior convergence reproductions, broad tests, package smoke, benchmark gates, and retirement audits.

## Verification summary

- Full ready validator: PASS.
- Frozen install and build: PASS.
- Unit: 12 files/41 tests; full: 18 files/61 tests; integration: 6 files/20 tests.
- Projection focus: 1 file/6 tests; six registry-drift heals and two atomic rollback/restart reproductions.
- O1–O3 focus: 5 files/21 tests; importer: 2 files/7 tests; benchmark/evaluator: 2 files/7 tests; package/setup: 3 files/9 tests.
- Inventory, packed OpenCode/Codex/Claude lifecycle smoke, prepublish, fixture benchmark, 30-entry dry-run tarball, retired/secret/unmerged audits, and diff check: PASS.

## Residual risks

- SC-013: R-SC013-EXTERNAL — the external full-source quality baseline required to observe at least 75% injected-token reduction with no more than five percentage points of quality loss is unavailable; no result is fabricated.
- R-HOST-001: Disposable native-shaped bundles pass, but real OpenCode/Codex/Claude binaries and model-consumption evidence remain unobserved.
- Non-blocking warnings: Node DEP0190 for fixed shell child processes, CRLF conversion notices, and reviewed pre-archive semantic-overlap warnings.

