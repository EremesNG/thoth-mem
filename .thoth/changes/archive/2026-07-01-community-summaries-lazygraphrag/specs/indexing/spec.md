# Delta for Indexing

## ADDED Requirements

### Requirement: Community Rebuild MUST Be an Operator-Visible Admin Workflow
Community-summary rebuild MUST be available as an operator-visible admin workflow, analogous to graph rebuild/prune operations. It MUST support project scoping, full rebuild, dry-run or inspect mode where practical, bounded status output, and explicit success/failure/degraded reporting. It MUST NOT be exposed as an MCP tool.

#### Scenario: Project-scoped community rebuild
- GIVEN an operator requests community rebuild for a project
- WHEN the rebuild runs
- THEN only that project's eligible KG graph MUST be partitioned and summarized
- AND the operation MUST report counts and status

### Requirement: Community Rebuild MUST Use Existing KG as Input and Avoid Indexing-Time LLM Dependency
The indexing/rebuild workflow MUST consume the already consolidated KG as input and MUST produce deterministic extractive summaries without embeddings, remote services, or LLMs. Optional LLM enrichment MAY run as a separate additive step that cannot block the deterministic artifact commit.

#### Scenario: Rebuild completes without optional providers
- GIVEN embeddings and LLM providers are unavailable
- WHEN community rebuild runs
- THEN deterministic partitioning and extractive summaries MUST complete or record an explicit KG-empty/degraded state
- AND the rebuild MUST NOT fail solely because optional providers are absent

### Requirement: Community Rebuild MUST Track Staleness After KG Updates
The indexing/maintenance layer MUST make community-summary staleness detectable after KG-affecting changes, including observation save/update/upsert, KG rebuild, supersession marking, and pruning. Automatic rebuild MAY be deferred, but stale state MUST be visible to retrieval and admin inspection.

#### Scenario: Save marks community state stale
- GIVEN fresh community summaries exist for a project
- WHEN a save/update/upsert changes that project's KG
- THEN community summary state for the project MUST become stale or rebuilding before it is consumed as fresh

#### Scenario: Graph rebuild invalidates community summaries
- GIVEN graph rebuild repopulates KG rows for a project
- WHEN the graph rebuild commits
- THEN community summary freshness for that project MUST be invalidated or refreshed coherently

### Requirement: Community Rebuild Jobs MUST Be Idempotent and Retryable
Community rebuild jobs MUST be restart-safe and converge without duplicate artifacts. Interrupted or failed jobs MUST leave committed community summaries in a readable previous state and expose failure status for later retry.

#### Scenario: Interrupted community rebuild retries safely
- GIVEN a community rebuild is interrupted
- WHEN the rebuild is retried with the same KG inputs
- THEN the final committed artifacts MUST converge
- AND duplicate community artifacts MUST NOT accumulate

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions

- Automatic rebuild after every KG mutation is not required for MVP; explicit stale signaling plus operator-triggered rebuild is a defensible default.
- The rebuild workflow should reuse existing admin/status conventions rather than inventing a background scheduler unless design justifies it.

## handoffHints

- Design must decide whether any automatic rebuild is in MVP; stale signaling is required either way.
- Keep the admin workflow outside MCP and bounded in output.
