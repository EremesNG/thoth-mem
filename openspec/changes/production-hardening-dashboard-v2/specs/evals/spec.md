# Delta for Evals

## ADDED Requirements

### Requirement: Production Hardening MUST Include Trace and Operation Tests
The test suite MUST cover trace persistence, trace sanitization, trace querying, operation catalog contracts, and dashboard client request shapes.

#### Scenario: Trace tests prove every tool is wrapped
- GIVEN all MCP tools are registered
- WHEN tests invoke representative handlers
- THEN each invocation MUST create a trace row with expected metadata

### Requirement: Production Hardening MUST Include Realistic Failure Evidence
Tests or evals MUST cover provider failures, background job retries, stale states, and dashboard-facing degraded responses.

#### Scenario: Provider failure is visible to dashboard
- GIVEN a provider returns an HTTP or malformed response failure
- WHEN operation health is requested
- THEN the failure MUST be visible through trace or health telemetry

### Requirement: Dashboard Build and Browser QA MUST Gate Completion
Completion MUST include dashboard typecheck/build and browser verification across at least desktop and mobile viewport sizes.

#### Scenario: Dashboard renders nonblank
- GIVEN the local server serves dashboard assets
- WHEN browser QA opens the dashboard
- THEN the page MUST render the v2 console with no blank canvas and no obvious overlapping controls
