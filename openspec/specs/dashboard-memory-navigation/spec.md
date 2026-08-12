# Dashboard Memory Navigation Specification

## Purpose

Durable behavioral contract for `dashboard-memory-navigation`.

## Requirements

### Requirement: Spatial viewport controls

Graph pan, zoom, fit, reset, focus, and expansion MUST use smooth interruptible camera and position transitions while preserving the selected memory and all pointer/keyboard command semantics.

#### Scenario: US1 - Explore a living memory constellation 1

- **GIVEN** a populated graph
- **WHEN** the observatory loads
- **THEN** memories appear as an organic field of circular neuron-like nodes whose size communicates connectivity, whose color communicates community, and whose curved directed links expose relationships without a manual load step

#### Scenario: US1 - Explore a living memory constellation 2

- **GIVEN** a visible memory
- **WHEN** the user focuses it
- **THEN** the camera travels toward it, the selected neuron and its neighborhood become vivid, concise names appear for that local trail, and unrelated context remains present but strongly subdued

#### Scenario: US1 - Explore a living memory constellation 3

- **GIVEN** an expanded neighborhood
- **WHEN** new nodes and links arrive
- **THEN** they enter through a purposeful transition instead of abruptly replacing the current constellation

#### Scenario: US1 - Explore a living memory constellation 4

- **GIVEN** motion is paused or reduced motion is requested
- **WHEN** graph state changes
- **THEN** every semantic result remains visible without continuous or nonessential animation

### Requirement: Memory activation focus

Focusing a memory MUST produce a bounded activation treatment that reveals connected memories and relationships in sequence, shows concise safe labels for the focused local trail, and strongly dims rather than removes unrelated graph context.

#### Scenario: US1 - Explore a living memory constellation 1

- **GIVEN** a populated graph
- **WHEN** the observatory loads
- **THEN** memories appear as an organic field of circular neuron-like nodes whose size communicates connectivity, whose color communicates community, and whose curved directed links expose relationships without a manual load step

#### Scenario: US1 - Explore a living memory constellation 2

- **GIVEN** a visible memory
- **WHEN** the user focuses it
- **THEN** the camera travels toward it, the selected neuron and its neighborhood become vivid, concise names appear for that local trail, and unrelated context remains present but strongly subdued

#### Scenario: US1 - Explore a living memory constellation 3

- **GIVEN** an expanded neighborhood
- **WHEN** new nodes and links arrive
- **THEN** they enter through a purposeful transition instead of abruptly replacing the current constellation

#### Scenario: US1 - Explore a living memory constellation 4

- **GIVEN** motion is paused or reduced motion is requested
- **WHEN** graph state changes
- **THEN** every semantic result remains visible without continuous or nonessential animation

### Requirement: Focus trail and deep-link state

The dashboard MUST encode restorable scope and focused-node state in the URL and MUST provide focus back/forward semantics that cooperate with browser history and invalid-state recovery.

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

### Requirement: Enriched memory lens

Memory Lens MUST lead with a human-readable title, memory kind, summary, provenance, relationships, and clear exploration actions, and MUST place raw identifiers or unsupported pivots outside the primary reading flow.

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

### Requirement: Keyboard command parity

Every graph command and selected-node action MUST be operable by keyboard with documented bindings, visible focus, and no pointer-only prerequisite.

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

### Requirement: Semantic graph navigator

The DOM-backed graph navigator MUST remain synchronized with rich renderer visibility, focus, selection, and connected-neighbor order and MUST provide equivalent activation actions.

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

### Requirement: Instrument state retention

Switching among the graph and its supporting instruments MUST retain their bounded local state without accumulating an unbounded cache of inactive views.

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

### Requirement: Guided scope selectors

Project, session, topic, type, relation, and Field of view selectors MUST keep their metadata-only canonical value contract while rendering searchable listboxes outside ancestor overflow clipping.

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

### Requirement: Renderer capability recovery

If rich graph rendering is unavailable, the dashboard MUST keep scope controls and semantic navigation operable, identify the capability failure, and provide a bounded retry without crashing or discarding current context.

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

### Requirement: World-first graph geometry

The graph MUST compute and retain spatial positions in a world coordinate space that is not constrained to the canvas rectangle, and fitting MUST adapt the camera/canvas to the resulting extent rather than reshape the constellation to a square.

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

### Requirement: Aspect-preserving fit and resize

Initial fit, explicit fit, viewport resize, and drawer/sheet transitions MUST keep every included node reachable, preserve world aspect and focus, and avoid involuntary refits after ordinary manual pan or zoom.

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

### Requirement: Living but bounded motion

Normal mode MUST run one smooth low-energy simulation after entrance and data transitions without periodic stop/reheat cycles; Pause, reduced motion, hidden documents, renderer failure, supersession, and destroy MUST stop nonessential movement.

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

### Requirement: Persistent atlas controls

Fit, zoom, pause/resume, reset, focus traversal, selection, expansion, and clear actions MUST remain operable and visibly reachable within the atlas at supported viewport sizes.

#### Scenario: US2 - Navigate without losing the atlas 1

- **GIVEN** normal motion preferences
- **WHEN** the graph finishes its initial entrance
- **THEN** it retains subtle bounded ambient motion and visibly reheats when new memories are revealed

#### Scenario: US2 - Navigate without losing the atlas 2

- **GIVEN** the user pauses motion or requests reduced motion
- **WHEN** data, focus, or camera state changes
- **THEN** the semantic result remains visible without continuous drift or nonessential animation

#### Scenario: US2 - Navigate without losing the atlas 3

- **GIVEN** any supported desktop or mobile viewport
- **WHEN** the user is viewing any part of the graph
- **THEN** one compact set of fit, zoom, pause, and reset controls remains visible inside the atlas

#### Scenario: US2 - Navigate without losing the atlas 4

- **GIVEN** a selected memory with unseen neighbors
- **WHEN** the user reveals connections
- **THEN** new nodes enter around their real frontier, the camera remains usable, and existing nodes are not abruptly replaced

### Requirement: Stable spatial interaction

Pointer and keyboard pan, zoom, focus, drag, and traversal MUST preserve selection and camera continuity, use the current world projection, and never require a pointer-only prerequisite.

#### Scenario: US2 - Navigate without losing the atlas 1

- **GIVEN** normal motion preferences
- **WHEN** the graph finishes its initial entrance
- **THEN** it retains subtle bounded ambient motion and visibly reheats when new memories are revealed

#### Scenario: US2 - Navigate without losing the atlas 2

- **GIVEN** the user pauses motion or requests reduced motion
- **WHEN** data, focus, or camera state changes
- **THEN** the semantic result remains visible without continuous drift or nonessential animation

#### Scenario: US2 - Navigate without losing the atlas 3

- **GIVEN** any supported desktop or mobile viewport
- **WHEN** the user is viewing any part of the graph
- **THEN** one compact set of fit, zoom, pause, and reset controls remains visible inside the atlas

#### Scenario: US2 - Navigate without losing the atlas 4

- **GIVEN** a selected memory with unseen neighbors
- **WHEN** the user reveals connections
- **THEN** new nodes enter around their real frontier, the camera remains usable, and existing nodes are not abruptly replaced

### Requirement: In-place non-modal inspector

Selecting a memory MUST open a bounded non-modal inspector inside the atlas context, keep the graph visible, and provide human-readable summary, provenance, relationships, and supported exploration actions.

#### Scenario: US3 - Inspect a memory in place 1

- **GIVEN** a visible memory
- **WHEN** it is selected
- **THEN** a non-modal inspector opens inside the atlas boundary and the graph remains visible behind or beside the bounded overlay

#### Scenario: US3 - Inspect a memory in place 2

- **GIVEN** the page or graph is not at its initial position
- **WHEN** selection opens or updates the inspector
- **THEN** document scroll does not jump and autofocus does not move the user to the top of the page

#### Scenario: US3 - Inspect a memory in place 3

- **GIVEN** an open inspector
- **WHEN** another node is focused through pointer, keyboard, history, or a connected-memory action
- **THEN** URL, graph highlight, semantic navigator, inspector, and focus trail describe the same node

#### Scenario: US3 - Inspect a memory in place 4

- **GIVEN** the inspector opens or closes on desktop
- **WHEN** its visibility changes
- **THEN** it does not permanently remove a fixed column from the graph or force the world into a different aspect ratio

### Requirement: Scroll and focus stability

Opening, updating, or closing selection details MUST NOT change document scroll position, unexpectedly steal keyboard focus, or move the user to the top of the page.

#### Scenario: US3 - Inspect a memory in place 1

- **GIVEN** a visible memory
- **WHEN** it is selected
- **THEN** a non-modal inspector opens inside the atlas boundary and the graph remains visible behind or beside the bounded overlay

#### Scenario: US3 - Inspect a memory in place 2

- **GIVEN** the page or graph is not at its initial position
- **WHEN** selection opens or updates the inspector
- **THEN** document scroll does not jump and autofocus does not move the user to the top of the page

#### Scenario: US3 - Inspect a memory in place 3

- **GIVEN** an open inspector
- **WHEN** another node is focused through pointer, keyboard, history, or a connected-memory action
- **THEN** URL, graph highlight, semantic navigator, inspector, and focus trail describe the same node

#### Scenario: US3 - Inspect a memory in place 4

- **GIVEN** the inspector opens or closes on desktop
- **WHEN** its visibility changes
- **THEN** it does not permanently remove a fixed column from the graph or force the world into a different aspect ratio

### Requirement: Restorable atlas state

Canonical scope, focused node, focus trail, active instrument, dock state where appropriate, and usable viewport MUST remain synchronized through pointer/keyboard pivots, deep links, and browser history recovery.

#### Scenario: US3 - Inspect a memory in place 1

- **GIVEN** a visible memory
- **WHEN** it is selected
- **THEN** a non-modal inspector opens inside the atlas boundary and the graph remains visible behind or beside the bounded overlay

#### Scenario: US3 - Inspect a memory in place 2

- **GIVEN** the page or graph is not at its initial position
- **WHEN** selection opens or updates the inspector
- **THEN** document scroll does not jump and autofocus does not move the user to the top of the page

#### Scenario: US3 - Inspect a memory in place 3

- **GIVEN** an open inspector
- **WHEN** another node is focused through pointer, keyboard, history, or a connected-memory action
- **THEN** URL, graph highlight, semantic navigator, inspector, and focus trail describe the same node

#### Scenario: US3 - Inspect a memory in place 4

- **GIVEN** the inspector opens or closes on desktop
- **WHEN** its visibility changes
- **THEN** it does not permanently remove a fixed column from the graph or force the world into a different aspect ratio

#### Scenario: US5 - Shape the view without shrinking it 1

- **GIVEN** filter metadata is ready
- **WHEN** the user opens the filter control
- **THEN** the shared Project, Session, Topic, Connection, Memory type, and Field of view selectors appear in a bounded overlay attached to the atlas

#### Scenario: US5 - Shape the view without shrinking it 2

- **GIVEN** filters are collapsed
- **WHEN** the user explores the graph
- **THEN** only concise active-scope cues remain and the full filter form does not reserve permanent graph height

#### Scenario: US5 - Shape the view without shrinking it 3

- **GIVEN** a filter, focus, or frontier change
- **WHEN** browser Back or Forward is used
- **THEN** canonical scope, focused node, dock context, and a usable graph viewport are restored

### Requirement: Spatial frontier expansion

Progressive graph pages and explicit neighbor pivots MUST merge stable node and edge identities without duplicates or dangling endpoints, preserve already loaded graph context, and distinguish loading, partial, complete, superseded, and failed outcomes.

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

### Requirement: Semantic renderer parity

The DOM-backed graph navigator MUST expose the same visible and focused nodes, connected-neighbor actions, and command outcomes as the rich renderer, including during renderer failure and recovery.

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

### Requirement: Bounded asynchronous lifecycle

Scope pagination, progressive merges, selector positioning, visibility handling, animation, and renderer work MUST be abortable or generation-guarded and MUST release all requests, timers, frames, observers, listeners, simulations, portals, and owned test resources when superseded or unmounted.

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

### Requirement: Stable full-atlas geometry

Progressive loading and continuous simulation MUST retain a stable world aspect and community distribution, preserve user camera/focus after interaction, and perform at most one automatic final whole-graph fit when the user has not changed the viewport.

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

### Requirement: Semantic completeness replaces raw completeness

The default atlas MUST represent the complete current scoped observation set through community membership and aggregate counts, but MUST NOT automatically fetch or render every raw session, project, topic, fact, and helper identity as peer nodes.

#### Scenario: US2 - Survey the complete memory universe 1

- **GIVEN** a sufficiently large active scope
- **WHEN** Universe loads
- **THEN** it shows between 30 and 150 deterministic community galaxies whose member counts sum to the exact current observation count

#### Scenario: US2 - Survey the complete memory universe 2

- **GIVEN** project, session, type, topic, and other high-degree metadata relationships
- **WHEN** communities and layout forces are constructed
- **THEN** those facets do not merge otherwise unrelated memories or act as physical superhubs

#### Scenario: US2 - Survey the complete memory universe 3

- **GIVEN** a natural community larger than the Community navigation budget
- **WHEN** the Universe projection is committed
- **THEN** it is deterministically subdivided until every navigable community respects the configured upper bound

#### Scenario: US2 - Survey the complete memory universe 4

- **GIVEN** relationships between memories in different communities
- **WHEN** Universe renders
- **THEN** one weighted aggregate connection represents the bounded cross-community relationship strength instead of drawing every raw relationship

#### Scenario: US2 - Survey the complete memory universe 5

- **GIVEN** observations without eligible semantic relationships
- **WHEN** Universe renders
- **THEN** they are assigned deterministically to explicit unclustered groups rather than placed as unexplained distant stars

### Requirement: Restorable semantic drilldown

URL and navigation state MUST encode semantic level, stable community identity when applicable, active scope using opaque facet tokens rather than private-bearing canonical values, and focused observation when applicable. Observatory Context MUST accept token scope and mint one opaque context token; Recall hits and Pivot outcomes MUST return private-safe facet references plus the current owning community without raw canonical values. Search pivots, canvas/semantic activation, in-app trail controls, browser history, invalid-state recovery, Lens, and camera MUST remain synchronized.

#### Scenario: US3 - Move from galaxy to memory and its synapses 1

- **GIVEN** a Universe galaxy
- **WHEN** the user activates it
- **THEN** Community displays only its assigned observation memories, bounded to 1,000 or fewer, with project/session/topic/type available as facets rather than peer stars

#### Scenario: US3 - Move from galaxy to memory and its synapses 2

- **GIVEN** a Community memory
- **WHEN** the user focuses it
- **THEN** Neighborhood displays that memory plus the most relevant one- or two-hop observations and supporting facts within a 300-node cap

#### Scenario: US3 - Move from galaxy to memory and its synapses 3

- **GIVEN** a level transition
- **WHEN** the user uses in-app Back/Forward or browser history
- **THEN** level, community, scope, focused observation, semantic navigator, Lens, and usable camera restore coherently without appending duplicate trail entries

#### Scenario: US3 - Move from galaxy to memory and its synapses 4

- **GIVEN** a search result outside the currently open Community
- **WHEN** the user pivots to it through the token-safe Observatory Context/Recall/Pivot flow
- **THEN** its owning community and bounded Neighborhood become visible with the same opaque-token scope and without loading the raw global graph or serializing canonical facet values

#### Scenario: US3 - Move from galaxy to memory and its synapses 5

- **GIVEN** different zoom levels or focus states
- **WHEN** links render
- **THEN** Universe shows aggregate links, Community shows relevant observation relationships, and Neighborhood shows complete local supporting relationships without changing the underlying membership of that level

### Requirement: Explicit Raw diagnostic mode

Corrected heterogeneous Raw graph MUST be opt-in through bounded technical disclosure, MUST be absent from normal semantic loading, MUST identify itself as diagnostic rather than a memory count, and MUST warn or refuse rich rendering beyond a documented safe density while preserving query/export access.

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 1

- **GIVEN** the normal observatory route
- **WHEN** it loads
- **THEN** it requests and renders semantic Universe rather than the raw heterogeneous graph

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 2

- **GIVEN** the user explicitly opens bounded technical diagnostics
- **WHEN** Raw graph mode is confirmed
- **THEN** the corrected heterogeneous projection is available with its true entity/relationship counts and a clear large-graph warning

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 3

- **GIVEN** missing, stale, rebuilding, failed, or degraded community artifacts
- **WHEN** a semantic level is requested
- **THEN** the atlas uses a deterministic bounded fallback or exposes one truthful recovery action without hiding current observations

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 4

- **GIVEN** WebGL failure or reduced motion
- **WHEN** the active semantic level changes
- **THEN** the synchronized DOM navigator, filters, focus, counts, and recovery remain operable without nonessential animation

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 5

- **GIVEN** private-marked source values or superseded requests
- **WHEN** responses, labels, diagnostics, or asynchronous callbacks resolve
- **THEN** private content and stale state cannot enter the DOM, URL, canvas-adjacent labels, or external network traffic

### Requirement: Accessible private-safe level parity

Every semantic level, facet, count, transition, empty/degraded state, Raw diagnostic entry, and renderer recovery MUST retain keyboard and DOM-backed semantic equivalents, reduced-motion behavior, private-marker removal, opaque facet tokens in URLs and request metadata, same-origin networking, responsive reachability, and bounded cleanup of requests, workers, timers, frames, observers, simulations, browser processes, and temporary profiles.

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 1

- **GIVEN** the normal observatory route
- **WHEN** it loads
- **THEN** it requests and renders semantic Universe rather than the raw heterogeneous graph

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 2

- **GIVEN** the user explicitly opens bounded technical diagnostics
- **WHEN** Raw graph mode is confirmed
- **THEN** the corrected heterogeneous projection is available with its true entity/relationship counts and a clear large-graph warning

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 3

- **GIVEN** missing, stale, rebuilding, failed, or degraded community artifacts
- **WHEN** a semantic level is requested
- **THEN** the atlas uses a deterministic bounded fallback or exposes one truthful recovery action without hiding current observations

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 4

- **GIVEN** WebGL failure or reduced motion
- **WHEN** the active semantic level changes
- **THEN** the synchronized DOM navigator, filters, focus, counts, and recovery remain operable without nonessential animation

#### Scenario: US4 - Retain diagnostics, access, and lifecycle safety 5

- **GIVEN** private-marked source values or superseded requests
- **WHEN** responses, labels, diagnostics, or asynchronous callbacks resolve
- **THEN** private content and stale state cannot enter the DOM, URL, canvas-adjacent labels, or external network traffic
