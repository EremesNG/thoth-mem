# Implementation Plan: Stabilize Import Recall Ranking

## Technical context

`MemoryService.recall` currently asks one global `memory_fts` table for each strict/relaxed stage and orders candidates by `-bm25(memory_fts)`, then fuses the two bounded lists with reciprocal-rank fusion. BM25 inverse-document-frequency statistics belong to the whole FTS corpus, so inserting 28,955 legacy rows can change scores, stage membership, and pairwise order for unchanged memories. The final isolated rehearsal reproduced this: all 17 established memories remained self-retrievable at rank 1, but 15/17 ordered subsets changed and four probes contained pairwise inversions.

The implementation will add a new internal default lexical strategy, `strict-selected-any-cap5-stable-v1`. It retains E0 query sanitation, longest-term selection, strict/relaxed stages, Top-5 caps, exact ID/topic precedence, reciprocal-rank fusion, public response shape, and budgets, but replaces corpus-dependent BM25 ordering with two deterministic inputs:

1. a corpus-independent fixed-field term-frequency score computed only from the normalized query and the candidate memory's title, content, and topic key; and
2. an immutable monotonic import-cohort sequence added by revision 9 and linked one-to-one with each committed revision-8 import receipt.

Native memories form cohort zero. Revision 9 adds `legacy_import_cohorts(import_id,cohort_sequence)`: migration assigns existing imports deterministic positive sequences by `(created_at,id)`, and every later import transaction allocates `max(cohort_sequence)+1` regardless of wall-clock input. A memory first materialized with disposition `imported` belongs to its earliest numeric import cohort. Exact-linked memories remain in their original cohort. Retrieval orders cohorts numerically, applies the fixed score and existing stable time/ID ties inside each cohort, and fills only unused positions from later cohorts. Consequently, a new import cannot change an earlier Top-K list, while distinctive imported queries remain recallable only when earlier cohorts leave capacity; exact imported ID/topic lookup remains guaranteed. Replay reuses the existing sequence without allocating another cohort.

The stable scorer will live in a pure retrieval module and be registered as one deterministic `better-sqlite3` scalar function per `MemoryService`. Its bounded numeric formula will use normalized token/phrase matches, fixed field weights, capped term-frequency saturation, fixed document-length normalization, and term-length specificity; it will not read corpus counts, wall time, randomness, model output, vector state, or network state. The stable strategy receives its own configuration hash and plan hash; archived strategies and immutable benchmark identities remain unchanged.

**Implementation ownership**: root owns the coupled retrieval, import-verification, tests, and artifacts. Root already holds the rehearsal evidence and exact failure mode; one ordered writer avoids rediscovery and overlapping edits. A fresh Oracle remains mandatory for final verification and cannot approve implementation it wrote.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the change is internal to lexical strategy/ranking and import verification; no MCP tool is added, removed, or renamed.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — ranking remains local SQLite FTS5 plus a pure deterministic scalar function and immutable SQLite receipts, with zero embedding, graph, model, reranker service, or network dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — cohort identity comes from host-neutral import receipts and the shared `MemoryService`; no harness payload or adapter-specific behavior enters ranking.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — compact/context/get, caller limits, stage caps, surgical snippets, payload budgets, telemetry envelope, and evidence accounting remain intact.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — this changes one declared internal default strategy without adding a legacy runtime read path, compatibility shim, dual write, or implicit real-data operation.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add `strict-selected-any-cap5-stable-v1` with a unique configuration identity; preserve E0 query stages/fusion but rank each candidate with a fixed corpus-independent score and immutable cohort key instead of global BM25. Existing strategy IDs remain available for frozen benchmarks. | `src/memory-core/sqlite/fts.ts`, new `src/memory-core/retrieval/stable-lexical-rank.ts`, `src/memory-core/service.ts` | Pure scorer unit cases plus public `MemoryService.recall` corpus-extension regression prove identical pre-existing Top-K IDs/positions and zero pairwise inversions. |
| FR-002 | Resolve a candidate's earliest numeric cohort from `legacy_import_rows(disposition='imported',memory_id)` joined to `legacy_import_cohorts`; native/exact-linked rows sort first, cohorts sort by durable sequence, and existing time/ID ties close each stage before cohort-local RRF. | `src/memory-core/service.ts`, `src/memory-core/retrieval/rank-fusion.ts` if typed cohort metadata must survive fusion | Tests cover exact ID/topic precedence, native full-limit behavior, intentional later-cohort lexical starvation, legacy fill, equal scores, multiple imports, and repeated calls. |
| FR-003 | Keep the single authoritative `memory_fts` row per memory. Imported material remains indexed by existing triggers/writer; exact-linked rows stay deduplicated. Retrieval uses receipt lineage only to rank, not to decide authority or visibility. | `src/memory-core/import/writer.ts`, `src/memory-core/import/verify.ts`, `src/memory-core/service.ts` | Importer/retrieval tests cover mapped and isolated current/history rows, exact dedup, provenance, lineage, multiple imports, and zero-delta replay. |
| FR-004 | Add revision-9 immutable `legacy_import_cohorts` with a one-to-one import FK and unique positive sequence. Migration creates a verified pre-revision backup and sequences existing committed imports by `(created_at,id)`; writer allocation is transactional `max+1`; verifier requires complete, gap-free, unique cohort coverage and derivable earliest memory membership. | `src/memory-core/sqlite/schema.ts`, `src/memory-core/sqlite/migrations.ts`, `src/memory-core/import/writer.ts`, `src/memory-core/import/verify.ts` | Revision 8→9/clean/reopen tests plus equal/backward timestamp, concurrent allocation, missing/duplicate/gap/non-monotonic corruption, publication rollback, and replay fixtures. |
| FR-005 | Aggregate stable-strategy work into the existing exact/strict/relaxed/post-query diagnostics and retain public recall score fields. Configuration/plan hashes truthfully identify the new scorer/cohort policy; no raw import content or cohort metadata is returned. | `src/memory-core/sqlite/fts.ts`, `src/memory-core/service.ts`, `src/memory-core/contracts.ts` only if an internal diagnostic type needs a backward-compatible field | Existing diagnostic, payload, query-shape, Unicode, phrase, punctuation, history, limit, and six-tool tests plus benchmark contract validation. |
| SC-001 / SC-002 | Build a deterministic disposable corpus of 17 protected memories, at least 1,000 imported matching rows, and 17 fixed probes that fails under E0 BM25 and passes only with exact stable Top-K preservation; assert exact ID/topic guarantees, capacity-dependent text recall, and the documented full-capacity starvation boundary. | `tests/memory-core/retrieval.test.ts`, importer fixture helpers in `tests/memory-core/importer.test.ts` only if reuse lowers setup risk | Red first under the current default, then 17/17 exact-list equality, zero missing IDs/inversions, imported capacity-fill PASS, exact lookup PASS, and noisy full-capacity exclusion PASS. |
| SC-003 | Exercise linked rows, isolated/mapped projects, history, two committed import cohorts with equal/backward timestamps, and replay without duplicate FTS/cohort identity. | `tests/memory-core/retrieval.test.ts`, `tests/memory-core/importer.test.ts`, `tests/cli/import-legacy.test.ts`, `tests/memory-core/schema-migration.test.ts` | Focused tests reconcile memories, FTS rows, receipts, strictly increasing numeric cohorts, and replay deltas. |
| SC-004 / SC-005 | Preserve package/quality boundaries with deterministic semantic tests, and add a named offline paired benchmark with fixed warmup/sample policy, create-only report, schema/semantic validator, p95 gate, diagnostics, and zero-call accounting. | `benchmarks/import-ranking/run.mjs`, `benchmarks/import-ranking/report.mjs`, `benchmarks/import-ranking/report.schema.json`, `tests/benchmarks/import-ranking-report.test.ts`, `package.json`, `docs/agent/testing.md` | Focused/full/package gates plus `pnpm run benchmark:import-ranking` produce a valid immutable report whose candidate p95 is ≤2x control and whose semantic hashes/counts reconcile. |
| SC-006 | After repository PASS and separate user authorization, create fresh online backups, generate a new hash-bound import plan, apply/replay only to isolated copies, compare all 17 exact ordered Top-K lists, sample bugfix recall/history, and prove both originals byte-identical. | External rehearsal directory only; no repository fixture contains private database content | Fresh report/replay plus independent Oracle review; no cutover or live-target mutation. |

### Stable score and cohort ordering

For each FTS stage, SQLite continues to use `MATCH` for eligible candidate selection. The new deterministic scalar function receives the original normalized query plus `title`, `content`, and `topic_key` and returns a finite numeric score from fixed constants. The implementation test-locks normalization, phrase bonus, per-field weights, saturated occurrence counts, length normalization, Unicode, empty values, and maximum score. No corpus aggregate participates.

Candidate order is lexicographic:

1. native/no-import cohort;
2. imported cohorts by durable positive `legacy_import_cohorts.cohort_sequence`;
3. fixed lexical score descending;
4. `memories.created_at` descending;
5. memory ID ascending.

Each strict and relaxed list is fused independently inside its cohort using the existing RRF rules, then cohorts are concatenated oldest-first until the remaining caller limit is filled. This prevents a later cohort from consuming a slot previously returned by an older cohort. Exact ID/topic rows remain outside cohort fusion and first in the final list.

### Query and diagnostic flow

1. Build the stable query plan and exact ID/topic rows as today.
2. Resolve ordered cohort identities with one indexed receipt/cohort query; cohort rows expose only memory ID and immutable numeric sequence.
3. Execute strict and relaxed FTS stages for the native cohort, score/fuse, and append up to the remaining limit.
4. Only while capacity remains, execute/fuse each relevant imported cohort in order; stop once the caller limit is satisfied.
5. Hydrate selected IDs once, apply existing snippet/budget logic, and emit the current response/diagnostic envelope with aggregate stage work.

The implementation must avoid one query per imported row. It may use one ordered distinct-cohort query and at most two ranked FTS statements per visited cohort; the corpus-scale p95 gate determines whether a prepared-statement or CTE refinement is required.

## Optional support artifacts

- `research.md`: not needed; current source, the independent rehearsal, and SQLite's observed global-BM25 behavior establish the root cause without external research.
- `data-model.md`: required because revision 9 adds immutable one-to-one cohort sequencing, migration/backfill invariants, and verifier obligations to the import audit boundary.
- `contracts/`: not needed; public MCP/CLI/JSON shapes remain unchanged and the new lexical strategy is an internal typed constant/configuration.
- `quickstart.md`: not needed; operator flow remains the existing plan/apply/replay rehearsal documented for legacy import.

## Risks and migrations

- **Retrieval quality drift**: Removing corpus IDF from the new default can alter relevance even before import. Mitigation: introduce a new strategy ID, test fixed scoring dimensions, retain frozen strategies for comparison, run existing retrieval/benchmark gates, and reject the implementation if established exact/query-shape or committed quality contracts regress. Rollback is restoring the prior default constant; no data migration is involved.
- **Latency from cohort traversal or scalar scoring**: Broad queries may touch many rows/cohorts. Mitigation: indexed receipt lookup, prepared stage statements, stop-after-limit traversal, bounded stage caps, deterministic Vitest work assertions, and the dedicated paired offline benchmark with fixed warmup/samples and validated p95 evidence.
- **Starvation of later imports**: Exact stability intentionally gives older cohorts precedence when they fill Top-K. Mitigation: document this boundary, preserve exact ID/topic precedence and distinctive-query retrieval, and do not claim that every imported memory appears for broad queries.
- **Receipt ambiguity**: A memory may be referenced by later exact-link receipts. Mitigation: only `disposition='imported'` establishes cohort creation; choose the minimum durable cohort sequence; verify every materialized imported memory has one derivable earliest sequence.
- **Read-only/current-schema behavior**: Stable recall assumes revision-9 cohort authority. Writable startup migrates revision 8 to revision 9; readonly tests must use a current database and fail explicitly on incompatible schemas rather than guessing cohort state.
- **Revision-9 audit migration**: Adding cohort order changes the authoritative import-audit schema. Mitigation: verified pre-revision backup, transactional table/backfill/trigger creation, deterministic `(created_at,id)` order for existing receipts, gap-free invariants, idempotent reopen, and no FTS/memory rewrite. Rollback restores the verified revision-8 backup.
- **Private operational data**: Corpus-scale tests use synthetic disposable content. Real snapshots remain outside the repository and may be read only after separate rehearsal authorization; no private sample enters artifacts or fixtures.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design changes only internal strategy/scoring and receipt-aware selection; the exact six-tool registration and schemas remain untouched.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — the new score is pure and corpus-independent, cohort order is derived from immutable SQLite truth, FTS5 remains the eligibility engine, and no optional lane becomes load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — every host continues through the same `MemoryService.recall`; import receipts and ranking rules contain no harness-specific fields.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — cohort traversal stops at the existing limit, hydration remains batched, snippets/budgets are unchanged, and diagnostic work is explicitly reconciled.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — revision 9 and the new named strategy make the behavior change explicit, backed up, and testable while retaining archived strategies as benchmark evidence rather than an implicit compatibility read path.
