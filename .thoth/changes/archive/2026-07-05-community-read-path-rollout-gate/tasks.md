# Tasks: Community Read Path Rollout Gate

## Phase 1: Foundation

- [x] 1.1 Create the shared rollout helper and named gate constants - `src/retrieval/community-rollout.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `retrieval/Project Eligibility MUST Require Fresh Committed Community State`
  **Independent Test:** Store community-summary fixtures can import the helper and evaluate fresh, stale, rebuilding, failed, degraded, enrichment-unavailable, and sparse-coverage states without touching persisted schema.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: Focused store tests cover on-demand project eligibility, named threshold constants, and ineligible-state reasons.

- [x] 1.2 Preserve default-off and reversible opt-in semantics - `src/config.ts`, `tests/config.test.ts`, `config.schema.json`
  **[USN-1]** | Priority: P1
  **Spec:** `retrieval/Community Read-Path Activation MUST Remain Explicit and Reversible`
  **Independent Test:** Config tests prove `communitySummaries.readPath.enabled` defaults to `false`, env/persisted config are the only opt-in paths, and clearing opt-in returns to the disabled baseline.
  **Verification**:
  - Run: `pnpm exec vitest run tests/config.test.ts`
  - Expected: Config defaults, env override, persisted config, and schema description assertions pass without adding new rollout config properties.

- [x] 1.3 Centralize rollout thresholds for store and eval use - `src/retrieval/community-rollout.ts`, `src/evals/retrieval.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `evals/Readiness Gates MUST Cover Project State and Summary Bounds`
  **Independent Test:** Eval and store paths use the same exported threshold names and report both threshold and observed values for project/community/source coverage.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts tests/store/community-summaries.test.ts`
  - Expected: Threshold names are single-sourced and test assertions fail if eval/store drift apart.

## Phase 2: Store Retrieval Integration

- [x] 2.1 Gate community-summary candidates with on-demand per-project eligibility - `src/store/index.ts`, `src/retrieval/community-rollout.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `retrieval/Project Eligibility MUST Require Fresh Committed Community State`
  **Independent Test:** A globally opted-in project only emits community candidates when its latest committed run matches the current graph signature and all eligibility gates pass.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: Fresh committed projects can emit candidates; stale, rebuilding, failed, degraded, enrichment-unavailable, sparse, and signature-mismatched projects emit none.

- [x] 2.2 Keep community evidence inside the existing KG lane - `src/store/index.ts`, `src/retrieval/ranking.ts`, `tests/store/community-summaries.test.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `retrieval/Community Evidence MUST Remain a KG-Lane Sub-Source`
  **Independent Test:** Eligible community summaries produce `source: 'kg_community_summary'` under `lane: 'kg'`, while direct KG and B2 multi-hop ordering remains no worse than baseline.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts tests/tools/mem-recall.test.ts`
  - Expected: No `community` lane appears, KG source priority is preserved, and `mem_recall` renders community evidence as KG sub-source evidence only.

- [x] 2.3 Preserve non-empty baseline fallback when community state is unavailable - `src/store/index.ts`, `tests/store/community-summaries.test.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `retrieval/Community Fallback MUST Preserve Non-Empty Baseline Retrieval`
  **Independent Test:** For the same project, corpus, query, and budgets, ineligible community states return source-attributed baseline hits whenever the disabled baseline has hits.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: Missing, stale, rebuilding, failed, degraded, and enrichment-unavailable states produce no global retrieval failure and preserve non-empty baseline hits when baseline hits exist.

- [x] 2.4 Keep community read-path output bounded and non-synthesizing - `src/store/index.ts`, `tests/store/community-summaries.test.ts`
  **[USN-4]** | Priority: P2
  **Spec:** `retrieval/Community Read Path MUST Stay Bounded and Non-Synthesizing`
  **Independent Test:** Matching community summaries respect existing count, char, source observation, entity, and triple bounds and never produce global answer synthesis.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: Candidate counts and text lengths stay within configured limits, source attribution is retained, and no synthesized answer surface is introduced.

## Phase 3: Retrieval Eval Rollout Gates

- [x] 3.1 Add same-corpus disabled-vs-enabled A/B rollout reporting - `src/evals/retrieval.ts`, `tests/evals/retrieval.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `evals/Rollout Eligibility MUST Require Same-Corpus A/B Retrieval Evidence`
  **Independent Test:** The eval report distinguishes disabled baseline and enabled candidate metrics for the same project, corpus, query set, retrieval limits, and community budgets.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: A/B rows include gate name, threshold, disabled observed value, enabled observed value, and pass/fail for identical corpus/query/budget inputs.

- [x] 3.2 Gate rollout eligibility on P4 token-savings metrics - `src/evals/retrieval.ts`, `tests/evals/retrieval.test.ts`
  **[USN-5]** | Priority: P1
  **Spec:** `evals/P4 Token-Savings Metrics MUST Gate Rollout Eligibility`
  **Independent Test:** Token gate rows consume `full_chars`, `evidence_chars`, `returned_chars`, `saved_chars`, compression, recall/rank quality, lane truth, and community safety metrics.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: Rollout eligibility fails when enabled retrieval regresses returned/evidence chars, compression, saved chars, recall, or rank beyond named zero-regression thresholds.

- [x] 3.3 Report project readiness gate inputs and sparse-coverage failures - `src/evals/retrieval.ts`, `src/retrieval/community-rollout.ts`, `tests/evals/retrieval.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `evals/Readiness Gates MUST Cover Project State and Summary Bounds`
  **Independent Test:** Readiness output includes opt-in, committed/fresh rebuild state, graph/community/source coverage, summary bounds, source coverage bounds, and degraded-state eligibility.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: Reported readiness gates show each threshold and observed value, and sparse coverage blocks eligibility.

- [x] 3.4 Prove fallback states in the eval gate - `src/evals/retrieval.ts`, `tests/evals/retrieval.test.ts`
  **[USN-6]** | Priority: P1
  **Spec:** `evals/Fallback Gates MUST Prove Baseline Retrieval Remains Usable`
  **Independent Test:** Eval fixtures cover disabled, missing, stale, rebuilding, failed, degraded, and enrichment-unavailable states with baseline-hit queries.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: Every unavailable-state gate passes only when fallback remains non-empty and source-attributed for queries whose disabled baseline has hits.

- [x] 3.5 Protect lane truth, direct KG, and B2 multi-hop ranking - `src/evals/retrieval.ts`, `tests/evals/retrieval.test.ts`
  **[USN-7]** | Priority: P1
  **Spec:** `evals/Lane and Ranking Regression Gates MUST Protect Existing KG Behavior`
  **Independent Test:** Direct KG and B2 multi-hop fixtures compare disabled baseline versus enabled candidate with named zero-regression recall/rank thresholds.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: No fifth lane is reported, direct KG does not regress, and B2 multi-hop recall/rank remains no worse than disabled baseline.

- [x] 3.6 Keep rollout evidence scoped to P3 only - `src/evals/retrieval.ts`, `README.md`
  **[USN-7]** | Priority: P2
  **Spec:** `evals/Rollout Evidence MUST Not Expand Deferred Scope`
  **Independent Test:** Passing rollout evals are described as community read-path eligibility only, not as global default-on, P5 graph navigation, or multi-harness completion.
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: The report can mark a project eligible for this rollout gate without claiming global default-on, P5 graph navigation v2, GraphRAG synthesis, or multi-harness readiness.

## Phase 4: Tool, Config, And Documentation Contracts

- [x] 4.1 Assert the compact MCP registry remains unchanged - `src/tools/index.ts`, `tests/tools/mem-recall.test.ts`, `tests/tools/mem-project.test.ts`
  **[USN-8]** | Priority: P1
  **Spec:** `tools/Rollout Gate MUST Preserve the Compact MCP Surface`
  **Independent Test:** Tool registration and focused tool tests still expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-recall.test.ts tests/tools/mem-project.test.ts`
  - Expected: No new MCP tool, no community-specific tool, and no admin rollout tool is registered or required.

- [x] 4.2 Preserve existing tool output contracts for community annotations - `tests/tools/mem-recall.test.ts`, `tests/tools/mem-project.test.ts`
  **[USN-8]** | Priority: P1
  **Spec:** `tools/Existing Tool Outputs MAY Surface Eligible Community Evidence Without Contract Expansion`
  **Independent Test:** Existing `mem_recall` and `mem_project action=summary` outputs may show bounded, source-attributed community KG evidence only when retrieval supplies eligible `kg_community_summary` candidates.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-recall.test.ts tests/tools/mem-project.test.ts`
  - Expected: Existing output shapes remain backward-compatible, bounded, and source-attributed; full detail still escalates through `mem_get`.

- [x] 4.3 Prevent deferred-scope claims in tool output and graph views - `tests/tools/mem-project.test.ts`, `README.md`
  **[USN-9]** | Priority: P2
  **Spec:** `tools/Tool Behavior MUST Not Claim Deferred Scope`
  **Independent Test:** `mem_project action=graph` remains a KG fact ledger and no existing tool output claims multi-harness parity, P5 graph navigation v2, or GraphRAG synthesis.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-project.test.ts`
  - Expected: Graph output remains ledger-oriented and rollout wording does not imply deferred scope is complete.

- [x] 4.4 Clarify operator documentation for opt-in versus eligibility - `README.md`, `config.schema.json`
  **[USN-9]** | Priority: P3
  **Spec:** `retrieval/Community Read-Path Activation MUST Remain Explicit and Reversible`
  **Independent Test:** Documentation states that `communitySummaries.readPath.enabled` is necessary but not sufficient, remains default-off, and can be rolled back by clearing env/persisted config.
  **Verification**:
  - Run: `rg "communitySummaries|readPath|eligible|rollout|opt-in" -n README.md config.schema.json`
  - Expected: Docs and schema descriptions do not imply global default-on or that opt-in alone guarantees eligibility.

## Phase 5: Verification And Release Readiness

- [x] 5.1 Run the focused rollout verification matrix - affected tests and eval
  **[USN-10]** | Priority: P1
  **Spec:** `evals/Rollout Eligibility MUST Require Same-Corpus A/B Retrieval Evidence`
  **Independent Test:** The focused suite and retrieval eval exercise config, store, eval, and existing tool contracts together.
  **Verification**:
  - Run: `pnpm exec vitest run tests/config.test.ts tests/evals/retrieval.test.ts tests/store/community-summaries.test.ts tests/tools/mem-recall.test.ts tests/tools/mem-project.test.ts && pnpm run eval:retrieval`
  - Expected: Focused tests pass and retrieval eval reports all rollout gates with threshold and observed values.

- [x] 5.2 Run build and full regression gate - repository baseline
  **[USN-10]** | Priority: P1
  **Spec:** `tools/Rollout Gate MUST Preserve the Compact MCP Surface`
  **Independent Test:** The repository still typechecks/builds and the full Vitest suite passes after rollout-gate changes.
  **Verification**:
  - Run: `pnpm run build && pnpm test`
  - Expected: Build succeeds and the full test suite passes with no MCP surface, retrieval fallback, or public-contract regressions.
