# Requirements checklist: Safe WAL Publication for Legacy Import

**Activation reason**: Publication and restoration can replace a real user database; a false success, false restoration claim, or unbounded concurrency promise has high data-loss and recovery cost.

## Initial validation

- [x] CHK001 [Completeness] Do US1, US2, US3, and US4 cover successful non-empty-WAL publication, unchanged DELETE/no-WAL behavior, every existing failure-injection boundary, locked/busy targets, observable handoff activity, absent targets, and the separately authorized real cutover? Evidence: `spec.md` User stories and Edge cases.
- [x] CHK002 [Clarity] Do FR-001-FR-004 unambiguously distinguish sealed precondition identity, importer-controlled physical WAL normalization, post-quiescence custody identity, logical restoration proof, and residual cross-platform race limits? Evidence: `spec.md` Functional requirements and Assumptions.
- [x] CHK003 [Consistency] Are the stopped-host precondition, no-native-addon boundary, fail-closed handoff behavior, and unchanged CLI/schema/report/mapping contracts consistent across intent, stories, requirements, plan, and non-goals? Evidence: `spec.md` Intent/Assumptions/Out of scope and `plan.md` Technical context/Risks.
- [x] CHK004 [Measurability] Do SC-001, SC-002, SC-003, and SC-004 name observable report, receipt, integrity, foreign-key, baseline, error, or regression evidence, while SC-005 remains explicitly an operational outcome rather than a fake implementation check? Evidence: `spec.md` Success criteria.
- [x] CHK005 [Coverage] Is every US, FR, and SC referenced by at least one story and mapped to a technical decision plus verification seam? Evidence: story `Covers` clauses and `plan.md` Requirement mapping.

## Domain lenses

- [x] CHK006 [Data integrity] Is a verified backup retained before any publication normalization, and does every post-move failure require no-overwrite restoration plus SQLite, foreign-key, and logical equality proof before `priorTargetRestored=true`? Evidence: FR-001/FR-003, SC-002, and `plan.md` Publication sequence.
- [x] CHK007 [Concurrency] Do the requirements reject busy/incomplete checkpoints, revalidate recovery custody and target path occupancy, retain the stopped-host requirement, and avoid claiming impossible native-free atomic locking across close and rename? Evidence: FR-002/FR-004, US3, and `research.md` Residual limitation.
- [x] CHK008 [Migration] Are the untouched legacy source, one-way importer, unchanged schema/plan/report contracts, retry behavior, and separate authorization for real cutover explicit? Evidence: FR-001, SC-004/SC-005, Dependencies, and Out of scope.
- [x] CHK009 [Privacy] Do the unchanged bounded report/CLI contracts and disposable-only tests avoid legacy prose exposure and prevent implementation verification from reading or mutating the real legacy database? Evidence: Impact, SC-004/SC-005, and `plan.md` TDD seams.

## Revalidation

- [x] CHK010 [Durable delta completeness] Does the `[MODIFIED cli]` requirement preserve every previously canonical one-command, override, bounded-output, safe-failure, replay, retry, and advanced-control scenario while adding the WAL publication and restoration scenarios? Evidence: `spec.md` US1-US5 and the pre-archive comparison with `openspec/specs/cli/spec.md`.
