# Contract: Semantic Zoom over `GET /viz/atlas`

## Request

Existing query fields remain. Community accepts these additive fields:

| Field | Type | Rules |
| --- | --- | --- |
| `presentation` | `complete \| semantic-zoom` | Omitted preserves existing public complete Community pagination; dashboard sends `semantic-zoom` |
| `region_id` | opaque string | Valid only for Community + `semantic-zoom`; must belong to current Community/generation |

Universe and Neighborhood ignore no presentation fields silently: invalid combinations return a typed 400.

## Semantic-zoom Community response

Existing response fields remain. Add:

```ts
interface SemanticAtlasRegion {
  id: string;
  community_id: string;
  label: string;
  summary: string;
  member_count: number;
  project_count: number;
  time_from: string | null;
  time_to: string | null;
  concepts: Array<{ label: string; count: number }>;
  facets: {
    projects: AtlasFacetOption[];
    sessions: AtlasFacetOption[];
    topics: AtlasFacetOption[];
    types: Array<{ value: ObservationType; count: number }>;
  };
  representatives: Array<{
    node_id: string;
    reason: string;
    signals: Array<'structural' | 'bridge' | 'recency' | 'confidence' | 'diversity'>;
    rank: number;
  }>;
  seed_x: number;
  seed_y: number;
  unclustered: boolean;
}

interface SemanticAtlasRegionBridge {
  id: string;
  source_region_id: string;
  target_region_id: string;
  tier: 'region-aggregate';
  relationship_class: 'aggregate';
  direction: 'directed' | 'undirected' | 'mixed' | 'unknown';
  weight: number;
  evidence_count: number;
  relations: string[];
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  representative_edge_ids: string[];
  provenance: SemanticAtlasRelationshipProvenance[];
}

type SemanticAtlasRelationshipTier =
  | 'region-aggregate'
  | 'representative-backbone'
  | 'representative-semantic'
  | 'fact-support'
  | 'metadata';

type SemanticAtlasRelationshipClass =
  | 'aggregate'
  | 'semantic'
  | 'fact'
  | 'metadata'
  | 'unknown';

interface SemanticAtlasRelationshipProvenance {
  source_kind: 'kg-triple' | 'legacy-fact' | 'community-aggregate' | 'unknown';
  relation: string;
  evidence_count: number;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
}

interface SemanticAtlasEdge {
  // Existing fields remain.
  source_id: string;
  target_id: string;
  tier: Exclude<SemanticAtlasRelationshipTier, 'region-aggregate'>;
  relationship_class: SemanticAtlasRelationshipClass;
  direction: 'directed' | 'undirected' | 'mixed' | 'unknown';
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  evidence_count: number;
  provenance: SemanticAtlasRelationshipProvenance[];
}
```

`representatives` is the sole public region-membership explanation for the
bounded working set. Every returned representative observation occurs in
exactly one region entry. `reason` is generated from bounded private-safe signal
labels rather than copied source content, is at most 120 Unicode scalar values,
and never contains scores, canonical facet values, internal IDs, hashes, or raw
evidence. `signals` is nonempty, de-duplicated, ordered by contribution using
the enum order above as final tie-breaker, and has at most three items. `rank`
is one-based and unique within its region. The existing node `snippet` remains
memory content and MUST NOT be overloaded as an algorithmic explanation.

Prepared `edges` always use returned observation/node IDs as endpoints and are
therefore directly consumable by Cosmos. `region_bridges` are separate
region-anchor relationships: their endpoints are returned region IDs, they are
painted by the contour/region overlay, and they MUST NOT be converted into fake
memory nodes. Each bridge has `tier='region-aggregate'` by definition,
`direction='directed'` only when the returned source-to-target orientation is
supported by subject/object evidence. Opposing orientations are `mixed`,
explicitly non-directional evidence is `undirected`, and insufficient evidence
is `unknown`. Bridges apply the same rules after translating observation roles
to region roles; opaque IDs never determine direction. Each bridge also carries
a confidence band derived from its evidence and no more than five private-safe
provenance entries. Every prepared edge likewise
contains at most five provenance entries, sorted by evidence strength and stable
tie-breakers; unknown class, direction, confidence, or source is explicit.

`SemanticAtlasPageResponse` adds:

```ts
presentation: 'complete' | 'semantic-zoom';
regions: SemanticAtlasRegion[];
region_bridges: SemanticAtlasRegionBridge[];
navigation: {
  // existing fields
  region_id: string | null;
  source_memory_count: number;
  visible_memory_count: number;
  source_relationship_count: number;
  visible_relationship_count: number;
  represented_source_relationship_count: number;
};
```

For `semantic-zoom` Community:

- `nodes` are the bounded representative observation working set.
- `edges` are bounded prepared visual relationships whose endpoints both occur
  in `nodes`; `region_bridges` are renderable region-anchor relationships.
- One inclusive visual budget applies: `edges.length + region_bridges.length <=
  450`. `visible_relationship_count` equals that sum, so an implementation
  cannot hide aggregate bridges outside the advertised renderer budget.
- `continuation` is `null`; the view is a complete bounded projection, not the first page of an implicit drain.
- `truncated` is `true` exactly when source identities/relationships are omitted from the visual working set.
- Existing `navigation.omitted_nodes` exposes exact omitted source memories.
  `represented_source_relationship_count` is the cardinality of the internal
  union of source relationship identities represented by edges and aggregate
  bridges; `navigation.omitted_edges` is exactly
  `source_relationship_count - represented_source_relationship_count`. An
  aggregate bridge that covers many source relationships therefore remains one
  painted identity without corrupting source accounting.
- `counts.memory_count` remains the exact scoped source memory count.
- `counts.relationship_count` remains the exact source relationship count for the active level.
- `navigation.visible_*` and the arrays describe only the returned working set.

## Errors

Add codes:

| Code | Status | Meaning | Recovery |
| --- | --- | --- | --- |
| `VIZ_ATLAS_PRESENTATION_INVALID` | 400 | Presentation/level combination invalid | current level |
| `VIZ_ATLAS_REGION_GONE` | 409 | Region is no longer current or no longer belongs to Community | current Community overview |

Existing generation, facet, Community, and focus errors remain unchanged. A region response is bound to the same scope fingerprint and generation as its parent Community.

## OpenAPI and client

- `src/http-routes.ts` validates and forwards both fields.
- `src/http-openapi.ts` documents query enums, region schemas, navigation counts, and typed errors.
- `src/http-server.ts` keeps the same `GET /viz/atlas` dispatcher; no new route is required.
- `dashboard/src/api/client.ts` mirrors the exact additive contract.
- No raw canonical facet or private-marked region evidence crosses the HTTP boundary.
