# Delta for Tools

## ADDED Requirements

### Requirement: Maintenance MUST NOT Change the Compact MCP Tool Registry
This change MUST NOT add, remove, rename, or split any MCP tool. Consolidation, reflection, and decay behavior may change the output behavior of existing workflow tools only where specified by retrieval, store, and knowledge-graph requirements. Manual maintenance trigger or inspection surfaces MUST remain outside the MCP registry unless a later spec explicitly changes the compact tool contract.

#### Scenario: MCP registry remains compact
- GIVEN maintenance features are implemented
- WHEN clients list MCP tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered
- AND no consolidation, reflection, decay, or maintenance admin tool MUST appear

### Requirement: `mem_recall` and Context Tools MUST Surface Maintenance Effects Transparently
When existing recall or context tools consume consolidation, reflection, or decay metadata, their output MUST indicate the effect in evidence or rendered text. Consolidated results MUST expose duplicate suppression or cluster provenance, reflected memories MUST expose source lineage, and decayed memories MUST be visibly identified when returned despite down-weighting.

#### Scenario: Recall output explains a consolidated result
- GIVEN recall returns a canonical memory from a consolidated cluster
- WHEN `mem_recall` renders the result
- THEN the output MUST indicate that consolidation influenced the result
- AND it MUST provide enough lineage to retrieve suppressed source records

#### Scenario: Reflected and decayed output is distinguishable
- GIVEN recall or context returns a reflected memory and a decayed source memory
- WHEN the tool renders the output
- THEN the reflected memory MUST identify its source-linked nature
- AND the decayed memory MUST identify its decay state or reason class

### Requirement: Full-Record Tooling MUST Preserve Source Recoverability
`mem_get` MUST remain the full-record recovery path for source memories affected by consolidation, reflection, or decay. A memory suppressed by consolidation or down-weighted by decay MUST remain retrievable through `mem_get` by stable id unless it was removed by an existing explicit delete behavior outside this change.

#### Scenario: Suppressed duplicate can be fetched by id
- GIVEN a duplicate source memory is suppressed from default recall due to consolidation
- WHEN a caller invokes `mem_get` with that source memory id
- THEN the full source memory MUST be returned
- AND the response MUST NOT present the memory as deleted or unavailable merely because it was consolidated

### Requirement: `mem_project` Views MUST Respect Existing Graph and Summary Boundaries
`mem_project action=summary` MAY consume maintenance metadata through the shared context/retrieval layer, but it MUST preserve existing output budget behavior. `mem_project action=graph` MUST preserve the existing KG-backed graph contract and MUST NOT become a maintenance dashboard. Maintenance state MAY be visible only as evidence annotations needed to explain current graph or recall behavior.

#### Scenario: Project summary consumes maintenance without changing budget contract
- GIVEN project memories include consolidated, reflected, and decayed records
- WHEN `mem_project action=summary` renders the project
- THEN it MAY prefer reflected and canonical high-signal memories according to retrieval requirements
- AND the existing summary output budget requirements MUST still apply

#### Scenario: Project graph is not a maintenance dashboard
- GIVEN maintenance metadata exists for a project
- WHEN `mem_project action=graph` renders the project graph
- THEN graph facts MUST remain KG-backed and focused on graph evidence
- AND the graph view MUST NOT be required to list maintenance run state, dry-run candidates, or decay policy details

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- **No dashboard/visualization delta:** The proposal needs operator/admin inspection, not a user-facing dashboard. Existing tools should annotate behavior enough for transparency, while detailed run inspection belongs to CLI/HTTP/admin surfaces.
- **Tool behavior follows retrieval/store contracts:** Tool requirements intentionally avoid duplicating storage and ranking rules beyond transparent rendering and recoverability.

