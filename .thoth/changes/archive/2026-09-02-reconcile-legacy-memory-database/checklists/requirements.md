# Requirements checklist: Reconcile Legacy Memory Database

**Activation reason**: High failure-cost migration of user-owned memory into an already populated SQLite ledger, with project-identity ambiguity, privacy transformation, temporal lineage, WAL publication, and rollback requirements.

## Initial validation

- [x] CHK001 [Completeness] Do US1-US5 cover the operator's plan, mapping review, candidate merge, atomic publication, replay/audit, source preservation, populated-target preservation, and every declared failure boundary? Evidence: `spec.md` user stories, edge cases, FR-001/FR-002, assumptions, and out-of-scope sections cover all named actors/flows and distinguish separately authorized real-data outcomes.
- [x] CHK002 [Clarity] Does every requirement have one observable interpretation for authoritative source rows, ignored derivatives, exact/isolated/quarantined project resolution, legacy evidence/memory semantics, current-winner precedence, and commit? Evidence: `spec.md` FR-001/FR-002 plus acceptance scenarios define those terms; `plan.md` and `data-model.md` refine them without changing intent.
- [x] CHK003 [Consistency] Are stories, requirements, success criteria, assumptions, and non-goals consistent about legacy observations being historical product memory without inferred current candidates/reviews/promotions or ordered events? Evidence: US3 scenarios 2-5, FR-001, assumptions 1/4, and out-of-scope item 3 state the same trust and temporal boundary; canonical Store requirements expressly permit legacy evidence/memory without inferred observation state.
- [x] CHK004 [Measurability] Can FR-001/FR-002 and every buildable SC be proven through counts, hashes, stable IDs, integrity results, recall results, or zero-delta/failure assertions? Evidence: SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007, SC-008, and SC-009 each declare numeric/closed evidence, and `tasks.md` maps terminating test/build checks to all of them.
- [x] CHK005 [Coverage] Does every US, FR, SC, edge case, and relevant constitution constraint map to specification or verification evidence? Evidence: US1, US2, US3, US4, US5, FR-001, FR-002, SC-010, and SC-011 have explicit story Covers metadata or separately authorized outcome boundaries; validator gates passed through plan/tasks; `plan.md` requirement mapping, risks, and both constitution checks cover the complete declared surface.

## Domain lenses

- [x] CHK006 [Privacy] Are complete/malformed private delimiters, credentials, empty-after-filter fields, raw-report leakage, and quarantined transformations explicitly governed? Evidence: US1/US3 scenarios, edge case 7, FR-001, SC-004, plan privacy rules, and tasks T001/T011/T014.
- [x] CHK007 [Migration] Are source immutability, populated-target backup/candidate construction, WAL/sidecar handling, stopped-target publication, changed inputs, rollback, and cleanup explicit? Evidence: US4, FR-002, SC-007/SC-008, `plan.md` data flow/risks, and tasks T015-T019.
- [x] CHK008 [Identity] Are explicit mappings, exact automatic evidence, unmatched isolation, placeholder/ambiguous quarantine, and the ban on fuzzy/name/remote merging closed? Evidence: US2, edge cases 4-6, FR-001/FR-002, SC-003, assumptions 5, and out-of-scope item 2.
- [x] CHK009 [Temporal integrity] Are revisions, raw summaries, deleted rows, exact dedup, existing target winners, provenance, FTS, replay, and receipt closure unambiguous? Evidence: US3/US5, FR-001, SC-004-SC-006/SC-008/SC-009, `data-model.md`, and tasks T009-T013/T017/T020-T021.
- [x] CHK010 [Product boundary] Does the change remain one-way and observable without a legacy runtime shim, new MCP tool, or optional projection dependency? Evidence: Impact, dependencies/out-of-scope, and both P1/P2/P3/P5 constitution checks in `plan.md`.

## Revalidation

- Not required: no requirement-affecting artifact changed after this initial audit; the checklist was activated in response to the first `ready` warning and validates the already gated spec/plan/tasks set.
