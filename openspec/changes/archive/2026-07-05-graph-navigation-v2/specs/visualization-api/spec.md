# Delta for Visualization API

## ADDED Requirements

### Requirement: Observatory Contracts MUST Provide MCP-Compatible Navigation Primitives
The observatory and visualization API contracts MUST continue to expose scoped primitives that can back MCP graph navigation without requiring a new MCP tool. Context, recall, map frontier, ledger, timeline, and community summary reads MUST remain independently bounded and source-attributed.

#### Scenario: Scoped context can back MCP navigation
- GIVEN a project-scoped observatory context is created
- WHEN MCP graph navigation needs neighborhood, lineage, or ledger detail data
- THEN the implementation MUST be able to reuse compatible store-level observatory primitives
- AND no MCP-only parallel graph reader MUST be required

#### Scenario: API primitives remain bounded
- GIVEN a project contains a large graph and many observations
- WHEN observatory frontier, ledger, timeline, or community reads are used
- THEN each primitive MUST enforce its existing limits or explicit requested bounds
- AND responses MUST include continuation, omitted, or exhausted state where applicable

### Requirement: Observatory Ledger History MUST Remain Current-State By Default
Structured ledger/detail contracts MUST keep current-state output by default and MUST include retained superseded facts only when an explicit history-inclusive input is supplied. Historical facts MUST remain tagged so callers can distinguish them from current facts.

#### Scenario: Ledger default excludes superseded facts
- GIVEN a ledger detail request omits `include_superseded` or supplies a false-like value
- WHEN the response is produced
- THEN current facts MUST be returned
- AND superseded facts MUST NOT be included

#### Scenario: Ledger opt-in includes tagged superseded facts
- GIVEN retained superseded facts exist for an observation
- WHEN ledger detail is requested with `include_superseded=true`
- THEN retained superseded facts MUST be returned
- AND each historical fact MUST be tagged with superseded metadata

### Requirement: Frontier Navigation MUST Report Incremental State
Map/neighborhood expansion contracts MUST return frontier state that distinguishes newly added nodes, already-visible nodes, exhausted frontiers, continuation, and scope-filtered/no-neighbor outcomes. This state MUST be usable by a text MCP formatter without requiring a visual dashboard.

#### Scenario: Frontier response distinguishes new and visible nodes
- GIVEN a caller expands a focused node with some nodes already visible
- WHEN the frontier response is returned
- THEN it MUST identify newly added node IDs
- AND it MUST identify already-visible node IDs where applicable

#### Scenario: Frontier response reports continuation or exhaustion
- GIVEN a neighborhood exceeds the requested bounds
- WHEN expansion returns a bounded page
- THEN it MUST include continuation or an explicit exhausted/frontier reason

### Requirement: Community Summary Reads MUST Remain Inspection-Oriented
Community summary API and store contracts MUST expose bounded status and committed-summary inspection for a project. These contracts MUST NOT imply that community summaries are authoritative global answers, complete visual graph replacements, or evidence of deferred harness migrations.

#### Scenario: Community inspection returns bounded metadata
- GIVEN committed community summaries exist for a project
- WHEN the project community read is performed
- THEN the response MUST include bounded summary previews, community IDs, freshness/degraded state, coverage counts, and source observation references
- AND it MUST avoid unbounded source content

#### Scenario: Missing or stale communities are explicit
- GIVEN community summaries are missing, disabled, stale, rebuilding, failed, or degraded
- WHEN community inspection is requested
- THEN the response MUST report that state explicitly
- AND it MUST not invent communities or claim GraphRAG answer readiness

## MODIFIED Requirements

### Requirement: Visualization API MUST Provide an Observatory Query Model
The dashboard-facing API and store-level observatory primitives MUST provide a unified observatory query model that supports Recall Workspace, Memory Map, Timeline, Knowledge Ledger, Health & Indexing, and MCP-compatible graph navigation surfaces under shared scope controls. This modification is additive and MUST preserve existing route compatibility.

#### Scenario: Shared scope can drive dashboard and MCP graph navigation
- GIVEN the same project/session/topic/time scope
- WHEN dashboard observatory surfaces or MCP graph navigation views read data
- THEN each response MUST be derivable under compatible scope semantics
- AND no surface MUST reinterpret the scope in an incompatible way

### Requirement: Visualization API MUST Return Provenance-Rich, Structured Memory Semantics
Dashboard-facing and MCP-consumed observatory payloads MUST expose observation type, What/Why/Where/Learned fields when available, topic keys, session/project identities, vector/graph evidence attribution, and provenance references needed for explanation. This includes current-state and explicit superseded-history reads.

#### Scenario: Ledger-capable payload includes structured current and historical fields
- GIVEN a detail payload includes current facts and explicitly requested retained history
- WHEN payloads are inspected
- THEN structured fields and provenance references MUST identify source observations
- AND historical facts MUST be distinguishable from current facts

## REMOVED Requirements

None.

## Assumptions
- **Domain choice:** `visualization-api` is the right domain for structured observatory contracts because existing main specs already own observatory query, frontier, ledger, and pivot semantics.
- **No new HTTP route required by spec:** Existing routes and store primitives appear sufficient; additive fields or schema notes may be added only if implementation needs parity.
- **Text formatter reuse:** MCP graph navigation can render text from store-level structured primitives without changing dashboard route behavior.

## Handoff Hints
- Preserve existing observatory HTTP route compatibility.
- Use existing current-state and `include_superseded=true` semantics for ledger history.
- Community reads remain bounded inspection/debugging views.
