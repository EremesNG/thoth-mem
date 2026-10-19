# Requirements checklist: OpenCode managed setup convergence

**Activation reason**: The confirmed contract intentionally permits destructive replacement, downgrade, malformed-config recreation, invalid-journal discard, and removal of durable rollback evidence across global and project OpenCode scopes. These choices require explicit completeness, security, recovery, and migration auditing before implementation.

## Initial validation

- [x] CHK001 [Completeness] Do US1-US4 cover the user, operator, normal convergence, exact no-op, config repair, interruption recovery, invalid evidence, cleanup failure, planning, packed delivery, and restart flows? Evidence: every named flow has at least one Given/When/Then scenario and maps to FR-001 through FR-011.
- [x] CHK002 [Clarity] Does each FR state one observable policy without relying on “safe”, “managed”, or “current” as undefined authority? Evidence: FR-001 defines canonical path ownership, FR-002 defines exact no-op versus convergence, FR-003 defines full replacement/link behavior, and FR-005 through FR-008 define journal lifecycle and cleanup outcomes.
- [x] CHK003 [Consistency] Are stories, requirements, assumptions, dependencies, and non-goals consistent about full-directory deletion, any-direction version convergence, no `--force`, transient-only rollback, and both OpenCode scopes? Evidence: US1/US2, FR-001/FR-002/FR-007, assumptions 1-2, and out-of-scope items use the same rules; Codex/Claude remain excluded.
- [x] CHK004 [Measurability] Does every FR have a public or isolated verification seam and does every SC define countable/pass-fail evidence? Evidence: plan requirement mapping covers FR-001 through FR-011 and SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, and SC-007; the spec passed the Full `specify` validator gate.
- [x] CHK005 [Coverage] Is every US, FR, SC, actor, failure mode, and confirmed constraint represented in traceability? Evidence: every story has `Covers`, every FR appears in the plan table, every SC appears in the evidence table, and edge cases enumerate metadata, target kinds, config candidates, crash boundaries, receipt isolation, path spaces, and concurrency.

## Domain lenses

- [x] CHK006 [Security] Do requirements prevent link traversal, path escape, secret leakage, and cross-target receipt deletion despite permissive ownership? Evidence: FR-003 removes the final link without following it, FR-006 forbids embedded-path deletion, FR-007 is harness/scope/target bounded, FR-011 preflights boundaries, and SC-002/SC-003 require traversal and diagnostic checks.
- [x] CHK007 [Migration] Are older, newer, missing, malformed, and same-version states all assigned deterministic outcomes, including legacy receipts? Evidence: US1 scenarios, FR-001/FR-002/FR-010, edge cases, and the plan's legacy receipt migration risk cover each state; downgrade is explicitly accepted.
- [x] CHK008 [Recovery] Are live failure, process crash, valid journal, invalid journal, post-verification crash, and cleanup failure distinguishable? Evidence: US2 has five scenarios; FR-005 through FR-008 specify restoration, reset, verify-before-delete, warning, and retry semantics.
- [x] CHK009 [User data] Is the exception for malformed external configuration explicit and recoverable? Evidence: US3 and FR-004 require a byte-exact non-colliding backup before recreation, path-only disclosure, unrelated-setting preservation for parseable input, and JSONC precedence.
- [x] CHK010 [Public contract] Are changed and unchanged CLI behaviors explicit? Evidence: FR-009 preserves plan zero-write behavior, result status/changed semantics, and restart guidance; out of scope excludes process control, while the plan records the P5 justified exception for post-success rollback removal.
- [x] CHK011 [Harness isolation] Can permissive OpenCode behavior leak into Codex or Claude? Evidence: affected capabilities are CLI/packaging, FRs name OpenCode, out of scope excludes both other harnesses, and plan design requires an OpenCode-only branch plus regression suites.

## Revalidation

- Not required: The checklist was created after the specification passed `specify` and the technical plan passed `plan`; the plan added implementation detail without changing any confirmed requirement, story, criterion, assumption, or non-goal.
