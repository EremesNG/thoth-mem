# Delta for Tools

> Change A — Output Caps Only. Maps to baseline `openspec/specs/tools/spec.md`
> (the compact-surface requirement there is preserved; this delta only ADDS
> bounded-output behavior to the existing `mem_context` and
> `mem_project action=summary` tools and clarifies the compact-surface
> requirement is unaffected). No tool is added or removed.

## ADDED Requirements

### Requirement: Context And Summary Responses MUST Be Bounded By A Configurable Character Budget
`mem_context` and `mem_project` with `action=summary` MUST bound their rendered
response to a configurable total-character budget (working name
`maxContextChars`, resolved per the config spec). The bound MUST be enforced
before the response is returned, and the response MUST report the boundedness
explicitly (for example, shown/omitted observation counts and/or an explicit
truncation marker), consistent with constitution P4 ("measured, not claimed").
The previously observed unbounded dumps (`mem_context` ~104K characters;
`mem_project action=summary` ~74K characters) MUST NOT recur for the same store
state under the default budget.

#### Scenario: Large memory store yields bounded context output
- GIVEN a memory store whose recent observations would render to far more than
  the configured `maxContextChars` (reproducing the observed ~104K
  `mem_context` dump)
- WHEN `mem_context` is executed with the default budget
- THEN the returned response length MUST be less than or equal to the configured
  `maxContextChars`
- AND the response MUST report how much content was shown versus omitted

#### Scenario: Large memory store yields bounded project summary output
- GIVEN a memory store whose recent observations would render to far more than
  the configured `maxContextChars` (reproducing the observed ~74K
  `mem_project action=summary` dump)
- WHEN `mem_project` is executed with `action=summary` under the default budget
- THEN the returned response length MUST be less than or equal to the configured
  `maxContextChars`
- AND the response MUST report how much content was shown versus omitted

### Requirement: Context And Summary Responses MUST Render Previews By Default With Full Content Via mem_get
The recent-observation blocks in `mem_context` and `mem_project action=summary`
responses MUST render a bounded preview of each observation's content by default
rather than the full `obs.content`. Full observation content MUST remain
available through `mem_get` (the single-record full-fetch tier of the P4 recall
funnel). The response MUST direct callers to `mem_get` for full bodies, mirroring
the existing "Use `mem_get` with an ID for full content." escalation footer used
by search-result rendering.

#### Scenario: Preview-by-default then escalate to mem_get
- GIVEN an observation whose content is longer than the preview length
- WHEN `mem_context` (or `mem_project action=summary`) renders that observation
- THEN the rendered block MUST contain only a bounded preview of the content, not
  the full body
- AND the response MUST include a pointer instructing the caller to use `mem_get`
  with the observation ID for the full content
- AND fetching that observation ID via `mem_get` MUST return the full,
  untruncated content

### Requirement: Context And Summary Budget MUST Be Overridable Per Call
`mem_context` and `mem_project action=summary` MUST accept an optional per-call
budget parameter that overrides the configured default `maxContextChars` for that
invocation only. When the override is absent, the configured default MUST apply.
A per-call override MUST NOT mutate persisted configuration. The per-call value
MUST accept the unbounded sentinel `0` (disabling the bound for that invocation
only), consistent with the configured sentinel semantics.

#### Scenario: Per-call budget override is honored
- GIVEN a configured default `maxContextChars`
- WHEN `mem_context` is called with an explicit per-call budget different from the
  default
- THEN the response MUST be bounded by the per-call budget for that invocation
- AND a subsequent call without an override MUST again be bounded by the
  configured default

### Requirement: Context And Summary Output MUST Support An Explicit Unbounded Mode
`mem_context` and `mem_project action=summary` MUST support the explicit,
documented sentinel value `0` ("no output cap") that disables the output bound
(restoring full-dump behavior) for rollback and debugging. The unbounded mode
MUST be reachable through the resolved configuration (and through the per-call
override below) and MUST be selectable only by an explicit `0`, never as the
default. **Note**: the unbounded sentinel `0` applies to `action=summary` only; `action=graph` and `action=topic` retain a minimum of `200` for `max_chars` and do NOT accept the sentinel.

#### Scenario: Unbounded sentinel restores full output
- GIVEN the unbounded sentinel `0` is configured for the output budget
- WHEN `mem_context` (or `mem_project action=summary`) renders a large store
- THEN the response MUST NOT be truncated by `maxContextChars`
- AND the default (non-sentinel) configuration MUST still enforce the bound

### Requirement: Output Bound MUST Be Applied At The Shared getContext Layer
The output bound for context/summary responses MUST be enforced at the shared
`Store.getContext` rendering layer rather than independently per caller, so that
every surface backed by `getContext` inherits the bound consistently. This
includes the MCP `mem_context` tool, the MCP `mem_project action=summary` tool,
the HTTP project-summary surface
(`handleProjectSummary`, `src/http-routes.ts:1032`), and the CLI project-summary
surface (`src/cli.ts:380`). No per-surface re-implementation of the bound is
permitted.

#### Scenario: HTTP and CLI summary inherit the shared bound
- GIVEN the output bound is enforced inside the shared `getContext` layer
- WHEN the HTTP `/projects/{project}/summary` surface renders a large store
- THEN its payload MUST be bounded by `maxContextChars` without any HTTP-specific
  bounding code
- AND WHEN the CLI project-summary command renders the same store
- THEN its output MUST be bounded by `maxContextChars` without any CLI-specific
  bounding code

## MODIFIED Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level
The MCP server MUST expose a compact set of workflow-level tools rather than one
tool per internal table, view, or legacy retrieval step. This change modifies the
*output behavior* of the existing `mem_context` and `mem_project` tools only; it
MUST NOT add, remove, rename, or split any tool. The registered set MUST remain
exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and
`mem_session`.

#### Scenario: Compact MCP registry is exposed
- GIVEN the MCP server registers tools
- WHEN clients list available tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered

#### Scenario: Bounded-output change does not alter the registry
- GIVEN the bounded-output behavior is introduced for `mem_context` and `mem_project action=summary`
- WHEN clients list available tools
- THEN the registered tool set MUST be unchanged from the compact six-tool surface
- AND no new bounding-specific tool MUST appear in the registry

## REMOVED Requirements
