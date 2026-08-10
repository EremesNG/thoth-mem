# Feature Specification: Guided Cosmos Dashboard Experience

**Change ID**: `dashboard-guided-cosmos-experience`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The graph is functionally capable but visually unconvincing, structured filters still invite typing errors, and prominent labels expose implementation language instead of helping a person understand and explore agent memory.<br>
**Impact**: Replace the current graph presentation with a fluid GPU-accelerated memory constellation, turn structured scope fields into guided searchable selectors, simplify primary terminology and feedback, and move technical identifiers or diagnostics behind deliberate disclosure while preserving graph state, accessibility, privacy, and administration.<br>
**Affected capabilities**: `dashboard`, `dashboard-memory-navigation`, `dashboard-design-system`, `dashboard-control-room`

## User stories

### US1 - Explore a living memory constellation (Priority: P1)

As an agent developer investigating memory, I can move through an expressive animated constellation so that relationships, communities, and activated memories feel understandable rather than like a raw technical plot.

**Independent test**: Open a populated store, focus and expand multiple memories, move the camera through the resulting neighborhoods, pause motion, and verify that spatial state and selected memory remain coherent throughout.

**Covers**: FR-001, FR-002, FR-003, FR-010, FR-014, SC-001, SC-002, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** a populated graph, **When** the observatory loads, **Then** memories appear as an organic field of circular neuron-like nodes whose size communicates connectivity, whose color communicates community, and whose curved directed links expose relationships without a manual load step.
2. **Given** a visible memory, **When** the user focuses it, **Then** the camera travels toward it, the selected neuron and its neighborhood become vivid, concise names appear for that local trail, and unrelated context remains present but strongly subdued.
3. **Given** an expanded neighborhood, **When** new nodes and links arrive, **Then** they enter through a purposeful transition instead of abruptly replacing the current constellation.
4. **Given** motion is paused or reduced motion is requested, **When** graph state changes, **Then** every semantic result remains visible without continuous or nonessential animation.

### US2 - Refine the graph without invalid filters (Priority: P1)

As a user narrowing memory scope, I can choose known projects, sessions, topics, types, and relations from searchable guided controls so that typing mistakes cannot silently produce an empty or misleading graph.

**Independent test**: Select a project, session, topic, type, relation, density, and search cue; verify dependent options, URL restoration, removable tokens, and that no structured field accepts a value absent from the available filter metadata.

**Covers**: FR-004, FR-005, FR-006, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** visualization filter metadata is available, **When** the scope bar renders, **Then** project, session, topic, type, relation, and density use closed or searchable selection controls and only the semantic search cue remains free text.
2. **Given** a project selection changes the valid session, topic, type, or relation option set, **When** dependent metadata resolves, **Then** invalid dependent selections clear visibly and the user is offered only compatible choices.
3. **Given** the user chooses or removes a filter, **When** the graph and an instrument update, **Then** both receive the same normalized scope and browser history can restore it.
4. **Given** filter metadata is loading, empty, or unavailable, **When** the user opens a selector, **Then** the control communicates that state without falling back to unrestricted text entry.

### US3 - Understand memory without implementation jargon (Priority: P1)

As a person exploring agent memory, I can understand controls, states, and selected memories in product language so that I do not need to know node IDs, API concepts, or internal relation tokens to make progress.

**Independent test**: Traverse the default observatory, Memory Lens, instruments, filters, empty/error states, and Control Room; verify that primary labels explain user intent while raw identifiers and diagnostic payloads appear only after an explicit technical-details action.

**Covers**: FR-007, FR-008, FR-009, FR-015, SC-008, SC-009

**Acceptance scenarios**:

1. **Given** a node, relation, density mode, or capability has an internal identifier, **When** it appears in the primary interface, **Then** the user sees a concise human-readable label and supporting explanation instead of the raw token alone.
2. **Given** technical evidence is useful for debugging, **When** the user requests technical details, **Then** identifiers, trace evidence, and bounded diagnostics become available without taking over the main workflow.
3. **Given** the graph is empty, loading, degraded, or failed, **When** the state is presented, **Then** the message explains what happened and offers one relevant next action in plain language.
4. **Given** the user enters the Control Room, **When** administrative actions are shown, **Then** they are grouped by user goal and explain impact before exposing operation-level detail.

### US4 - Retain a usable observatory across devices and renderer failures (Priority: P1)

As a keyboard, assistive-technology, mobile, or constrained-device user, I can continue exploring memory even when rich GPU rendering or motion is unavailable so that the visual upgrade never removes access to the underlying graph.

**Independent test**: Exercise every graph action through keyboard and the semantic navigator, emulate reduced motion and a renderer initialization failure, and verify desktop, tablet, and mobile layouts without lost focus, leaked content, or external requests.

**Covers**: FR-011, FR-012, FR-013, SC-010, SC-011, SC-012, SC-013, SC-014

**Acceptance scenarios**:

1. **Given** the rich canvas is active, **When** focus, hover, selection, expansion, or filtering changes it, **Then** the DOM-backed graph navigator exposes the same visible and selected memory state.
2. **Given** the GPU renderer cannot initialize or loses its context, **When** the failure is detected, **Then** the observatory presents a bounded recovery action and the semantic navigator remains usable.
3. **Given** a narrow viewport or 200% text zoom, **When** selectors, Memory Lens, or instruments open, **Then** the graph remains reachable and the page does not overflow horizontally.
4. **Given** stored content contains supported private markers, **When** any new label, tooltip, selector, or technical disclosure renders it, **Then** private content remains absent.

## Edge cases

- The browser supports WebGL2 but renderer initialization or context restoration fails.
- The graph response is empty, sparse, dense, truncated, or updated while an animation is active.
- Focused data disappears during a dependent filter change or browser-history restoration.
- Filter metadata contains zero options, duplicate values, long labels, or a previously valid value that is no longer available.
- Project changes while session/topic metadata from the previous project is still in flight.
- A selector is used entirely with keyboard or assistive technology on a narrow viewport.
- Reduced motion changes while the dashboard is already mounted.
- Labels, tooltips, options, or diagnostic details contain private markers or long unbroken identifiers.
- The GPU renderer unmounts while requests, transitions, observers, or event callbacks are active.
- The selected graph node is not an observation and has no remote inspection contract.

## Functional requirements

- **FR-001 — Semantic celestial encoding**: `[MODIFIED dashboard-design-system]` The graph MUST present memories as circular neuron-like nodes with degree-scaled size, deterministic community color, curved directed relationships, selected/neighbor halos, and locally rendered motion. It MUST NOT encode primary node kinds as tiny geometric glyphs that require a legend to identify.
- **FR-002 — Spatial viewport controls**: `[MODIFIED dashboard-memory-navigation]` Graph pan, zoom, fit, reset, focus, and expansion MUST use smooth interruptible camera and position transitions while preserving the selected memory and all pointer/keyboard command semantics.
- **FR-003 — Memory activation focus**: `[MODIFIED dashboard-memory-navigation]` Focusing a memory MUST produce a bounded activation treatment that reveals connected memories and relationships in sequence, shows concise safe labels for the focused local trail, and strongly dims rather than removes unrelated graph context.
- **FR-004 — Guided scope selectors**: `[ADDED dashboard-memory-navigation]` Project, session, topic, type, relation, and density MUST use closed or searchable selection controls populated from available visualization metadata, and MUST NOT accept arbitrary values absent from that metadata.
- **FR-005 — Dashboard MUST Preserve Context Across Cross-Surface Pivots**: `[MODIFIED dashboard]` Guided selector changes MUST normalize one shared scope for graph, Lens, supporting instruments, URL state, and browser history, including visible recovery when dependent selections become invalid.
- **FR-006 — Human-readable filter semantics**: `[ADDED dashboard-design-system]` Structured filters, relation tokens, density modes, applied tokens, loading states, and empty metadata states MUST use concise user-facing names and explanations while preserving canonical values internally.
- **FR-007 — Progressive technical disclosure**: `[ADDED dashboard-design-system]` The primary observatory MUST prioritize user goals, summaries, and next actions, while raw node IDs, context tokens, trace identifiers, payload evidence, and diagnostic detail MUST appear only in bounded explicitly requested technical disclosures unless required for disambiguation.
- **FR-008 — Enriched memory lens**: `[MODIFIED dashboard-memory-navigation]` Memory Lens MUST lead with a human-readable title, memory kind, summary, provenance, relationships, and clear exploration actions, and MUST place raw identifiers or unsupported pivots outside the primary reading flow.
- **FR-009 — Secondary control room**: `[MODIFIED dashboard-control-room]` The Control Room MUST group administrative capabilities by user goal, explain scope and impact in plain language, and keep operation identifiers or raw evidence subordinate to safe primary outcomes.
- **FR-010 — Purposeful graph motion**: `[ADDED dashboard-design-system]` Graph motion MUST communicate loading, focus, expansion, and camera changes through short interruptible transitions, MUST provide pause, and MUST remove nonessential animation when reduced motion is requested.
- **FR-011 — Semantic graph navigator**: `[MODIFIED dashboard-memory-navigation]` The DOM-backed graph navigator MUST remain synchronized with rich renderer visibility, focus, selection, and connected-neighbor order and MUST provide equivalent activation actions.
- **FR-012 — Renderer capability recovery**: `[ADDED dashboard-memory-navigation]` If rich graph rendering is unavailable, the dashboard MUST keep scope controls and semantic navigation operable, identify the capability failure, and provide a bounded retry without crashing or discarding current context.
- **FR-013 — Local-first visual delivery**: `[MODIFIED dashboard]` The renderer, selectors, labels, fonts, and animations MUST be packaged locally under dependencies compatible with the repository license and MUST NOT transmit graph or filter data to external services.
- **FR-014 — Bounded renderer lifecycle**: `[INTERNAL]` Dataset replacement, route change, unmount, renderer failure, or retry MUST release GPU, observer, timer, listener, and animation resources and MUST ignore superseded callbacks.
- **FR-015 — Accessible state communication**: `[MODIFIED dashboard-design-system]` Selector results, graph activation, renderer capability, empty/error recovery, and administrative outcomes MUST expose concise visible status and controlled accessible announcements without duplicating high-frequency animation updates.

## Success criteria

- **SC-001** `[buildable]`: A populated mounted browser fixture renders the graph through the approved GPU renderer as circular degree-scaled neurons, reports at least one deterministic community, uses curved directed links, and preserves the existing bounded node/edge payload without a graph-load action.
- **SC-002** `[buildable]`: Mounted interaction tests demonstrate all 3 purposeful transitions—initial settle, focus/camera activation, and incremental expansion entry—and every transition remains interruptible by a subsequent graph action.
- **SC-003** `[buildable]`: Pause stops continuous simulation while preserving graph interaction, and reduced-motion browser QA passes the same focus/expansion outcomes with zero nonessential transitions.
- **SC-004** `[buildable]`: Fit, reset, zoom, pan, focus, clear, expand, and at least two connected-memory transitions pass through pointer and keyboard seams after renderer migration.
- **SC-005** `[buildable]`: All 6 structured filters—project, session, topic, type, relation, and density—render as closed or searchable selectors, and an automated DOM assertion finds zero unrestricted text fields besides the semantic search cue.
- **SC-006** `[buildable]`: Filter integration tests pass all 7 required behaviors: available-option loading, searchable selection, project-dependent session/topic refresh, invalid-dependent-value clearing, empty metadata, failure, and retry.
- **SC-007** `[buildable]`: All structured selections and removals round-trip through URL/popstate and restore the same graph/instrument scope using canonical values.
- **SC-008** `[buildable]`: A presentation-boundary test covers all 6 primary surfaces—graph, selector, Lens, instrument, state notice, and Control Room—and finds zero unexplained raw density/relation/state tokens or node IDs outside explicit technical disclosure.
- **SC-009** `[buildable]`: Memory Lens and Control Room mounted tests verify goal-oriented headings, exactly 1 clear primary next action per state, and bounded technical detail disclosure.
- **SC-010** `[buildable]`: The semantic graph navigator preserves the focused node and connected-neighbor order of the GPU graph across all 4 transitions: focus, expansion, filtering, and browser-history restoration.
- **SC-011** `[buildable]`: A forced renderer-initialization failure leaves all guided filters and semantic navigation usable, exposes exactly 1 Retry action, and successfully remounts with zero duplicated listeners or graph instances.
- **SC-012** `[buildable]`: Browser QA at 1440×900, 1024×768, and 360×800 plus 200% text zoom shows no horizontal page overflow and retains usable selectors, graph, Lens, instruments, and Control Room navigation.
- **SC-013** `[buildable]`: Private-marker fixtures produce zero leaks across point labels, tooltips, selector options, summaries, and technical disclosures; network inspection records zero non-local runtime requests.
- **SC-014** `[buildable]`: Dashboard typecheck, focused dashboard tests, HTTP visualization tests, production build, dependency/license inventory, and independent Oracle visual/behavior verification pass.

## Assumptions

- Existing `/viz/filters` metadata is sufficient to populate project, session, topic, type, and relation selectors without a server-contract change.
- The current bounded graph slice/frontier contracts remain the source of graph data and identity; renderer migration does not change persistence or HTTP semantics.
- The semantic text query remains intentionally free-form because it expresses recall intent rather than selecting a stored categorical value.
- A local MIT-licensed GPU graph engine can deliver the approved Cosmograph-style interaction while preserving thoth-mem's downstream licensing freedom.
- Modern evergreen browsers are the rich-renderer target; semantic navigation is the functional recovery path for capability failure.

## Dependencies

- Existing visualization slice, frontier, inspection, filter-metadata, observatory, and Control Room HTTP contracts.
- Existing React, Motion, Lucide, Vite, safe-presentation, URL context, keyboard navigation, and real-browser test harness.
- One approved local MIT-licensed GPU force-graph dependency; no Cosmograph React CC-BY-NC package.

## Out of scope

- Changes to SQLite, graph extraction, retrieval ranking, HTTP routes, OpenAPI, MCP tools, or persisted memory identity.
- Cosmograph web application, hosted analytics, DuckDB-based dashboard analytics, cloud sharing, collaboration, or remote AI features.
- 3D free-flight navigation, decorative particle fields unrelated to graph state, continuous cinematic motion, or unbounded whole-database rendering.
- Arbitrary user-authored project, session, topic, type, or relation values from dashboard filter controls.
- Replacing the existing Control Room capability inventory or changing administrative mutation semantics.
