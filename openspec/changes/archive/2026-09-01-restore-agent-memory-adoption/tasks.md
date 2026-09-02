# Tasks: Restore agent memory adoption

## MVP scope

US1 is the first independently testable slice: a real SDK client observes balanced server instructions and six distinct workflow descriptions while existing save/recall calls remain unchanged.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010 -> T011 -> T012 -> T013`; the Skill/package slice consumes the confirmed MCP discovery vocabulary so model-facing wording stays coherent.

## Story US1

- [x] T001 [US1] Add a failing SDK-client discovery contract covering FR-001, FR-003, FR-006 and SC-001 in `tests/integration.test.ts` | Verify: focused Vitest fails because server instructions are recall-only and all six descriptions are generic.
- [x] T002 [US1] Publish concise balanced recall/save/handoff server instructions for FR-001 and FR-003 with SC-001 coverage in `src/server.ts` | Verify: client.getInstructions exposes both progressive recall and deliberate durable persistence while the focused test still identifies generic tool descriptions.
- [x] T003 [US1] Register six distinct typed workflow descriptions for FR-001 and FR-003 with SC-001 coverage in `src/tools/index.ts` | Verify: focused SDK-client test passes with exact names, six distinct descriptions, unchanged schemas, and successful real save/recall calls.

## Story US2

- [x] T004 [US2] Add failing installed-Skill and conditional-reference contract assertions for FR-002, FR-004, FR-005, FR-006, SC-002, and SC-003 in `tests/packaging/first-product.test.ts` | Verify: focused test fails on the late trigger, oversized common path, missing conditional reference, and incomplete inventory.
- [x] T005 [US2] Rewrite the canonical entrypoint with early recall/save/handoff discovery and the concise ordinary cadence for FR-002 and SC-002 in `plugin/skills/thoth-mem/SKILL.md` | Verify: canonical Skill assertions pass for positive and negative boundaries and its character count is below 7244.
- [x] T006 [US2] Preserve the complete uncertain-claim candidate/review/promotion policy behind conditional routing for FR-004 and SC-003 in `plugin/skills/thoth-mem/references/observation-review.md` | Verify: the reference contains every authority, support, identity, correction, trust, and promotion invariant asserted by the focused test.

## Story US3

- [x] T007 [US3] Synchronize the canonical Skill and shared observation-review reference to all host roots for FR-005, FR-006, SC-002, and SC-003 in `scripts/sync-plugin-distribution.mjs` | Verify: integration:sync converges all bodies/references and an immediate second run changes no content.
- [x] T008 [US3] Add the shared conditional reference to canonical host package ownership for FR-005 and SC-003 in `src/integration/package-inventory.ts` | Verify: TypeScript inventory validation expects the reference exactly once for each host.
- [x] T009 [US3] Declare the shared conditional reference in integration and public distribution assets for FR-005 and SC-003 in `integrations/inventory.json` | Verify: integration inventory equals the canonical TypeScript inventory and every declared asset exists.
- [x] T010 [US3] Regenerate the canonical distribution hashes after synchronized reference delivery for FR-005 and SC-003 in `plugin/distribution-lock.json` | Verify: integration:sync and integration:verify report no stale or missing public asset hash.
- [x] T011 [US3] Extend public distribution assertions for reference ownership, byte equality, and packed reachability covering FR-005, FR-006, SC-002, and SC-003 in `tests/packaging/public-plugin-distribution.test.ts` | Verify: focused package tests pass and host-specific identity reference ownership remains unchanged.

Outcome SC-005 remains a later authorized real-host verification target; no implementation task fabricates model-consumption evidence.

## Parallel execution

- None: MCP vocabulary, Skill wording, conditional-reference routing, canonical inventories, generated locks, and their tests are one coupled discovery contract with ordered RED/GREEN dependencies and overlapping package outputs, so root remains the single writer.

## Final verification

- [x] T012 Run the focused MCP, packaging, and distribution suites plus build for FR-001 through FR-006 and SC-001 through SC-003 in `package.json` | Verify: every focused command exits 0 and the intended RED/GREEN evidence is recorded.
- [x] T013 Simplify the changed implementation and then run full tests, integration verification/smoke, benchmark fixture, prepublish, and diff hygiene for FR-001 through FR-006 and SC-004 in `plugin/skills/thoth-mem/SKILL.md` | Verify: behavior is unchanged by simplification, every required command exits 0, tool count remains six, no schema/dependency/host-home change appears, and SC-005 is reported as residual RISK.
