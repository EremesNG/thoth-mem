# Delta Specs — graph-lite-consolidation (sub-change B1)

Authored delta domains in this directory:

- `knowledge-graph/spec.md` — `kg_triples` (+ `kg_entities`) is the single source
  of graph-derived facts; `observation_facts` is retired; synchronous
  deterministic write-on-save (CL-1); graceful degrade pre-backfill (CL-2);
  deterministic legacy entity backfill (CL-3).
- `store/spec.md` — KG-backed `getObservationFactsFromKg` adapter; all former
  `observation_facts` readers migrated; synchronous writer removed; rebuild
  repointed; `observation_facts` table + 3 indexes removed via ordered,
  reversible migration; portable export/import format preserved.
- `tools/spec.md` — `mem_project action=graph` and ledger/timeline views are
  `kg_triples`-backed with preserved contract/output (P3); compact six-tool
  surface unchanged (P1).
- `evals/spec.md` — `factsSourceChecks` asserts on `kg_triples`; graph-fact
  fixtures seed the KG.
- `indexing/spec.md` — synchronous deterministic KG write-on-save (CL-1);
  `extract_kg` retained for LLM enrichment; `rebuild-graph` repointed to the
  consolidated path and used for operator-triggered backfill (CL-2).

## Specs intentionally NOT modified

### HTTP / `/graph` endpoint surface — PRESERVED, not modified here

The HTTP graph endpoint `GET /projects/{project}/graph`
(route `src/http-server.ts:123`, handler `handleProjectGraph`
`src/http-routes.ts:1037`, fact-fetch `getProjectGraphFacts`
`src/http-routes.ts:307-311`) is **behavior-preserved**: this change only
repoints its underlying `getObservationFacts` call to the KG-backed adapter
(store delta B-1/B-8). Its response shape and semantics are unchanged, so the
HTTP-surface spec is **NOT modified** by this change.

- **Naming note / inconsistency vs. proposal:** the proposal refers to an
  "http-api spec" that is NOT modified. There is **no `openspec/specs/http-api/`
  domain** in this repo; the HTTP/dashboard graph surface is owned by the
  **`visualization-api`** spec domain (`openspec/specs/visualization-api/spec.md`).
  That domain is the one left unmodified here. The endpoint's eventual
  deprecate-then-remove (and the dashboard client migration,
  `dashboard/src/api/client.ts:686`) is owned by
  `production-hardening-dashboard-v2` per `output-caps-and-pruning` item D-2 — we
  coordinate, we do not remove.

### `config` spec — flag deferred to design

A reversible cutover flag (working name `graphFactsSource`) is described in the
store delta's removal/rollback requirement, but no `config` delta is authored
here: the flag's exact shape is a design decision and the store requirement only
mandates that a reversible flag-guarded cutover exist. If design fixes the flag
shape, a `config` delta may be added at that point.
