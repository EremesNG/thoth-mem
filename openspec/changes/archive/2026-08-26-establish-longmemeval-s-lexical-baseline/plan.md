# Implementation Plan: Establish LongMemEval-S Lexical Baseline

## Technical context

The repository currently has one committed offline contract fixture (`benchmarks/run.mjs`), a fixture-oriented validator (`benchmarks/report.mjs`), and a manifest that truthfully marks `longmemeval-s` as unavailable. The authoritative product retrieval seam is `MemoryService.save` plus `MemoryService.recall`, backed by SQLite FTS5 and deterministic product IDs. There is no external dataset preparation, LongMemEval adapter, multi-gold scorer, or retrieval-only report contract.

The implementation will stay inside benchmark, test, manifest/package, and routed documentation surfaces. It will not alter `src/memory-core/`, MCP tools, native bundles, runtime defaults, or the committed fixture's meaning. The official cleaned LongMemEval-S source will be pinned to Hugging Face commit `98d7416c24c778c2fee6e6f3006e7a073259d48f` and SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`; preparation is an explicit networked command, while evaluation is a separate offline command.

Implementation ownership: root is the single writer because the affected benchmark modules, schema, scripts, tests, and docs form one ordered contract and the root already holds the repository and protocol context. Delegating the writer would add rediscovery and coordination cost without an independent mutable surface. Mandatory plan review and final verification remain owned by fresh Oracle agents, so the writer never approves its own work.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change adds no MCP tool and does not modify any existing tool contract.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The change measures the existing SQLite FTS5 path first and expressly excludes optional projections and remote/model dependencies.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The benchmark calls the shared `MemoryService` directly and introduces no host payload or harness-specific memory semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Candidate ranking and a separate fixed 1,000-estimated-token delivery budget are both measured, preserving bounded recall rather than widening product defaults.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The design introduces a clean external-retrieval report contract without legacy adapters, dual runtime behavior, or data migration.

## Design

### Dataset preparation boundary

- Add `benchmarks/longmemeval/contract.mjs` as the single source for the immutable dataset identity, official raw URL, profile constants, top-level streaming JSON-array reader, record validation, eligibility classification, session normalization, hashing, and pure multi-gold metrics.
- Add `benchmarks/longmemeval/prepare.mjs` as an explicit networked command. It streams the immutable raw file into `benchmarks/.cache/longmemeval/`, computes SHA-256 while writing a temporary file, rejects a mismatch, and atomically publishes the file plus a compact preparation receipt only after validation. The cache is gitignored and excluded from package contents.
- The offline runner re-hashes and revalidates the prepared file instead of trusting the receipt. Tests call exported preparation/contract functions with injected streams or fetch implementations; production constants cannot be overridden from the CLI.
- Stream the top-level JSON array using Node built-ins so the several-hundred-megabyte corpus is not materialized as one JavaScript object and no new parsing dependency becomes load-bearing. Validate turn roles as nonempty strings and turn content as a string that may be empty, matching the pinned cleaned corpus without silently removing occurrences.

### Retrieval-only execution boundary

- Add `benchmarks/longmemeval/run.mjs` with an importable `runLongMemEval` function and a fixed production CLI.
- Process one record at a time. Exclude only the 30 `_abs` abstention records. Every other record must provide nonempty unique `answer_session_ids` whose IDs all resolve to at least one ordered haystack occurrence or validation fails; assistant-evidence question types remain eligible. For every eligible question, create a disposable SQLite database and project, ingest ordered haystack occurrences exactly once through `MemoryService.save`, and close/remove the database after recording measurements. Preserve repeated base `haystack_session_id` values because the official cleaned corpus contains them.
- Normalize one session occurrence to one memory using every ordered turn as `[role] content`. Derive a unique deterministic occurrence source ID from the session index and base `haystack_session_id`; use the supplied session timestamp as `capturedAt`, an `eventKey` derived from `question_id` and occurrence source ID, and `sourceRef=occurrence source ID`. Keep an in-memory map from returned memory/evidence IDs to both the occurrence source ID and authoritative base session ID for scoring and provenance.
- Record the `_abs` exclusions and observed denominator. Gold labels, answers, `has_answer`, and oracle data remain in the evaluator boundary and never enter memory title/content, query expansion, eligibility decisions, or retrieval configuration.
- Call the real lexical `MemoryService.recall` twice with the same query: candidate ranking with `limit=20` and sufficient measurement-only payload allowance to observe all returned ranks, then bounded delivery with `limit=20` and `budgetChars=4_000`. Treat this delivery unit truthfully as UTF-16 code units because the current service uses JavaScript string length; keep the two result sets and timing scopes separate.
- Label the candidate `sqlite-fts5-bm25-session-full`; publish tokenizer/query-sanitizer/config hashes. Do not claim parity with the official user-only, space-tokenized `rank_bm25` implementation.

### Metrics and report boundary

- Add `benchmarks/retrieval-report.schema.json` and `benchmarks/retrieval-report.mjs` for a retrieval-only report rather than forcing external quality into the existing fixture/continuity schema. The current `thoth-mem.benchmark-report.v1` remains the committed product-contract fixture; the new contract is `thoth-mem.retrieval-benchmark-report.v1`.
- The new validator requires dataset source revision/hash/license, profile and corpus/query/config hashes, exact query order, observed/excluded denominators, candidate and context budgets, aligned per-question occurrence source IDs plus base session IDs, gold occurrence source IDs, gold ranks and provenance mappings, per-type aggregates, and a no-promotion conclusion.
- Pure scoring reports `recall_any` (binary any-gold hit), fractional `recall` (distinct retrieved gold IDs divided by distinct gold count), `recall_all` (binary all-gold hit) at K=1/5/10/20, `mrr_any` from the first gold candidate position, and occurrence-level binary-relevance `ndcg_at_10`. Repeated base IDs consume Top-K positions and each relevant occurrence contributes binary NDCG gain, matching the official session-corpus semantics. The same family is computed separately for the 4,000-character delivered set.
- Resource fields define and record retrieval, delivery, ingestion, and startup p50/p95; process RSS samples and observed peak; SQLite bytes after close/checkpoint; corpus/query/returned/delivered UTF-16 code units, optional Unicode code-point observations, and `ceil(utf16_code_units/4)` estimated tokens; errors; and literal zero evaluation-time network/model/LLM calls.
- Write reports through a temporary file and atomic rename so interruption cannot create an apparently complete durable report. The default output is `benchmarks/results/longmemeval-s-fts5-report.json`; it is not produced by normal tests or `benchmark:fixture`.

### Repository and operator surfaces

- Add `benchmark:prepare:longmemeval` and `benchmark:longmemeval` scripts in `package.json`, include the retrieval report schema in published benchmark contracts, keep `benchmark:fixture` unchanged, and keep the manifest lane unavailable unless an explicit prepared external run is invoked.
- Update `.gitignore` for only the bounded local dataset cache.
- Update `README.md` and `docs/agent/testing.md` with the networked preparation/offline execution boundary, pinned source identity, expected report, and the rule that this baseline does not promote optional modules.
- Add official-shaped small fixtures and focused tests under `tests/benchmarks/` for stream parsing, schema rejection, eligibility, answer/gold leakage, multi-gold formulas, isolation, provenance, budgets, resources, offline execution, and atomic failure behavior.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Pin cleaned-S revision/hash; separate explicit preparation from offline evaluation; no reader/LLM | `benchmarks/longmemeval/{contract,prepare,run}.mjs` | Contract/preparation tests reject source drift and evaluation tests trap network/model access |
| FR-002 | Stream, hash, validate, and atomically cache outside git/package; preserve repeated haystack IDs and empty string turn content as ordered occurrences | `.gitignore`, `benchmarks/.cache/longmemeval/`, `benchmarks/longmemeval/{contract,prepare}.mjs` | Wrong-hash, malformed-array, misalignment, duplicate-question/gold, repeated-haystack, empty-content, and partial-write tests |
| FR-003 | One isolated DB/question; one full-dialogue memory/session; real `MemoryService` calls | `benchmarks/longmemeval/run.mjs`, `dist/index.js` public benchmark seam | Runner tests prove exact-once saves, original order, isolation, lexical-only lanes, and cleanup |
| FR-004 | Keep a bijective runtime map across unique occurrence source IDs and generated memory/evidence IDs while retaining the possibly repeated base session ID | `benchmarks/longmemeval/run.mjs`, retrieval report provenance records | Duplicate occurrence-source, missing, or unmapped source fixtures fail validation; repeated base IDs remain auditable |
| FR-005 | Candidate Top-20 and separate 4,000-UTF-16-code-unit delivery call | `benchmarks/longmemeval/{contract,run}.mjs`, retrieval report budgets | Runner/report tests assert unequal, mislabeled, or conflated budgets fail |
| FR-006 | Implement pure multi-gold metric functions and explicit names | `benchmarks/longmemeval/contract.mjs`, `benchmarks/retrieval-report.mjs` | Hand-computed multi-gold fixtures at K=1/5/10/20 plus MRR/NDCG tests |
| FR-007 | Use a dedicated retrieval-only report schema and validator with per-query audit/resources | `benchmarks/retrieval-report.{schema.json,mjs}`, `benchmarks/longmemeval/run.mjs` | Schema/validator and percentile/resource-accounting tests |
| FR-008 | Preserve fixture contract; external report stays non-promotional and opt-in | `benchmarks/{manifest.json,run.mjs}`, `package.json`, `README.md`, `docs/agent/testing.md` | Existing fixture tests plus new absent-cache/no-external-claim tests |

## Optional support artifacts

- `research.md`: Not needed; authoritative source identity, official-versus-product protocol differences, and accepted decisions are explicit in `spec.md` and this plan.
- `data-model.md`: Not needed; dataset, provenance, metric, and report shapes are localized to the new retrieval report schema and module-level types/checks.
- `contracts/`: Not needed; the executable JSON schema is the public benchmark contract.
- `quickstart.md`: Not needed; the two operator commands and safety boundary belong in `README.md` and `docs/agent/testing.md`.

## Risks and migrations

- **Large raw JSON and process memory**: stream download and top-level records; never `JSON.parse` the full corpus. Tests include chunk boundaries inside strings, escapes, arrays, and objects.
- **Metric name ambiguity**: report any-hit, fractional recall, and all-hit separately; never expose a generic unlabeled “recall” aggregate without its definition.
- **Repeated official session IDs**: preserve every corpus occurrence and Top-K position under a deterministic occurrence source ID; never let base-ID collisions overwrite memories, collapse the corpus, or shift ranks silently.
- **Eligibility or answer leakage**: preparation uses `_abs` plus resolvable `answer_session_ids` only for evaluator validation; normalization receives only session role/content and timestamps. Tests include assistant-evidence records and plant unique answer, `has_answer`, and gold markers outside normalized sessions to prove they cannot be retrieved, persisted, or used to change eligibility.
- **FTS5 versus official BM25 comparability**: publish the exact thoth candidate ID and tokenizer/config hash; do not compare its number as if it reproduced official `rank_bm25`.
- **Timestamp/tie determinism**: preserve supplied timestamps and deterministic event/source IDs; retain product's documented deterministic ID tie-break for equal BM25/timestamps.
- **Noisy resource samples**: record the runtime/platform, measurement boundaries, raw samples, and percentile method; claims remain descriptive until a candidate uses the same runner/environment.
- **Interrupted or failed run**: write only to a temporary report and rename after validation; preserve an explicit error summary on stderr without a partial durable report.
- **External availability or hash drift**: preparation fails closed. A new official revision requires a separate intentional contract change, not a silent fallback.
- **Migration/rollback**: no product database or runtime migration exists. Rollback removes the new benchmark modules/scripts/schema/docs and deletes the bounded cache/report; the existing fixture and product core remain untouched.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — All new behavior is invoked through package benchmark scripts; the exact six-tool MCP registry is outside the write set.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The design makes SQLite FTS5 the only executable lane and uses external evidence as the gate before any optional projection work.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The design evaluates host-neutral `MemoryService` save/recall operations and keeps LongMemEval-only labels in benchmark adapters and reports.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Raw Top-20 ranking and the current 4,000-UTF-16-code-unit delivery budget are measured independently without changing compact/context/get defaults or omitting truncation evidence.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — A distinct retrieval-report contract avoids compatibility shims inside the fixture validator, and rollback is benchmark-only with no user-data mutation.
