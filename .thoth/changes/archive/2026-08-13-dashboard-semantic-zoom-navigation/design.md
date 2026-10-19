# Experience Design: Semantic Zoom Neural Atlas

## Reference concept

The approved concept is a full-viewport blue-black neural field with an always-dominant canvas, named semantic clouds, small memory stars, few aggregate bridges, and an in-place right dock. The central signature is continuous semantic zoom: detail appears because the user approaches or focuses a region, not because the page dumps every edge.

Generated concept reference from the design exploration:

[`evidence/concept-reference.png`](evidence/concept-reference.png)

## Visual hierarchy

1. Full viewport atlas field.
2. Named semantic region clouds/contours.
3. Small memory stars, with bounded bridge hubs.
4. Aggregate semantic currents between regions.
5. Local representative links only as zoom/focus increases.
6. Focus aura, nearby labels, and an in-place details dock.

## Community overview

- Show 6–12 soft organic region contours, never rigid cards or circles.
- Each region label includes a short name and memory count.
- Render 80–180 representative stars across the whole constellation.
- Show only region aggregate bridges and a sparse spanning backbone.
- Keep at least 70% of the canvas visually separable background on the dense fixture.
- Counts read as `1,000 source memories · 9 regions · 148 visible` rather than implying all source identities are painted.

## Exploration band

- Zoom threshold uses hysteresis to avoid flicker: enter exploration at camera zoom ≥1.55; leave only below 1.35.
- Region labels persist; additional local memory labels appear collision-managed.
- Representative semantic links fade in by relevance and relation filter.
- Region contours become quieter but remain spatial context.
- Zoom alone never starts a network request.

## Focused region

- Activating a contour/label records `region=<id>` and requests one bounded region-aware working set.
- The selected region becomes vivid; other regions remain visible at low opacity.
- Camera travels to its stable anchor without resizing the canvas.
- The dock explains membership, concepts, time range, facets, representatives, and strongest bridges.
- Clear/Back restores Community overview positions and camera.

## Neighborhood

- Selecting a representative observation enters the existing Neighborhood level.
- Individual semantic and fact/provenance relationships become complete within the existing 300-node cap.
- Unrelated Community context is not carried as peer nodes; breadcrumb/Back restores it.

## Relationship grammar

- Region aggregate: broad low-opacity curve; width communicates evidence count.
- Extracted/structural semantic: solid cyan/mint.
- Inferred or lower-confidence semantic: dashed violet/amber.
- Focused local relationship: bright endpoint gradient and increased width.
- Direction remains encoded by arrows only where density permits; accessible text always includes direction.

## Interaction and accessibility

- Region contours and labels have DOM-backed buttons in `GraphNavigator`.
- Enter/Space activate the same region or memory as pointer click.
- H/J/K/L, fit, zoom, reset, pause, focus traversal, Back/Forward, and Escape remain supported.
- Reduced motion disables camera travel and ambient drift without hiding any region or relationship tier.
- WebGL fallback exposes regions first, then representative memories grouped under each region.
- Desktop dock overlays the right side; mobile uses the existing bounded bottom sheet. Neither changes canvas world geometry.

## Responsive behavior

- Desktop: 6–12 region labels, compact relation legend near the atlas controls, dock at right.
- Tablet: 6–9 labels prioritized by membership/bridge strength; legend collapses to a popover beside controls.
- Mobile: 4–6 highest-priority labels; region navigator/dock carries the complete semantic list.
- 200% page scale follows `visualViewport`; controls, dock close, region labels, and tabs remain hit-testable.
