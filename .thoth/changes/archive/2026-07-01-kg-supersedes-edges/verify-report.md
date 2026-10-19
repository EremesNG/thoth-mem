# Verification Report: KG Supersedes / Temporal Edges

## Round

round 3

## Completeness

PASS. All task checkboxes are complete across tasks 1.1 through 4.5, including the round-2 C2 remediation task at `openspec/changes/kg-supersedes-edges/tasks.md:468`. The requirements checklist records final gates, shipped default `kgSupersedeEnabled=true`, eval evidence, and MINOR label at `openspec/changes/kg-supersedes-edges/checklists/requirements.md:109`.

Compliance: 19/19 requirements, 49/49 scenarios.

## Build and Test Evidence

Read-only verification did not rerun mutating build/eval commands. Root-provided executed evidence is accepted as the command evidence for this final bounded round:

- `pnpm exec vitest run tests/indexing/kg-extractor.test.ts tests/store/index.test.ts` passed: 68 tests.
- `pnpm run build` passed.
- `pnpm run eval:retrieval` passed: 23 cases; OFF/ON no-regression 100.0%; flag-off behavior 100.0%; `supersession current fact wins` PASS; Recall@5 100.0%; MRR 0.978.
- `pnpm test` passed: 46 files / 529 tests.
- `git diff --check` exited 0 with LF->CRLF warnings only.

## Compliance Matrix

- knowledge-graph: 5/5 requirements, 14/14 scenarios compliant. `SUPERSEDES` is vocabulary-visible at `src/indexing/kg-extractor.ts:11`, excluded from structural admission at `src/indexing/kg-extractor.ts:20`, rejected for LLM triples at `src/indexing/kg-extractor.ts:273`, and covered by explicit/structured/LLM tests at `tests/indexing/kg-extractor.test.ts:94`, `tests/indexing/kg-extractor.test.ts:119`, `tests/indexing/kg-extractor.test.ts:199`.
- store: 4/4 requirements, 12/12 scenarios compliant. Additive nullable columns are in fresh schema at `src/store/schema.ts:195`, migration adds them idempotently at `src/store/migrations.ts:218`, and migration/schema tests cover nullability/idempotency at `tests/store/migration.test.ts:241` and `tests/store/schema.test.ts:87`.
- writer/supersession: compliant. The writer gates behavior on `kgSupersedeEnabled`, preserves flag-off delete/reinsert at `src/indexing/jobs.ts:564`, diffs only `source_id=obs.id` at `src/indexing/jobs.ts:543`, revives rows on conflict at `src/indexing/jobs.ts:529`, and marks removed/replaced rows without deleting at `src/indexing/jobs.ts:609`.
- retrieval: 3/3 requirements, 7/7 scenarios compliant. Direct KG lane conditionally reads supersession columns at `src/store/index.ts:2107`, downweights and flags candidates at `src/store/index.ts:2139`, and tests current-over-superseded behavior at `tests/store/index.test.ts:1058`.
- multi-hop: compliant. Flag-on CASE deprioritization is conditional at `src/store/index.ts:2279`, flag-off SQL omits supersession columns, covered by `tests/store/kg-multi-hop.test.ts:197`.
- config: 3/3 requirements, 6/6 scenarios compliant. Defaults are `true/false/0.8/0.5` at `src/config.ts:169`, env > persisted > default is implemented at `src/config.ts:463` and `src/config.ts:485`, and schema enum includes `SUPERSEDES` at `config.schema.json:237`.
- evals: 2/2 requirements, 5/5 scenarios compliant. C1 remains fixed: eval case exists at `src/evals/retrieval.ts:535`, OFF/ON and flag-off metrics are emitted at `src/evals/retrieval.ts:678`, regression throws on worse ON rank at `src/evals/retrieval.ts:992`, and tests assert both gates at `tests/evals/retrieval.test.ts:78`.
- tools: 2/2 requirements, 5/5 scenarios compliant. `formatProjectGraph` passes `include_superseded` at `src/tools/project-views.ts:32`; current-state/history behavior is tested at `tests/store/visualization.test.ts:235`; portable export remains unchanged at `tests/store/export-import.test.ts:115`.

## Design Coherence

PASS. Implementation matches B3 Option B: deterministic per-observation diff over `kg_triples`, additive nullable columns, no bi-temporal or point-in-time query work, no `CONTRADICTS`/`REPLACES` additions found in `src/`, no emitted `SUPERSEDES` triples, and no cross-observation supersession sweep symbol found.

C2 is fixed. `SUPERSEDES` remains in `KG_RELATION_TYPES` and schema vocabulary, but structural relation admission uses `STRUCTURAL_RELATION_TYPE_SET` excluding `SUPERSEDES`; explicit graph notation, structured triple blocks, and LLM triple input all have targeted tests proving no `SUPERSEDES` KG triples are emitted.

## Issues Found

### Critical

None.

### Warnings

None.

## Verdict

pass
