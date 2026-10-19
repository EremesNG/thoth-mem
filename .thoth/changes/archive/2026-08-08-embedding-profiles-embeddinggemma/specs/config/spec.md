# Delta for Config

## ADDED Requirements

### Requirement: Embedding Profile Configuration MUST Resolve Compatibly
The system MUST accept `auto`, `nomic`, `embeddinggemma`, `qwen3`, and `raw` embedding profiles plus provider-neutral normalization, honor environment overrides, and deterministically materialize omitted fields for existing configurations.

#### Scenario: Existing configuration omits new fields
- GIVEN a persisted embedding configuration has no profile or normalization field
- WHEN effective configuration is resolved
- THEN the system MUST resolve profile `auto`, enable normalization, and preserve the configured provider and model

#### Scenario: Environment overrides persisted preprocessing
- GIVEN persisted profile and normalization values exist
- WHEN `THOTH_EMBEDDING_PROFILE` or `THOTH_EMBEDDING_NORMALIZE` is set
- THEN the corresponding environment value MUST win

### Requirement: Semantic Lineage MUST Include Resolved Preprocessing
Embedding configuration metadata and its deterministic hash MUST include resolved profile identity, profile version, normalization, model, provider, base URL, and native dimensions.

#### Scenario: Equivalent automatic and explicit profiles share lineage
- GIVEN one configuration resolves a known model through `auto` and another explicitly selects the same built-in profile
- WHEN their hashes are computed with otherwise equal settings
- THEN both configurations MUST produce the same semantic lineage hash

#### Scenario: Vector-space preprocessing changes
- GIVEN profile identity, profile version, normalization, model, or dimensions changes
- WHEN semantic lineage is reconciled
- THEN the hash MUST change so the established rebuild path can invalidate stale vectors

### Requirement: Local Embedding Default MUST Fail Closed
The shipped `transformers_local` default MUST remain Nomic unless complete durable three-model gate evidence passes and selects exactly one eligible EmbeddingGemma or Qwen3 candidate; product runtime MUST NOT read active OpenSpec evidence.

#### Scenario: Recorded gate selects EmbeddingGemma
- GIVEN complete decision evidence records `gate.passed: true` and `gate.defaultDecision: embeddinggemma`
- WHEN the shipped default is materialized
- THEN the EmbeddingGemma Transformers.js model with native 768 dimensions MUST become the product constant

#### Scenario: Recorded gate does not pass
- GIVEN decision evidence is missing, incomplete, invalid, or records `gate.passed: false`
- WHEN the shipped default is materialized
- THEN Nomic with native 768 dimensions MUST remain the product constant

#### Scenario: User config overrides the shipped default
- GIVEN an operator explicitly configures a provider, model, profile, or dimensions
- WHEN effective configuration is resolved
- THEN the explicit configuration MUST take precedence over the shipped local fallback

## MODIFIED Requirements

## REMOVED Requirements
