# Research: Guided Cosmos Dashboard Experience

## Renderer decision

Use `@cosmos.gl/graph` rather than `@cosmograph/react`.

- `@cosmos.gl/graph` 3.4.0 is the MIT-licensed GPU force-graph engine that powers Cosmograph. It provides WebGL2 rendering, asynchronous initialization, independent simulation controls, touch/pen interaction, highlighted point/link configuration, camera fitting, collision force, and GPU transitions for positions, colors, sizes, and link styles.
- `@cosmograph/react` provides a larger ready-made analysis surface but is CC-BY-NC-4.0. Even though the current user intent is non-commercial, embedding that package in an MIT project would narrow downstream freedom and create avoidable licensing ambiguity.
- Registry metadata confirms `@cosmos.gl/graph@3.4.0` supports Node `>=18`, uses MIT, and has an unpacked package size of roughly 4.58 MB. The dashboard therefore loads it through a local dynamic import at the graph boundary so the application shell can render independently.

Primary evidence:

- https://github.com/cosmosgl/graph
- https://www.npmjs.com/package/@cosmos.gl/graph
- https://cosmograph.app/library/
- https://www.npmjs.com/package/@cosmograph/react

## Graph integration findings

- The existing `MapCanvas` owns canvas sizing, viewport commands, selection, reduced motion, and cleanup. Keeping this component as the React-facing facade minimizes coordinator churn while replacing its internal renderer.
- Existing `MapData` already provides stable node/edge IDs and caps at 60/120/220 nodes depending on density. No backend or whole-database streaming change is needed.
- The current deterministic D3 projection can seed initial positions while cosmos.gl performs GPU simulation and animated updates. This keeps repeated fixtures stable and avoids an unrelated layout-algorithm migration in the first vertical slice.
- Point/link indices must be isolated behind a pure adapter so renderer callbacks never become the product identity contract.
- cosmos.gl can pause/unpause simulation and set transition duration to zero for reduced motion. A capability failure must leave the existing DOM graph navigator usable.

## ArcRift reference findings

The user's visual target is ArcRift's graph interaction grammar, not its surrounding product chrome. Its current `GraphView.tsx` uses Canvas and D3 with four qualities that materially change graph readability: degree-scaled circular nodes, label-propagation community colors, curved directed links, and focus/hover states that keep the local neighborhood vivid while dimming unrelated context. Selected nodes and neighbors receive readable labels; the selected node receives a glow and inner nucleus.

The Thoth implementation retains the already approved local GPU engine while reproducing those information-design qualities through native cosmos.gl arrays/configuration plus a small screen-positioned focus overlay. It does not copy ArcRift branding, layout, source code, or administrative interactions.

Primary evidence:

- https://github.com/Eshaan-Nair/ArcRift/blob/main/dashboard/src/components/GraphView.tsx
- https://github.com/Eshaan-Nair/ArcRift#dashboard

## Guided filter findings

- `/viz/filters` already returns projects, sessions, topic keys, observation types, and relations. Project-scoped calls return compatible sessions, topics, types, and relations.
- The current Observatory scope dock does not consume this endpoint and uses unrestricted text inputs for project, session, topic, and relation.
- Native `<datalist>` does not satisfy the closed-value requirement because arbitrary text remains valid. A closed searchable combobox must keep query text separate from the committed canonical value.
- Type and density have short finite option sets and can remain semantic selects. Project, session, topic, and relation need searchable listboxes with loading, empty, failure, retry, keyboard, and narrow-screen behavior.

## Human-language direction

- Primary labels describe the user's goal: explore memories, find memories, review history, inspect provenance, and check memory health.
- Canonical internal values remain unchanged in URL/API state. Presentation adapters translate values such as `HAS_TOPIC_KEY`, `session_summary`, and `wide` into readable labels.
- IDs, context tokens, and raw trace evidence remain available through bounded technical-details disclosures, not as the primary explanation.

## Modern browser guidance applied

- Every filter retains a visible programmatic label; placeholders do not replace labels.
- Searchable selectors use combobox/listbox semantics, keyboard selection, controlled result-count announcements, Escape dismissal, and no focus-triggered context change.
- Motion is short, interruptible, and disabled under `prefers-reduced-motion`; graph simulation retains an explicit pause mechanism.
- Structured options never fall back to unrestricted text entry when metadata is unavailable.

## Rejected alternatives

- `@cosmograph/react`: rejected because CC-BY-NC narrows downstream use and its analytics/UI layer exceeds the required renderer scope.
- Copying ArcRift's Canvas2D/D3 implementation: rejected because the approved GPU lifecycle already satisfies the performance and capability boundary; only its graph-reading principles are needed.
- Keeping the original tiny kind-specific star/triangle encoding: rejected after mounted visual QA because it made topology sparse, labels absent, and node meaning dependent on a legend.
- `<datalist>` filters: rejected because they permit invalid arbitrary values and provide inconsistent selection UX.
- A decorative particle/starfield overlay: rejected because motion must communicate graph state rather than compete with it.
