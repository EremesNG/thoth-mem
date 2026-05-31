# Tools

## Requirements

### Requirement: MCP Surface MUST Be Compact and Workflow-Level
The MCP server MUST expose a compact set of workflow-level tools rather than one tool per internal table, view, or legacy retrieval step.

#### Scenario: Compact MCP registry is exposed
- GIVEN the MCP server registers tools
- WHEN clients list available tools
- THEN exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` MUST be registered

#### Scenario: Legacy granular tools are not registered
- GIVEN the MCP server registers tools
- WHEN clients list available tools
- THEN legacy granular tools such as `mem_search`, `mem_get_observation`, `mem_timeline`, `mem_project_summary`, `mem_project_graph`, `mem_topic_keys`, `mem_session_start`, `mem_session_summary`, `mem_save_prompt`, and admin/sync tools MUST NOT be registered

### Requirement: Recall Surface MUST Expose Four-Lane Fused Retrieval
`mem_recall` MUST expose fused ranked evidence combining sentence semantic, chunk semantic, lexical FTS5, and graph/KG lanes when available.

#### Scenario: Fused lane evidence is returned
- GIVEN retrieval lanes are available
- WHEN `mem_recall` is executed
- THEN output MUST include ranked fused evidence with lane attribution and lineage-oriented metadata

### Requirement: Tooling MUST Signal Semantic Degraded or Pending States Explicitly
If sqlite-vec cannot load, vec tables are unavailable, semantic index is stale/rebuilding, or newly saved content has not completed background semantic indexing, `mem_recall` MUST signal degraded/pending semantic lanes while still returning lexical + graph/KG output.

#### Scenario: Degraded semantic warning with successful fallback
- GIVEN semantic lanes are degraded
- WHEN `mem_recall` executes
- THEN output MUST include explicit degraded-state signaling and usable fallback results

#### Scenario: Pending semantic coverage after save is visible
- GIVEN content has been saved but sentence/chunk background indexing is not complete
- WHEN `mem_recall` output includes that content
- THEN the tool surface MUST be able to indicate pending semantic coverage rather than implying fresh vector recall

### Requirement: Manual Rebuild Surface MUST Remain CLI-Controlled
The system MUST provide manual `thoth-mem rebuild-index` control for semantic/KG reindexing through CLI, not through the compact MCP tool surface.

#### Scenario: Operator invokes rebuild-index
- GIVEN an operator requests rebuild
- WHEN the CLI rebuild command runs
- THEN rebuild MUST be initiated with observable status
