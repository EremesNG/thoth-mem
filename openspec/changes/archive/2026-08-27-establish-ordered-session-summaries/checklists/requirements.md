# Requirements checklist: Establish Ordered Session Summaries

**Activation reason**: The change modifies authoritative SQLite state, forward migration and backup, trust metadata, source-supported derived content, four existing MCP workflows, three native lifecycle adapters, and model-visible recovery. A requirement gap could corrupt lineage, expose cross-session data, or make rollback impossible even if local unit behavior appeared correct.

## Initial validation

- [x] CHK001 [Completeness] Do US1–US4 cover root agent, harness, coding agent, and operator journeys plus replay, degraded identity, invalid support, migration failure, fallback, and model outage? Evidence: each actor has an independent test and the edge-case list covers the named failure paths.
- [x] CHK002 [Clarity] Are evidence, session event, summary submission, summary projection, claim, support, and promoted memory assigned one non-overlapping authority meaning? Evidence: the authority flow and table responsibilities in data-model.md distinguish source assertion, ordered metadata, derived view, and durable knowledge.
- [x] CHK003 [Consistency] Do stories, FRs, assumptions, program boundaries, and non-goals agree that summaries are externally generated projections and checkpoint capture no longer auto-promotes memory? Evidence: US2/US3, FR-002/FR-004/FR-007, assumptions, and out-of-scope clauses state the same boundary.
- [x] CHK004 [Measurability] Does every FR map to an observable seam and does every buildable SC name deterministic pass/fail evidence? Evidence: plan.md maps FR-001–FR-013 to paths/tests and SC-001–SC-004 specify concrete invariants.
- [x] CHK005 [Coverage] Are every US, FR, buildable SC, outcome SC, migration/failure branch, and exact-six-tool constraint represented? Evidence: the validated specification has complete Covers mappings; SC-005 remains an outcome gate and the plan preserves P1 explicitly.

## Domain lenses

- [x] CHK006 [Security] Does the contract prevent historical content from gaining instruction authority and keep sensitive-action authorization outside thoth-mem? Evidence: all recovery remains inside the existing untrusted-data delimiter; the program boundary assigns capability enforcement to each harness.
- [x] CHK007 [Privacy] Are automatic capture, filtering order, support expansion, and excluded traffic explicit? Evidence: US1 rejects assistant/tool/subagent/private traffic, inputs are sanitized before hashes, and compact/context output withholds raw supports.
- [x] CHK008 [Lineage] Can every material claim be traced to same-project, same-session, in-range ordered evidence without one summary-level source list laundering unsupported claims? Evidence: US2 scenario 3, FR-004, SC-002, and the claim-support schema require per-claim sources and atomic failure.
- [x] CHK009 [Migration] Are clean install, in-memory install, successful v3 upgrade, failure rollback, backup verification, reopen idempotency, and no-backfill behavior all required? Evidence: US4, FR-005, SC-001, and data-model.md define each path.
- [x] CHK010 [Recovery] Is precedence deterministic and safe when a summary exists, is missing, is late, is oversized, or belongs to another session? Evidence: US3, edge cases, and the data-model selection rule define session scope, monotonic coverage, caps, and current-handoff fallback.
- [x] CHK011 [Availability/performance] Does ordinary save/recall/recovery remain local and usable with no generator/model/network and under existing host caps? Evidence: US2 scenario 4, FR-010–FR-013, and SC-003/SC-005 make these observable gates.
- [x] CHK012 [Public contract] Can summary behavior be expressed without adding a tool or compatibility shim, and are nested failures closed? Evidence: FR-006–FR-009 and contracts/session-summary.md keep the six names and enumerate zero-side-effect failures.
- [x] CHK013 [Program boundary] Are observations, promotion, retention execution, revocation cascade, telemetry, lexical relaxation, and dense/hybrid work prevented from leaking into this first slice? Evidence: the three-change program boundary and explicit out-of-scope list assign each deferred responsibility.
- [x] CHK014 [Coverage] Are the remaining cross-cutting requirements explicitly audited? Evidence: FR-003 owns atomic session order/trust metadata; FR-008 owns progressive summary expansion; FR-011 owns bounded source-attributed native rendering; FR-012 owns deterministic summary-first selection and handoff fallback.

## Revalidation

- Not required: no requirement-affecting artifact changed after the specification gate; plan.md, data-model.md, and contracts/session-summary.md elaborate the already accepted decisions without changing intent or FR/SC coverage.
