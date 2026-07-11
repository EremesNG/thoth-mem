# Delta for Config

## ADDED Requirements

### Requirement: Community Summary Knobs MUST Resolve Deterministically
If community-summary behavior is configurable, the system MUST resolve each knob using the established precedence order: explicit `THOTH_*` environment override, then persisted config in the resolved data dir, then a built-in default. Knobs MUST cover enablement, algorithm selection, output budgets, maximum communities/results, stale-state behavior, optional enrichment enablement, and rebuild/admin limits as needed by design.

#### Scenario: Environment override wins for community config
- GIVEN a persisted community-summary setting and a matching environment override differ
- WHEN effective configuration is computed
- THEN the environment override MUST take precedence

#### Scenario: Built-in defaults support offline MVP
- GIVEN no community-summary configuration is present
- WHEN effective configuration is computed
- THEN defaults MUST support deterministic offline construction without embeddings, remote services, or LLMs

### Requirement: Algorithm Configuration MUST Include a Deterministic Fallback
Community algorithm configuration MUST include a deterministic connected-components fallback and MAY allow Louvain-style or Leiden-style choices only when validated by design. Exact Leiden MUST NOT be the only supported or default path for MVP.

#### Scenario: Invalid algorithm falls back safely
- GIVEN an unsupported or unavailable community algorithm is configured
- WHEN community rebuild runs
- THEN the system MUST fail safe to the deterministic fallback or record explicit degraded state
- AND it MUST NOT require exact Leiden for MVP operation

### Requirement: Community Budgets MUST Be Finite by Default
Community summary text, community count, evidence count, rebuild work, and optional enrichment cost/time budgets MUST be finite by default. An explicit unbounded sentinel MAY be offered only where existing project conventions support it and where design documents safe rollback/debug use.

#### Scenario: Default summary budget is finite
- GIVEN default configuration
- WHEN community summaries are generated or rendered
- THEN summary text and evidence output MUST be bounded by finite defaults
- AND omitted evidence MUST be measurable through counts or truncation metadata

### Requirement: Optional LLM Enrichment Configuration MUST Be Non-Load-Bearing
Any configuration for LLM enrichment MUST default to a fallback-safe behavior and MUST NOT make LLM availability required for community construction, deterministic summaries, rebuild success, or recall availability. Enrichment settings MUST include timeout/cost limits and explicit degraded-state reporting.

#### Scenario: Enrichment disabled preserves baseline
- GIVEN optional enrichment is disabled
- WHEN community summaries are rebuilt and retrieved
- THEN deterministic extractive summaries MUST remain available
- AND no remote service MUST be required

## MODIFIED Requirements

## REMOVED Requirements

## Assumptions

- Working names such as `kgCommunitySummariesEnabled`, `kgCommunityAlgorithm`, and `kgCommunitySummaryMaxChars` are design decisions; this spec requires semantics and precedence, not exact names.
- Defaults should be conservative: deterministic fallback enabled for admin rebuild, retrieval contribution gated by eval evidence.

## handoffHints

- Design must choose exact knob names, defaults, schema entries, and default-on/off behavior using eval gates.
