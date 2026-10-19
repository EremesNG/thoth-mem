# Requirements checklist: Raise Local Recall at 5

**Activation reason**: Promotion changes the default retrieval ranking under hard quality, latency, footprint, provenance, and zero-call gates. A false pass could degrade every recall request or silently reintroduce storage cost, so requirements need an explicit fail-closed audit before implementation.

## Initial validation

- [x] CHK001 [Completeness] Are every actor, normal flow, failure flow, and constraint represented? Yes — US1 covers the coding-agent retrieval outcome, US2 covers benchmark maintainers and evidence integrity, US3 covers product promotion/retention, edge cases cover limits/query shapes/interruption, and FR-007 plus out-of-scope clauses prohibit embeddings and public expansion.
- [x] CHK002 [Clarity] Does each requirement have one observable interpretation? Yes — FR-002 fixes sanitization/fusion behavior, FR-004 fixes the four-lane comparison, FR-005 fixes Top-5 metric meaning, and FR-006 fixes the sole fail-closed candidate; E0 has one distinct strategy identity, exact strict/relaxed topology, three selected terms, per-stage/final cap 5, RRF constant 60/equal weights in the plan, one four-lane inventory, and one sole promotion candidate.
- [x] CHK003 [Consistency] Do stories, FRs, SCs, assumptions, plan, and non-goals agree? Yes — all preserve `any-prefix-v1` until evidence, use the same 470-question denominator, require four equal-budget lanes, forbid schema/vector changes, and route a failed E0 to re-specification rather than hidden E1 work.
- [x] CHK004 [Measurability] Can every FR and SC be decided from objective evidence? Yes — SC-002 uses the service seam, SC-003 uses source/schema/package/tool inventory, SC-004 uses adversarial report validation, and SC-005 uses the official outcome; buildable criteria map to planner/service/report/runner/inventory tests while outcomes require integer 447-of-470 hits, explicit secondary metric floors, a 2x same-run p95 ceiling, byte equality, complete provenance, zero errors/calls, and source hash identity.
- [x] CHK005 [Coverage] Is every US, FR, buildable SC, outcome SC, and failure mode traced? Yes — tasks T001–T024 explicitly cover FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, SC-001, SC-002, SC-003, SC-004, SC-005, and SC-006; T025 owns independent verdicts; failure paths retain the current default and preserve immutable evidence.

## Domain lenses

- [x] CHK006 [Performance] Are latency and work requirements resistant to misleading averages? Yes — promotion uses same-run p95 against an unchanged control, reports p50/p95/p99 and raw versus fused rows, and rejects compensated diagnostic evidence rather than accepting only average latency.
- [x] CHK007 [Privacy/locality] Can E0 introduce private-text diagnostics, remote calls, models, vector state, or hidden database growth? No — FR-003/FR-007 prohibit them, diagnostics remain aggregate-only, source/schema/package/tool checks require zero expansion, and outcome lanes require identical SQLite bytes plus literal zero calls.
- [x] CHK008 [Evaluation integrity] Can lane/reference ambiguity or metric relabelling promote the wrong strategy? No — v3 has four exact lane keys, keeps two current strategies as references, admits only E0 as candidate, uses positional Top-5 metrics and integer hit arithmetic, and recomputes decisions from per-question evidence.

## Revalidation

- [x] CHK009 [Coverage] Were Oracle round-1 repairs revalidated across affected requirements and tasks? Yes — FR-001/SC-001 now preserve the null empty-query plan/hash contract; FR-004/SC-004 explicitly own the base retrieval-report validator/schema/tests; provenance separately binds the original v1 baseline and exact r4 v2 artifact/hash/metrics through a new manifest; tasks T008–T019 provide red/green ownership before official execution.
