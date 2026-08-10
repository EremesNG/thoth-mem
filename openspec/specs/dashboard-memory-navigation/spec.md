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
