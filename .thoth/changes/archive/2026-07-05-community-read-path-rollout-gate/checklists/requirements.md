# Requirements Quality Checklist

## Domain: retrieval
- [x] Completeness: Captures global default OFF, explicit reversible opt-in, per-project eligibility, fallback states, KG sub-source/no-fifth-lane behavior, output bounds, and deferred non-goals.
- [x] Clarity: Requirements use RFC 2119 language and distinguish evidence-gated eligibility from global default-on behavior.
- [x] Measurability: Gates name observable states and metrics, including fresh committed state, coverage, bounds, and baseline non-empty fallback.
- [x] Testability: Each requirement includes Given/When/Then scenarios suitable for implementation tests or retrieval eval assertions.

## Domain: evals
- [x] Completeness: Captures same-corpus A/B evidence, P4 token-savings metrics, readiness coverage, fallback gates, lane/ranking regression gates, and deferred scope.
- [x] Clarity: Requirements separate disabled baseline, enabled candidate, pass/fail gates, and project-scoped eligibility.
- [x] Measurability: Metrics include full/evidence/returned chars, saved chars, compression, recall/rank quality, lane truth, community safety, and coverage.
- [x] Testability: Each requirement includes scenarios that can be mapped to retrieval eval cases and readiness report assertions.

## Domain: tools
- [x] Completeness: Captures compact six-tool MCP preservation, existing-output-only community annotations, source escalation, and deferred non-goals.
- [x] Clarity: Requirements state that rollout evidence and admin actions stay outside new MCP tooling.
- [x] Measurability: Registry invariants and output-contract constraints can be asserted by tool registration and rendering tests.
- [x] Testability: Each requirement includes scenarios for registry inspection and existing tool output behavior.
