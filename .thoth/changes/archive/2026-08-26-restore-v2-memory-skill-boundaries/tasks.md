# Tasks: Restore V2 memory Skill semantic boundaries

## Authoring contract

Task identifiers are sequential across the file. Each executable task names one repository-relative ownership path, maps requirements and buildable success criteria, and ends with observable verification evidence.

## MVP scope

US2 is the MVP: a shipped root-agent Skill must make a pre-final semantic-boundary decision and persist one concise, confirmed V2 handoff when future sessions benefit. The MVP is complete when the current terse Skill fails the focused contract test and the restored canonical Skill makes that same test pass without introducing V1 vocabulary.

## Dependencies

`T001 -> T002 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008`; the instruction body, simplification, synchronization direction, generated copies, and verification evidence are one coupled chain.

## Story US2

- [x] T001 [US2] Add the RED public-seam test for the progressive recall funnel, semantic-boundary trigger, durable/noise distinction, identity pairing, privacy exclusions, confirmed persistence, final-response disclosure, and V2-only vocabulary with FR-002/FR-003/FR-005/FR-006/FR-007 and SC-001/SC-002 coverage in `tests/integration/package-v2.test.ts` | Verify: `pnpm exec vitest run tests/integration/package-v2.test.ts --config vitest.integration.config.ts` failed 1/3 because the six-line Skill exposed only `mem_recall` and `mem_get`
- [x] T002 [US2] Replace the terse canonical public Skill with the smallest V2 recipe that classifies intent, recalls progressively, preserves root ownership, saves one concise durable handoff through mem_save with nested handoff evidence and memory kinds, and reports only confirmed results with FR-001/FR-002/FR-003/FR-005/FR-006/FR-007 and SC-002 coverage in `plugin/skills/thoth-mem/SKILL.md` | Verify: focused package test passes 3/3 with the six-tool recipe and retired vocabulary exclusions

## Story US3

- [x] T003 [US3] Add the RED distribution test requiring all four shipped Skill bodies to be byte-identical while retaining each declared host reference with FR-004/FR-005 and SC-003 coverage in `tests/packaging/public-plugin-distribution.test.ts` | Verify: focused distribution test failed 1/5 because the OpenCode destination still contained its pre-V2 placeholder body
- [x] T004 [US3] Extend integration synchronization to copy the canonical Skill body into the OpenCode, Codex, and Claude integration roots, retain the native OpenCode reference, and preserve the existing Codex/Claude public-reference flow with FR-004 and SC-003 coverage in `scripts/sync-plugin-distribution.mjs` | Verify: one `pnpm run integration:sync` made the focused distribution test pass 5/5 without creating a public OpenCode reference

## Story US1

- [x] T005 [US1] Apply a behavior-preserving simplification pass to the restored recipe before generating distributed copies, removing redundant prose while retaining every tested boundary with FR-001/FR-002/FR-003/FR-006/FR-007 and SC-002 coverage in `plugin/skills/thoth-mem/SKILL.md` | Verify: focused Skill tests pass 3/3 and bundled `quick_validate.py` reports `Skill is valid!`
- [x] T006 [US3] Regenerate the three declared integration Skill destinations and public distribution integrity metadata from the simplified canonical body with FR-004/FR-005 and SC-003 coverage in `integrations` | Verify: all four Skill bodies are byte-identical, focused distribution tests pass 5/5, and a second sync left the tracked diff byte-identical

## Parallel execution

- None: every task touches or derives from the same canonical Skill contract, so parallel writers would create wording and synchronization races.

## Final verification

- [x] T007 Run focused tests, build, full tests, integration inventory, packed smoke, synchronization idempotency, and diff hygiene with FR-001/FR-003/FR-004/FR-005/FR-006 and SC-003/SC-004 coverage in `package.json` | Verify: focused tests pass 17/17; `prepublishOnly` passes 30 files/129 tests; inventory and packed smoke pass all three hosts; packed MCP asserts six tools; converged sync changes neither diff nor generated-asset mtimes; `git diff --check` exits zero
- [x] T008 Record a fresh independent Oracle judgment over every FR and buildable SC, preserving SC-005 as PASS only with observed real-host evidence or as explicit residual RISK otherwise, with FR-001/FR-002/FR-003/FR-004/FR-005/FR-006/FR-007 and SC-001/SC-002/SC-003/SC-004 coverage in `openspec/changes/restore-v2-memory-skill-boundaries/verify-report.md` | Verify: fresh Oracle returned PASS across completeness/correctness/coherence with no critical or major finding and recorded `RISK-SC-005`
