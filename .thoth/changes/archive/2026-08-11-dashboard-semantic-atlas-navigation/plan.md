# Implementation Plan: Semantic Neural Atlas Navigation

## Technical context

The current Store route `Store.getVisualizationGraphPage` in `src/store/index.ts` reads the complete heterogeneous visualization source, binds deterministic keyset pages to a scope/generation fingerprint, and assembles observation/session/project/topic/ref nodes plus fact and metadata edges. The dashboard drains those pages through `full-atlas-loader.ts` and treats the merged raw identities as the canonical atlas. This preserves completeness and mutation safety but makes metadata entities force-bearing peers, mislabels all nodes as memories, and exposes truncated Base64-prefix identities.

Committed `kg_communities` artifacts already provide project-scoped freshness, bounded summaries, entity/triple counts, and source-observation evidence. They are connected-component summaries of the KG entity graph and their `source_observation_ids` are presentation-bounded, so they cannot be the authoritative complete observation membership for Universe. The new design uses them only as fresh optional label/summary enrichment. A new deterministic observation projection owns complete membership for the active scope and works when those artifacts, KG coverage, or embeddings are missing.

The change adds one bounded semantic visualization route and keeps `/viz/graph` as explicit Raw diagnostics. Existing Observatory Context/Recall/Pivot routes become token-safe adapters for atlas search: HTTP/dashboard scope uses opaque facet tokens, Store internals resolve canonical values, recall hits expose the owning atlas community, and pivots return tokenized locations. It introduces no destructive data migration, no MCP/CLI change, no remote dependency, and no default raw-all-entity load. Existing privacy, URL/history, semantic fallback, Cosmos lifecycle, guided filters, generation restart, and browser-harness cleanup remain mandatory.

The deterministic partition implementation will add local MIT dependencies `graphology@^0.26.0` and `graphology-communities-louvain@^2.0.2`. Graphology exposes ESM and TypeScript declarations, and its Louvain implementation supports weighted graphs, a resolution option, and `randomWalk: false`; stable sorted insertion plus disabled random walking gives a reproducible primary partition. A repository-owned deterministic split/merge/unclustered fallback remains responsible for the 30–150, 1,000-member, and 25%-of-scope invariants rather than trusting library output blindly.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change is confined to Store-derived visualization, HTTP/OpenAPI, and dashboard surfaces; it adds no MCP tool or registration.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Semantic membership is derived locally from current observations and KG evidence, does not require embeddings/LLMs/remote services, and retains explicit unclustered/degraded output.
- **P3 — Harness-Agnostic Memory Contract**: PASS — No harness payload, lifecycle adapter, observation schema, sync format, or persistence write contract changes; the projection is host-neutral and read-only.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall contracts are untouched; the new HTTP route is independently bounded by semantic level and keyset pages.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — `/viz/atlas` is additive, existing routes remain registered, observation IDs remain unchanged, and `/viz/graph` retains its route/page shape while correcting opaque derived identity/topology defects.

## Design

### 1. Separate identity and Raw topology assembly

Create `src/store/visualization-identity.ts` for versioned full SHA-256 identities and collision detection. Observation IDs remain `obs:<id>`; every derived entity and edge hashes its complete canonical kind/value tuple. The same internal identity boundary derives full opaque project/session/topic facet tokens before presentation sanitization, so unequal private-bearing values remain exactly selectable without appearing in public text. Extract raw node/edge assembly from the monolithic Store path into `src/store/visualization-projection.ts`, remove the orphan topic helper, collapse duplicate project/topic representations, and preserve one edge per canonical relationship with both endpoints.

`Store.getVisualizationGraphPage`, slice, expand, and inspect paths continue to use the corrected raw projection. Generation fingerprints remain based on source rows and normalized scope; derived IDs are outputs, not cursor inputs. Tests use similar-prefix/Unicode values, shuffled rows, multi-page replay, and injected collision handling.

### 2. Build a deterministic sparse observation projection

Create `src/store/semantic-atlas.ts` as a pure projection/partition module. `Store.getSemanticAtlasPage` supplies one transactionally consistent set of:

- current observations matching normalized scope;
- current eligible KG triples/entities and confidence/provenance identifiers;
- community health and fresh committed summaries when available.

The projection adds every observation node before relationship construction. It reuses `DEFAULT_KG_RELATION_ALLOW_LIST` so metadata and synthetic content-section relations cannot become clustering edges. For each eligible KG entity, it collects distinct source observations, ignores an entity when its document frequency exceeds `max(64, ceil(scopeSize * 0.01))`, and contributes bounded confidence-weighted inverse-frequency evidence to each stable observation pair. Pair aggregation is sparse and deduplicated.

Before Louvain, observation nodes above the stable p99 weighted-degree threshold (for scopes of at least 100 nodes and at least 32 neighbors) are temporarily excluded. The graph is inserted in sorted node/edge order and partitioned with `randomWalk: false`. Excluded observation hubs are reattached by highest summed neighbor weight, then stable community/member ID. Isolates enter explicit deterministic unclustered groups.

The exported `SEMANTIC_ATLAS_POLICY` fixes the initial contract:

- Universe target: 30–150 groups for scopes of at least 150 observations;
- maximum Community: `min(1_000, ceil(scopeSize * 0.25))` for sufficiently large scopes;
- maximum Neighborhood: 300 returned nodes;
- maximum shared-entity document frequency: `max(64, ceil(scopeSize * 0.01))`;
- Raw rich-render safety threshold: 5,000 entities.

Resolution candidates are tried in a fixed order and scored deterministically for target count, oversize violations, and modularity. Oversized communities are recursively repartitioned at increasing fixed resolutions. If output remains below 30 for a scope of at least 150 observations, the same deterministic graph-aware recursive split continues until the minimum is reached. If the algorithm cannot split an invalid or under-count component, a stable graph-aware breadth partition followed by hash-order tie-breaking guarantees the count/size bounds without empty groups. If output exceeds 150, the smallest communities merge by strongest aggregate edge and stable ID; disconnected singleton groups merge only into explicit unclustered buckets. Community IDs hash the full sorted primary observation membership.

Fresh committed community summaries may enrich a matching atlas community label/summary by deterministic source-observation overlap. They never change membership or hide observations. Stale/missing/failed/rebuilding state is returned as coverage while deterministic labels from top private-safe evidence remain available.

### 3. Add a level-aware Store and HTTP contract

Add the types in `contracts/semantic-atlas-api.md` to `src/store/types.ts` and implement `Store.getSemanticAtlasPage` in `src/store/index.ts`. One read transaction builds a generation-bound project/session/topic token lookup, resolves each supplied opaque token to exactly one internal canonical value, validates normalized scope, builds or reuses a bounded Store-owned LRU projection, hashes the resolved source/community generation, resolves the requested level, and keyset-pages stable level identities. The response returns structured facet options/references (`token`, private-safe `label`, bounded `count`) and never serializes raw canonical facet values.

- Universe returns only community aggregates and one weighted edge per community pair.
- Community validates `community_id` and returns all assigned observations plus eligible internal relationships in bounded pages.
- Neighborhood validates `obs:<id>`, resolves its current primary community, performs weighted one/two-hop traversal, ranks evidence deterministically, and returns at most 300 observations/support nodes with omitted/continuation metadata.

Cursor validation binds contract version, level, opaque-token scope, resolved normalized scope fingerprint, generation, community, focus, depth, and last stable key. Neighborhood automatic accumulation stops at 300 total identities and exposes any remaining continuation only for explicit expansion. Reuse the existing stale-generation semantics with atlas-specific error codes. An invalid/stale/wrong-kind facet token produces one bounded error without raw-value fallback; a disappeared/reassigned community never aliases to new membership and returns a recoverable typed outcome.

Register `GET /viz/atlas` through all public layers: validation/handler in `src/http-routes.ts`, import and dispatch in `src/http-server.ts`, path/schemas/errors in `src/http-openapi.ts`, and mirrored types plus `api.getSemanticAtlasPage` in `dashboard/src/api/client.ts`. In the same public-contract pass, extend existing Observatory Context/Recall/Pivot HTTP/client types: Context accepts opaque facet tokens and returns token scope/context token; Recall returns tokenized facet refs plus current owning `community_id`; Pivot returns a tokenized location and owning community or a typed stale/gone outcome. Tool/CLI Store callers may keep internal canonical `ObservatoryScope`; raw values never cross the dashboard HTTP boundary. Real-dispatch HTTP tests own both atlas registration and token-safe search/pivot proof.

### 4. Make semantic level the dashboard source of truth

Add `AtlasLevel`, `communityId`, structured facet-token scope, and typed `AtlasTrailEntry` state to `dashboard/src/components/observatory/context-store.ts`. URL parameters use `level=community|neighborhood` only when not Universe, plus stable `community`, existing `focus`, and opaque project/session/topic tokens; raw canonical facet values never enter URLs or history. Parsing rejects impossible combinations and recovers to the nearest valid parent.

Replace the root raw drain in `ObservatoryWorkspace.tsx` with a new `semantic-atlas-loader.ts` built from the proven abort/generation/frame-coalescing patterns in `full-atlas-loader.ts`. Level changes own independent generations and abort prior pages/workers. Universe activation commits Community; observation activation commits Neighborhood. Search creates token-scoped Observatory Context, Recall returns the current owning community, and Pivot commits the returned tokenized Community/Neighborhood location; stale/gone pivot outcomes refresh context within the bounded generation budget. Back/Forward stores full level/community/focus/token-scope locations rather than focus IDs alone. Raw retains the existing full loader and can only start after explicit diagnostics confirmation.

`MemoryMapSurface.tsx` gains compact Universe / Community / Neighborhood breadcrumbs, exact `memory_count · project_count · community_count` language, level-appropriate empty/degraded notices, and explicit diagnostic disclosure. Project/session/topic GuidedSelect controls consume structured opaque-token options; identical safe labels receive a bounded token-derived disambiguator while retaining exact selection. Type/relation remain bounded canonical choices. Metadata entities are absent from normal Universe/Community canvas data.

### 5. Adapt Cosmos and semantic fallback to server-owned LOD

Extend the dashboard graph adapter with semantic node/edge kinds without conflating them with raw `VizNode` accounting. `map-state.ts` merges semantic pages by stable identity and rejects dangling endpoints. `cosmos-graph-worker.ts` prepares only the current bounded level. `cosmos-graph-data.ts` consumes server-provided community IDs/aggregate weights instead of detecting communities over the heterogeneous client graph.

Level presentation policy:

- Universe: 5–12 px galaxy cores using logarithmic member count, community color, aggregate edge width/opacity from log weight.
- Community: existing 3–8 px observation stars, relevant semantic edges, optional non-force-bearing facet labels/boundaries.
- Neighborhood: focused observation halo plus bounded local observation/supporting nodes and all returned local edge classes.

`MapCanvas.tsx`, `cosmos-graph-runtime.ts`, and `GraphNavigator.tsx` keep one renderer, continuous bounded motion, pause/reduced/hidden/failure behavior, worker cancellation, focus parity, and DOM-backed activation. A level transition may fit once before user camera interaction; ordinary page arrival preserves camera/focus.

### 6. Keep Raw graph diagnostic and safe

Universe response includes raw entity/relationship counts and a local rich-render safety decision. A bounded technical disclosure explains that Raw shows graph entities, not memories. Below 5,000 entities, one confirmed action may load corrected `/viz/graph`; above it, the UI shows counts/query/export guidance and refuses to mount the rich raw renderer. Normal route entry, filters, search, semantic drilldown, and browser restoration never request Raw pages.

Raw mode remains private-safe, keyboard reachable, clearly labeled, and cancellable. Leaving Raw aborts its loader and restores the last semantic location without changing scope.

### 7. Verification strategy

TDD proceeds from pure identity/projection fixtures to Store paging, real HTTP dispatch, typed client/state, loaders, renderer adapter, and production Chrome. The dense Store fixture uses at least 6,000 observations with long-prefix values, metadata hubs, eligible shared KG entities, one oversized cluster, isolated/legacy observations, stale community summaries, and source mutations.

Mounted verification exercises exact Universe/Community/Neighborhood identities, search and history, Raw non-request/confirmation, counts, performance, privacy, two distinct private-bearing facets with identical safe labels and exact opaque-token selection, fallback/retry, responsive/200% states, and owned cleanup. Existing full-atlas motion, dropdown, instrument, and Control Room regressions remain in the full dashboard suite.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Full SHA-256 canonical tuple IDs and facet tokens with collision detection before presentation sanitization. | `src/store/visualization-identity.ts`; `src/store/semantic-atlas.ts` | Similar-prefix, Unicode, private-safe-equivalent facet, order, page, restart, and injected-collision tests. |
| FR-002 | Extract and correct Raw heterogeneous assembly; no orphan topic or duplicate semantic relationship. | `src/store/visualization-projection.ts`; `src/store/index.ts` | Raw topology fixture asserts unique nodes/edges and endpoint closure. |
| FR-003 | Return and render role-separated accounting. | `src/store/types.ts`; `dashboard/src/components/observatory/MemoryMapSurface.tsx` | Store/HTTP/browser counts remain exact when helper cardinality changes. |
| FR-004 | Insert every current observation before KG links; deterministic unclustered groups and coverage. | `src/store/semantic-atlas.ts`; `src/store/index.ts` | Missing KG/embedding/topic/community fixtures retain every observation once. |
| FR-005 | Sparse observation projection from eligible KG structural evidence only. | `src/store/semantic-atlas.ts`; `src/config.ts` allow-list import | Metadata-only graph produces no clustering edges; structural evidence does. |
| FR-006 | Shared-entity frequency guard plus p99 observation hub exclusion/reattachment. | `src/store/semantic-atlas.ts` | Hub injection leaves non-hub membership unchanged and reattaches deterministically. |
| FR-007 | Fixed policy, deterministic resolution scoring, recursive split and bounded merge. | `src/store/semantic-atlas.ts`; `package.json`; `pnpm-lock.yaml` | 6,000-node fixture yields 30–150 stable groups, each within 1,000/25%. |
| FR-008 | Default coordinator requests semantic Universe, not Raw full graph. | `dashboard/src/components/observatory/ObservatoryWorkspace.tsx`; `semantic-atlas-loader.ts` | Mounted root has exact membership counts and zero `/viz/graph` requests. |
| FR-009 | Universe aggregate response and weighted pair edges. | `src/store/types.ts`; `src/store/index.ts`; `contracts/semantic-atlas-api.md` | Pair aggregation and count/provenance equality tests. |
| FR-010 | Community validation and complete assigned-observation paging. | `src/store/index.ts`; `src/http-routes.ts`; `dashboard/src/api/client.ts` | Multi-page community returns exact member set or typed gone outcome. |
| FR-011 | Weighted bounded one/two-hop traversal with support details and omission metadata. | `src/store/semantic-atlas.ts`; `src/store/index.ts` | 300-node cap, focus inclusion, relevance ordering, and continuation tests. |
| FR-012 | Server-owned level edge classes drive GPU and semantic rendering. | `dashboard/src/components/map/cosmos-graph-data.ts`; `cosmos-graph-worker.ts`; `GraphNavigator.tsx` | Per-level renderer/fallback identity and link-class parity. |
| FR-013 | Level/community/focus URL state, opaque facet-token scope, token-safe Context/Recall/Pivot ownership, and typed full-location trail. | `src/store/index.ts`; `src/http-routes.ts`; `src/http-openapi.ts`; `dashboard/src/api/client.ts`; `dashboard/src/components/observatory/context-store.ts`; `ObservatoryWorkspace.tsx` | Real dispatch plus mounted search pivot proves owning-community resolution, Back/Back/Forward, private-safe scope restoration, stale recovery, and invalid deep-link handling. |
| FR-014 | Keep metadata in structured opaque-token GuidedSelect facets and summaries, not force-bearing nodes. | `src/store/types.ts`; `src/store/index.ts`; `ObservatoryWorkspace.tsx`; `MemoryMapSurface.tsx` | Universe/Community contain no metadata peer stars; safe-label-equivalent facets remain distinct/selectable without raw values crossing HTTP/URL. |
| FR-015 | Confirmed Raw disclosure guarded by Universe diagnostic counts. | `MemoryMapSurface.tsx`; `ResourceStateNotice.tsx`; `ObservatoryWorkspace.tsx` | Raw requires one action; over-limit fixture never mounts raw Cosmos. |
| FR-016 | Enrich labels from fresh summaries; deterministic projection/fallback owns membership. | `src/store/index.ts`; `src/store/semantic-atlas.ts` | Fresh/stale/missing/rebuilding/failed/degraded matrices remain complete. |
| FR-017 | Atlas-specific generation cursor/error contract and abortable client restarts. | `src/store/types.ts`; `src/http-routes.ts`; `semantic-atlas-loader.ts` | Mutation/scope/level mismatch rejects mixed pages and converges within two restarts. |
| FR-018 | Reuse safe presentation, opaque facet-token scope across atlas and Observatory instruments, semantic navigation, responsive overlays, renderer recovery, and bounded cleanup. | `src/http-routes.ts`; `dashboard/src/components/`; `tests/dashboard/semantic-atlas-browser.test.ts` | Real Chrome matrix covers keyboard, token-safe Context/Recall/Pivot traffic, DOM/URL/request privacy, exact facet selection, local network, reduced motion, WebGL, cleanup. |

## Optional support artifacts

- `research.md`: Not needed; Full exploration plus the prior Graphify/ArcRift comparison resolved repository and reference uncertainty, and the binding decisions are captured here.
- `data-model.md`: Created because complete primary membership, level-specific identities, aggregation, and generation semantics are new cross-surface invariants.
- `contracts/`: Created because the additive HTTP request/response/error contract must stay synchronized across Store, dispatcher, OpenAPI, client, and browser tests.
- `quickstart.md`: Not needed; this is the default dashboard behavior and has no operator setup workflow.

## Risks and migrations

- **Community quality versus determinism**: Louvain output can vary with traversal order. Mitigation: stable sorted insertion, `randomWalk: false`, fixed resolution candidates, membership fingerprint tests, and repository-owned deterministic split/merge fallback. Rollback: switch the pure partition strategy without changing HTTP/state contracts.
- **Quadratic shared-entity expansion**: A common entity could generate O(n²) pairs. Mitigation: exclude metadata, cap entity document frequency before pair generation, aggregate sparse pairs, and retain 6,000-node performance tests.
- **Community churn after legitimate mutations**: Membership-derived IDs may become obsolete. Mitigation: typed `COMMUNITY_GONE`, nearest-parent recovery, no aliasing, generation-bound pages, and URLs that retain normalized scope.
- **Incomplete old databases**: KG/community coverage may be sparse. Mitigation: observations are inserted first, unclustered groups are deterministic, coverage is truthful, and no data migration/rebuild is required.
- **Fresh summaries disagree with atlas membership**: Existing summaries are entity-community artifacts. Mitigation: they enrich labels only through deterministic overlap and never determine/hide membership.
- **Raw graph size**: Explicit diagnostics can still exceed GPU/DOM usability. Mitigation: preview counts, 5,000-entity rich guard, cancellation, and query/export guidance above the limit.
- **Public HTTP stability**: `/viz/atlas` is additive and `/viz/graph` remains. Corrected non-observation IDs remain opaque tokens; observation IDs and request/page/error shape are preserved. No route or taxonomy removal occurs.
- **Dependency and license**: Add only `graphology@^0.26.0` and `graphology-communities-louvain@^2.0.2`, both MIT and local-runtime-only; verify Node 22 ESM/types, lockfile scope, build inventory, and absence of network calls. If integration fails before implementation commits, the pure deterministic fallback can remain while the dependency addition is omitted.
- **Migration**: None. The atlas projection and bounded cache are derived/read-only; no SQLite table, observation, KG fact, embedding, sync record, or community artifact is rewritten. Reverting the dashboard source to `/viz/graph` and removing `/viz/atlas` returns the prior behavior without data rollback.
- **Concurrent working tree**: Existing user/previous-change edits remain authoritative. The single implementation writer must inspect current files before each edit, avoid unrelated active changes such as `immediate-memory-storage-safety`, and review the final diff by owned path.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped implementation changes Store internals, one additive HTTP route, OpenAPI, and dashboard consumers only; the six-tool registry is untouched.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Sorted weighted KG projection, non-random Louvain, deterministic repository fallback, unclustered assignments, and explicit coverage preserve useful local output with no embedding/LLM dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The data model is a read-only host-neutral projection with no persistence/schema/sync/harness mutation and no native payload semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall remains unchanged; Universe is capped at 150, Community at 1,000, Neighborhood at 300, and every HTTP page at 250 with explicit continuation/omission.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The design adds `/viz/atlas` through handler/dispatcher/OpenAPI/client, keeps `/viz/graph` and all existing routes registered, preserves observation IDs and raw page shape, and introduces typed additive errors rather than silently repurposing an existing route.
