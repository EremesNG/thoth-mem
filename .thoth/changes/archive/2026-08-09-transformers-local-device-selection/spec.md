# Feature Specification: Transformers local execution device selection

**Change ID**: `transformers-local-device-selection`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Operators need an explicit, portable way to choose whether local ONNX embedding inference runs on CPU or an available hardware execution provider without replacing the embedding model or using a remote service.<br>
**Impact**: The embedding configuration gains an opt-in execution-device selector with CPU compatibility by default. Local Transformers.js inference receives the selected device, while semantic index lineage remains unchanged when only the execution device changes.<br>
**Affected capabilities**: `config`, `retrieval`

## User stories

### US1 - Select a local inference device (Priority: P1)

As an operator using `transformers_local`, I can select `cpu`, `dml`, `cuda`, `coreml`, or `auto` so that embedding inference uses the execution provider appropriate for my host.

**Independent test**: Materialize each accepted configuration value and verify that the local embedding runtime receives that exact device for both pipeline-backed and direct-model execution paths.

**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002

**Acceptance scenarios**:

1. **Given** a persisted `embedding.device` value, **When** configuration is loaded without an environment override, **Then** the selected supported value is materialized.
2. **Given** a persisted device and `THOTH_EMBEDDING_DEVICE`, **When** configuration is loaded, **Then** the environment value takes precedence.
3. **Given** a materialized `transformers_local` configuration, **When** its executor is created, **Then** the configured device is passed to Transformers.js without changing model-specific dtype selection.

### US2 - Preserve compatible defaults and index lineage (Priority: P1)

As an existing operator, I can upgrade without editing configuration or rebuilding semantic vectors so that the feature remains opt-in and backward-compatible.

**Independent test**: Load configuration without a device, compare semantic hashes across otherwise identical CPU and GPU selections, and verify the default and hash behavior.

**Covers**: FR-004, FR-005, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** no persisted or environment device selection, **When** configuration is loaded, **Then** `cpu` is materialized.
2. **Given** two otherwise identical local embedding configurations that differ only by device, **When** their semantic configuration hashes are calculated, **Then** the hashes are equal.
3. **Given** an existing persisted configuration without `device`, **When** it is loaded and saved, **Then** it remains valid and records the materialized CPU default.

### US3 - Receive actionable unsupported-device failures (Priority: P2)

As an operator, I receive validation or initialization failures instead of an unintended silent backend change so that explicit hardware selections are trustworthy.

**Independent test**: Reject an unknown configuration value and verify that an explicitly selected supported taxonomy value is forwarded unchanged, leaving platform support validation to Transformers.js.

**Covers**: FR-006, FR-007, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** a device value outside the public taxonomy, **When** configuration is loaded, **Then** loading fails with an actionable allowed-values error.
2. **Given** an explicit platform-specific device that Transformers.js cannot initialize, **When** the local executor loads, **Then** the initialization error is surfaced and thoth-mem does not silently switch to CPU.
3. **Given** `auto`, **When** the local executor loads, **Then** Transformers.js owns platform-specific provider ordering and fallback behavior.

## Edge cases

- Persisted device values may use mixed case or surrounding whitespace and should follow existing enum parsing conventions.
- `dml`, `cuda`, and `coreml` are valid configuration values even on hosts that cannot execute them; runtime availability remains dependent on the installed Transformers.js/ONNX Runtime build and platform.
- Remote embedding providers do not consume the local execution device even though the fully materialized embedding configuration retains its default.
- Changing only the device may introduce negligible floating-point differences but must not invalidate existing vectors.
- `auto` may select different execution providers across operating systems or dependency versions by design.

## Functional requirements

- **FR-001 — Public device taxonomy**: `[ADDED config]` The system MUST expose an embedding execution-device value restricted to `auto`, `cpu`, `dml`, `cuda`, and `coreml` in TypeScript and the public JSON schema.
- **FR-002 — Configuration precedence**: `[ADDED config]` The system MUST resolve `THOTH_EMBEDDING_DEVICE` before persisted `embedding.device` and validate either source against the public taxonomy.
- **FR-003 — Local runtime forwarding**: `[ADDED retrieval]` The `transformers_local` provider MUST pass the materialized device unchanged to every Transformers.js model-loading path while preserving existing model-profile dtype behavior.
- **FR-004 — CPU default**: `[ADDED config]` The system MUST materialize `cpu` when neither the environment nor persisted configuration selects a device.
- **FR-005 — Execution-only lineage**: `[ADDED config]` The system MUST exclude the execution device from semantic embedding lineage so that changing only the device neither changes `configHash` nor marks vectors stale.
- **FR-006 — Explicit selection integrity**: `[ADDED retrieval]` The system MUST NOT silently replace an explicitly selected device when Transformers.js reports that it is unsupported or cannot initialize it; `auto` MUST be delegated unchanged for provider fallback.
- **FR-007 — Operator documentation**: `[ADDED config]` The public configuration documentation MUST describe the accepted values, CPU default, environment override, platform expectations, `auto` semantics, cold-start tradeoff, and no-rebuild behavior.

## Success criteria

- **SC-001** `[buildable]`: Focused configuration tests accept 100% of the five device values, prove environment precedence over persistence, and reject at least 1 unknown value with the allowed taxonomy in the error.
- **SC-002** `[buildable]`: Focused provider tests prove that `device` and existing `dtype` are forwarded together through exactly 2 local model-loading paths: pipeline-backed and direct-model.
- **SC-003** `[buildable]`: 100% of focused configurations without a persisted or environment device materialize `cpu` and pass public schema validation.
- **SC-004** `[buildable]`: At least 2 otherwise identical local configurations with different device values produce byte-identical semantic `configHash` values.
- **SC-005** `[buildable]`: Error-path tests observe exactly 1 invalid-configuration rejection and exactly 1 propagated runtime initialization failure with zero thoth-mem fallback attempts.
- **SC-006** `[outcome]`: On a Windows host with the packaged DirectML provider, 100% of a representative 2-input `dml` smoke batch produces 768-dimensional finite vectors with norms within `1 ± 0.0001`.
- **SC-007** `[buildable]`: The README and JSON schema each enumerate exactly the same 5 device values and state `cpu` as the single default, environment precedence, platform guidance, and no-rebuild behavior.

## Assumptions

- Transformers.js continues to accept the five selected device identifiers in its model-loading options.
- The installed ONNX Runtime package determines actual execution-provider availability; thoth-mem does not probe hardware during configuration loading.
- Device selection affects execution performance, not the semantic identity of the embedding model.

## Dependencies

- `@huggingface/transformers` and its packaged ONNX Runtime execution providers.
- Existing embedding configuration materialization, persistence, schema validation, and semantic lineage logic.

## Out of scope

- Installing GPU drivers, CUDA, DirectML, CoreML, or alternate ONNX Runtime builds.
- Adding WebGPU or provider-specific ONNX session tuning.
- Automatically benchmarking or choosing the fastest device.
- Changing embedding batching, dtype/quantization, model defaults, vector dimensions, or remote provider behavior.
