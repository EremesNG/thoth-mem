# Delta for Tools

## ADDED Requirements
### Requirement: mem_project action=health MUST Report Community Summary Health State
`mem_project` with `action="health"` MUST expose the current community-summary health state for the requested project, when community-summary configuration or artifacts exist. The state MUST be one of `fresh`, `stale`, `rebuilding`, `failed`, `degraded`, `missing`, or `disabled`. The output MUST include bounded coverage, graph signature or freshness basis, latest community job status, and degraded/failure reason when present.

#### Scenario: Fresh community state is reported
- GIVEN a project has a committed community summary matching the current graph freshness basis
- WHEN `mem_project` is called with `action="health"` for that project
- THEN the output MUST include community state `fresh`
- AND it MUST include coverage and graph freshness/signature basis metadata

#### Scenario: Unavailable community states are distinguishable
- GIVEN community summaries for a project are stale, rebuilding, failed, degraded, missing, or disabled
- WHEN `mem_project action="health"` renders project health
- THEN the output MUST report the matching state
- AND it MUST NOT collapse those states into a generic unavailable message

#### Scenario: Latest job status is visible
- GIVEN a community rebuild or summary job has started, completed, or failed for a project
- WHEN `mem_project action="health"` renders project health
- THEN the output MUST include the latest job status and relevant timestamp or reason metadata where available

### Requirement: Health Output MUST Be Bounded and Privacy-Safe
`mem_project action="health"` MUST render bounded operator-facing health output. The output MUST include counts, states, signatures, timestamps, and reasons, but MUST NOT include raw observation content, raw prompt content, private-tagged content, or unbounded community summary bodies.

#### Scenario: Health output stays within max chars
- GIVEN a project has many community artifacts, jobs, and degraded reasons
- WHEN `mem_project action="health"` renders with default or explicit `max_chars`
- THEN the output MUST be bounded by the applicable character budget
- AND omitted detail MUST be indicated through counts or truncation metadata

#### Scenario: Health output does not leak source content
- GIVEN community summaries reference source observations that contain sensitive content
- WHEN project health is rendered
- THEN the output MUST expose only safe metadata such as counts, ids, states, signatures, and redacted reasons
- AND raw source memory content MUST NOT be included

### Requirement: This Change MUST Preserve the Compact MCP Tool Surface
This change MUST NOT add, remove, rename, or split MCP tools. Identity resolver v2 warnings, community health state, and token-savings telemetry MUST be surfaced through existing tools and metadata where appropriate. The registered MCP surface MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.

#### Scenario: MCP registry remains six tools
- GIVEN pre-multiharness foundation behavior is implemented
- WHEN clients list MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no identity, health, telemetry, or multi-harness-specific MCP tool MUST appear

#### Scenario: Health remains an existing mem_project action
- GIVEN community health state is exposed
- WHEN clients inspect the MCP tool registry
- THEN health inspection MUST remain inside the existing `mem_project` tool
- AND no separate community-health MCP tool MUST be registered

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- `action="health"` already exists on `mem_project`; this spec extends its rendered content and data source rather than expanding the tool surface.
- Health output may be human-readable MCP text or structured HTTP JSON on mirrored surfaces, but both must expose the same health facts.

## Handoff Hints
- Design should reuse existing `formatProjectHealth` and store health readers when possible.
- Design must keep community rebuild/admin controls outside MCP and preserve the six-tool registry test.
- Verification should include all seven community states and max_chars/privacy assertions.
