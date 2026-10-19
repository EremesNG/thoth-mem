# Delta for Retrieval

## ADDED Requirements

### Requirement: Retrieval Embedding Profiles MUST Be Deterministic and Idempotent
The system MUST resolve immutable versioned Nomic, EmbeddingGemma, Qwen3-Embedding, and raw profiles from explicit selection or deterministic model aliases and MUST apply each profile's asymmetric query/document format exactly once.

#### Scenario: Built-in asymmetric formats are applied
- GIVEN a structured retrieval input for a known profile
- WHEN it is formatted
- THEN Nomic MUST use `search_query` or `search_document`, EmbeddingGemma MUST use its query task or title/text document structure, and Qwen3 MUST instruct only queries while leaving documents uninstructed

#### Scenario: Unknown model uses raw fallback
- GIVEN profile selection is `auto` and the model family is unknown
- WHEN the profile resolves
- THEN the raw profile MUST preserve input text and expose that no built-in asymmetric profile was inferred

#### Scenario: Already formatted text is embedded again
- GIVEN input already contains the selected profile envelope
- WHEN formatting runs
- THEN the envelope MUST NOT be duplicated

### Requirement: Retrieval Embedding Inputs MUST Preserve Per-Item Roles
The provider-neutral embedding contract MUST carry ordered text, retrieval intent, query/document role, and optional document title for every input in a batch.

#### Scenario: HyDE succeeds
- GIVEN a raw query and a generated hypothetical answer
- WHEN semantic inputs are constructed
- THEN the raw query MUST have query role, the HyDE answer MUST have document role, and vector/source ordering MUST remain stable

#### Scenario: HyDE is unavailable
- GIVEN HyDE is disabled, empty, failed, or timed out
- WHEN semantic inputs are constructed
- THEN raw-query semantic retrieval MUST remain available

### Requirement: Embedding Vectors MUST Be Validated Before Use
Every embedding batch MUST preserve input order, match the expected row count and configured dimensions, contain only finite non-zero vectors, and be L2-normalized when enabled.

#### Scenario: Provider returns malformed vectors
- GIVEN a provider returns a missing row, invalid index, zero vector, non-finite value, or unexpected dimension
- WHEN the batch is validated
- THEN the entire batch MUST be rejected without partial use

#### Scenario: Semantic recall fails
- GIVEN provider transport or vector validation fails during hybrid recall
- WHEN retrieval continues
- THEN semantic retrieval MUST report an explicit degradation reason while lexical and KG lanes remain available

### Requirement: Remote and Local Providers MUST Honor the Same Profile Contract
LM Studio, Ollama, and local Transformers.js adapters MUST consume the same structured inputs and return validated vectors in input order. Local EmbeddingGemma MUST use Q8 sentence embeddings at native 768 dimensions, and local Qwen3-Embedding-0.6B MUST use Q8 attention-mask-aware last-token pooling at native 1024 dimensions.

#### Scenario: Candidate executes locally
- GIVEN an EmbeddingGemma or Qwen3 model identifier and a mixed-role batch
- WHEN the local adapter executes
- THEN it MUST select the corresponding executor, pooling contract, and native dimensions without applying Nomic-only assumptions

#### Scenario: Candidate executes remotely
- GIVEN an explicit LM Studio or Ollama model identifier
- WHEN the remote adapter executes
- THEN it MUST send profile-formatted strings with that exact model identifier and restore validated response order

## MODIFIED Requirements

## REMOVED Requirements
