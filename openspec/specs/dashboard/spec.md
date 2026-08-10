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

The dashboard MUST make the graph-first Neural Observatory the canonical initial workspace and MUST load a bounded initial graph slice after scope resolution without requiring a separate load button.

#### Scenario: US1 - Explore the memory nebula 1

- **GIVEN** a populated memory store
- **WHEN** the dashboard finishes resolving its initial scope
- **THEN** the memory graph is the dominant workspace and loads a bounded initial slice automatically

#### Scenario: US1 - Explore the memory nebula 2

- **GIVEN** a graph with multiple node kinds and communities
- **WHEN** it renders
- **THEN** kind, focus, relationship strength, and health are distinguishable without relying on color alone

#### Scenario: US1 - Explore the memory nebula 3

- **GIVEN** the graph is larger than the viewport
- **WHEN** the user pans, zooms, fits, pauses, or resumes it
- **THEN** the viewport changes predictably without losing the current focus

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
