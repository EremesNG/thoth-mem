# Archive Report: output-caps-and-pruning

- Change: output-caps-and-pruning
- Date: 2026-06-29
- Persistence mode: openspec
- Pipeline: full
- Archive path: openspec/changes/archive/2026-06-29-output-caps-and-pruning/
- Verification lineage:
  - OpenSpec verify report: openspec/changes/archive/2026-06-29-output-caps-and-pruning/verify-report.md
  - Verdict: pass (round 2, 21/21 compliance scenarios, no critical issues)

## What Shipped

Output character caps for `mem_context` and `mem_project action=summary` backed by a
new `maxContextChars` config knob (default 8000). Enforcement is at the shared
`Store.getContext` layer so all surfaces (MCP tools, HTTP summary, CLI) inherit the
bound without per-surface reimplementation. Observation content is rendered as bounded
previews by default; full bodies remain available via `mem_get`. A per-call override
and an explicit unbounded sentinel (`0`) are supported. The `maxContentLength` (input,
warn-only) knob is documented as distinct from the new output cap.

## Merged Domains

### openspec/specs/tools/spec.md
- MODIFIED: "Requirement: MCP Surface MUST Be Compact and Workflow-Level" — body text
  updated to clarify bounded-output change does not mutate the registry; added scenario
  "Bounded-output change does not alter the registry".
- ADDED: "Requirement: Context And Summary Responses MUST Be Bounded By A Configurable
  Character Budget" (2 scenarios).
- ADDED: "Requirement: Context And Summary Responses MUST Render Previews By Default
  With Full Content Via mem_get" (1 scenario).
- ADDED: "Requirement: Context And Summary Budget MUST Be Overridable Per Call"
  (1 scenario).
- ADDED: "Requirement: Context And Summary Output MUST Support An Explicit Unbounded Mode"
  (1 scenario).
- ADDED: "Requirement: Output Bound MUST Be Applied At The Shared getContext Layer"
  (1 scenario).

### openspec/specs/store/spec.md
- ADDED: "Requirement: Store.getContext MUST Accept And Enforce A Max-Output-Chars Budget"
  (3 scenarios).
- ADDED: "Requirement: formatObservationMarkdown MUST Support A Preview/Truncation Mode"
  (2 scenarios).
- ADDED: "Requirement: Bounded Context Rendering MUST Preserve Existing Section Structure
  And Escalation" (1 scenario).

### openspec/specs/config/spec.md
- ADDED: "Requirement: Context Output Budget MUST Be Configurable With Deterministic
  Resolution" (4 scenarios).
- ADDED: "Requirement: Context Output Budget MUST Support An Unbounded Sentinel"
  (1 scenario).
- ADDED: "Requirement: maxContentLength MUST Be Input-Validation Warn-Only And Distinct
  From The Output Cap" (2 scenarios).

## Merge Result

Non-destructive: all pre-existing requirements in all three baseline specs are
preserved. No requirement was removed. The delta ADDED requirements were inserted
and the single MODIFIED requirement in tools/spec.md was updated in-place with an
expanded body and an additional scenario.

## Verification Status

GREEN — 462 tests (44 files) passed + build passed (pnpm run build).
- All 21 compliance scenarios: Compliant.
- No critical issues. No warnings.

## Commit SHAs

- 2d4f958
- 4be721f
- 872d546

## Notes

- Persistence mode: openspec only (no thoth-mem writes per task scope).
- Scope guard confirmed: pruning items D-1/D-2 deferred to production-hardening-dashboard-v2;
  D-3 deferred to sync-and-resilience. Neither active change was touched.
- Constitution suggestion: artifacts reference constitution principles P1/P2/P4/P5;
  advisory sdd-constitution review suggested (report-only, does not affect archive).

## Status

archived
