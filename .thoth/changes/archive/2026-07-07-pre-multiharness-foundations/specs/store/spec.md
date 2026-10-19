# Delta for Store

## ADDED Requirements
### Requirement: Store Identity Boundaries MUST Consume a Shared Resolver v2 Contract
Store save, session, import, sync, and mirrored HTTP/CLI persistence paths MUST consume one shared identity-resolution contract for project and session identity. The Store MUST preserve explicit identity, apply deterministic fallback only when required for compatibility, and expose degraded metadata for callers without silently diverging per surface.

#### Scenario: Store save uses the shared resolver
- GIVEN equivalent save requests arrive through MCP, HTTP, CLI, import, or sync surfaces
- WHEN they carry the same explicit project and session id
- THEN Store persistence MUST preserve those explicit identities
- AND the resulting identity metadata MUST be equivalent across surfaces

#### Scenario: Missing identity fallback is deterministic across surfaces
- GIVEN equivalent requests omit project or session identity
- WHEN Store persistence applies compatibility fallback
- THEN repeated equivalent requests MUST produce the same fallback identity
- AND callers MUST be able to report which fields were missing, blank, placeholder, or synthesized

#### Scenario: Historical placeholders are not rewritten
- GIVEN existing rows already contain placeholder project or session identity
- WHEN Store initialization, recall, import, sync, or health reads run
- THEN those rows MUST remain stored under their existing values
- AND no implicit repair migration MUST occur

### Requirement: Store MUST Provide Community Health State Inputs
The Store MUST provide a bounded project community health read model that distinguishes `fresh`, `stale`, `rebuilding`, `failed`, `degraded`, `missing`, and `disabled` states. The read model MUST include source coverage, community coverage, graph signature or freshness basis, latest job status, timestamps when available, and degraded/failure reason metadata without recomputing expensive graph state on each health request.

#### Scenario: Freshness basis is returned from stored metadata
- GIVEN community artifacts were built against a recorded graph signature or freshness basis
- WHEN Store health state is read for that project
- THEN the result MUST include the recorded basis and whether it matches the current graph state
- AND health rendering MUST NOT require an unbounded graph scan

#### Scenario: Missing and disabled are distinct
- GIVEN community summaries are disabled by configuration for a project
- WHEN Store health state is read
- THEN the state MUST be `disabled`
- AND GIVEN community summaries are enabled but no committed artifacts exist
- WHEN Store health state is read
- THEN the state MUST be `missing`

#### Scenario: Failed or rebuilding job state is visible
- GIVEN the latest community rebuild failed or is in progress
- WHEN Store health state is read
- THEN the result MUST include `failed` or `rebuilding` state and latest job metadata
- AND committed previous summaries MUST NOT be silently reported as fresh

### Requirement: Store Telemetry Aggregation MUST Record Payload and Escalation Metrics Without Raw Content Leakage
The Store or its tracing/telemetry boundary MUST make aggregate token-savings metrics available for runtime reporting, including per-tool average payload size, full/evidence/returned payload sizes, estimated-or-exact token counts, and `mem_get` avoided versus escalated counts. Telemetry MUST store numeric counts, bounded summaries, hashes, signatures, and sanitized metadata rather than raw sensitive request or response bodies.

#### Scenario: Per-tool payload averages are measurable
- GIVEN multiple MCP tool calls have been traced
- WHEN telemetry is summarized
- THEN average returned payload size per tool MUST be computable
- AND the summary MUST distinguish request, response, evidence, and returned size bases where available

#### Scenario: mem_get escalation counts are measurable
- GIVEN recall/context interactions either answer from compact/context evidence or require a later full `mem_get`
- WHEN telemetry is summarized
- THEN counts for `mem_get` avoided and escalated MUST be reported
- AND avoided counts MUST NOT be credited when a full fetch was required for the same answer path

#### Scenario: Raw sensitive content is not persisted as telemetry
- GIVEN a traced request or response contains private-tagged content or secret-like values
- WHEN token-savings telemetry is recorded
- THEN only sanitized bounded payload summaries, counts, or signatures MAY be stored
- AND the raw sensitive content MUST NOT be persisted in telemetry fields

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions
- Health state should reuse existing community run/artifact metadata when sufficient; adding a bounded derived signature is allowed only if current metadata cannot prove freshness.
- `mem_get avoided` means compact/context evidence answered the path without a later full fetch for the same query/task correlation; design must define the concrete correlation window or trace linkage.
- Exact token counts are preferred when a portable tokenizer is available; deterministic estimates are acceptable when labeled as estimates.

## Handoff Hints
- Design should identify the lowest-cost stored community freshness basis and avoid on-demand graph recomputation in health reads.
- Design must choose a privacy-safe telemetry schema or trace-summary path that can compute counts without raw bodies.
- Tests should include direct Store health-state fixtures and telemetry aggregation over representative tool traces.
