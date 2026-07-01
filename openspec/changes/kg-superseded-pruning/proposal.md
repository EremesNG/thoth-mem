# Proposal: Bounded Retention for Superseded KG Triples (C1)

## Intent

Change B3 (`kg-supersedes-edges`, shipped/archived) replaced blind deletion of
knowledge-graph facts with a **supersede-not-delete** discipline: when the
deterministic KG writer removes or replaces a fact, the old `kg_triples` row is
MARKED superseded (`superseded_by_triple_id`, `superseded_at`) and kept forever.
There is currently **no retention mechanism anywhere in the codebase** — no
pruning, TTL, GC, or VACUUM (greenfield). As observations churn, superseded rows
accumulate without bound. Each superseded row is still scanned by retrieval
queries (only deprioritized, not excluded) and still occupies storage, so
unbounded growth directly erodes the project's token-efficiency and
bounded-recall goal (Constitution **P4**).

This change (C1) bounds that growth by pruning **old superseded** triples while
never touching current facts, keeping the N most-recent superseded rows per fact
slot as recoverable history.

**Why now:** B3 shipped with the marking half of the lifecycle but no reclamation
half. The default is supersede-ON (`kgSupersedeEnabled: true`,
`src/config.ts:169`), so accumulation is already happening in every deployment
that took B3. C1 closes the lifecycle before the superseded backlog becomes a
measurable retrieval-cost and storage regression.

## Scope

### In Scope

- **Retention strategy — keep-N-most-recent-per-slot.** For each fact "slot",
  keep only the `N` most-recent SUPERSEDED triples (ordered by `superseded_at`
  DESC, tie-broken by `id` DESC) and prune the older superseded ones. CURRENT
  (non-superseded) triples are NEVER pruned. `N` is a new config knob.
- **Manual trigger — `prune-graph` admin op.** A new admin operation exposed as
  a CLI command and an HTTP `POST /graph/prune` route, sibling of the existing
  `rebuild-graph` op. It MUST support a **dry-run / preview mode** that reports
  the counts it *would* delete (triples, entities, NULLed refs) without
  mutating anything.
- **Automatic trigger — incremental cap enforcement.** In addition to the manual
  op, enforce the keep-N cap automatically during normal supersession so the cap
  is maintained in steady state without an operator running the admin op. The
  automatic path MUST be gated so that flag-off paths are byte-identical to
  pre-C1 (see Preserved Guarantees).
- **New store method — `store.pruneSupersededTriples(...)`.** A deterministic,
  transactional method that computes the prune set, performs the deletes and
  cleanups, and returns before/after counts. Reused by both triggers.
- **Referential-safety cleanup.** Pruning a subset of triples MUST, in the same
  transaction: (a) NULL any dangling `superseded_by_triple_id` on surviving rows
  that point at a pruned row; and (b) delete `kg_entities` left orphaned (no
  remaining referencing triple). The FK cascade is entity→triple, NOT
  triple→entity (`src/store/schema.ts:213-214`), so orphaned entities are not
  auto-collected and must be cleaned explicitly.
- **Before/after counts.** Both triggers report a delta summary (superseded
  pruned, entities removed, dangling refs NULLed, before/after totals),
  mirroring `rebuildObservationFacts`' count pattern.
- **New config knobs** for keep-N and a master enable flag (see Rollback Plan),
  wired through the standard env > persisted > default resolver and the JSON
  schema, mirroring how B3 added its `kgSupersede*` knobs.

### Deferred / Needs Discovery

These are genuine forks with no single defensible default; they are carried into
the **clarify** phase as `[NEEDS CLARIFICATION]` candidates (not silently
decided here):

1. **Master-flag default (data-deleting).** Unlike B3 (which only *marked*), C1
   *deletes* data. Options: **default-ON** (auto-enforce once the feature ships,
   maximizing the P4 benefit, gated behind eval sign-off) vs **default-OFF**
   (conservative — an operator must opt in before any deletion happens).
   Provisional recommendation below (Rollback Plan) leans **default-OFF for the
   automatic trigger's deletion behavior initially**, but this is a real product
   fork to confirm.
2. **Exact slot definition.** Is a "slot" `(subject_entity_id, relation)` —
   collapsing all objects of a relation for a subject into one keep-N window —
   or a finer/coarser key (e.g. `(subject, relation, object)`, or
   per-source-observation)? B3 supersession semantics and the multi-object
   relation shape must be checked so keep-N counts the intended history unit.
3. **Automatic-trigger hook point.** Exactly where incremental enforcement runs
   (inside the supersession write in `persistKgExtraction` /
   `writeDeterministicKgFacts`, vs a post-write step) and how it stays provably
   flag-off byte-identical (no extra queries, no txn shape change when disabled).
4. **`N` default value and per-project vs global** scope of the knob.

### Out of Scope

- **Age/TTL-based pruning** (delete superseded older than X days) — not chosen.
- **Confidence-threshold pruning** (delete superseded below a confidence) — not
  chosen.
- **SQLite `VACUUM` / physical file-shrink** — row deletion only; reclaiming
  file bytes is a separate operational concern.
- **Portable export/import format changes.** `exportData`/`importData`
  (`src/store/index.ts:3626-3663`) do not touch `kg_triples`; format version
  stays `1`; export parity is unaffected
  (`tests/store/export-import.test.ts:81-132` assert kg columns absent).
- **The 6-tool MCP surface** — no MCP tool is added or changed. `prune-graph` is
  an admin op on CLI + HTTP only, honoring the admin-ops-are-not-MCP boundary
  (Constitution **P1**; boundary documented at `src/evals/retrieval.ts:284-286`).
- **Pruning CURRENT (non-superseded) facts** — never pruned under any trigger.

## Approach

Follow the existing `rebuild-graph` admin-op pattern end-to-end and reuse B3's
referential-safety idiom:

1. **`store.pruneSupersededTriples({ project?, dryRun? })`** — deterministic and
   transactional. Selects superseded rows per slot, ranks by
   `superseded_at DESC, id DESC`, marks rank `> N` for pruning. Before delete:
   NULL dangling `superseded_by_triple_id` refs on survivors pointing at the
   prune set (reusing the exact UPDATE idiom at
   `src/store/index.ts:1151-1158`). Delete the prune set. Delete now-orphaned
   `kg_entities`. Compute before/after `COUNT(*)` deltas as
   `rebuildObservationFacts` does (`src/store/index.ts:3469-3497`). In `dryRun`,
   compute all counts but roll back / skip the mutations.
2. **Automatic enforcement** — call the same logic (scoped to affected slots)
   from the supersession path, strictly gated so the disabled path adds no
   queries and preserves the current transaction shape.
3. **CLI `prune-graph`** — mirror `handleRebuildGraph`
   (`src/cli.ts:569-588`, usage `:34`, dispatch `:700`): accept
   `--project`/`--all` and a `--dry-run` flag; print a Markdown summary of the
   delta.
4. **HTTP `POST /graph/prune`** — add an `OPERATION_CATALOG` entry (mirroring the
   `rebuild-graph` http entry at `src/http-routes.ts:61` and the sibling cli
   entry at `:71`) plus a `handlePruneGraph` handler mirroring
   `handleRebuildGraph` (`src/http-routes.ts:573-581`), reading `project` and a
   `dryRun` flag from the body.
5. **Config** — add keep-N + master-enable knobs to `KnowledgeGraphConfig`
   (`src/config.ts:39-51`), `DEFAULT_KNOWLEDGE_GRAPH_CONFIG`
   (`src/config.ts:161-173`), `resolveKnowledgeGraphConfig` env>persisted>default
   (`src/config.ts:455-498`, new `THOTH_KG_*` envs), and the `knowledgeGraph`
   block of `config.schema.json` (`additionalProperties: false`, so schema MUST
   be extended).

## Affected Areas

| Area | Anchor | Change |
| --- | --- | --- |
| KG schema | `src/store/schema.ts:195-215` (`kg_triples`), indexes `:226-227` | No DDL change required for keep-N; may add an index to support the per-slot ranking scan (assess in design). |
| Store — prune | `src/store/index.ts` (new `pruneSupersededTriples`) | New transactional method; reuses NULL-dangling idiom `:1151-1158` and count idiom `:3469-3497`. |
| Store — delete path | `deleteKnowledgeArtifactsForObservation` `:1148-1164`; hard-delete txn `:1594-1599` | Confirm no interaction/double-clean between per-observation delete and prune; both must leave entities consistent. |
| Store — auto trigger | `persistKgExtraction` `src/indexing/jobs.ts:503-610`; `writeDeterministicKgFacts` `:484-501`; B3 flag `kgSupersedeEnabled` | Hook incremental enforcement; gate to byte-identical flag-off. |
| Retrieval (read-only) | `queryKnowledgeLane` `src/store/index.ts` ~2107/~2139; multi-hop CASE ~2279 | No change; pruned rows simply stop appearing. B3 flag-off byte-identical guarantee MUST NOT regress. |
| Config | `src/config.ts:39-51`, `:161-173`, `:455-498`; `config.schema.json` knowledgeGraph `:158-242` | New keep-N + master-enable knobs + `THOTH_KG_*` envs; extend JSON schema. |
| CLI | `src/cli.ts` usage `:34`, `handleRebuildGraph` `:569-588`, dispatch `:700` | New `prune-graph` command with `--dry-run`. |
| HTTP | `src/http-routes.ts` catalog `:54-73` (entries `:61`, `:71`), `handleRebuildGraph` `:573-581` | New `POST /graph/prune` route + `handlePruneGraph` + catalog entries (http + cli). |
| Stats (optional) | `getStats` `src/store/index.ts:1443-1454` | Optionally surface a triple/superseded count; `getStats` currently exposes none. |
| Export/import | `exportData`/`importData` `:3626-3663`; `tests/store/export-import.test.ts:81-132` | Unaffected; called out to confirm parity is preserved. |

## Risks

- **Data deletion (highest).** C1 permanently deletes superseded rows beyond the
  keep-N window; a wrong slot key or off-by-one in the ranking could delete more
  history than intended. Mitigation: dry-run preview, deterministic ranking,
  transactional all-or-nothing, before/after counts, thorough edge-case tests
  (empty slot, exactly N, N+1, ties on `superseded_at`, cross-project scoping).
- **P5 tension (supersede-not-delete).** C1 intentionally *deletes* superseded
  rows, which sits in tension with B3's supersede-not-delete discipline and the
  spirit of **P5**. Framing: this is **bounded retention that preserves the N
  most-recent history**, not a reversal of P5 — CURRENT facts are never deleted
  and recent supersession history is retained. The tension is explicit and
  should be recorded (candidate constitution amendment note in later phases).
- **Referential integrity.** Missing the dangling-ref NULL or the orphan-entity
  cleanup would leave `superseded_by_triple_id` pointing at deleted rows or
  entity rows with no triples. Mitigation: reuse B3's proven NULL idiom + explicit
  entity cleanup, all in one transaction; assert integrity post-prune in tests.
- **Flag-off regression.** The automatic trigger could perturb the hot
  supersession path even when disabled. Mitigation: gate before any added query;
  add a byte-identical-when-disabled test mirroring B3's guarantee.
- **Concurrency / large batches.** A first prune over a large accumulated
  backlog could be a big transaction. Mitigation: assess batching/scoping
  (`--project`) in design; incremental enforcement keeps steady-state batches
  small.

## Rollback Plan

- **Flag-gated master switch.** Introduce a master enable flag (working name
  `kgPruneEnabled`) in `KnowledgeGraphConfig`. When the flag is OFF **and/or**
  B3's `kgSupersedeEnabled` is OFF, behavior MUST be **byte-identical to
  pre-C1**: no pruning, no orphan cleanup, no hot-path change, no extra queries.
  Disabling the flag is a complete, config-only rollback with no migration.
- **Provisional default (to be confirmed in clarify).** Because C1 *deletes*
  data (unlike B3, which only marked), the conservative recommendation is to ship
  the automatic-deletion behavior **default-OFF** initially, keeping the manual
  `prune-graph` (with dry-run) available for operators to validate on real data,
  then flip the automatic default ON in a follow-up once eval evidence confirms
  safe steady-state behavior. The alternative (**default-ON gated by eval**) is a
  legitimate fork and is surfaced as a `[NEEDS CLARIFICATION]` for clarify — do
  not treat the provisional default as final.
- **No schema rollback needed.** No destructive DDL migration is introduced
  (keep-N is query-driven), so rollback does not require a down-migration; any
  added index is non-destructive and can remain.
- **Reversibility limit (disclosed).** Rows already pruned while the feature was
  ON are not recoverable from the KG; they can only be reconstructed by
  re-running `rebuild-graph` from the source observations (which regenerates
  current facts, not historical superseded chains). This is inherent to bounded
  retention and is the reason for the conservative default recommendation.

## Success Criteria

1. With the feature enabled and `N` configured, superseded triples per slot never
   exceed `N` after either trigger runs; CURRENT (non-superseded) triples are
   never pruned.
2. `prune-graph` (CLI + HTTP `POST /graph/prune`) exists as a sibling of
   `rebuild-graph`, supports **dry-run** that reports would-delete counts without
   mutating, and returns before/after counts (triples pruned, entities removed,
   dangling refs NULLed).
3. After any prune, referential integrity holds: no surviving row's
   `superseded_by_triple_id` points at a deleted row, and no `kg_entities` row is
   left with zero referencing triples.
4. With `kgPruneEnabled` OFF **or** `kgSupersedeEnabled` OFF, behavior is
   byte-identical to pre-C1 (verified by a dedicated flag-off test; no hot-path
   query added when disabled).
5. Prune is deterministic (same DB + same `N` ⇒ same prune set) and transactional
   (all-or-nothing; a failure leaves the KG unchanged).
6. Export/import parity is preserved: `exportData`/`importData` behavior and
   format version `1` are unchanged; existing export-import tests still pass.
7. The MCP surface remains exactly six tools; no MCP tool added or changed
   (Constitution **P1**).
8. New config knobs resolve through env > persisted > default and validate
   against `config.schema.json`.
