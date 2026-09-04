# Implementation Plan: Establish Observation Promotion Pipeline

## Technical context

The current revision-5 core already provides immutable evidence, database-ordered session events, temporal promoted memories, memory-to-evidence lineage, memory-only FTS5, rebuildable source-supported session summaries, verified forward migration backups, and summary-first bounded continuation. `mem_save` currently joins evidence with an optional deliberate memory in one transaction; there is no durable intermediate claim, review verdict, or observation-to-memory promotion record. `mem_recall`, `mem_context`, project briefing, and native recovery consume only summaries and promoted memories.

This change adds a rebuildable candidate layer while preserving those authority boundaries. A caller submits one atomic observation and its proposed durable interpretation; the core records a canonical immutable submission and validates original supports. A verified root review appends one terminal acceptance or rejection under a closed policy basis. Promotion accepts no new prose: it materializes the accepted proposed memory exactly, links it to the observation, review/promotion evidence, and original supports, and commits existing topic/FTS behavior atomically. Corrections create a successor candidate rather than mutating history.

Implementation ownership remains with the root writer. Schema, migration, service transactions, closed tool unions, skills, and outcome fixtures share one ordering/authority contract; the root already owns the dirty-worktree context and a single writer avoids cross-surface drift. A fresh Oracle remains mandatory for optional plan review if selected and for final verification. The unrelated uncommitted lexical E0 changes are read-only inputs and MUST be preserved.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the accepted scope keeps exactly the six registered names and extends only closed branches/actions of `mem_save`, `mem_get`, and `mem_project`.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — canonical observation/review/promotion evidence is local SQLite source material; derived state is deterministic and no model, network, vector, graph, or reranker participates.
- **P3 — Harness-Agnostic Memory Contract**: PASS — observation, review, policy, support, and promotion DTOs use host-neutral identity/taxonomy values; adapters retain only capability translation and automatic capture remains excluded.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — observations are absent from normal recall/context; queue results are compact and `mem_get` expands one selected ID without raw support payloads.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — the plan declares a forward current-schema migration with verified backup/no backfill, adds no alias or dual storage path, and preserves current deliberate direct-save behavior as an intentional branch.

## Design

### Architecture and flow

```text
verified MCP caller
  ├─ direct evidence [+ deliberate memory] ───────────────► existing save transaction
  ├─ typed validation/review support evidence ────────────► direct evidence-only transaction
  ├─ observation candidate + support IDs
  │      └─ canonical observation evidence ─► candidate projection
  ├─ terminal root review + basis/support IDs
  │      └─ canonical review evidence ───────► accepted | rejected
  └─ explicit accepted-candidate promotion
         └─ promotion evidence + exact proposed memory + original supports + FTS

normal recall / context / native recovery
  └─ session summaries + promoted memories only

explicit inspection
  ├─ mem_project action=observations ─► bounded queue
  └─ mem_get observation ID ──────────► candidate + IDs + review/promotion lineage
```

### Component decisions

- `src/memory-core/contracts.ts` adds closed observation kinds/scopes/states, generator/policy/review values, bounded inputs/records, and a discriminated get/project record without changing the six tool names.
- `src/memory-core/sqlite/schema.ts` adds clean current-schema candidate, facet, support, review, promotion, and operation-receipt structures plus immutability/scope/transition triggers. Observation rows never drive `memory_fts` or its watermark.
- `src/memory-core/sqlite/migrations.ts` advances revision 5 through the existing verified-backup framework, applies a forward transaction with empty observation state, verifies prior authoritative rows/FTS, and performs no legacy/summary/memory backfill.
- New `src/memory-core/observations.ts` owns canonical JSON, limits, privacy filtering, stable IDs, support/scope/coverage checks, policy-basis validation, terminal review, exact promotion, record mapping, bounded listing, and deterministic rebuild.
- `src/memory-core/service.ts` delegates the three observation operations to the new module inside service-owned transactions, validates typed direct-save support evidence against an existing same-project candidate before writing, expands `get`/project inspection, and leaves recall/context/lifecycle selection unchanged.
- `src/tools/index.ts` keeps metadata-free direct-save requests valid, adds exact evidence-only variants for `observation_validation` and `observation_review_attestation`, and adds mutually exclusive `observation`, `observation_review`, and `observation_promotion` branches. It extends `mem_project` with `action=observations` and lets `mem_get` return a discriminated observation record.
- `src/integration/**`, `integrations/**`, and packaged thoth-mem skill assets receive only host-neutral guidance/schema propagation required for explicit root use. Native lifecycle runners never synthesize candidates, reviews, or promotions.
- Tests mirror the nearest current seams: contracts, schema migration, service/observation projector, tools, continuation/retrieval, lifecycle/adapters, packaging, and an isolated committed observation-pipeline fixture.
- The outcome fixture uses separate control/candidate projects on the same current schema. Both finish with identical promoted memory corpora; only the candidate project's pre-promotion evidence/review path differs. Recall queries, Top-K, final character budget, and report accounting remain identical.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Preserve canonical operation evidence and rebuild derived observation state | `contracts.ts`, `schema.ts`, `observations.ts` | clean create, direct SQL, rebuild equality |
| FR-002 | Keep candidates/reviews outside `memories` until accepted explicit promotion | `observations.ts`, `service.ts` | zero-memory assertions for submit/review/reject |
| FR-003 | Link promoted memory to candidate, review/promotion evidence, and original supports | `observations.ts`, `memory_evidence` plus promotion mapping | `mem_get` lineage and history tests |
| FR-004 | Enforce one closed taxonomy at public/service/SQLite/rebuild boundaries | `contracts.ts`, `schema.ts`, `tools/index.ts` | unknown-value matrix with zero side effects |
| FR-005 | Derive root/session authority and exact basis support from verified identity and ordered evidence | `service.ts`, `ledger.ts`, `observations.ts` | basis-by-kind, actor/authority, metadata, project/session/cross-scope/degraded identity tests |
| FR-006 | Upgrade revision 5 with verified backup and no backfill | `sqlite/migrations.ts`, `sqlite/schema.ts` | file fixture, injected rollback, idempotent reopen |
| FR-007 | Use one transaction per submit/review/promote operation | `service.ts`, `observations.ts`, SQL triggers/receipts | injected-failure and immediate-FTS tests |
| FR-008 | Rebuild candidate/review/promotion projections from canonical evidence | `observations.ts`, schema triggers | delete/rebuild/reconcile fixture |
| FR-009 | Keep the exact six registrations | `tools/index.ts`, `server.ts` inventory | MCP/package exact-name assertions |
| FR-010 | Add strict mutually exclusive observation branches, typed support-evidence variants, and bounded envelopes | `tools/index.ts` Zod schemas | unknown/ambiguous/metadata/kind/partial input tests |
| FR-011 | Preserve metadata-free direct save; add direct support evidence plus candidate, review, promotion branches | `SaveMemoryInput` plus observation service inputs | direct regression + typed support + three observation operation contracts |
| FR-012 | Expand only explicitly selected observation IDs | `service.get`, `tools/index.ts` public mapping | progressive funnel/no raw support payload tests |
| FR-013 | Add deterministic bounded observation queue over non-branching lineages | `service.projectObservations`, `mem_project` | current/history partition, successor uniqueness, total ordering, filters, caps, project/session isolation |
| FR-014 | Leave lifecycle and summary submission behavior unchanged | `service.lifecycle`, adapters | no candidate/promotion lifecycle assertions |
| FR-015 | Keep native capture allowlists and privacy boundaries | `src/integration/**`, `integrations/**` | three-host malicious/private fixture |
| FR-016 | Teach explicit candidate/review practice without weakening direct authorization | bundled thoth-mem skills and setup inventories | canonical/packed skill text and inventory tests |
| FR-017 | Keep memory FTS/recall/continuation observation-free | `sqlite/fts.ts`, `service.recall/context`, `continuation.ts` | FTS row equality, ordering, cap, optional review lookup failure |
| FR-018 | Add equal-budget write/promotion outcome evidence | `benchmarks/observation-pipeline/**`, report schema/validator, tests | immutable offline report and fail-closed validator |

## Optional support artifacts

- `research.md`: Not needed. The user-provided Deep Research, accepted AgentMemory/Engram comparison, and Full explorer findings are distilled into `spec.md`, this plan, and canonical source references.
- `data-model.md`: Required because authority, immutable submissions, terminal review, exact promotion, derived state, rebuild order, and revision-5 migration are correctness-critical.
- `contracts/observation-pipeline.md`: Required because one exact host-neutral DTO must span a four-branch `mem_save`, `mem_get`, `mem_project`, skills, and packed clients without adding a tool.
- `quickstart.md`: Not needed. Operator setup is unchanged; executable examples belong in contract/unit tests and the existing bundled skill.

## Risks and migrations

- **Candidate mistaken for memory**: no observation FTS trigger exists; recall/context code paths keep their current record sources; package tests assert zero candidate leakage.
- **Review treated as truth without authority**: acceptance/rejection require verified non-import root identity and the exact basis matrix: attributable root prompt, structured same-session validation receipt, or matching different-session harness review attestation as allowed by claim kind. Wrong actor/authority/session/payload fails; confidence/similarity remain diagnostic only.
- **Promotion content drift**: the promotion call accepts an observation ID but no replacement prose; it copies the accepted proposed memory representation and links every source atomically.
- **Partial promotion**: one service transaction covers promotion evidence, event/receipt, observation mapping, memory/topic transition, support links, watermark, and FTS; injected failures roll back all rows.
- **Corrections rewrite history**: candidate/review content is immutable; a predecessor link plus existing memory supersession/retraction represents correction.
- **Project-scoped support ambiguity**: project scope permits multiple same-project sessions but never claims one session/coverage; session scope requires same-session in-range supports.
- **Projection rebuild accepts tampering**: canonical parsers use exact keys/limits/taxonomies and reconstruct in deterministic evidence order; malformed lineage fails before replacing a valid projection.
- **Migration loss or invented knowledge**: a verified pre-upgrade backup precedes mutation, new state starts empty, no legacy kind is reinterpreted, and prior evidence/memory/summary/FTS counts and hashes are checked.
- **Recall/resource regression**: control and candidate use the same schema and final memory corpus; gates require identical ordering/payload and bound normal-recall p95/aggregate SQLite bytes to twice control.
- **Dirty-worktree overlap**: existing lexical changes overlap `service.ts`, `fts.ts`, `package.json`, docs, canonical retrieval/eval specs, benchmark reports, and tests. The writer reads current disk, uses focused patches, adds a separate observation benchmark, and never resets/regenerates unrelated work.
- **Future governance gap**: this change provides logical rejection, immutable history, and correction lineage only. Physical retention/deletion cascade remains explicitly staged; the design avoids claiming it is implemented.
- **Rollback**: before archive, failed verification leaves the change active and code converges or is manually reverted only by its owned patch set. For migrated user databases, startup failure leaves the verified pre-upgrade database/backup recoverable; there is no down-migration.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the mapped contract has exactly six registrations; all observation behavior is confined to closed `mem_save`, `mem_get`, and `mem_project` workflows with inventory tests.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — immutable canonical evidence plus deterministic local rebuild owns observation state, promotion uses existing SQLite memory/FTS, and zero optional/model/network dependency is load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — one plain DTO and closed taxonomy serves MCP, CLI-capable core consumers, three adapters, and skills; no native payload field enters persistence.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — normal progressive retrieval is unchanged and observation inspection uses compact capped queues, stable IDs, single-record expansion, and withheld raw payloads.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — revision-5 migration is forward-only/backup-first/no-backfill, current direct save remains intentional, and the design adds no shim, alias, dual read/write, or hidden destructive behavior.
