# Dashboard Control Room Specification

## Purpose

Durable behavioral contract for `dashboard-control-room`.

## Requirements

### Requirement: Honest capability states

An unavailable or degraded instrument MUST identify its capability state and fallback independently without blocking supported graph navigation or other instruments.

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

### Requirement: Secondary control room

The Control Room MUST group administrative capabilities by user goal, explain scope and impact in plain language, and keep operation identifiers or raw evidence subordinate to safe primary outcomes.

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

### Requirement: Confirmed state-changing actions

State-changing or expensive commands MUST show their effective scope and impact, require an explicit confirmation, prevent duplicate submission while pending, and present success or failure evidence.

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
