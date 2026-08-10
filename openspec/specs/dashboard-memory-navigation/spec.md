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

Project, session, topic, type, relation, and density MUST use closed or searchable selection controls populated from available visualization metadata, and MUST NOT accept arbitrary values absent from that metadata.

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

Normal mode MUST provide subtle continuous ambient motion plus interruptible settle, focus, camera, and expansion transitions; Pause and reduced motion MUST stop nonessential movement while preserving every state result.

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

Bounded neighbor expansion MUST deduplicate existing graph identity, introduce added nodes near the actual focused frontier through purposeful motion, and report added, already-visible, truncated, continuation, or exhausted outcomes.

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

Scope, focus, frontier, instrument, resize, animation, and renderer work MUST be abortable or generation-guarded as applicable, and all renderer instances, simulations, observers, timers, animation frames, and listeners MUST be released when superseded or unmounted.

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
