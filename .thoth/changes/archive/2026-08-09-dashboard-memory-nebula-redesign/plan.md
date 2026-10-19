# Implementation Plan: Neural Observatory Dashboard

## Technical context

The shipped dashboard boots through `dashboard/src/main.tsx` → `RouterProvider` → a 1,500-line `dashboard/src/App.tsx`. That file owns global loading, scope, recall, observation creation, operations, traces, indexing, graph rebuilding, routing composition, and the active D3 force graph. The active graph supports pointer selection, zoom, fit, pause, minimum-degree filtering, and bounded expansion, but it does not use the richer inspection/frontier/pivot behavior already present in unmounted `components/map/` and `components/observatory/` workspaces.

The redesign will keep the existing React 19/Vite/TypeScript and D3 canvas stack, preserve the typed HTTP client, and consolidate the duplicate graph paths into the existing map/observatory module boundaries. It changes only dashboard code, dashboard-focused tests, and routed dashboard documentation unless implementation proves a missing server contract. No persistence, MCP, CLI, HTTP route, schema, or package-delivery migration is planned.

The product intent is a calm scientific observatory for a developer debugging agent memory: the person must locate a memory, understand why it is connected, traverse its neighborhood, and only then administer the engine. The design system therefore uses a graph-dominant composition, low-chroma graphite surfaces, ionized cyan focus, amber consolidated-memory emphasis, coral degraded states, border/surface-shift depth, 4px spacing increments, local Bahnschrift typography for interface text, and Cascadia Mono for identifiers/data. The signature interaction is the Memory Lens: node selection produces an activation pulse, emphasizes connected memories, records a focus trail, and opens contextual actions.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change is limited to the existing dashboard/HTTP consumer and registers, removes, or renames zero MCP tools.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Existing recall and visualization contracts remain intact; the plan makes degraded semantic/indexing state more visible and keeps graph/lexical functionality available independently.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The dashboard consumes existing host-neutral HTTP shapes and introduces no harness-specific schema, field, lifecycle, or storage semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Graph slice/expand caps and bounded instrument limits remain enforced; the plan adds no unbounded recall or record dump.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — MCP tools, HTTP routes, CLI commands, and observation taxonomy are unchanged; only internal dashboard composition and SPA navigation are redesigned.

## Design

### Architecture and state flow

1. `dashboard/src/App.tsx` becomes a thin route composer. `dashboard/src/components/AppShell.tsx` owns the collapsible observatory/control-room navigation, product identity, global health indicator, and responsive drawer. It does not own feature data.
2. `dashboard/src/router.tsx` exposes a normalized location containing pathname and search and emits one state update for `pushState`, `replaceState`, and `popstate`. `dashboard/src/routes.ts` defines `/` as the observatory, retains the HTTP-bridge-served `/console/operations`, `/console/traces`, and `/console/indexing` paths as Control Room routes, and may resolve `/console/graph` as an observatory alias; backend/API-looking paths continue to resolve as unknown.
3. `dashboard/src/components/observatory/ObservatoryWorkspace.tsx` becomes the single canonical graph coordinator. It owns scoped requests, context token, graph/frontier data, focus, selection, instruments, and abortable async state. The active monolithic `GraphWorkspace`/`MemoryUniverse` implementation is removed after its force-layout behavior is absorbed.
4. `dashboard/src/components/observatory/context-store.ts` remains the pure URL/state boundary and gains density, focus-trail, active-instrument, and invalid-focus recovery. Serialization contains only restorable identifiers/scope, never raw memory content or large viewport payloads. Browser history records semantic focus/scope transitions; continuous pan/zoom uses replace-state or local state to avoid history spam.
5. `dashboard/src/components/map/MapCanvas.tsx` owns one canvas, one seeded D3 force simulation, one zoom behavior, one `ResizeObserver`, and their cleanup. It exposes declarative command input/callbacks for fit, zoom, reset, pause, and focus rather than leaking D3 instances to parents.
6. `dashboard/src/components/map/map-projection.ts`, `map-renderer.ts`, and `map-state.ts` stay pure. Projection starts from API seeds and converges deterministically enough for stable refocus; renderer functions derive semantic glyph, line, focus, and reduced-motion states; state helpers deduplicate slices and protect private text.
7. `dashboard/src/components/map/map-navigation.ts` is a new pure adjacency/command module. It builds visible-neighbor order, resolves keyboard commands, and produces concise accessible node summaries. `dashboard/src/components/map/GraphNavigator.tsx` renders the synchronized DOM-backed search/neighbor list used by keyboard and assistive-technology users.
8. `dashboard/src/components/observatory/MemoryMapSurface.tsx` composes the graph canvas, scope/cue dock, semantic legend, focus-trail controls, viewport controls, frontier feedback, and mobile instrument triggers. `dashboard/src/components/observatory/MemoryLens.tsx` fetches enriched node/edge inspection and exposes supported expand/recall/timeline/ledger actions.
9. `dashboard/src/components/observatory/InstrumentDock.tsx` composes the existing `RecallWorkspace`, `TimelineSurface`, `KnowledgeLedgerSurface`, and `HealthIndexingSurface` as a fixed set of context-preserving instruments. Only these four fixed views may be retained; dynamic results and replaced graph datasets are released.
10. `dashboard/src/components/control-room/ControlRoomWorkspace.tsx` extracts operations, traces, indexing, observation creation, and rebuild flows from `App.tsx`. `dashboard/src/components/control-room/ConfirmCommandDialog.tsx` owns native-dialog confirmation, pending lock, bounded result summary, and trace follow-up for state-changing/expensive commands.
11. `dashboard/src/index.css` owns the shared nebula tokens and global defaults, then imports `styles/shell.css`, `styles/observatory.css`, and `styles/control-room.css`. The runtime uses no remote font or image. The generated concept remains an OpenSpec design artifact only.
12. Unmounted legacy dashboard components are removed only after import/reference proof. Reusable privacy-safe markdown remains if used by the new Memory Lens; duplicate graph components and App-local workspace implementations are deleted when their behavior is covered by the canonical modules and tests.

### Async and failure model

- Every scope/focus request gets an `AbortController`; a monotonic request key guards against clients that resolve after abort.
- Context resolution, graph/frontier, inspection, and each instrument have independent loading/error/degraded state so a failed secondary capability cannot blank the graph.
- Scope changes clear invalid focus and dynamic graph data, preserve valid global shell state, and replace stale continuation tokens.
- Expansion merges by stable node/edge ID and reports counts from the incoming frontier/slice before deduplication.
- Rebuild/create actions require confirmation, lock while pending, present bounded structured summaries, and link to trace identifiers when supplied.
- D3 simulation, zoom handlers, observers, timers, and event listeners are stopped/detached on dataset replacement and unmount.

### Visual and interaction system

- **Intent**: A developer diagnosing an agent's recall or forgetting must traverse evidence quickly; the interface should feel like a precise astronomical/neural instrument, contemplative but operational.
- **Palette**: `--nebula-void`, `--nebula-basin`, `--nebula-plate`, and `--starlight-*` establish graphite/ivory hierarchy; `--ion-focus` communicates active traversal; `--engram-amber` communicates consolidated/structural memory; `--degraded-coral` is reserved for degraded or failed state.
- **Depth**: Borders plus subtle same-hue surface shifts are the sole elevation strategy. Blur is limited to floating Lens/drawer surfaces over the canvas and has an opaque fallback.
- **Surfaces**: The rail shares the base canvas color; inset controls are darker; Lens/dialog/drawer surfaces step one lightness level upward; no generic card grid or large metric tiles.
- **Typography**: Locally available Bahnschrift provides engineered but humanist interface rhythm; Cascadia Mono aligns IDs, counts, relations, and health telemetry; fallbacks remain local.
- **Spacing**: 4px base scale with compact 8/12/16px component spacing and 24/32px structural spacing.
- **Motion**: One restrained activation pulse and short panel transitions; no perpetual decorative animation, bounce, or spring. Reduced motion freezes simulation after stable layout and removes the pulse while preserving focus outlines and line emphasis.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 / SC-001 | Route `/` to canonical observatory; resolve context then auto-load bounded frontier/slice; graph dominates desktop grid. | `App.tsx`, `routes.ts`, `ObservatoryWorkspace.tsx`, `MemoryMapSurface.tsx` | Routing/state tests plus 1440×900 browser screenshot and initial network-call observation. |
| FR-002 / SC-002 | Derive node glyph shape/ring/luminance and edge dash/width from semantic state; reserve color for meaning. | `map-renderer.ts`, `map-types.ts`, `index.css` | Pure visual-token tests for 5 node kinds and focus/neighbor/unrelated/degraded states; visual QA. |
| FR-003 / SC-003 | Route viewport commands through typed graph commands with pointer and keyboard triggers; selection is independent from viewport reset. | `MapCanvas.tsx`, `map-navigation.ts`, `MemoryMapSurface.tsx` | Pure command reducer tests plus keyboard browser QA. |
| FR-004 / SC-002 | Renderer computes selected, direct-neighbor, and unrelated emphasis and draws a bounded activation halo. | `map-renderer.ts`, `map-navigation.ts` | Renderer-state unit tests and reduced-motion screenshot comparison. |
| FR-005 / SC-004 | One scope/cue dock writes typed context state, removable tokens, and URL query parameters shared by instruments. | `context-store.ts`, `ObservatoryWorkspace.tsx`, `MemoryMapSurface.tsx` | Round-trip tests for all 8 dimensions and browser filter QA. |
| FR-006 / SC-004, SC-005 | Maintain semantic focus history and browser location state; use replace for continuous viewport metadata and push for focus/scope pivots. | `router.tsx`, `routes.ts`, `context-store.ts` | Parser/serializer and three-step popstate tests including invalid focus. |
| FR-007 / SC-006 | Reuse frontier/expand contracts; merge by ID and expose added/already-visible/continuation/exhausted result. | `ObservatoryWorkspace.tsx`, `map-state.ts`, `api/client.ts` | Existing merge tests extended with 3 repeated expansion fixtures and frontier HTTP tests. |
| FR-008 / SC-006 | Memory Lens requests inspect/ledger context on selection and presents sanitized connected evidence and supported pivots. | `MemoryLens.tsx`, `ObservatoryWorkspace.tsx`, `api/client.ts` | API-client path tests, failed-inspection state tests, and browser inspection QA. |
| FR-009 / SC-003, SC-007 | Define key map for fit, zoom, pause, clear, focus next/previous/neighbor, select, and expand; document it in the workspace. | `map-navigation.ts`, `MapCanvas.tsx`, `GraphNavigator.tsx` | Pure key-command coverage for every command plus keyboard-only browser walkthrough. |
| FR-010 / SC-007, SC-008 | Synchronize a DOM list of focused/visible neighbors with canvas selection; all items use native buttons/list semantics. | `GraphNavigator.tsx`, `map-navigation.ts` | Semantic source/unit checks and screen-reader/focus browser QA. |
| FR-011 / SC-008 | Use named controls, tight focus transitions, status-specific live regions, and non-noisy graph summaries. | `AppShell.tsx`, observatory components, control-room components | Accessibility browser inspection and focused source/state tests. |
| FR-012 / SC-008, SC-009 | Desktop observatory grid collapses to nav drawer, bottom instrument sheet, and full-width canvas; reduced-motion gates simulation/pulse. | `AppShell.tsx`, `MemoryMapSurface.tsx`, all style files | QA at 1440×900, 1024×768, 360×800 and reduced-motion emulation. |
| FR-013 / SC-010 | Keep recall/timeline/ledger/health under the graph coordinator and pass the same scope/context/focus. | `InstrumentDock.tsx`, `ObservatoryWorkspace.tsx`, existing instrument components | Four instrument context tests and pivot browser walkthrough. |
| FR-014 / SC-010, SC-011 | Retain only four fixed instrument states; dynamic graph/inspection requests and simulations are replaced and cleaned. | `InstrumentDock.tsx`, `ObservatoryWorkspace.tsx`, `MapCanvas.tsx` | Bounded state tests and browser listener/simulation lifecycle inspection. |
| FR-015 / SC-015 | Model graph and instrument capability states independently and surface explicit fallback/retry. | `ObservatoryWorkspace.tsx`, instrument components | Degraded/failed fixture tests and HTTP fallback coverage. |
| FR-016 / SC-012 | Present the existing served `/console/operations`, `/console/traces`, and `/console/indexing` paths as the secondary Control Room from one rail/drawer entry. | `routes.ts`, `AppShell.tsx`, `ControlRoomWorkspace.tsx` | Canonical reloadable-route tests and one-step navigation QA. |
| FR-017 / SC-012 | Extract and preserve current App-local admin flows with typed API calls. | `ControlRoomWorkspace.tsx`, control-room panels, `api/client.ts` | Existing API-client tests plus control-room source/behavior tests. |
| FR-018 / SC-013 | Wrap create/rebuild actions in native confirmation dialog and shared pending/result state. | `ConfirmCommandDialog.tsx`, `ControlRoomWorkspace.tsx` | Confirmation state-machine tests and duplicate-click browser QA. |
| FR-019 / SC-013 | Replace raw-payload-first output with bounded result summaries and trace links; keep expandable raw detail only where safe. | control-room panels, `SafeMarkdown.tsx` if reused | Result formatter tests and trace-link browser QA. |
| FR-020 / SC-014 | Apply `sanitizeMapText` or an equivalent centralized safe presentation adapter to every stored-text boundary. | `map-state.ts`, Memory Lens/instruments/control-room result components | Private-marker matrix tests across all presentation adapters. |
| FR-021 / SC-015 | Use explicit resource-state variants for initial/refresh/empty/sparse/dense/truncated/exhausted/degraded/error/retry. | `ObservatoryWorkspace.tsx`, `ControlRoomWorkspace.tsx`, shared state components | Nine fixture/state tests and browser empty/error QA. |
| FR-022 / SC-015 | Abort superseded requests and reject stale completions using request keys. | `ObservatoryWorkspace.tsx`, `MemoryLens.tsx`, `ControlRoomWorkspace.tsx` | Deferred-promise tests proving zero stale replacements. |
| FR-023 / SC-011, SC-015 | Preserve API caps, low-zoom edge thinning, deterministic projection, and complete resource cleanup. | `MapCanvas.tsx`, `map-state.ts`, `map-projection.ts`, `map-renderer.ts` | Existing projection/thinning/hit tests plus cleanup QA. |
| FR-024 / SC-016 | Use only local CSS, system fonts, current dependencies, and code-rendered canvas effects. | `dashboard/package.json`, `index.css`, `styles/*` | Dependency/diff review, dashboard typecheck, focused tests, root build. |

### Optional support artifacts

- `research.md`: Not needed; the bounded explorer findings and confirmed active/inactive paths are captured in this plan's technical context and requirement mapping.
- `data-model.md`: Not needed; no SQLite, API payload, or durable model change is planned. UI-only focus trail and resource state are defined in TypeScript modules and tests.
- `contracts/`: Not needed; existing HTTP/API client contracts are preserved and already covered by `tests/dashboard/api-client.test.ts` and `tests/http-viz.test.ts`.
- `quickstart.md`: Not needed; repository testing commands and browser QA expectations are already routed by `docs/agent/testing.md` and the task list will name exact checks.

## Risks and migrations

- **Canvas accessibility can regress while visuals improve**: Build the DOM-backed Graph Navigator and pure keyboard command model before visual renderer work. Pointer-only completion is not accepted. Roll back renderer changes independently while keeping semantic navigation.
- **Force layout can become unstable or expensive**: Seed from API coordinates, cap inputs, freeze after convergence, pause under reduced motion, thin edges at low zoom, and own exactly one simulation per active dataset. Roll back to deterministic refined projection if force convergence fails the lifecycle/performance checks.
- **URL/history can loop or grow excessively**: Centralize pathname/search updates in the router and context codec; push only semantic scope/focus changes and replace continuous viewport state. Parser/serializer/popstate tests gate integration.
- **Request races can show the wrong memory**: Pair abort signals with request keys and test late resolution explicitly. Each secondary instrument fails independently.
- **The visual concept contains unsupported product areas**: Implement only existing thoth-mem concepts—memory graph, recall, timeline, ledger, health, operations, traces, indexing, creation, rebuild. Agents, policies, integrations, and cloud indicators remain out of scope.
- **Monolith extraction can drop admin behavior**: Move one existing flow at a time with contract tests before deleting its App-local implementation. A temporary compilation-safe extraction is allowed within the branch; the final tree has one canonical implementation.
- **Graph-first route/default changes**: `/` becomes the observatory while the already served `/console/operations`, `/console/traces`, `/console/indexing`, and `/console/graph` fallback paths remain valid dashboard locations. Route tests must stay aligned with `src/http-server.ts`; rollback is a dashboard-only source revert and requires no data migration.
- **CSS rewrite can hide focus or overflow on small screens**: Tokens and layout primitives land before component polish; validate the three required viewports, focus-visible, native dialog/drawer behavior, and opaque fallbacks before visual acceptance.
- **No database or server migration**: Deployment remains the existing dashboard build served from `/`; rollback requires only restoring prior dashboard assets/source and rebuilding.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design maps all behavior to dashboard components and existing HTTP client calls; it contains zero MCP registration or surface changes.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — The graph keeps bounded deterministic seeds/projection and every semantic/indexing instrument has an explicit degraded/fallback state that does not block graph exploration.
- **P3 — Harness-Agnostic Memory Contract**: PASS — State additions are browser-local scope/focus/navigation concerns; persisted memory and HTTP payload semantics remain host-neutral and unchanged.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Graph slices, expansions, inspections, and instruments retain explicit limits, continuation, truncation, and bounded result presentation.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The design changes no MCP, HTTP, CLI, or taxonomy contract and explicitly isolates SPA route changes from backend routes.
