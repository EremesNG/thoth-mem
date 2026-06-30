# Tasks: Output Caps for getContext-backed Responses

> **Scope**: Change A — Output Caps Only. Pruning (D-1/D-2/D-3), `observation_facts`,
> and `ZodRawShapeCompat` are NOT touched. No tool added, removed, or renamed.

## Traceability

| Phase | Task group | Spec requirement(s) |
|-------|-----------|---------------------|
| 1: Infrastructure | 1.1–1.6 | config-spec / "Context Output Budget MUST Be Configurable"; store-spec / "getContext MUST Accept And Enforce A Max-Output-Chars Budget" (config side) |
| 2: Implementation | 2.1–2.6 | store-spec / "formatObservationMarkdown MUST Support A Preview/Truncation Mode"; store-spec / "getContext MUST Accept And Enforce…"; store-spec / "Bounded Context Rendering MUST Preserve…"; tools-spec / "Output Bound MUST Be Applied At The Shared getContext Layer"; tools-spec / "Budget MUST Be Overridable Per Call"; config-spec / "maxContentLength MUST Be Input-Validation Warn-Only And Distinct" |
| 3: Testing | 3.1–3.7 | All spec scenarios (tools, store, config) |
| 4: Verification | 4.1 | config.yaml verify rules |

---

## Phase 1: Infrastructure

- [x] 1.1 Add `maxContextChars: number` to the `ThothConfig` interface — `src/config.ts:45-59`
  **[USN-1]** | Priority: P1
  **Spec:** `config-spec/Context Output Budget MUST Be Configurable With Deterministic Resolution`
  **Independent Test:** TypeScript type-checks with no error on `config.maxContextChars` access after the edit.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build completes without TypeScript errors in `src/config.ts`

- [x] 1.2 Add `maxContextChars?: number` to the `PersistedConfig` interface — `src/config.ts:65-81`
  **[USN-1]** | Priority: P1
  **Spec:** `config-spec/Context Output Budget MUST Be Configurable With Deterministic Resolution`
  **Independent Test:** TypeScript accepts optional `maxContextChars` on `PersistedConfig` objects.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build completes without TypeScript errors in `src/config.ts`

- [x] 1.3 Add `maxContextChars: 8000` to `defaultPersistedConfig()` — `src/config.ts:193-216`
  **[USN-1]** | Priority: P1
  **Spec:** `config-spec/Context Output Budget MUST Be Configurable With Deterministic Resolution#Built-in default applies when unset everywhere`
  **Independent Test:** `getConfig()` with no env and no persisted value returns `maxContextChars === 8000`.
  **Verification**:
  - Run: `pnpm test tests/config.test.ts`
  - Expected: Existing config tests pass; new default-value assertion passes

- [x] 1.4 Add resolution line in `getConfig()` return — `src/config.ts:417-434`
  Add `maxContextChars: parseNumber(process.env.THOTH_MAX_CONTEXT_CHARS) ?? persisted.maxContextChars ?? 8000,` mirroring the `maxContentLength` resolution pattern. Add a doc comment on `maxContentLength` clarifying it is INPUT warn-only and DISTINCT from the OUTPUT `maxContextChars`.
  **[USN-1]** | Priority: P1
  **Spec:** `config-spec/Context Output Budget MUST Be Configurable With Deterministic Resolution#Environment override wins`
  **Independent Test:** Set `THOTH_MAX_CONTEXT_CHARS=2000` in the test env and assert `getConfig().maxContextChars === 2000`.
  **Verification**:
  - Run: `pnpm test tests/config.test.ts`
  - Expected: All config tests pass

- [x] 1.5 Add `maxContextChars: 8000` to `DEFAULT_CONFIG` — `src/store/index.ts:183-192`
  **[USN-1]** | Priority: P1
  **Spec:** `store-spec/Store.getContext MUST Accept And Enforce A Max-Output-Chars Budget#getContext budget defaults from config`
  **Independent Test:** `new Store(':memory:').config.maxContextChars` equals `8000` without any persisted config.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build completes without TypeScript errors; `Store.config.maxContextChars` is accessible

- [x] 1.6 Add `maxOutputChars?: number` to `ContextInput` — `src/store/types.ts:147-152`
  **[USN-1]** | Priority: P1
  **Spec:** `store-spec/Store.getContext MUST Accept And Enforce A Max-Output-Chars Budget#getContext budget defaults from config and is overridable`
  **Independent Test:** TypeScript accepts `store.getContext({ maxOutputChars: 0 })` without errors.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build completes without TypeScript errors in `src/store/types.ts`

---

## Phase 2: Implementation

- [x] 2.1 Extend `formatObservationMarkdown` with preview mode — `src/utils/content.ts:28-38`
  Add optional `options?: { preview?: boolean; previewLength?: number }` parameter. When `preview` is `true`, substitute `truncateForPreview(obs.content, options.previewLength ?? 300)` for the full `obs.content` line. Header/metadata lines unchanged. Default (options absent or `preview` false) preserves exact existing full-content output.
  **[USN-2]** | Priority: P1
  **Spec:** `store-spec/formatObservationMarkdown MUST Support A Preview/Truncation Mode`
  **Independent Test:** Call `formatObservationMarkdown(obs, { preview: true })` on an observation with content > 300 chars; assert result contains `...` and does NOT contain the full body; assert non-preview call still returns full body.
  **Verification**:
  - Run: `pnpm test tests/utils/content.test.ts`
  - Expected: Existing content tests pass; new preview-mode assertions pass

- [x] 2.2 Implement the budget branch in `Store.getContext` — `src/store/index.ts:1169-1242`
  Resolve `const budget = input.maxOutputChars ?? this.config.maxContextChars`. If `budget === 0`, render the legacy full-content path (unconditional `observationBlocks` join). If `budget > 0`: render sessions + prompts + stats sections unconditionally (already bounded), then accumulate observation preview blocks one at a time (using `formatObservationMarkdown(obs, { preview: true })`), stopping when the next block would exceed remaining budget. Record omitted count. Append footer: `> Showing N of M observations (budget Kc). Use mem_get(id=...) for full content; N more omitted.` Apply a final defensive `trimToBudget(text, budget)` guard. Edge case: when a single observation preview does not fit, include a truncated fragment of it rather than silently dropping it, plus the `mem_get` pointer.
  **[USN-2]** | Priority: P1
  **Spec:** `store-spec/Store.getContext MUST Accept And Enforce A Max-Output-Chars Budget`; `store-spec/Bounded Context Rendering MUST Preserve Existing Section Structure And Escalation`
  **Independent Test:** Seed an in-memory store with observations totalling >> 8000 chars; assert `store.getContext({}).length <= 8000` and that the returned string contains all four structural sections plus a `mem_get` pointer.
  **Verification**:
  - Run: `pnpm test tests/store/context.test.ts`
  - Expected: All existing context tests pass; new budget-enforcement tests pass

- [x] 2.3 Add `max_chars` parameter to `mem_context` tool and thread it through — `src/tools/mem-context.ts:26-35`
  Add `max_chars: z.number().min(0).optional()` to the tool schema (sentinel `0` admitted; mirror `mem_project`'s `max_chars` shape). Sub-steps:
  - a. Add `max_chars` to the zod schema in the tool definition.
  - b. Add `max_chars` to the handler destructure. The current destructure at ~line 33 reads `{ project, session_id, scope, limit, recall_query }` — extend it to `{ project, session_id, scope, limit, recall_query, max_chars }` so the param is actually read.
  - c. Thread it as `store.getContext({ project, session_id, scope, limit, maxOutputChars: max_chars })`.
  - d. Extend the tool description to note bounded-by-default output and `mem_get` escalation (kept terse per P1; no new tool).
  **[USN-2]** | Priority: P1
  **Spec:** `tools-spec/Context And Summary Budget MUST Be Overridable Per Call`; `tools-spec/Context And Summary Output MUST Support An Explicit Unbounded Mode`
  **Independent Test:** Invoke `mem_context` with `max_chars: 500` on a large store; assert result length <= 500.
  **Verification**:
  - Run: `pnpm test tests/tools/mem-context.test.ts`
  - Expected: All existing mem_context tests pass; new per-call override tests pass

- [x] 2.4 Add `maxOutputChars` param to `formatProjectSummary` — `src/tools/project-views.ts:10-16`
  Add optional `maxOutputChars?: number` parameter to `formatProjectSummary(store, project, limit?, maxOutputChars?)` and pass it into `store.getContext({ project, limit, maxOutputChars })`.
  **[USN-2]** | Priority: P1
  **Spec:** `tools-spec/Output Bound MUST Be Applied At The Shared getContext Layer`
  **Independent Test:** Call `formatProjectSummary(store, project, undefined, 500)` on a large store; assert the result length <= 500.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build completes without TypeScript errors in `src/tools/project-views.ts`

- [x] 2.5 Thread `max_chars` through the `action=summary` path in `mem_project` using base `min(0)` + superRefine — `src/tools/mem-project.ts`
  `max_chars` is a single shared zod field (`:29`) validated before `action` dispatch. Simply changing `min(200)` to `min(0)` would silently allow `max_chars=0` on `action=graph`/`topic`, where it produces empty output. Implement EXACTLY as follows:
  - a. Change the base `max_chars` field (`:29`) from `z.number().min(200).max(<existing max>)` to `z.number().int().min(0).max(<existing max>)` (keep the existing `.int()` and `.max(...)` bounds unchanged if present; add `.int()` if absent).
  - b. Add a `.superRefine` on the mem_project **input schema** (the whole input object) that enforces: when `input.action === 'graph'` or `input.action === 'topic'`, if `max_chars` is provided and not `undefined`, it MUST be `>= 200`. Values `0` and `1–199` are valid ONLY when `input.action === 'summary'`. Emit a clear error: `"max_chars must be >= 200 when action is 'graph' or 'topic'"`.
  - c. In the handler, thread `max_chars` into `formatProjectSummary(store, project, limit, max_chars)` ONLY on the `action=summary` branch. Sentinel `0` means unbounded there.
  - d. `action=graph` and `action=topic` handler paths are UNCHANGED — they keep their existing `max_chars` semantics and defaults (e.g. `formatProjectGraph` default `6000`) exactly as before.
  **[USN-2]** | Priority: P1
  **Spec:** `tools-spec/Context And Summary Budget MUST Be Overridable Per Call#Per-call budget override is honored`; `tools-spec/Context And Summary Output MUST Support An Explicit Unbounded Mode#Unbounded sentinel restores full output`
  **Independent Test:** (1) `mem_project` with `action=summary, max_chars=0` on a large store → result is not truncated. (2) `action=summary, max_chars=500` → result length <= 500. (3) `action=graph, max_chars=0` → zod validation error (sentinel not allowed for graph). (4) `action=graph, max_chars=150` → zod validation error (< 200 not allowed for graph). (5) `action=graph, max_chars=300` → passes validation and graph output unchanged.
  **Verification**:
  - Run: `pnpm test tests/tools/mem-project.test.ts`
  - Expected: All existing mem_project tests pass; new override, sentinel, and superRefine guard tests pass

- [x] 2.6 Confirm HTTP (`src/http-routes.ts:1032`) and CLI (`src/cli.ts:380`) require no changes
  Read both call sites and verify they call `formatProjectSummary(store, project, limit)` / `store.getContext({ project })` with no per-surface bounding code. If no changes are needed, mark this task done. If a discrepancy is found, surface it as a defect before proceeding.
  **[USN-2]** | Priority: P2
  **Spec:** `tools-spec/Output Bound MUST Be Applied At The Shared getContext Layer#HTTP and CLI summary inherit the shared bound`
  **Independent Test:** Inspect both call sites; confirm neither adds a cap param or post-hoc trim.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build succeeds; HTTP and CLI files are unmodified

---

## Phase 3: Testing

- [x] 3.1 Write regression tests — bounded output replaces ~104K/~74K dumps — `tests/store/context.test.ts`, `tests/tools/mem-context.test.ts`, `tests/tools/mem-project.test.ts`
  Seed a store with many large observations (combined rendering >> 8000 chars, reproducing the original ~104K/~74K magnitudes). Assert: `getContext({}).length <= 8000`; `mem_context` text `<= 8000`; `mem_project action=summary` text `<= 8000`. Assert the ~104K/~74K magnitudes do NOT recur.
  **[USN-3]** | Priority: P1
  **Spec:** `tools-spec/Context And Summary Responses MUST Be Bounded#Large memory store yields bounded context output`; `tools-spec/Context And Summary Responses MUST Be Bounded#Large memory store yields bounded project summary output`
  **Independent Test:** Run only these regression assertions and verify they fail against the pre-change code, pass after.
  **Verification**:
  - Run: `pnpm test tests/store/context.test.ts tests/tools/mem-context.test.ts tests/tools/mem-project.test.ts`
  - Expected: All three test files pass

- [x] 3.2 Write preview-rendering and section/mem_get-pointer retention tests — `tests/utils/content.test.ts`, `tests/store/context.test.ts`
  Assert: an observation with content > 300 chars renders a `...`-suffixed preview in preview mode; observation header (id, type, title) is retained; full mode still emits complete content; bounded `getContext` output contains all four structural sections (recent sessions, prompts, observations, stats) AND a `mem_get` pointer.
  **[USN-3]** | Priority: P1
  **Spec:** `store-spec/formatObservationMarkdown MUST Support A Preview/Truncation Mode#Preview mode truncates long observation content`; `store-spec/Bounded Context Rendering MUST Preserve Existing Section Structure And Escalation#Bounded render keeps structure and mem_get pointer`
  **Independent Test:** Run `tests/utils/content.test.ts` in isolation; all preview/full-mode assertions pass.
  **Verification**:
  - Run: `pnpm test tests/utils/content.test.ts tests/store/context.test.ts`
  - Expected: All assertions in both files pass

- [x] 3.3 Write per-call override tests — `tests/tools/mem-context.test.ts`, `tests/tools/mem-project.test.ts`
  Assert: `max_chars` below default bounds more tightly than the default; a subsequent call without override returns to the default bound; override does NOT mutate persisted config. Cover both `mem_context` and `mem_project action=summary`.
  **[USN-3]** | Priority: P1
  **Spec:** `tools-spec/Context And Summary Budget MUST Be Overridable Per Call#Per-call budget override is honored`; `config-spec/Context Output Budget MUST Be Configurable#Per-call override supersedes the resolved default without persisting`
  **Independent Test:** Run the override tests in isolation; pass.
  **Verification**:
  - Run: `pnpm test tests/tools/mem-context.test.ts tests/tools/mem-project.test.ts`
  - Expected: Override behavior tests pass

- [x] 3.4 Write sentinel `0` = unbounded tests — `tests/store/context.test.ts`, `tests/tools/mem-context.test.ts`, `tests/tools/mem-project.test.ts`, `tests/config.test.ts`
  Assert at each layer: budget `0` per-call yields untruncated full output (full-dump path, no preview truncation, no footer); `THOTH_MAX_CONTEXT_CHARS=0` in env yields the same via config resolution; default config still enforces the bound when sentinel is absent.
  **[USN-3]** | Priority: P1
  **Spec:** `store-spec/getContext unbounded sentinel disables enforcement`; `tools-spec/Context And Summary Output MUST Support An Explicit Unbounded Mode#Unbounded sentinel restores full output`; `config-spec/Context Output Budget MUST Support An Unbounded Sentinel#Sentinel disables the output bound`
  **Independent Test:** Run sentinel tests in isolation; pass.
  **Verification**:
  - Run: `pnpm test tests/store/context.test.ts tests/tools/mem-context.test.ts tests/tools/mem-project.test.ts tests/config.test.ts`
  - Expected: All sentinel scenario assertions pass

- [x] 3.5 Write config resolution precedence tests — `tests/config.test.ts`
  Assert: default `maxContextChars === 8000` when neither env nor persisted is set; `THOTH_MAX_CONTEXT_CHARS` env wins over persisted value; persisted wins when env is unset; `0` resolves as the sentinel (not treated as missing).
  **[USN-3]** | Priority: P1
  **Spec:** `config-spec/Context Output Budget MUST Be Configurable With Deterministic Resolution#Environment override wins`; `config-spec/Context Output Budget MUST Be Configurable#Persisted value is used when environment is unset`; `config-spec/Built-in default applies when unset everywhere`
  **Independent Test:** Run `tests/config.test.ts` in isolation; all resolution precedence assertions pass.
  **Verification**:
  - Run: `pnpm test tests/config.test.ts`
  - Expected: All config resolution tests pass

- [x] 3.6 Write HTTP + CLI inheritance tests — `tests/http-server.test.ts`, `tests/cli.test.ts`
  Assert: the HTTP `/projects/{project}/summary` response is bounded by `maxContextChars` without surface-specific bounding code; the CLI `context` command output is bounded similarly. Neither test requires mocking per-surface bounding — the bound must come purely from `getContext`.
  **[USN-3]** | Priority: P2
  **Spec:** `tools-spec/Output Bound MUST Be Applied At The Shared getContext Layer#HTTP and CLI summary inherit the shared bound`
  **Independent Test:** Run `tests/http-server.test.ts` and `tests/cli.test.ts` in isolation; pass.
  **Verification**:
  - Run: `pnpm test tests/http-server.test.ts tests/cli.test.ts`
  - Expected: HTTP and CLI inheritance assertions pass

- [x] 3.7 Write independence / no-regression tests — `tests/config.test.ts`, `tests/tools/mem-recall.test.ts`, `tests/store/context.test.ts`
  Assert: changing `maxContextChars` does NOT change `maxContentLength` save-time warn behavior (and vice versa); `mem_recall` output is completely unaffected by any `maxContextChars` value (its own `MAX_CONTEXT_CHARS = 6000` and `trimToBudget` are untouched); the existing `tests/store/context.test.ts` "returns markdown with all sections" test still passes (empty-state text preserved). Also assert `mem_recall` with `limit=6000` is independent.
  **[USN-3]** | Priority: P2
  **Spec:** `config-spec/maxContentLength MUST Be Input-Validation Warn-Only And Distinct From The Output Cap#Input and output knobs are independent`
  **Independent Test:** Run `mem_recall` tests after any config change; assert output unchanged.
  **Verification**:
  - Run: `pnpm test tests/config.test.ts tests/tools/mem-recall.test.ts tests/store/context.test.ts`
  - Expected: All no-regression assertions pass; `mem_recall` behavior unchanged

---

## Phase 4: Verification and Close

- [x] 4.1 Run full test suite and build — all modules
  Run the complete test suite and build to confirm no regressions across any module.
  **[USN-4]** | Priority: P1
  **Spec:** All — full integration gate
  **Independent Test:** Full suite green; build artifact produced.
  **Verification**:
  - Run: `pnpm test`
  - Expected: All tests pass with no failures
  - Run: `pnpm run build`
  - Expected: Build completes successfully with no TypeScript errors or build errors

- [x] 4.2 Update the requirements checklist — `openspec/changes/output-caps-and-pruning/checklists/requirements.md`
  Mark all implemented requirements as satisfied in the requirements checklist. Confirm no deferred/KEEP items were touched.
  **[USN-4]** | Priority: P2
  **Spec:** All implemented specs
  **Independent Test:** Review the checklist; every caps-only requirement is checked; no pruning/KEEP items are checked.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build still passes after checklist update (no code changes)
