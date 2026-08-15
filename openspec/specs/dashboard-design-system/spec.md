# Dashboard Design System Specification

## Purpose

Durable behavioral contract for `dashboard-design-system`.

## Requirements

### Requirement: Semantic celestial encoding

Project-hierarchy Universe MUST render every visible project as one organic nebula envelope derived from the current projected positions of its visible owned constellation cores; every painted private-safe project label and count MUST be collision-managed and anchored to its owning envelope, while any label suppressed by the responsive visual budget MUST remain available through the synchronized DOM navigator. A project MUST NOT be represented only by independently positioned text, a generic disk, or a decorative screen-space glow.

#### Scenario: US1 - Read projects as containing nebulae 1

- **GIVEN** several visible projects with project-owned constellation cores
- **WHEN** Universe becomes usable
- **THEN** each project has one organic envelope derived from and enclosing its own visible cores, and no envelope contains cores owned by another project

#### Scenario: US1 - Read projects as containing nebulae 2

- **GIVEN** one sparse or single-core project
- **WHEN** Universe renders it
- **THEN** the project still has a bounded organic envelope centered on its real core positions rather than on the viewport

#### Scenario: US1 - Read projects as containing nebulae 3

- **GIVEN** project labels and memory or constellation counts
- **WHEN** the responsive visual budget presents them
- **THEN** they are collision-managed anchors of their project envelope and not independently scattered screen text; projects whose painted label is suppressed remain named in the synchronized DOM navigator

#### Scenario: US1 - Read projects as containing nebulae 4

- **GIVEN** decorative background glow is enabled elsewhere in the atlas
- **WHEN** project-hierarchy Universe renders
- **THEN** decorative glow is not used as, or visually confused with, a project boundary

### Requirement: Accessible state communication

Selector results, graph activation, renderer capability, empty/error recovery, and administrative outcomes MUST expose concise visible status and controlled accessible announcements without duplicating high-frequency animation updates.

#### Scenario: US3 - Understand memory without implementation jargon 1

- **GIVEN** a node, relation, density mode, or capability has an internal identifier
- **WHEN** it appears in the primary interface
- **THEN** the user sees a concise human-readable label and supporting explanation instead of the raw token alone

#### Scenario: US3 - Understand memory without implementation jargon 2

- **GIVEN** technical evidence is useful for debugging
- **WHEN** the user requests technical details
- **THEN** identifiers, trace evidence, and bounded diagnostics become available without taking over the main workflow

#### Scenario: US3 - Understand memory without implementation jargon 3

- **GIVEN** the graph is empty, loading, degraded, or failed
- **WHEN** the state is presented
- **THEN** the message explains what happened and offers one relevant next action in plain language

#### Scenario: US3 - Understand memory without implementation jargon 4

- **GIVEN** the user enters the Control Room
- **WHEN** administrative actions are shown
- **THEN** they are grouped by user goal and explain impact before exposing operation-level detail

### Requirement: Private-content safety

Region evidence, labels, representative explanations, legends, errors, fallback content, URLs, and request metadata MUST pass the shared private-safe presentation boundary; opaque tokens MUST resolve only on the local server.

#### Scenario: US5 - Retain diagnostics, access, and lifecycle safety 1

- **GIVEN** the normal observatory route
- **WHEN** a large Community opens
- **THEN** the client does not call `/viz/graph` and does not automatically follow Community continuation until every source member is rendered

#### Scenario: US5 - Retain diagnostics, access, and lifecycle safety 2

- **GIVEN** explicit Raw diagnostic confirmation
- **WHEN** the source exceeds the safe renderer threshold
- **THEN** the UI reports exact diagnostic totals and offers bounded inspection/export without silently turning Raw into the primary atlas

#### Scenario: US5 - Retain diagnostics, access, and lifecycle safety 3

- **GIVEN** WebGL initialization or live-context failure
- **WHEN** fallback activates
- **THEN** region names, representative memories, counts, focus, navigation, and one Retry remain operable in the synchronized DOM surface

#### Scenario: US5 - Retain diagnostics, access, and lifecycle safety 4

- **GIVEN** reduced motion or Pause
- **WHEN** level, zoom band, or focus changes
- **THEN** semantic results remain visible and stable without nonessential simulation or camera animation

#### Scenario: US5 - Retain diagnostics, access, and lifecycle safety 5

- **GIVEN** private-marked data or superseded asynchronous work
- **WHEN** labels, errors, cursors, overlays, diagnostics, or callbacks resolve
- **THEN** private content and stale state cannot enter the DOM, URL, canvas-adjacent labels, logs, or external network traffic

### Requirement: Complete asynchronous states

Every data surface MUST distinguish initial loading, refresh, empty, sparse, dense, truncated, exhausted, degraded, error, and retry states applicable to its contract.

#### Scenario: US6 - Trust the observatory under real data conditions 1

- **GIVEN** stored labels or snippets contain supported private markers
- **WHEN** they appear in graph, search, inspector, timeline, ledger, trace, or result surfaces
- **THEN** marked private content is absent from the rendered UI

#### Scenario: US6 - Trust the observatory under real data conditions 2

- **GIVEN** a request is superseded by a new scope
- **WHEN** the older request resolves later
- **THEN** it cannot replace the newer view

#### Scenario: US6 - Trust the observatory under real data conditions 3

- **GIVEN** an empty, sparse, dense, truncated, or exhausted graph response
- **WHEN** it renders
- **THEN** the dashboard presents a distinct state and an appropriate recovery or continuation action

#### Scenario: US6 - Trust the observatory under real data conditions 4

- **GIVEN** the user changes routes or graph datasets repeatedly
- **WHEN** prior views unmount or become inactive
- **THEN** obsolete simulations, observers, and listeners are stopped or detached

### Requirement: Human-readable filter semantics

Structured filters, relation tokens, density modes, applied tokens, loading states, and empty metadata states MUST use concise user-facing names and explanations while preserving canonical values internally.

#### Scenario: US2 - Refine the graph without invalid filters 1

- **GIVEN** visualization filter metadata is available
- **WHEN** the scope bar renders
- **THEN** project, session, topic, type, relation, and density use closed or searchable selection controls and only the semantic search cue remains free text

#### Scenario: US2 - Refine the graph without invalid filters 2

- **GIVEN** a project selection changes the valid session, topic, type, or relation option set
- **WHEN** dependent metadata resolves
- **THEN** invalid dependent selections clear visibly and the user is offered only compatible choices

#### Scenario: US2 - Refine the graph without invalid filters 3

- **GIVEN** the user chooses or removes a filter
- **WHEN** the graph and an instrument update
- **THEN** both receive the same normalized scope and browser history can restore it

#### Scenario: US2 - Refine the graph without invalid filters 4

- **GIVEN** filter metadata is loading, empty, or unavailable
- **WHEN** the user opens a selector
- **THEN** the control communicates that state without falling back to unrestricted text entry

### Requirement: Progressive technical disclosure

The primary observatory MUST prioritize user goals, summaries, and next actions, while raw node IDs, context tokens, trace identifiers, payload evidence, and diagnostic detail MUST appear only in bounded explicitly requested technical disclosures unless required for disambiguation.

#### Scenario: US3 - Understand memory without implementation jargon 1

- **GIVEN** a node, relation, density mode, or capability has an internal identifier
- **WHEN** it appears in the primary interface
- **THEN** the user sees a concise human-readable label and supporting explanation instead of the raw token alone

#### Scenario: US3 - Understand memory without implementation jargon 2

- **GIVEN** technical evidence is useful for debugging
- **WHEN** the user requests technical details
- **THEN** identifiers, trace evidence, and bounded diagnostics become available without taking over the main workflow

#### Scenario: US3 - Understand memory without implementation jargon 3

- **GIVEN** the graph is empty, loading, degraded, or failed
- **WHEN** the state is presented
- **THEN** the message explains what happened and offers one relevant next action in plain language

#### Scenario: US3 - Understand memory without implementation jargon 4

- **GIVEN** the user enters the Control Room
- **WHEN** administrative actions are shown
- **THEN** they are grouped by user goal and explain impact before exposing operation-level detail

### Requirement: Purposeful graph motion

Continuous motion MUST remain subtle and frame-coherent, MUST preserve the atlas community extent over time, and MUST use bounded interruptible emphasis for focus, camera, and progressive data additions rather than large jumps or full-layout restarts.

#### Scenario: US1 - Explore a continuously living atlas 1

- **GIVEN** normal motion preferences and a visible atlas
- **WHEN** the initial entrance completes
- **THEN** low-energy node movement continues without a periodic stop/reheat cadence or large positional jumps

#### Scenario: US1 - Explore a continuously living atlas 2

- **GIVEN** a settled full graph
- **WHEN** it remains open
- **THEN** its communities retain a stable overall extent and do not progressively collapse into a small central cluster

#### Scenario: US1 - Explore a continuously living atlas 3

- **GIVEN** the user pauses motion, requests reduced motion, hides the document, or loses the renderer
- **WHEN** time passes
- **THEN** nonessential movement stops immediately and does not restart until an allowed visible resume

#### Scenario: US1 - Explore a continuously living atlas 4

- **GIVEN** new pages of graph data arrive
- **WHEN** they merge into the atlas
- **THEN** additions enter smoothly without restarting the entire constellation or discarding the current focus and camera

### Requirement: Star-scale memory hierarchy

Memory cores MUST use a tightly bounded star-like size scale in which connectivity remains perceivable without allowing hubs, focus, or neighbor states to become bubble-sized; focus MUST rely primarily on halo, contrast, and local labels.

#### Scenario: US1 - See the whole living memory field 1

- **GIVEN** a populated memory store
- **WHEN** the default dashboard opens
- **THEN** the Neural Atlas occupies the remaining application width and height instead of appearing inside a bounded two-column card

#### Scenario: US1 - See the whole living memory field 2

- **GIVEN** a graph whose natural world extent is wide, tall, or irregular
- **WHEN** it is laid out and fitted
- **THEN** its geometry keeps that aspect and the camera/canvas adapts to show it without normalizing the constellation into a square

#### Scenario: US1 - See the whole living memory field 3

- **GIVEN** a dense graph
- **WHEN** it settles at the whole-graph view
- **THEN** normal memories read as small stars, hubs remain bounded, and no core node dominates the field as a giant bubble

#### Scenario: US1 - See the whole living memory field 4

- **GIVEN** relationships of different classes
- **WHEN** the graph is at rest
- **THEN** curved synapses remain visibly traceable and focused relationships become substantially brighter without removing the surrounding graph

### Requirement: Legible synaptic relationships

Curved links MUST remain visible at rest against the atlas background, communicate relationship emphasis without color alone, brighten clearly for focus/hover, and retain subdued but perceptible unrelated context.

#### Scenario: US1 - See the whole living memory field 1

- **GIVEN** a populated memory store
- **WHEN** the default dashboard opens
- **THEN** the Neural Atlas occupies the remaining application width and height instead of appearing inside a bounded two-column card

#### Scenario: US1 - See the whole living memory field 2

- **GIVEN** a graph whose natural world extent is wide, tall, or irregular
- **WHEN** it is laid out and fitted
- **THEN** its geometry keeps that aspect and the camera/canvas adapts to show it without normalizing the constellation into a square

#### Scenario: US1 - See the whole living memory field 3

- **GIVEN** a dense graph
- **WHEN** it settles at the whole-graph view
- **THEN** normal memories read as small stars, hubs remain bounded, and no core node dominates the field as a giant bubble

#### Scenario: US1 - See the whole living memory field 4

- **GIVEN** relationships of different classes
- **WHEN** the graph is at rest
- **THEN** curved synapses remain visibly traceable and focused relationships become substantially brighter without removing the surrounding graph

### Requirement: Responsive atlas surfaces

Desktop MUST use bounded overlay/dock surfaces and narrow/coarse-pointer layouts MUST use accessible sheets or drawers that keep the atlas reachable, avoid horizontal overflow, and remain usable at 200% text zoom.

#### Scenario: US6 - Retain trust and access under real conditions 1

- **GIVEN** a narrow viewport
- **WHEN** the inspector, instruments, or filters open
- **THEN** they become accessible sheets/drawers without horizontal overflow and without making the graph unreachable

#### Scenario: US6 - Retain trust and access under real conditions 2

- **GIVEN** WebGL initialization or context recovery fails
- **WHEN** the rich renderer is unavailable
- **THEN** the synchronized semantic navigator, current scope, focused memory, and one bounded Retry action remain usable

#### Scenario: US6 - Retain trust and access under real conditions 3

- **GIVEN** stored labels, snippets, provenance, or instrument results contain supported private markers
- **WHEN** any atlas surface renders them
- **THEN** marked content is absent from the DOM, canvas-adjacent labels, history, and external network traffic

#### Scenario: US6 - Retain trust and access under real conditions 4

- **GIVEN** rapid scope, focus, expansion, route, resize, or renderer changes
- **WHEN** old asynchronous work completes
- **THEN** stale responses, timers, simulations, observers, and listeners cannot replace or mutate the active atlas

### Requirement: Resilient selector top layer

Guided listboxes MUST use a top-layer or equivalent portal strategy with visual-viewport collision handling, correct elevation, hit testing, light dismissal, and complete combobox/listbox keyboard and accessibility semantics.

#### Scenario: US3 - Choose filters from an unclipped top layer 1

- **GIVEN** a selector inside the scrollable filter overlay
- **WHEN** it opens
- **THEN** its listbox is promoted above that overlay and is not clipped by any ancestor overflow boundary

#### Scenario: US3 - Choose filters from an unclipped top layer 2

- **GIVEN** insufficient room below or beside a trigger
- **WHEN** the listbox opens or the visual viewport changes
- **THEN** it flips or clamps while remaining tethered to the trigger and fully hit-testable

#### Scenario: US3 - Choose filters from an unclipped top layer 3

- **GIVEN** keyboard-only use
- **WHEN** the user opens, searches, navigates, commits, escapes, or tabs away
- **THEN** the combobox/listbox semantics and canonical-value contract remain complete

#### Scenario: US3 - Choose filters from an unclipped top layer 4

- **GIVEN** mobile or 200% page scale
- **WHEN** a selector opens
- **THEN** the trigger and listbox remain inside the visual viewport without horizontal page overflow

#### Scenario: US4 - Retain access and trust at full density 1

- **GIVEN** thousands of nodes and relationships
- **WHEN** the graph is loading or fully present
- **THEN** primary controls, semantic navigation, selection, filtering, and camera commands remain responsive and usable

#### Scenario: US4 - Retain access and trust at full density 2

- **GIVEN** WebGL initialization or context recovery fails
- **WHEN** the rich renderer is unavailable
- **THEN** the complete loaded semantic graph, active scope, focus, and one bounded Retry remain usable

#### Scenario: US4 - Retain access and trust at full density 3

- **GIVEN** private-marked stored text
- **WHEN** graph pages, progress, labels, selectors, or fallback content render
- **THEN** private content remains absent from DOM, URL/history, diagnostics, and external network traffic

#### Scenario: US4 - Retain access and trust at full density 4

- **GIVEN** a route change, scope change, abort, failure, or unmount
- **WHEN** background page loads or animation work completes
- **THEN** no stale state, request, timer, frame, observer, simulation, browser process, or temporary profile survives its owner

### Requirement: Dense renderer performance

The Community client MUST stop after one bounded usable projection, MUST preserve typed omission metadata, and MUST request a replacement bounded working set only for explicit spatial intent such as focused-region exploration, search pivot, or Neighborhood traversal. It MUST NOT globally auto-drain complete Community continuation.

#### Scenario: US3 - Reveal detail through spatial intent 1

- **GIVEN** Community overview
- **WHEN** the user zooms into the exploration band
- **THEN** relevant representative observation links and additional local labels appear without changing Community source membership or downloading every source relationship

#### Scenario: US3 - Reveal detail through spatial intent 2

- **GIVEN** a semantic region
- **WHEN** the user activates it
- **THEN** the atlas focuses that region, keeps surrounding regions as subdued context, restores the focus through URL/history, and retains a bounded working set

#### Scenario: US3 - Reveal detail through spatial intent 3

- **GIVEN** a representative memory
- **WHEN** the user activates it
- **THEN** Neighborhood displays the focused memory and its most relevant one- or two-hop support within the existing 300-node cap

#### Scenario: US3 - Reveal detail through spatial intent 4

- **GIVEN** Back, Forward, deep-link, search pivot, or filter restoration
- **WHEN** the level becomes usable
- **THEN** URL, breadcrumb, region, focus, semantic navigator, Lens, camera, and painted renderer publish one coherent state

#### Scenario: US3 - Reveal detail through spatial intent 5

- **GIVEN** a region or memory that is no longer current
- **WHEN** a stored URL is restored
- **THEN** the server returns a typed stale/gone outcome and the client recovers to the current owning Community without mixing generations

### Requirement: Level-aware relationship presentation

Universe overview MUST show bounded project bridges and subdued within-project constellation structure; Project overview MUST show weighted cross-constellation bridges; Constellation overview and exploration MUST retain region contours, region bridges, sparse representative backbones, and relevant representative links; Neighborhood MUST retain complete bounded local support. Presentation bands MUST NOT alter semantic ownership or globally download lower-level identities.

#### Scenario: US2 - Enter a project or constellation directly 1

- **GIVEN** a project nebula in Universe
- **WHEN** its contour or label is activated
- **THEN** Project opens with every returned constellation owned by that project and with other projects removed from the active working set

#### Scenario: US2 - Enter a project or constellation directly 2

- **GIVEN** a visible constellation core inside a project nebula
- **WHEN** it is activated
- **THEN** Constellation opens directly with the owning project and constellation encoded atomically

#### Scenario: US2 - Enter a project or constellation directly 3

- **GIVEN** Project overview
- **WHEN** a constellation is activated
- **THEN** the current bounded region-aware Constellation view opens without loading individual memories globally

#### Scenario: US2 - Enter a project or constellation directly 4

- **GIVEN** pointer, keyboard, DOM navigator, bounded-page controls, breadcrumb, deep-link, or Back/Forward navigation
- **WHEN** a semantic location changes
- **THEN** URL, breadcrumb, painted view, navigator hierarchy, counts, and dock context publish one coherent location without duplicate trail entries

#### Scenario: US4 - Trust the hierarchy and its accounting 1

- **GIVEN** Universe overview
- **WHEN** counts are presented
- **THEN** source projects, visible project nebulae, source memories, source constellations, visible constellation cores, project bridges, and omitted identities remain distinct

#### Scenario: US4 - Trust the hierarchy and its accounting 2

- **GIVEN** Project overview
- **WHEN** counts are presented
- **THEN** source memories, source constellations, visible constellations, aggregate bridges, and omissions refer only to the selected project

#### Scenario: US4 - Trust the hierarchy and its accounting 3

- **GIVEN** duplicate private-safe project labels
- **WHEN** nebulae and navigation choices render
- **THEN** stable opaque identities remain distinct and labels are deterministically disambiguated without exposing canonical values

#### Scenario: US4 - Trust the hierarchy and its accounting 4

- **GIVEN** missing or degraded structural evidence
- **WHEN** the hierarchy is built
- **THEN** every current observation remains assigned exactly once and degraded state is reported without fabricated relationships

### Requirement: Level-local legend

Community and Neighborhood MUST provide a compact co-located relation/region legend whose filters update styling or the bounded working set without restarting physics for unchanged identities.

#### Scenario: US4 - Understand why regions and relationships exist 1

- **GIVEN** one semantic region
- **WHEN** it is focused
- **THEN** the dock explains its memory count, distinguishing concepts, projects, time span, representative memories, and strongest bridges without presenting metadata as peer stars

#### Scenario: US4 - Understand why regions and relationships exist 2

- **GIVEN** different relationship classes
- **WHEN** they are visible
- **THEN** color/style, confidence, direction, and provenance remain distinguishable through a compact level-local legend and accessible text

#### Scenario: US4 - Understand why regions and relationships exist 3

- **GIVEN** an individual memory focus
- **WHEN** its local relationships appear
- **THEN** the selected memory and neighbors become vivid while unrelated context remains present but subdued

#### Scenario: US4 - Understand why regions and relationships exist 4

- **GIVEN** an open dock at desktop, tablet, mobile, or 200% scale
- **WHEN** graph controls or level tabs are used
- **THEN** every required target remains visible and hit-testable without document-level scrolling or selection-induced scroll jumps
