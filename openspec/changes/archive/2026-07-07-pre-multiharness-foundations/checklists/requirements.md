# Requirements Quality Checklist

## Domain: config
- [x] Completeness: Covers project identity precedence, session normalization, degraded warnings, explicit input preservation, and no silent historical repair.
- [x] Clarity: Defines the resolver source order and separates explicit, derived, placeholder, and compatibility identities.
- [x] Measurability: Scenarios assert deterministic outputs, selected source metadata, degraded reasons, and historical query stability.
- [x] Testability: Scenarios can be implemented with direct resolver/config tests and Store integration fixtures.

## Domain: tools
- [x] Completeness: Covers `mem_project action=health`, all required community states, coverage, latest job status, bounded output, privacy, and unchanged six-tool registry.
- [x] Clarity: Distinguishes health rendering from admin controls and from MCP surface expansion.
- [x] Measurability: Scenarios assert exact state names, max character bounds, and registry membership.
- [x] Testability: Scenarios can be covered by tool formatting tests and MCP registration tests.

## Domain: store
- [x] Completeness: Covers shared identity resolver consumption, community health read model, and privacy-safe telemetry aggregation.
- [x] Clarity: Names all health states and the telemetry fields required for design.
- [x] Measurability: Scenarios assert repeated fallback determinism, health metadata fields, and aggregate counts.
- [x] Testability: Scenarios can be covered with in-memory Store tests and trace/telemetry fixtures.

## Domain: retrieval
- [x] Completeness: Covers full/evidence/returned sizes, exact-or-estimated tokens, mem_get avoidance/escalation, and recall-after-compaction evidence.
- [x] Clarity: Keeps behavior within the existing four-lane retrieval contract and recall funnel.
- [x] Measurability: Scenarios assert size bases, token basis labels, and escalation/avoidance classification.
- [x] Testability: Scenarios can be covered by focused retrieval and funnel correlation tests.

## Domain: evals
- [x] Completeness: Covers runtime token-savings telemetry, per-tool averages, mem_get avoided/escalated cases, and compaction recovery evidence.
- [x] Clarity: States that retrieval correctness gates remain authoritative alongside token savings.
- [x] Measurability: Scenarios require explicit report fields and failure visibility.
- [x] Testability: Scenarios map to retrieval eval fixtures and report assertions.

## Domain: observability
- [x] Completeness: Covers per-tool payload metrics, token exact/estimate labels, mem_get correlation, privacy, bounds, and non-recursive tracing.
- [x] Clarity: Separates telemetry correlation metadata from raw content storage.
- [x] Measurability: Scenarios assert trace fields, avoided/escalated summaries, and redaction behavior.
- [x] Testability: Scenarios can be covered by trace persistence and sanitization tests.

## Domain: knowledge-graph
- [x] Completeness: Covers graph freshness basis, coverage metadata, and latest community job state for health.
- [x] Clarity: Distinguishes diagnostic community health from community construction or GraphRAG answer synthesis.
- [x] Measurability: Scenarios assert graph basis matching, stale transitions, coverage fields, and job-state outputs.
- [x] Testability: Scenarios can be covered by KG/community health fixtures over fresh, stale, rebuilding, failed, degraded, missing, and disabled states.
