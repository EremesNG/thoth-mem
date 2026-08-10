# Implementation Plan: Guided Cosmos Dashboard Experience

## Technical context

The canonical `/` route is a React 19 observatory coordinated by `ObservatoryWorkspace.tsx`. `MapCanvas.tsx` currently combines Canvas2D drawing, D3 zoom, hit testing, viewport state, and lifecycle; graph data is bounded by existing visualization slice/frontier contracts. The scope dock currently renders unrestricted project, session, topic, and relation inputs even though `api.getVizFilters()` already provides canonical option metadata. Primary UI copy also exposes raw scope keys, relation tokens, node IDs, and capability language.

This change keeps HTTP, persistence, URL value, graph identity, instrument, and Control Room operation contracts stable. It adds the approved local MIT `@cosmos.gl/graph` dependency, replaces only the renderer internals, extracts guided selectors and presentation adapters, updates mounted browser coverage, and preserves privacy/accessibility fallbacks. The existing dirty worktree is the completed prior dashboard redesign and remains the baseline; this change owns only its newly recorded delta.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Work is confined to the dashboard package, existing HTTP reads, tests, documentation, and dependency metadata; no MCP registration changes.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Retrieval and graph data contracts remain unchanged, and renderer capability failure degrades to semantic navigation rather than affecting recall.
- **P3 — Harness-Agnostic Memory Contract**: PASS — No schema, sync, taxonomy, lifecycle, or host-specific field enters the memory contract; canonical HTTP values remain the renderer-independent identity.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Existing visualization and instrument caps remain unchanged; the renderer consumes only bounded slices/frontiers.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — HTTP routes, CLI/MCP names, URL canonical values, and observation taxonomy remain stable; only dashboard presentation and local dependency inventory change.

## Design

### Interaction and visual intent

Intent: an agent developer arrives while investigating what the memory system knows; they must find a memory trail quickly and should feel like they are activating a quiet living neural constellation, not operating a graph-debugging demo.

Palette: void blue-black for depth and a restrained cyan, violet, amber, coral, and mint community palette. Community—not internal node kind—is the primary color signal. Focus uses a white-blue nucleus and double halo; unrelated context drops to low opacity. Color always pairs with size, opacity, weight, label, or text.

Depth: dark surface-color shifts plus low-emphasis borders and bounded radial haze behind detected communities. The graph is the deepest visual field, circular nodes use restrained local auras, controls are compact floating groups, and Lens/technical disclosures sit above both.

Surfaces: `--void`, `--deep-field`, `--instrument-glass`, `--control-inset`, and `--lens-elevation` extend the existing token system without unrelated palette changes.

Typography: keep locally available interface typography, use readable human labels for primary flow, and reserve monospace/tabular treatment for explicitly revealed identifiers and diagnostics.

Spacing: preserve the existing 4px base grid, with 8/12px control internals, 16px component groups, and 24px major workspace separation.

Signature: the ArcRift-inspired interaction grammar is an organic community field: circular nodes grow with connectivity, curved directed relationships form readable trails, and focus produces one activation wave—bright neuron nucleus, connected links, neighboring neurons and their concise labels—while unrelated context fades but remains orienting. This is an original Thoth visual treatment, not a copy of ArcRift branding or layout.

### Architecture

1. Add `@cosmos.gl/graph@^3.4.0` to `dashboard/package.json` through pnpm workspace tooling and commit the resulting `pnpm-lock.yaml` delta. Assert MIT metadata and absence of `@cosmograph/react`.
2. Keep `MapCanvas.tsx` as the React/public seam but replace D3 zoom, Canvas2D draw, and hit-test ownership with an asynchronously loaded cosmos.gl adapter. This avoids propagating renderer types into `MemoryMapSurface` or `ObservatoryWorkspace`.
3. Add `cosmos-graph-data.ts` as a pure adapter from `VizNode[]`/`VizEdge[]` to stable point/link index maps and typed visual arrays. Compute degree-scaled radii and deterministic label-propagation communities, seed positions from the existing deterministic projection, and preserve node/edge IDs as product identity outside the renderer.
4. Add `cosmos-graph-runtime.ts` as the only lifecycle boundary around cosmos.gl initialization, data/config updates, viewport commands, point/link callbacks, pause/reduced-motion behavior, context failure, retry, and destruction. Dynamic import isolates the renderer chunk and lets the shell/fallback render before GPU readiness.
5. Model activation as a generation-guarded state transition: focus immediately outlines the selected point, then highlights its curved links/neighbors and publishes screen-positioned safe labels/auras for that local trail through a short GPU transition; a newer focus, reduced-motion switch, unmount, or dataset replacement cancels pending stages. Camera commands remain interruptible.
6. Retain `GraphNavigator.tsx` as the accessible functional graph. Synchronize its focus and neighbor order from the same node/edge maps; on renderer failure it becomes the primary operable graph representation rather than a hidden backup.
7. Add `GuidedSelect.tsx`, a closed searchable combobox whose editable query never commits an arbitrary canonical value. It owns label, trigger/query, listbox, active descendant, result state, keyboard navigation, dismissal, and narrow-screen behavior.
8. Extract `ObservatoryScopeBar.tsx` from `ObservatoryWorkspace`. Load `api.getVizFilters()` initially and on project changes with abort/generation guards; clear invalid session/topic/type/relation values before issuing the next graph scope. Use native selects for short type/density lists and `GuidedSelect` for project/session/topic/relation.
9. Add `dashboard-presentation.ts` for human labels and bounded explanations of node kind, observation type, relation, density, capability/resource state, and applied scope. Canonical values continue through context-store and API calls unchanged.
10. Update Memory Lens, observatory tabs/context summary, resource notices, filter tokens, and Control Room headings/actions to lead with user goals. Raw IDs/tokens/evidence move into native bounded `<details>` disclosures where retained.
11. Preserve the central safe-presentation boundary for every new label, option, tooltip, summary, and disclosure. No renderer/library string receives unsanitized stored content.
12. Update `docs/agent/dashboard.md` only for durable renderer/selector/lifecycle invariants after implementation evidence confirms exact ownership.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001, FR-010 | Map semantic node/link arrays into cosmos.gl GPU transitions and activation stages. | `dashboard/src/components/map/MapCanvas.tsx`, `cosmos-graph-data.ts`, `cosmos-graph-runtime.ts`, `dashboard/src/styles/observatory.css` | Mounted real-browser graph appearance/state and reduced-motion checks. |
| FR-002, FR-003 | Translate current viewport/focus commands into interruptible renderer camera/highlight updates. | `MapCanvas.tsx`, `cosmos-graph-runtime.ts`, `map-navigation.ts` | Public `MemoryMapSurface` toolbar, keyboard, point-selection, and expansion behavior. |
| FR-004, FR-005 | Load canonical filter metadata, render closed selectors, clear incompatible dependent scope, preserve URL/API values. | `ObservatoryScopeBar.tsx`, `GuidedSelect.tsx`, `ObservatoryWorkspace.tsx`, `api/client.ts`, `context-store.ts` | Mounted combobox selection → request query → URL/popstate → graph/instrument scope. |
| FR-006, FR-007, FR-015 | Centralize human labels, state explanations, controlled announcements, and technical disclosures. | `dashboard-presentation.ts`, `ResourceStateNotice.tsx`, `InstrumentDock.tsx`, Control Room components | Presentation unit seam plus mounted visible-copy/disclosure assertions. |
| FR-008 | Reorder Lens around title, kind, summary, provenance, relationships, and plain-language actions. | `MemoryLens.tsx`, `safe-presentation.ts` | Mounted node-kind Lens flows and disclosure/privacy checks. |
| FR-009 | Group Control Room capabilities by goal and demote raw evidence. | `control-room/ControlRoomWorkspace.tsx`, panels/dialog, control-room CSS | Mounted operations/traces/indexing navigation and command outcomes. |
| FR-011, FR-012 | Keep DOM graph navigation synchronized and make renderer failure recoverable. | `GraphNavigator.tsx`, `MemoryMapSurface.tsx`, `MapCanvas.tsx`, `ResourceStateNotice.tsx` | Keyboard/DOM parity plus real browser launched with WebGL disabled and Retry recovery seam. |
| FR-013 | Install only local MIT renderer dependency and prohibit external runtime requests. | `dashboard/package.json`, `pnpm-lock.yaml`, dynamic import boundary | Dependency/license inventory and browser network recording. |
| FR-014 | Centralize renderer resource ownership and generation guards. | `cosmos-graph-runtime.ts`, `MapCanvas.tsx` | Dataset replacement, retry, route/unmount, and fault tests assert one live runtime and zero late callbacks. |

### TDD seams

The agreed public seams are derived from the user's accepted behavior and will be exercised vertically:

1. `MapCanvas`/`MemoryMapSurface` observable DOM, renderer canvas, graph commands, selection callbacks, and capability recovery in a real browser.
2. `ObservatoryScopeBar`/`GuidedSelect` accessible combobox behavior and emitted canonical `ObservatoryScope`, never internal component state.
3. Observatory URL/request/instrument integration after guided selection and popstate.
4. Public presentation functions that convert canonical tokens into safe human labels.
5. Memory Lens and Control Room mounted user-facing headings, actions, and technical disclosure.
6. Package/lockfile license inventory and the production build/network surface.

Each vertical slice follows red → minimal green before the next behavior; helper-only or static-markup substitution does not satisfy mounted interaction criteria.

## Optional support artifacts

- `research.md`: required to resolve renderer capability, licensing, bundle, filter-contract, and browser-fallback decisions.
- `data-model.md`: not needed; no persisted or HTTP data shape changes.
- `contracts/`: not needed; existing HTTP and URL canonical-value contracts remain unchanged.
- `quickstart.md`: not needed; existing dashboard development and browser harness commands cover the change.

## Risks and migrations

- GPU/WebGL2 availability: initialization can fail on constrained devices. Mitigate with explicit capability state, semantic navigator continuity, Retry, and a real disabled-WebGL browser test. Rollback removes the adapter/dependency without data migration.
- Renderer API/version risk: pin the major-compatible `^3.4.0` range and lock exact transitive versions; isolate all library types behind two adapter files and compile against installed declarations.
- Bundle growth: load cosmos.gl through a local dynamic chunk, report resulting chunk sizes, and avoid importing Cosmograph analytics/DuckDB/UI packages.
- Animation overload: use one short activation sequence, interrupt on new intent, stop simulation with Pause, set zero transition duration for reduced motion, and never add decorative continuous particles.
- Combobox accessibility: implement the WAI-ARIA combobox/listbox keyboard contract at one reusable boundary and verify it in mounted Chrome plus semantic DOM assertions.
- Dependent-filter races: abort prior metadata requests, generation-guard completion, and atomically clear invalid dependent values before graph reload.
- Humanization ambiguity: preserve canonical value in title/technical disclosure when two labels collide, and keep presentation mapping separate from URL/API state.
- Existing dirty worktree: treat the archived prior dashboard implementation as baseline, inspect `git diff` before each owned edit, and avoid rewriting unrelated backend or integration files.
- No persistence or URL migration is required; existing canonical query parameter values continue to round-trip.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped design introduces no tool or server registry change; renderer and selectors stay inside the dashboard workspace.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — The design preserves deterministic bounded graph/retrieval inputs and supplies a semantic-navigation fallback when GPU presentation degrades.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Renderer indices and human labels are adapters over existing canonical identities; no browser, renderer, or host metadata enters persistence or HTTP contracts.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Existing slice/frontier and instrument limits remain authoritative, and no renderer path widens retrieval outputs.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — URL values, HTTP paths and payloads, MCP/CLI surfaces, observation types, and administrative semantics are unchanged; presentation changes are internal dashboard behavior.
