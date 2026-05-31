# Visualization API Specification

## Requirements

### Requirement: Visualization API MUST Provide Bounded Map Slice Responses
The dashboard-facing API MUST provide bounded map-slice responses containing nodes, edges, and metadata constrained by explicit server-side limits for payload size and item counts.

#### Scenario: Initial map slice returns bounded payload
- GIVEN the dashboard requests an initial map slice
- WHEN the API returns map data
- THEN the response MUST include nodes, edges, and scope metadata within documented payload bounds

#### Scenario: Server enforces upper bounds
- GIVEN a request would exceed configured map limits
- WHEN the API evaluates the request
- THEN the response MUST enforce bounded item/payload caps and signal truncation or continuation capability

### Requirement: Visualization API MUST Support Filtered and Pivoted Retrieval
The API MUST support filtering and pivoting by project, session, topic key, observation type, relation type/class, semantic neighborhood depth, and text query where applicable.

#### Scenario: Filter metadata drives scoped retrieval
- GIVEN a request with project, session, and topic filters
- WHEN map data is retrieved
- THEN returned nodes and edges MUST be scoped to the requested filter set

#### Scenario: Text query narrows map context
- GIVEN a request includes a text query alongside structured filters
- WHEN the API resolves the map slice
- THEN the response MUST reflect query-constrained candidates compatible with the active scope

### Requirement: Visualization API MUST Provide Neighbor Expansion Contracts
The API MUST provide explicit neighbor expansion endpoints or operations that accept a selected node identity and bounded expansion depth and return additional map elements with stable provenance references.

#### Scenario: Neighbor expansion returns incremental additions
- GIVEN a selected node and expansion depth
- WHEN a neighbor expansion request is made
- THEN the API MUST return additional neighbors and connecting edges for that expansion step

#### Scenario: Expansion remains bounded and deterministic
- GIVEN repeated expansion requests with the same scope and depth
- WHEN no underlying data has changed
- THEN the API MUST return stable, deterministic expansion results within configured bounds

### Requirement: Visualization API MUST Expose Inspector and Provenance Payloads
The API MUST return inspector-ready payloads for selected nodes and edges, including source observation/fact/session/topic metadata, relation metadata, and drilldown references.

#### Scenario: Node inspector payload includes source context
- GIVEN a node selection request
- WHEN the API returns inspector data
- THEN the payload MUST include source identifiers and scope metadata needed for provenance drilldown

#### Scenario: Edge inspector payload includes relation context
- GIVEN an edge selection request
- WHEN the API returns inspector data
- THEN the payload MUST include relation class/type and source linkage metadata

### Requirement: Visualization API MUST Surface Health and Degraded/Pending States
The API MUST include semantic/index health metadata indicating ready, pending, degraded, or rebuilding states and MUST preserve graceful fallback behavior when semantic lanes are unavailable.

#### Scenario: Pending semantic coverage is visible
- GIVEN map data includes newly saved content with incomplete semantic indexing
- WHEN the API response is returned
- THEN semantic/index health metadata MUST indicate pending coverage for affected results

#### Scenario: Degraded semantic lane keeps usable response
- GIVEN semantic/index dependencies are degraded
- WHEN a map slice request executes
- THEN the API MUST return available non-semantic overlays/scope data with explicit degraded-state signaling instead of hard failure

### Requirement: Visualization API MUST Support Progressive Loading and Sparse/Empty/Dense Semantics
The API MUST support continuation or windowing semantics for progressive loading and MUST explicitly encode empty, sparse, and dense result-state indicators.

#### Scenario: Progressive continuation is available for dense slices
- GIVEN a dense slice exceeds initial bounds
- WHEN the API returns the first payload
- THEN the response MUST include continuation metadata for progressive loading

#### Scenario: Empty and sparse states are explicit
- GIVEN filters return empty or sparse graph structures
- WHEN the API returns the scoped result
- THEN the response MUST include explicit state indicators so the dashboard can render suitable UX

### Requirement: Visualization API MUST Remain Read-Only and Privacy-Safe
Dashboard visualization endpoints MUST be read-only and MUST only expose sanitized map-facing fields consistent with privacy-safe rendering constraints.

#### Scenario: Visualization route is non-mutating
- GIVEN a dashboard map API request
- WHEN the route is executed
- THEN the operation MUST not create, update, or delete memory records

#### Scenario: API payload excludes disallowed private-tag content
- GIVEN source observations contain private-tagged segments
- WHEN visualization payload fields are generated
- THEN map-facing labels and summaries MUST exclude disallowed private content
