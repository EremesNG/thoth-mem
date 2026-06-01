# Delta for Dashboard

## ADDED Requirements

### Requirement: Dashboard V2 MUST Be Rebuilt as an Operator Console
The dashboard MUST be replaced by a v2 operator console that treats the old dashboard components as disposable and centers current production workflows.

#### Scenario: Dashboard defaults to operations console
- GIVEN a user opens `/`
- WHEN the dashboard loads
- THEN the first viewport MUST show current runtime health, retrieval lane status, trace activity, and actionable navigation

### Requirement: Dashboard MUST Visualize Four Retrieval Lanes
Dashboard V2 MUST make sentence vector, chunk vector, lexical FTS, and knowledge graph lanes visible in recall results, lane status, and explanatory details.

#### Scenario: Recall result shows lane evidence
- GIVEN a user runs a recall query from the dashboard
- WHEN results return with multiple lanes
- THEN the UI MUST show primary lane, supporting lanes, graph enrichment, score, and retrieval contract

### Requirement: Dashboard MUST Display MCP and HTTP Traces
Dashboard V2 MUST provide trace list and detail views for MCP and HTTP operations, including request, response, status, duration, timestamps, project/session context, and sanitized payload indicators.

#### Scenario: Operator inspects a tool response
- GIVEN a `mem_save` trace exists
- WHEN the user opens the trace detail
- THEN the dashboard MUST show sanitized request and response payloads plus status and timing

### Requirement: Dashboard MUST Display Indexing and Background Job Health
Dashboard V2 MUST show queue counts, running/pending/failed jobs, stale/degraded lanes, vector coverage, recent errors, and rebuild actions.

#### Scenario: Stale lane is visible
- GIVEN a semantic lane is stale
- WHEN the dashboard health panel renders
- THEN the stale lane MUST be labeled with coverage and recommended actions

### Requirement: Dashboard MUST Reproduce CLI and HTTP Operations
Dashboard V2 MUST expose controls for the operations available through CLI and HTTP, with safe inputs, clear mutation labels, response previews, and trace links.

#### Scenario: Operator runs a CLI-equivalent search
- GIVEN a user enters a query in the operations console
- WHEN they execute the search operation
- THEN the dashboard MUST call the HTTP equivalent and display the response and resulting trace

### Requirement: Dashboard V2 MUST Be Modern, Minimal, and Animated with Motion
The dashboard MUST use a cohesive design system, restrained density, accessible controls, lucide icons, and Motion-powered staged transitions and microinteractions.

#### Scenario: Route transition is animated without layout breakage
- GIVEN a user switches dashboard sections
- WHEN the new section appears
- THEN Motion animations MUST be subtle, interruptible, and must not cause text overlap or layout shift

### Requirement: Dashboard MUST Be Responsive and Visually Verified
Dashboard V2 MUST remain usable at desktop and mobile widths and MUST pass browser visual QA before completion.

#### Scenario: Mobile viewport remains usable
- GIVEN the dashboard is opened at mobile width
- WHEN primary panels render
- THEN controls and text MUST fit without incoherent overlap
