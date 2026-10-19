# Data Model: Project Nebula Atlas Navigation

## Request state

```ts
type AtlasHierarchy = 'global' | 'project';
type AtlasLevel = 'universe' | 'project' | 'community' | 'neighborhood';

interface SemanticAtlasPageRequest {
  hierarchy?: AtlasHierarchy; // omitted => global compatibility path
  level?: AtlasLevel;
  project_id?: string;        // opaque navigation parent
  project_token?: string;     // opaque optional facet; never a navigation parent
  community_id?: string;
  region_id?: string;
  focus_node_id?: string;
  page_size?: number;         // Universe/project: number of project regions; Project: constellations
  cursor?: string;            // opaque cursor for exactly one bounded visual page
  // existing scope, pagination, depth, and presentation fields remain
}
```

`project_id` and `project_token` are domain-separated opaque identities. The Store may resolve both to the same canonical value, but conflicting resolutions are invalid.

## Canonical ownership

```ts
interface ProjectAtlasProjection {
  projects: ProjectAtlasProject[];
  projectByObservationId: Map<string, string>;
  communityByObservationId: Map<string, string>;
  communityById: Map<string, ProjectAtlasCommunity>;
  projectBridges: SemanticAtlasProjectBridge[];
  communityEdgesByProjectId: Map<string, SemanticAtlasEdge[]>;
}

interface ProjectAtlasProject {
  id: string;
  canonicalKey: string | typeof UNASSIGNED_PROJECT;
  nodeIds: string[];
  communityIds: string[];
  safeLabel: string;
  safeSummary: string;
  unassigned: boolean;
  seed_x: number;
  seed_y: number;
}

interface ProjectAtlasCommunity {
  id: string;
  project_id: string;
  member_ids: string[];
  unclustered: boolean;
  node: SemanticAtlasNode;
}
```

Invariants:

1. Every scoped current observation occurs in exactly one `ProjectAtlasProject`.
2. Every scoped current observation occurs in exactly one `ProjectAtlasCommunity` owned by that project.
3. Every project-owned community has exactly one `project_id` and never reports mixed-project membership.
4. An eligible edge with equal endpoint parents may affect child partitioning/aggregation; an edge with different parents may affect only a project bridge.
5. Missing KG never removes an observation; missing project uses the single `UNASSIGNED_PROJECT` sentinel.

## Public project groups

```ts
interface SemanticAtlasProjectRegion {
  id: string;
  label: string;
  summary: string;
  memory_count: number;
  constellation_count: number;
  visible_constellation_count: number;
  omitted_constellation_count: number;
  constellation_ids: string[];
  seed_x: number;
  seed_y: number;
  unassigned: boolean;
}

interface SemanticAtlasProjectBridge {
  id: string;
  source_project_id: string;
  target_project_id: string;
  tier: 'project-aggregate';
  relationship_class: 'aggregate';
  direction: SemanticAtlasRelationshipDirection;
  weight: number;
  evidence_count: number;
  confidence: SemanticAtlasRelationshipConfidence;
  representative_edge_ids: string[];
  provenance: SemanticAtlasRelationshipProvenance[];
}
```

Project regions and bridges are overlay identities, never fake Cosmos nodes. Universe `nodes` are representative project-owned community cores; each has `owner_project_id`.

## Identity derivation

- Project nebula: `hash('project-nebula', canonical project value)`; Unassigned uses a fixed domain sentinel.
- Project-owned community: `hash('project-community', hierarchy algorithm version, project ID, complete sorted member IDs)`.
- Project bridge: `hash('project-bridge', ordered project endpoints, represented relation identity set/version)`.
- Semantic location: `hash('atlas-location', hierarchy, level, project, community, page cursor, stable scope fingerprint)`.
- Region identity remains derived from its complete Community member set and region algorithm version.

Human labels, safe-label suffixes, page order, viewport size, and camera state never participate in semantic ownership IDs.

## Level payloads

| Hierarchy/level | Nodes | Overlay groups | Relationship tier | Ownership |
| --- | --- | --- | --- | --- |
| global / Universe | Existing global community nodes | none | global community aggregate | existing compatibility path |
| project / Universe | Representative project-owned community cores | project regions | project bridges + bounded child aggregates | all visible projects |
| project / Project | Project-owned community nodes | none | cross-community aggregate | one project |
| project / Community | Bounded observation representatives | semantic regions | region bridges + representative links | one project + community |
| project / Neighborhood | Observations/supporting facts | none | bounded local support | one project + community + focus |

## Counts and omissions

The response retains existing totals and adds level-local values:

```ts
interface SemanticAtlasNavigation {
  project_id: string | null;
  source_project_count: number;
  visible_project_count: number;
  omitted_projects: number;
  source_constellation_count: number;
  visible_constellation_count: number;
  omitted_constellations: number;
  // existing memory and relationship counts remain
}
```

All counts are exact for the active scope and level. `visible_*` describes identities in the committed working set; `omitted_* = source_* - represented_*` and is never negative.

## Semantic location and camera

```ts
interface ObservatoryLocation {
  level: AtlasLevel;
  projectId: string | null;
  communityId: string | null;
  pageCursor: string | null;
  regionId: string | null;
  focusNodeId: string | null;
}

interface SemanticCameraSnapshot {
  layoutIdentity: string;
  centerX: number;
  centerY: number;
  zoom: number;
  worldExtent: NeuralAtlasWorldExtent;
}
```

Camera snapshots live only in the browser runtime and are keyed by exact semantic location. A snapshot is valid only when every numeric field is finite, zoom is within renderer bounds, identity matches, and its center/extent intersects current geometry. Region focus is a same-location presentation replacement; changing project, community, bounded-page cursor, neighborhood focus, scope, or membership geometry changes location/layout identity.

## Semantic recall and pivot ownership

```ts
interface SemanticObservatoryRecallRequest {
  hierarchy?: AtlasHierarchy; // omitted => global compatibility
  // existing context, lane, and limit fields remain
}

interface AtlasPivotLocation {
  hierarchy: AtlasHierarchy;
  context_token: string;
  scope: AtlasTokenScope;
  project_id: string | null;
  community_id: string;
  focus_node_id: `obs:${number}`;
  target: ObservatoryPivotTarget;
}
```

For `hierarchy='project'`, recall emission and pivot resolution bind the same revision-scoped `project_id` plus project-owned `community_id` in the pivot token. The Store revalidates both before responding. The dashboard consumes those opaque owners atomically; it never derives a navigation project from `project_token`, a safe label, or a raw value. Omitted hierarchy retains global community ownership and returns `project_id=null`.

## Bounded visual pages

```ts
interface SemanticAtlasPagePolicy {
  mode: 'accumulate' | 'single-page';
  requestedPageSize: number;
  maxVisibleProjectRegions: number;
  maxVisibleConstellationCores: number;
}
```

- Project-hierarchy Universe and Project use `single-page`; global compatibility keeps `accumulate`.
- Universe `page_size` counts project regions and is clamped to `1..150`. The dashboard requests `24`; fair core allocation supplies at most three cores per requested project and at most `72` cores for that page, while the public hard ceiling remains `150`.
- The response `continuation` is the next page cursor. Advancing it replaces nodes, edges, project regions, bridges, counts, and overlays rather than calling `mergeSemanticAtlasPages`.
- `pageCursor` participates in URL/trail/layout identity. Next commits the response continuation; Previous restores the prior location-trail cursor. A direct opaque cursor URL is valid without the earlier cursor stack.
- Source counts describe the complete active scope; visible counts describe only the committed page; omitted counts never imply that prior pages remain painted.

## Cache and lifecycle

- Existing global projection/cache remains the compatibility owner.
- Project hierarchy is a lazy revision-bound derivative of the same scoped observations and structural evidence.
- Cache and response fingerprints include hierarchy and the full active semantic owner tuple.
- Pagination never changes project or constellation semantic IDs, but each page cursor is a distinct semantic location and camera key; a generation change invalidates cursors, accumulators, and foreign camera snapshots.
- No schema or persistent migration is required.
