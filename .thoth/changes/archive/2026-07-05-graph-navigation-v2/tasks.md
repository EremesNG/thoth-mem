# Tasks: Graph Navigation V2

## Phase 1: Contract-First Test Coverage
- [x] 1.1 Add focused compatibility tests for default `mem_project action="graph"` when `navigation` is omitted
**[USN-01]** | Priority: P1
**Spec:** tools/`mem_project action=graph` MUST Preserve Default Ledger Compatibility
**Independent Test:** `tests/tools/mem-project.test.ts` focused regression for omitted `navigation` behavior.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "default graph compatibility"`
- Expected: Legacy-style ledger output remains KG-backed, current-state only, and unchanged `max_chars` semantics.

- [x] 1.2 Add test asserting explicit `navigation="ledger"` is semantically equivalent to omitted navigation
**[USN-02]** | Priority: P1
**Spec:** tools/`mem_project action=graph` MUST Preserve Default Ledger Compatibility
**Independent Test:** `tests/tools/mem-project.test.ts` ledger equivalence and continuation behavior.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "ledger navigation equivalence"`
- Expected: Omitted-navigation and `ledger` responses match in shape and bounds for the same inputs.

- [x] 1.3 Add schema/validation tests for optional graph-navigation inputs and registry compactness
**[USN-03]** | Priority: P1
**Spec:** tools/Graph Navigation MUST Be Additive Within the Existing `mem_project` Tool
**Independent Test:** `tests/tools/mem-project.test.ts` with cases for `navigation`, `focus_node_id`, `observation_id`, `continuation`, `include_superseded`.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "graph navigation schema"`
- Expected: Tool input accepts the optional fields without breaking legacy payloads, and rejects unsupported navigation values.

- [x] 1.4 Add graph-registry test guard for six-tool MCP set
**[USN-04]** | Priority: P1
**Spec:** tools/MCP Surface MUST Be Compact and Workflow-Level
**Independent Test:** `tests/tools/mem-project.test.ts` + server tool-list contract test.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "registered tool set"`
- Expected: Exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, `mem_session` are present.

## Phase 2: Tool Input and Dispatch Changes (Implementation)
- [x] 2.1 Extend `src/tools/mem-project.ts` input shape with optional navigation fields, keeping defaults and legacy compatibility
**[USN-05]** | Priority: P1
**Spec:** tools/Graph Navigation MUST Be Additive Within the Existing `mem_project` Tool
**Independent Test:** Reuse schema validation tests from phase 1.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "graph navigation schema"`
- Expected: No legacy regression; valid optional fields parse and map to bounded defaults.

- [x] 2.2 Route `action="graph"` to explicit navigation mode handlers for `ledger`, `neighborhood`, `lineage`, `community`, `superseded`
**[USN-06]** | Priority: P1
**Spec:** tools/Graph Navigation MUST Be Additive Within the Existing `mem_project` Tool; visualization-api/Observatory Contracts MUST Provide MCP-Compatible Navigation Primitives
**Independent Test:** Integration assertions over `mem_project` call outputs per selected navigation mode.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "graph navigation modes"`
- Expected: Mode dispatch returns distinct bounded views and `navigation` defaults safely to ledger.

- [x] 2.3 Ensure `include_superseded` is honored only for explicit history-inclusive navigation
**[USN-07]** | Priority: P1
**Spec:** tools/Superseded Navigation MUST Be Explicit and Tagged
**Independent Test:** `tests/tools/mem-project.test.ts` scenarios for `navigation=superseded` and default ledger.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "superseded"`
- Expected: Default graph and neighborhood are current-state only; superseded data appears only when explicitly requested and is tagged.

## Phase 3: View Formatters and Bounded Output Contracts
- [x] 3.1 Add/update bounded legacy ledger formatter behavior and continuation/truncation reporting
**[USN-08]** | Priority: P1
**Spec:** tools/`mem_project action=graph` MUST Preserve Default Ledger Compatibility; visualization-api/Observatory Ledger History MUST Remain Current-State By Default
**Independent Test:** `tests/tools/mem-project.test.ts` + `tests/store/visualization.test.ts` around current-state ledger output.
**Verification:**
- Run: `pnpm test -- tests/store/visualization.test.ts -t "ledger"`
- Expected: Ledger is current-state by default, bounded by `limit`/`max_chars`, with continuation/omission metadata.

- [x] 3.2 Add bounded neighborhood formatter with frontier/visible-node tracking and continuation/exhaustion states
**[USN-09]** | Priority: P1
**Spec:** tools/Neighborhood Navigation MUST Return a Bounded Frontier View; visualization-api/Frontier Navigation MUST Report Incremental State
**Independent Test:** `tests/store/visualization.test.ts` for frontier state plus `tests/tools/mem-project.test.ts` for rendered text.
**Verification:**
- Run: `pnpm test -- tests/store/visualization.test.ts -t "frontier"`
- Expected: Bounded frontier includes focus id, new vs visible nodes, and continuation/exhausted state when capped.

- [x] 3.3 Add bounded lineage formatter with deterministic order, focus filters, and pivotable IDs
**[USN-10]** | Priority: P2
**Spec:** tools/Lineage Navigation MUST Return Scoped Timeline Evidence; visualization-api/Observatory Contracts MUST Provide MCP-Compatible Navigation Primitives
**Independent Test:** `tests/store/visualization.test.ts` timeline/read-path + `tests/tools/mem-project.test.ts` lineage rendering.
**Verification:**
- Run: `pnpm test -- tests/store/visualization.test.ts -t "lineage"`
- Expected: Timelined lineage is deterministic, bounded, and includes observation metadata for follow-up pivot calls.

- [x] 3.4 Add bounded superseded navigation formatter that clearly tags historical entries
**[USN-11]** | Priority: P1
**Spec:** tools/Superseded Navigation MUST Be Explicit and Tagged; visualization-api/Observatory Ledger History MUST Remain Current-State By Default
**Independent Test:** `tests/store/visualization.test.ts` superseded data scenarios + `tests/tools/mem-project.test.ts` explicit view assertions.
**Verification:**
- Run: `pnpm test -- tests/store/visualization.test.ts -t "superseded"`
- Expected: Explicit history view returns tagged superseded records; default graph view stays current-state.

- [x] 3.5 Add bounded community inspection formatter using existing community state and committed summaries without GraphRAG-global-answer framing
**[USN-12]** | Priority: P2
**Spec:** tools/Community Navigation MUST Inspect Existing Community State Only; visualization-api/Community Summary Reads MUST Remain Inspection-Oriented
**Independent Test:** `tests/tools/mem-project.test.ts` and `tests/http-viz.test.ts` style fixture coverage.
**Verification:**
- Run: `pnpm test -- tests/http-viz.test.ts -t "community summary"`
- Expected: Community view reports freshness/degraded/state metadata and committed-summary previews, and never claims global GraphRAG answers.

## Phase 4: Error, Source Attribution, and Scope Safety
- [x] 4.1 Add invalid input/error tests for bad focus identifiers, malformed continuation, and out-of-range bounds
**[USN-13]** | Priority: P2
**Spec:** tools/Graph Navigation MUST Be Additive Within the Existing `mem_project` Tool; visualization-api/Observatory Contracts MUST Provide MCP-Compatible Navigation Primitives
**Independent Test:** `tests/tools/mem-project.test.ts` and `tests/store/visualization.test.ts` error-path cases.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "graph navigation invalid"`
- Expected: Invalid inputs return existing MCP error shape and safe messages, not process crashes.

- [x] 4.2 Ensure source attribution and preview metadata appears in all new graph navigation text views (IDs, topic, timestamps where available)
**[USN-14]** | Priority: P2
**Spec:** visualization-api/Visualization API MUST Return Provenance-Rich, Structured Memory Semantics; tools/Lineage Navigation MUST Return Scoped Timeline Evidence
**Independent Test:** Snapshot/expectation checks in `tests/tools/mem-project.test.ts` across all navigation modes.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts -t "graph navigation attribution"`
- Expected: Each mode emits source IDs and pivot fields sufficient to reach full content via existing MCP calls.

## Phase 5: Optional/Conditional Parity & Release Verification
- [-] 5.1 Add/adjust store helper methods only if existing observatory/community readers are insufficient (conditional) — no-op: existing Store observatory/community readers were sufficient; no helper was added.
**[USN-15]** | Priority: P3
**Spec:** visualization-api/Observatory Contracts MUST Provide MCP-Compatible Navigation Primitives
**Independent Test:** `tests/store/visualization.test.ts` against existing store methods first; keep conditional path if no new helper needed.
**Verification:**
- Run: `pnpm test -- tests/store/visualization.test.ts -t "obs context"`
- Expected: Store API remains minimally additive and reused where possible; no unnecessary abstraction layer.

- [-] 5.2 Update OpenAPI/schema docs only if required by implementation parity changes (conditional) — no-op: no HTTP/OpenAPI route or schema parity change was required.
**[USN-16]** | Priority: P3
**Spec:** visualization-api/Visualization API MUST Provide an Observatory Query Model
**Independent Test:** `tests/http-viz.test.ts` and type/build checks for schema parity.
**Verification:**
- Run: `pnpm test -- tests/http-viz.test.ts -t "visualization query model"`
- Expected: OpenAPI updates are additive and compatible; no endpoint behavior change required.

## Phase 6: Verification and Exit Criteria
- [x] 6.1 Run focused graph navigation focused suites
**[USN-17]** | Priority: P1
**Spec:** tools/Superseded Navigation MUST Be Explicit and Tagged; visualization-api/Observatory Contracts MUST Provide MCP-Compatible Navigation Primitives
**Independent Test:** Composite of all touched domain tests.
**Verification:**
- Run: `pnpm test -- tests/tools/mem-project.test.ts tests/store/visualization.test.ts`
- Expected: Core new navigation behavior passes in focused mode.

- [-] 6.2 Run conditional HTTP parity focused suite if route/schema changes were added — no-op: implementation did not modify HTTP routes or OpenAPI schema.
**[USN-18]** | Priority: P2
**Spec:** visualization-api/Visualization API MUST Provide an Observatory Query Model
**Independent Test:** HTTP observatory surface tests only if `src/http-openapi.ts` / `src/http-routes.ts` changed.
**Verification:**
- Run: `pnpm test -- tests/http-viz.test.ts`
- Expected: Any schema/routing updates are backward-compatible and pass request/response parity checks.

- [x] 6.3 Execute build and full suite gates
**[USN-19]** | Priority: P1
**Spec:** tools/MCP Surface MUST Be Compact and Workflow-Level; visualization-api/Observatory Contracts MUST Provide MCP-Compatible Navigation Primitives
**Independent Test:** repo-wide validation from package scripts.
**Verification:**
- Run: `pnpm run build`
- Expected: TypeScript build/typecheck succeeds for changed tool/store files.
- Run: `pnpm test`
- Expected: Full Vitest suite passes.
