# Contract: Project Hierarchy over `GET /viz/atlas`

## Additive request fields

| Field | Type | Rules |
| --- | --- | --- |
| `hierarchy` | `global | project` | Omitted resolves to `global`; dashboard semantic navigation sends `project` |
| `level` | `universe | project | community | neighborhood` | `project` level is valid only for `hierarchy=project` |
| `project_id` | opaque string | Required for project-hierarchy Project, Community, and Neighborhood; absent in project-hierarchy Universe |
| `page_size` | integer | Project-hierarchy Universe counts project regions, Project counts constellations; both clamp to `1..150` |
| `cursor` | opaque string | Selects exactly one deterministic page for the negotiated hierarchy, level, scope, and generation |

Existing `project_token` remains an optional opaque facet. It is never accepted as `project_id`. When both resolve to different canonical projects, the request fails with `VIZ_ATLAS_PROJECT_SCOPE_INVALID`.

## Valid request matrix

| Hierarchy | Level | Required owner fields | Result |
| --- | --- | --- | --- |
| omitted/`global` | Universe | none | existing global community aggregate response |
| omitted/`global` | Community | `community_id` | existing complete or semantic-zoom Community response |
| omitted/`global` | Neighborhood | `community_id`, `focus_node_id` | existing bounded Neighborhood response |
| omitted/`global` | Project | invalid | typed 400 |
| `project` | Universe | none | project nebulae + representative project-owned constellation cores |
| `project` | Project | `project_id` | selected project's constellation aggregates |
| `project` | Community | `project_id`, `community_id` | selected project-owned constellation, complete or semantic-zoom |
| `project` | Neighborhood | `project_id`, `community_id`, `focus_node_id` | bounded local evidence with validated ownership |

Unexpected owner fields and invalid presentation/level combinations return typed 400 responses; they are never ignored.

## Additive response fields

```ts
interface SemanticAtlasPageResponse {
  hierarchy: 'global' | 'project';
  project_regions: SemanticAtlasProjectRegion[];
  project_bridges: SemanticAtlasProjectBridge[];
  // existing fields remain
}

interface SemanticAtlasNode {
  owner_project_id: string | null;
  // existing fields remain
}

interface SemanticAtlasNavigation {
  project_id: string | null;
  source_project_count: number;
  visible_project_count: number;
  omitted_projects: number;
  source_constellation_count: number;
  visible_constellation_count: number;
  omitted_constellations: number;
  // existing fields remain
}
```

Global responses set `hierarchy='global'`, return empty project arrays, set `project_id=null`, and retain existing node ownership, pagination, counts, and errors.

## Project hierarchy rules

- Universe returns no observation nodes.
- Universe returns at most 150 project regions and at most 150 constellation cores in one visual working set.
- At Universe, `page_size` counts project regions. The dashboard requests 24 regions and the Store fairly allocates at most 72 representative cores for that page; other public callers remain bounded by the 150-region/150-core hard ceiling.
- Every visible project receives one deterministic core before another project receives an additional core.
- Project returns only communities whose `owner_project_id` equals `navigation.project_id`.
- Project-hierarchy Universe and Project continuations are visual pages: the dashboard stops after one response and replaces the current working set on Next. It never merges identities, overlays, or cameras from two pages. Previous restores the prior opaque cursor from semantic location history.
- Any navigable project-owned constellation contains at most 1,000 source observations.
- Community `presentation=semantic-zoom` retains the existing 80–180 representative-memory and 450 prepared-relationship budgets.
- Existing continuation and generation rules remain deterministic; continuation never changes project/constellation ownership identity, but its cursor identifies a distinct page-scoped semantic location and camera.
- Project regions and project bridges are overlay identities and do not appear as fake node/edge endpoints in Cosmos arrays.

## Semantic recall and pivot

`GET /observatory/recall` accepts additive `hierarchy=project`; omission preserves global recall ownership. `POST /observatory/pivot` accepts the same additive `hierarchy` in its body.

For project hierarchy, each recall pivot token binds the revision-scoped owning project and project-owned constellation. Pivot resolution revalidates that tuple and returns:

```ts
interface AtlasPivotLocation {
  hierarchy: 'project';
  context_token: string;
  scope: AtlasTokenScope;
  project_id: string;
  community_id: string;
  focus_node_id: `obs:${number}`;
  target: 'map' | 'timeline' | 'ledger' | 'recall';
}
```

The dashboard MUST send `hierarchy='project'` and commit `project_id`, `community_id`, and `focus_node_id` atomically before requesting Neighborhood. It MUST NOT derive `project_id` from a facet token or presentation label. An omitted/global pivot returns `hierarchy='global'` and `project_id=null` while preserving the existing global `community_id` behavior.

## Errors

| Code | Status | Meaning | Recovery |
| --- | --- | --- | --- |
| `VIZ_ATLAS_HIERARCHY_INVALID` | 400 | Hierarchy/level/owner field combination is invalid | current valid level or Universe |
| `VIZ_ATLAS_PROJECT_SCOPE_INVALID` | 400 | Project parent conflicts with project facet scope | remove conflicting facet or return Universe |
| `VIZ_ATLAS_PROJECT_GONE` | 409 | Opaque project identity is no longer current | project-hierarchy Universe |
| `VIZ_ATLAS_COMMUNITY_GONE` | 409 | Project-owned constellation is stale or belongs to another project | owning Project when current, otherwise Universe |

Existing region, focus, cursor, generation, and presentation errors remain. A wrong-parent region or focus never resolves by searching another project implicitly.

## Privacy and compatibility

- IDs hash canonical values with domain separation; canonical project values never appear in URL, request metadata, errors, or technical disclosure.
- Labels and summaries pass the shared private-safe presentation boundary.
- The Unassigned project has a fixed safe label and opaque sentinel-derived ID.
- Omission of `hierarchy` is the compatibility boundary and preserves the existing public contract.
- The dashboard uses only the project hierarchy for its default semantic atlas; Raw remains an explicit `/viz/graph` diagnostic path.
