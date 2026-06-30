# Delta for Config

> Change A — Output Caps Only. Maps to baseline `openspec/specs/config/spec.md`.
> ADDS the new `maxContextChars` OUTPUT-budget knob with deterministic
> resolution mirroring the existing embedding-resolution requirement, and
> establishes the spec-level invariant that the existing `maxContentLength` knob
> is INPUT-validation warn-only (the code already behaves this way in
> `validateContentLength`, `src/utils/content.ts:14-26`) and is DISTINCT from the
> new output cap. No baseline requirement is removed.

## ADDED Requirements

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

## Assumptions

> Resolved by `sdd-clarify`. The four caps-design items below were applied
> informed-guess-first during spec authoring and have since been CONFIRMED as
> authoritative decisions by the orchestrator (low-stakes tunables; no user
> escalation required). They are recorded here as settled decisions, not open
> questions. No `[NEEDS CLARIFICATION]` markers remain in this spec.

- **Default value (CONFIRMED).** Built-in default `maxContextChars = 8000`.
  Rationale: ≈ 20 default previews (~300 chars each) plus headers/metadata, set
  modestly above `mem_recall`'s `MAX_CONTEXT_CHARS = 6000` because context/summary
  spans multiple recent observations. Kept as a single documented default with no
  per-surface divergence.
- **Knob naming (CONFIRMED).** Config key `maxContextChars`; environment override
  `THOTH_MAX_CONTEXT_CHARS`, mirroring the existing `THOTH_*` resolution pattern.
  Chosen so the OUTPUT cap reads as clearly distinct from the INPUT
  `maxContentLength` knob.
- **Resolution order (CONFIRMED).** `THOTH_MAX_CONTEXT_CHARS` env > persisted
  `config.json` > built-in default, consistent with the existing scalar resolution
  in `src/config.ts` (e.g. `maxContentLength`, `src/config.ts:420`).
- **Shared budget plus per-call override (CONFIRMED).** A single shared
  `maxContextChars` enforced at the `Store.getContext` layer (so `mem_context`,
  `mem_project action=summary`, the HTTP summary path, and the CLI all inherit
  it), PLUS an optional per-call override parameter exposed on `mem_context` and
  `mem_project action=summary`. Distinct *default* values per surface are NOT
  introduced; the shared default plus per-call override is sufficient.
- **Unbounded sentinel (CONFIRMED).** The value `0` means "no output cap"
  (explicit opt-out). It is selectable only by explicit configuration and is never
  the default.

## Handoff Hints

For the design phase to preserve:

- Scope is OUTPUT CAPS ONLY; pruning items are deferred to owner changes
  (D-1/D-2 → `production-hardening-dashboard-v2`, D-3 → `sync-and-resilience`).
- Enforce the bound at the shared `Store.getContext` layer so HTTP
  (`src/http-routes.ts:1032`) and CLI (`src/cli.ts:380`) inherit it; do NOT add
  per-surface bounding code.
- `maxContentLength` (input, warn-only) and `maxContextChars` (output, enforced)
  must stay distinct and non-conflated.
- Reuse `truncateForPreview` and the `trimToBudget` pattern; do not invent a new
  trimming algorithm.
- The caps-design decisions are LOCKED (confirmed by clarify): default
  `maxContextChars = 8000`; config key `maxContextChars` / env
  `THOTH_MAX_CONTEXT_CHARS`; resolution env > persisted > default; shared budget
  at `Store.getContext` plus per-call override on `mem_context` /
  `mem_project action=summary`; unbounded sentinel `0`. Design MUST adopt these
  values as-is and MUST NOT re-open them.
