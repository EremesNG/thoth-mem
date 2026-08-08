# Implementation Plan: Model-aware embedding profiles and three-model default gate

## Technical context

The current provider interface accepts `string[]` plus one batch-wide query/document role. `src/retrieval/embedding-input.ts` recognizes only Nomic identifiers, `src/indexing/jobs.ts` embeds chunk/sentence content without observation titles, and `src/store/index.ts` submits raw-query and HyDE texts together as query-role inputs. LM Studio and local Transformers.js share this formatter, but the local adapter assumes a generic feature-extraction pipeline with mean pooling. Configuration already recognizes common Qwen3-Embedding-0.6B identifiers as 1024-dimensional, but there is no Qwen profile or local last-token pooling path. Effective embedding lineage currently hashes provider, model, base URL, and dimensions but not preprocessing identity or normalization.

The change introduces a provider-neutral structured input and versioned profile layer for Nomic, EmbeddingGemma, Qwen3-Embedding, and raw fallback; retains lexical/KG degradation; adds vector validation/normalization before persistence or KNN query; and records a reproducible three-model semantic-only comparison before any default flip. Native 768/1024 dimensions remain model metadata rather than a single global assumption. There is no SQLite schema migration; existing vector tables are invalidated through the established embedding config-hash rebuild path. Existing persisted configurations remain readable and resolve omitted profile/normalization fields deterministically.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design adds no MCP tools and keeps the existing six-tool registration untouched; the benchmark is a development package command.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Semantic profiles remain additive, and unavailable/invalid embedding providers continue to leave lexical + KG retrieval and explicit degraded state available.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Profiles and structured embedding inputs are provider- and harness-neutral; no native harness payload enters storage or retrieval contracts.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The design changes semantic preprocessing only and preserves compact/context/get output bounds, surgical trimming, and current top-k defaults.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Persisted config changes are additive with deterministic defaults; no MCP, HTTP, CLI, observation taxonomy, or existing command is removed or renamed.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add a registry of immutable, versioned `nomic`, `embeddinggemma`, `qwen3`, and `raw` profiles. Resolve explicit profile first; `auto` uses normalized family aliases/quantization suffixes and falls back to `raw` with explicit metadata. | `src/retrieval/embedding-profile.ts` (new), `src/config.ts` | `tests/retrieval/embedding-profile.test.ts`, `tests/config.test.ts` |
| FR-002 | Replace the batch-wide string contract with ordered `EmbeddingInput` records carrying `text`, `intent: 'retrieval'`, `role`, and optional `title`; adapters remain responsible for provider transport only. | `src/retrieval/providers.ts`, `src/retrieval/hyde.ts`, provider mocks in tests/evals | Typecheck plus focused profile/provider/HyDE tests |
| FR-003 | Centralize exact idempotent formatting in profiles. Nomic retains `search_query`/`search_document`; EmbeddingGemma uses `task: search result \| query:` and `title: <title-or-none> \| text:`; Qwen uses `Instruct: Given a user query, retrieve relevant passages that answer the query\nQuery:<text>` only for queries and preserves document text; raw preserves all text. | `src/retrieval/embedding-profile.ts`, retire or reduce `src/retrieval/embedding-input.ts` | Exact string, role, and pre-prefixed idempotency tests |
| FR-004 | Mark `raw_query` as query role and `hyde_answer` as document role at semantic-input construction; embed the ordered mixed-role array once and retain existing source labels/fusion. | `src/retrieval/hyde.ts`, `src/store/index.ts` | Existing and new HyDE tests in `tests/store/index.test.ts` |
| FR-005 | Add persisted `profile` (`auto`, built-ins, `raw`) and `normalize` fields plus `THOTH_EMBEDDING_PROFILE` and `THOTH_EMBEDDING_NORMALIZE` precedence; omit any public task field. | `src/config.ts`, `config.schema.json` | Config materialization, precedence, invalid-value, and backward-compatibility tests |
| FR-006 | Hash resolved profile ID/version and normalization rather than only the requested `auto` token, causing a one-time rebuild for older implicit preprocessing and future rebuilds when profile semantics change. | `src/config.ts`, existing `Store.enqueueRebuildOnConfigMismatch` path | Config-hash tests and existing rebuild mismatch tests |
| FR-007 | Add one batch post-processor that checks row count/order, finite non-zero values, exact configured dimensions, and L2-normalizes when enabled. LM Studio rows are ordered by validated response index; Ollama/local keep call order. At boundaries, recall catches provider/validation errors, records an explicit semantic degradation reason, and continues lexical/KG; indexing throws into its existing job retry; benchmark execution records the error and fails closed. | `src/retrieval/vector-processing.ts` (new), `src/retrieval/remote-provider.ts`, `src/retrieval/local-transformers-provider.ts`, `src/store/index.ts`, `src/indexing/jobs.ts` | `tests/retrieval/vector-processing.test.ts`, provider malformed-response tests, recall degradation and indexing retry tests |
| FR-008 | Keep the existing local pipeline for Nomic/raw-compatible models. Add an EmbeddingGemma executor using Transformers.js Q8 tokenizer/model loading and `sentence_embedding`; add a Qwen3-Embedding Q8 executor using native hidden state, attention mask, and last-token pooling. Remote LM Studio continues through `/v1/embeddings` with exact model IDs. | `src/retrieval/local-transformers-provider.ts`, `src/retrieval/remote-provider.ts`, `src/retrieval/provider-factory.ts` | Mocked local loader/pooling tests, remote payload tests, optional real-host smoke through the benchmark |
| FR-009 | Select observation `title` during chunk indexing and propagate it as ephemeral embedding metadata for both chunk and sentence documents without adding columns or changing stored content. | `src/indexing/jobs.ts` | Focused indexing job tests in `tests/store/index.test.ts` |
| FR-010 | Add a committed bilingual technical/code corpus and a semantic-only three-model runner supporting LM Studio and local Transformers.js, with Markdown rendering and atomic JSON persistence through `--output`. Decision evidence is written to `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json`. | `src/evals/embedding-model-corpus.ts` (new), `src/evals/embedding-models.ts` (new), `package.json`, `README.md`, active change evidence | `tests/evals/embedding-models.test.ts`, durable live command evidence |
| FR-011 | Require all three complete valid runs. Evaluate each candidate against absolute thresholds and Nomic no-regression without requiring Nomic to meet the candidate thresholds. Select eligible winner by arithmetic mean of Recall@1/Recall@5/MRR, then MRR, Recall@1, Recall@5, and lexical profile ID. Persist `gate.passed`, eligibility/reasons, and `gate.defaultDecision`; operational size/latency remain reported, not gating. | `src/evals/embedding-models.ts`, `openspec/changes/embedding-profiles-embeddinggemma/contracts/embedding-benchmark.md`, `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json` | Deterministic winner/tie, weak-baseline, regression, unavailable-model, malformed-vector, persistence, and exit-code tests |
| FR-012 | Keep the current constant until a durable live gate is run. The implementation workflow reads `benchmark-result.json` once: a true `gate.passed` is applied to the shipped constant as its EmbeddingGemma or Qwen winner; false/incomplete evidence leaves Nomic. Product runtime and permanent tests never import/read OpenSpec. Update native dimensions, materialized config, docs, and tests to the applied outcome; Oracle compares artifact and constant before archive. | `src/config.ts`, `config.schema.json`, `README.md`, `tests/config.test.ts`, active benchmark result | Default materialization/hash tests plus pre-archive artifact-to-constant verification |

### Implementation sequence

1. Add failing tests for Nomic/EmbeddingGemma/Qwen profile resolution/formatting and vector post-processing, then implement the profile and validation primitives.
2. Add failing provider tests, migrate the provider interface and adapters, add EmbeddingGemma sentence-output and Qwen last-token local execution, and preserve provider order/error semantics.
3. Add failing config/hash tests, then implement additive persisted/env fields and resolved preprocessing lineage.
4. Add failing HyDE/indexing tests, then propagate per-input roles and optional observation titles.
5. Add failing benchmark contract/gate tests, then implement the corpus, runner, reports, package command, and documentation.
6. Run the live Nomic-vs-EmbeddingGemma-vs-Qwen benchmark against explicitly configured models, atomically persist the full outcome, and apply FR-012 conditionally from that file.
7. Run focused suites, build, full tests, and the existing retrieval eval; simplify only after behavior is green.

### Benchmark and default decision

- Quality ranking uses cosine similarity over provider-neutral L2-normalized vectors; this is isolated to the comparison runner and does not change production sqlite-vec score conversion.
- Each case supplies one query, one expected document ID, and shared candidate documents. The corpus includes Spanish, English, mixed-language technical memory, and natural-language-to-code retrieval.
- Gate thresholds and the winner function are pinned in `contracts/embedding-benchmark.md`; comparisons use identical corpus/order and each model's resolved asymmetric profile.
- Both candidates must be no worse than the Nomic baseline on each quality metric to become eligible, while Nomic itself is not subject to the candidate absolute thresholds. Quality score is the arithmetic mean of Recall@1, Recall@5, and MRR; ties use MRR, Recall@1, Recall@5, then lexical profile ID.
- The runner must atomically write the complete JSON report before returning any exit status so a rejected or successful default decision remains durable and diagnosable.
- The implementation workflow consumes `gate.passed` and `gate.defaultDecision` from the persisted artifact and applies the result to a source constant; product runtime and permanent tests remain independent of the active OpenSpec path. Verification compares artifact and constant before archive rather than assuming either candidate wins.

## Optional support artifacts

- `research.md`: Not needed; model behavior, identifiers, dimensions, and Q8 constraints were resolved before specification and are encoded as testable requirements.
- `data-model.md`: Not needed; no durable schema/table shape changes are planned.
- `contracts/`: `contracts/embedding-benchmark.md` is required to pin benchmark inputs, report fields, thresholds, winner selection, failure semantics, and the conditional default decision.
- `benchmark-result.json`: Required implementation/outcome evidence generated by the live three-model decision run and consumed by the default-decision tasks and final verification.
- `quickstart.md`: Not needed; operator usage belongs in the existing README evaluation/configuration sections.

## Risks and migrations

- Existing implicit Nomic preprocessing will receive an explicit resolved profile in the hash and may enqueue a one-time semantic rebuild. Mitigation: preserve exact Nomic document/query strings and use the existing idempotent queue. Rollback: restore prior config/model/profile and rebuild.
- Local EmbeddingGemma may expose output differently from the generic feature-extraction pipeline. Mitigation: use the documented `sentence_embedding` output path, strict runtime shape checks, mocked loader tests, and live provider evidence where available.
- Local Qwen3-Embedding uses causal-model hidden states rather than the generic mean-pooled feature path. Mitigation: isolate attention-mask-aware last-token pooling, verify native 1024 dimensions and mixed-length batches, and fail closed when the expected output is absent.
- Provider-neutral normalization changes remote providers that return unnormalized vectors. Mitigation: make normalization explicit/default-on, hash it into lineage, reject zero/non-finite vectors, and rebuild consistently. Rollback: set `normalize: false` explicitly and rebuild.
- HyDE document-role formatting changes semantic contribution for asymmetric profiles and Nomic. Mitigation: preserve raw-query input, source labels, fallback, and fusion order; cover success/failure/timeout.
- Title-aware Gemma documents alter vector content without changing stored observation text. Mitigation: hash profile version, rebuild, and keep title metadata ephemeral.
- EmbeddingGemma and especially Qwen3-Embedding have larger local footprints and may be slower. Mitigation: report model bytes when available plus exact dimensions/norms/latency; quality controls the requested default decision while operational costs remain visible.
- A configured provider may omit one of the three benchmark models. Mitigation: do not download or load models automatically; incomplete runs fail closed, and local Transformers.js remains an alternative provider mode.
- Live benchmark infrastructure can be unavailable. Mitigation: atomically persist complete diagnostics when possible, fail closed, keep Nomic, and leave the benchmark rerunnable without code edits.
- Rollback requires no database migration: pin the prior model/profile or revert the conditional default, restart, and let config-hash mismatch enqueue a rebuild.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped files add profile/eval internals and one package script without touching six-tool MCP registration.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Recall explicitly catches every semantic validation/provider failure, records degradation, and continues lexical + KG; indexing preserves retry semantics and the benchmark fails closed.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Structured inputs express retrieval intent/role/title independently of LM Studio, Transformers.js, or any agent harness.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No plan step changes result budgets, lane top-k, surgical trimming, or compact/context/get rendering.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Profile/normalization config is additive, legacy config resolves automatically, and all existing public tool/HTTP/CLI contracts remain intact.
