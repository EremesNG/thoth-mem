# Feature Specification: Continuous Full Neural Atlas

**Change ID**: `dashboard-continuous-full-atlas`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: The Neural Atlas now has the right spatial and visual language, but its periodic simulation reheats make node motion visibly stop and restart, its initial visualization caps expose only a small sample of the active memory scope, and its guided selector listboxes are clipped by the filter overlay. These defects make a living memory universe feel stalled, incomplete, and unreliable at the exact moments when users try to explore it.<br>
**Impact**: The atlas will maintain smooth, low-energy motion without periodic stop/start cadence or long-term spatial collapse; it will progressively load and merge the complete current graph for the active scope through bounded deterministic pages without a manual reveal step; and every guided selector will open in a viewport-aware top layer above the filter surface. The existing Cosmos renderer, semantic navigator, scope semantics, focus/history contracts, privacy boundary, reduced-motion behavior, and same-origin delivery remain authoritative.<br>
**Affected capabilities**: `dashboard`, `dashboard-memory-navigation`, `dashboard-design-system`, `visualization-api`

## User stories

### US1 - Explore a continuously living atlas (Priority: P1)

As a user observing agent memory, I can watch the constellation move with a subtle continuous flow so that it feels alive rather than advancing in visible pulses or collapsing while I watch.

**Independent test**: Mount the production Cosmos surface in normal motion, sample consecutive simulation frames and projected positions after its entrance, then exercise Pause, reduced motion, visibility changes, dataset replacement, renderer failure, and teardown.

**Covers**: FR-001, FR-002, FR-006, FR-010, SC-001, SC-002, SC-003, SC-012, SC-013

**Acceptance scenarios**:

1. **Given** normal motion preferences and a visible atlas, **When** the initial entrance completes, **Then** low-energy node movement continues without a periodic stop/reheat cadence or large positional jumps.
2. **Given** a settled full graph, **When** it remains open, **Then** its communities retain a stable overall extent and do not progressively collapse into a small central cluster.
3. **Given** the user pauses motion, requests reduced motion, hides the document, or loses the renderer, **When** time passes, **Then** nonessential movement stops immediately and does not restart until an allowed visible resume.
4. **Given** new pages of graph data arrive, **When** they merge into the atlas, **Then** additions enter smoothly without restarting the entire constellation or discarding the current focus and camera.

### US2 - See the complete graph for the active scope (Priority: P1)

As a user exploring memory, I can see every current node and relationship that matches my active scope so that important communities are not hidden behind an arbitrary sample or a manual “Reveal more” action.

**Independent test**: Serve multiple deterministic visualization pages containing at least 2,565 nodes and 5,414 edges, mutate and retract source facts between pages, mount the production observatory, and verify that it automatically requests every continuation, restarts an invalidated snapshot within a bounded budget, merges exact identities once, reports progress, and finishes with the complete scoped counts.

**Covers**: FR-003, FR-004, FR-005, FR-006, FR-010, FR-011, SC-004, SC-005, SC-006, SC-007, SC-012, SC-014

**Acceptance scenarios**:

1. **Given** a graph larger than one HTTP page, **When** the observatory resolves its active scope, **Then** it automatically follows every continuation until the complete current scoped graph is present without requiring “Reveal more”.
2. **Given** pages contain repeated project, session, topic, node, or relationship identities, **When** they merge, **Then** each node and edge appears exactly once and every rendered edge has both endpoints.
3. **Given** the graph is still arriving, **When** the user watches or interacts, **Then** a concise loading state and current counts remain visible while already loaded nodes stay navigable.
4. **Given** the user changes scope while pages are in flight, **When** older pages resolve, **Then** they cannot enter the new graph and the new scope begins its own complete load.
5. **Given** the user changes Field of view, **When** the atlas updates, **Then** presentation and camera detail may change but the complete scoped node and edge set remains included.
6. **Given** a source fact is inserted, deleted, updated, or superseded between continuation requests, **When** the next page validates its cursor, **Then** the server rejects that stale graph generation and the observatory discards the mixed accumulator and automatically restarts from a fresh first page within a bounded retry budget.

### US3 - Choose filters from an unclipped top layer (Priority: P1)

As a user shaping the atlas, I can open and search every guided selector above surrounding panels so that all choices remain visible and reachable instead of being cut off inside the filter surface.

**Independent test**: Open every guided selector from the atlas and Control Room at desktop, tablet, mobile, short-height, scrolled, and 200% scale states; verify top-layer placement, collision handling, hit testing, keyboard operation, canonical value commits, and light dismissal.

**Covers**: FR-007, FR-008, FR-009, FR-010, SC-008, SC-009, SC-010, SC-011, SC-012

**Acceptance scenarios**:

1. **Given** a selector inside the scrollable filter overlay, **When** it opens, **Then** its listbox is promoted above that overlay and is not clipped by any ancestor overflow boundary.
2. **Given** insufficient room below or beside a trigger, **When** the listbox opens or the visual viewport changes, **Then** it flips or clamps while remaining tethered to the trigger and fully hit-testable.
3. **Given** keyboard-only use, **When** the user opens, searches, navigates, commits, escapes, or tabs away, **Then** the combobox/listbox semantics and canonical-value contract remain complete.
4. **Given** mobile or 200% page scale, **When** a selector opens, **Then** the trigger and listbox remain inside the visual viewport without horizontal page overflow.

### US4 - Retain access and trust at full density (Priority: P1)

As a user with a large memory store or constrained rendering environment, I can still navigate, pause, filter, and recover the atlas safely so that completeness does not sacrifice accessibility, privacy, or lifecycle correctness.

**Independent test**: Exercise the mounted 2,565-node/5,414-edge atlas through pointer and keyboard commands, responsive viewports, reduced motion, WebGL failure/retry, private-marked data, rapid scope supersession, and unmount cleanup.

**Covers**: FR-009, FR-010, FR-011, FR-012, SC-006, SC-007, SC-010, SC-011, SC-012, SC-013, SC-014, SC-015

**Acceptance scenarios**:

1. **Given** thousands of nodes and relationships, **When** the graph is loading or fully present, **Then** primary controls, semantic navigation, selection, filtering, and camera commands remain responsive and usable.
2. **Given** WebGL initialization or context recovery fails, **When** the rich renderer is unavailable, **Then** the complete loaded semantic graph, active scope, focus, and one bounded Retry remain usable.
3. **Given** private-marked stored text, **When** graph pages, progress, labels, selectors, or fallback content render, **Then** private content remains absent from DOM, URL/history, diagnostics, and external network traffic.
4. **Given** a route change, scope change, abort, failure, or unmount, **When** background page loads or animation work completes, **Then** no stale state, request, timer, frame, observer, simulation, browser process, or temporary profile survives its owner.

## Edge cases

- Empty and single-page graphs, disconnected components, isolated nodes, duplicate identities across pages, and a final page that contributes no new identities.
- Invalid, replayed, skipped, scope-mismatched, or generation-stale continuation tokens; insertion, deletion, update, or supersession between pages; repeated mutation beyond the automatic restart budget; and a page failure after useful earlier pages have rendered.
- Dense fixtures above 2,500 nodes and 5,000 edges, graphs whose complete current scope exceeds ten pages, and rapid scope changes during pagination.
- Pause or reduced motion requested before renderer readiness, while a new page merges, during focus travel, or immediately before a visibility change.
- Long-running normal mode, background/foreground transitions, WebGL context loss, renderer retry, route replacement, and repeated mount/unmount.
- Filter triggers near every viewport edge, inside nested scrolling, after panel scroll, on short viewports, mobile visual viewport offsets, coarse pointer, and 200% page scale.
- Empty, loading, error, retry, and very long selector option sets with private-marked labels.
- Browsers without native Popover API or CSS anchor positioning support.

## Functional requirements

- **FR-001 — Living but bounded motion**: `[MODIFIED dashboard-memory-navigation]` Normal mode MUST run one smooth low-energy simulation after entrance and data transitions without periodic stop/reheat cycles; Pause, reduced motion, hidden documents, renderer failure, supersession, and destroy MUST stop nonessential movement.
- **FR-002 — Purposeful graph motion**: `[MODIFIED dashboard-design-system]` Continuous motion MUST remain subtle and frame-coherent, MUST preserve the atlas community extent over time, and MUST use bounded interruptible emphasis for focus, camera, and progressive data additions rather than large jumps or full-layout restarts.
- **FR-003 — Canonical graph home**: `[MODIFIED dashboard]` The canonical graph workspace MUST automatically load the complete current visualization graph matching the active scope through progressive bounded pages and MUST NOT require a separate load or reveal-more action.
- **FR-004 — Complete scoped graph pagination**: `[ADDED visualization-api]` The visualization graph contract MUST provide deterministic scope-bound continuation pages with stable ordering, no artificial total-result cap, an explicit terminal continuation state, and page-level bounds that protect each request. Every cursor MUST identify one validated current graph generation; insertion, deletion, update, or supersession between pages MUST invalidate that cursor so the client can discard the mixed accumulator and automatically restart from a fresh first page within a bounded budget.
- **FR-005 — Spatial frontier expansion**: `[MODIFIED dashboard-memory-navigation]` Progressive graph pages and explicit neighbor pivots MUST merge stable node and edge identities without duplicates or dangling endpoints, preserve already loaded graph context, and distinguish loading, partial, complete, superseded, and failed outcomes.
- **FR-006 — Stable full-atlas geometry**: `[ADDED dashboard-memory-navigation]` Progressive loading and continuous simulation MUST retain a stable world aspect and community distribution, preserve user camera/focus after interaction, and perform at most one automatic final whole-graph fit when the user has not changed the viewport.
- **FR-007 — Guided scope selectors**: `[MODIFIED dashboard-memory-navigation]` Project, session, topic, type, relation, and Field of view selectors MUST keep their metadata-only canonical value contract while rendering searchable listboxes outside ancestor overflow clipping.
- **FR-008 — Compact guided scope overlay**: `[MODIFIED dashboard]` The compact filter surface MUST keep every open selector listbox visibly tethered above the atlas overlay, allow the listbox to outlive panel clipping without reserving graph space, and restore focus predictably when it closes.
- **FR-009 — Resilient selector top layer**: `[ADDED dashboard-design-system]` Guided listboxes MUST use a top-layer or equivalent portal strategy with visual-viewport collision handling, correct elevation, hit testing, light dismissal, and complete combobox/listbox keyboard and accessibility semantics.
- **FR-010 — Bounded asynchronous lifecycle**: `[MODIFIED dashboard-memory-navigation]` Scope pagination, progressive merges, selector positioning, visibility handling, animation, and renderer work MUST be abortable or generation-guarded and MUST release all requests, timers, frames, observers, listeners, simulations, portals, and owned test resources when superseded or unmounted.
- **FR-011 — Dense renderer performance**: `[ADDED dashboard-design-system]` The rich renderer MUST retain every loaded scoped node and edge while using density-aware visual quality and yielded main-thread preparation to keep interaction responsive; performance adaptation MUST NOT silently discard graph identities.
- **FR-012 — Private local-first presentation**: `[MODIFIED dashboard]` Complete graph pages, loading progress, selector portals, semantic fallback, and renderer diagnostics MUST remain same-origin and private-safe through the established presentation boundary.

## Success criteria

- **SC-001** `[buildable]`: During a mounted three-second normal-mode sample after entrance, consecutive simulation tick gaps remain at or below 250 ms, at least one visible node moves in every 500 ms window, and no single projected step exceeds 8 CSS pixels.
- **SC-002** `[buildable]`: A mounted normal-mode run records one uninterrupted ambient simulation cycle after entrance with zero periodic interval-driven stop/start reheats; explicit Pause freezes the motion probe for at least 2.3 seconds and Resume restores continuous movement.
- **SC-003** `[outcome]`: In an independent five-minute visible soak of the complete dense fixture, the fitted graph bounding-box width, height, and aspect each remain within 15% of their post-load baseline and no visible stop/start cadence is observed.
- **SC-004** `[buildable]`: A deterministic visualization fixture spanning at least four pages returns every expected current scoped node and edge exactly once, produces no dangling edge endpoint, and ends with `continuation: null`; inserting, deleting, updating, and superseding facts between pages each produces a generation-stale response, after which the mounted loader automatically restarts and converges to the exact new current graph within two restarts.
- **SC-005** `[buildable]`: The mounted production observatory automatically consumes a fixture of at least 2,565 nodes and 5,414 edges without user continuation input, finishes with those exact deduplicated counts, and exposes no “Reveal more” action.
- **SC-006** `[buildable]`: While the large fixture is paging and after it completes, Fit, zoom, pause/resume, reset, focus traversal, selection, filtering, and semantic navigation all produce their mounted outcomes without replacing the canvas or losing focus.
- **SC-007** `[buildable]`: Field of view changes preserve the exact completed node-ID and edge-ID sets while changing only documented presentation or camera detail.
- **SC-008** `[buildable]`: Every atlas and Control Room guided selector renders its listbox outside the nearest clipping ancestor, above the triggering surface, and `elementFromPoint` at every visible option resolves to that listbox or option.
- **SC-009** `[buildable]`: At 1440×900, 1024×768, 360×800, a short-height viewport, and 360×800 at 200% scale, each open listbox remains fully inside the visual viewport with at least 8 CSS pixels of collision margin and causes zero horizontal page overflow.
- **SC-010** `[buildable]`: All eight selector interactions—Search, Arrow Up/Down, Enter, Escape, outside pointer dismissal, clear, and focus return—pass against the portaled production selector while `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role=listbox`, and `aria-selected` remain synchronized.
- **SC-011** `[buildable]`: Opening or repositioning a selector changes the underlying atlas canvas width and height by no more than 1 CSS pixel and does not reset graph focus, camera, or motion state.
- **SC-012** `[buildable]`: Rapid scope replacement, page failure/retry, document visibility change, WebGL loss/retry, selector open/close, route change, and unmount tests show zero stale merges, forbidden motion restarts, or leaked portals, requests, timers, frames, observers, listeners, simulations, browser processes, ports, or temporary profiles.
- **SC-013** `[buildable]`: Reduced motion, hidden document, paused state, and renderer failure produce zero nonessential position changes while preserving every loaded semantic node, edge, focus, and selector outcome.
- **SC-014** `[buildable]`: The 2,565-node/5,414-edge mounted fixture keeps primary pointer and keyboard controls hit-testable and responds to a representative focus or viewport command within 250 ms on the verification runtime, with no main-thread task longer than 200 ms during page merges.
- **SC-015** `[outcome]`: Independent visual review passes all 6 current-tree screenshot states—initial paging, complete dense atlas, focused atlas, open desktop selector, mobile selector, and 200% selector—with zero sparse-sample presentations, collapsed constellations, or clipped listboxes.

## Assumptions

- “Complete graph” means every current, non-deleted, non-superseded visualization node and relationship matching the active project/session/topic/type/relation/query scope; historical superseded facts remain excluded unless a separate history-inclusive contract is explicitly chosen.
- Individual HTTP pages remain bounded, but the client follows their deterministic continuation until the active scope is complete; completeness is not implemented by one unbounded response. Each page is read in a consistent Store transaction, and continuation validity is defined by a deterministic fingerprint of every visualization source row and current-state discriminator in that scope rather than by a high-water mark alone.
- Field of view remains a presentation/camera choice and no longer controls whether scoped graph identities are fetched.
- The locally packaged `@cosmos.gl/graph` renderer remains the primary rich renderer because it already supports GPU simulation at the target scale; dependency changes remain allowed only if measured implementation evidence requires them.
- Existing semantic fallback, private-safe presentation, URL/history, focus, dock, and same-origin contracts remain compatible.
- Required mounted verification includes 1440×900, 1024×768, 360×800, 200% scale, coarse pointer, reduced motion, hidden-document behavior, and WebGL initialization/context failure.

## Dependencies

- Existing React 19/Vite 8 dashboard, locally packaged `@cosmos.gl/graph`, visualization Store/HTTP routes, and typed dashboard API client.
- Existing `GuidedSelect`, Observatory scope/state coordinator, semantic `GraphNavigator`, safe-presentation boundary, and in-repository real-Chrome harness.
- Native browser visual viewport, portal/top-layer, resize/scroll observation, animation-frame, and abort primitives with bounded fallbacks where support differs.

## Out of scope

- Changing embeddings, memory persistence schema, fact extraction, community semantics, or retrieval ranking.
- Loading deleted or superseded history into the default current-state graph.
- Copying Graphify or ArcRift code, assets, branding, or exact layouts.
- Introducing remote graph rendering, telemetry, fonts, or third-party data transfer.
- Replacing the 2D atlas with 3D, VR, or an unbounded single HTTP response.
- Redesigning Control Room content beyond applying the shared selector top-layer behavior.
