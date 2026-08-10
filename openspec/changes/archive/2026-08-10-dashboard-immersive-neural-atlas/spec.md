# Feature Specification: Immersive Neural Atlas

**Change ID**: `dashboard-immersive-neural-atlas`<br>
**Route**: Full<br>
**Status**: Draft

**Approved visual target**: [Neural Atlas concept](design/neural-atlas-concept.png)

## Intent and scope

**Why**: The current Observatory renders a dense memory graph as oversized bubbles inside a bounded, nearly square card. Its faint relationships, short-lived motion, fixed inspector column, page-level Lens, distant instrument tabs, and document scrolling make the graph difficult to read and frustrating to navigate. The dashboard needs to feel like exploring a living brain rather than operating a technical report.<br>
**Impact**: The default dashboard becomes an immersive, viewport-based Neural Atlas. The graph owns the available workspace, preserves an unconstrained world geometry, renders memories at star scale with legible synapses and purposeful motion, and keeps inspection, instruments, filters, and controls within the same spatial context. Renderer, layout, and frontend dependencies may be expanded, reduced, or replaced when that materially improves the approved result. Existing visualization/observatory APIs, canonical filter values, URL/history behavior, privacy boundaries, local-only delivery, keyboard commands, and semantic fallback remain compatible.<br>
**Affected capabilities**: `dashboard`, `dashboard-memory-navigation`, `dashboard-design-system`

## User stories

### US1 - See the whole living memory field (Priority: P1)

As a user exploring agent memory, I can see an expansive, naturally shaped constellation in one workspace so that I understand its communities and connections without a bubble chart being squeezed into a square card.

**Independent test**: Mount a dense synthetic graph at 1440×900, 1024×768, and an intentionally wide world extent; verify the atlas fills the usable viewport, preserves the graph's spatial aspect, fits every node on request, and renders a dense star field with visible connections.

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-005, SC-001, SC-002, SC-003, SC-004, SC-017

**Acceptance scenarios**:

1. **Given** a populated memory store, **When** the default dashboard opens, **Then** the Neural Atlas occupies the remaining application width and height instead of appearing inside a bounded two-column card.
2. **Given** a graph whose natural world extent is wide, tall, or irregular, **When** it is laid out and fitted, **Then** its geometry keeps that aspect and the camera/canvas adapts to show it without normalizing the constellation into a square.
3. **Given** a dense graph, **When** it settles at the whole-graph view, **Then** normal memories read as small stars, hubs remain bounded, and no core node dominates the field as a giant bubble.
4. **Given** relationships of different classes, **When** the graph is at rest, **Then** curved synapses remain visibly traceable and focused relationships become substantially brighter without removing the surrounding graph.

### US2 - Navigate without losing the atlas (Priority: P1)

As a user following memory connections, I can pan, zoom, fit, focus, pause, reset, and expand from controls that remain in reach so that exploration never requires hunting through the page.

**Independent test**: Drive the mounted atlas through pointer and keyboard commands, measure control and canvas rectangles before and after camera changes, and sample renderer positions in running, paused, and reduced-motion states.

**Covers**: FR-006, FR-007, FR-008, FR-015, SC-005, SC-006, SC-007, SC-012

**Acceptance scenarios**:

1. **Given** normal motion preferences, **When** the graph finishes its initial entrance, **Then** it retains subtle bounded ambient motion and visibly reheats when new memories are revealed.
2. **Given** the user pauses motion or requests reduced motion, **When** data, focus, or camera state changes, **Then** the semantic result remains visible without continuous drift or nonessential animation.
3. **Given** any supported desktop or mobile viewport, **When** the user is viewing any part of the graph, **Then** one compact set of fit, zoom, pause, and reset controls remains visible inside the atlas.
4. **Given** a selected memory with unseen neighbors, **When** the user reveals connections, **Then** new nodes enter around their real frontier, the camera remains usable, and existing nodes are not abruptly replaced.

### US3 - Inspect a memory in place (Priority: P1)

As a user selecting a memory, I can understand it in a docked inspector without a modal or page jump so that the graph remains my spatial anchor.

**Independent test**: Select observations and non-observation nodes at a nonzero document scroll/camera position, verify document scroll and graph viewport remain stable, and exercise the inspector's close, relationship, and pivot actions.

**Covers**: FR-009, FR-010, FR-014, SC-008, SC-009, SC-010

**Acceptance scenarios**:

1. **Given** a visible memory, **When** it is selected, **Then** a non-modal inspector opens inside the atlas boundary and the graph remains visible behind or beside the bounded overlay.
2. **Given** the page or graph is not at its initial position, **When** selection opens or updates the inspector, **Then** document scroll does not jump and autofocus does not move the user to the top of the page.
3. **Given** an open inspector, **When** another node is focused through pointer, keyboard, history, or a connected-memory action, **Then** URL, graph highlight, semantic navigator, inspector, and focus trail describe the same node.
4. **Given** the inspector opens or closes on desktop, **When** its visibility changes, **Then** it does not permanently remove a fixed column from the graph or force the world into a different aspect ratio.

### US4 - Use instruments where their controls live (Priority: P1)

As a user investigating a memory, I can switch Related, Story, Changes, and Health within the same dock that shows their content so that a tab never controls content below the fold.

**Independent test**: Focus a memory, switch every instrument at desktop and mobile sizes, and verify the active tab and its content share one visible bounded region while graph focus and camera state persist.

**Covers**: FR-011, FR-012, SC-011, SC-012

**Acceptance scenarios**:

1. **Given** an atlas with no instrument open, **When** the user opens Related, Story, Changes, or Health, **Then** the instrument tabs appear immediately adjacent to the active content in the inspector dock or mobile sheet.
2. **Given** an instrument with long content, **When** the user scrolls it and switches tabs, **Then** the tab strip stays reachable inside that bounded surface without document-level scrolling.
3. **Given** a focused memory and camera position, **When** the user switches or closes instruments, **Then** graph focus, camera, scope, and URL remain usable.

### US5 - Shape the view without shrinking it (Priority: P2)

As a user narrowing memory, I can search and apply guided filters from a compact overlay so that filtering does not consume the vertical space needed for the graph.

**Independent test**: Open, search, apply, clear, and collapse guided filters; verify canonical URL/API values and dependent option recovery while the atlas retains its dominant viewport.

**Covers**: FR-013, FR-014, FR-015, SC-013, SC-014

**Acceptance scenarios**:

1. **Given** filter metadata is ready, **When** the user opens the filter control, **Then** the shared Project, Session, Topic, Connection, Memory type, and Field of view selectors appear in a bounded overlay attached to the atlas.
2. **Given** filters are collapsed, **When** the user explores the graph, **Then** only concise active-scope cues remain and the full filter form does not reserve permanent graph height.
3. **Given** a filter, focus, or frontier change, **When** browser Back or Forward is used, **Then** canonical scope, focused node, dock context, and a usable graph viewport are restored.

### US6 - Retain trust and access under real conditions (Priority: P1)

As a user on different devices or assistive technology, I can still explore memory safely when WebGL, motion, space, or data quality is constrained.

**Independent test**: Run the mounted browser suite at 1440×900, 1024×768, 360×800, 200% scale, coarse pointer, reduced motion, and forced WebGL failure with private-marked dense fixtures and superseded requests.

**Covers**: FR-016, FR-017, FR-018, FR-019, SC-015, SC-016

**Acceptance scenarios**:

1. **Given** a narrow viewport, **When** the inspector, instruments, or filters open, **Then** they become accessible sheets/drawers without horizontal overflow and without making the graph unreachable.
2. **Given** WebGL initialization or context recovery fails, **When** the rich renderer is unavailable, **Then** the synchronized semantic navigator, current scope, focused memory, and one bounded Retry action remain usable.
3. **Given** stored labels, snippets, provenance, or instrument results contain supported private markers, **When** any atlas surface renders them, **Then** marked content is absent from the DOM, canvas-adjacent labels, history, and external network traffic.
4. **Given** rapid scope, focus, expansion, route, resize, or renderer changes, **When** old asynchronous work completes, **Then** stale responses, timers, simulations, observers, and listeners cannot replace or mutate the active atlas.

## Edge cases

- Empty, single-node, sparse, disconnected, dense, truncated, exhausted, and degraded graph responses.
- Extremely wide, tall, or multi-community world extents and resize from wide desktop to portrait mobile after manual zoom.
- Opening and closing the inspector while focused near the right edge of the world.
- Very long sanitized labels, missing summaries, non-observation nodes, and unsupported pivots.
- WebGL2 unavailable, context lost during motion, renderer retry, and repeated mount/unmount cycles.
- Pause toggled during initial settle, focus travel, or frontier expansion.
- Reduced motion, 200% text zoom, coarse pointer, keyboard-only navigation, and short-height viewports.
- Rapid browser history, filter, focus, and instrument changes with out-of-order HTTP responses.
- Instrument error/retry and long instrument content while the graph remains mounted.

## Functional requirements

- **FR-001 — Dominant atlas workspace**: `[ADDED dashboard]` The default dashboard MUST present the Neural Atlas as a single dominant workspace that fills the usable application viewport and keeps primary graph controls reachable without document-level scrolling.
- **FR-002 — World-first graph geometry**: `[ADDED dashboard-memory-navigation]` The graph MUST compute and retain spatial positions in a world coordinate space that is not constrained to the canvas rectangle, and fitting MUST adapt the camera/canvas to the resulting extent rather than reshape the constellation to a square.
- **FR-003 — Aspect-preserving fit and resize**: `[ADDED dashboard-memory-navigation]` Initial fit, explicit fit, viewport resize, and drawer/sheet transitions MUST keep every included node reachable, preserve world aspect and focus, and avoid involuntary refits after ordinary manual pan or zoom.
- **FR-004 — Star-scale memory hierarchy**: `[ADDED dashboard-design-system]` Memory cores MUST use a tightly bounded star-like size scale in which connectivity remains perceivable without allowing hubs, focus, or neighbor states to become bubble-sized; focus MUST rely primarily on halo, contrast, and local labels.
- **FR-005 — Legible synaptic relationships**: `[ADDED dashboard-design-system]` Curved links MUST remain visible at rest against the atlas background, communicate relationship emphasis without color alone, brighten clearly for focus/hover, and retain subdued but perceptible unrelated context.
- **FR-006 — Living but bounded motion**: `[ADDED dashboard-memory-navigation]` Normal mode MUST provide subtle continuous ambient motion plus interruptible settle, focus, camera, and expansion transitions; Pause and reduced motion MUST stop nonessential movement while preserving every state result.
- **FR-007 — Persistent atlas controls**: `[ADDED dashboard-memory-navigation]` Fit, zoom, pause/resume, reset, focus traversal, selection, expansion, and clear actions MUST remain operable and visibly reachable within the atlas at supported viewport sizes.
- **FR-008 — Stable spatial interaction**: `[ADDED dashboard-memory-navigation]` Pointer and keyboard pan, zoom, focus, drag, and traversal MUST preserve selection and camera continuity, use the current world projection, and never require a pointer-only prerequisite.
- **FR-009 — In-place non-modal inspector**: `[ADDED dashboard-memory-navigation]` Selecting a memory MUST open a bounded non-modal inspector inside the atlas context, keep the graph visible, and provide human-readable summary, provenance, relationships, and supported exploration actions.
- **FR-010 — Scroll and focus stability**: `[ADDED dashboard-memory-navigation]` Opening, updating, or closing selection details MUST NOT change document scroll position, unexpectedly steal keyboard focus, or move the user to the top of the page.
- **FR-011 — Co-located instrument dock**: `[ADDED dashboard]` Related, Story, Changes, and Health navigation MUST live inside the same bounded dock/sheet as its active content, with its navigation remaining reachable while that content scrolls.
- **FR-012 — Shared graph and instrument context**: `[ADDED dashboard]` Instrument open, close, switch, retry, and pivot actions MUST inherit compatible graph scope/focus and MUST preserve the selected node, camera, semantic navigator, and graph availability.
- **FR-013 — Compact guided scope overlay**: `[ADDED dashboard]` Search and the six structured guided selectors MUST be available from compact atlas controls that can collapse without reserving permanent graph height, while active scope remains visible and removable.
- **FR-014 — Restorable atlas state**: `[ADDED dashboard-memory-navigation]` Canonical scope, focused node, focus trail, active instrument, dock state where appropriate, and usable viewport MUST remain synchronized through pointer/keyboard pivots, deep links, and browser history recovery.
- **FR-015 — Spatial frontier expansion**: `[ADDED dashboard-memory-navigation]` Bounded neighbor expansion MUST deduplicate existing graph identity, introduce added nodes near the actual focused frontier through purposeful motion, and report added, already-visible, truncated, continuation, or exhausted outcomes.
- **FR-016 — Responsive atlas surfaces**: `[ADDED dashboard-design-system]` Desktop MUST use bounded overlay/dock surfaces and narrow/coarse-pointer layouts MUST use accessible sheets or drawers that keep the atlas reachable, avoid horizontal overflow, and remain usable at 200% text zoom.
- **FR-017 — Semantic renderer parity**: `[ADDED dashboard-memory-navigation]` The DOM-backed graph navigator MUST expose the same visible and focused nodes, connected-neighbor actions, and command outcomes as the rich renderer, including during renderer failure and recovery.
- **FR-018 — Private local-first presentation**: `[ADDED dashboard]` Every new label, tooltip, inspector, filter cue, instrument result, and technical disclosure MUST use the established private-safe presentation boundary, and graph/filter data MUST remain within locally packaged same-origin behavior.
- **FR-019 — Bounded asynchronous lifecycle**: `[ADDED dashboard-memory-navigation]` Scope, focus, frontier, instrument, resize, animation, and renderer work MUST be abortable or generation-guarded as applicable, and all renderer instances, simulations, observers, timers, animation frames, and listeners MUST be released when superseded or unmounted.

## Success criteria

- **SC-001** `[buildable]`: At 1440×900 the mounted atlas canvas spans all usable width after the application navigation rail, has a stage aspect ratio of at least 1.45:1, and exposes all primary controls without document scrolling.
- **SC-002** `[buildable]`: Wide, tall, and irregular fixtures preserve their projected world-extent aspect within 10% across initial fit and explicit Fit, and every included node center remains inside the padded atlas viewport.
- **SC-003** `[buildable]`: At whole-graph fit, the configured normal-node core diameter has a median no greater than 8 CSS pixels and a maximum no greater than 14 CSS pixels; selection may add a halo but MUST NOT enlarge the core beyond that maximum.
- **SC-004** `[buildable]`: Default semantic/fact relationship opacity is at least 0.24 with a visible line width of at least 0.8 CSS pixels at rest, focused relationships render at least 0.8 opacity, and subdued unrelated links remain at least 0.08 opacity.
- **SC-005** `[buildable]`: In normal mode, at least one non-fixed visible node changes projected position in a one-second sample after initial entrance while 95% of visible nodes drift no more than 8 CSS pixels per second; Pause and reduced motion produce no continuous drift.
- **SC-006** `[buildable]`: All eight command groups—Fit, zoom, pause/resume, reset, traversal, selection, expansion, and clear—have pointer and keyboard coverage against the mounted production surface.
- **SC-007** `[buildable]`: Every atlas control rectangle remains fully inside the visible atlas at 1440×900, 1024×768, 360×800, and 360×800 at 200% scale.
- **SC-008** `[buildable]`: Selecting, switching, and closing details from a nonzero page/camera position changes document `scrollY` by no more than 1 CSS pixel and preserves a usable focused graph viewport.
- **SC-009** `[buildable]`: Opening or closing the desktop inspector changes the underlying atlas canvas width and height by no more than 2 CSS pixels; the inspector is dismissible and its own content scroll is bounded inside the viewport.
- **SC-010** `[buildable]`: All five focus seams—URL, context, renderer focus, semantic focus, and inspector identity—remain equal after pointer selection, connected-memory pivots, focus Back/Forward, browser Back/Forward, and invalid-focus recovery.
- **SC-011** `[buildable]`: All four instruments—Related, Story, Changes, and Health—render their tab and active content inside one visible dock/sheet; the tab strip remains reachable after scrolling long content and switching tabs changes document scroll by no more than 1 CSS pixel.
- **SC-012** `[buildable]`: Every frontier expansion adds or deduplicates the expected nodes and edges, reports continuation/exhaustion, animates additions in normal mode, and preserves focus/camera in paused or reduced-motion mode.
- **SC-013** `[buildable]`: The guided scope overlay exposes exactly the six structured selectors plus semantic search, supports search/clear/dependent-option recovery, collapses without reserving its full height, and preserves canonical URL/API values.
- **SC-014** `[buildable]`: Zero horizontal page overflow occurs at the required desktop, tablet, mobile, 200%, coarse-pointer, inspector, instrument, or filter-overlay states.
- **SC-015** `[buildable]`: Forced WebGL initialization/context failure leaves a private-safe semantic navigator, current scope/focus, and exactly 1 bounded Retry; successful recovery creates exactly 1 rich renderer.
- **SC-016** `[buildable]`: Mounted private-marker, stale-request, repeated resize, route, focus, frontier, renderer-retry, and unmount tests show zero DOM/history/external-network leaks, stale state replacements, orphan listeners, timers, observers, animation frames, simulations, browser processes, or profiles.
- **SC-017** `[outcome]`: Independent review of at least 4 screenshots covering desktop whole-atlas, desktop focused/dock, tablet, and mobile awards at least 4 of 5 points on every approved visual rubric item—graph dominance, star-scale nodes, traceable synapses, reachable controls, and spatially connected tabs/content—with zero giant-bubble or square-card violations.

## Assumptions

- The current `@cosmos.gl/graph` 3.4.x implementation is a candidate, not a constraint; the plan may retain, complement, or replace it when measured behavior shows a better locally packaged option.
- Existing observatory, visualization, frontier, inspection, recall, timeline, ledger, and health HTTP contracts provide all required data.
- The graph world may be wider or taller than the viewport; camera fit and navigation, not world-shape normalization, make it reachable.
- Safe visual defaults are small star cores, clearly visible links, low-strength bounded ambient motion, a desktop overlay/dock, and a mobile bottom sheet.
- Required verification viewports are 1440×900, 1024×768, and 360×800, plus 200% text zoom, coarse pointer, reduced motion, and forced WebGL failure.
- Existing GuidedSelect canonical-value behavior and the current same-origin private-safe trace/filter contract remain authoritative.

## Dependencies

- Existing React 19/Vite 8 dashboard plus the locally packaged renderer/layout dependencies selected by the technical plan.
- Existing dashboard browser harness with local `Store(':memory:')`, mounted Chrome coverage, and visualization fixtures.
- Existing private-safe presentation helpers, URL/state serialization, semantic GraphNavigator, and observatory API client.

## Out of scope

- Backend, database, embedding, knowledge-graph schema, or HTTP contract changes.
- Introducing remote renderer, font, telemetry, or asset dependencies; any new runtime dependency must be packaged locally and pass license, bundle, lifecycle, and browser verification.
- 3D graph navigation, VR/AR, or an infinite unbounded data fetch beyond existing caps/frontier contracts.
- Copying ArcRift or Graphify source code, assets, branding, or layouts verbatim.
- Redesigning Control Room operations, traces, or indexing pages beyond preserving navigation and shared scope behavior.
- Changing the previously unified GuidedSelect component contract except where its existing controls are repositioned in the atlas overlay.
