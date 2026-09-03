# Verification Report: Agent Memory Timeline

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — FR-001 through FR-007 and SC-001 through SC-005 are implemented and evidenced, including preservation of the prior durable contracts replaced by FR-001, FR-002, FR-005, and FR-006.
- **Correctness**: PASS — ordering, isolation, bounds, cursor, budgeting, disclosure, validation, and distribution behavior match the accepted contract.
- **Coherence**: PASS — the corrected specification, freshly approved plan review, tasks, code, tests, documentation, Skills, and expected canonical archive rendering agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/tools/index.ts` keeps `ALL_TOOLS` at six, retains every existing project action, and adds only timeline; the corrected US4 also preserves all four prior observation-inspection scenarios exactly. | Independent four-file focused suite; full, integration, packed-smoke, and Git-HEAD 4/4 scenario comparison. | PASS |
| FR-002 | `src/memory-core/service.ts` normalizes UTC instants, applies inclusive bounds, orders `julianday(valid_from) DESC, id ASC`, and leaves all four memory statuses eligible; corrected US5 preserves both prior recovery scenarios. | Core timeline suite plus Git-HEAD 2/2 scenario comparison. | PASS |
| FR-003 | `src/memory-core/contracts.ts` defines the closed compact item; `src/memory-core/service.ts` Unicode-clips title, topic, and snippet; full expansion remains `mem_get`. | `tests/tools/mcp.test.ts`. | PASS |
| FR-004 | Exact project IDs scope SQL; cursor version/shape/project/bounds are validated; the MCP schema rejects unsupported and timeline-only fields on other actions. | Core timeline and MCP boundary tests. | PASS |
| FR-005 | `plugin/skills/thoth-mem/SKILL.md` distinguishes lexical recall from chronology and routes selected timeline IDs to `mem_get` while preserving identity, privacy, save, and handoff guidance; corrected US6 preserves all five prior semantic-boundary scenarios. | Packaging/integration tests, independent inspection, and Git-HEAD 5/5 scenario comparison. | PASS |
| FR-006 | The canonical Skill and OpenCode, Codex, and Claude Code copies are byte-identical; the distribution lock contains the synchronized asset hash; corrected US7 preserves the prior disposable packed-smoke scenario. | SHA-256 parity, `integration:verify`, packed smoke, and Git-HEAD 1/1 scenario comparison. | PASS |
| FR-007 | The implementation is an additive service method/action with no schema migration, projection, FTS, recall, context, observation, summary, or capture behavior change; the corrected durable replacements also retain those existing contracts. | Build, 430-test full suite, prepublish, integration, benchmark, and archive-parser inspection. | PASS |
| SC-001 `[buildable]` | Fixtures cover current, superseded, retracted, historical, equal timestamps, backdating, and a foreign project. | `tests/memory-core/timeline.test.ts`; independent run. | PASS |
| SC-002 `[buildable]` | Limit and character-budget traversal continues from the last emitted key, progresses under the minimum budget, excludes out-of-range rows, and avoids duplicates. | `tests/memory-core/timeline.test.ts`; independent run. | PASS |
| SC-003 `[buildable]` | MCP assertions exclude evidence IDs, raw support, claims, summaries, observations, and session events; selected IDs expand only with `mem_get`. | `tests/tools/mcp.test.ts`; independent run. | PASS |
| SC-004 `[buildable]` | Canonical and host Skills teach timeline to selective `mem_get`, bounded cursor use, and historical trust boundaries. | `tests/packaging/first-product.test.ts`, `tests/integration/package.test.ts`, Skill validator, and SHA parity. | PASS |
| SC-005 `[buildable]` | Six-tool assertions remain active and every required build, test, packaging, validator, and hygiene gate passed. | Full verification matrix and SDD ready validator. | PASS |

## Commands and results

- `pnpm exec vitest run tests/memory-core/timeline.test.ts tests/tools/mcp.test.ts --config vitest.unit.config.ts`: 2 files, 17 tests passed.
- `pnpm exec vitest run tests/packaging/first-product.test.ts tests/integration/package.test.ts --config vitest.integration.config.ts`: 2 files, 12 tests passed.
- Fresh final Oracle focused run over all four files: 4 files, 29 tests passed.
- Fresh final Oracle `pnpm run build`: passed.
- Skill `quick_validate.py` with UTF-8 mode: passed.
- `pnpm run build`: passed.
- `pnpm test`: 52 files, 430 tests passed.
- `pnpm run integration:verify`: passed for local and public OpenCode, Codex, and Claude Code inventories.
- `pnpm run integration:smoke`: packed smoke and lifecycle fixtures passed for all three hosts.
- `pnpm run benchmark:fixture`: passed; only nondeterministic generated report drift was discarded.
- `pnpm run prepublishOnly`: passed, including another 52-file, 430-test full run.
- `git diff --check`: passed.
- SDD validator through `ready`: valid with no errors or warnings.
- Canonical and all three host Skills: 5,736 bytes and SHA-256 `AC1F0EC1ACED2BED19CF2680D964002B687DA716B7C78EFE3E0621662CFC4B0D`.

## Durable delta preservation

- FR-001 receives US1's three timeline scenarios plus US4's four exact prior observation scenarios.
- FR-002 receives US1 and US2's six timeline scenarios plus US5's two exact prior recovery scenarios.
- FR-005 receives US3's three timeline/host scenarios plus US6's five exact prior semantic-boundary scenarios.
- FR-006 receives US3's three timeline/host scenarios plus US7's exact prior packed-smoke scenario.
- Independent inspection confirmed the archive parser aggregates every story whose `Covers` field names the FR and then replaces the exact canonical requirement title with the combined statement and scenario set.
- The corrected normative statements retain every prior obligation and add only the accepted timeline behavior.

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| W-001 | Warning | Correctness test depth | Tests reject a non-base64 cursor and mismatched scope; wrong-version, extra-key, and empty-field canonical-base64 cursors are validated by implementation inspection rather than dedicated regressions. | Optional future cases in `tests/memory-core/timeline.test.ts`. |
| W-002 | Warning | Correctness test depth | Live keyset behavior is structurally correct and documented, but no focused test inserts a backdated memory between cursor pages. | Optional future case in `tests/memory-core/timeline.test.ts`. |

No critical issues were found. The temporarily incomplete canonical blocks are an operational dependency resolved by the pending corrected transactional archive, not a defect in the corrected delta.

## Residual risks

- SC-001 through SC-005: no unmet outcome risk was observed. W-001 and W-002 are non-blocking opportunities to deepen regression coverage and do not contradict an accepted requirement.
