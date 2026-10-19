# Tasks: Establish Observation Promotion Pipeline

## MVP scope

US1 is the first independently testable slice: a verified caller can submit one bounded source-supported candidate, receive stable IDs, rebuild the same pending record, and observe zero memory/FTS effects. Completion evidence is the focused contract/schema/observation suite passing before review or promotion behavior is added.

## Dependencies

T001 -> T003; T002 -> T004 -> T005; T003 + T005 -> T006 -> T007 -> T008; T008 -> T009 -> T010 -> T011; T011 -> T012 -> T013 -> T014; T014 -> T015 -> T016; T013 -> T017 -> T018 -> T019 -> T020; T014 -> T021 -> T022 -> T023 -> T024 -> T025; implementation tasks -> T026-T029 -> T030-T033.

## Shared foundations

- [x] T001 Add failing closed-taxonomy, bounded-contract, typed support-evidence, and discriminated-operation tests covering FR-004/FR-010/SC-001 in `tests/memory-core/contracts.test.ts` | Verify: exact validation/attestation shapes parse; arbitrary metadata, wrong kind/discriminator, simultaneous memory, unknown values, oversized values, ambiguous branches, and partial identity are rejected with zero accepted parses.
- [x] T002 Add failing revision-5 upgrade, backup, rollback, no-backfill, prior-row/FTS-preservation, and rebuild-safety tests covering FR-006/SC-004 in `tests/memory-core/schema-migration.test.ts` | Verify: the pre-change implementation fails only the new migration assertions and preserves the fixture source.
- [x] T003 Define observation, scope, state, verdict, basis, typed validation/attestation metadata, support, generator, limit, input, result, and record contracts covering FR-004/FR-010/FR-011/SC-001 in `src/memory-core/contracts.ts` | Verify: T001 passes, arbitrary public metadata remains impossible, and every public/service taxonomy shares one canonical value set.
- [x] T004 Define candidate/facet/support/review/promotion/receipt structures, indexes, checks, immutability, scope, and transition triggers covering FR-001/FR-004/FR-006/FR-008/FR-017/SC-004 in `src/memory-core/sqlite/schema.ts` | Verify: clean databases create valid empty observation state with no observation-driven memory FTS trigger.
- [x] T005 Implement verified forward revision-5 migration with zero observation backfill and prior ledger/FTS preservation covering FR-006/SC-004 in `src/memory-core/sqlite/migrations.ts` | Verify: T002 passes for backup, success, injected failure, reopen, FK integrity, counts, and FTS equality.

## Story US1 - Preserve a source-supported observation candidate

- [x] T006 [US1] Add failing candidate submission, support/scope/coverage, privacy/facet, idempotency, non-branching predecessor, canonical-evidence, and rebuild tests covering FR-001/FR-002/FR-005/FR-007/FR-008/SC-001 in `tests/memory-core/observations.test.ts` | Verify: valid fixtures describe one pending candidate; cycles, second successors, and every other invalid fixture assert zero side effects.
- [x] T007 [US1] Implement canonical candidate parsing, sanitation, stable IDs, support validation, bounded facets, pending mapping, listing primitives, and rebuild covering FR-001/FR-002/FR-004/FR-005/FR-008/SC-001 in `src/memory-core/observations.ts` | Verify: candidate and rebuild portions of T006 pass with identical records and no memory rows.
- [x] T008 [US1] Integrate atomic candidate submission, typed direct support-evidence validation, and dedicated replay receipts into the shared service covering FR-005/FR-007/FR-011/SC-001 in `src/memory-core/service.ts` | Verify: structured support requires existing same-project candidate/session/event identity and no memory; valid support stores exact metadata while invalid/replayed-drift input has zero side effects; metadata-free direct save remains unchanged.

## Story US2 - Review and explicitly promote a candidate

- [x] T009 [US2] Add failing public-producer, terminal-review, root-authority, exact basis-by-kind support matrix, rejection, exact-promotion, lineage, topic-supersession, correction, replay, and rollback tests covering FR-002/FR-003/FR-004/FR-005/FR-007/FR-008/SC-002 in `tests/memory-core/observation-promotion.test.ts` | Verify: both support forms are created through service input rather than SQL seeding; missing/cross-project candidate, wrong evidence kind/project/session/actor/authority/metadata/observation/verdict/result/time, same-session independent review, partial/degraded/import identity, pending/rejected/unsupported/content-drift, and duplicate-verdict cases commit zero promoted memories; accepted promotion expects exactly one.
- [x] T010 [US2] Implement immutable terminal review, basis-support validation, derived state, predecessor correction, and deterministic review rebuild covering FR-001/FR-002/FR-004/FR-005/FR-008/SC-002 in `src/memory-core/observations.ts` | Verify: review/rejection/correction portions of T009 pass and no verdict can be overwritten.
- [x] T011 [US2] Implement atomic accepted-candidate promotion using exact proposed memory content, original supports, review/promotion evidence, receipts, topic transitions, and existing memory FTS covering FR-003/FR-007/FR-011/SC-002 in `src/memory-core/service.ts` | Verify: promotion portions of T009 pass with one mapping/memory/FTS row and complete rollback on every injected failure.

## Story US3 - Inspect candidates without contaminating recall

- [x] T012 [US3] Add failing six-tool schema/handler tests for typed support evidence, candidate submit/review/promote, bounded observation queue, observation get, errors, and unchanged workflows covering FR-009/FR-010/FR-011/FR-012/FR-013/FR-014/SC-003 in `tests/tools/mcp.test.ts` | Verify: exact names remain six; both structured supports are creatable; arbitrary metadata/wrong pairs/memory combinations fail; all unions are strict; temporal omission means current leaves; current/history are disjoint; total order tie-breaks by ID; outputs are bounded; and raw support contents never appear.
- [x] T013 [US3] Implement strict tool unions including direct typed support-evidence variants, observation public mappings, project action, and source/telemetry envelopes covering FR-009/FR-010/FR-011/FR-012/FR-013/FR-014/SC-003 in `src/tools/index.ts` | Verify: T012 passes, exact support metadata reaches the service, and existing metadata-free direct/save/summary callers retain their current accepted shape.
- [x] T014 [US3] Implement discriminated observation get/history and bounded project/session/state queue with the specified leaf/history partition and state/time/ID order while leaving recall/context selection unchanged covering FR-012/FR-013/FR-017/SC-003 in `src/memory-core/service.ts` | Verify: selected non-branching lineage expands by ID, filters precede caps, ordering is total, and no queue candidate enters context or briefing.
- [x] T015 [US3] Add memory-FTS equality, recall-order, payload-cap, advisory-lookup-failure, and zero-observation-contamination tests covering FR-017/SC-003 in `tests/memory-core/retrieval.test.ts` | Verify: control and observation-populated databases return identical promoted-memory ranks/context while review lookup failure leaves state unchanged.
- [x] T016 [US3] Add three-host automatic-capture/degraded/delegated/privacy fixtures proving no inferred candidate, review, or promotion covering FR-014/FR-015/SC-003 in `tests/integration/lifecycle.test.ts` | Verify: prompts/checkpoints/summaries/private/tool/delegated events preserve current capture behavior and create zero observation operations.
- [x] T017 [US3] Add failing packaged-skill and inventory assertions for atomic supported candidates, root review policy, explicit promotion, untrusted retrieval, and preserved direct authorization covering FR-016/SC-003 in `tests/packaging/first-product.test.ts` | Verify: all three canonical/packed skill variants must expose identical observation guidance without adding a tool.
- [x] T018 [US3] Update Codex root-memory practice for candidate submission, review, promotion, and direct-save boundaries covering FR-016/SC-003 in `integrations/codex/skills/thoth-mem/SKILL.md` | Verify: packaging assertions find the canonical policy language and no lifecycle auto-capture instruction.
- [x] T019 [US3] Update OpenCode root-memory practice with the same host-neutral policy covering FR-016/SC-003 in `integrations/opencode/skills/thoth-mem/SKILL.md` | Verify: content matches the canonical semantic rules while retaining OpenCode identity guidance.
- [x] T020 [US3] Update Claude Code root-memory practice with the same host-neutral policy covering FR-016/SC-003 in `integrations/claude-code/skills/thoth-mem/SKILL.md` | Verify: content matches the canonical semantic rules while retaining Claude identity guidance and T017 passes.

## Story US4 - Upgrade and rebuild without inventing observations

- [x] T021 [US4] Add direct-SQL immutability/scope/state tests and rebuild tamper/impossible-state fixtures covering FR-001/FR-004/FR-008/SC-004 in `tests/memory-core/observation-schema.test.ts` | Verify: SQL bypasses and malformed canonical evidence fail, while valid projection deletion/rebuild restores every candidate/review/mapping.
- [x] T022 [US4] Harden observation scope/transition triggers and rebuild replacement checks from T021 covering FR-001/FR-004/FR-008/SC-004 in `src/memory-core/sqlite/schema.ts` | Verify: T021 passes with unchanged prior-schema and memory FTS integrity.

## Story US5 - Demonstrate useful promotion under an equal budget

- [x] T023 [US5] Add failing offline control/candidate report tests for fidelity, harmful writes, final-memory equality, recall budgets/order, latency, footprint, provenance, and literal call counts covering FR-018 in `tests/benchmarks/observation-pipeline.test.ts` | Verify: missing, contaminated, unequal, unsupported, regressing, over-2x, or schema-invalid evidence fails closed.
- [x] T024 [US5] Implement isolated direct-control and observation-review-promotion fixture execution with identical final corpora and recall inputs covering FR-018 in `benchmarks/observation-pipeline/run.mjs` | Verify: deterministic runs emit reconciled per-operation/source/rank/resource evidence with zero model/network calls.
- [x] T025 [US5] Define the strict immutable observation outcome report contract and fail-closed thresholds covering FR-018 in `benchmarks/observation-pipeline/report.schema.json` | Verify: every required identity, lineage, quality, latency, footprint, payload, error, and call field is structurally validated.
- [x] T026 [US5] Implement report reconciliation and decision validation without changing a failed gate covering FR-018 in `benchmarks/observation-pipeline/report.mjs` | Verify: T023 passes for complete PASS and every declared failure reason.
- [x] T027 [US5] Integrate the observation lane into the existing offline committed fixture while preserving unrelated lexical reports covering FR-018 in `benchmarks/run.mjs` | Verify: the normal benchmark command emits both existing evidence and the observation outcome without network/model access or overwrite of immutable reports.

## Documentation and quality convergence

- [x] T028 Document candidate authority, review/promotion lineage, FTS exclusion, rebuild, and migration boundaries covering FR-001/FR-002/FR-003/FR-006/FR-008/FR-017 in `docs/agent/persistence-retrieval.md` | Verify: routed guidance distinguishes evidence, observation, summary, promoted memory, and the later physical-governance stage.
- [x] T029 Document the four strict mem_save branches, observation project/get workflows, and unchanged six-tool inventory covering FR-009/FR-010/FR-011/FR-012/FR-013/FR-014 in `docs/agent/surfaces.md` | Verify: examples and tool descriptions match runtime schemas and contain no seventh tool or deprecated alias.
- [x] T030 Update focused/broad verification commands and observation fixture contracts while preserving dirty lexical evidence covering FR-018 in `docs/agent/testing.md` | Verify: every named command exists in the current manifest and no nonexistent lint/network lane is claimed.
- [x] T031 Apply the mandatory simplify pass to newly changed runtime code without changing behavior covering FR-001/FR-007/FR-017 in `src/memory-core/observations.ts` | Verify: focused observation/tool/retrieval tests remain green and diff review shows no unrelated refactor.

## Parallel execution

- None: Schema, migration, observation transactions, service/tool unions, canonical skills, and the committed fixture share one authority contract and overlap a dirty worktree; one ordered writer is safer than parallel mutable surfaces.

## Final verification

- [x] T032 Run focused contract, migration, observation, promotion, tool, retrieval, lifecycle, packaging, and report tests covering FR-001-FR-018/SC-001/SC-002/SC-003/SC-004 in `tests/memory-core/observations.test.ts` | Verify: every focused Vitest command terminates with zero failures and reports the exact executed test counts.
- [x] T033 Run build, full unit/integration verification, packed smoke, observation benchmark fixture, prepublish, diff/status/secret review, then obtain fresh Oracle verification while enforcing SC-005 covering FR-001-FR-018 in `package.json` | Verify: every required check and SC-005 records PASS before Oracle closeout verification; any failure or residual risk is recorded but leaves T033 unchecked and the change active. Oracle must return PASS before closeout.

## Convergence round 1

- [x] T034 Remediate CI-001 partial FR-010/SC-002 by sanitizing, normalizing, trimming, bounding, hashing, and persisting both structured observation support metadata forms canonically without exposing private-tag content in contracts and `src/memory-core/service.ts` | Verify: service and MCP probes reject or redact private-only metadata with zero secret persistence while valid exact receipts still support review.
- [x] T035 Remediate CI-002 contradiction of FR-005/FR-010/SC-002 by binding promotion receipt replay to the original verified session identity and non-degraded state in `src/memory-core/service.ts` | Verify: same-session replay remains idempotent; cross-session, degraded, partial, and import replay commit nothing and return no contradictory identity.
- [x] T036 Remediate CI-003 partial FR-018/SC-005 by extending the observation fixture/report/schema with attributable submit/review/promotion latency and footprint plus poisoned, negated, cross-scope, failed, changing-requirement, stale-procedure, correction, and topic-supersession scenarios in `benchmarks/observation-pipeline/report.mjs` | Verify: report reconciliation fails each omitted/forged field or scenario, the real fixture records all scenarios and zero harmful promotions, and equality/2x/zero-call gates remain observed PASS.

## Convergence round 2

- [x] T037 Remediate CI-003-R2 for FR-018/SC-005 by binding attributable writes and every scenario to canonical payload representations, operation outputs, policy/support relationships, SQLite/FTS row manifests, and before/after projection counts in `benchmarks/observation-pipeline/report.mjs` | Verify: falsifying any linked ID, payload size/hash, policy/support relationship, row count, promotion mapping, or FTS membership invalidates the report or produces FAIL; the real offline fixture remains PASS.

## Convergence round 3

- [x] T038 Remediate CI-004-R3 for FR-018/SC-005 by giving every promoted scenario an exact operation window, exact row delta, exact support union, and complete predecessor/current review-promotion-memory lineage in `benchmarks/observation-pipeline/report.mjs` | Verify: all six Oracle round-3 mutations are rejected and the real offline fixture remains PASS with exact changing-requirement, correction, and topic-supersession reconciliation.

## Convergence round 4

- [x] T039 Remediate CI-005/CI-006/CI-007-R4 for FR-018/SC-005 by deriving final memory/topic lineage from canonical audited memory rows, closing original-support/operation provenance exactly, and binding each scenario to an immutable hashed trace entry with fixed semantic event identity in `benchmarks/observation-pipeline/report.mjs` | Verify: all six Oracle round-4 coherent mutations are rejected, trace hashes and receipts reconcile, and the real offline fixture remains PASS.

## Convergence round 5

- [x] T040 Remediate CI-008-R5 for FR-018/SC-005 by attaching canonical payload JSON to every successful scenario receipt, recomputing its receipt hash, and deriving candidate/review/promotion targets from canonical evidence and audited projection relationships in `benchmarks/observation-pipeline/report.mjs` | Verify: swapping rejected-scenario bundles, receipt targets, and trace hashes without changing canonical payload evidence is rejected; the real fixture remains PASS.

## Convergence round 6

- [x] T041 Remediate CI-009/CI-010/CI-011-R6 for FR-018/SC-005 by binding each receipt event to its deterministic project-scoped evidence identity and reconciling complete save/review canonical envelopes against audited evidence and review projections in `benchmarks/observation-pipeline/report.mjs` | Verify: complete receipt-bundle swaps, rewritten save envelopes, and canonical review verdict/basis/reason contradictions are rejected while the real offline fixture remains PASS.

## Convergence round 7

- [x] T042 Remediate CI-012/CI-013-R7 for FR-018/SC-005 by auditing and reconciling the complete closed candidate projection and requiring an exact promotion operation envelope bound to canonical promotion evidence in `benchmarks/observation-pipeline/report.mjs` | Verify: selective candidate claim changes and promotion-envelope extensions are rejected while every prior adversarial probe and the real offline fixture remain PASS.

## Convergence round 8

- [x] T043 Remediate CI-014/CI-015-R8 for FR-018/SC-005 by reconciling structured review-support metadata with the linked verdict and binding adverse scenario candidates to a code-owned immutable semantic manifest in `benchmarks/observation-pipeline/report.mjs` | Verify: accepted reviews backed by failed validation and coherent receipt/evidence/audit replacement of fixed adverse assertions are rejected while prior probes and the real fixture remain PASS.

## Convergence round 9

- [x] T044 Remediate CI-016/CI-017-R9 for FR-018/SC-005 by committing exact fixture support-event relationships and support evidence semantics, then deriving observation/review identities from their canonical evidence in `benchmarks/observation-pipeline/report.mjs` | Verify: validation method/content redefinition and coherent candidate/review support substitution are rejected while all earlier probes and the real fixture remain PASS.
