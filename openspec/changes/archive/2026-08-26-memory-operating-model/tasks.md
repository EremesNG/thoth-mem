# Tasks: Memory operating model

## Authoring contract

Task identifiers are globally sequential. Behavior work is test-first. Every task names one owned repository path, explicit FR/SC coverage, and one observable verification seam. Outcome SC-007/SC-008 remain later operational gates and do not manufacture repository implementation work.

## MVP scope

US1 is the first independently testable increment: verified root prompts remain immutable evidence only, checkpoint promotion remains bounded/source-linked/idempotent, excluded streams remain absent, and the synchronized Skill teaches the durable promotion and handoff contract. US2 is the first user-visible continuity increment and is required before any host smoke.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005`; `T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013 -> T014 -> T015 -> T016`; `T012 -> T017 -> T018`; `T016 + T018 -> T019 -> T020 -> T021 -> T022`; `T022 -> T023 -> T024 -> T025 -> T026 -> T027 -> T028 -> T029`. Core selection precedes final core rendering; lifecycle integration precedes both thin host adapters; compact payload omission precedes benchmark measurement.

## Story US1

- [x] T001 [US1] Add failing automatic-capture, privacy, delegated-stream, checkpoint-promotion, and replay assertions for FR-001/FR-002/FR-004/FR-010 and SC-001/SC-002 in `tests/integration/lifecycle.test.ts` | Verify: the focused suite proves root prompts create evidence only, excluded inputs create zero unauthorized rows, and replay creates one state change.
- [x] T002 [US1] Implement the bounded source-linked two-layer lifecycle policy and idempotent checkpoint behavior for FR-001/FR-002/FR-004/FR-010 and SC-001/SC-002 in `src/memory-core/service.ts` | Verify: T001 passes without a schema/taxonomy change or an added model/projection dependency.
- [x] T003 [US1] Add failing distribution-contract assertions for the promotion test, failure outcome, topic correction, privacy exclusions, and actionable handoff fields for FR-003 and SC-001 in `tests/integration/public-plugin-package.test.ts` | Verify: the test rejects the current incomplete Skill and names every required semantic-boundary field.
- [x] T004 [US1] Rewrite the canonical memory Skill with the researched save/recall/handoff operating contract for FR-003 and SC-001 in `plugin/skills/thoth-mem/SKILL.md` | Verify: T003 passes against the canonical Skill using only the exact six MCP tools.
- [x] T005 [US1] Synchronize and verify byte-identical host Skill distributions for FR-003 and SC-001 in `scripts/sync-plugin-distribution.mjs` | Verify: integration synchronization changes only managed distribution assets and integration verification reports matching Skill hashes.

## Story US2

- [x] T006 [US2] Add failing handoff-first, failure-lesson, deterministic-budget, project-isolation, and hidden-action continuation tests for FR-005/FR-007/FR-010 and SC-003/SC-004/SC-005 in `tests/memory-core/context.test.ts` | Verify: the current generic ordering fails while the fixture identifies the hidden objective/archive path/first pending action expected after recovery.
- [x] T007 [US2] Implement one deterministic promoted-memory continuation selector shared by context, project briefing, and lifecycle recovery for FR-005/FR-007/FR-010 and SC-003/SC-004/SC-005 in `src/memory-core/service.ts` | Verify: T006 passes with handoff first, stable IDs, one aggregate budget, current/history truth, and raw evidence absent.
- [x] T008 [US2] Add failing pure-renderer tests for content-first allocation, untrusted-data delimiters, Unicode cap, control characters, complete memory IDs, evidence omission, and identity-only no-fit truth for FR-006/FR-010 and SC-003/SC-004 in `tests/memory-core/continuation.test.ts` | Verify: fixtures define at most three items, a 120-code-point truncated-item floor, complete fixed metadata, and false delivery when no item survives.
- [x] T009 [US2] Implement the pure host-neutral continuation renderer and selected-item measurements for FR-006/FR-010 and SC-003/SC-004 in `src/memory-core/continuation.ts` | Verify: T008 passes with one final string at or below 1,000 code points and deterministic repeated output.
- [x] T010 [US2] Add failing lifecycle-envelope tests where candidates exist but none fit, identity-only output is produced, and successful output reports exact selected IDs for FR-006/FR-010 and SC-002/SC-003/SC-004 in `tests/integration/lifecycle.test.ts` | Verify: the current pre-render item-count capability rule fails while the final-render ownership contract is explicit.
- [x] T011 [US2] Extend the lifecycle recovery contract with final context, selected memory IDs, rendering measurements, and core-owned delivery truth for FR-006/FR-010 and SC-002/SC-003/SC-004 in `src/memory-core/contracts.ts` | Verify: TypeScript requires every lifecycle producer/validator to handle the final render result without an ambiguous optional boolean.
- [x] T012 [US2] Integrate the continuation renderer into lifecycle recovery and derive sources/capability from selected output for FR-005/FR-006/FR-007/FR-010 and SC-002/SC-003/SC-004/SC-005 in `src/memory-core/service.ts` | Verify: T010 passes for useful, identity-only, replay, degraded, and post-compaction cases.
- [x] T013 [US2] Replace OpenCode metadata-starvation expectations with failing thin-adapter assertions for verbatim final context, owned-tail replacement, bounds, selected IDs, and truthful identity-only behavior for FR-006/FR-010 and SC-003/SC-004 in `tests/integration/opencode-native-plugin.test.ts` | Verify: the current adapter fails because it re-renders candidates and exposes evidence IDs.
- [x] T014 [US2] Make OpenCode validate and inject the core-owned final continuation block without reselection or truncation for FR-006/FR-010 and SC-003/SC-004 in `src/integration/opencode/plugin.ts` | Verify: T013 passes and repeated system transforms keep exactly one unchanged owned recovery tail.
- [x] T015 [US2] Add failing public Codex/Claude runner fixtures for verbatim final context, native wrapper parity, bound validation, and identity-only fallback for FR-006/FR-010 and SC-003/SC-004 in `tests/integration/public-plugin-runner.test.ts` | Verify: the current public runner fails because it builds a second independent context representation.
- [x] T016 [US2] Make the shared public Codex/Claude runner validate and inject the core-owned continuation without re-rendering for FR-006/FR-010 and SC-003/SC-004 in `plugin/runners/public-runner.mjs` | Verify: T015 passes for both harnesses and semantic context is byte-identical to the lifecycle result inside each native wrapper.

## Story US3

- [x] T017 [US3] Add failing MCP tests for shared briefing selection, compact/context evidence-ID omission, compact/context/get escalation, history provenance, project isolation, stable memory IDs, and exact registry size for FR-005/FR-007/FR-008/FR-009 and SC-005 in `tests/tools/mcp.test.ts` | Verify: the current handlers fail because briefing/compact/context expose evidence IDs before a record is selected.
- [x] T018 [US3] Serialize briefing/compact/context public items with memory IDs only while preserving full provenance in get/history for FR-007/FR-008/FR-009 and SC-005 in `src/tools/index.ts` | Verify: T017 passes through the same six closed tool envelopes with no evidence or lineage leakage before explicit selection.

## Story US4

- [x] T019 [US4] Add failing report-validator cases for actionable recovery fields, useful-content ratio, abstention, project isolation, trust boundary, evidence leakage, host cap, equal final budgets, and external-quality claims for FR-011/FR-012 and SC-006 in `tests/benchmarks/report.test.ts` | Verify: each malformed or incomparable report is rejected with a deterministic field-specific reason.
- [x] T020 [US4] Extend fixture-runner expectations for hidden handoff recovery, poisoned-memory rendering, foreign-project exclusion, injected code points/tokens, selected IDs, and unavailable external lanes for FR-011/FR-012 and SC-003/SC-004/SC-006 in `tests/benchmarks/runner.test.ts` | Verify: the current fixture is red because it lacks the new continuity/security/usefulness measurements.
- [x] T021 [US4] Implement strict continuity, security, budget, provenance, and comparability validation for FR-011/FR-012 and SC-006 in `benchmarks/report.mjs` | Verify: T019 passes while existing metric meanings and fixture-only promotion status remain enforced.
- [x] T022 [US4] Implement the deterministic product-continuity fixture and measured report fields for FR-011/FR-012 and SC-003/SC-004/SC-006 in `benchmarks/run.mjs` | Verify: T020 and benchmark fixture execution pass offline with zero network/model calls and no external-quality claim.

## Parallel execution

- None: `service.ts` owns capture/selection/final lifecycle recovery, contracts and both adapters consume one ordered result, tools change progressive payloads, and the benchmark consumes the completed contract; one ordered writer avoids split-brain behavior and overlapping fixtures/distribution deltas.

## Final verification

- [x] T023 Update durable native lifecycle guidance with capture boundaries, core-owned final rendering, useful recovery truth, trust delimiters, and host parity for FR-002/FR-006/FR-010 and SC-001/SC-002/SC-003/SC-004 in `docs/agent/native-lifecycle.md` | Verify: documentation distinguishes execution, persistence, candidate availability, final delivery, consumption, and identity-only fallback.
- [x] T024 Update durable persistence/retrieval guidance with the two-layer model, handoff-first continuation, deferred evidence lookup, and optional-module gate for FR-001/FR-004/FR-005/FR-007/FR-008/FR-009/FR-012 and SC-005/SC-006 in `docs/agent/persistence-retrieval.md` | Verify: documentation maps one selector to native recovery/context/project briefing and defers evidence UUIDs to get/history without adding a tool.
- [x] T025 Update testing guidance with hidden-action, useful-content, no-fit delivery, poisoning, isolation, progressive provenance, and equal-budget seams for FR-011/FR-012 and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `docs/agent/testing.md` | Verify: every new focused and broad check is routed to a real package script or Vitest file.
- [x] T026 Apply the mandatory behavior-preserving simplification pass to the completed implementation for FR-001/FR-002/FR-003/FR-004/FR-005/FR-006/FR-007/FR-008/FR-009/FR-010/FR-011/FR-012 and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `src` | Verify: duplicate renderer/selector branches, stale comments, and avoidable abstractions are removed without changing passing fixtures.
- [x] T027 Run focused suites, build, full tests, integration verification/smoke, benchmark fixture, prepublish verification, distribution residue review, whitespace review, and diff hygiene for all FRs and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `package.json` | Verify: every declared command passes, exactly six MCP tools remain, generated/dependency/user-state changes are absent, and external lanes remain explicitly unavailable.
- [x] T028 Obtain fresh independent Oracle verification and persist requirement-by-requirement evidence for all FRs and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006/SC-007/SC-008 in `openspec/changes/memory-operating-model/verify-report.md` | Verify: Oracle returns PASS with no unresolved buildable blocker and labels real-host/Claude/optional-module outcome evidence separately.
- [x] T029 Close the validated Full change, merge the declared durable deltas, and archive research/design/verification evidence for all FRs and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006/SC-007/SC-008 in `openspec/changes/memory-operating-model/archive-report.md` | Verify: the Full closeout gate is valid, destructive-delta warning is honored if applicable, and the archive report is READY.

## Convergence after Oracle verification round 1

- [x] T030 Add a red automatic-capture credential fixture, then deterministically redact recognizable credential forms before persistence for FR-002 and SC-001 in `src/memory-core/service.ts` | Verify: the focused lifecycle suite proves the secret is absent from persisted evidence/memory payloads while non-secret prompt content remains usable.
- [x] T031 Add a red pathological-title fixture, then omit candidates whose complete metadata starves abundant useful content below 50% for FR-006 and SC-004 in `src/memory-core/continuation.ts` | Verify: every delivered abundant-content fixture stays within 1,000 Unicode code points with a useful-content ratio of at least 0.5, while an impossible candidate produces truthful identity-only recovery.
- [x] T032 Add a red embedded-provenance fixture, then remove exact supporting evidence IDs before core rendering so delivery truth cannot diverge for FR-006/FR-007/FR-010 and SC-003 in `src/memory-core/continuation.ts` | Verify: recovery remains useful without the evidence UUID and the same selected memory IDs reach all thin host adapters.
- [x] T033 Reapply the mandatory simplification pass and broad repository verification after the first convergence for all FRs and SC-001/SC-002/SC-003/SC-004/SC-005/SC-006 in `package.json` | Verify: focused/full/integration/benchmark/prepublish checks pass and no generated, dependency, or user-state changes enter the diff.

## Convergence after Oracle verification round 2

- [x] T034 Sanitize recognizable credentials through one shared policy before OpenCode and Codex adapter idempotency keys are derived for FR-002 and SC-001 in `src/memory-core/privacy.ts` | Verify: adapter fixtures prove payloads differing only by credential value produce the same key and one authoritative state change without persisting either raw value.
- [x] T035 Restore validator-compliant convergence traceability without changing prior task IDs or outcomes for all affected FRs and buildable SCs in `openspec/changes/memory-operating-model/tasks.md` | Verify: the Full ready validator reports valid after every executable line has one literal repository-relative path and sequential identifiers.
