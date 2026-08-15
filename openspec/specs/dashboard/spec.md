# Dashboard Specification

## Requirements

### Requirement: Dashboard MUST Provide a Connected Observatory Workspace

Recall, timeline, ledger, and health MUST be presented as supporting instruments that inherit the current graph scope/focus when their existing contracts support it and preserve graph context when opened or closed.

#### Scenario: US4 - Use memory instruments in context 1

- **GIVEN** a focused node
- **WHEN** the user opens recall, timeline, ledger, or health
- **THEN** the instrument is scoped to the same context whenever its HTTP contract supports that scope

#### Scenario: US4 - Use memory instruments in context 2

- **GIVEN** no node is focused
- **WHEN** an instrument opens
- **THEN** it uses the active global scope and clearly identifies that no node-specific pivot is applied

#### Scenario: US4 - Use memory instruments in context 3

- **GIVEN** the user closes or switches an instrument
- **WHEN** the graph regains focus
- **THEN** its selected node and viewport remain usable

### Requirement: Dashboard MUST Preserve Context Across Cross-Surface Pivots

Guided selector changes MUST normalize one shared scope for graph, Lens, supporting instruments, URL state, and browser history, including visible recovery when dependent selections become invalid.

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

### Requirement: Dashboard MUST Expose Memory Semantics in UI Behavior
Dashboard behavior MUST make observation type, What/Why/Where/Learned structure, topic keys, sessions, projects, vectors, KG/fact relationships, provenance, and index health directly meaningful through filters, labels, drilldowns, and navigation affordances.

#### Scenario: Semantic metadata is actionable
- GIVEN observations include typed metadata and structured fields
- WHEN a user inspects or filters content
- THEN the dashboard MUST allow filtering and pivoting by those semantics instead of presenting them as passive text only

#### Scenario: Provenance and index health are visible at exploration time
- GIVEN a user examines recall or map results
- WHEN evidence and relationship details are shown
- THEN provenance/source context and indexing health status MUST be visible alongside those results

### Requirement: Depth and Neighbor Expansion MUST Represent Real Traversal Frontiers

The dashboard MUST expand a focused node through existing bounded visualization/frontier contracts, deduplicate merged nodes and edges, preserve current selection, and report added, already-visible, truncated, continuation, or exhausted outcomes.

#### Scenario: US2 - Follow a trail of related memories 1

- **GIVEN** a project, session, topic, type, relation, or text cue
- **WHEN** the user applies it
- **THEN** the graph and supporting instruments resolve the same visible scope and display removable active filters

#### Scenario: US2 - Follow a trail of related memories 2

- **GIVEN** a selected node
- **WHEN** the user opens its memory lens
- **THEN** enriched details and actions for expansion, recall, timeline, or ledger are available when the node supports them

#### Scenario: US2 - Follow a trail of related memories 3

- **GIVEN** a sequence of focused nodes
- **WHEN** the user uses focus back/forward or browser back/forward
- **THEN** the prior scope, focused node, and usable viewport are restored

#### Scenario: US2 - Follow a trail of related memories 4

- **GIVEN** an expanded neighborhood contains nodes already visible
- **WHEN** the result is merged
- **THEN** node and edge identity remains unique and the user sees what was added or exhausted

### Requirement: Local-first visual delivery

The renderer, selectors, labels, fonts, and animations MUST be packaged locally under dependencies compatible with the repository license and MUST NOT transmit graph or filter data to external services.

#### Scenario: US4 - Retain a usable observatory across devices and renderer failures 1

- **GIVEN** the rich canvas is active
- **WHEN** focus, hover, selection, expansion, or filtering changes it
- **THEN** the DOM-backed graph navigator exposes the same visible and selected memory state

#### Scenario: US4 - Retain a usable observatory across devices and renderer failures 2

- **GIVEN** the GPU renderer cannot initialize or loses its context
- **WHEN** the failure is detected
- **THEN** the observatory presents a bounded recovery action and the semantic navigator remains usable

#### Scenario: US4 - Retain a usable observatory across devices and renderer failures 3

- **GIVEN** a narrow viewport or 200% text zoom
- **WHEN** selectors, Memory Lens, or instruments open
- **THEN** the graph remains reachable and the page does not overflow horizontally

#### Scenario: US4 - Retain a usable observatory across devices and renderer failures 4

- **GIVEN** stored content contains supported private markers
- **WHEN** any new label, tooltip, selector, or technical disclosure renders it
- **THEN** private content remains absent

### Requirement: Dashboard MUST Default to an Observatory Workspace
The dashboard MUST open to an observatory workspace where the Memory Map is one primary connected surface among Recall Workspace, Timeline, Knowledge Ledger, and Health & Indexing, rather than being the whole default product experience.

#### Scenario: Default route opens observatory workspace
- GIVEN a user opens the dashboard without a deep-link override
- WHEN the initial dashboard view is rendered
- THEN the default destination MUST be the connected observatory workspace, not a map-only or list-first page

#### Scenario: Memory map remains primary but not exclusive
- GIVEN the default observatory workspace is rendered
- WHEN layout regions are inspected
- THEN the Memory Map MUST be primary and always reachable while at least one additional observatory surface is concurrently accessible without route reset

## Production Hardening Dashboard V2 Requirements

### Requirement: Canonical graph home

The canonical graph workspace MUST automatically load the complete current visualization graph matching the active scope through progressive bounded pages and MUST NOT require a separate load or reveal-more action.

#### Scenario: US2 - See the complete graph for the active scope 1

- **GIVEN** a graph larger than one HTTP page
- **WHEN** the observatory resolves its active scope
- **THEN** it automatically follows every continuation until the complete current scoped graph is present without requiring “Reveal more”

#### Scenario: US2 - See the complete graph for the active scope 2

- **GIVEN** pages contain repeated project, session, topic, node, or relationship identities
- **WHEN** they merge
- **THEN** each node and edge appears exactly once and every rendered edge has both endpoints

#### Scenario: US2 - See the complete graph for the active scope 3

- **GIVEN** the graph is still arriving
- **WHEN** the user watches or interacts
- **THEN** a concise loading state and current counts remain visible while already loaded nodes stay navigable

#### Scenario: US2 - See the complete graph for the active scope 4

- **GIVEN** the user changes scope while pages are in flight
- **WHEN** older pages resolve
- **THEN** they cannot enter the new graph and the new scope begins its own complete load

#### Scenario: US2 - See the complete graph for the active scope 5

- **GIVEN** the user changes Field of view
- **WHEN** the atlas updates
- **THEN** presentation and camera detail may change but the complete scoped node and edge set remains included

#### Scenario: US2 - See the complete graph for the active scope 6

- **GIVEN** a source fact is inserted, deleted, updated, or superseded between continuation requests
- **WHEN** the next page validates its cursor
- **THEN** the server rejects that stale graph generation and the observatory discards the mixed accumulator and automatically restarts from a fresh first page within a bounded retry budget

### Requirement: Dashboard MUST Visualize Four Retrieval Lanes
Dashboard V2 MUST make sentence vector, chunk vector, lexical FTS, and knowledge graph lanes visible in recall results, lane status, and explanatory details.

#### Scenario: Recall result shows lane evidence
- GIVEN a user runs a recall query from the dashboard
- WHEN results return with multiple lanes
- THEN the UI MUST show primary lane, supporting lanes, graph enrichment, score, and retrieval contract

### Requirement: Dashboard MUST Display MCP and HTTP Traces

Administrative results MUST expose available trace or operation identifiers and a relevant follow-up action without rendering raw unbounded payloads as the primary presentation.

#### Scenario: US5 - Administer the memory engine safely 1

- **GIVEN** the dashboard is in the observatory
- **WHEN** the user opens the control room
- **THEN** operations, traces, and indexing are clearly secondary but reachable in one navigation step

#### Scenario: US5 - Administer the memory engine safely 2

- **GIVEN** a state-changing or expensive command
- **WHEN** the user initiates it
- **THEN** scope and impact are shown before confirmation and duplicate submission is prevented while it runs

#### Scenario: US5 - Administer the memory engine safely 3

- **GIVEN** an operation succeeds or fails
- **WHEN** it completes
- **THEN** the result, traceability information, and a safe next action are visible without exposing private content

### Requirement: Dashboard MUST Display Indexing and Background Job Health
Dashboard V2 MUST show queue counts, running/pending/failed jobs, stale/degraded lanes, vector coverage, recent errors, and rebuild actions.

#### Scenario: Stale lane is visible
- GIVEN a semantic lane is stale
- WHEN the dashboard health panel renders
- THEN the stale lane MUST be labeled with coverage and recommended actions

### Requirement: Dashboard MUST Reproduce CLI and HTTP Operations

The redesigned control room MUST preserve create-observation, operation catalog/result, trace filtering/detail, indexing status, graph rebuild, and index rebuild behaviors supported by the current HTTP client.

#### Scenario: US5 - Administer the memory engine safely 1

- **GIVEN** the dashboard is in the observatory
- **WHEN** the user opens the control room
- **THEN** operations, traces, and indexing are clearly secondary but reachable in one navigation step

#### Scenario: US5 - Administer the memory engine safely 2

- **GIVEN** a state-changing or expensive command
- **WHEN** the user initiates it
- **THEN** scope and impact are shown before confirmation and duplicate submission is prevented while it runs

#### Scenario: US5 - Administer the memory engine safely 3

- **GIVEN** an operation succeeds or fails
- **WHEN** it completes
- **THEN** the result, traceability information, and a safe next action are visible without exposing private content

### Requirement: Dashboard V2 MUST Be Modern, Minimal, and Animated with Motion
The dashboard MUST use a cohesive design system, restrained density, accessible controls, lucide icons, and Motion-powered staged transitions and microinteractions.

#### Scenario: Route transition is animated without layout breakage
- GIVEN a user switches dashboard sections
- WHEN the new section appears
- THEN Motion animations MUST be subtle, interruptible, and must not cause text overlap or layout shift

### Requirement: Dashboard MUST Be Responsive and Visually Verified

The observatory MUST adapt navigation, scope controls, instruments, and memory lens into usable drawers or sheets on narrow viewports and MUST honor `prefers-reduced-motion` without hiding state changes.

#### Scenario: US3 - Navigate without pointer-only barriers 1

- **GIVEN** the graph canvas has focus
- **WHEN** the user invokes documented keyboard controls
- **THEN** zoom, fit, pause/resume, focus movement, selection, and clearing have visible results and pointer-equivalent outcomes

#### Scenario: US3 - Navigate without pointer-only barriers 2

- **GIVEN** canvas content is not directly exposed as DOM nodes
- **WHEN** assistive technology reads the graph workspace
- **THEN** a synchronized semantic navigator exposes visible/focused memories and their connected neighbors as operable controls

#### Scenario: US3 - Navigate without pointer-only barriers 3

- **GIVEN** reduced motion is requested
- **WHEN** focus changes or panels open
- **THEN** semantic state changes remain visible without continuous simulation or nonessential animation

#### Scenario: US3 - Navigate without pointer-only barriers 4

- **GIVEN** a narrow viewport
- **WHEN** the user opens navigation or the memory lens
- **THEN** controls become an accessible drawer or sheet without creating horizontal page overflow

### Requirement: Dominant atlas workspace

The default dashboard MUST present the Neural Atlas as a single dominant workspace that fills the usable application viewport and keeps primary graph controls reachable without document-level scrolling.

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

### Requirement: Co-located instrument dock

Selecting a semantic region MUST open the existing in-place dock with a private-safe summary, complete member count, representative concepts, bounded facet distribution, time span, representative memories, strongest bridges, and actions to focus the region or return to Community overview.

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

### Requirement: Shared graph and instrument context

Instrument open, close, switch, retry, and pivot actions MUST inherit compatible graph scope/focus and MUST preserve the selected node, camera, semantic navigator, and graph availability.

#### Scenario: US4 - Use instruments where their controls live 1

- **GIVEN** an atlas with no instrument open
- **WHEN** the user opens Related, Story, Changes, or Health
- **THEN** the instrument tabs appear immediately adjacent to the active content in the inspector dock or mobile sheet

#### Scenario: US4 - Use instruments where their controls live 2

- **GIVEN** an instrument with long content
- **WHEN** the user scrolls it and switches tabs
- **THEN** the tab strip stays reachable inside that bounded surface without document-level scrolling

#### Scenario: US4 - Use instruments where their controls live 3

- **GIVEN** a focused memory and camera position
- **WHEN** the user switches or closes instruments
- **THEN** graph focus, camera, scope, and URL remain usable

### Requirement: Compact guided scope overlay

The compact filter surface MUST keep every open selector listbox visibly tethered above the atlas overlay, allow the listbox to outlive panel clipping without reserving graph space, and restore focus predictably when it closes.

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

### Requirement: Private local-first presentation

Complete graph pages, loading progress, selector portals, semantic fallback, and renderer diagnostics MUST remain same-origin and private-safe through the established presentation boundary.

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

### Requirement: Truthful graph accounting

Store responses and UI MUST distinguish source and visible projects, source and visible project-owned constellations, source and visible memories, project/constellation/region aggregate bridges, visible relationships, and omitted identities at the active level; project and constellation membership counts MUST sum exactly to source membership and painted identities MUST NOT be presented as raw completeness.

#### Scenario: US1 - Recognize the universe by project 1

- **GIVEN** a multi-project memory store
- **WHEN** Universe becomes usable
- **THEN** every visible top-level contour is a private-safe project nebula and every star inside it is a project-owned constellation core rather than an individual memory, file, session, or topic

#### Scenario: US1 - Recognize the universe by project 2

- **GIVEN** structural evidence connecting observations from different projects
- **WHEN** project-owned constellations are partitioned
- **THEN** no constellation spans projects and the cross-project evidence contributes only to bounded project bridges

#### Scenario: US1 - Recognize the universe by project 3

- **GIVEN** observations without a project
- **WHEN** Universe loads
- **THEN** one explicit Unassigned nebula accounts for them without inventing a canonical project

#### Scenario: US1 - Recognize the universe by project 4

- **GIVEN** more projects or constellations than the visual budget
- **WHEN** Universe renders
- **THEN** the response and UI distinguish source, visible, and omitted counts, paint only one bounded page, and provide Previous/Next project-page actions that can reach every omitted project without accumulating prior pages on the canvas

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

### Requirement: Facets instead of metadata stars

Project navigation identity MUST be separate from optional project facet filtering: an opaque project parent selects the Project/Constellation hierarchy while project, session, topic, type, relation, and query facets refine the active scope. Canonical project values MUST remain server-resolved, and metadata MUST NOT appear as peer memory stars outside Neighborhood or Raw diagnostics.

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

#### Scenario: US5 - Retain bounded, accessible, private-safe operation 1

- **GIVEN** project nebulae and constellation cores
- **WHEN** the GPU renderer is unavailable
- **THEN** the DOM navigator exposes the same project-to-constellation hierarchy and activation outcomes

#### Scenario: US5 - Retain bounded, accessible, private-safe operation 2

- **GIVEN** stale project, constellation, region, or generation state
- **WHEN** a request resolves
- **THEN** typed recovery returns to the nearest current owning level without mixing datasets or cameras

#### Scenario: US5 - Retain bounded, accessible, private-safe operation 3

- **GIVEN** private-marked values or superseded asynchronous work
- **WHEN** labels, overlays, errors, URLs, diagnostics, or callbacks resolve
- **THEN** private content and stale state cannot enter presentation or external traffic

#### Scenario: US5 - Retain bounded, accessible, private-safe operation 4

- **GIVEN** explicit Raw diagnostic activation
- **WHEN** it opens
- **THEN** it remains a separate bounded diagnostic path and never replaces a semantic hierarchy failure automatically
