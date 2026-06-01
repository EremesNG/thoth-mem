# Delta for Indexing

## ADDED Requirements

### Requirement: Indexing Health MUST Include Operator-Grade Queue Metrics
Indexing health MUST expose queue age, pending/running/done/failed counts by job kind, stale/degraded lane state, recent errors, and coverage ratios.

#### Scenario: Queue lag is visible
- GIVEN pending semantic jobs exist
- WHEN health is requested
- THEN the response MUST include pending counts and queue age or equivalent lag signal

### Requirement: Rebuild Operations MUST Be Available over HTTP
Graph rebuild and semantic rebuild operations MUST be triggerable and inspectable through HTTP endpoints for Dashboard v2.

#### Scenario: Graph rebuild through HTTP
- GIVEN existing observations need graph rebuild
- WHEN the dashboard calls rebuild graph for a project
- THEN graph jobs or rebuild results MUST be returned with affected count metadata

### Requirement: Background Worker Failures MUST Stay Visible
Background indexing and KG failures MUST remain visible after terminal failure through recent error telemetry and trace logs.

#### Scenario: Failed KG enrichment appears in health
- GIVEN optional KG LLM enrichment fails
- WHEN the dashboard requests health
- THEN the recent error list MUST include the failed job warning without blocking deterministic KG results
