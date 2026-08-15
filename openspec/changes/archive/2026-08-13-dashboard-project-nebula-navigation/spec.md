# Feature Specification: Project Nebula Atlas Navigation

**Change ID**: `dashboard-project-nebula-navigation`<br>
**Route**: Full<br>
**Status**: Draft

## Intent and scope

**Why**: Memory universe currently opens on globally detected constellations whose labels can look like file or component names. Those labels are valid evidence, but they do not match the stable project landmarks people normally use to navigate a long-lived memory store. Entering a constellation can also retain the parent camera and render its semantic regions at an unusably close scale until the user manually invokes Fit.<br>
**Impact**: The dashboard's default atlas becomes an explicit four-level hierarchy: Universe, Project, Constellation, and Neighborhood. Universe renders bounded project nebulae containing representative project-owned constellation cores; Project renders the selected project's constellations; Constellation retains the existing bounded region-aware semantic zoom; Neighborhood retains bounded local evidence. Project boundaries become first-class navigation rather than force-bearing metadata. Each new semantic location receives one correct post-commit frame, while same-location updates and history restoration preserve a valid user viewport. The public `/viz/atlas` contract negotiates this hierarchy additively so unqualified global Universe and Community reads remain available.<br>
**Affected capabilities**: `dashboard-memory-navigation`, `dashboard-design-system`, `dashboard`, `knowledge-graph`, `visualization-api`

## Product vocabulary

- **Project nebula**: one private-safe project boundary in Universe, including an explicit synthetic nebula for memories without a project.
- **Project-owned constellation**: a deterministic observation community partitioned within exactly one project nebula.
- **Constellation core**: a bounded representative project-owned constellation shown inside a Universe project nebula.
- **Project bridge**: an aggregate relationship between two project nebulae derived from eligible cross-project observation evidence.
- **Semantic location**: the stable navigation tuple that owns a dataset and camera: level, project, constellation, optional bounded-page cursor, optional region, focus, and active scope.
- **First-entry frame**: the single automatic fit applied after a new semantic location and its overlays are committed.
- **Same-location replacement**: a generation-safe dataset update that retains the same semantic location and may preserve the user's camera.

## User stories

### US1 - Recognize the universe by project (Priority: P1)

As a user opening a long-lived memory store, I can recognize project nebulae and their constellation cores so that the initial atlas reflects how I remember and revisit work.

**Independent test**: Mount Universe from a deterministic 6,000-memory fixture containing 40 named projects, cross-project evidence, missing KG coverage, and unassigned memories; verify project-derived labels, exact accounting, bounded constellation cores, deterministic geometry, and no observation/file-title nodes at the root.

**Covers**: FR-001, FR-002, FR-006, FR-008, FR-010, FR-011, FR-012, FR-016, SC-001, SC-002, SC-003, SC-004, SC-015

**Acceptance scenarios**:

1. **Given** a multi-project memory store, **When** Universe becomes usable, **Then** every visible top-level contour is a private-safe project nebula and every star inside it is a project-owned constellation core rather than an individual memory, file, session, or topic.
2. **Given** structural evidence connecting observations from different projects, **When** project-owned constellations are partitioned, **Then** no constellation spans projects and the cross-project evidence contributes only to bounded project bridges.
3. **Given** observations without a project, **When** Universe loads, **Then** one explicit Unassigned nebula accounts for them without inventing a canonical project.
4. **Given** more projects or constellations than the visual budget, **When** Universe renders, **Then** the response and UI distinguish source, visible, and omitted counts, paint only one bounded page, and provide Previous/Next project-page actions that can reach every omitted project without accumulating prior pages on the canvas.

### US2 - Enter a project or constellation directly (Priority: P1)

As a user surveying Universe, I can activate a project nebula to see all of its constellations or activate a visible constellation core to enter it directly so that spatial intent determines the next useful level.

**Independent test**: Activate a project contour/label and a constellation core through pointer and keyboard, then traverse breadcrumbs and browser history; verify the Project and Constellation datasets, opaque URL state, selected ownership, and accessible navigator remain coherent.

**Covers**: FR-003, FR-005, FR-007, FR-009, FR-013, FR-014, FR-015, SC-005, SC-006, SC-007, SC-016

**Acceptance scenarios**:

1. **Given** a project nebula in Universe, **When** its contour or label is activated, **Then** Project opens with every returned constellation owned by that project and with other projects removed from the active working set.
2. **Given** a visible constellation core inside a project nebula, **When** it is activated, **Then** Constellation opens directly with the owning project and constellation encoded atomically.
3. **Given** Project overview, **When** a constellation is activated, **Then** the current bounded region-aware Constellation view opens without loading individual memories globally.
4. **Given** pointer, keyboard, DOM navigator, bounded-page controls, breadcrumb, deep-link, or Back/Forward navigation, **When** a semantic location changes, **Then** URL, breadcrumb, painted view, navigator hierarchy, counts, and dock context publish one coherent location without duplicate trail entries.

### US3 - Arrive at a correctly framed semantic location (Priority: P1)

As a user drilling into the atlas, I can see the complete useful extent on first entry without pressing Fit, while my intentional camera is retained when the same location refreshes or is restored.

**Independent test**: Traverse Universe to Project to Constellation, pan and zoom within one location, focus and clear a region, and use Back/Forward under normal and reduced motion; compare first-entry transforms with explicit Fit and verify location-scoped camera restoration.

**Covers**: FR-003, FR-004, FR-015, SC-008, SC-009, SC-010

**Acceptance scenarios**:

1. **Given** a parent semantic location with any camera transform, **When** a different Project, Constellation, or Neighborhood location commits, **Then** the new location receives exactly one post-commit frame that includes its bounded points and contours.
2. **Given** the user has panned or zoomed inside one semantic location, **When** that same location receives a generation-safe replacement, **Then** unchanged anchors and the valid user camera are preserved without an involuntary fit.
3. **Given** a semantic location previously visited in the current trail, **When** Back or Forward restores it, **Then** a valid saved viewport is restored; if none is valid, the deterministic first-entry frame is used.
4. **Given** reduced motion, Pause, or WebGL fallback, **When** a new semantic location becomes usable, **Then** framing is immediate and complete without nonessential animation.

### US4 - Trust the hierarchy and its accounting (Priority: P1)

As a user inspecting the atlas, I can tell how projects, constellations, regions, memories, and relationships are summarized so that visual aggregation is never mistaken for raw completeness.

**Independent test**: Compare Store, HTTP, client, painted, and DOM counts for Universe, Project, Constellation, and Neighborhood fixtures; verify ownership sums, omission metadata, relationship tiers, and private-safe labels.

**Covers**: FR-007, FR-008, FR-011, FR-012, FR-013, FR-014, FR-016, SC-002, SC-003, SC-011

**Acceptance scenarios**:

1. **Given** Universe overview, **When** counts are presented, **Then** source projects, visible project nebulae, source memories, source constellations, visible constellation cores, project bridges, and omitted identities remain distinct.
2. **Given** Project overview, **When** counts are presented, **Then** source memories, source constellations, visible constellations, aggregate bridges, and omissions refer only to the selected project.
3. **Given** duplicate private-safe project labels, **When** nebulae and navigation choices render, **Then** stable opaque identities remain distinct and labels are deterministically disambiguated without exposing canonical values.
4. **Given** missing or degraded structural evidence, **When** the hierarchy is built, **Then** every current observation remains assigned exactly once and degraded state is reported without fabricated relationships.

### US5 - Retain bounded, accessible, private-safe operation (Priority: P1)

As an operator or fallback user, I can use the four semantic levels without sacrificing accessibility, privacy, responsiveness, lifecycle safety, or explicit Raw diagnostics.

**Independent test**: Exercise the hierarchy at desktop, tablet, mobile, 200% page scale, coarse pointer, reduced motion, WebGL failure/retry, rapid scope changes, stale project/constellation URLs, and unmount; verify bounded requests, DOM parity, private-safe output, same-origin traffic, and complete cleanup.

**Covers**: FR-005, FR-009, FR-012, FR-013, FR-014, FR-015, FR-016, SC-006, SC-010, SC-012, SC-013, SC-014

**Acceptance scenarios**:

1. **Given** project nebulae and constellation cores, **When** the GPU renderer is unavailable, **Then** the DOM navigator exposes the same project-to-constellation hierarchy and activation outcomes.
2. **Given** stale project, constellation, region, or generation state, **When** a request resolves, **Then** typed recovery returns to the nearest current owning level without mixing datasets or cameras.
3. **Given** private-marked values or superseded asynchronous work, **When** labels, overlays, errors, URLs, diagnostics, or callbacks resolve, **Then** private content and stale state cannot enter presentation or external traffic.
4. **Given** explicit Raw diagnostic activation, **When** it opens, **Then** it remains a separate bounded diagnostic path and never replaces a semantic hierarchy failure automatically.

## Edge cases

- An empty store renders a stable empty Universe with no synthetic project or constellation identities.
- A store with one project still uses the Universe → Project distinction; activating the only nebula is meaningful and restorable.
- Null, empty, or fully private-marked project values belong to one stable Unassigned nebula whose label contains no source value.
- Distinct canonical projects whose safe labels collide retain distinct opaque IDs and deterministic disambiguated labels.
- A project with no eligible structural edges still receives deterministic unclustered constellations whose member counts cover that project exactly.
- A scope with more than the Universe visual budgets reports exact source/visible/omitted project and constellation counts; the dashboard paints at most 24 projects and 72 constellation cores at once, exposes deterministic Previous/Next actions, and replaces rather than merges page working sets.
- A project or constellation that changes membership between generations returns a typed stale/gone result and cannot be combined with a prior camera or overlay commit.
- A project-level identity and a project facet filter that resolve to different canonical projects produce a typed invalid-scope outcome rather than an empty or misleading graph.
- An unqualified public Universe or Community request preserves the existing global hierarchy and pagination; project identity fields are valid only for an explicitly negotiated project hierarchy.
- Region contours extending beyond their representative point hull are included in first-entry framing.
- Same-location refresh preserves the camera only when its saved transform is finite, intersects the current world extent, and belongs to the exact semantic location key.

## Functional requirements

- **FR-001 — World-first graph geometry**: `[MODIFIED dashboard-memory-navigation]` Universe MUST arrange bounded project nebulae from weighted project topology in unconstrained world coordinates, MUST place representative project-owned constellation cores inside their owning organic contours, MUST deterministically place weak, isolated, and Unassigned groups without perimeter rings, and MUST preserve the natural aspect of the complete visible nebula extent.
- **FR-002 — Semantic completeness replaces raw completeness**: `[MODIFIED dashboard-memory-navigation]` Universe MUST account for every current scoped observation through exactly one project nebula and exactly one project-owned constellation while keeping observation, session, topic, fact, and helper identities out of the root working set; Project MUST account for the selected project's complete source membership while returning bounded constellation aggregates; Constellation MUST retain complete source accounting while preparing its bounded representative working set.
- **FR-003 — Restorable semantic drilldown**: `[MODIFIED dashboard-memory-navigation]` URL and navigation state MUST encode semantic level, stable opaque project, stable project-owned constellation, optional opaque bounded-page cursor, optional stable region, focused observation, active scope, and a semantic-location camera key; project contour activation, constellation-core activation, bounded-page controls, breadcrumbs, deep links, search pivots, DOM navigation, Back/Forward, Lens, and recovery MUST restore that tuple atomically without duplicate trail entries. A project-hierarchy search pivot MUST be resolved server-side to both its opaque owning project and project-owned constellation before the client commits Neighborhood.
- **FR-004 — Aspect-preserving fit and resize**: `[MODIFIED dashboard-memory-navigation]` The first committed dataset for a new semantic location MUST receive exactly one automatic frame after point and contour geometry are available, equivalent to explicit Fit for that location and independent of the parent's user-camera state; same-location replacements MUST preserve a valid intentional camera, and history MUST restore a valid location-owned viewport or deterministically frame the location when none exists.
- **FR-005 — Accessible private-safe level parity**: `[MODIFIED dashboard-memory-navigation]` Project nebulae, project-owned constellation cores, Project-level constellations, semantic regions, representative memories, counts, omission states, framing outcomes, stale recovery, and renderer recovery MUST have keyboard-operable DOM equivalents synchronized with the painted hierarchy; a project contour/label and a constellation core MUST expose distinct accessible actions.
- **FR-006 — Semantic celestial encoding**: `[MODIFIED dashboard-design-system]` Universe MUST render project nebula contours with collision-managed private-safe project labels, memory/constellation counts, and contained constellation cores; Project MUST render collision-managed private-safe constellation names; stable unchanged ownership and evidence MUST produce stable identity, label, color, contour, and initial seed, and root labels MUST NOT be sourced from observation titles or file names.
- **FR-007 — Level-aware relationship presentation**: `[MODIFIED dashboard-design-system]` Universe overview MUST show bounded project bridges and subdued within-project constellation structure; Project overview MUST show weighted cross-constellation bridges; Constellation overview and exploration MUST retain region contours, region bridges, sparse representative backbones, and relevant representative links; Neighborhood MUST retain complete bounded local support. Presentation bands MUST NOT alter semantic ownership or globally download lower-level identities.
- **FR-008 — Truthful graph accounting**: `[MODIFIED dashboard]` Store responses and UI MUST distinguish source and visible projects, source and visible project-owned constellations, source and visible memories, project/constellation/region aggregate bridges, visible relationships, and omitted identities at the active level; project and constellation membership counts MUST sum exactly to source membership and painted identities MUST NOT be presented as raw completeness.
- **FR-009 — Facets instead of metadata stars**: `[MODIFIED dashboard]` Project navigation identity MUST be separate from optional project facet filtering: an opaque project parent selects the Project/Constellation hierarchy while project, session, topic, type, relation, and query facets refine the active scope. Canonical project values MUST remain server-resolved, and metadata MUST NOT appear as peer memory stars outside Neighborhood or Raw diagnostics.
- **FR-010 — Observation-to-observation projection**: `[MODIFIED knowledge-graph]` Atlas constellations MUST be partitioned independently within each canonical project parent from eligible weighted observation-to-observation evidence; project metadata MUST define the parent boundary but MUST NOT become a clustering node or edge, and eligible relationships crossing project boundaries MUST contribute only to aggregate project bridges.
- **FR-011 — Complete legacy-safe representation**: `[MODIFIED knowledge-graph]` Every current scoped observation MUST belong to exactly one canonical project parent and one project-owned constellation even when KG, embeddings, topics, summaries, or a project value are absent; missing project values MUST use one deterministic synthetic Unassigned parent and missing semantic evidence MUST use bounded deterministic unclustered constellations without fabricated relationships.
- **FR-012 — Universe aggregate contract**: `[MODIFIED visualization-api]` A Universe read that explicitly negotiates project hierarchy MUST return one bounded hierarchical page containing no observation nodes, at most 150 visible project nebulae and at most 150 visible project-owned constellation cores, stable opaque ownership, private-safe labels, exact source/visible/omitted project, constellation, and memory counts, and bounded project/constellation aggregate bridges. `page_size` MUST count project nebulae at this level, continuation MUST advance a deterministic project order without repeating identity, and the dashboard MUST request 24 projects, allocate at most 72 cores, and replace rather than merge pages. Previous/Next semantic navigation MUST keep every omitted project reachable without implying it is painted. An unqualified Universe read MUST retain the existing global community aggregate contract and accumulation behavior.
- **FR-013 — Project detail contract**: `[ADDED visualization-api]` A project-hierarchy Project read MUST accept one stable opaque project identity distinct from facet filtering, MUST return only project-owned constellation aggregates and cross-constellation edges for that parent, MUST expose exact source/visible/omitted memory and constellation counts with deterministic continuation within the 150-constellation visual budget, MUST retain the 1,000-memory maximum for any navigable constellation, and MUST return typed invalid/gone outcomes for conflicting scope or stale ownership.
- **FR-014 — Community detail contract**: `[MODIFIED visualization-api]` A project-hierarchy Constellation read MUST require and validate the owning project identity plus one stable project-owned constellation identity, MUST retain complete assigned source membership and the existing complete or semantic-zoom presentations, and MUST reject stale, cross-project, or mixed-generation ownership before returning observation or region identities. Unqualified Community reads MUST retain the existing global complete and semantic-zoom contracts.
- **FR-015 — Generation-consistent semantic reads**: `[MODIFIED visualization-api]` Hierarchy negotiation, scope, semantic location, project, constellation, region, focus, generation, camera restoration, worker preparation, renderer publication, overlays, simulation, timers, observers, and animations MUST use one generation-consistent publication boundary; superseded work MUST stop without publishing a stale hierarchy or applying a camera from another semantic location.
- **FR-016 — Collision-resistant visualization identity**: `[MODIFIED visualization-api]` Project nebula, project-owned constellation, project bridge, constellation bridge, and semantic-location identities MUST hash the complete domain-separated canonical parent and member tuples plus relevant algorithm versions; identities MUST remain opaque, order-independent, collision-resistant, stable for unchanged inputs, and distinct for safe-label collisions, while the synthetic Unassigned identity MUST be stable without encoding a source value.

## Success criteria

- **SC-001** `[buildable]`: A deterministic 6,000-memory fixture with 40 canonical projects and 100 unassigned memories produces 41 source project nebulae, no observation nodes in Universe, at most 150 visible constellation cores, and exact project/constellation membership totals summing to 6,000.
- **SC-002** `[buildable]`: In fixtures with dense cross-project structural evidence, every observation belongs to exactly one project-owned constellation, zero returned constellations report more than one project parent, and all eligible cross-project evidence is represented only through bounded project bridges.
- **SC-003** `[buildable]`: All permutations of source observations, evidence rows, project order, or pagination produce equivalent project/constellation ownership, stable IDs, labels, seeds, contours, bridges, and normalized positions for unchanged canonical inputs.
- **SC-004** `[buildable]`: Every Universe contour label is derived from a private-safe project presentation or the stable Unassigned fallback; no root label is derived from an observation title, content snippet, file path, session, or topic.
- **SC-005** `[buildable]`: Every Project contour/label activation reaches Project in a single action, and every visible constellation core activation reaches Constellation in a single action, with exact pointer, Enter, Space, DOM navigator, and deep-link parity.
- **SC-006** `[buildable]`: Every URL parse/serialize, browser-history, in-app Back/Forward, bounded-page Previous/Next, breadcrumb, pivot, and stale-recovery path preserves the exact `{level, project, constellation, pageCursor, region, focus, scope}` tuple with zero canonical project values and zero duplicate trail entries; every project-hierarchy pivot supplies the server-resolved opaque owning project and project-owned constellation.
- **SC-007** `[buildable]`: Project returns zero cross-project constellations, Constellation rejects every valid constellation paired with the wrong project, and typed project invalid/gone recovery returns to current Universe or owning Project without publishing a mixed dataset.
- **SC-008** `[buildable]`: For Universe → Project → Constellation → Neighborhood transitions, the first committed camera transform for every new semantic location is equivalent to invoking explicit Fit within 2% scale/translation tolerance and keeps all visible contours and required labels inside the usable atlas stage without a manual command.
- **SC-009** `[buildable]`: Every same-location refresh, focused-region replacement, and relation-style change preserves a finite intentional camera with zero automatic fits, while every different bounded page, non-finite, non-intersecting, or foreign-location viewport is rejected and deterministically framed once.
- **SC-010** `[buildable]`: Normal motion, reduced motion, Pause, WebGL fallback/retry, and Back/Forward each publish exactly one usable frame per new semantic location with zero stale camera applications, zero duplicate renderer commits, and zero owned timer/worker/listener residue after supersession or unmount.
- **SC-011** `[buildable]`: Store, HTTP, client, painted, and DOM presentations agree on source/visible/omitted projects, constellations, memories, and relationships for Universe, Project, Constellation, and Neighborhood fixtures; every omission is explicit and nonnegative.
- **SC-012** `[buildable]`: At 1440×900, 1024×768, 360×800, coarse pointer, and 200% page scale, project labels, constellation cores, breadcrumbs, Fit, Back/Forward, navigator actions, and dock controls remain visible and hit-testable with zero horizontal document overflow.
- **SC-013** `[buildable]`: A 6,000-memory mounted hierarchy performs no normal-route `/viz/graph` request, no hierarchy-page or complete lower-level auto-drain, no external network request, and no private-marker disclosure in DOM, URL, canvas labels, errors, diagnostics, or request metadata.
- **SC-014** `[buildable]`: Every unqualified Universe and Community contract fixture retains the existing global node ownership, complete/semantic-zoom pagination, and typed errors, while every Project request or project-owned identity without explicit hierarchy negotiation is rejected.
- **SC-015** `[buildable]`: A deterministic 181-project fixture renders exactly one Universe response at a time with at most 24 project nebulae and 72 constellation cores; repeated Next reaches the final project, Previous/Back restores the exact prior page, every page is newly framed once, and neither the loader nor the canvas accumulates identities from prior pages.
- **SC-016** `[outcome]`: In a recorded product review using a multi-project real store, at least 80% of five representative project-to-constellation tasks are completed in at most two activations without opening Filters or invoking Fit.

## Assumptions

- A non-empty canonical observation project value is the authoritative parent for atlas navigation; this change does not infer a project from file paths, topics, sessions, or content.
- Observations without a usable project value form one synthetic Unassigned parent.
- Project-owned constellations replace globally mixed constellations only in the semantic atlas hierarchy; Raw diagnostics may continue to expose canonical heterogeneous graph facts.
- Project hierarchy is an additive `/viz/atlas` negotiation used by the dashboard; omission preserves the existing global Universe and Community contracts.
- Existing bounded Constellation region partitioning, representative sampling, relationship evidence, privacy boundaries, and Neighborhood semantics remain the lower-level foundation.
- Project navigation identity and project facet identity are domain-separated even when both resolve server-side to the same canonical project value.
- A saved camera is ephemeral browser state scoped to the exact semantic location and generation-compatible geometry; no persistent database migration is required for viewport restoration.

## Dependencies

- Existing collision-resistant visualization identity helpers and opaque facet-token resolution.
- Existing deterministic semantic projection, community partitioning, region-aware Constellation presentation, and semantic atlas cache/generation lifecycle.
- Existing Cosmos world layout, contour overlay, DOM `GraphNavigator`, browser URL/history state, and private-safe presentation adapters.
- Existing root Vitest dashboard/HTTP harness and real-Chrome visual verification infrastructure.

## Out of scope

- Changing Raw graph topology, export format, or diagnostic safety thresholds.
- Inferring or rewriting stored observation project values.
- Persisting project/constellation layout or camera state in SQLite.
- Replacing the existing Constellation region algorithm, representative ranking, Neighborhood evidence policy, or semantic relationship taxonomy except where ownership must include the project parent.
- Removing Project from the filter overlay; facet filtering remains available and separate from navigation.
- Adding remote services, embeddings, LLM calls, or external visual assets to build or render the hierarchy.
