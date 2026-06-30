# Archive Report: graph-lite-consolidation

- Change: graph-lite-consolidation
- Date: 2026-06-30
- Persistence mode: openspec only
- Pipeline: full
- Archive path: openspec/changes/archive/2026-06-30-graph-lite-consolidation/
- Topic Key: sdd/graph-lite-consolidation/archive-report
- Verification lineage:
  - OpenSpec verify report: openspec/changes/archive/2026-06-30-graph-lite-consolidation/verify-report.md
  - Verdict: pass
  - Critical: None

## Merged Domains

### openspec/specs/knowledge-graph/spec.md
- ADDED: `kg_triples MUST Be the Single Source of Graph-Derived Facts`
- MODIFIED: `KG Records MUST Preserve Provenance and Confidence`
- REMOVED: `observation_facts MUST Remain Compatible as Graph-lite Fallback/Source`
- ADDED assumption section from merge delta preserved.

### openspec/specs/store/spec.md
- ADDED: `Store MUST Provide a KG-Backed ObservationFact Adapter`
- MODIFIED: `Schema Evolution MUST Preserve Existing Lexical Compatibility`
- REMOVED: `Schema Evolution MUST Preserve Existing Lexical and Graph-lite Compatibility`
- Added assumption block preserved.

### openspec/specs/indexing/spec.md
- ADDED: `Deterministic KG Facts MUST Be Written Synchronously on Save`
- MODIFIED: `Post-Save Semantic Consistency MUST Be Eventual and Explicit`
- Added `CL-1`/`CL-2` assumption entries.

### openspec/specs/evals/spec.md
- ADDED: `Facts-Source Eval MUST Assert on kg_triples`
- ADDED fixture and non-regression assumptions.

### openspec/specs/tools/spec.md
- MODIFIED: `mem_project action=graph MUST Be KG-Backed and Behavior-Preserving`
- MODIFIED MCP compactness requirement to explicitly anchor unchanged registry during repointing.
- Added assumption block.

## Merge Result

- Canonical section mapping was used where possible:
  - `ADDED Requirements` merged into baseline `Requirements` sections.
  - `MODIFIED Requirements` merged into `MODIFIED Requirements`.
  - `REMOVED Requirements` merged into `REMOVED Requirements`.
  - `Assumptions` merged into `Assumptions`.
- Existing pre-merge requirements remain present.

## Mode-based Skips

- No thoth-mem persistence actions were performed (as requested).
- No source code or tests were edited.

## Constitution Suggestion

- `verify-report.md` surfaced advisory suggestion for potential `sdd-constitution` follow-up.
  This is advisory only and did not block archiving.

## Status

archived

