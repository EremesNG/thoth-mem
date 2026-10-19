# Tasks: Token Savings Metrics

## Phase 1: Canonical metric envelope
- [x] 1.1 Define retrieval/memory envelope types and shared constants in `src/evals/retrieval.ts` under a single additive payload surface.
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Token Savings Metrics#Canonical Metrics Envelope`
  **Independent Test:** Build a local helper that returns a shape containing `full_chars`, `evidence_chars`, `returned_chars`, `saved_chars`, `compression_ratio`, `compression_basis`, and recall/lane/community fields for one report instance.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: tests can import and reason about the new type names/field names; no runtime behavior change yet.

- [x] 1.2 Preserve `retrieval_defaults`, recall gates, and no-regression outputs in the existing summary by extending the current `RetrievalEvalSummary` aggregate instead of replacing it.
  **[USN-2]** | Priority: P1
  **Spec:** `proposal/Token Savings Metrics#Metrics Compatibility`
  **Independent Test:** Recompute `summary` from one eval run and assert existing fields still exist with original value semantics.
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: markdown and assertions still include `Context Compression`, `Surgical Compression`, `Community` rows, and existing recall/hybrid/lane metrics with non-regression gates satisfied.

## Phase 2: Recall-tool envelope mapping and backward compatibility
- [x] 2.1 Add a non-breaking metadata mapping path in `src/tools/mem-recall.ts` that emits a canonical savings metadata tuple (`compression_ratio`, `evidence_chars`, `full_chars`) with optional `returned_chars`/`returned_basis` in context mode output only.
  **[USN-3]** | Priority: P1
  **Spec:** `proposal/Token Savings Metrics#MemRecall Backward Compatibility`
  **Independent Test:** Call `mem_recall` in `mode=context` and assert the previous `retrieval_contract`, `compression_ratio`, `evidence_chars`, and `full_chars` tokens remain present while new fields are additive.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-recall.test.ts`
  - Expected: existing `retrieval_contract=... compression_ratio=... evidence_chars=... full_chars=...` assertions remain green and no test relies on removed tokens.

- [x] 2.2 Add focused tool-output regression tests covering community summary lane constraints in `tests/tools/mem-recall.test.ts` (no fifth retrieval lane, community remains `lane: kg`, read-path default-off behavior is unchanged).
  **[USN-3]** | Priority: P2
  **Spec:** `openspec/specs/tools/spec.md#Community Evidence In KG Lane`
  **Independent Test:** Mock/execute `community` candidates and confirm evidence source remains `kg` lane with no additional lane key introduced.
  **Verification**:
  - Run: `pnpm exec vitest run tests/tools/mem-recall.test.ts`
  - Expected: assertions confirm no fifth lane token is introduced and candidate source remains `kg_community_summary` under the `kg` lane.

## Phase 3: Retrieval eval envelope assertions and safety gates
- [x] 3.1 Update `tests/evals/retrieval.test.ts` to assert the new savings envelope fields and alias mapping (`saved_chars`, `returned_chars`, `compression_basis`).
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Token Savings Metrics#Canonical Metrics Envelope`
  **Independent Test:** Execute the retrieval baseline report assertions against a full report payload, including deterministic math for `saved_chars === full_content_chars - returned_chars` where available.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts`
  - Expected: new assertions for envelope fields pass on current fixture corpus and existing recall gates remain intact.

- [x] 3.2 Add/refresh community fallback/no-regression assertions in `tests/evals/retrieval.test.ts` and keep `community_no_fifth_lane_rate` coverage mandatory.
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Token Savings Metrics#Community Safety`
  **Independent Test:** Validate `community_read_path_default_off`, `community_disabled_no_regression`, `community_enabled_no_regression`, and `community_no_fifth_lane` remain at expected values.
  **Verification**:
  - Run: `pnpm run eval:retrieval`
  - Expected: eval exits 0 and prints metrics with all community-gating/no-regression checks passing.

- [x] 3.3 Extend/adjust `tests/store/community-summaries.test.ts` to cover output boundary stability when community retrieval is enabled/disabled and ensure projection remains in `kg` lane.
  **[USN-6]** | Priority: P2
  **Spec:** `proposal/Token Savings Metrics#Community Safety`
  **Independent Test:** Seed community snapshots and assert retrieval candidates carry only expected sub-sources under `kg` lane and bounded snapshot metadata.
  **Verification**:
  - Run: `pnpm exec vitest run tests/store/community-summaries.test.ts`
  - Expected: retrieval assertions continue to pass with explicit lane- and bounds-related expectations.

## Phase 4: Release validation
- [x] 4.1 Run focused and full-suite verification for the first slice before any follow-up slices.
  **[USN-7]** | Priority: P1
  **Spec:** `proposal/Token Savings Metrics#Verification`
  **Independent Test:** Run project verification commands in dependency order and check no regressions from previous slices.
  **Verification**:
  - Run: `pnpm exec vitest run tests/evals/retrieval.test.ts tests/tools/mem-recall.test.ts tests/store/community-summaries.test.ts`
  - Expected: all targeted suites pass.
  - Run: `pnpm test`
  - Expected: full test suite passes.
  - Run: `pnpm run build`
  - Expected: build completes successfully.
