# Delta for Config

## ADDED Requirements
### Requirement: Embedding Configuration Resolution MUST Be Deterministic
The system MUST resolve embedding settings in this precedence order: explicit `THOTH_*` environment overrides, then persisted config in the resolved data dir (`{THOTH_DATA_DIR|~/.thoth}/config.json`), then local fallback when no provider is configured.

#### Scenario: Environment overrides win
- GIVEN both persisted config and `THOTH_*` embedding variables are present
- WHEN effective embedding configuration is computed
- THEN environment values MUST take precedence for overlapping fields

#### Scenario: Persisted config is used when environment is unset
- GIVEN no embedding-related environment overrides are set
- WHEN persisted config contains embedding provider settings
- THEN effective embedding configuration MUST match persisted config

#### Scenario: Local fallback is used only when provider is unset
- GIVEN no embedding provider is configured in environment or persisted config
- WHEN embedding configuration is computed
- THEN local Transformers.js fallback SHALL be selected

### Requirement: Embedding Metadata MUST Be Canonical for Index Lineage
The system MUST derive stable metadata for active embedding configuration, including provider, model, dimensions, and deterministic config hash used by semantic index lineage/rebuild detection.

#### Scenario: Config hash remains stable for equivalent config
- GIVEN two logically equivalent embedding configurations
- WHEN metadata is computed
- THEN the derived config hash MUST be identical

#### Scenario: Config hash changes when embedding identity changes
- GIVEN provider/model/dimensions settings change
- WHEN metadata is recomputed
- THEN the derived config hash MUST change

## MODIFIED Requirements

## REMOVED Requirements
