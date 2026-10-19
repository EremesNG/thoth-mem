# Proposal: Include Superseded HTTP History
## Intent
Expose the existing superseded-fact history escape hatch to HTTP and observatory callers that currently receive only current graph facts.

The Store already supports `include_superseded?: boolean` through `ObservationFactsInput`, and `Store.getObservationFactsFromKg` already honors it while tagging historical facts with `superseded`. However, the HTTP project graph route and observatory ledger detail route do not pass that option, so callers cannot inspect retained supersession history through those HTTP surfaces.

This W1 follow-up keeps the compact MCP surface unchanged while making the existing history behavior reachable from the relevant HTTP APIs.
## Scope
### In Scope
- Add an opt-in `include_superseded=true` query parameter to `/projects/{project}/graph`, preserving current-only behavior by default.
- Add an opt-in `include_superseded=true` path through the existing observatory ledger detail/history route structure, currently `/observatory/ledger/{id}`, preserving current-only behavior by default.
- Pass the parsed flag from HTTP handlers into the existing Store calls:
  - `getProjectGraphFacts` / `handleProjectGraph` should call `store.getObservationFacts({ project, topic_key, include_superseded })`.
  - `handleObservatoryLedger` / `Store.getObservatoryLedgerDetail` should propagate the flag to `getObservationFacts({ observation_id, include_superseded })`.
- Update OpenAPI documentation for the new query parameter and for response payloads that may include `superseded` on returned fact objects.
- Add focused HTTP/OpenAPI tests that prove default current-only behavior remains unchanged and `include_superseded=true` exposes historical facts.
### Deferred / Needs Discovery
- Confirm whether dashboard client controls should surface this flag immediately or whether the first implementation should be API-only. The accepted scope requires HTTP/observatory access, but not a dashboard UI control.
- Confirm the exact response-schema reuse point in `src/http-openapi.ts` so `superseded` is documented consistently for project graph facts and observatory ledger fact arrays without duplicating schema definitions unnecessarily.
### Out of Scope
- MCP tool registry changes; the compact six-tool surface remains unchanged.
- Store schema migrations or KG schema changes.
- Changes to supersession, pruning, rebuild, or retention semantics.
- Multi-harness hooks or MemoryIntegrationCore migration work.
- Portable export/import format changes.
- Changing default behavior to include superseded facts.
## Approach
- From: HTTP graph and observatory ledger callers force the Store default by omitting `include_superseded`, so they return current facts only.
- To: Those callers parse an explicit `include_superseded=true` query parameter and pass it into the existing Store fact-read path.
- Reason: Store and MCP/project-view history behavior already exists; HTTP callers need parity without new storage or registry surface.
- Impact: Default responses remain current-only. Opt-in responses may include historical fact rows tagged with `superseded: true`, enabling observatory/history inspection through HTTP.

Implementation should be intentionally thin:
- Parse the flag using existing HTTP query parsing patterns, accepting only explicit `true` as enabled.
- Keep current filter parameters (`topic_key`, `relation`, `limit`, `max_chars`) compatible with the new flag.
- Preserve current-only behavior for omitted, empty, or non-`true` values.
- Extend the observatory ledger store input type only as needed to carry the optional flag.
- Update OpenAPI parameters and fact response schemas to document the opt-in and the conditional `superseded` marker.
## Affected Areas
- `src/http-routes.ts`: project graph handler/fact helper and observatory ledger handler.
- `src/store/index.ts`: `getObservatoryLedgerDetail` input handling and `getObservationFacts` call.
- `src/store/types.ts`: observatory ledger detail input type if it is exported or formalized there.
- `src/http-openapi.ts`: `/projects/{project}/graph`, `/observatory/ledger/{id}`, and reusable fact schemas.
- `tests/http-server.test.ts`: project graph and OpenAPI coverage.
- `tests/http-viz.test.ts`: observatory ledger route coverage.
## Risks
- A loose boolean parser could accidentally expose superseded history by default; tests must cover omitted and false-like values.
- Response schema drift could leave `superseded` undocumented for one HTTP surface even though Store returns it.
- The observatory ledger route may have client assumptions around fact shape; `superseded` should remain optional and only appear for historical facts.
- Existing current-only tests may need fixture data that actually creates superseded facts, not only current KG triples.
## Rollback Plan
Remove the HTTP query parsing and stop passing `include_superseded` into the Store calls. Because the change uses an existing Store option and does not alter schema, migrations, registry entries, or persisted data, rollback is code-only and restores current-only HTTP behavior.
## Success Criteria
- `/projects/{project}/graph` omits superseded facts by default and includes tagged historical facts only when `include_superseded=true`.
- `/observatory/ledger/{id}` omits superseded facts by default and includes tagged historical facts only when `include_superseded=true`.
- OpenAPI documents `include_superseded` for both relevant HTTP surfaces and documents optional `superseded` on fact payloads.
- Existing Store behavior is reused; no schema migration, MCP registry change, or new graph persistence path is introduced.
- Focused HTTP/OpenAPI tests cover default current-only behavior, opt-in history behavior, and documented parameters/schemas.
