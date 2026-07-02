# HTTP API Specification

## Requirements

### Requirement: HTTP API MUST Expose Dashboard Operation Catalog
The HTTP API MUST expose a catalog of supported dashboard operations, grouped by capability, with method, path, input shape summary, risk level, and mutation flag.

#### Scenario: Dashboard loads operation catalog
- GIVEN the dashboard starts
- WHEN it requests the operation catalog
- THEN the API MUST return read, write, admin, sync, indexing, and observability operations

### Requirement: HTTP API MUST Cover CLI-Equivalent Operations
The HTTP API MUST expose safe localhost routes for CLI capabilities needed by Dashboard v2, including version, rebuild graph, rebuild index status/enqueue, sync import/export, project migration, project deletion, search, save, context, timeline, and stats.

#### Scenario: Rebuild index can be triggered from dashboard
- GIVEN an operator chooses rebuild-index for all projects
- WHEN the dashboard calls the HTTP endpoint
- THEN the server MUST enqueue the rebuild and return queue/status metadata

#### Scenario: Version is available over HTTP
- GIVEN the dashboard displays runtime metadata
- WHEN it requests version information
- THEN the response MUST match package runtime version surfaces

### Requirement: OpenAPI MUST Describe New Operations
OpenAPI output MUST document trace, operation catalog, version, rebuild graph, and rebuild index endpoints.

#### Scenario: OpenAPI includes trace endpoints
- GIVEN `/openapi.json` is requested
- WHEN the response is inspected
- THEN trace list/detail endpoints MUST be present with response schemas

### Requirement: Dashboard SPA Fallback MUST Support V2 Routes
The HTTP bridge MUST serve the dashboard SPA for Dashboard v2 routes while keeping API routes authoritative.

#### Scenario: V2 route deep link serves SPA
- GIVEN built dashboard assets exist
- WHEN a browser requests `/operations`
- THEN the bridge MUST serve `index.html`

#### Scenario: API route is not swallowed by SPA fallback
- GIVEN a browser requests `/api/traces` or another implemented API route
- WHEN the route matches the API table
- THEN the JSON API response MUST be returned instead of `index.html`

