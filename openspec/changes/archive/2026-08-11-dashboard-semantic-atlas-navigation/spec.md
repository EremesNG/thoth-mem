# Feature Specification: Semantic Neural Atlas Navigation

**Change ID**: `dashboard-semantic-atlas-navigation`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: The complete Neural Atlas currently treats observations, sessions, projects, topics, and relationship helper entities as equivalent “memories”. Large stores therefore report misleading memory counts, produce metadata-driven superhubs and orphan nodes, and collapse into an unnavigable hairball. Users need a complete mental model of their memory without rendering every raw graph entity at the same visual level.<br>
**Impact**: The default atlas will represent every current scoped observation through deterministic semantic communities and support three restorable levels: Universe, Community, and Neighborhood. Universe shows bounded community galaxies, Community shows the observations assigned to one galaxy, and Neighborhood reveals bounded supporting facts and provenance around one memory. Raw heterogeneous graph inspection remains available only through an explicit diagnostic mode. Stable collision-resistant identities, corrected raw topology, truthful counts, generation-safe reads, private-safe presentation, semantic fallback, keyboard parity, and Cosmos lifecycle guarantees remain mandatory.<br>
**Affected capabilities**: `knowledge-graph`, `visualization-api`, `dashboard-memory-navigation`, `dashboard`, `dashboard-design-system`

## User stories

### US1 - Trust what the atlas counts and connects (Priority: P1)

As a user with a long-lived memory store, I can trust that memories, facets, and supporting facts have distinct identities and roles so that the graph does not invent hubs, duplicates, or isolated entities.

**Independent test**: Build visualization data from observations whose projects, sessions, topics, and fact values share long prefixes or differ only inside private markers; verify stable collision-resistant IDs, distinct opaque facet tokens with private-safe labels, exact token resolution, connected endpoints, corrected raw relationships, and truthful memory/entity counts across ordering, pagination, and process restarts.

**Covers**: FR-001, FR-002, FR-003, FR-004, SC-001, SC-002, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** distinct canonical values with identical long prefixes, **When** visualization identities are derived repeatedly, **Then** every distinct value receives one distinct stable identity and equivalent values reuse the same identity.
2. **Given** an observation with project, session, type, topic, and content facts, **When** raw diagnostic topology is assembled, **Then** no unconnected topic helper or duplicate representation of the same project relationship is created.
3. **Given** a mixed visualization payload, **When** counts are presented, **Then** observation memories, projects, communities, supporting entities, and relationships are counted by their actual semantic role.
4. **Given** legacy observations with incomplete KG or semantic coverage, **When** the semantic projection is built, **Then** every current observation remains represented and missing derived evidence is reported without inventing relationships.
5. **Given** two distinct project, session, or topic values whose private-safe labels are identical, **When** facet choices and scoped reads are produced, **Then** each retains one stable opaque token that resolves to exactly its own internal value while neither source value enters the DOM, URL, request metadata, or response text.

### US2 - Survey the complete memory universe (Priority: P1)

As a user opening the observatory, I can see a bounded map of meaningful memory communities that represents my complete active scope so that I understand its major regions without confronting thousands of raw entities.

**Independent test**: Mount a production atlas over a deterministic fixture above 6,000 observations with metadata hubs, prefix collisions, disconnected observations, and an oversized natural cluster; verify a bounded Universe of 30–150 community galaxies, exact one-to-one observation assignment, weighted inter-community links, accurate totals, and no raw helper nodes in the default renderer.

**Covers**: FR-005, FR-006, FR-007, FR-008, FR-009, SC-005, SC-006, SC-007, SC-008, SC-009

**Acceptance scenarios**:

1. **Given** a sufficiently large active scope, **When** Universe loads, **Then** it shows between 30 and 150 deterministic community galaxies whose member counts sum to the exact current observation count.
2. **Given** project, session, type, topic, and other high-degree metadata relationships, **When** communities and layout forces are constructed, **Then** those facets do not merge otherwise unrelated memories or act as physical superhubs.
3. **Given** a natural community larger than the Community navigation budget, **When** the Universe projection is committed, **Then** it is deterministically subdivided until every navigable community respects the configured upper bound.
4. **Given** relationships between memories in different communities, **When** Universe renders, **Then** one weighted aggregate connection represents the bounded cross-community relationship strength instead of drawing every raw relationship.
5. **Given** observations without eligible semantic relationships, **When** Universe renders, **Then** they are assigned deterministically to explicit unclustered groups rather than placed as unexplained distant stars.

### US3 - Move from galaxy to memory and its synapses (Priority: P1)

As a user exploring a region of memory, I can move from Universe to Community to Neighborhood and back so that each level reveals the detail appropriate to my current question.

**Independent test**: Starting from Universe, activate a community, choose a memory, expand one and two hops, and traverse browser and in-app history; verify level-specific identities and links, stable focus, exact caps, search pivots, URLs, camera behavior, and equivalent semantic navigation.

**Covers**: FR-010, FR-011, FR-012, FR-013, FR-014, SC-010, SC-011, SC-012, SC-013, SC-014

**Acceptance scenarios**:

1. **Given** a Universe galaxy, **When** the user activates it, **Then** Community displays only its assigned observation memories, bounded to 1,000 or fewer, with project/session/topic/type available as facets rather than peer stars.
2. **Given** a Community memory, **When** the user focuses it, **Then** Neighborhood displays that memory plus the most relevant one- or two-hop observations and supporting facts within a 300-node cap.
3. **Given** a level transition, **When** the user uses in-app Back/Forward or browser history, **Then** level, community, scope, focused observation, semantic navigator, Lens, and usable camera restore coherently without appending duplicate trail entries.
4. **Given** a search result outside the currently open Community, **When** the user pivots to it through the token-safe Observatory Context/Recall/Pivot flow, **Then** its owning community and bounded Neighborhood become visible with the same opaque-token scope and without loading the raw global graph or serializing canonical facet values.
5. **Given** different zoom levels or focus states, **When** links render, **Then** Universe shows aggregate links, Community shows relevant observation relationships, and Neighborhood shows complete local supporting relationships without changing the underlying membership of that level.

### US4 - Retain diagnostics, access, and lifecycle safety (Priority: P1)

As an operator or keyboard/fallback user, I can diagnose raw topology and navigate every semantic level without sacrificing privacy, accessibility, performance, or recovery.

**Independent test**: Exercise all three levels and explicit Raw diagnostic mode at desktop, tablet, mobile, 200% scale, reduced motion, coarse pointer, WebGL initialization/context failure, generation invalidation, rapid scope changes, and unmount; verify bounded state, private-safe local traffic, semantic fallback, Retry, and complete owned-resource cleanup.

**Covers**: FR-015, FR-016, FR-017, FR-018, SC-015, SC-016, SC-017, SC-018, SC-019

**Acceptance scenarios**:

1. **Given** the normal observatory route, **When** it loads, **Then** it requests and renders semantic Universe rather than the raw heterogeneous graph.
2. **Given** the user explicitly opens bounded technical diagnostics, **When** Raw graph mode is confirmed, **Then** the corrected heterogeneous projection is available with its true entity/relationship counts and a clear large-graph warning.
3. **Given** missing, stale, rebuilding, failed, or degraded community artifacts, **When** a semantic level is requested, **Then** the atlas uses a deterministic bounded fallback or exposes one truthful recovery action without hiding current observations.
4. **Given** WebGL failure or reduced motion, **When** the active semantic level changes, **Then** the synchronized DOM navigator, filters, focus, counts, and recovery remain operable without nonessential animation.
5. **Given** private-marked source values or superseded requests, **When** responses, labels, diagnostics, or asynchronous callbacks resolve, **Then** private content and stale state cannot enter the DOM, URL, canvas-adjacent labels, or external network traffic.

## Edge cases

- Empty scopes, one observation, fewer than 30 observations, no eligible relationships, and every observation initially unclustered.
- Similar-prefix and Unicode project/session/topic/fact values, repeated equivalent canonical values, hash determinism across row order and process restart, and an intentionally injected hash collision.
- One natural community containing most of the scope, many singleton communities, bridge observations, true semantic hubs, metadata god nodes, and disconnected components.
- Observations participating in multiple KG communities, missing/stale community snapshots, partial KG coverage, missing embeddings, failed or concurrent community rebuilds, and legacy observations created before current indexing.
- Deleted or superseded observations/facts, mutation between pages, stale/replayed/scope-mismatched cursors, repeated invalidation beyond the automatic restart budget, and partial page failure.
- Community or Neighborhood deep links whose community/focus was deleted, reassigned, or falls outside the active filters.
- Search pivots across communities, rapid Universe/Community/Neighborhood transitions, browser Back/Forward, renderer retry, route replacement, and unmount.
- Expired or invalid Observatory context/pivot tokens, Recall hits whose observation changed community after context creation, and token-scoped search results whose owning community becomes stale before activation.
- Raw diagnostic graphs above safe interactive density, explicit operator cancellation, WebGL failure, and semantic fallback with a very large source store.
- Private markers in community names, summaries, observation labels, facets, fact values, errors, and technical diagnostics.

## Functional requirements

- **FR-001 — Collision-resistant visualization identity**: `[ADDED visualization-api]` Every derived visualization node, aggregate, and relationship identity MUST hash the complete canonical kind and value with a stable collision-resistant representation; it MUST NOT truncate a human-readable value prefix, merge distinct canonical values, or change with input order, pagination, scope replay, or process restart.
- **FR-002 — Corrected heterogeneous topology**: `[ADDED visualization-api]` Raw diagnostic projection MUST create at most one node for one canonical entity, MUST connect every emitted non-isolate through an explicit relationship, MUST NOT emit duplicate project/topic representations for one semantic relationship, and MUST NOT emit dangling edge endpoints.
- **FR-003 — Truthful graph accounting**: `[ADDED dashboard]` User-facing atlas counts MUST distinguish current observation memories, projects, semantic communities, supporting entities, and relationships; aggregate or helper nodes MUST NOT be labeled or counted as memories.
- **FR-004 — Complete legacy-safe representation**: `[ADDED knowledge-graph]` Semantic projection MUST include every current scoped observation exactly once even when KG, embedding, topic, or community-summary coverage is absent, and MUST expose bounded coverage/degraded metadata instead of dropping or fabricating memory relationships.
- **FR-005 — Observation-to-observation projection**: `[ADDED knowledge-graph]` Atlas communities MUST be detected from a deterministic weighted projection whose primary nodes are current observations and whose eligible edges represent semantic or structural memory relationships; project, session, type, topic, and synthetic metadata relationships MUST remain facets/provenance and MUST NOT participate as community nodes or clustering edges.
- **FR-006 — Superhub-resistant partitioning**: `[ADDED knowledge-graph]` Deterministic community partitioning MUST exclude configured metadata classes and high-degree projection superhubs from the partitioning decision, then reattach eligible hub observations by deterministic weighted neighborhood evidence so one hub cannot collapse unrelated memory regions.
- **FR-007 — Bounded deterministic communities**: `[ADDED knowledge-graph]` For sufficiently large scopes, partitioning MUST yield 30–150 stable navigable communities; any community above 1,000 observations or the configured maximum scope fraction MUST be recursively and deterministically subdivided, while small scopes MAY yield fewer communities and every observation MUST retain one primary assignment.
- **FR-008 — Semantic completeness replaces raw completeness**: `[ADDED dashboard-memory-navigation]` The default atlas MUST represent the complete current scoped observation set through community membership and aggregate counts, but MUST NOT automatically fetch or render every raw session, project, topic, fact, and helper identity as peer nodes.
- **FR-009 — Universe aggregate contract**: `[ADDED visualization-api]` Universe reads MUST return bounded community nodes with stable IDs, private-safe human labels, member/project counts, coverage/freshness state, and weighted cross-community edges whose provenance counts are traceable without returning every raw edge.
- **FR-010 — Community detail contract**: `[ADDED visualization-api]` Community reads MUST return the complete assigned observation set for one stable community within the 1,000-observation budget, relevant observation-to-observation relationships, facet summaries, deterministic continuation where needed, and an explicit outcome when an old community identity is no longer current.
- **FR-011 — Bounded Neighborhood contract**: `[ADDED visualization-api]` Neighborhood reads MUST accept one focused observation, preserve active scope, expose one- or two-hop relevant observation relationships plus supporting fact/provenance nodes, cap the rendered result at 300 nodes with explicit continuation or omission metadata, and retain deterministic frontier semantics.
- **FR-012 — Level-aware relationship presentation**: `[ADDED dashboard-design-system]` The rich renderer and semantic fallback MUST render aggregate cross-community connections in Universe, relevant observation relationships in Community, and complete bounded local relationships in Neighborhood; zoom/focus adaptation MAY change visual emphasis but MUST NOT silently remove a level's member identities.
- **FR-013 — Restorable semantic drilldown**: `[ADDED dashboard-memory-navigation]` URL and navigation state MUST encode semantic level, stable community identity when applicable, active scope using opaque facet tokens rather than private-bearing canonical values, and focused observation when applicable. Observatory Context MUST accept token scope and mint one opaque context token; Recall hits and Pivot outcomes MUST return private-safe facet references plus the current owning community without raw canonical values. Search pivots, canvas/semantic activation, in-app trail controls, browser history, invalid-state recovery, Lens, and camera MUST remain synchronized.
- **FR-014 — Facets instead of metadata stars**: `[ADDED dashboard]` Project, session, and topic controls MUST use structured choices with one stable opaque token, private-safe label, and bounded count; each token MUST resolve server-side to exactly one internal canonical value even when multiple values have the same safe label. Type and relation controls MUST remain bounded canonical choices. All facets MUST refine or describe Universe and Community as guided controls, counts, labels, or boundaries and MUST NOT appear as equivalent memory stars outside an explicitly requested Neighborhood or Raw diagnostic explanation.
- **FR-015 — Explicit Raw diagnostic mode**: `[ADDED dashboard-memory-navigation]` Corrected heterogeneous Raw graph MUST be opt-in through bounded technical disclosure, MUST be absent from normal semantic loading, MUST identify itself as diagnostic rather than a memory count, and MUST warn or refuse rich rendering beyond a documented safe density while preserving query/export access.
- **FR-016 — Freshness and deterministic fallback**: `[ADDED knowledge-graph]` Semantic atlas reads MUST distinguish fresh, stale, missing, rebuilding, failed, and degraded community state; they MUST prefer committed current artifacts when valid and otherwise use a deterministic bounded local fallback or expose one actionable recovery without requiring embeddings, an LLM, or a remote service.
- **FR-017 — Generation-consistent semantic reads**: `[ADDED visualization-api]` Universe, Community, and Neighborhood pagination or expansion MUST be bound to normalized scope and one validated source/community generation; stale mutations MUST reject mixed continuations, and clients MUST discard invalid accumulators, restart within a bounded budget, and prevent superseded callbacks from mutating the active level.
- **FR-018 — Accessible private-safe level parity**: `[ADDED dashboard-memory-navigation]` Every semantic level, facet, count, transition, empty/degraded state, Raw diagnostic entry, and renderer recovery MUST retain keyboard and DOM-backed semantic equivalents, reduced-motion behavior, private-marker removal, opaque facet tokens in URLs and request metadata, same-origin networking, responsive reachability, and bounded cleanup of requests, workers, timers, frames, observers, simulations, browser processes, and temporary profiles.

## Success criteria

- **SC-001** `[buildable]`: A fixture containing at least 500 distinct canonical values sharing the same first 32 characters produces 500 unique full-value-derived IDs; two distinct private-bearing project/session/topic values with identical private-safe presentation produce distinct stable opaque facet tokens that resolve exactly without leaking either source value; repeated shuffled, paginated, and restarted runs produce the exact same identity and token sets.
- **SC-002** `[buildable]`: Corrected Raw projection over a representative observation produces zero unconnected emitted topic helpers, zero duplicate semantic `IN_PROJECT`/topic relationships, zero dangling endpoints, and one stable node per canonical entity.
- **SC-003** `[buildable]`: A mixed fixture reports all exact separate counts for observations, projects, communities, supporting entities, and relationships; changing helper-node cardinality produces zero change in the reported memory count.
- **SC-004** `[buildable]`: Every current observation lacking KG rows, embeddings, topics, or committed communities remains present in exactly 1 deterministic unclustered assignment and reports bounded missing/degraded coverage.
- **SC-005** `[buildable]`: A deterministic fixture of at least 6,000 observations resolves to 30–150 Universe nodes, every current observation ID belongs to exactly one Universe node, and the sum of member counts equals the exact scoped observation count.
- **SC-006** `[buildable]`: Adding project/session/type/topic metadata hubs or permuting source rows produces zero changes to non-hub community membership, while every eligible high-degree observation hub is deterministically reattached after partitioning.
- **SC-007** `[buildable]`: No committed navigable community contains more than 1,000 observations or more than the configured maximum scope fraction, and repeated rebuilds produce identical membership fingerprints and stable community IDs.
- **SC-008** `[buildable]`: Universe returns at most one edge per community pair; each edge's weight and bounded provenance counts equal the eligible cross-community relationships represented by that pair.
- **SC-009** `[buildable]`: The mounted default route for a 6,000-observation fixture renders 30–150 community galaxies, no raw project/session/topic/ref peer nodes, no request for Raw graph data, one semantic navigator for the active level, and exact memory/project/community totals.
- **SC-010** `[buildable]`: Activating a Universe galaxy opens a Community containing only its assigned observation nodes and relevant relationships, never more than 1,000 observations, while facet controls and counts remain available without becoming force-bearing nodes.
- **SC-011** `[buildable]`: Focusing a Community observation opens a one- or two-hop Neighborhood containing the focus, relevant observation neighbors, and supporting facts/provenance within 300 rendered nodes, with explicit omitted/continuation metadata when more evidence exists.
- **SC-012** `[buildable]`: Universe → Community → Neighborhood → Back → Back → Forward restores URL, level, opaque-token scope, community, focus, GPU state, semantic active row, Lens, and usable camera with zero raw private facet values, zero duplicate trail entries, and zero Raw graph requests.
- **SC-013** `[buildable]`: One token-scoped Observatory Context → Recall → Pivot sequence can open an observation outside the current Community, returns its current owning Community, converges to Neighborhood, preserves every active opaque facet token and history semantic, and emits zero raw project/session/topic values in request metadata or response payloads.
- **SC-014** `[buildable]`: At each semantic level, renderer and semantic fallback expose the same member IDs and focus; Universe uses only aggregate links, Community uses only eligible observation links, and Neighborhood exposes all returned bounded local relationships.
- **SC-015** `[buildable]`: Raw diagnostic mode requires 1 explicit user action, labels all counts as graph entities rather than memories, uses the corrected topology, and warns or stays semantic-only when the configured rich-rendering safety threshold is exceeded.
- **SC-016** `[buildable]`: Fresh, stale, missing, rebuilding, failed, degraded, mutation-invalidated, and retry states each produce one truthful bounded outcome; zero stale pages, worker results, community assignments, or focus callbacks can enter a newer scope or level.
- **SC-017** `[buildable]`: Mounted 1440×900, 1024×768, 360×800, 200% scale, coarse-pointer, reduced-motion, hidden-document, WebGL initialization/context-loss, and Retry runs retain hit-testable controls, zero horizontal overflow, private-safe local-only traffic, distinct selectable opaque options for safe-label-equivalent private facets, and equivalent semantic navigation at all three levels.
- **SC-018** `[buildable]`: Universe and each drilldown transition keep representative pointer/keyboard interaction under 250 ms and produce no retained main-thread task at or above 200 ms on the verification runtime; default Universe never mounts more than 150 GPU or semantic member rows.
- **SC-019** `[outcome]`: Independent review of a long-lived real memory store shows a legible community atlas rather than a raw hairball, reports observation counts rather than entity counts, exposes no unexplained distant topic nodes, and lets a reviewer reach one remembered item and its supporting evidence through at most one search plus one Neighborhood pivot.

## Assumptions

- A “memory” count means current, non-deleted observation rows; deleted observations and superseded KG facts are excluded from default current-state counts.
- Semantic completeness means every current scoped observation is represented exactly once through a primary community assignment, not that every raw supporting entity is simultaneously rendered.
- One observation MAY contribute evidence to several communities internally, but the atlas assigns it to one deterministic primary navigable community for counting, URL restoration, and Universe drilldown.
- For scopes too small to support 30 meaningful groups, Universe MAY contain fewer than 30 communities and MUST never manufacture empty groups.
- Project, session, type, topic, and relation remain canonical guided filters/facets; they are not eligible community nodes or clustering edges.
- Project, session, and topic canonical values remain internal to the Store. Public semantic responses, dashboard state, URLs, and requests use stable opaque facet tokens plus private-safe labels; identical safe labels are disambiguated with a bounded non-secret token suffix when necessary.
- Existing committed community summaries, graph signatures, and source observation IDs MAY seed the semantic projection when fresh; a deterministic offline fallback remains mandatory when they are missing or stale.
- Existing `/viz/graph` generation-safe pagination remains available for Raw diagnostics, but its derived identity/topology defects are corrected and normal observatory entry no longer drains it automatically.
- Cosmos remains the primary rich renderer unless measured implementation evidence justifies a dependency change; the semantic projection, not renderer capacity, owns default density.
- No migration or destructive cleanup of the user's observation database is required for this change.

## Dependencies

- Current observations, KG entities/triples, committed community snapshots and graph signatures, and privacy-safe Store read boundaries.
- Existing scope-generation cursor validation, HTTP/OpenAPI routing, typed dashboard client, full-atlas loader patterns, Cosmos worker/runtime, semantic GraphNavigator, GuidedSelect filters, URL/history coordinator, and browser harness.
- Local deterministic hashing, graph partitioning, and aggregation primitives; no remote service, telemetry, external font, embedding provider, or LLM is required for correctness.

## Out of scope

- Deleting, rewriting, or migrating existing observations merely because they predate embeddings or current KG extraction.
- Changing memory save semantics, embedding models, retrieval ranking, KG extraction taxonomy, or superseded-fact retention policy.
- Treating project/session/topic/type metadata as default graph stars or restoring the raw all-entity atlas as the normal home view.
- Replacing the 2D atlas with 3D/VR, copying Graphify or ArcRift code/assets/branding, or sending graph data to a remote renderer.
- LLM-required community detection or naming, automatic destructive data repair, database VACUUM, or release/deployment work.
