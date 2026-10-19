# Data Model: Bounded Semantic Zoom Navigation

## Store projection entities

### `AtlasSemanticRegion`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | `region:` plus collision-resistant hash of algorithm version + complete sorted member IDs |
| `community_id` | `string` | Stable parent Community ID |
| `label` | `string` | Private-safe distinguishing label; deterministic fallback when needed |
| `summary` | `string` | Bounded private-safe explanation |
| `member_ids` | `string[]` | Internal complete region membership; never returned wholesale by overview |
| `member_count` | `number` | Exact source membership |
| `representatives` | structured bounded entries | Ranked observation ID plus private-safe reason, up to three contributing signal enums, and one-based region-local rank |
| `project_count` | `number` | Exact distinct project count |
| `time_from` | `string \| null` | Earliest member timestamp |
| `time_to` | `string \| null` | Latest member timestamp |
| `concepts` | `Array<{ label; count }>` | Bounded private-safe distinguishing evidence |
| `facets` | structured bounded summaries | Project/session/topic/type distribution using opaque refs or canonical bounded types |
| `seed_x`, `seed_y` | `number` | Stable region anchor derived from topology and ID |
| `unclustered` | `boolean` | Region lacks eligible structural evidence |

### `AtlasRegionBridge`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable aggregate edge ID |
| `source_region_id` | `string` | Source region |
| `target_region_id` | `string` | Target region |
| `tier` | `'region-aggregate'` | Exact render tier; aggregate bridges never enter Cosmos node-endpoint buffers |
| `relationship_class` | `'aggregate'` | Exact accessible and visual relationship class |
| `direction` | `'directed' \| 'undirected' \| 'mixed' \| 'unknown'` | Aggregate direction of represented evidence |
| `weight` | `number` | Summed bounded structural strength |
| `evidence_count` | `number` | Exact aggregated internal evidence count |
| `relations` | `string[]` | Bounded relation classes |
| `confidence` | `'high' \| 'medium' \| 'low' \| 'unknown'` | Deterministic band from source evidence |
| `representative_edge_ids` | `string[]` | Bounded strongest observation bridges for exploration |
| `provenance` | bounded structured entries | At most five private-safe source-kind/relation/confidence/evidence summaries |

### `AtlasCommunityWorkingSet`

| Field | Type | Meaning |
| --- | --- | --- |
| `community_id` | `string` | Selected parent Community |
| `region_id` | `string \| null` | Optional focused region |
| `source_memory_count` | `number` | Complete Community membership |
| `source_relationship_count` | `number` | Complete internal semantic edge count |
| `visible_memory_count` | `number` | Returned representative memories |
| `visible_relationship_count` | `number` | Returned aggregate/backbone/representative edges |
| `represented_source_relationship_count` | `number` | Exact union cardinality of source relationships covered by prepared identities |
| `omitted_memory_count` | `number` | Source minus returned memories |
| `omitted_relationship_count` | `number` | Source minus returned individual relationships |
| `regions` | `AtlasSemanticRegion[]` | All bounded region summaries for the parent Community |
| `region_bridges` | `AtlasRegionBridge[]` | Bounded aggregate region graph |
| `nodes` | `SemanticAtlasNode[]` | Representative observation working set |
| `edges` | `SemanticAtlasEdge[]` | Observation/node-endpoint relationships; together with region bridges capped at 450 |

## Deterministic partition

1. Restrict the parent observation-to-observation projection to the selected Community.
2. Reapply the configured relation allow-list and superhub exclusion.
3. Run deterministic Louvain with ordered insertion, `randomWalk: false`, and a resolution selected from parent size.
4. If fewer than six groups exist and parent size permits, deterministically raise resolution or split the largest connected group by weighted topology—not by arbitrary hash chunks.
5. Recursively split any region above 35% of parent membership or 250 members while the parent has at least 24 observations.
6. Merge the smallest weak regions by maximum weighted affinity until no more than 12 remain.
7. Attach hubs and isolates by weighted neighbor votes; remaining isolates are distributed into explicit deterministic unclustered regions.
8. Hash the complete sorted member set plus `semantic-region-v1` for identity.

Small Communities can produce fewer than six regions when topology or membership cannot support six useful groups.

## Representative ranking

For each observation, calculate deterministic normalized components:

- 35% internal structural degree/evidence strength.
- 25% cross-region bridge contribution.
- 15% recency within the Community.
- 15% evidence confidence/provenance quality.
- 10% diversity gain for underrepresented project/session/type/topic facets.

Selection is round-robin proportional across regions, guarantees at least one representative per nonempty region, reserves bridge representatives, and uses stable observation ID as the final tie-breaker. The exact weights are algorithm-versioned; changing them changes generation/region IDs only when membership changes, while representative working-set identity is generation-bound.

Every returned representative is assigned to exactly one region. Its public
explanation is `{node_id, reason, signals, rank}`: `reason` is a deterministic
private-safe sentence no longer than 120 Unicode scalar values and never copies
source content, canonical facets, identifiers, hashes, or scores; `signals`
contains at most three ordered values from `structural`, `bridge`, `recency`,
`confidence`, and `diversity`; `rank` is one-based and unique within the region.
The Store and dashboard keep this explanation separate from the observation
snippet.

## Visual relationship tiers

- `region-aggregate`: at most one overlay relationship per region pair; endpoints are region IDs and it never creates fake memory nodes.
- `representative-backbone`: deterministic maximum-spanning forest per region plus strongest observation-endpoint cross-region bridges.
- `representative-semantic`: remaining high-relevance observation-endpoint edges admitted under the inclusive budget.
- `fact`/supporting relations: Neighborhood only.

Every prepared relationship exposes tier, class, direction, confidence band,
evidence count, and at most five bounded private-safe provenance entries. The
single Community visual-identity rule is `edges.length + region_bridges.length
<= 450`. Exact omitted source relationships use the union of internal source
relationship IDs represented by those identities, never visual-identity
subtraction.

## State transitions

- Universe activation: `level=community`, `community=<id>`, `region` absent.
- Region focus: remains `level=community`, sets `region=<opaque id>`, replaces working set atomically.
- Clear region: removes `region`, restores overview working set and camera anchor.
- Memory activation: `level=neighborhood`, preserves parent `community`, drops `region` from the authoritative URL, sets `focus`.
- Back/Forward: restore the entire tuple `{level, community, region, focus, scope, surface}`.

## Cache and generation

- Parent semantic projection cache remains scope-keyed and revision-bound.
- Region partition/working-set cache keys include scope projection key, generation, Community ID, optional region ID, partition algorithm version, and representative algorithm version.
- Unchanged inputs under the same partition algorithm version retain region IDs. An intentional partition-algorithm version change changes region IDs even when membership happens to remain identical; a ranking-only version change changes the generation-bound working set but not the region ID.
- No SQLite migration or persistent derived table is required.
- Store transaction validates scope, Community/region ownership, generation, and assembles one response atomically.
