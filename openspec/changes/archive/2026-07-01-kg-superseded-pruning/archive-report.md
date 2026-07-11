# Archive Report: kg-superseded-pruning

## Change Summary
- Change name: kg-superseded-pruning
- Archive date: 2026-07-01
- Mode: openspec
- Verdict gate: Passed (`verify-report.md` shows `round 2` and `## Verdict` `pass` with no critical issues)

## Merge Report
- Baseline domains merged: config, evals, indexing, knowledge-graph, retrieval, store, tools
- Change specs consumed:
  - openspec/changes/kg-superseded-pruning/specs/config/spec.md
  - openspec/changes/kg-superseded-pruning/specs/evals/spec.md
  - openspec/changes/kg-superseded-pruning/specs/indexing/spec.md
  - openspec/changes/kg-superseded-pruning/specs/knowledge-graph/spec.md
  - openspec/changes/kg-superseded-pruning/specs/retrieval/spec.md
  - openspec/changes/kg-superseded-pruning/specs/store/spec.md
  - openspec/changes/kg-superseded-pruning/specs/tools/spec.md
- Merge method: appended each delta under `## Delta from kg-superseded-pruning` to preserve existing baseline spec body and canonical sections.

## Archive Location
- Candidate archive path: openspec/changes/archive/2026-07-01-kg-superseded-pruning/

## Verification Lineage
- Verification artifacts used:
  - openspec/changes/kg-superseded-pruning/verify-report.md
  - openspec/changes/kg-superseded-pruning/tasks.md
  - openspec/changes/kg-superseded-pruning/proposal.md
- Passing criteria met:
  - `round 2` present
  - `## Verdict` is `pass`
  - No critical issues in the verified report

## Mode-Based Skips
- Non-code archival scope only. No source/test implementation changes made.
- No constitution execution performed; surfaced as report-only suggestion.

## Constitution Suggestion
- Report-only suggestion (from verified report): run `sdd-constitution` to record a constitution amendment.
