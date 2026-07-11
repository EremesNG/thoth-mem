# Delta for Observability

## ADDED Requirements

### Requirement: MCP Tool Calls MUST Be Durably Traced
The system MUST persist a trace record for every MCP tool invocation, including tool name, origin, sanitized request payload, sanitized response payload or error, status, duration, and timestamp.

#### Scenario: Successful MCP call is traced
- GIVEN an MCP client calls `mem_recall`
- WHEN the tool handler returns a successful response
- THEN a trace record MUST exist with origin `mcp`, target `mem_recall`, status `ok`, duration, sanitized request JSON, and sanitized response JSON

#### Scenario: Failed MCP call is traced
- GIVEN an MCP client calls a tool with invalid or failing input
- WHEN the handler returns an MCP error response or throws
- THEN a trace record MUST exist with status `error`, sanitized request JSON, and error detail safe for dashboard display

### Requirement: Trace Persistence MUST Be Privacy-Safe and Bounded
Trace records MUST sanitize private tags and high-risk secret patterns before storage, and MUST record truncation metadata when payloads exceed configured limits.

#### Scenario: Secret-like content is redacted before persistence
- GIVEN a tool request contains a private tag or API-key-like token
- WHEN the trace is persisted
- THEN the stored payload MUST redact the sensitive value and MUST NOT preserve the original secret

### Requirement: HTTP Operations SHOULD Be Traced for Dashboard Visibility
Dashboard-triggered HTTP operations SHOULD persist trace records with origin `http`, route, method, status code, duration, sanitized request summary, and sanitized response summary.

#### Scenario: Dashboard operation appears in trace log
- GIVEN the dashboard triggers an HTTP rebuild-index operation
- WHEN the route completes
- THEN a trace record SHOULD be visible in trace listing with route, method, status code, and timing

### Requirement: Trace Query API MUST Support Operational Browsing
The HTTP API MUST provide list and detail endpoints for operation traces with filters for origin, target, status, project, session, and limit.

#### Scenario: Dashboard filters trace records
- GIVEN MCP and HTTP traces exist
- WHEN the dashboard requests traces filtered by origin `mcp`
- THEN only matching MCP trace summaries MUST be returned

### Requirement: Trace Logs MUST Not Recursively Trace Themselves
Trace writes MUST NOT recursively create additional MCP or HTTP trace records.

#### Scenario: Trace persistence is non-recursive
- GIVEN a tool call is being traced
- WHEN the trace row is inserted
- THEN the insert MUST NOT invoke the MCP tracing wrapper again
