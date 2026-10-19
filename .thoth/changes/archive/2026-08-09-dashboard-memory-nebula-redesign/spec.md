# Feature Specification: Neural Observatory Dashboard

**Change ID**: `dashboard-memory-nebula-redesign`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: The dashboard no longer reflects the breadth of thoth-mem, and its active graph experience is separated from richer but unmounted observatory/map capabilities. The user needs one coherent command center where the memory graph is the primary way to find, understand, and administer agent memory.<br>
**Impact**: Replace the active console-first information architecture with a graph-first Neural Observatory; consolidate the current graph, map, and observatory implementations; make focus, expansion, filtering, history, and inspection first-class; preserve existing recall, trace, indexing, observation-creation, and rebuild operations as secondary instruments. The generated concept at `design/neural-observatory-concept.png` is a visual north star, not a runtime bitmap dependency.<br>
**Affected capabilities**: `dashboard`, `dashboard-memory-navigation`, `dashboard-control-room`, `dashboard-design-system`

## User stories

### US1 - Explore the memory nebula (Priority: P1)

As an agent developer investigating memory behavior, I can open the dashboard directly into a living memory graph so that I can understand the shape and active neighborhoods of stored knowledge before choosing a specific record.

**Independent test**: Open the dashboard with a populated store, verify that a graph slice loads without an extra command, then pan, zoom, fit, pause, and select a node while the semantic legend and density state remain understandable.

**Covers**: FR-001, FR-002, FR-003, FR-004, SC-001, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** a populated memory store, **When** the dashboard finishes resolving its initial scope, **Then** the memory graph is the dominant workspace and loads a bounded initial slice automatically.
2. **Given** a graph with multiple node kinds and communities, **When** it renders, **Then** kind, focus, relationship strength, and health are distinguishable without relying on color alone.
3. **Given** the graph is larger than the viewport, **When** the user pans, zooms, fits, pauses, or resumes it, **Then** the viewport changes predictably without losing the current focus.

### US2 - Follow a trail of related memories (Priority: P1)

As an investigator, I can search, focus, inspect, expand, and move backward or forward through memory neighborhoods so that exploration feels like traversing a connected brain rather than repeatedly rebuilding isolated slices.

**Independent test**: Search for a cue, focus one result, expand its neighborhood twice, use the focus trail backward and forward, refresh the page, and verify that the current scope and focus are restored without duplicate nodes.

**Covers**: FR-005, FR-006, FR-007, FR-008, SC-004, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** a project, session, topic, type, relation, or text cue, **When** the user applies it, **Then** the graph and supporting instruments resolve the same visible scope and display removable active filters.
2. **Given** a selected node, **When** the user opens its memory lens, **Then** enriched details and actions for expansion, recall, timeline, or ledger are available when the node supports them.
3. **Given** a sequence of focused nodes, **When** the user uses focus back/forward or browser back/forward, **Then** the prior scope, focused node, and usable viewport are restored.
4. **Given** an expanded neighborhood contains nodes already visible, **When** the result is merged, **Then** node and edge identity remains unique and the user sees what was added or exhausted.

### US3 - Navigate without pointer-only barriers (Priority: P1)

As a keyboard or assistive-technology user, I can reach every graph action and traverse the focused node's connections so that the visual metaphor does not make the memory system inaccessible.

**Independent test**: Complete search, focus, connected-memory traversal, expansion, fit, zoom, pause, and inspector actions using only the keyboard; verify focus order, announcements, semantic controls, and reduced-motion behavior.

**Covers**: FR-009, FR-010, FR-011, FR-012, SC-007, SC-008, SC-009

**Acceptance scenarios**:

1. **Given** the graph canvas has focus, **When** the user invokes documented keyboard controls, **Then** zoom, fit, pause/resume, focus movement, selection, and clearing have visible results and pointer-equivalent outcomes.
2. **Given** canvas content is not directly exposed as DOM nodes, **When** assistive technology reads the graph workspace, **Then** a synchronized semantic navigator exposes visible/focused memories and their connected neighbors as operable controls.
3. **Given** reduced motion is requested, **When** focus changes or panels open, **Then** semantic state changes remain visible without continuous simulation or nonessential animation.
4. **Given** a narrow viewport, **When** the user opens navigation or the memory lens, **Then** controls become an accessible drawer or sheet without creating horizontal page overflow.

### US4 - Use memory instruments in context (Priority: P2)

As an operator, I can pivot from the graph into recall, timeline, ledger, and health instruments without abandoning the selected memory context so that investigation stays coherent across representations.

**Independent test**: Select a memory node and open each available instrument; verify that every surface receives the same context token, scope, or focus identifier and that returning to the map preserves the graph state.

**Covers**: FR-013, FR-014, FR-015, SC-010, SC-011

**Acceptance scenarios**:

1. **Given** a focused node, **When** the user opens recall, timeline, ledger, or health, **Then** the instrument is scoped to the same context whenever its HTTP contract supports that scope.
2. **Given** no node is focused, **When** an instrument opens, **Then** it uses the active global scope and clearly identifies that no node-specific pivot is applied.
3. **Given** the user closes or switches an instrument, **When** the graph regains focus, **Then** its selected node and viewport remain usable.

### US5 - Administer the memory engine safely (Priority: P2)

As a thoth-mem maintainer, I can create observations, inspect operations and traces, review indexing health, and trigger rebuilds from a secondary control room so that administration remains complete without competing with exploration.

**Independent test**: Visit the control room and exercise the existing create-observation, operations catalog, trace filtering/detail, indexing status, graph rebuild, and index rebuild flows with visible pending, success, and failure states.

**Covers**: FR-016, FR-017, FR-018, FR-019, SC-012, SC-013

**Acceptance scenarios**:

1. **Given** the dashboard is in the observatory, **When** the user opens the control room, **Then** operations, traces, and indexing are clearly secondary but reachable in one navigation step.
2. **Given** a state-changing or expensive command, **When** the user initiates it, **Then** scope and impact are shown before confirmation and duplicate submission is prevented while it runs.
3. **Given** an operation succeeds or fails, **When** it completes, **Then** the result, traceability information, and a safe next action are visible without exposing private content.

### US6 - Trust the observatory under real data conditions (Priority: P1)

As a user exploring sensitive and potentially dense memory data, I can rely on private-content redaction, bounded rendering, and explicit loading/error/empty states so that the dashboard stays safe and understandable.

**Independent test**: Exercise empty, sparse, dense, continuation, stale-response, invalid-deep-link, private-tag, and API-failure fixtures and verify that every state resolves without stale data, leaked private text, or duplicate graph simulations.

**Covers**: FR-020, FR-021, FR-022, FR-023, FR-024, SC-014, SC-015, SC-016

**Acceptance scenarios**:

1. **Given** stored labels or snippets contain supported private markers, **When** they appear in graph, search, inspector, timeline, ledger, trace, or result surfaces, **Then** marked private content is absent from the rendered UI.
2. **Given** a request is superseded by a new scope, **When** the older request resolves later, **Then** it cannot replace the newer view.
3. **Given** an empty, sparse, dense, truncated, or exhausted graph response, **When** it renders, **Then** the dashboard presents a distinct state and an appropriate recovery or continuation action.
4. **Given** the user changes routes or graph datasets repeatedly, **When** prior views unmount or become inactive, **Then** obsolete simulations, observers, and listeners are stopped or detached.

## Edge cases

- The store contains no projects, observations, graph nodes, or semantic indexes.
- A deep link references a deleted, superseded, filtered-out, or malformed node ID.
- A selected node disappears after a scope/filter change.
- Expansion returns only already-visible nodes, an exhausted frontier, a continuation cursor, or overlapping edges.
- Inspection fails after graph selection succeeds.
- Scope requests resolve out of order or are aborted during route changes.
- Dense responses approach the existing node/edge caps and labels contain long unbroken text.
- The viewport is resized while the force layout, a drawer, or the memory lens is active.
- The user requests reduced motion, high zoom, keyboard-only navigation, or screen-reader navigation.
- Stored content contains `<private>...</private>` or `[private]...[/private]` markers.
- Rebuild or create-observation commands are clicked repeatedly or fail after partial server progress.
- A health/indexing capability is degraded or unavailable while graph browsing remains available.

## Functional requirements

- **FR-001 — Canonical graph home**: `[RENAMED dashboard FROM Dashboard V2 MUST Be Rebuilt as an Operator Console]` The dashboard MUST make the graph-first Neural Observatory the canonical initial workspace and MUST load a bounded initial graph slice after scope resolution without requiring a separate load button.
- **FR-002 — Semantic celestial encoding**: `[ADDED dashboard-design-system]` The graph MUST distinguish node kind, relationship strength, selection, neighborhood, truncation, and health using a combination of shape, luminance, line treatment, labels, and restrained semantic color rather than color alone.
- **FR-003 — Spatial viewport controls**: `[ADDED dashboard-memory-navigation]` The graph MUST support pointer and keyboard equivalents for pan, zoom, fit-to-visible, pause/resume, and reset while preserving current focus.
- **FR-004 — Memory activation focus**: `[ADDED dashboard-memory-navigation]` Selecting a memory MUST create a clearly visible activation state that emphasizes the node and its immediate relationships while de-emphasizing unrelated content without removing it.
- **FR-005 — Dashboard MUST Preserve Context Across Cross-Surface Pivots**: `[MODIFIED dashboard]` The dashboard MUST provide project, session, topic, type, relation, density, and text-cue controls whose applied state is visible, removable, and shared by graph and contextual instruments.
- **FR-006 — Focus trail and deep-link state**: `[ADDED dashboard-memory-navigation]` The dashboard MUST encode restorable scope and focused-node state in the URL and MUST provide focus back/forward semantics that cooperate with browser history and invalid-state recovery.
- **FR-007 — Depth and Neighbor Expansion MUST Represent Real Traversal Frontiers**: `[MODIFIED dashboard]` The dashboard MUST expand a focused node through existing bounded visualization/frontier contracts, deduplicate merged nodes and edges, preserve current selection, and report added, already-visible, truncated, continuation, or exhausted outcomes.
- **FR-008 — Enriched memory lens**: `[ADDED dashboard-memory-navigation]` The selected-node inspector MUST use the available inspection or observatory contracts to show sanitized identity, summary, provenance, connected memories, and supported pivots instead of relying only on the local graph slice.
- **FR-009 — Keyboard command parity**: `[ADDED dashboard-memory-navigation]` Every graph command and selected-node action MUST be operable by keyboard with documented bindings, visible focus, and no pointer-only prerequisite.
- **FR-010 — Semantic graph navigator**: `[ADDED dashboard-memory-navigation]` The dashboard MUST provide a DOM-backed, synchronized navigator for visible/focused nodes and connected memories so canvas content and traversal remain available to assistive technology.
- **FR-011 — Accessible state communication**: `[ADDED dashboard-design-system]` Loading, selection, expansion, continuation, errors, health, route changes, and command results MUST expose appropriate names, focus behavior, and live announcements without duplicating noisy updates.
- **FR-012 — Dashboard MUST Be Responsive and Visually Verified**: `[MODIFIED dashboard]` The observatory MUST adapt navigation, scope controls, instruments, and memory lens into usable drawers or sheets on narrow viewports and MUST honor `prefers-reduced-motion` without hiding state changes.
- **FR-013 — Dashboard MUST Provide a Connected Observatory Workspace**: `[MODIFIED dashboard]` Recall, timeline, ledger, and health MUST be presented as supporting instruments that inherit the current graph scope/focus when their existing contracts support it and preserve graph context when opened or closed.
- **FR-014 — Instrument state retention**: `[ADDED dashboard-memory-navigation]` Switching among the graph and its supporting instruments MUST retain their bounded local state without accumulating an unbounded cache of inactive views.
- **FR-015 — Honest capability states**: `[ADDED dashboard-control-room]` An unavailable or degraded instrument MUST identify its capability state and fallback independently without blocking supported graph navigation or other instruments.
- **FR-016 — Secondary control room**: `[ADDED dashboard-control-room]` Operations, traces, and indexing MUST move into a secondary control-room information architecture reachable in one navigation step from the observatory.
- **FR-017 — Dashboard MUST Reproduce CLI and HTTP Operations**: `[MODIFIED dashboard]` The redesigned control room MUST preserve create-observation, operation catalog/result, trace filtering/detail, indexing status, graph rebuild, and index rebuild behaviors supported by the current HTTP client.
- **FR-018 — Confirmed state-changing actions**: `[ADDED dashboard-control-room]` State-changing or expensive commands MUST show their effective scope and impact, require an explicit confirmation, prevent duplicate submission while pending, and present success or failure evidence.
- **FR-019 — Dashboard MUST Display MCP and HTTP Traces**: `[MODIFIED dashboard]` Administrative results MUST expose available trace or operation identifiers and a relevant follow-up action without rendering raw unbounded payloads as the primary presentation.
- **FR-020 — Private-content safety**: `[ADDED dashboard-design-system]` All user-visible stored text MUST pass the established private-marker sanitization boundary before rendering in graph, inspector, recall, timeline, ledger, trace, search, or administrative result surfaces.
- **FR-021 — Complete asynchronous states**: `[ADDED dashboard-design-system]` Every data surface MUST distinguish initial loading, refresh, empty, sparse, dense, truncated, exhausted, degraded, error, and retry states applicable to its contract.
- **FR-022 — Stale-response prevention**: `[INTERNAL]` Scope, focus, route, and refresh changes MUST abort or ignore superseded requests so older responses cannot overwrite the current view.
- **FR-023 — Bounded graph lifecycle**: `[INTERNAL]` The dashboard MUST enforce existing visualization caps, thin nonessential edges at low zoom or dense states, and clean up obsolete simulations, observers, timers, and event listeners.
- **FR-024 — Local-first visual delivery**: `[RENAMED dashboard FROM Dashboard MUST Remain Local-First, Privacy-Safe, and Read-Only]` The redesign MUST use locally packaged code and assets and MUST NOT add telemetry, remote fonts, CDN dependencies, or external transmission of stored memory content.

## Success criteria

- **SC-001** `[buildable]`: On a populated fixture, the initial dashboard reaches a rendered graph without a graph-specific load click and the graph canvas occupies at least 65% of the usable content width at a 1440×900 viewport.
- **SC-002** `[buildable]`: Automated UI-unit tests demonstrate semantic encodings for at least five node kinds plus distinct focused, neighboring, unrelated, and degraded states without color being the sole differentiator.
- **SC-003** `[buildable]`: Fit, zoom in/out, reset, pause/resume, and focus-clear commands have pointer and keyboard tests that preserve the selected node unless the explicit clear command is used.
- **SC-004** `[buildable]`: All eight scope dimensions—project, session, topic, type, relation, density, cue, and focused node—round-trip through URL serialization and parsing tests.
- **SC-005** `[buildable]`: Browser popstate tests restore at least three sequential focus/scope states and recover safely from an invalid node deep link.
- **SC-006** `[buildable]`: At least three repeated expansion fixtures prove node/edge deduplication, stable selection, and separate added/already-visible/continuation/exhausted feedback.
- **SC-007** `[buildable]`: A keyboard-only test reaches and activates every graph command, every selected-node action, and at least two connected-memory transitions without pointer input.
- **SC-008** `[buildable]`: Accessibility checks verify all five required facilities: semantic labels, focus-visible treatment, controlled live regions, a DOM-backed node navigator, and reduced-motion behavior.
- **SC-009** `[buildable]`: Browser QA at 1440×900, 1024×768, and 360×800 shows no horizontal page overflow and confirms usable navigation, graph, lens, and instrument layouts.
- **SC-010** `[buildable]`: 4 instrument integration tests—recall, timeline, ledger, and health—prove that supported context/focus identifiers are retained across switches and graph restoration.
- **SC-011** `[buildable]`: Inactive-view tests prove bounded retention: at most the four fixed observatory instruments remain cached, while replaced dynamic graph or admin views release owned resources.
- **SC-012** `[buildable]`: Existing create-observation, operations, traces, indexing, graph rebuild, and index rebuild client flows remain reachable through the control room and pass focused contract tests.
- **SC-013** `[buildable]`: All state-changing command tests require confirmation, block duplicate submission while pending, and display bounded success/failure evidence with available trace identifiers.
- **SC-014** `[buildable]`: Private-marker fixtures pass through every stored-text presentation adapter with neither supported private block syntax present in rendered output.
- **SC-015** `[buildable]`: Nine fixtures—empty, sparse, dense, truncated, exhausted, degraded, aborted, failed inspection, and retry—each render a distinct recoverable state with zero stale-data replacements.
- **SC-016** `[buildable]`: `pnpm run dashboard:typecheck`, focused dashboard/HTTP visualization tests, and `pnpm run build` pass; an independent Oracle verification confirms the implemented behavior and visual QA evidence.

## Assumptions

- The current visualization and observatory HTTP contracts provide enough data for the redesign; new server endpoints are not required unless implementation proves a specific gap.
- The canonical experience will consolidate reusable projection, sanitization, inspection, frontier, pivot, and context-store logic rather than preserve three parallel graph implementations.
- Canvas 2D with the existing D3 packages remains the primary dense renderer; semantic DOM companions provide accessibility instead of mirroring every visual node as positioned DOM.
- The generated Neural Observatory concept guides hierarchy, density, and interaction language, but labels and administrative areas that are not supported by thoth-mem will not be implemented.
- The dashboard targets modern evergreen browsers and will progressively enhance newly available web features while preserving functional fallbacks.

## Dependencies

- Existing React 19, Motion, Lucide, D3 force/zoom/quadtree/selection, Vite, and TypeScript dashboard stack.
- Existing typed client contracts in `dashboard/src/api/client.ts` and their HTTP server implementations.
- Existing private-text sanitization, map projection/state helpers, observatory context/pivot logic, and dashboard visualization tests.

## Out of scope

- SQLite schema, retrieval ranking, embedding, knowledge-graph generation, MCP tool, or HTTP API redesign unless an implementation-blocking dashboard contract gap is separately approved.
- WebGL, 3D navigation, game-like free-flight controls, or an unbounded whole-database visualization.
- New Agents, Policies, Integrations, multi-user, authentication, collaboration, or cloud-management products suggested only by the concept image.
- Remote telemetry, analytics, fonts, imagery, or CDN-hosted runtime dependencies.
- A light theme or a general-purpose theming framework.
- Backward compatibility for the current visual layout, component structure, or console route naming.
