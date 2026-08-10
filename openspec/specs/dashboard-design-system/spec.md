# Dashboard Design System Specification

## Purpose

Durable behavioral contract for `dashboard-design-system`.

## Requirements

### Requirement: Semantic celestial encoding

The graph MUST present memories as circular neuron-like nodes with degree-scaled size, deterministic community color, curved directed relationships, selected/neighbor halos, and locally rendered motion. It MUST NOT encode primary node kinds as tiny geometric glyphs that require a legend to identify.

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

All user-visible stored text MUST pass the established private-marker sanitization boundary before rendering in graph, inspector, recall, timeline, ledger, trace, search, or administrative result surfaces.

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

Graph motion MUST communicate loading, focus, expansion, and camera changes through short interruptible transitions, MUST provide pause, and MUST remove nonessential animation when reduced motion is requested.

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
