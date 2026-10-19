# Delta for Tools

## ADDED Requirements

### Requirement: Rollout Gate MUST Preserve the Compact MCP Surface
This change MUST NOT add, remove, rename, or split MCP tools. The registered MCP surface MUST remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; community rollout decisions, rebuilds, status checks, and readiness evidence SHALL NOT create a community-specific MCP tool.

#### Scenario: MCP registry remains six tools
- GIVEN the community read-path rollout gate is implemented
- WHEN clients list MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no rollout-specific or community-specific MCP tool MUST appear

#### Scenario: Admin rollout evidence is not an MCP tool
- GIVEN an operator needs readiness evidence or rebuild/status inspection
- WHEN the operator uses the supported surfaces
- THEN those admin actions MUST remain on existing CLI, HTTP, eval, documentation, or config paths
- AND they MUST NOT require a new MCP tool

### Requirement: Existing Tool Outputs MAY Surface Eligible Community Evidence Without Contract Expansion
Existing `mem_recall` and `mem_project action=summary` outputs MAY include compact bounded community-summary evidence or annotations only when retrieval supplies eligible KG-lane community evidence. Such output MUST remain backward-compatible, bounded, and source-attributed, and MUST preserve escalation through the existing recall/get flow.

#### Scenario: mem_recall surfaces community evidence through existing output
- GIVEN an opted-in project is eligible and retrieval returns KG-lane community-summary evidence
- WHEN `mem_recall` renders results
- THEN the result MAY include bounded community-summary metadata or text
- AND it MUST NOT require a new action, tool, or client flow

#### Scenario: Full source detail still escalates through mem_get
- GIVEN a compact community-summary annotation appears in an existing tool output
- WHEN a caller needs source details
- THEN source observations MUST remain reachable through existing IDs, provenance, or `mem_get`
- AND the annotation MUST NOT replace source lineage

### Requirement: Tool Behavior MUST Not Claim Deferred Scope
Tool output and documentation for this rollout gate MUST NOT claim multi-harness support, G3 harness parity, MemoryIntegrationCore migration, P5 graph navigation v2, or full GraphRAG global-answer synthesis. Existing tools MAY report bounded rollout status or degraded-state facts only within their current contracts.

#### Scenario: Tool output does not imply harness parity
- GIVEN a project passes community read-path rollout eligibility
- WHEN existing tool output includes community-summary annotations or status
- THEN the output MUST NOT claim cross-harness support or MemoryIntegrationCore migration

#### Scenario: action=graph remains a KG fact ledger
- GIVEN community summaries exist for a project
- WHEN `mem_project action=graph` is requested
- THEN it MUST remain a KG-backed fact ledger
- AND it MUST NOT become a P5 graph navigation v2 or community-summary visualization surface

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Existing CLI, HTTP, eval, README, and config surfaces cover rollout evidence and operator control; a new MCP tool would violate the compact-surface invariant.
- Tool output changes, if any, are limited to bounded annotations from retrieval and do not require new required request fields.
- Multi-harness support and P5 graph navigation v2 remain explicit non-goals for this change.

## Handoff Hints
- Preserve the six-tool MCP registry exactly.
- Do not route community rebuild, readiness, or rollout decisions through MCP.
- Keep `mem_project action=graph` KG-ledger semantics separate from community-summary rollout evidence.
