# Implementation Plan: Establish Ordered Session Summaries

## Technical context

The current revision-3 core stores immutable evidence and promoted memories in SQLite, assigns no durable order inside a session, auto-promotes `checkpoint_pre_compact` content into a current `handoff` memory, and renders continuation from memory-only `RecallItem` values. `mem_session` owns root lifecycle idempotency, `mem_context`/`mem_project action=briefing` share the memory selector, and all three native adapters normalize to the same service boundary. The LongMemEval-S result is a separate retrieval signal; this first slice addresses session continuity and authority, not query construction.

The design adds an ordered event companion to evidence, stores each externally generated summary submission as immutable evidence, materializes structured summary/claim projections from that submission, and generalizes continuation to a summary-or-memory item union. Existing current handoff memories remain fallback data; new checkpoints stop auto-promoting memory. SQLite stays the sole source, the core stays synchronous/local/model-free, and the public inventory remains exactly six MCP tools.

Implementation ownership remains with root because schema, service, tool, lifecycle, and tests form one tightly ordered transaction contract and rediscovery/coordination would outweigh delegation. Independent Oracle verification remains mandatory.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the accepted architecture keeps exactly the existing six tools and extends only their closed workflow schemas.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — summaries are reconstructed from immutable SQLite submission evidence; no LLM, embedding, graph, reranker, vector service, or network dependency enters save/recovery.
- **P3 — Harness-Agnostic Memory Contract**: PASS — one host-neutral event/summary DTO owns core semantics and adapters provide only verified host identity/capability translation.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — context remains compact and capped, summary supports stay deferred, and full claims/lineage require explicit `mem_get`.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — the plan declares a protocol/schema revision, forward-only current-schema migration, verified backup, no inferred backfill, and no aliases or dual paths.

## Design

### Architecture and flow

```text
native adapter / MCP caller
        │ verified host-neutral lifecycle + optional structured summary
        ▼
MemoryService transaction
  ├─ append evidence + ordered session_event
  ├─ persist immutable summary submission evidence
  ├─ materialize summary + claims + supports + version transition
  ├─ update lifecycle receipt/state/watermark
  └─ return confirmed IDs only after commit
        │
        ▼
shared continuation selector
  ├─ current summary for verified session (first)
  ├─ existing current promoted memories (remaining budget)
  └─ legacy current handoff fallback when no summary exists
```

### Component decisions

- `src/memory-core/contracts.ts` gains closed event/summary taxonomies, record/input/result unions, a summary-capable lifecycle input/result, and a context item that never masquerades as a memory.
- `src/memory-core/sqlite/schema.ts` defines revision-4 clean schema additions, immutable event/summary-content triggers, closed checks, version/current indexes, and support FKs.
- `src/memory-core/sqlite/migrations.ts` detects revision 3, creates/verifies a consistent pre-v4 file backup before mutation, applies the forward transaction without backfill, and remains idempotent. Backup creation is skipped for clean/in-memory databases.
- `src/memory-core/sqlite/ledger.ts` owns atomic next-sequence allocation and row mapping; duplicate receipts are checked before allocation.
- New `src/memory-core/session-summaries.ts` owns canonicalization, privacy filtering, limits, support/scope/range validation, stable IDs, version precedence, materialization, selection, and deterministic rebuild from summary submission evidence.
- `src/memory-core/service.ts` coordinates ordered saves and summary-aware lifecycle transactions, removes automatic checkpoint memory promotion, expands `get`/project operations, and passes verified session identity to continuation selection.
- `src/memory-core/continuation.ts` renders a discriminated `ContextItem` union under the existing trust boundary and host cap, preserves complete IDs, and protects actionable summary claims without exposing raw supports.
- `src/tools/index.ts` extends only `mem_session`, `mem_context`, `mem_project`, and `mem_get` closed schemas/handlers; tool names and inventory remain unchanged.
- `src/integration/core/lifecycle.ts`, `src/integration/adapters/index.ts`, `src/integration/opencode/node-lifecycle-client.ts`, and canonical files under `integrations/` carry the same optional host-neutral summary object and truthful capability/result fields. No adapter generates a summary or calls a model.
- `src/memory-core/import/legacy-v1.ts` updates only its target schema/report discriminator as required; it does not map legacy observations or handoffs into new summaries/events.
- `docs/agent/persistence-retrieval.md`, `docs/agent/native-lifecycle.md`, `docs/agent/testing.md`, README/operator surfaces, package inventory assertions, and canonical OpenSpec deltas are updated only where observable contracts change.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add immutable ordered event companion plus immutable summary-submission evidence | `contracts.ts`, `schema.ts`, `ledger.ts`, `session-summaries.ts` | migration/service SQL invariants and deterministic rebuild |
| FR-002 | Remove checkpoint auto-promotion; summaries stay outside `memories` | `service.ts`, lifecycle contracts | checkpoint transaction and zero-new-memory assertions |
| FR-003 | Allocate session sequence in SQLite after duplicate detection; attach closed trust classes | `ledger.ts`, `service.ts`, `contracts.ts` | concurrent/replay/project-only tests |
| FR-004 | Materialize versioned summary, claim, and support tables from canonical submission evidence | `session-summaries.ts`, `schema.ts`, `data-model.md` | valid/rebuild/version/support tests |
| FR-005 | Upgrade v3→v4 after verified SQLite backup; no backfill; forward-only | `migrations.ts`, `schema.ts` | fixture migration, injected failure, restore and reopen tests |
| FR-006 | Keep the six registrations; bump the coordinated protocol discriminator only | `tools/index.ts`, `contracts.ts`, server/package inventories | exact-name and closed-envelope tests |
| FR-007 | Accept summary only at verified checkpoint/final lifecycle operations, atomically with receipt | `service.ts`, `contracts/session-summary.md` | lifecycle idempotency, drift and zero-side-effect tests |
| FR-008 | Generalize `mem_get` and context results with discriminated summary records and deferred supports | `service.ts`, `tools/index.ts`, `continuation.ts` | progressive funnel and payload tests |
| FR-009 | Add bounded `mem_project action=summaries`; session-aware briefing remains shared | `service.ts`, `tools/index.ts` | current/history/scope/budget tests |
| FR-010 | Normalize one optional summary DTO across three adapters without generation | `src/integration/**`, `integrations/**` | adapter fixtures and packed three-host smoke |
| FR-011 | Render summary first, untrusted and capped, with truthful selected ID categories | `continuation.ts`, lifecycle clients | poisoning, Unicode cap, actionable-field and consumption tests |
| FR-012 | Select by verified session, coverage, kind, time, ID; fallback to current handoffs | `service.ts`, `session-summaries.ts` | deterministic precedence/fallback/project isolation tests |
| FR-013 | Extend equal-budget fixtures with summary fidelity, support, version and no-promotion evidence | `benchmarks/**`, `tests/benchmarks/**` | committed offline benchmark and report validation |

## Optional support artifacts

- `research.md`: Not needed; the confirmed Deep Research findings and completed architectural-grilling decisions are distilled into `spec.md` and this plan.
- `data-model.md`: Required because revision-4 table authority, immutability, version transitions, rebuild semantics, and migration boundaries are correctness-critical.
- `contracts/session-summary.md`: Required because four existing MCP workflows and three adapters must share one closed summary DTO without widening the tool inventory.
- `quickstart.md`: Not needed; operator-visible setup does not change and implementation examples belong in existing docs/tests.

## Verification strategy

1. Use the mandatory `tdd` skill: write failing unit/contract tests before each behavior slice.
2. Run nearest tests first: schema/migration, summary projector/service, continuation, tools, lifecycle/adapters, benchmark/report, packaging.
3. After each external edit batch, synchronize the IDE index only when indexed results are stale; use project diagnostics on touched TypeScript files.
4. Run `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run benchmark:fixture`, `pnpm run prepublishOnly`, and `git diff --check` after focused convergence.
5. The existing LongMemEval external report is preserved unchanged; no networked preparation or dense/hybrid experiment runs in this change.
6. Run `simplify` after behavior is complete, then delegate a fresh read-only Oracle final verification. Archive only after PASS and closeout validation.

## Risks and migrations

- **Projection mistaken for truth**: every summary is backed by immutable submission evidence, uses explicit generator/support metadata, renders as untrusted data, and remains outside `memories`.
- **Non-rebuildable external semantics**: the canonical sanitized structured submission is itself preserved as evidence; rebuild replays it rather than asking a model to recreate meaning.
- **Concurrent sequence or version races**: SQLite transactions, unique indexes, duplicate-first receipt checks, and monotonic coverage guards fail closed.
- **Migration data loss**: a consistent verified backup precedes revision-4 mutation; transaction failure leaves revision 3; there is no destructive backfill or down-migration.
- **Backup operational residue**: backup naming and reuse are deterministic and documented; migration never overwrites a prior verified backup silently.
- **Context regression**: existing current handoffs remain fallback; summary selection is session-scoped; committed equal-budget fixtures gate useful-content ratio and actionable fields.
- **Tool contract drift**: all nested schemas are closed, one protocol discriminator changes, and package/native inventories assert the same six names and host-neutral shape.
- **Payload amplification or poisoning**: bounded claim/support counts, privacy filtering before hashes, same-scope support validation, withheld raw evidence, trust delimiters, and host caps apply.
- **Dirty-worktree overlap**: the archived LongMemEval baseline is currently uncommitted and overlaps documentation/package/benchmark surfaces. Implementation must preserve those changes, edit only after reading current disk content, and review the final diff by ownership rather than resetting or regenerating unrelated artifacts.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the mapped contract adds zero tools and confines summary submit/inspect/history/get behavior to four existing workflows with inventory tests.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — the materialized summary is replayable from immutable sanitized submission evidence and no optional/model component is load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — the data model and DTO contain no native host payload fields; OpenCode, Codex, and Claude adapters terminate at one lifecycle contract.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — summary candidates use the progressive context/get funnel, with 1,000-code-point native caps, claim-aware omission, stable IDs, and deferred supports.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — revision 4 and the coordinated envelope change are explicit, source data is preserved with verified backup, migration is forward-only/no-backfill, and no shim, dual read, or alias is planned.
