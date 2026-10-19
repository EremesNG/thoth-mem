# Delta for Tools

## ADDED Requirements
### Requirement: MCP Session and Save Tools MUST Preserve Explicit Identity
The existing `mem_session` and `mem_save` tools MUST preserve caller-provided `session_id` and `project` values when persisting sessions, prompts, session summaries, or observations. The tools MUST NOT replace explicit identity with compatibility placeholders such as `manual-save-*` or `unknown` when a non-empty caller-provided value is available.

#### Scenario: Explicit session start identity is preserved
- GIVEN a caller invokes `mem_session` with `action=start`, an explicit session id, and an explicit project
- WHEN the tool persists the session
- THEN the stored session MUST use the supplied session id
- AND the stored session MUST use the supplied project
- AND no compatibility fallback identity MUST be reported for that call

#### Scenario: Explicit save identity is preserved
- GIVEN a caller invokes `mem_save` for a prompt, session summary, or observation with explicit session id and project values
- WHEN the tool persists the record
- THEN the persisted record MUST remain associated with those explicit values where the target record type supports them
- AND the tool MUST NOT synthesize `manual-save-*` or `unknown` for the explicit values

### Requirement: Compatibility Fallback Identity MUST Be Observable and Deterministic
When `mem_session` or `mem_save` must retain backward-compatible behavior for missing identity, the tool response MUST make the fallback visible and MUST use deterministic placeholder values. Fallback visibility MUST identify which identity field was degraded and what placeholder value was used, without requiring a new MCP tool or changing the compact tool registry.

#### Scenario: Missing session uses visible fallback
- GIVEN a caller invokes `mem_save` for a prompt or session summary without a session id
- WHEN compatibility behavior creates or uses a fallback session id
- THEN the fallback session id MUST be deterministic for the same effective project and save category
- AND the response MUST report that fallback session identity was used
- AND the response MUST include the fallback session id

#### Scenario: Missing project uses visible degraded project
- GIVEN a caller invokes `mem_save` without a project where the persistence path requires or benefits from project identity
- WHEN compatibility behavior persists the record under a placeholder or null project
- THEN the response MUST report the project identity as missing or degraded
- AND any placeholder project value MUST be deterministic and query-stable

### Requirement: HTTP Save and Session Routes MUST Mirror MCP Identity Semantics
HTTP routes that mirror session and save behavior MUST preserve explicit identity and report deterministic fallback identity with semantics equivalent to `mem_session` and `mem_save`. HTTP response shape MAY use HTTP-appropriate JSON fields, but the observable identity outcome MUST match the MCP tool result for the same inputs.

#### Scenario: HTTP preserves explicit identity like MCP
- GIVEN equivalent save or session requests are made through MCP and HTTP with explicit session id and project
- WHEN both requests persist records
- THEN both surfaces MUST preserve the explicit identity
- AND neither surface MUST report fallback identity

#### Scenario: HTTP reports fallback identity like MCP
- GIVEN equivalent save or session requests are made through MCP and HTTP with missing identity
- WHEN compatibility fallback identity is used
- THEN both surfaces MUST report fallback use for the same missing fields
- AND both surfaces MUST expose deterministic placeholder values or degraded-state metadata

### Requirement: Identity Bootstrap MUST NOT Expand the Compact MCP Tool Surface
This change MUST NOT add, remove, rename, or split MCP tools. The registered MCP surface MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; identity fallback reporting MUST be implemented within existing tool responses and handlers.

#### Scenario: MCP registry remains six tools
- GIVEN stable identity bootstrap behavior is implemented
- WHEN clients list available MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no identity-bootstrap-specific MCP tool MUST appear

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Compatibility fallbacks remain for callers that omit identity, but their use is visible and deterministic rather than silent.
- Fallback reporting may be expressed as human-readable MCP text and structured HTTP JSON, provided both surfaces expose the same degraded identity facts.
- A caller-provided identity is explicit only when the submitted value is non-empty after existing input normalization/validation; blank or absent values follow missing-identity compatibility behavior.
- The same degraded identity facts are: the affected field (`session_id` or `project`), whether the value was omitted or synthesized, and the placeholder/null value used when one is persisted.
- Existing historical records with placeholder identity are not rewritten by tool calls in this change.

## Handoff Hints
- Preserve the six-tool registry unchanged in design and tasks.
- Design should choose a reusable fallback-reporting shape shared by MCP and HTTP without adding tools.
- Tests should cover explicit identity, missing session id, missing project, and HTTP/MCP parity.
