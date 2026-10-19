# Feature Specification: Camera-bound Project Nebula Contours

**Change ID**: `dashboard-project-nebula-world-contours`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Project-hierarchy Universe already places constellation cores by project, but the project overlay is not built from those Universe positions. Its regions therefore collapse to a viewport fallback while project labels are collision-scattered independently, producing detached text, a central disk, and marks that do not move naturally with the graph. The opening view does not read like the existing community nebula view or like a hierarchy of projects containing constellations.<br>
**Impact**: Universe will render every visible project as an organic, data-derived nebula whose contour encloses that project's visible constellation cores. Project contour, label, counts, cores, and bridges will share one camera and one publication frame through pan, zoom, Fit, resize, and bounded simulation. Project contour/label activation will continue to open Project while a contained core opens Constellation directly. This is a dashboard rendering correction; it does not change Store, HTTP, URL, pagination, ownership, or persistence contracts.<br>
**Affected capabilities**: `dashboard-design-system`, `dashboard-memory-navigation`

## Product vocabulary

- **Project nebula envelope**: the organic contour derived from the current projected positions of all visible constellation cores owned by one project.
- **Constellation core**: one project-owned constellation node rendered inside its project nebula in Universe.
- **Camera-bound overlay**: contour, label, counts, and bridge anchors derived from the same current world-to-screen transform as the graph nodes they describe.
- **Decorative nebula field**: a non-data background glow that must not be presented as project ownership.

## User stories

### US1 - Read projects as containing nebulae (Priority: P1)

As a user entering Memory universe, I can see each project as a nebula containing its constellation cores so that the first view matches the hierarchy I use to revisit work.

**Independent test**: Mount project-hierarchy Universe from a deterministic fixture with multi-core, sparse, single-core, and Unassigned projects; verify one organic contour per visible project, contour-anchored private-safe labels within the responsive visual budget, exact containment of the visible owned cores, and no detached project label or generic central project disk.

**Covers**: FR-001, FR-002, FR-005, SC-001, SC-002, SC-005

**Acceptance scenarios**:

1. **Given** several visible projects with project-owned constellation cores, **When** Universe becomes usable, **Then** each project has one organic envelope derived from and enclosing its own visible cores, and no envelope contains cores owned by another project.
2. **Given** one sparse or single-core project, **When** Universe renders it, **Then** the project still has a bounded organic envelope centered on its real core positions rather than on the viewport.
3. **Given** project labels and memory or constellation counts, **When** the responsive visual budget presents them, **Then** they are collision-managed anchors of their project envelope and not independently scattered screen text; projects whose painted label is suppressed remain named in the synchronized DOM navigator.
4. **Given** decorative background glow is enabled elsewhere in the atlas, **When** project-hierarchy Universe renders, **Then** decorative glow is not used as, or visually confused with, a project boundary.

### US2 - Move the project hierarchy as one world (Priority: P1)

As a user exploring the Universe, I can pan, zoom, fit, resize, and let the graph settle without project boundaries separating from their constellation cores.

**Independent test**: Record representative project contour, label, and owned-core screen geometry before and after programmatic pan, zoom, Fit, viewport resize, and simulation ticks; verify that every element republishes from the same camera frame and retains its ownership association.

**Covers**: FR-002, FR-003, FR-005, SC-002, SC-003, SC-006

**Acceptance scenarios**:

1. **Given** a usable project-hierarchy Universe, **When** the user pans or zooms, **Then** each project contour, label, counts, contained core, and project bridge move or scale coherently in the same frame.
2. **Given** Fit, resize, or bounded simulation updates projected core positions, **When** the next overlay publication commits, **Then** every project envelope and label is recomputed from those current positions without falling back to a fixed viewport coordinate.
3. **Given** a superseded renderer generation or removed project page, **When** a late overlay update resolves, **Then** it cannot publish geometry into the current Universe.
4. **Given** reduced motion, Pause, or renderer fallback, **When** camera geometry changes, **Then** the semantic hierarchy remains correctly aligned without requiring animation.

### US3 - Preserve distinct project and constellation actions (Priority: P1)

As a pointer or keyboard user, I can choose either the containing project or one of its constellation cores without ambiguity.

**Independent test**: Activate project contours/labels and contained constellation cores with pointer, Enter, Space, and DOM navigation; verify distinct destinations and verify unchanged Community and Neighborhood rendering.

**Covers**: FR-003, FR-004, SC-004, SC-005

**Acceptance scenarios**:

1. **Given** a project nebula in Universe, **When** its contour or anchored label is activated, **Then** Project opens for that exact opaque project identity.
2. **Given** a visible constellation core inside a project nebula, **When** it is activated, **Then** Constellation opens directly with the owning project and constellation encoded atomically.
3. **Given** overlapping visual hit areas, **When** a core receives pointer or keyboard activation, **Then** the project contour does not steal the core action.
4. **Given** global Universe, Project, Community, or Neighborhood outside the project-overview rendering case, **When** it renders, **Then** its existing semantic grouping and actions remain unchanged.

## Edge cases

- An empty project-hierarchy Universe renders no project contour, label, or synthetic central disk.
- A project with one visible constellation core receives a stable minimum-size envelope whose center follows that core.
- Sparse two-core and collinear projects receive bounded organic padding without producing a full-stage ellipse.
- Unassigned memories use the existing explicit Unassigned project identity and receive the same data-derived envelope behavior.
- Duplicate private-safe project labels remain distinct through opaque ownership and stable color; contour geometry never groups by presentation label.
- A bounded project page renders only its current projects and cannot retain contours or labels from the prior page.
- Project bridges with missing or omitted endpoints do not create phantom regions or viewport-centered anchors.
- Resize, 200% text zoom, reduced motion, Pause, WebGL fallback/retry, and rapid navigation cannot detach overlay geometry from the active graph generation.

## Functional requirements

- **FR-001 — Semantic celestial encoding**: `[MODIFIED dashboard-design-system]` Project-hierarchy Universe MUST render every visible project as one organic nebula envelope derived from the current projected positions of its visible owned constellation cores; every painted private-safe project label and count MUST be collision-managed and anchored to its owning envelope, while any label suppressed by the responsive visual budget MUST remain available through the synchronized DOM navigator. A project MUST NOT be represented only by independently positioned text, a generic disk, or a decorative screen-space glow.
- **FR-002 — World-first graph geometry**: `[MODIFIED dashboard-memory-navigation]` Project nebula geometry MUST group the active Universe positions by stable opaque project ownership, MUST enclose each group's visible constellation cores with bounded padding for dense, sparse, collinear, and single-core groups, MUST exclude foreign cores, and MUST include the complete contour and required label extent in Fit without substituting a viewport-center fallback when owned cores are available.
- **FR-003 — Stable spatial interaction**: `[MODIFIED dashboard-memory-navigation]` Every accepted camera, resize, simulation, and dataset publication MUST derive project contours, labels, counts, and bridge anchors from the same current world projection as their constellation cores, so pan, zoom, Fit, settling, and history restoration move the hierarchy coherently and superseded generations cannot publish detached overlay state.
- **FR-004 — Accessible private-safe level parity**: `[MODIFIED dashboard-memory-navigation]` Every painted project envelope and anchored label MUST have one synchronized keyboard-operable private-safe project action, every contained constellation core MUST retain a distinct synchronized Constellation action, and pointer or overlay hit testing MUST NOT replace a core activation with its owning project activation.
- **FR-005 — Project overlay source integrity**: `[INTERNAL]` The dashboard overlay pipeline MUST accept project-hierarchy Universe ownership groups as real contour sources, MUST publish only current visible core positions for each opaque project, MUST expose enough deterministic diagnostics to verify non-empty source membership and generation alignment, and MUST leave global Universe and lower semantic-level overlay semantics unchanged.

## Success criteria

- **SC-001** `[buildable]`: A deterministic mounted Universe fixture produces exactly one semantic project contour for every visible project with constellation cores, zero viewport-centered empty-source project contours, zero painted project labels without a corresponding contour, and DOM navigator names for every project whose painted label is suppressed by the responsive visual budget.
- **SC-002** `[buildable]`: For every visible project in multi-core, two-core, collinear, single-core, and Unassigned fixtures, reported contour source membership equals the number of visible cores with that opaque owner and the contour bounds contain every corresponding projected core center while excluding all foreign project cores.
- **SC-003** `[buildable]`: After programmatic pan, zoom, Fit, resize, and at least one simulation publication, representative project contour and label bounds change with their owned core positions, retain their project association, and never remain at the same screen coordinate while the owned cluster moves by more than 4 CSS pixels.
- **SC-004** `[buildable]`: Pointer, Enter, Space, and DOM navigator activation of each project contour/label opens Project, while the same activation set on each visible core opens Constellation directly; hit testing yields zero cross-action activations.
- **SC-005** `[buildable]`: At 1440×900, 1024×768, 360×800, coarse pointer, and 200% page scale, project envelopes visibly contain their constellation cores, required labels remain readable and collision-managed, and no generic central project disk or detached project text is presented.
- **SC-006** `[buildable]`: Focused dashboard renderer, navigation, accessibility, and Community-region regression suites pass with zero stale overlay publications, zero prior-page project overlays, and zero changes to Store, HTTP, URL, pagination, or persistence contracts.

## Assumptions

- The project-hierarchy Universe response already provides stable opaque project ownership and bounded project-owned constellation cores; this change repairs their visual composition rather than recomputing ownership.
- Existing project and constellation activation contracts, bounded paging, camera ownership, private-safe labels, and renderer generation guards remain authoritative.
- Organic project envelopes can reuse the proven semantic-region contour language while using project-owned Universe core positions as their input.
- Decorative background lighting may remain on semantic levels where it cannot be mistaken for data ownership.

## Dependencies

- Existing project-hierarchy Universe graph data and `owner_project_id` grouping.
- Existing Cosmos world-to-screen projection and overlay publication lifecycle.
- Existing semantic-region contour, collision, labeling, bridge, and accessible navigation primitives.
- Existing Vitest dashboard harness and real-browser visual interaction coverage.

## Out of scope

- Changing project or constellation partitioning, identities, labels, pagination, counts, or bridge aggregation in the Store or API.
- Changing URL, browser-history, breadcrumb, search-pivot, filter, or stale-recovery contracts.
- Replacing the Project, Constellation, or Neighborhood layouts beyond regression-safe compatibility adjustments.
- Persisting contour geometry or camera state in SQLite.
- Adding remote services, external assets, embeddings, or LLM calls.
