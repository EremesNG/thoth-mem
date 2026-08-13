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

### Requirement: Journal Repair HTTP Administration

The HTTP API MUST expose separate journal-repair preview and apply operations with the same scopes, result fields, validation, and failure semantics as the store and CLI contracts; apply MUST require `expected_fingerprint` and return conflict without writes when stale.

#### Scenario: US2 - Repair sync-visible legacy gaps explicitly 1

- **GIVEN** sync-eligible rows with stable identities and missing current-state journal coverage
- **WHEN** an operator requests repair preview for exactly one project or all projects
- **THEN** the system reports bounded counts by entity and operation without mutating any row

#### Scenario: US2 - Repair sync-visible legacy gaps explicitly 2

- **GIVEN** an unchanged repair preview
- **WHEN** the operator explicitly applies the same scope with the preview's selection fingerprint
- **THEN** the system appends deterministic current-state mutations for exactly the reported rows without changing their memory content, titles, identities, timestamps, or deletion state

#### Scenario: US2 - Repair sync-visible legacy gaps explicitly 3

- **GIVEN** a successfully repaired scope
- **WHEN** repair is previewed or applied again
- **THEN** zero duplicate repair mutations are created

#### Scenario: US2 - Repair sync-visible legacy gaps explicitly 4

- **GIVEN** a legacy record without a stable sync identity
- **WHEN** repair evaluates it
- **THEN** the record is reported as ineligible and no identity is allocated implicitly

#### Scenario: US2 - Repair sync-visible legacy gaps explicitly 5

- **GIVEN** an operator has not selected apply mode
- **WHEN** either administrative surface is invoked
- **THEN** the operation remains read-only

#### Scenario: US2 - Repair sync-visible legacy gaps explicitly 6

- **GIVEN** candidates change after preview or the supplied fingerprint is missing or stale
- **WHEN** apply is attempted
- **THEN** it fails before writes and requires a fresh preview

#### Scenario: US2 - Repair sync-visible legacy gaps explicitly 7

- **GIVEN** a downstream store has a tombstoned observation with the repaired stable identity while the source observation is active
- **WHEN** it imports the repaired current-state event
- **THEN** the observation is idempotently restored to the active source state

### Requirement: Trace Retention HTTP Administration

The HTTP API MUST expose separate operation-trace retention preview and apply operations with the same scopes, effective policy, result fields, validation, and failure semantics as the store and CLI contracts; apply MUST require `expected_fingerprint` and `effective_now` and return conflict without writes when stale.

#### Scenario: US4 - Enforce bounded operation-trace retention safely 1

- **GIVEN** default configuration
- **WHEN** retention is previewed at a fixed instant
- **THEN** successful traces older than seven days and error traces older than thirty days are eligible while newer rows are protected

#### Scenario: US4 - Enforce bounded operation-trace retention safely 2

- **GIVEN** more eligible rows than one run may delete
- **WHEN** apply is invoked
- **THEN** only the deterministic bounded batch is deleted and the result reports that eligible rows remain

#### Scenario: US4 - Enforce bounded operation-trace retention safely 3

- **GIVEN** an unchanged preview whose eligible set fits within one run
- **WHEN** apply supplies the preview fingerprint and exact effective instant so the same cutoffs are derived
- **THEN** it deletes exactly the previewed rows transactionally and no other table is changed

#### Scenario: US4 - Enforce bounded operation-trace retention safely 4

- **GIVEN** no explicit apply selection
- **WHEN** the CLI or HTTP retention operation runs
- **THEN** it returns a preview and performs no deletion

#### Scenario: US4 - Enforce bounded operation-trace retention safely 5

- **GIVEN** retention has removed all eligible rows
- **WHEN** it runs again at the same instant
- **THEN** zero rows are deleted and recent success and error traces remain queryable
