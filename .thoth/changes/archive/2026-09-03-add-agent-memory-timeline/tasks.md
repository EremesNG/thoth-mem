# Tasks: Agent Memory Timeline

## Authoring contract

Task IDs are global and sequential. `[P]` tasks belong to the declared disjoint implementation lanes; final reconciliation and verification tasks run after their barrier.

## MVP scope

US1 is the MVP: an agent can call the existing `mem_project` tool with `action=timeline` and receive an exact-project, deterministic, compact list covering all promoted-memory temporal states. Completion evidence is the green core/MCP timeline suite through T005 with `ALL_TOOLS` still length six.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005`; `T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012`; both lanes must complete before `T013 -> T014 -> T015 -> T016 -> T017 -> T018 -> T019 -> T020 -> T021 -> T022`.

## Story US1

- [x] T001 [P] [US1] Write failing core tests for exact-project ordering across all statuses, equal timestamps, imported backdating, bounds, live keyset pagination, malformed/mismatched cursors, limit and budget behavior covering FR-002, FR-004, SC-001, and SC-002 in `tests/memory-core/timeline.test.ts` | Verify: red evidence captured missing service, insufficient-budget progress, and missing MCP behavior before implementation.
- [x] T002 [P] [US1] Add typed timeline input, compact item, and result contracts covering FR-002 and FR-003 in `src/memory-core/contracts.ts` | Verify: TypeScript recognizes the closed timeline shapes without weakening existing record types.
- [x] T003 [P] [US1] Implement project resolution, normalized inclusive bounds, versioned project/bound cursor validation, deterministic validFrom-descending/ID-ascending SQL, compact Unicode-safe rendering, and truthful budget continuation covering FR-002, FR-003, FR-004, SC-001, and SC-002 in `src/memory-core/service.ts` | Verify: focused core/MCP tests pass 17/17 with zero-write validation and duplicate-free page traversal; the full regression suite preserves existing recovery, context, and briefing behavior.

## Story US2

- [x] T004 [P] [US2] Add failing MCP tests for the timeline action, strict safe input, compact envelope, forbidden evidence/session/summary/observation data, selected-ID expansion, unknown-project behavior, and unchanged six-tool inventory covering FR-001, FR-003, FR-004, SC-003 in `tests/tools/mcp.test.ts` | Verify: red evidence captured missing timeline action plus premature list return for timeline-only fields; existing observation suites remain in the full regression run.
- [x] T005 [P] [US2] Extend the mem_project schema and handler with timeline mapping, sources, budget, warnings, and continuation while preserving all existing actions and exactly six tools covering FR-001, FR-003, FR-004, and FR-007 in `src/tools/index.ts` | Verify: focused core/MCP tests pass 17/17, build passes, timeline output expands only through the existing mem_get ID path, and observation inspection remains unchanged.

## Story US3

- [x] T006 [P] [US3] Add failing semantic assertions for chronological routing, timeline-to-mem_get progression, historical trust boundaries, canonical/host parity, and legacy include_timeline rejection covering FR-005, FR-006, SC-004 in `tests/packaging/first-product.test.ts` | Verify: the new assertions failed before Skill editing and pass with all prior recall/save/handoff/identity/privacy safety assertions active.
- [x] T007 [P] [US3] Add or refine the integration-level packed Skill assertions needed to prove timeline guidance without weakening exact-six-tool checks covering FR-006 and SC-004 in `tests/integration/package.test.ts` | Verify: the focused integration test proves timeline guidance and still rejects legacy vocabulary; packed smoke retains disposable-host coverage.
- [x] T008 [P] [US3] Teach concise query-versus-chronology routing, bounded cursor use, untrusted historical context, and selective mem_get expansion while preserving identity/privacy/save/handoff guidance covering FR-005 and SC-004 in `plugin/skills/thoth-mem/SKILL.md` | Verify: the canonical Skill is 5,736 bytes, below its 7,244-byte tested ceiling; the external Python validator passes with UTF-8 mode enabled and prior semantic-boundary guidance remains present.
- [x] T009 [P] [US3] Synchronize the canonical Skill into the OpenCode distribution using the existing integration sync workflow covering FR-005 and FR-006 in `integrations/opencode/skills/thoth-mem/SKILL.md` | Verify: the OpenCode Skill is byte-identical to the canonical Skill and contains the timeline workflow.
- [x] T010 [P] [US3] Synchronize the canonical Skill into the Codex distribution using the existing integration sync workflow covering FR-005 and FR-006 in `integrations/codex/skills/thoth-mem/SKILL.md` | Verify: the Codex Skill is byte-identical to the canonical Skill and contains the timeline workflow.
- [x] T011 [P] [US3] Synchronize the canonical Skill into the Claude Code distribution using the existing integration sync workflow covering FR-005 and FR-006 in `integrations/claude-code/skills/thoth-mem/SKILL.md` | Verify: the Claude Code Skill is byte-identical to the canonical Skill and contains the timeline workflow.
- [x] T012 [P] [US3] Refresh canonical public-asset hashes after Skill synchronization covering FR-006 and SC-004 in `plugin/distribution-lock.json` | Verify: integration verification reports no stale public or host Skill asset and packed verification remains disposable for every host.

## Story US1-US3 documentation

- [x] T013 Document the additive timeline action, compact fields, validity ordering, live cursor semantics, exclusions, and agent workflow covering FR-001, FR-002, FR-003, FR-005, and FR-007 in `README.md` | Verify: public documentation describes one six-tool timeline-to-mem_get workflow without claiming raw activity history or snapshot isolation.
- [x] T014 Update routed persistence and MCP surface guidance with authoritative timeline semantics and verification commands covering FR-001, FR-002, FR-003, FR-004, and FR-007 in `docs/agent/persistence-retrieval.md` | Verify: routed documentation agrees with the implemented order, bounds, cursor, budget, privacy, and no-migration behavior.
- [x] T015 Align the concise public-surface action contract and Skill routing ownership covering FR-001, FR-005, and FR-006 in `docs/agent/surfaces.md` | Verify: the surface guide names timeline under mem_project, preserves exactly six tools, and identifies the canonical Skill/sync path.

## Parallel execution

### Group P1

- Lane L1: T001 -> T002 -> T003 -> T004 -> T005 | Owner: deep
- Lane L2: T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 | Owner: quick
- Prerequisites: None
- Barrier: T013
- Rationale: The runtime lane mutates only memory-core, MCP, and focused tool-test paths, while the Skill lane mutates only packaging tests, canonical/generated Skill paths, and the distribution lock; those path sets are disjoint and both consume the already fixed plan contract rather than peer output.

## Final verification

- [x] T016 Reconcile both implementation lanes, simplify changed runtime code without behavior changes, and run focused timeline/tool/Skill/package checks covering FR-001 through FR-007 and SC-001 through SC-004 in `src/memory-core/service.ts` | Verify: runtime/MCP suites pass 17/17, Skill/package suites pass 12/12, the canonical Skill validator passes in UTF-8 mode, and the simplification review found no safe reduction that improved clarity without weakening the timeline contract.
- [x] T017 Run build, full tests, integration verification, packed smoke, diff hygiene, and the ready/verification gates covering FR-001 through FR-007 and SC-005 in `package.json` | Verify: build passes; the full suite passes 52 files/430 tests; integration inventory and packed smoke pass for OpenCode, Codex, and Claude Code; the fixture benchmark and prepublishOnly pass; diff hygiene is clean after discarding only the generated benchmark report drift; and the ready gate passes without warnings before fresh Oracle review.

## Canonical delta reconciliation

- [x] T018 [US4] Reopen and combine the existing bounded observation-inspection contract with the additive timeline contract after the archive-result audit exposed replacement loss in `openspec/changes/add-agent-memory-timeline/spec.md` | Verify: the replacement retains all four prior observation scenarios and adds the three accepted timeline scenarios under FR-001.
- [x] T019 [US5] Reopen and combine the existing intentional project-recovery contract with deterministic timeline retrieval in `openspec/changes/add-agent-memory-timeline/spec.md` | Verify: the replacement retains both prior recovery scenarios and adds the accepted timeline ordering, isolation, validation, bounds, pagination, and expansion scenarios under FR-002.
- [x] T020 [US6] Reopen and combine the existing semantic-boundary Skill cadence with the timeline routing guidance in `openspec/changes/add-agent-memory-timeline/spec.md` | Verify: the replacement retains all five prior memory-practice scenarios and adds the three accepted cross-host timeline scenarios under FR-005.
- [x] T021 [US7] Reopen and combine the existing disposable packed-smoke contract with cross-host timeline assertions in `openspec/changes/add-agent-memory-timeline/spec.md` | Verify: the replacement retains the prior packed-smoke scenario and adds the three accepted cross-host timeline scenarios under FR-006.
- [x] T022 Revalidate corrected planning artifacts, obtain fresh independent plan and final verification judgments, and prepare the combined deltas for transactional closeout in `openspec/changes/add-agent-memory-timeline/archive-report.md` | Verify: ready passes without warnings; a fresh plan Oracle returns OKAY; a separate fresh final Oracle returns PASS after 29/29 focused tests, build, Skill validation, Git-HEAD scenario comparison, and archive-parser inspection; the report is ready for the terminal root-owned closeout and archive transition.
