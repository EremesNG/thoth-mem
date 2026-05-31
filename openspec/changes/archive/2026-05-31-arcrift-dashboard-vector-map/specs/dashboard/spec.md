# Dashboard Specification

## Requirements

### Requirement: Dashboard MUST Default to a Map-First Workspace
The dashboard MUST open to a persistent map-first workspace centered on a live point-cloud/vector map, with supporting controls and inspectors arranged for continuous exploration.

#### Scenario: Default route opens map workspace
- GIVEN a user opens the dashboard without a deep-link override
- WHEN the initial dashboard view is rendered
- THEN the default destination MUST be the vector map workspace rather than a list-first or table-first page

#### Scenario: Workspace includes exploration regions
- GIVEN the map-first dashboard is rendered
- WHEN layout regions are inspected
- THEN the workspace MUST provide filter controls, a central map surface, and a contextual inspector panel

### Requirement: Map Surface MUST Render Semantic and Relational Topology
The map surface MUST represent observations and related entities as nodes and MUST represent nearest-neighbor, KG/fact, session, project, topic-key, observation-type, and relation-class linkages as edge classes or overlays.

#### Scenario: Node and edge classes are represented
- GIVEN map data is loaded for a scoped slice
- WHEN the map renders nodes and edges
- THEN semantic/vector nodes and supported relationship classes MUST be visually represented and distinguishable

#### Scenario: Overlays can combine semantic and graph relations
- GIVEN semantic-neighbor and KG/fact overlays are enabled
- WHEN map rendering updates
- THEN the map MUST display both overlay classes together without mutating source memory

### Requirement: Map Interaction MUST Support Spatial and Semantic Pivoting
The dashboard MUST support zoom, pan, node/edge selection, neighborhood expansion, relation toggles, and pivoting by project, session, topic key, observation type, relation type, semantic depth, and text query where applicable.

#### Scenario: User pivots scope by metadata filters
- GIVEN map data contains multiple projects, sessions, and topic keys
- WHEN the user applies filter pivots
- THEN the visible map slice MUST update to reflect the selected scope filters

#### Scenario: User expands semantic neighborhood
- GIVEN a node is selected
- WHEN the user requests semantic neighborhood expansion with depth N
- THEN additional neighbors up to the requested bounded depth MUST be loaded and rendered

### Requirement: Inspector MUST Provide Provenance Drilldown for Selected Elements
Selecting a node or edge MUST reveal provenance metadata and drilldown paths including source observation or fact identity, project/session/topic context, observation type, relation type/class, and timeline anchors when available.

#### Scenario: Node selection shows source provenance
- GIVEN a rendered map node is selected
- WHEN inspector content loads
- THEN the inspector MUST show source observation or fact metadata with project/session/topic context

#### Scenario: Edge selection shows relation provenance
- GIVEN a rendered map edge is selected
- WHEN inspector content loads
- THEN the inspector MUST show relation class/type plus source linkage and drilldown affordances

### Requirement: Dashboard MUST Preserve Privacy-Safe and Read-Only Behavior
The dashboard MUST remain read-only for memory data and MUST avoid rendering raw private-tag content in map labels, tooltips, legends, and inspector summaries unless already authorized by existing safe rendering policy.

#### Scenario: Dashboard blocks mutation affordances
- GIVEN a user explores map content
- WHEN interaction options are listed
- THEN create/update/delete memory mutation actions MUST NOT be available in dashboard map workflows

#### Scenario: Private content is not leaked in visualization
- GIVEN an observation contains private-tagged segments
- WHEN map-facing summaries are rendered
- THEN rendered map labels and default inspector summaries MUST exclude disallowed private-tag content

### Requirement: Dashboard MUST Handle Empty, Sparse, and Dense States Gracefully
The dashboard MUST provide explicit empty-state messaging, sparse-state usability, and dense-state protections through progressive loading and visual throttling so interaction remains stable.

#### Scenario: Empty scoped slice is explained
- GIVEN active filters return no map nodes
- WHEN the dashboard renders the scoped result
- THEN the UI MUST show an empty-state explanation with guidance for widening scope

#### Scenario: Dense datasets remain interactive
- GIVEN a scoped slice reaches dense-node conditions
- WHEN map data is loaded
- THEN the dashboard MUST use progressive loading behavior and bounded rendering windows to preserve interaction responsiveness
