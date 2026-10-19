# Implementation Plan: Transformers local execution device selection

## Technical context

`EmbeddingConfig` is materialized in `src/config.ts` from environment overrides, an editable `{dataDir}/config.json`, and defaults. The editable default is backfilled on load, while runtime-only `configHash` and `resolvedProfile` fields are stripped before persistence. The semantic hash currently covers provider, model, base URL, dimensions, resolved profile version, and normalization. `LocalTransformersEmbeddingProvider` creates one cached executor and forwards model-specific `{ dtype: 'q8' }` options to either `pipeline()` or `AutoModel.from_pretrained()`.

This change adds a public `EmbeddingDevice` taxonomy and materialized `EmbeddingConfig.device`. `THOTH_EMBEDDING_DEVICE` overrides persisted `embedding.device`; absence resolves to `cpu`. The selector is passed unchanged through the existing `PipelineOptions` seam. It is intentionally excluded from the semantic hash because it changes the ONNX execution provider, not the embedding model contract. Explicit unsupported providers remain Transformers.js initialization failures; thoth-mem neither probes hardware during configuration loading nor silently substitutes CPU. `auto` delegates execution-provider ordering and fallback to Transformers.js.

Affected public and verification surfaces are `src/config.ts`, `config.schema.json`, `src/retrieval/local-transformers-provider.ts`, `src/evals/embedding-models.ts`, `tests/config.test.ts`, `tests/retrieval/local-transformers-provider.test.ts`, `tests/retrieval/remote-provider.test.ts`, `tests/store/index.test.ts`, and `README.md`. The exported type addition requires existing complete `EmbeddingConfig` construction sites to record `device: 'cpu'`; partial store configuration remains compatible. There is no database or sync migration.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design changes embedding configuration and local runtime options only; it registers zero MCP tools and preserves the exact six-tool surface.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Semantic execution remains optional, and existing lexical/KG fallback plus degraded signaling are untouched; explicit local initialization failures remain observable.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The execution-device selector is host-neutral configuration and introduces no harness-specific storage, payload, or lifecycle semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No recall limits, trimming, compression metadata, or response shapes change.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The configuration addition is additive, defaults to existing CPU behavior, and renames or removes zero public contract elements.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Export `EmbeddingDevice = 'auto' \| 'cpu' \| 'dml' \| 'cuda' \| 'coreml'`, add required `EmbeddingConfig.device`, declare the same enum/default in JSON Schema, and update every complete typed construction site with the CPU default. | `src/config.ts`; `config.schema.json`; `src/evals/embedding-models.ts`; `tests/retrieval/local-transformers-provider.test.ts`; `tests/retrieval/remote-provider.test.ts`; `tests/store/index.test.ts` | TypeScript build plus config schema assertions enumerate exactly five values and compile every complete config construction. |
| FR-002 | Add a strict, trim-and-lowercase device parser; resolve `THOTH_EMBEDDING_DEVICE` before persisted `embedding.device`. Invalid explicit values throw an allowed-values error rather than falling back. | `src/config.ts`; `EmbeddingDevice`; `resolveEmbeddingConfig()` | Table-driven config tests cover all five values, mixed-case/whitespace normalization, environment precedence, and an invalid value. |
| FR-003 | Extend `resolveLocalPipelineOptions(model, device)` to merge the exact device with current dtype selection; use its result for both `pipeline()` and direct `AutoModel.from_pretrained()` executor creation. | `src/retrieval/local-transformers-provider.ts`; `PipelineOptions`; `LocalEmbeddingRuntime.createExecutor()` | Provider tests assert `{ dtype: 'q8', device }` for direct models and device forwarding for the generic pipeline path. |
| FR-004 | Add `device: 'cpu'` to the editable default and materialize CPU when neither environment nor persistence supplies a value. Existing device-free files are backfilled through the current merge/write path. | `src/config.ts`; `defaultPersistedConfig()`; `mergePersistedConfig()`; `resolveEmbeddingConfig()` | Default and backfill tests assert a single persisted/materialized CPU default. |
| FR-005 | Keep `device` outside `hashPayload`; do not modify store lineage/rebuild code. | `src/config.ts`; `EmbeddingConfig.configHash` | Config test compares at least two otherwise-identical device selections and asserts identical hashes. |
| FR-006 | Forward explicit selectors unchanged and add no catch/fallback around executor creation. `auto` is passed as `auto`, leaving supported-provider ordering to Transformers.js. | `src/retrieval/local-transformers-provider.ts` | Mock runtime rejects executor creation and the provider call rejects with the same error; call-count assertion proves zero fallback executor attempts. |
| FR-007 | Document persisted and environment configuration, five values, CPU default, OS expectations (`dml` Windows, `cuda` Linux x64 package support, `coreml` macOS), `auto`, cold-start behavior, and no-rebuild semantics. | `README.md`; `config.schema.json` | Documentation/schema review plus exact enum/default assertions in `tests/config.test.ts`. |
| SC-006 | Exercise the public configuration and real provider on the already verified Windows DirectML host with a representative two-input batch. | Runtime smoke using `getConfig()`/`LocalTransformersEmbeddingProvider`; no committed fixture | Oracle records dimensions, finiteness, norm tolerance, and any environmental capability gap. |

## Optional support artifacts

- `research.md`: Not needed; the installed Transformers.js 4.2.0 device mapping and an actual Q8 DirectML smoke were already inspected, and no dependency choice remains open.
- `data-model.md`: Not needed; this adds no database, durable record, or migration.
- `contracts/`: Not needed; `config.schema.json` is the authoritative machine-readable public configuration contract and is changed directly.
- `quickstart.md`: Not needed; the focused README example is sufficient for one optional configuration field.

## Risks and migrations

- **Execution provider unavailable**: `dml`, `cuda`, or `coreml` can be syntactically valid but unavailable on the current platform/package. Mitigation: document platform expectations, forward the explicit value, and preserve the upstream initialization error without fallback.
- **`auto` is environment-dependent**: Provider order may vary by platform or dependency version. Mitigation: document that `auto` delegates this choice; operators requiring determinism select an explicit device.
- **Cold-start regression**: GPU execution can have materially higher initialization cost than CPU for short-lived processes. Mitigation: retain CPU as default and document GPU selection as opt-in, most useful for persistent processes or larger rebuild batches.
- **Numerical variation without rebuild**: Execution providers can produce negligible floating-point differences. Accepted decision: treat device as execution-only and exclude it from semantic lineage; model, dtype, profile, normalization, and dimensions remain unchanged.
- **Editable config migration**: Existing device-free configuration files are additively backfilled with `device: 'cpu'`; no database migration is required. Rollback to a version whose schema lacks the property may require removing `embedding.device` from the editable JSON file.
- **Required TypeScript field propagation**: Complete `EmbeddingConfig` literals in the benchmark and tests must add `device: 'cpu'`; keeping the field required ensures all runtime adapters observe a fully materialized contract, while partial persisted/store inputs remain optional through their existing types.
- **Cross-platform verification gap**: The current host can verify CPU and Windows DirectML but not Linux CUDA or macOS CoreML. Mitigation: cover taxonomy and exact forwarding deterministically in tests and report the unobserved hardware paths as a capability gap rather than claiming runtime success.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped files contain no MCP registration surface, and verification includes no tool-contract change.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — The plan confines changes to optional semantic configuration/runtime loading and explicitly preserves current fallback and error signaling.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The device taxonomy maps to portable ONNX execution-provider identifiers and remains independent of Codex, OpenCode, Claude Code, or stored memory shapes.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Requirement mapping touches no retrieval output budgets, progressive modes, or compression evidence.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The schema change is additive with a CPU default, environment precedence is documented, and existing configurations remain materializable without deprecation.
