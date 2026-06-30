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

### Requirement: Context Output Budget MUST Be Configurable With Deterministic Resolution
The system MUST provide a context/summary OUTPUT character-budget setting
(working name `maxContextChars`) and MUST resolve it in this precedence order:
explicit `THOTH_*` environment override (working name `THOTH_MAX_CONTEXT_CHARS`),
then persisted config in the resolved data dir
(`{THOTH_DATA_DIR|~/.thoth}/config.json`), then a built-in default. The resolved
value MUST govern the bound enforced by `Store.getContext` and therefore by
`mem_context`, `mem_project action=summary`, and the HTTP/CLI summary surfaces.
The built-in default `maxContextChars` MUST be `8000`: a finite, positive
character count aligned with the existing capped retrieval patterns (`mem_recall`
`MAX_CONTEXT_CHARS=6000`; `formatContextResults` `maxChars=4000`;
`formatProjectGraph` `maxChars=6000`) and set modestly above `mem_recall`'s
`6000` because context/summary output aggregates multiple recent observations
(recent sessions, prompts, observation previews, and memory stats) in one render.
The default MUST be a single documented value; per-surface default divergence
MUST NOT be introduced (per-call override is provided separately below).

#### Scenario: Environment override wins for the output budget
- GIVEN both a persisted `maxContextChars` and the `THOTH_MAX_CONTEXT_CHARS`
  environment variable are set
- WHEN the effective output budget is computed
- THEN the environment value MUST take precedence

#### Scenario: Persisted value is used when environment is unset
- GIVEN no `THOTH_MAX_CONTEXT_CHARS` environment override is set
- WHEN persisted config contains a `maxContextChars` value
- THEN the effective output budget MUST match the persisted value

#### Scenario: Built-in default applies when unset everywhere
- GIVEN neither an environment override nor a persisted value is present
- WHEN the effective output budget is computed
- THEN the finite, positive built-in default of `8000` MUST be applied

#### Scenario: Per-call override supersedes the resolved default without persisting
- GIVEN a resolved default `maxContextChars` (from env, persisted config, or the
  built-in default)
- WHEN a caller supplies an explicit per-call output budget to `mem_context` or
  `mem_project action=summary`
- THEN that per-call value MUST govern the bound for that invocation only
- AND the resolved default MUST be unchanged for subsequent calls (the override
  MUST NOT mutate persisted configuration)

### Requirement: Context Output Budget MUST Support An Unbounded Sentinel
The output-budget configuration MUST support the explicit, documented sentinel
value `0`, meaning "no output cap", that disables the bound (restoring full-dump
output) for rollback and debugging. The sentinel `0` MUST be selectable only by
an explicit configured value (via `THOTH_MAX_CONTEXT_CHARS` or persisted config)
and MUST NOT be the default; because the default is finite and positive (`8000`),
the sentinel is never reached by default. When `0` is resolved, `Store.getContext`
MUST NOT truncate output by the budget.

#### Scenario: Sentinel disables the output bound
- GIVEN the unbounded sentinel `0` is configured (via environment or persisted
  config)
- WHEN the effective output budget is resolved and applied
- THEN context/summary output MUST NOT be truncated by `maxContextChars`
- AND WHEN the sentinel is absent
- THEN the finite resolved budget MUST be enforced

### Requirement: maxContentLength MUST Be Input-Validation Warn-Only And Distinct From The Output Cap
The existing `maxContentLength` setting (default 100000) MUST be defined at the
spec level as an INPUT-validation, save-time concern that WARNS and MUST NOT
silently truncate written content (the behavior already implemented by
`validateContentLength`, `src/utils/content.ts:14-26`, surfaced through
`src/config.ts`). `maxContentLength` MUST remain conceptually and operationally
DISTINCT from `maxContextChars`: `maxContentLength` governs the size of content
on the way IN (write/save validation), while `maxContextChars` governs the size
of rendered context on the way OUT (read/retrieval). The two MUST NOT be
conflated, and changing one MUST NOT change the behavior governed by the other.

#### Scenario: Oversized save warns without truncation
- GIVEN content longer than `maxContentLength` is saved
- WHEN the content is validated at save time
- THEN a warning MUST be produced advising the content is large
- AND the stored content MUST NOT be silently truncated

#### Scenario: Input and output knobs are independent
- GIVEN `maxContextChars` is changed
- WHEN content is saved
- THEN save-time `maxContentLength` validation behavior MUST be unchanged
- AND GIVEN `maxContentLength` is changed
- WHEN context/summary output is rendered
- THEN the `maxContextChars` output bound MUST be unchanged

## MODIFIED Requirements

## REMOVED Requirements
