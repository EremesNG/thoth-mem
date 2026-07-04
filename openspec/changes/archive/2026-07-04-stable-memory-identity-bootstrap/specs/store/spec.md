# Delta for Store

## ADDED Requirements
### Requirement: Store Session Persistence MUST Preserve Explicit Session and Project Identity
Store session creation and enrichment paths MUST preserve explicit `session_id` and `project` values supplied by callers. Idempotent session creation MUST enrich only missing or placeholder project metadata when a stable explicit project becomes available, and MUST NOT overwrite an already stable non-placeholder project with a placeholder value.

#### Scenario: Explicit session is created with stable project
- GIVEN a caller starts or ensures a session with explicit session id and explicit project
- WHEN the Store persists the session
- THEN the `sessions` row MUST contain that session id
- AND the `sessions.project` value MUST equal the explicit project

#### Scenario: Placeholder project is enriched idempotently
- GIVEN an existing session row has a placeholder or missing-equivalent project value
- WHEN the Store later ensures the same session with a stable explicit project
- THEN the Store MUST enrich the session project to the stable explicit value
- AND repeating the same ensure operation MUST be idempotent

#### Scenario: Stable project is not downgraded
- GIVEN an existing session row has a stable non-placeholder project
- WHEN a later Store call omits project or supplies a placeholder project
- THEN the Store MUST NOT replace the stable project with the placeholder

### Requirement: Store Save Paths MUST Retain Nullable Prompt and Observation Project Compatibility
Store prompt and observation persistence MUST remain backward-compatible with the existing schema where `sessions.project` is non-null while `user_prompts.project` and `observations.project` are nullable. The Store MUST NOT require destructive schema changes that make prompt or observation project fields non-null, and MUST make missing or placeholder identity query-stable.

#### Scenario: Prompt project may remain null
- GIVEN a prompt save request omits project identity
- WHEN the Store persists the prompt under compatibility behavior
- THEN the prompt record MAY retain a null project where the schema permits it
- AND any auto-created session MUST still satisfy the non-null `sessions.project` constraint using deterministic compatibility identity

#### Scenario: Observation project may remain null
- GIVEN an observation save request omits project identity
- WHEN the Store persists the observation
- THEN the observation record MAY retain a null project where the schema permits it
- AND project-scoped queries MUST continue to distinguish null, placeholder, and explicit projects predictably

### Requirement: Store Fallback Identity MUST Be Deterministic and Reportable
When Store paths synthesize fallback session or project identity for compatibility, the synthesized value MUST be deterministic for equivalent input and MUST be available to calling surfaces for fallback/degraded-state reporting. Store behavior MUST distinguish explicit identity from fallback identity so MCP, HTTP, CLI, and tests can observe the difference.

#### Scenario: Repeated missing-session prompt saves use deterministic fallback
- GIVEN two equivalent prompt save requests omit session id and use the same effective project
- WHEN the Store applies compatibility fallback behavior
- THEN the fallback session id MUST be the same deterministic value for both requests
- AND callers MUST be able to report that the session id was synthesized

#### Scenario: Explicit identity is distinguishable from fallback identity
- GIVEN one save request supplies explicit identity and another equivalent request omits it
- WHEN the Store persists both records
- THEN the Store result available to callers MUST indicate fallback use only for the request that omitted identity

### Requirement: Import and ApplyV2Chunk MUST Preserve or Degrade Identity Explicitly
Store import paths, including legacy import and `applyV2Chunk`, MUST preserve session and project identity present in imported sessions, observations, prompts, and mutations. When imported data lacks identity required by the target schema or query contract, the Store MUST apply deterministic compatibility handling and report missing/degraded identity in import results rather than silently treating `unknown` as stable caller identity.

#### Scenario: Import preserves explicit identity
- GIVEN an import payload contains explicit session id and project identity
- WHEN the Store imports sessions, observations, and prompts from that payload
- THEN the persisted records MUST preserve the imported identity values
- AND no degraded identity warning MUST be emitted for those values

#### Scenario: Legacy import reports degraded identity
- GIVEN a legacy import payload omits project or session identity for some records
- WHEN the Store imports the payload
- THEN import MUST remain backward-compatible and successful when the data is otherwise valid
- AND the result MUST report which identity fields were missing or degraded
- AND any placeholder used to satisfy storage constraints MUST be deterministic

#### Scenario: applyV2Chunk preserves mutation identity
- GIVEN a v2 sync chunk contains mutation records with explicit session and project identity
- WHEN `applyV2Chunk` applies the chunk
- THEN the resulting records and sync state MUST preserve those explicit identity values
- AND placeholder identity MUST NOT be substituted for present identity

### Requirement: Historical Placeholder Records MUST Not Be Silently Rewritten
This change MUST NOT silently rewrite existing historical records that already contain placeholder identity such as `manual-save-*` or `unknown`. Any future repair of historical identity MUST be opt-in and separately specified; current reads, imports, and saves MUST keep historical placeholders query-stable.

#### Scenario: Existing placeholder session remains query-stable
- GIVEN a database already contains a session id beginning with `manual-save-`
- WHEN the Store initializes or new identity-bootstrap behavior runs
- THEN the historical session id MUST remain unchanged
- AND queries filtering that exact session id MUST continue to find the same records

#### Scenario: Existing unknown project is not repaired implicitly
- GIVEN a database already contains records with project `unknown`
- WHEN import, search, timeline, recall, or context operations run
- THEN those records MUST NOT be silently reassigned to a different project
- AND callers MUST be able to continue filtering or inspecting them as degraded historical identity

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- `sessions.project` remains non-null; `observations.project` and `user_prompts.project` remain nullable for compatibility.
- Deterministic fallback values may keep existing placeholder vocabulary where needed, but callers can tell that the value was synthesized.
- Deterministic fallback means a repeatable value derived from stable inputs such as save category and effective project; it MUST NOT depend on timestamps, randomness, process id, or host-specific transient state.
- Placeholder project values for this change are the existing compatibility vocabulary such as `unknown`; stable explicit project values are non-empty caller/import/config values that are not placeholder values.
- No retroactive repair or migration of historical placeholder records is included in this change.

## Handoff Hints
- Design should centralize identity normalization/reporting at Store boundaries enough to avoid divergent MCP/HTTP/CLI behavior.
- Preserve idempotent session enrichment without destructive schema changes.
- Tests should include direct Store save/import/applyV2Chunk cases for explicit identity, null-compatible records, deterministic fallback, and historical placeholder stability.
