# Requirements checklist: Optimize Relaxed Lexical Latency

**Activation reason**: High failure cost at the intersection of persistent SQLite migration, privacy-safe diagnostics, deterministic public retrieval, and a host-sensitive performance promotion gate.

## Initial validation

- [x] CHK001 [Completeness] US1-US3 cover maintainer diagnostics, bounded retrieval execution, official promotion, normal disabled behavior, invalid/empty queries, migration failure, interrupted runs, and fail-closed default retention in `spec.md`, `plan.md`, and `tasks.md`.
- [x] CHK002 [Clarity] FR-001 through FR-007 each define one observable boundary: equal public budgets, safe query planning, deterministic capped results, report evidence, neutral diagnostics, gated default, and unchanged local six-tool surface.
- [x] CHK003 [Consistency] Stories, FRs, SCs, assumptions, and exclusions consistently keep public Top-20 as a maximum while declaring an internal candidate cap; none changes scoring, corpus, control behavior, or promotion thresholds.
- [x] CHK004 [Measurability] SC-001 through SC-004 have deterministic buildable seams and SC-005/SC-006 name the complete 470-question outcome, exact quality/resource gates, and unique-winner condition.
- [x] CHK005 [Coverage] US1, US2, and US3; FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, and FR-007; and SC-001, SC-002, SC-003, SC-004, SC-005, and SC-006 each map to the requirement table and sequential tasks, while outcome-only SC-005/SC-006 map to official evidence and independent verification rather than artificial code.

## Domain lenses

- [x] CHK006 [Performance] Same-run p95 is the only promotion latency decision; absolute timings remain diagnostic, every lane enables identical measurement, and no normal unit test uses a wall-clock pass threshold.
- [x] CHK007 [Migration] Revision 5 touches only rebuildable FTS data, executes transactionally, preserves authoritative rows, verifies row count/foreign keys/searchability, and defines failure rollback without a compatibility table.
- [x] CHK008 [Privacy] Diagnostic fields are allow-listed counters, hashes, stages, reasons, and timings; query/memory/evidence text, raw SQL, source references, and private metadata are explicitly forbidden.
- [x] CHK009 [Determinism] The control is byte-compatible, retained candidate rows remain a deterministic BM25 prefix with stable tie-breaks, exact-first precedence remains, and configuration/plan hashes bind the internal cap.
- [x] CHK010 [Fail-closed promotion] Incomplete, inconsistent, regressing, over-footprint, over-latency, tied, erroneous, externally calling, or provenance-invalid evidence retains `all-prefix-v1` and enters convergence without threshold changes.

## Revalidation

- [x] CHK011 [Coverage] After Oracle round 1, revalidated US2, FR-002, FR-004, FR-005, SC-003, and SC-004 against the explicit 2→3→4→5 migration chain, split schema/migration ownership, structural-versus-semantic validator ownership, and concrete no-clobber report path; no user-facing requirement or frozen gate changed.
- [x] CHK012 [Coverage] After failed final verification round 1, revalidated FR-002 through FR-006 and SC-002 through SC-006 against F-001/F-002/F-003/W-001; the convergence candidate narrows only configuration-hashed internal work, preserves the public Top-20 and every frozen gate, and publishes to a new path.
