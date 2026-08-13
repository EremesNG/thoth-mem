# Feature Specification: Bounded Semantic Zoom Navigation

**Change ID**: `dashboard-semantic-zoom-navigation`  
**Route**: Full  
**Status**: Draft

## Intent and scope

**Why**: Universe is now semantically aggregated, but activating one constellation still auto-loads every assigned observation and every internal relationship. A large constellation therefore becomes an opaque edge wall, while sparse or weakly connected communities can appear as rings or remote outliers. The data is complete, yet the view is not navigable.  
**Impact**: The Neural Atlas will separate complete source accounting from the bounded visual working set. Universe remains a complete aggregate map. Community becomes a semantic-zoom field composed of named deterministic subregions, representative memory stars, and a sparse relationship backbone. Neighborhood remains the bounded place where individual supporting relationships become complete. Zoom, region focus, search, history, and keyboard activation will progressively disclose detail without globally draining a Community. Raw graph remains an explicit diagnostic surface.  
**Affected capabilities**: `knowledge-graph`, `visualization-api`, `dashboard-memory-navigation`, `dashboard`, `dashboard-design-system`

## Product vocabulary

- **Source membership**: every current observation assigned to the selected Community, whether rendered or omitted from the current working set.
- **Visual working set**: the bounded observations and relationships prepared for one interactive Community view.
- **Semantic region**: a deterministic subdivision of one Community, derived from the observation-to-observation projection and represented by a private-safe name, complete member count, visual contour, and aggregate bridges.
- **Overview band**: camera distance where regions, representative stars, and aggregate bridges are primary.
- **Exploration band**: camera distance or region focus where representative observation relationships become visible.
- **Neighborhood band**: the existing bounded Neighborhood level where one focused memory and its one- or two-hop support are complete within the level cap.

## User stories

### US1 - Recognize the memory universe (Priority: P1)

As a user opening a long-lived memory store, I can recognize named constellations distributed as an organic field so that Universe communicates structure instead of a square perimeter, a tiny core, or unexplained distant points.

**Independent test**: Mount Universe from a deterministic 6,000-memory fixture containing dense, sparse, and disconnected communities; verify complete accounting, stable identities and labels, weighted aggregate bridges, broad non-perimeter occupancy, aspect-preserving fit, and no raw observation or metadata stars.

**Covers**: FR-001, FR-002, FR-003, SC-001, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** a large active scope, **When** Universe settles, **Then** every current observation is accounted for through 30–150 named constellations and weighted aggregate bridges.
2. **Given** weakly connected or isolated constellations, **When** the Universe layout is constructed, **Then** they occupy deterministic organic positions and explicit unclustered regions instead of the four sides of the canvas.
3. **Given** a wide application viewport, **When** Universe fits, **Then** the world keeps its natural aspect and uses the available field without being normalized to a square.
4. **Given** a constellation label, **When** it is rendered on canvas or in the semantic navigator, **Then** it is private-safe, human-readable, collision-managed, and stable for unchanged membership.

### US2 - Explore one constellation without a hairball (Priority: P1)

As a user entering a large constellation, I can see its meaningful internal regions and representative memories so that I understand its shape without rendering every member and relationship at once.

**Independent test**: Enter a deterministic 1,000-memory Community with dense internal relationships and verify 6–12 named regions, exact complete membership counts, 80–180 representative memories, at most 450 prepared links, stable region identities, visible contours and labels, and no automatic continuation drain.

**Covers**: FR-004, FR-005, FR-006, FR-007, FR-008, SC-004, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** a Community with more memories than the visual budget, **When** it opens, **Then** the response reports its exact source membership while the renderer prepares only a bounded representative working set.
2. **Given** a sufficiently large Community, **When** its internal projection is partitioned, **Then** 6–12 deterministic semantic regions cover every member exactly once and oversized regions are recursively split.
3. **Given** region evidence, **When** region names are derived, **Then** high-frequency excluded metadata cannot name every region identically and private-safe deterministic fallbacks distinguish regions that lack useful semantic evidence.
4. **Given** dense internal relationships, **When** Community is in its overview band, **Then** region contours and weighted region-to-region bridges communicate structure while the full internal edge set is not emitted or drawn.
5. **Given** a small Community within the visual budget, **When** it opens, **Then** every assigned observation may be represented while link presentation still follows the level-aware relevance policy.

### US3 - Reveal detail through spatial intent (Priority: P1)

As a user navigating a constellation, I can zoom, focus a region, or select a memory to reveal the next useful layer without losing my place.

**Independent test**: From Community overview, zoom into multiple regions, activate one region, select a representative memory, enter Neighborhood, and traverse Back/Forward; verify deterministic visual bands, bounded disclosure, camera continuity, URL parity, labels, Lens parity, and no full-Community reload.

**Covers**: FR-009, FR-010, FR-011, FR-012, FR-013, SC-008, SC-009, SC-010, SC-011

**Acceptance scenarios**:

1. **Given** Community overview, **When** the user zooms into the exploration band, **Then** relevant representative observation links and additional local labels appear without changing Community source membership or downloading every source relationship.
2. **Given** a semantic region, **When** the user activates it, **Then** the atlas focuses that region, keeps surrounding regions as subdued context, restores the focus through URL/history, and retains a bounded working set.
3. **Given** a representative memory, **When** the user activates it, **Then** Neighborhood displays the focused memory and its most relevant one- or two-hop support within the existing 300-node cap.
4. **Given** Back, Forward, deep-link, search pivot, or filter restoration, **When** the level becomes usable, **Then** URL, breadcrumb, region, focus, semantic navigator, Lens, camera, and painted renderer publish one coherent state.
5. **Given** a region or memory that is no longer current, **When** a stored URL is restored, **Then** the server returns a typed stale/gone outcome and the client recovers to the current owning Community without mixing generations.

### US4 - Understand why regions and relationships exist (Priority: P1)

As a user inspecting memory structure, I can distinguish region membership, bridges, relation classes, confidence, and provenance without reading internal identifiers.

**Independent test**: Inspect Community overview, focused region, and Neighborhood using mouse and keyboard; verify region summaries, counts, bridge strengths, relation/confidence encoding, a compact legend, private-safe details, and an in-place dock that does not obscure graph controls.

**Covers**: FR-014, FR-015, FR-016, SC-012, SC-013, SC-014

**Acceptance scenarios**:

1. **Given** one semantic region, **When** it is focused, **Then** the dock explains its memory count, distinguishing concepts, projects, time span, representative memories, and strongest bridges without presenting metadata as peer stars.
2. **Given** different relationship classes, **When** they are visible, **Then** color/style, confidence, direction, and provenance remain distinguishable through a compact level-local legend and accessible text.
3. **Given** an individual memory focus, **When** its local relationships appear, **Then** the selected memory and neighbors become vivid while unrelated context remains present but subdued.
4. **Given** an open dock at desktop, tablet, mobile, or 200% scale, **When** graph controls or level tabs are used, **Then** every required target remains visible and hit-testable without document-level scrolling or selection-induced scroll jumps.

### US5 - Retain diagnostics, access, and lifecycle safety (Priority: P1)

As an operator or fallback user, I can use the semantic atlas and optional Raw graph without sacrificing privacy, accessibility, performance, or recovery.

**Independent test**: Exercise all semantic levels, filters, Raw diagnostic confirmation, WebGL failure/retry, reduced motion, coarse pointer, stale requests, rapid transitions, and unmount; verify bounded state, same-origin traffic, private-safe presentation, semantic fallback, and complete owned-resource cleanup.

**Covers**: FR-017, FR-018, FR-019, FR-020, FR-021, SC-015, SC-016, SC-017, SC-018, SC-019, SC-020

**Acceptance scenarios**:

1. **Given** the normal observatory route, **When** a large Community opens, **Then** the client does not call `/viz/graph` and does not automatically follow Community continuation until every source member is rendered.
2. **Given** explicit Raw diagnostic confirmation, **When** the source exceeds the safe renderer threshold, **Then** the UI reports exact diagnostic totals and offers bounded inspection/export without silently turning Raw into the primary atlas.
3. **Given** WebGL initialization or live-context failure, **When** fallback activates, **Then** region names, representative memories, counts, focus, navigation, and one Retry remain operable in the synchronized DOM surface.
4. **Given** reduced motion or Pause, **When** level, zoom band, or focus changes, **Then** semantic results remain visible and stable without nonessential simulation or camera animation.
5. **Given** private-marked data or superseded asynchronous work, **When** labels, errors, cursors, overlays, diagnostics, or callbacks resolve, **Then** private content and stale state cannot enter the DOM, URL, canvas-adjacent labels, logs, or external network traffic.

## Functional requirements

- **FR-001 — World-first graph geometry**: `[MODIFIED dashboard-memory-navigation]` Universe MUST lay out aggregate constellations from their weighted semantic topology in unconstrained world coordinates, MUST deterministically place weak and isolated groups without perimeter rings, and MUST preserve natural aspect during fit and resize.
- **FR-002 — Semantic completeness replaces raw completeness**: `[MODIFIED dashboard-memory-navigation]` Universe MUST account for every current scoped observation through bounded deterministic constellations and aggregate bridges while keeping observation, metadata, fact, and helper identities out of the default Universe working set; Community MUST retain complete source accounting while preparing a bounded visual working set.
- **FR-003 — Semantic celestial encoding**: `[MODIFIED dashboard-design-system]` Universe MUST render collision-managed private-safe constellation names for the major visible regions and expose every constellation through the semantic navigator; unchanged membership and evidence MUST produce stable identity, label, color, and initial seed.
- **FR-004 — Semantic zoom Community projection**: `[ADDED visualization-api]` A Community read that explicitly requests semantic-zoom presentation MUST report complete source membership and relationship totals but return a bounded visual working set: all observations when source membership is at most 180, otherwise 80–180 deterministic representative observations, plus no more than 450 prepared visual relationship identities in total across observation-endpoint edges and region-anchor bridges. The existing unqualified complete Community pagination remains available to public consumers but is not used by the default dashboard.
- **FR-005 — Bounded deterministic communities**: `[MODIFIED knowledge-graph]` A sufficiently large Community MUST be subdivided into 6–12 deterministic semantic regions derived only from the eligible weighted observation-to-observation projection; every source member MUST belong to exactly one region, metadata/superhubs MUST remain excluded, and any region above 35% of parent membership or 250 observations MUST be recursively split when the parent size permits.
- **FR-006 — Stable region identity and naming**: `[ADDED knowledge-graph]` Region IDs MUST derive from the complete sorted member identity set and algorithm version using a collision-resistant representation. Region names MUST use distinguishing private-safe semantic evidence, MUST exclude configured global/high-frequency evidence, MUST disambiguate duplicate labels deterministically, and MUST fall back to stable human names such as `Memory region 01` rather than internal identifiers.
- **FR-007 — Representative sampling**: `[ADDED visualization-api]` Community representatives MUST be selected deterministically using bounded structural importance, cross-region bridge contribution, evidence strength, recency, and diversity across regions and facets; the response MUST expose why an item represents its region without exposing private source values.
- **FR-008 — Truthful graph accounting**: `[MODIFIED dashboard]` Community responses and UI MUST distinguish `source memories`, `visible memories`, `semantic regions`, `aggregate bridges`, `visible relationships`, and `omitted memories/relationships`; region member counts MUST sum exactly to source membership and visual identities MUST NOT be presented as completeness of the raw graph.
- **FR-009 — Region-first Community geometry**: `[ADDED dashboard-memory-navigation]` Community MUST arrange representative memories around deterministic region anchors, render bounded organic region contours and collision-managed region labels, preserve an irregular non-square world extent, and prevent isolated representatives from becoming unexplained perimeter points.
- **FR-010 — Level-aware relationship presentation**: `[MODIFIED dashboard-design-system]` Universe overview MUST show constellation bridges; Community overview MUST show region contours, region aggregate bridges, and a sparse representative backbone; Community exploration MUST reveal relevant representative observation links; Neighborhood MUST show complete bounded local supporting relationships. Camera bands MUST change presentation without downloading or rendering the complete Community edge set.
- **FR-011 — Dense renderer performance**: `[MODIFIED dashboard-design-system]` The Community client MUST stop after one bounded usable projection, MUST preserve typed omission metadata, and MUST request a replacement bounded working set only for explicit spatial intent such as focused-region exploration, search pivot, or Neighborhood traversal. It MUST NOT globally auto-drain complete Community continuation.
- **FR-012 — Restorable semantic drilldown**: `[MODIFIED dashboard-memory-navigation]` URL and navigation state MUST encode semantic level, stable Community, optional stable region focus, opaque scope facets, and focused observation; Back/Forward, direct links, search pivots, semantic activation, Lens, and camera MUST restore atomically without duplicate trail entries.
- **FR-013 — Stable focused-region replacement**: `[ADDED visualization-api]` Focused-region detail MUST be generation-, scope-, Community-, and region-bound, MUST preserve unchanged representative identities and camera anchors, MUST remain within the Community visual budget, and MUST reject stale, wrong-region, or mixed-generation responses before mutating visible state.
- **FR-014 — Co-located instrument dock**: `[MODIFIED dashboard]` Selecting a semantic region MUST open the existing in-place dock with a private-safe summary, complete member count, representative concepts, bounded facet distribution, time span, representative memories, strongest bridges, and actions to focus the region or return to Community overview.
- **FR-015 — Relationship explanation**: `[ADDED visualization-api]` Aggregate and representative relationships MUST carry stable class, direction, confidence band, evidence count, and bounded provenance suitable for both visual encoding and accessible explanation; unknown evidence MUST be explicit rather than inferred in presentation.
- **FR-016 — Level-local legend**: `[ADDED dashboard-design-system]` Community and Neighborhood MUST provide a compact co-located relation/region legend whose filters update styling or the bounded working set without restarting physics for unchanged identities.
- **FR-017 — Explicit Raw diagnostic mode**: `[MODIFIED dashboard-memory-navigation]` Raw graph MUST remain opt-in, clearly diagnostic, excluded from semantic loading, bounded above the safe interactive threshold, and available for query/export without becoming the default fallback for a dense Community.
- **FR-018 — Accessible private-safe level parity**: `[MODIFIED dashboard-memory-navigation]` Regions, representative memories, zoom-band disclosures, counts, legend filters, dock actions, empty/degraded states, and renderer recovery MUST have keyboard-operable DOM equivalents synchronized with the painted view.
- **FR-019 — Private-content safety**: `[MODIFIED dashboard-design-system]` Region evidence, labels, representative explanations, legends, errors, fallback content, URLs, and request metadata MUST pass the shared private-safe presentation boundary; opaque tokens MUST resolve only on the local server.
- **FR-020 — Generation-consistent semantic reads**: `[MODIFIED visualization-api]` Scope, level, region, focus, and generation MUST own independent abort/generation guards; superseded projection, region-detail, renderer, overlay, simulation, timer, worker, observer, and animation work MUST stop without publishing stale state.
- **FR-021 — Additive public negotiation boundary**: `[INTERNAL]` The dashboard's complete-Community auto-drain behavior MAY be replaced without preserving its internal state shape, while the public `/viz/atlas` route MUST negotiate semantic-zoom presentation through additive request/response fields and retain unqualified complete Community pagination for existing consumers.

## Success criteria

- **SC-001** `[buildable]`: A deterministic 6,000-memory Universe accounts for exactly 6,000 source memories using 30–150 constellations, only aggregate bridges, one rich canvas, and zero normal-route `/viz/graph` requests.
- **SC-002** `[buildable]`: Universe visible nodes occupy all four world quadrants; fewer than 10% lie within the outer 3% of a bounding rectangle; weak/isolated groups do not form four straight perimeter lines; repeated permutations produce equivalent normalized positions.
- **SC-003** `[buildable]`: At 1440×900, 1024×768, 360×800, and 200% scale, world/screen aspect differ by at most 15%, the atlas has no document-level overflow, and required controls/labels remain inside and hit-testable.
- **SC-004** `[buildable]`: A 1,000-memory dense Community returns exact source totals, 6–12 regions, 80–180 visible memories, at most 450 prepared relationship identities across edges plus region bridges, and region counts summing to exactly 1,000.
- **SC-005** `[buildable]`: Initial Community readiness performs exactly 1 bounded semantic request, performs zero global continuation drains, and makes zero `/viz/graph` requests; an explicit region focus performs exactly 1 bounded generation-safe detail request.
- **SC-006** `[buildable]`: In Community overview, all region labels are private-safe and in-host with zero pair overlaps; every region has an accessible navigator entry and a distinguishable contour/label even when semantic evidence is sparse.
- **SC-007** `[buildable]`: A mounted 1,000-memory/10,000-relationship fixture never paints more than 450 relationship identities in Community, produces no single opaque edge wall, retains at least 70% of the canvas as visually separable background at overview, and exposes complete omitted counts.
- **SC-008** `[buildable]`: All 4 presentation bands—overview, exploration, focused-region, and Neighborhood—publish distinct deterministic relationship counts/styles while source membership and stable visible identities do not change solely because of camera zoom.
- **SC-009** `[buildable]`: All 7 transitions—region activation, memory activation, Back, Forward, direct link, search pivot, and invalid/stale recovery—keep URL, breadcrumb, region/focus state, semantic navigator, Lens/dock, painted renderer, and usable camera atomically synchronized.
- **SC-010** `[buildable]`: Community→region focus and Community→Neighborhood become renderer-ready in under 250 ms after a local response on the 1,000-memory fixture, with no retained main-thread task at or above 200 ms.
- **SC-011** `[buildable]`: Focused-region replacement preserves the current camera and all unchanged node positions within 2 px, adds zero duplicate identities, rejects every stale or wrong-region response, and never exceeds the Community visual budgets.
- **SC-012** `[buildable]`: Region inspection exposes exact member count, at least one distinguishing private-safe concept or deterministic fallback, bounded facet/time summaries, representative memories, and strongest bridges without raw canonical facet values.
- **SC-013** `[buildable]`: All 4 relationship dimensions—class, direction, confidence, and provenance—are distinguishable in the rich renderer, compact legend, semantic navigator, and fallback; changing legend filters causes zero renderer recreation for unchanged graph identities.
- **SC-014** `[buildable]`: Opening/closing region or memory detail produces zero document scroll jump and leaves every graph control and semantic tab visible and center-hit-testable at desktop, mobile, and 200% scale.
- **SC-015** `[buildable]`: WebGL initialization failure and live context loss retain the exact current level/region/focus/counts in a usable DOM fallback with exactly 1 Retry; retry restores exactly 1 canvas and leaves zero stale simulations or timers.
- **SC-016** `[buildable]`: Pause-before-ready, Pause, reduced motion, hidden document, Resume, resize, and unmount preserve semantic results and leave zero owned intervals, frames, observers, workers, renderer instances, browser processes, listeners, or temporary profiles.
- **SC-017** `[buildable]`: Angle and bracket private markers seeded into labels, concepts, facets, provenance, errors, and Raw diagnostics produce zero marker/secret matches in DOM, URL/history, request metadata, logs, screenshots, and external traffic.
- **SC-018** `[buildable]`: All pointer, Enter, Space, H/J/K/L, zoom, fit, reset, pause, focus traversal, region activation, and dock actions retain keyboard/pointer parity with zero duplicate activation.
- **SC-019** `[buildable]`: All 11 required states—empty, tiny, sparse, dense, all-unclustered, oversized-region, stale/gone, degraded, failed-inspection, aborted, and retry—render a truthful bounded message and an appropriate recovery action without substituting Raw graph.
- **SC-020** `[buildable]`: Dashboard typecheck, focused Store/API tests, all dashboard tests including real-browser dense fixtures, HTTP visualization tests, root tests, production build, SDD gates, `git diff --check`, privacy/scope scans, and post-run process/profile/listener cleanup all pass.

## Edge cases

- Empty scope; one observation; fewer than six meaningful regions; a Community smaller than the visual budget.
- One Community with 1,000 members and one natural region; many singletons; bridge memories; true semantic hubs; no eligible edges.
- Duplicate or private-equivalent region evidence; Unicode; identical safe labels; missing summaries; legacy observations without embeddings or complete KG.
- A region changes membership between overview and detail; deleted/reassigned focus; repeated, stale, wrong-scope, wrong-region, or malformed cursors.
- Rapid zoom-band crossings; wheel jitter around a threshold; region activation during renderer startup; scope/filter change during region detail; Back/Forward during animation.
- Search result outside the open Community; multiple results from one region; a pivot whose owning region changes before activation.
- WebGL initialization failure, live context loss, retry failure, reduced motion, hidden tab, mobile bottom sheet, 200% scale, coarse pointer, and keyboard-only navigation.
- Raw source above its diagnostic renderer guard; query/export remains possible without normal-route raw rendering.

## Assumptions

- The existing Universe community assignment remains the parent partition; this change adds deterministic within-Community regions rather than replacing the entire top-level community model.
- Complete source membership and exact totals are authoritative even when only a representative working set is rendered.
- Cosmos remains the primary GPU renderer unless implementation evidence proves a narrower replacement necessary; the semantic contract is renderer-independent.
- The dashboard's internal Community loader/state shape can change freely; public `/viz/atlas` compatibility is retained through an additive semantic-zoom presentation parameter and additive response fields.

## Dependencies

- Existing SQLite observation/KG data, current semantic atlas projection, local HTTP bridge, React dashboard, Cosmos GPU renderer, and DOM semantic fallback.
- No remote service, LLM, embedding rebuild, or data migration is required for the bounded semantic-zoom path.

## Out of scope

- Editing memories, KG facts, or community membership directly from the atlas.
- Remote clustering, remote embeddings, LLM-only naming, or any external visualization service.
- Persisting arbitrary user-dragged coordinates as durable memory data.
- Making Raw graph performant or visually meaningful beyond its documented diagnostic safety limit.
- Replacing the MCP memory tools, recall ranking, embedding model, or SQLite persistence architecture.
