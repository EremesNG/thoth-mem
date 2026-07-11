# Delta for Tools

## ADDED Requirements

### Requirement: Community Summaries MUST NOT Change the MCP Registry
This change MUST NOT add, remove, rename, or split any MCP tool. The registered MCP surface MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. Community rebuild and inspection controls are admin operations and SHALL NOT be registered as MCP tools.

#### Scenario: MCP registry remains six tools
- GIVEN community summaries are implemented
- WHEN clients list MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no community-specific MCP tool MUST appear

### Requirement: Community Admin Operations MUST Be CLI and HTTP Only
The system MUST expose community-summary rebuild and inspection operations only through CLI and HTTP admin surfaces, following the existing `rebuild-graph` and `prune-graph` boundary. Admin surfaces MUST support project scoping, observable status, and inspection of freshness/degraded state.

#### Scenario: CLI rebuilds community summaries
- GIVEN an operator invokes the community-summary rebuild command for a project
- WHEN the command completes
- THEN it MUST report rebuild status and relevant counts
- AND it MUST NOT require an MCP tool invocation

#### Scenario: HTTP inspects community summary state
- GIVEN community summaries exist or are stale for a project
- WHEN an HTTP admin inspection route is requested
- THEN it MUST return bounded community metadata including freshness/degraded state
- AND it MUST not expose secrets or unbounded source content

### Requirement: Existing Tool Outputs MAY Consume Community Evidence Without Contract Expansion
Existing `mem_recall` and `mem_project action=summary` outputs MAY include compact community-summary annotations or evidence when retrieval supplies them, but the tool input/output contract MUST remain backward-compatible and bounded. `mem_project action=graph` MUST remain KG-backed and MUST NOT become a community graph visualization surface.

#### Scenario: mem_recall annotates community evidence without new tool
- GIVEN retrieval returns community-summary evidence in the KG lane
- WHEN `mem_recall` renders results
- THEN the result MAY include compact community metadata
- AND no new tool, action, or required client flow MUST be introduced

#### Scenario: action=graph remains KG fact ledger
- GIVEN community summaries exist for a project
- WHEN `mem_project action=graph` is requested
- THEN it MUST continue to render the KG-backed graph ledger semantics
- AND it MUST NOT replace the ledger with community-summary reports

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions

- CLI/HTTP operation names are design decisions; the required boundary is admin-only outside MCP.
- Community inspection output should be capped similarly to existing admin/status outputs.

## handoffHints

- Design must mirror existing rebuild/prune admin shape and preserve the six-tool registry.
