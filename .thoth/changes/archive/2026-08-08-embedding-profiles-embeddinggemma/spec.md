# Feature Specification: Model-aware embedding profiles and three-model default gate

**Change ID**: `embedding-profiles-embeddinggemma`<br>
**Route**: Accelerated<br>
**Status**: Implemented

## Intent and scope

**Why**: Semantic recall should apply the asymmetric query/document contract required by the selected embedding model instead of relying on one Nomic-specific string check. EmbeddingGemma and Qwen3-Embedding-0.6B should work end to end through LM Studio and local Transformers.js, and either should replace Nomic as the local default only when a reproducible three-model comparison shows no retrieval-quality regression.<br>
**Impact**: Existing configurations remain valid, semantic input formatting becomes profile-driven, embedding lineage includes preprocessing behavior and native dimensions, HyDE uses the role appropriate to its hypothetical document, and a durable three-model benchmark controls the default-model decision.<br>
**Affected capabilities**: `config`, `retrieval`, `indexing`, `evals`

## User stories

### US1 - Model-aware asymmetric retrieval (Priority: P1)

As an operator, I can select an embedding model without manually rewriting saved content or queries so that semantic recall uses the model's intended asymmetric retrieval contract.

**Independent test**: Resolve Nomic, EmbeddingGemma, Qwen3-Embedding, and unknown model identifiers through automatic and explicit profiles, then assert exact formatted query/document inputs and stable batch ordering.

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-007, SC-001, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** an EmbeddingGemma model with automatic profile selection, **When** a query and titled document are embedded, **Then** the query uses the retrieval-query instruction and the document uses the title/text structure prescribed by EmbeddingGemma.
2. **Given** a Nomic model with automatic profile selection, **When** query and document inputs are embedded, **Then** the existing `search_query` and `search_document` behavior is preserved without duplicate prefixes.
3. **Given** an unknown model, **When** automatic profile selection runs, **Then** the raw profile is selected deterministically and the runtime exposes that model-specific asymmetric formatting was not inferred.
4. **Given** HyDE succeeds, **When** semantic inputs are embedded, **Then** the original query has query role and the hypothetical answer has document role while their result ordering and source labels remain stable.
5. **Given** a Qwen3-Embedding-0.6B model, **When** query and document inputs are embedded, **Then** only the query receives the fixed retrieval instruction and the document remains an uninstructed passage.
6. **Given** semantic embedding raises a provider or vector-validation error during recall, **When** hybrid retrieval continues, **Then** semantic retrieval is marked degraded and lexical plus KG results remain available.

### US2 - Provider-parity EmbeddingGemma support (Priority: P1)

As an operator, I can run EmbeddingGemma and Qwen3-Embedding-0.6B through LM Studio or local Transformers.js so that provider choice does not change each model's profile contract or vector-safety guarantees.

**Independent test**: Exercise both provider adapters with the same structured inputs and assert resolved profile formatting, native 768- or 1024-dimensional finite output, normalization, deterministic errors, and unchanged input order.

**Covers**: FR-005, FR-006, FR-007, FR-008, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** LM Studio exposes `text-embedding-embeddinggemma-300m`, **When** the remote adapter embeds structured query and document inputs, **Then** it sends the exact resolved model identifier and profile-formatted strings to the OpenAI-compatible embeddings endpoint.
2. **Given** the local EmbeddingGemma ONNX model, **When** the Transformers.js adapter embeds the same inputs, **Then** it uses the model's supported Q8 inference path and returns its sentence embeddings rather than applying a Nomic-only execution assumption.
3. **Given** any provider returns non-finite values, an unexpected row count, an empty vector, or a dimension different from configured metadata, **When** results are validated, **Then** no partial vector batch is accepted and the error identifies the violated contract.
4. **Given** normalization is enabled, **When** a finite non-zero vector is returned, **Then** the stored/query vector is L2-normalized by provider-neutral post-processing.
5. **Given** the local Qwen3-Embedding ONNX model, **When** the Transformers.js adapter embeds a mixed-role batch, **Then** it applies last-token pooling over each attention-masked sequence and returns native 1024-dimensional embeddings in input order.
6. **Given** a provider or vector validation error occurs during recall, **When** hybrid retrieval continues, **Then** semantic retrieval is explicitly marked degraded while lexical and KG lanes remain available; indexing propagates the same error to its existing retry path and the benchmark fails closed.

### US3 - Benchmark-gated default decision (Priority: P1)

As a maintainer, I can compare Nomic, EmbeddingGemma, and Qwen3-Embedding-0.6B on the same multilingual and code-oriented retrieval corpus so that the shipped local default is evidence-based.

**Independent test**: Run the model-comparison benchmark with deterministic fixtures and explicit model endpoints, inspect Recall@1, Recall@5, MRR, latency, dimensions, normalization, and gate status, and verify the default decision follows the result.

**Covers**: FR-009, FR-010, FR-011, FR-012, SC-005, SC-006, SC-007, SC-008

**Acceptance scenarios**:

1. **Given** all three models are available, **When** the benchmark runs, **Then** each model receives identical queries/documents through its resolved profile and the report includes per-model quality and operational metrics.
2. **Given** all three runs are complete, **When** a candidate satisfies the absolute thresholds and is no worse than Nomic on Recall@1, Recall@5, and MRR, **Then** it becomes eligible and the deterministic quality score and tie-break order select the winning eligible candidate even when Nomic itself is below the candidate thresholds.
3. **Given** neither candidate is eligible, any model is unavailable, or benchmark execution/evidence persistence is incomplete, **When** the gate is evaluated, **Then** the gate fails closed and Nomic remains the shipped local default.
4. **Given** the effective default model or resolved preprocessing lineage changes, **When** semantic index state is reconciled, **Then** existing vectors are marked stale and an idempotent rebuild is enqueued.
5. **Given** a live benchmark finishes, **When** its human-readable report is rendered, **Then** the complete machine-readable report is also written to `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json` before the process exits.

## Edge cases

- Automatic profile detection sees an alias, quantization suffix, mixed case, or provider-specific prefix around a known model family.
- An explicit profile is used with a custom model identifier that automatic detection cannot recognize.
- Input text already contains the selected profile's query/document prefix.
- A document has an empty, missing, unusually long, or delimiter-containing title.
- One batch contains query and document roles, including a HyDE-generated hypothetical document, and the provider returns rows out of order or with missing indexes.
- A Qwen query already contains the built-in instruction envelope, or its document contains text that resembles an instruction prefix.
- A remote provider already normalizes vectors, so application normalization must remain numerically stable and idempotent.
- A provider returns a zero vector, NaN, infinity, an unexpected dimension, or fewer/more vectors than inputs.
- An existing configuration omits profile and normalization fields.
- Benchmark endpoint/model configuration is missing or one model fails after the other succeeds.
- One candidate dominates one quality metric but not another; the pinned aggregate score and tie-break sequence must still select exactly one winner.
- An eligible candidate has higher latency, dimensions, or footprint; these operational metrics remain visible even though the quality gate is authoritative for this change.

## Functional requirements

- **FR-001 — Deterministic profile resolution**: `[ADDED retrieval]` The system MUST resolve a versioned embedding profile from explicit configuration or deterministic `auto` detection for Nomic, EmbeddingGemma, Qwen3-Embedding, and raw fallback model families.
- **FR-002 — Structured retrieval inputs**: `[ADDED retrieval]` The embedding contract MUST carry text, retrieval intent, query/document role, and optional document title without exposing a global public `task` setting.
- **FR-003 — Exact and idempotent asymmetric formatting**: `[ADDED retrieval]` Each built-in profile MUST produce its documented query/document representation exactly once and preserve input text. Nomic MUST retain its query/document prefixes; EmbeddingGemma MUST use its retrieval-query and title/text structures with `title: none` when unavailable; Qwen3-Embedding MUST apply the fixed internal retrieval instruction only to queries and leave documents uninstructed.
- **FR-004 — Role-correct HyDE embeddings**: `[ADDED retrieval]` Raw recall queries MUST use query role while successful HyDE hypothetical answers MUST use document role; disabled, failed, or timed-out HyDE MUST preserve raw-query retrieval.
- **FR-005 — Backward-compatible profile configuration**: `[ADDED config]` Persisted configuration, schema validation, and environment precedence MUST support profile selection and provider-neutral normalization while configurations that omit the new fields resolve deterministically.
- **FR-006 — Preprocessing-aware index lineage**: `[ADDED config]` Embedding configuration metadata and its deterministic hash MUST include the resolved profile identity/version and normalization behavior so any vector-space-affecting preprocessing change invalidates prior semantic lineage.
- **FR-007 — Provider-neutral vector validation and boundary policy**: `[ADDED retrieval]` Embedding results MUST be validated as an order-preserving batch of finite, non-zero vectors matching configured dimensions, and normalization MUST be applied consistently when enabled before storage or querying. Recall MUST catch provider/validation errors, expose an explicit semantic-degradation reason, and continue lexical plus KG retrieval; indexing MUST propagate them to the established retry path; the benchmark MUST fail closed.
- **FR-008 — Candidate provider parity**: `[ADDED retrieval]` EmbeddingGemma and Qwen3-Embedding-0.6B MUST be supported by the LM Studio OpenAI-compatible adapter and local Transformers.js. Local execution MUST use `onnx-community/embeddinggemma-300m-ONNX` at Q8 with its sentence-embedding output contract and `onnx-community/Qwen3-Embedding-0.6B-ONNX` at Q8 with attention-mask-aware last-token pooling, respectively.
- **FR-009 — Title-aware semantic indexing**: `[ADDED indexing]` Chunk and sentence indexing MUST retain the source observation title as optional document metadata for profile formatting without altering persisted source content or lexical retrieval text.
- **FR-010 — Reproducible durable model comparison**: `[ADDED evals]` A runnable benchmark MUST compare Nomic, EmbeddingGemma, and Qwen3-Embedding-0.6B over the same committed multilingual, technical-memory, and code-retrieval cases and report Recall@1, Recall@5, MRR, per-model errors, dimensions, vector norms, latency, model bytes when available, corpus hash, and explicit gate/default status. Every decision run MUST persist the complete JSON report at `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json` before exit.
- **FR-011 — Fail-closed quality gate and winner selection**: `[ADDED evals]` The default-change gate MUST pass only when all three model runs and the durable report are complete. Each candidate MUST satisfy corpus thresholds and be no worse than Nomic on Recall@1, Recall@5, and MRR to be eligible; Nomic acts as the relative comparator and is not required to satisfy the candidates' absolute thresholds. Among eligible candidates, the highest arithmetic mean of those three metrics wins; exact-score ties MUST resolve by higher MRR, then Recall@1, then Recall@5, then lexical profile ID. Unavailable or incomplete evidence MUST fail the gate.
- **FR-012 — Conditional local default**: `[ADDED config]` During implementation, the shipped `transformers_local` product constant MUST change from Nomic to the eligible winner recorded in `gate.defaultDecision` only when persisted workflow evidence has `gate.passed: true`; otherwise the current Nomic default MUST remain. Product runtime and permanent tests MUST NOT read the active OpenSpec evidence path, and the selected constant's native dimensions MUST materialize consistently.

## Success criteria

- **SC-001** `[buildable]`: All built-in profiles pass automated tests for exact, idempotent query/document formatting and deterministic `auto`/explicit resolution for Nomic, EmbeddingGemma, Qwen3-Embedding, aliases, and raw fallback.
- **SC-002** `[buildable]`: All mixed-role batch tests pass while preserving ordering and assigning query role to the raw query and document role to the HyDE hypothetical answer.
- **SC-003** `[buildable]`: All focused provider-adapter tests pass for EmbeddingGemma and Qwen3-Embedding inputs, native 768/1024-dimensional finite vectors, correct local output pooling, normalization, row-count/order validation, dimension validation, zero/non-finite rejection, and recall fallback after provider/validation errors while indexing still retries.
- **SC-004** `[buildable]`: All configuration compatibility tests pass and profile identity/version or normalization changes alter the semantic config hash and enqueue the established rebuild path.
- **SC-005** `[buildable]`: All benchmark contract tests pass; the command returns machine-readable and human-readable reports, permits an eligible candidate to win when Nomic is below the candidates' absolute thresholds, and exits non-zero when any of the three runs is missing/invalid, no candidate is eligible, winner selection is ambiguous, or evidence persistence fails. One complete ineligible candidate does not block another complete eligible candidate.
- **SC-006** `[outcome]`: At least 1 live benchmark run against explicitly configured Nomic, EmbeddingGemma, and Qwen3-Embedding models persists complete quality, latency, dimension, normalization, corpus-hash, eligibility, winner, and gate evidence at `openspec/changes/embedding-profiles-embeddinggemma/benchmark-result.json`.
- **SC-007** `[buildable]`: All default-decision tests pass against the shipped product constant and native 768/1024-dimensional metadata without a runtime dependency on OpenSpec; before archive, independent verification confirms that constant exactly matches persisted `gate.passed` and `gate.defaultDecision` workflow evidence.
- **SC-008** `[buildable]`: All focused profile/provider/config/indexing/eval tests, the repository build, the full test suite, and the existing retrieval eval pass without regression.

## Assumptions

- Retrieval is the only embedding intent in this change; classification, clustering, and semantic-similarity intents are not public configuration.
- EmbeddingGemma uses its native 768-dimensional output and Qwen3-Embedding-0.6B uses its native 1024-dimensional output; MRL truncation is not part of this change.
- A live decision run occurs only after the selected provider exposes explicit Nomic, EmbeddingGemma, and Qwen3-Embedding identifiers; missing models remain a fail-closed precondition and never authorize automatic download or loading.
- Rank-based hybrid fusion remains the main cross-model aggregation mechanism while this change preserves the existing distance-to-score contract.
- Existing provider/model configuration overrides continue to win over shipped defaults.

## Dependencies

- `@huggingface/transformers` and the published `onnx-community/embeddinggemma-300m-ONNX` and `onnx-community/Qwen3-Embedding-0.6B-ONNX` artifacts for the local adapter.
- An OpenAI-compatible LM Studio embeddings endpoint for remote smoke and benchmark evidence.
- Existing sqlite-vec semantic tables, config-hash lineage, rebuild queue, HyDE generation, and retrieval evaluation infrastructure.

## Out of scope

- MRL truncation below each model's native 768- or 1024-dimensional output.
- New embedding intents such as classification, clustering, similarity, or specialized code-query tasks.
- Replacing the existing `exp(-distance / 20)` score conversion or retuning global semantic thresholds in the same change.
- Automatically downloading, installing, loading, or discovering models on external providers.
- Changing user-selected provider/model overrides when a new shipped default is selected.
- Modifying lexical, graph/KG, community-summary, or maintenance ranking behavior beyond regression verification.
