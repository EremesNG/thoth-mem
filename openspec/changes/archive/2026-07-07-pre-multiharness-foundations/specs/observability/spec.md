# Delta for Observability

## ADDED Requirements
### Requirement: Runtime Telemetry MUST Capture Payload and Token-Savings Metrics Per Tool
Runtime observability MUST capture privacy-safe telemetry for MCP tool calls sufficient to compute per-tool average payload, request size, response size, evidence size when applicable, returned size, estimated-or-exact token counts, and token-savings/compression summaries. Telemetry MUST remain bounded and MUST distinguish exact token accounting from deterministic estimates.

#### Scenario: Tool trace carries payload metrics
- GIVEN an MCP tool call completes successfully
- WHEN its trace or telemetry summary is inspected
- THEN request and response payload sizes MUST be available
- AND relevant retrieval tools MUST expose evidence/full/returned size bases where available

#### Scenario: Exact and estimated tokens are distinct
- GIVEN exact token counting is available for a payload
- WHEN telemetry records token metrics
- THEN the metric MUST identify exact token accounting
- AND GIVEN exact token counting is unavailable
- WHEN telemetry records token metrics
- THEN deterministic estimates MUST be labeled as estimates

### Requirement: Telemetry MUST Count mem_get Avoidance and Escalation Without Raw Content
Observability MUST support counts for recall/context paths that avoid full `mem_get` and paths that escalate to full `mem_get`. The correlation mechanism MUST use safe identifiers, trace metadata, hashes, or bounded summaries and MUST NOT persist raw sensitive content to prove the count.

#### Scenario: Avoidance and escalation are summarized
- GIVEN a sequence of recall, context, and mem_get tool calls has been traced
- WHEN telemetry summaries are computed
- THEN avoided and escalated `mem_get` counts MUST be available
- AND the summary MUST identify the basis used to correlate calls

#### Scenario: Correlation data is privacy-safe
- GIVEN a correlated recall and mem_get path includes sensitive source content
- WHEN telemetry stores correlation data
- THEN the stored data MUST use safe ids, hashes, counts, or sanitized metadata
- AND raw source content MUST NOT be stored solely for correlation

### Requirement: Telemetry MUST Preserve Existing Trace Privacy and Bounds
New token-savings telemetry MUST compose with existing trace sanitization and truncation. It MUST NOT weaken private-tag stripping, secret redaction, max payload bounds, or non-recursive trace behavior.

#### Scenario: Sensitive payload remains redacted
- GIVEN a traced call contains private tags or API-key-like text
- WHEN token-savings telemetry is recorded from that call
- THEN the sensitive value MUST remain redacted or absent
- AND token metrics MUST still be computable from safe size/count data

#### Scenario: Telemetry does not recursively trace itself
- GIVEN telemetry is recorded for a tool call
- WHEN trace persistence writes metric fields or summaries
- THEN telemetry writes MUST NOT create recursive tool traces

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Per-tool averages can be computed from trace rows, a derived summary table, or in-memory eval instrumentation; design should choose the least invasive durable path.
- Token estimation may use a documented deterministic heuristic if model-specific tokenizers are unavailable.

## Handoff Hints
- Design should keep trace persistence bounded and sanitize-first.
- Design must identify where evidence/full/returned sizes are known for each tool, especially `mem_recall`, `mem_context`, `mem_project`, and `mem_get`.
- Tests should prove secret redaction and non-recursive tracing still hold.
