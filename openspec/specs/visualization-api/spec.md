# Visualization API Specification

## Requirements

### Requirement: Visualization API MUST Provide an Observatory Query Model
Dashboard-facing and MCP-consumed observatory reads MUST share compatible scope controls for pivoting across recall, map, timeline, ledger, and related surfaces.

#### Scenario: Shared scope can drive multiple surfaces
- GIVEN the dashboard requests observatory data with project/session/topic/time scope
- WHEN surface-specific reads are performed
- THEN each surface response MUST be derivable under that same scoped context without requiring scope reinterpretation

#### Scenario: Surface-specific responses remain compatible
- GIVEN the same scoped observatory context
- WHEN the dashboard requests map, timeline, ledger, and health payloads
- THEN responses MUST be shape-compatible for coordinated client state and cross-surface pivots

### Requirement: Visualization API MUST Preserve Pivot Context Tokens
Pivot-capable responses MUST include stable context tokens or equivalent bounded references that allow dashboard pivots between recall, map, timeline, and ledger without losing active scope and focus.

#### Scenario: Recall result includes pivot context for map and ledger
- GIVEN a recall-oriented dashboard response under active filters
- WHEN results are returned
- THEN each pivotable result MUST include context sufficient to open related map neighborhood and provenance ledger views with the same scope

#### Scenario: Timeline and map selections carry compatible context
- GIVEN a timeline event or map entity is selected
- WHEN the dashboard requests a pivot into another observatory surface
- THEN API contracts MUST preserve focus identity and active scope boundaries through the pivot

### Requirement: Visualization API MUST Expose Frontier Traversal Semantics for Depth and Expand
Neighbor expansion and depth traversal operations MUST return frontier semantics that distinguish newly added entities, already-visible entities, and exhausted frontiers.

#### Scenario: Expansion identifies newly added entities
- GIVEN a selected entity with a partially rendered neighborhood
- WHEN expansion is requested
- THEN the API MUST return incremental frontier additions and identify which additions are newly introduced in that step

#### Scenario: Expansion identifies exhausted frontier
- GIVEN no unseen neighbors remain within bounded traversal constraints
- WHEN expansion is requested
- THEN the API MUST return an explicit exhausted-frontier outcome instead of repeating prior results as if new

### Requirement: Visualization API MUST Return Provenance-Rich, Structured Memory Semantics
Visualization and observatory payloads MUST expose observable provenance, observation type, What/Why/Where/Learned fields when available, topic keys, session/project identities, vector/graph evidence attribution, and provenance references needed for explanation, and MUST distinguish current facts from historical data.

#### Scenario: Ledger-capable payload includes structured fields
- GIVEN a dashboard request for observation-level or fact-level detail
- WHEN detail payload is returned
- THEN structured What/Why/Where/Learned fields and provenance references MUST be included when present in source data

#### Scenario: Evidence attribution remains explicit
- GIVEN retrieval or relationship evidence is returned to dashboard surfaces
- WHEN payloads are inspected
- THEN lane/relationship provenance metadata MUST identify the evidence source class needed for user explanation

### Requirement: Visualization API MUST Support Filtered and Pivoted Retrieval Across Observatory Surfaces
The API MUST support filtered and pivoted retrieval by project, session, topic key, observation type, relation type/class, semantic neighborhood depth, and text query where applicable, and MUST preserve scope continuity across observatory surface pivots.

#### Scenario: Scoped retrieval remains stable across pivots
- GIVEN a request with project, session, topic, and time filters
- WHEN a pivot chain crosses multiple observatory surfaces
- THEN each follow-up response MUST preserve compatible scope semantics unless an explicit user scope change is requested

#### Scenario: Query-constrained candidates remain pivotable
- GIVEN a request includes text query plus structured filters
- WHEN candidates are returned
- THEN those candidates MUST carry sufficient scoped references to pivot into map/timeline/ledger views without scope loss

### Requirement: Visualization API MUST Provide Neighbor Expansion Contracts with Incremental Frontier State
The API MUST provide neighbor expansion operations that accept a selected entity and bounded traversal depth and MUST return additional elements with explicit frontier state rather than opaque repeated subgraphs.

#### Scenario: Deterministic expansion includes frontier classification
- GIVEN repeated expansion requests with the same scope and unchanged data
- WHEN expansion executes
- THEN expansion results MUST remain deterministic and include frontier classification for added/already-visible/exhausted outcomes

#### Scenario: Expansion remains bounded while signaling continuation
- GIVEN a traversal step exceeds configured bounds
- WHEN the API returns that step result
- THEN the response MUST enforce bounds and signal continuation/frontier status compatible with progressive exploration

## ADDED for graph-navigation-v2

### Requirement: Observatory Contracts MUST Provide MCP-Compatible Navigation Primitives
The observatory contracts MUST support neighborhood, ledger, timeline, and community reads with bounded continuation/omission metadata suitable for MCP graph navigation without a dedicated MCP reader tool.

### Requirement: Observatory Ledger History MUST Remain Current-State By Default
Structured ledger/detail contracts MUST return current-state output by default and include retained superseded facts only via explicit history-inclusive input.

### Requirement: Frontier Navigation MUST Report Incremental State
Map/neighborhood expansion contracts MUST return frontier state that separates newly added nodes, already-visible nodes, and continuation/exhaustion for bounded progressive navigation.

### Requirement: Community Summary Reads MUST Remain Inspection-Oriented
Community summary APIs MUST expose bounded status and committed-summary inspection metadata and must not claim global-answer capabilities.

### Requirement: Complete scoped graph pagination

The visualization graph contract MUST provide deterministic scope-bound continuation pages with stable ordering, no artificial total-result cap, an explicit terminal continuation state, and page-level bounds that protect each request. Every cursor MUST identify one validated current graph generation; insertion, deletion, update, or supersession between pages MUST invalidate that cursor so the client can discard the mixed accumulator and automatically restart from a fresh first page within a bounded budget.

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

### Requirement: Collision-resistant visualization identity

Every derived visualization node, aggregate, and relationship identity MUST hash the complete canonical kind and value with a stable collision-resistant representation; it MUST NOT truncate a human-readable value prefix, merge distinct canonical values, or change with input order, pagination, scope replay, or process restart.

#### Scenario: US1 - Trust what the atlas counts and connects 1

- **GIVEN** distinct canonical values with identical long prefixes
- **WHEN** visualization identities are derived repeatedly
- **THEN** every distinct value receives one distinct stable identity and equivalent values reuse the same identity

#### Scenario: US1 - Trust what the atlas counts and connects 2

- **GIVEN** an observation with project, session, type, topic, and content facts
- **WHEN** raw diagnostic topology is assembled
- **THEN** no unconnected topic helper or duplicate representation of the same project relationship is created

#### Scenario: US1 - Trust what the atlas counts and connects 3

- **GIVEN** a mixed visualization payload
- **WHEN** counts are presented
- **THEN** observation memories, projects, communities, supporting entities, and relationships are counted by their actual semantic role

#### Scenario: US1 - Trust what the atlas counts and connects 4

- **GIVEN** legacy observations with incomplete KG or semantic coverage
- **WHEN** the semantic projection is built
- **THEN** every current observation remains represented and missing derived evidence is reported without inventing relationships

#### Scenario: US1 - Trust what the atlas counts and connects 5

- **GIVEN** two distinct project, session, or topic values whose private-safe labels are identical
- **WHEN** facet choices and scoped reads are produced
- **THEN** each retains one stable opaque token that resolves to exactly its own internal value while neither source value enters the DOM, URL, request metadata, or response text

### Requirement: Corrected heterogeneous topology

Raw diagnostic projection MUST create at most one node for one canonical entity, MUST connect every emitted non-isolate through an explicit relationship, MUST NOT emit duplicate project/topic representations for one semantic relationship, and MUST NOT emit dangling edge endpoints.

#### Scenario: US1 - Trust what the atlas counts and connects 1

- **GIVEN** distinct canonical values with identical long prefixes
- **WHEN** visualization identities are derived repeatedly
- **THEN** every distinct value receives one distinct stable identity and equivalent values reuse the same identity

#### Scenario: US1 - Trust what the atlas counts and connects 2

- **GIVEN** an observation with project, session, type, topic, and content facts
- **WHEN** raw diagnostic topology is assembled
- **THEN** no unconnected topic helper or duplicate representation of the same project relationship is created

#### Scenario: US1 - Trust what the atlas counts and connects 3

- **GIVEN** a mixed visualization payload
- **WHEN** counts are presented
- **THEN** observation memories, projects, communities, supporting entities, and relationships are counted by their actual semantic role

#### Scenario: US1 - Trust what the atlas counts and connects 4

- **GIVEN** legacy observations with incomplete KG or semantic coverage
- **WHEN** the semantic projection is built
- **THEN** every current observation remains represented and missing derived evidence is reported without inventing relationships

#### Scenario: US1 - Trust what the atlas counts and connects 5

- **GIVEN** two distinct project, session, or topic values whose private-safe labels are identical
- **WHEN** facet choices and scoped reads are produced
- **THEN** each retains one stable opaque token that resolves to exactly its own internal value while neither source value enters the DOM, URL, request metadata, or response text

### Requirement: Universe aggregate contract

Universe reads MUST return bounded community nodes with stable IDs, private-safe human labels, member/project counts, coverage/freshness state, and weighted cross-community edges whose provenance counts are traceable without returning every raw edge.

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

### Requirement: Community detail contract

Community reads MUST return the complete assigned observation set for one stable community within the 1,000-observation budget, relevant observation-to-observation relationships, facet summaries, deterministic continuation where needed, and an explicit outcome when an old community identity is no longer current.

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

### Requirement: Bounded Neighborhood contract

Neighborhood reads MUST accept one focused observation, preserve active scope, expose one- or two-hop relevant observation relationships plus supporting fact/provenance nodes, cap the rendered result at 300 nodes with explicit continuation or omission metadata, and retain deterministic frontier semantics.

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

### Requirement: Generation-consistent semantic reads

Scope, level, region, focus, and generation MUST own independent abort/generation guards; superseded projection, region-detail, renderer, overlay, simulation, timer, worker, observer, and animation work MUST stop without publishing stale state.

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

### Requirement: Semantic zoom Community projection

A Community read that explicitly requests semantic-zoom presentation MUST report complete source membership and relationship totals but return a bounded visual working set: all observations when source membership is at most 180, otherwise 80–180 deterministic representative observations, plus no more than 450 prepared visual relationship identities in total across observation-endpoint edges and region-anchor bridges. The existing unqualified complete Community pagination remains available to public consumers but is not used by the default dashboard.

#### Scenario: US2 - Explore one constellation without a hairball 1

- **GIVEN** a Community with more memories than the visual budget
- **WHEN** it opens
- **THEN** the response reports its exact source membership while the renderer prepares only a bounded representative working set

#### Scenario: US2 - Explore one constellation without a hairball 2

- **GIVEN** a sufficiently large Community
- **WHEN** its internal projection is partitioned
- **THEN** 6–12 deterministic semantic regions cover every member exactly once and oversized regions are recursively split

#### Scenario: US2 - Explore one constellation without a hairball 3

- **GIVEN** region evidence
- **WHEN** region names are derived
- **THEN** high-frequency excluded metadata cannot name every region identically and private-safe deterministic fallbacks distinguish regions that lack useful semantic evidence

#### Scenario: US2 - Explore one constellation without a hairball 4

- **GIVEN** dense internal relationships
- **WHEN** Community is in its overview band
- **THEN** region contours and weighted region-to-region bridges communicate structure while the full internal edge set is not emitted or drawn

#### Scenario: US2 - Explore one constellation without a hairball 5

- **GIVEN** a small Community within the visual budget
- **WHEN** it opens
- **THEN** every assigned observation may be represented while link presentation still follows the level-aware relevance policy

### Requirement: Representative sampling

Community representatives MUST be selected deterministically using bounded structural importance, cross-region bridge contribution, evidence strength, recency, and diversity across regions and facets; the response MUST expose why an item represents its region without exposing private source values.

#### Scenario: US2 - Explore one constellation without a hairball 1

- **GIVEN** a Community with more memories than the visual budget
- **WHEN** it opens
- **THEN** the response reports its exact source membership while the renderer prepares only a bounded representative working set

#### Scenario: US2 - Explore one constellation without a hairball 2

- **GIVEN** a sufficiently large Community
- **WHEN** its internal projection is partitioned
- **THEN** 6–12 deterministic semantic regions cover every member exactly once and oversized regions are recursively split

#### Scenario: US2 - Explore one constellation without a hairball 3

- **GIVEN** region evidence
- **WHEN** region names are derived
- **THEN** high-frequency excluded metadata cannot name every region identically and private-safe deterministic fallbacks distinguish regions that lack useful semantic evidence

#### Scenario: US2 - Explore one constellation without a hairball 4

- **GIVEN** dense internal relationships
- **WHEN** Community is in its overview band
- **THEN** region contours and weighted region-to-region bridges communicate structure while the full internal edge set is not emitted or drawn

#### Scenario: US2 - Explore one constellation without a hairball 5

- **GIVEN** a small Community within the visual budget
- **WHEN** it opens
- **THEN** every assigned observation may be represented while link presentation still follows the level-aware relevance policy

### Requirement: Stable focused-region replacement

Focused-region detail MUST be generation-, scope-, Community-, and region-bound, MUST preserve unchanged representative identities and camera anchors, MUST remain within the Community visual budget, and MUST reject stale, wrong-region, or mixed-generation responses before mutating visible state.

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

### Requirement: Relationship explanation

Aggregate and representative relationships MUST carry stable class, direction, confidence band, evidence count, and bounded provenance suitable for both visual encoding and accessible explanation; unknown evidence MUST be explicit rather than inferred in presentation.

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
