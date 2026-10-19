# Semantic Atlas HTTP Contract

## Endpoint

`GET /viz/atlas`

This additive route is the default dashboard graph source. Existing `/viz/graph` remains the explicit corrected Raw diagnostic source.

## Request

| Query field | Type | Rules |
| --- | --- | --- |
| `level` | `universe | community | neighborhood` | Defaults to `universe`. |
| `project_token` | opaque facet token | Optional exact project scope; raw project values are rejected. |
| `session_token` | opaque facet token | Optional exact session scope; raw session values are rejected. |
| `topic_token` | opaque facet token | Optional exact topic scope; raw topic values are rejected. |
| `type` / `observation_type` | observation type | Existing aliases and validation. |
| `relation` | string | Restricts eligible relationship evidence; metadata-only values remain facets. |
| `query` | string | Existing private-safe semantic cue scope. |
| `community_id` | string | Required for `community`; optional/current owner assertion for `neighborhood`. |
| `focus_node_id` | `obs:<integer>` | Required for `neighborhood`. |
| `depth` | `1 | 2` | Neighborhood only; defaults to `1`. |
| `page_size` | integer | `1..250`; defaults to a server-bounded value. |
| `cursor` | opaque string | Continuation for the exact normalized level/scope/generation. |

Invalid level-specific combinations return `400` with a typed bounded error. A focus outside normalized scope returns a not-found/invalid-focus outcome and cannot broaden scope implicitly. Facet tokens are resolved inside the same Store generation used for the read; an unknown, wrong-kind, ambiguous, or stale token returns the bounded invalid-facet outcome and never falls back to raw-string matching.

## Response

```ts
type AtlasLevel = 'universe' | 'community' | 'neighborhood';
type AtlasCoverageState =
  | 'fresh'
  | 'stale'
  | 'missing'
  | 'rebuilding'
  | 'failed'
  | 'degraded';

interface SemanticAtlasPageResponse {
  level: AtlasLevel;
  generation: string;
  nodes: SemanticAtlasNode[];
  edges: SemanticAtlasEdge[];
  counts: {
    memory_count: number;
    project_count: number;
    community_count: number;
    assigned_memory_count: number;
    unclustered_memory_count: number;
    supporting_entity_count: number;
    relationship_count: number;
    raw_entity_count: number;
    raw_relationship_count: number;
  };
  coverage: {
    state: AtlasCoverageState;
    projection_source: 'deterministic-kg' | 'deterministic-unclustered';
    summary_state: AtlasCoverageState;
    observations_with_kg: number;
    observations_without_kg: number;
    degraded_reasons: string[];
  };
  facets: {
    projects: AtlasFacetOption[];
    sessions: AtlasFacetOption[];
    topics: AtlasFacetOption[];
    types: ObservationType[];
    relations: string[];
  };
  navigation: {
    community_id: string | null;
    focus_node_id: string | null;
    depth: 1 | 2 | null;
    omitted_nodes: number;
    omitted_edges: number;
    raw_rich_render_safe: boolean;
    raw_rich_render_limit: number;
    scope: {
      project: AtlasFacetRef | null;
      session: AtlasFacetRef | null;
      topic: AtlasFacetRef | null;
      type: ObservationType | null;
      relation: string | null;
    };
  };
  continuation: string | null;
  truncated: boolean;
  health: VizHealthResponse;
}
```

## Facets

```ts
type AtlasFacetKind = 'project' | 'session' | 'topic';

interface AtlasFacetRef {
  kind: AtlasFacetKind;
  token: string;
  label: string;
}

interface AtlasFacetOption extends AtlasFacetRef {
  count: number;
}
```

- `token` is a stable full opaque digest derived from the complete internal canonical kind/value tuple and is the only project/session/topic value accepted by this endpoint or stored in dashboard URLs/history.
- `label` is sanitized before serialization. If two unequal canonical values produce the same safe label, both options remain present and receive a bounded non-secret disambiguator derived from their token.
- The server resolves a token to exactly one internal canonical value within the current generation. Raw canonical facet values never cross the semantic HTTP boundary.

## Token-safe Observatory search and pivot integration

The existing Observatory instrument flow remains the sole atlas search seam; it is extended rather than duplicated:

- `GET /observatory/context` accepts `project_token`, `session_token`, and `topic_token` plus bounded query/type/relation/time fields. Raw project/session/topic query fields are invalid on the dashboard semantic contract. Store resolves tokens exactly, creates the existing opaque `context_token`, and returns `AtlasTokenScope` rather than canonical scope strings.
- `GET /observatory/recall` continues to accept only `context_token`, lanes, and limit. Every hit returns private-safe text, structured facet references, and `community_id`; raw project/session/topic fields are removed from the public dashboard response.
- `POST /observatory/pivot` continues to accept `pivot_token` and target. Its response returns the tokenized scope, `focus_node_id`, current `community_id`, and target. A changed/deleted observation or stale community produces a bounded typed stale/gone outcome so the dashboard refreshes context instead of guessing.
- `/observatory/map/frontier`, Timeline, and other context-token consumers keep using the opaque context token. Health requests from the semantic workspace use `context_token` or `/viz/atlas` health rather than a raw project query.

```ts
interface AtlasTokenScope {
  project: AtlasFacetRef | null;
  session: AtlasFacetRef | null;
  topic: AtlasFacetRef | null;
  type: ObservationType | null;
  relation: string | null;
  query: string | null;
  time_from: string | null;
  time_to: string | null;
}

interface TokenSafeObservatoryRecallHit {
  observation_id: number;
  title: string;
  preview: string;
  type: ObservationType;
  project: AtlasFacetRef | null;
  session: AtlasFacetRef | null;
  topic: AtlasFacetRef | null;
  community_id: string;
  created_at: string;
  lane: ObservatoryLane;
  pivot_token: string;
}

interface AtlasPivotLocation {
  context_token: string;
  scope: AtlasTokenScope;
  focus_node_id: `obs:${number}`;
  community_id: string;
  target: 'map' | 'timeline' | 'ledger' | 'recall';
}
```

The Store tool/CLI-facing internal `ObservatoryScope` may retain canonical strings; only the HTTP/dashboard contract changes. Context, recall, and pivot errors are bounded and cannot echo token internals or source values.

## Nodes

```ts
type SemanticAtlasNodeKind =
  | 'community'
  | 'observation'
  | 'fact'
  | 'session'
  | 'project'
  | 'topic';

interface SemanticAtlasNode {
  id: string;
  kind: SemanticAtlasNodeKind;
  label: string;
  snippet: string;
  project: AtlasFacetRef | null;
  session: AtlasFacetRef | null;
  topic: AtlasFacetRef | null;
  type: ObservationType | null;
  community_id: string | null;
  member_count: number | null;
  project_count: number | null;
  unclustered: boolean;
  seed_x: number;
  seed_y: number;
}
```

- Universe returns only `community` nodes.
- Community returns only `observation` nodes.
- Neighborhood returns observations plus bounded supporting nodes.
- Labels/snippets are private-safe before reaching HTTP serialization.
- Neighborhood automatic page accumulation stops at 300 total nodes. A continuation beyond that cap is an explicit expansion affordance and cannot be auto-drained by the semantic loader.

## Edges

```ts
interface SemanticAtlasEdge {
  id: string;
  source_id: string;
  target_id: string;
  kind: 'aggregate' | 'semantic' | 'fact' | 'metadata';
  relation: string;
  label: string;
  summary: string;
  weight: number;
  evidence_count: number;
}
```

- Universe emits at most one `aggregate` edge for each community pair.
- Community emits eligible `semantic` observation relationships only.
- Neighborhood may emit every returned local relationship class.
- Every edge endpoint is present in the accumulated level payload.

## Cursor and error contract

```ts
type SemanticAtlasErrorCode =
  | 'VIZ_ATLAS_CURSOR_INVALID'
  | 'VIZ_ATLAS_GENERATION_STALE'
  | 'VIZ_ATLAS_LEVEL_INVALID'
  | 'VIZ_ATLAS_FACET_INVALID'
  | 'VIZ_ATLAS_COMMUNITY_GONE'
  | 'VIZ_ATLAS_FOCUS_INVALID';

interface SemanticAtlasErrorBody {
  error: string;
  code: SemanticAtlasErrorCode;
  retryable: boolean;
  recover_to_level?: AtlasLevel;
}
```

- Malformed or scope/level-mismatched cursors return `400`.
- Unknown, stale, wrong-kind, or otherwise non-resolvable facet tokens return `400 VIZ_ATLAS_FACET_INVALID`; errors echo neither the raw value nor private source text.
- Mutation-invalidated generations return `409 VIZ_ATLAS_GENERATION_STALE` with `retryable: true`.
- A no-longer-current community returns `409 VIZ_ATLAS_COMMUNITY_GONE`, identifies the safe parent recovery level, and never silently binds the old ID to different members.
- Invalid/out-of-scope focus returns `404 VIZ_ATLAS_FOCUS_INVALID`.
- Error text is bounded and private-safe.

## Raw diagnostics

`/viz/graph` keeps its request/response route and generation-safe page behavior, but uses corrected full-value-derived IDs and corrected heterogeneous topology. The normal dashboard must not request it.

Universe includes `raw_entity_count`, `raw_relationship_count`, `raw_rich_render_safe`, and the local safety limit so an explicit diagnostic preview can warn before any Raw page is loaded. Above that threshold, the dashboard preserves query/count/export information and does not mount the rich Raw renderer.

## OpenAPI and dispatch ownership

The implementation must update all route layers together:

- Store types and method in `src/store/types.ts` and `src/store/index.ts`.
- Handler/validation in `src/http-routes.ts`.
- Import and route dispatch in `src/http-server.ts`.
- Schemas, error bodies, and path documentation in `src/http-openapi.ts`.
- Mirrored client types and `api.getSemanticAtlasPage` in `dashboard/src/api/client.ts`.

The same implementation pass updates the existing Observatory Context/Recall/Pivot schemas and dashboard client types to `AtlasTokenScope`, token-safe hits, and `AtlasPivotLocation`; real-dispatch tests exercise those routes together with `/viz/atlas`.

HTTP tests must exercise the real dispatcher, not only the handler function.
