# Tasks: Stabilize Steered Prompt Capture and Compaction Recovery

## MVP scope

US1 is the first independently testable story: Codex accepts two different prompts under one `turn_id`, Claude accepts official-shaped prompt payloads without `event_id`, OpenCode preserves distinct message IDs, and exact retries remain idempotent without a hook error.

## Dependencies

`T001 -> T002`; `T002 -> T003`; `T003 -> T004`; `T004 -> T005`; `T005 -> T006`; `T006 -> T007`; `T007 -> T008`; `T008 -> T009`; `T009 -> T010`; `T010 -> T011`; `T011 -> T012`; `T012 -> T013`; `T013 -> T014`; `T014 -> T015`; `T015 -> T016`.

## Story US1

- [x] T001 [US1] Add one red lifecycle tracer proving two distinct Codex steers under one turn append two root events while an exact retry appends zero for FR-001, SC-001, and SC-002 in `tests/integration/lifecycle.test.ts` | Verify: the second distinct prompt currently throws the lifecycle event-key payload mismatch.
- [x] T002 [US1] Implement the minimal sanitized prompt-aware Codex event key while preserving exact retry equality for FR-001, SC-001, and SC-002 in `src/integration/adapters/index.ts` | Verify: T001 turns green without changing Claude or OpenCode behavior.
- [x] T003 [US1] Add one red public-runner tracer proving an official-shaped Claude prompt reaches lifecycle without event_id for FR-002 and SC-001 in `tests/integration/public-plugin-runner.test.ts` | Verify: the runner currently exits nonzero because native normalization rejects the missing synthetic field.
- [x] T004 [US1] Implement the minimal sanitized deterministic Claude prompt key using only documented native fields for FR-002 and SC-001 in `src/integration/adapters/index.ts` | Verify: T003 turns green while an exact Claude retry retains one key.
- [x] T005 [US1] Add adapter contract regressions for Codex and Claude key equality/difference plus pre-hash sanitation for FR-001, FR-002, and SC-001 in `tests/integration/adapters.test.ts` | Verify: distinct sanitized prompts differ, exact sanitized retries match, and private or credential text never appears in an event key.
- [x] T006 [US1] Add OpenCode native-plugin characterization for two root-user messages with distinct immutable message IDs in one active session for FR-002 and SC-001 in `tests/integration/opencode-native-plugin.test.ts` | Verify: both dispatches carry distinct message-derived event keys and the existing plugin path needs no behavioral rewrite.

## Story US2

- [x] T007 [US2] Add one red lifecycle slice across all three harness values proving summary-less compact recovery excludes unrelated project handoffs and foreign summaries for FR-003, SC-003, and SC-004 in `tests/integration/lifecycle.test.ts` | Verify: current source selects at least one unrelated project memory and fails the empty-selection assertions.
- [x] T008 [US2] Add the minimal internal summary-only context policy and route only guide_post_compact through it with accurate selection and budget truth for FR-003, SC-003, and SC-004 in `src/memory-core/service.ts` | Verify: T007 turns green with one exact-session summary or zero records plus identity-only recovery and contextDelivered=false.

## Story US3

- [x] T009 [US3] Add regression coverage proving ordinary recover still selects project memory after compact recovery abstains for FR-004 and SC-005 in `tests/integration/lifecycle.test.ts` | Verify: the same handoff excluded from guide_post_compact remains selected by recover.
- [x] T010 [US3] Update the native lifecycle routing note with documented per-harness submission identity and compaction-only abstention for FR-001 through FR-004 and SC-005 in `docs/agent/native-lifecycle.md` | Verify: documentation distinguishes OpenCode message IDs, Codex/Claude fingerprints, exact-retry deduplication, and ordinary project recovery.
- [x] T011 [US3] Update retrieval guidance to state that post-compaction recovery is session-summary-only while explicit context remains project-wide for FR-003, FR-004, and SC-005 in `docs/agent/persistence-retrieval.md` | Verify: documentation contains no claim that generic project handoffs are eligible after compaction.
- [x] T012 Simplify the content-aware native key implementation without changing behavior or privacy order for FR-001 and FR-002 in `src/integration/adapters/index.ts` | Verify: focused adapter and lifecycle tests remain green after simplification.
- [x] T013 Simplify the summary-only recovery selection without changing ordinary context or budget truth for FR-003 and FR-004 in `src/memory-core/service.ts` | Verify: focused lifecycle, context, continuation, and MCP tests remain green after simplification.

## Parallel execution

- None: the two production changes are coupled by lifecycle event semantics, every test lane touches shared integration fixtures, and the target source/tests already contain overlapping uncommitted canonical-project-identity work; one ordered writer minimizes merge risk.

## Final verification

- [x] T014 Run the nearest adapter, OpenCode plugin, public runner, lifecycle, context, continuation, and MCP Vitest files for SC-001 through SC-005 in `package.json` | Verify: every focused file passes under the repository's declared Vitest configurations.
- [x] T015 Run build, full tests, integration verification/smoke, fixture benchmark, prepublish, and whitespace validation for SC-005, converging the stale post-compaction expectation to confirmed identity-only abstention in `benchmarks/run.mjs` | Verify: every required non-networked repository check passes after convergence: build, 343/343 full tests, integration verification/smoke, fixture benchmark, prepublish, and git diff --check.
- [x] T016 Record fresh independent Oracle verification with complete FR/buildable-SC evidence and no unresolved blocker for FR-001 through FR-004 and SC-001 through SC-005 in `openspec/changes/stabilize-steered-prompts-and-compaction-recovery/verify-report.md` | Verify: a fresh read-only Oracle returned PASS and the report maps every requirement and criterion to observed evidence.
