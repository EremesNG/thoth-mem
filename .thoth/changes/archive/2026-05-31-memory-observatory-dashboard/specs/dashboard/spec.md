# Delta for Dashboard

## ADDED Requirements
### Requirement: Dashboard MUST Provide a Connected Observatory Workspace
The dashboard MUST present a connected observatory workspace composed of Recall Workspace, Memory Map, Timeline, Knowledge Ledger, and Health & Indexing surfaces in one coordinated product experience.

#### Scenario: Observatory surfaces are available in one workspace
- GIVEN a user opens the dashboard
- WHEN the default dashboard workspace is rendered
- THEN the UI MUST expose all five observatory surfaces as connected, navigable surfaces rather than isolated tools

#### Scenario: Surface state remains coordinated
- GIVEN a user changes project/session/topic/time scope in any observatory surface
- WHEN another surface becomes active
- THEN shared scope state MUST remain synchronized unless the user explicitly resets it

### Requirement: Dashboard MUST Preserve Context Across Cross-Surface Pivots
Cross-surface pivots MUST preserve active context including selected entity focus, project/session scope, topic key filters, time window, retrieval evidence context, and relation filters when available.

#### Scenario: Recall evidence pivots to map without losing scope
- GIVEN Recall Workspace returns ranked evidence under active project, session, and topic filters
- WHEN the user pivots a selected evidence item into Memory Map
- THEN the map MUST open focused on the related entity neighborhood while preserving the active scope and filters

#### Scenario: Timeline event pivots to ledger with preserved context
- GIVEN a user is viewing a constrained timeline window
- WHEN the user pivots from a timeline event into Knowledge Ledger
- THEN ledger provenance and extracted fields MUST load for that event without dropping the current timeline/project/session context

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
Depth controls and neighbor expansion MUST represent bounded graph/semantic traversal frontiers, returning incremental unseen neighborhoods and explicit frontier state (added, already-visible, exhausted) rather than re-showing the same subgraph as expansion progress.

#### Scenario: Depth increases traversal radius
- GIVEN a selected focus node with depth set to N
- WHEN the user increases depth to N+1
- THEN traversal MUST include additional reachable frontier entities for that step when available

#### Scenario: Neighbor expansion reports frontier outcomes
- GIVEN a selected node has partial neighborhood rendered
- WHEN the user invokes expand neighbors
- THEN the dashboard MUST indicate whether new neighbors were added, all candidates were already visible, or no additional neighbors remain

### Requirement: Dashboard MUST Remain Local-First, Privacy-Safe, and Read-Only
The observatory workspace MUST remain local-first and read-only, and MUST preserve privacy-safe rendering boundaries for map, recall, timeline, ledger, and health surfaces.

#### Scenario: Exploration remains non-mutating
- GIVEN a user navigates across all observatory surfaces
- WHEN available actions are inspected
- THEN no create/update/delete memory mutation action MUST be available in this change scope

#### Scenario: Private content remains protected across surfaces
- GIVEN source memory includes private-tagged content
- WHEN summaries, labels, and previews are rendered
- THEN disallowed private-tag content MUST NOT be exposed by default in any observatory surface

## MODIFIED Requirements
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

## REMOVED Requirements
