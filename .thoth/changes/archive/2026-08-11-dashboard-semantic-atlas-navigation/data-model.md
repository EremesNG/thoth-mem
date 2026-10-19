# Semantic Atlas Data Model

## Purpose

Define the derived, non-destructive observation projection used by Universe, Community, and Neighborhood. This model does not replace observations, KG entities/triples, embeddings, or committed community summaries and requires no SQLite schema migration.

## Canonical identity

All derived non-observation IDs use a full SHA-256 hex digest over a versioned canonical tuple:

```text
atlas:<kind>:sha256("semantic-atlas-v1\0" + kind + "\0" + canonical-value)
```

- Observation IDs remain `obs:<integer>`.
- Canonical strings are Unicode-normalized as complete internal source values and hashed before any presentation sanitization. Private content is stripped only when producing labels, snippets, diagnostics, URLs, or other user-visible/request-visible text; it never participates in presentation but remains part of the opaque identity tuple.
- Unequal internal canonical tuples remain unequal even when their private-safe presentations are identical. Their opaque IDs must therefore differ without exposing either private value.
- Edge identity hashes its level, ordered endpoint IDs, relationship class, and provenance discriminator.
- Community identity hashes the sorted complete primary observation membership. Row order, pagination, and process restart cannot affect it.
- Hash collisions are detected while assembling a projection. A collision between unequal canonical tuples fails the projection with a bounded diagnostic rather than merging values.

## Projection source records

### AtlasObservation

One current, non-deleted observation matching normalized scope.

| Field | Meaning |
| --- | --- |
| `id` | Stable `obs:<id>` identity. |
| `project`, `session_id`, `topic_key`, `type` | Facets and provenance; never clustering nodes. |
| `label`, `snippet` | Private-safe presentation. |
| `kg_entities` | Eligible current KG entity references reached through structural relations. |
| `coverage` | KG/semantic/topic/community-summary availability flags. |

`project`, `session_id`, and `topic_key` in `AtlasObservation` are internal canonical inputs only. Public level nodes replace them with structured `AtlasFacetRef` values and never serialize their raw canonical strings.

### AtlasFacetRef and AtlasFacetOption

Project, session, and topic selection use an opaque public identity boundary:

```text
facet:<kind>:sha256("semantic-atlas-facet-v1\0" + kind + "\0" + complete-internal-canonical-value)
```

| Field | Meaning |
| --- | --- |
| `kind` | `project`, `session`, or `topic`. |
| `token` | Full stable opaque digest token; the only facet value allowed in HTTP requests, dashboard state, history, or URLs. |
| `label` | Private-safe presentation produced after identity derivation. |
| `count` | Exact current scoped observation count for an option; present on `AtlasFacetOption`, omitted on a compact node `AtlasFacetRef`. |

The Store builds a scope-local token lookup from complete internal canonical values in the same read generation. One token resolves to exactly one unequal canonical tuple or the request fails with a bounded invalid-facet outcome. Two values whose private-safe labels are identical keep distinct tokens; choice presentation appends a short non-secret suffix derived from each token only when needed for disambiguation. Raw canonical values never enter semantic HTTP node payloads, facet option payloads, URLs, history, request metadata, errors, or diagnostics. Observation `type` and relation choices remain bounded canonical enums/allow-listed values and do not use free-form private-bearing strings.

### Token-safe Observatory context and pivot

The public dashboard boundary uses `AtlasTokenScope` (facet refs/tokens plus bounded type, relation, time, and query fields). `Store` resolves it to the existing internal canonical `ObservatoryScope` before recall work and mints an opaque `context_token`; the token may encapsulate internal scope locally, but its contents are never reflected into URLs, response text, logs, or errors.

Recall hits expose `observation_id`, private-safe title/preview, `AtlasFacetRef` values, and the current `community_id`. A `pivot_token` resolves to a token-scope `AtlasPivotLocation` containing `focus_node_id`, owning `community_id`, target surface, and the same public `AtlasTokenScope`. If membership changes between recall and pivot, the pivot returns a typed stale/gone outcome and the client refreshes Context/Recall rather than guessing or emitting raw scope.

### AtlasEvidenceLink

A weighted observation-to-observation relationship produced from shared eligible KG evidence.

| Field | Meaning |
| --- | --- |
| `source_id`, `target_id` | Ordered observation IDs. |
| `weight` | Sum of bounded confidence and inverse-frequency evidence contributions. |
| `evidence_count` | Number of eligible source relationships represented. |
| `relations` | Bounded stable relation summary. |
| `provenance_ids` | Bounded current KG identifiers for explanation; raw text is not required. |

Metadata-only relations (`IN_PROJECT`, `HAS_TYPE`, `HAS_TOPIC_KEY`) and other relations outside the configured structural allow-list do not create projection links. Entities referenced by more than the documented frequency threshold are excluded before pair generation so shared god entities cannot create quadratic cliques.

## Partition model

### AtlasCommunity

| Field | Meaning |
| --- | --- |
| `id` | Full membership-derived stable identity. |
| `label`, `summary` | Deterministic private-safe label; fresh committed summaries may enrich but never own membership. |
| `member_ids` | Complete sorted primary observation membership. |
| `member_count`, `project_count` | Exact aggregate counts. |
| `top_facets` | Bounded project/topic/type/session summaries. |
| `unclustered` | True for deterministic groups whose members lack eligible links. |
| `coverage` | KG, committed-summary, and degraded coverage counts. |
| `membership_fingerprint` | Full hash of sorted `member_ids`. |

Every current scoped observation belongs to exactly one primary `AtlasCommunity`. High-degree observation hubs are excluded from the Louvain decision and reattached by weighted neighbor vote with stable ID tie-breaking. Natural communities are recursively repartitioned until they contain at most 1,000 observations and at most 25% of a sufficiently large scope. Resolution selection, oversized splitting, small-community consolidation, and unclustered grouping are deterministic and keep the final large-scope count between 30 and 150.

When fixed resolution candidates produce fewer than 30 groups for a scope of at least 150 observations, the same deterministic graph-aware recursive split (with stable hash-order fallback for inseparable components) continues until the minimum is reached without creating empty communities or violating the maximum-size policy.

### AtlasCommunityEdge

One aggregate edge per unordered pair of communities.

| Field | Meaning |
| --- | --- |
| `id` | Stable hash of community endpoints and projection generation. |
| `source_id`, `target_id` | Community IDs in stable order. |
| `weight` | Sum of represented `AtlasEvidenceLink.weight`. |
| `evidence_count` | Sum of represented eligible evidence. |
| `top_relations` | Bounded stable relationship labels. |

## Level projections

### Universe

- Nodes: `AtlasCommunity` aggregates only.
- Edges: `AtlasCommunityEdge` only.
- Membership completeness: every current scoped observation is counted exactly once.
- Maximum rich/semantic node count: 150.

### Community

- Nodes: all assigned observation members of one current community.
- Edges: eligible `AtlasEvidenceLink` relationships whose endpoints are both members.
- Project/session/topic/type/relation remain facets, counts, or visual boundaries rather than nodes.
- Maximum member count: 1,000; HTTP pages remain bounded.

### Neighborhood

- Nodes: focused observation, relevant one- or two-hop observations, and bounded supporting fact/provenance nodes.
- Edges: every relationship returned inside the bounded local result, classified as semantic, fact, or metadata explanation.
- Maximum rendered nodes: 300. Omitted nodes/edges and continuation are explicit.
- Automatic paging accumulates no more than 300 total rendered identities; any remaining continuation is exposed only as explicit user expansion/omission metadata and cannot silently exceed the level cap.

## Response accounting

`AtlasCounts` separates:

- `memory_count`: current scoped observations.
- `project_count`: distinct current projects in scope.
- `community_count`: current primary communities.
- `assigned_memory_count`: observations assigned to normal communities.
- `unclustered_memory_count`: observations assigned to explicit unclustered groups.
- `supporting_entity_count`: supporting nodes returned at the active level.
- `relationship_count`: relationships returned at the active level.
- `raw_entity_count` and `raw_relationship_count`: diagnostic preview only; never labeled as memories.

## Freshness and generation

`AtlasProjectionGeneration` hashes normalized scope plus every current observation/KG row and relevant committed-summary state used by the projection. A cursor binds:

- contract version;
- semantic level;
- normalized scope fingerprint;
- projection generation;
- community/focus/depth identity;
- last stable page key.

Public facet tokens are resolved inside the Store before normalized scope is applied. The resolved internal scope participates in the generation fingerprint, while only the opaque token form is returned to HTTP/dashboard consumers.

Mutation, supersession, scope mismatch, community reassignment, or cursor replay cannot produce a mixed projection. Stale generation rejects the continuation and the client discards its accumulator before a bounded restart.

## Cache

The Store may retain a small bounded in-memory LRU of complete derived projections keyed by scope fingerprint and generation. A cache entry may retain the local token-to-canonical lookup required for exact resolution, but public page materialization always emits only opaque tokens and private-safe presentation. Entries are invalidated by generation mismatch and released with the Store. The cache is not persistence and does not change source-of-truth semantics.

## State transitions

```text
Universe
  -> Community(community_id)
  -> Neighborhood(community_id, focus=obs:<id>, depth=1|2)

Neighborhood -> Community -> Universe
```

Search may resolve directly to `Neighborhood`; the server returns the current owning community. Invalid or reassigned identities recover to the nearest valid parent level while preserving normalized scope.
