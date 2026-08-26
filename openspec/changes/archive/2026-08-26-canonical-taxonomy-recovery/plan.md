# Implementation Plan: Canonical taxonomy recovery

## Technical context

The V2 TypeScript contracts declare closed evidence, memory, outcome, harness, status, and lifecycle-operation unions, but their runtime representations are currently duplicated or absent. `src/tools/index.ts` accepts nested `mem_save` objects as arbitrary records and casts strings into those unions, `MemoryService.save` trusts direct callers, and the SQLite schema constrains several classifications but not evidence or memory kinds. The OpenCode Bun adapter independently repeats a memory-kind list and correctly rejects out-of-contract recovery items, which exposed the divergence during the real SC008 no-tools smoke.

The change will make `src/memory-core/contracts.ts` the runtime-safe source of canonical value tuples and their derived TypeScript unions. The public protocol remains V2 through a clearly named protocol constant, while `src/memory-core/sqlite/migrations.ts` owns a separate monotonically increasing internal SQLite revision. Fresh and upgraded databases will install the same insert guards for evidence and memory kinds; existing revision-2 ledgers will normalize only the observed, explicitly approved mappings inside one transaction before the new guards and revision receipt are committed.

The implementation keeps SQLite behind literal Node for OpenCode. The Bun bundle imports only dependency-free contract values, validates the versioned child envelope fail-closed, and classifies invalid JSON, identity mismatch, invalid recovery taxonomy, and other invalid envelope shapes with bounded diagnostic codes. No LLM, daemon, HTTP service, additional MCP tool, or retrieval module enters the hot path.

Reference review informed the boundary without changing product scope:

- `master` supplies the proven pattern of one runtime taxonomy tuple driving TypeScript, Zod, SQLite enforcement, and direct-SQL regression tests; its legacy observation model is not restored.
- AgentMemory supplies the pattern of closed nested schemas with `safeParse` at untrusted boundaries and a thin OpenCode adapter; its daemon and broad registry are not adopted.
- Engram supplies the SQLite-source-of-truth and thin-plugin/core-logic guardrails; its HTTP architecture is not adopted.

Implementation ownership remains with the root agent because the contract, migration, and OpenCode changes form one ordered correctness chain and the relevant context is already loaded. The mutable surface is limited to the shared contracts, write validation, SQLite migration/schema guards, OpenCode envelope validation, focused tests, and the declared OpenSpec change. Independent plan review and final verification remain Oracle-owned.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design changes validation behind the existing exact six-tool registry and preserves the single OpenCode identity-only native tool.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Taxonomy validation and migration are deterministic SQLite/core operations; FTS stays rebuildable and no optional projection becomes authoritative.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One dependency-free runtime contract is consumed by MCP, the shared service, SQLite, and the OpenCode boundary without introducing host-specific memory semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recovery budgets and source attribution remain unchanged, invalid envelopes inject zero memory, and diagnostics contain only bounded codes.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — Only three observed pre-constraint V2 values receive one-way mappings; unknown values fail visibly and no general compatibility layer is introduced.

## Design

### Canonical runtime contract

`src/memory-core/contracts.ts` will export readonly tuples for harnesses, evidence kinds, memory kinds, memory outcomes, memory statuses, lifecycle operations, and any other classification validated at the affected boundaries. The corresponding TypeScript unions will be derived from those tuples. A small dependency-free membership/assertion seam will validate a `SaveMemoryInput` before `MemoryService.save` opens its transaction, including optional session and promoted-memory fields.

`src/tools/index.ts` will construct closed Zod shapes from those tuples. The same shapes will validate direct `createToolHandlers` calls, not only SDK registration, so tests and non-MCP callers cannot bypass runtime checks. Validation failures will continue through the existing bounded V2 error envelope and occur before project/session creation, evidence insertion, receipts, supersession, or FTS side effects.

### SQLite revision and taxonomy convergence

The public protocol constant will be named independently from a new internal SQLite revision constant. Fresh databases will install the complete current schema and write that internal revision to `schema_migrations`. Existing revision-2 databases will execute an ordered revision-2-to-revision-3 migration; unsupported older, newer, or non-V2 databases will retain the existing explicit failure boundary.

The migration transaction will:

1. Preflight distinct evidence and memory kinds against the canonical tuples plus the three declared source values.
2. Abort before mutation when any unknown value exists, returning a bounded classification-only diagnostic without echoing private content.
3. Temporarily remove only the immutability triggers that block the two classification updates.
4. Map `learning` to `convention` and `certification|verification` to `explicit_save` without changing IDs, content, hashes, timestamps, links, receipts, session rows, supersession state, or FTS payloads.
5. Recreate the immutability triggers, install canonical `BEFORE INSERT` taxonomy guards shared with fresh schema creation, verify foreign keys and row/link invariants, and append the new revision receipt.

SQLite DDL and DML remain inside one `better-sqlite3` transaction, so an exception rolls back trigger changes, normalization, guards, and revision bookkeeping together. Reopening revision 3 performs no writes. The legacy-v1 importer remains a separate command and is not called by startup migration.

### Strict OpenCode child envelope

`src/integration/opencode/node-lifecycle-client.ts` will use the canonical runtime tuples instead of local string arrays. Its parser will return a discriminated success/failure result so the caller can emit a safe reason-specific diagnostic. An invalid recovery taxonomy will produce `node_lifecycle_invalid_recovery_taxonomy`; malformed JSON, identity mismatch, and other shape failures retain distinct bounded categories. All failures continue to resolve the hook without rejecting the user's prompt and inject no recovery block.

The successful path retains verified root identity, the versioned Node envelope, canonical bounded items, and source IDs. The tagged system renderer will allocate its fixed host-visible content allowance across item boundaries instead of slicing one concatenated string, so multiple selected memories remain represented and no line is cut into unverifiable partial metadata. Passing the parser proves delivery to the host callback, not model consumption; the real no-tools SC008 outcome remains the separate outcome test.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Export canonical readonly tuples, derive unions, and reuse closed Zod shapes for registration and direct handlers. | `src/memory-core/contracts.ts`, `src/tools/index.ts`, `registerTools`, `createToolHandlers` | `tests/tools/mcp-v2.test.ts` accepts every canonical value, rejects invalid nested values, and confirms exactly six tools. |
| FR-002 | Validate service inputs before transactions and install shared SQLite insert guards for evidence and memory kinds. | `src/memory-core/contracts.ts`, `src/memory-core/service.ts`, `src/memory-core/sqlite/schema.ts` | `tests/memory-core/service.test.ts` proves zero side effects; `tests/memory-core/taxonomy-migration.test.ts` proves direct invalid SQL inserts fail. |
| FR-003 | Separate public protocol V2 from internal SQLite revision 3 and add one ordered, atomic, idempotent migration. | `src/memory-core/contracts.ts`, `src/memory-core/sqlite/migrations.ts`, `schema_migrations` | `tests/memory-core/taxonomy-migration.test.ts` covers clean creation, revision-2 upgrade, unknown-value rollback, injected failure rollback, and repeat startup. |
| FR-004 | Import canonical tuples into the Bun-safe parser and return reason-specific parse failures without moving SQLite into Bun. | `src/integration/opencode/node-lifecycle-client.ts`, `dispatchOpenCodeLifecycleThroughNode` | `tests/integration/opencode-native-plugin.test.ts` covers canonical success, invalid taxonomy, malformed envelope, and non-blocking degradation through literal Node. |
| FR-005 | Render recovery only after complete envelope validation; allocate the fixed host budget across complete source-attributed item lines; keep lifecycle budgets, sources, and capability flags intact. | `src/integration/opencode/node-lifecycle-client.ts`, `src/integration/opencode/plugin.ts` | OpenCode integration tests assert one bounded tagged block that retains a later SC008 item after longer predecessors and zero blocks for invalid envelopes; real-host SC-007 verifies model-visible recovery. |
| FR-006 | Preserve exact registries and boundaries; add no daemon, LLM call, or host-specific memory operation. | `src/tools/index.ts`, `src/integration/opencode/plugin.ts`, `integrations/inventory.json` | Existing package/inventory suites plus `getToolCount() === 6`, packed integration verification, and Bun smoke. |
| FR-007 | Normalize only classification columns while preserving authoritative rows, relationships, receipts, and FTS state. | `src/memory-core/sqlite/migrations.ts`, `src/memory-core/sqlite/schema.ts` | Migration fixture snapshots IDs, hashes, timestamps, links, receipts, counts, FTS results, revision rows, and `foreign_key_check` before/after. |

## Optional support artifacts

- `research.md`: Not needed; the bounded findings from `master`, AgentMemory, Engram, the real OpenCode export, logs, and SQLite audit are captured in the specification and this plan.
- `data-model.md`: Not needed; no entity or relationship is added, and the internal revision/guard migration is fully specified here.
- `contracts/`: Not needed; the public surface remains the existing V2 six-tool and lifecycle envelopes, with stricter validation rather than a new external contract.
- `quickstart.md`: Not needed; setup and operator workflow are unchanged, apart from reinstall/restart for the final real-host smoke.

## Risks and migrations

- **Immutability-trigger gap during normalization**: The migration drops only the two blocking triggers inside the same SQLite transaction, recreates them before revision commit, and rolls the complete transaction back on any failure.
- **Unknown local corruption**: Preflight accepts only canonical values and the three declared mappings. Unknown classifications block startup without partial changes; the operator can inspect or repair a copy rather than having data guessed away.
- **Fresh/upgraded enforcement drift**: Both paths execute the same generated taxonomy-guard SQL sourced from the canonical tuples, and tests compare their observable direct-SQL behavior.
- **Protocol/revision confusion**: Public envelopes remain V2 while SQLite revision 3 is persistence-internal. Tests assert both independently, and diagnostics name the SQLite revision when startup is incompatible.
- **Bun bundling regression**: The OpenCode adapter imports only dependency-free constants/types; packed tests scan and execute the bundle to prove `better-sqlite3` remains in the Node child.
- **False recovery success**: Unit/integration checks establish hook execution and context delivery only. SC-007 requires a fresh user-operated OpenCode restart, absent-from-prompt marker, no tool calls, lifecycle receipts, and clean diagnostics before model-visible recovery is certified.
- **Double-budget truncation**: `MemoryService.context` budgets memory content, while the host renderer also pays titles and source IDs. The renderer therefore owns a second, item-aware allocation and tests its public hook output against the final 1,000-code-point cap with multiple realistic items.
- **Rollback**: Before real-host installation, retain a copy of the local SQLite file. Code rollback alone cannot reverse the deliberate kind mappings after revision 3; restoring that pre-migration copy is the bounded rollback path. No in-product down-migration is added.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Every requirement maps behind the existing six MCP tools and identity-only native helper; no tool or workflow surface is added.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The final design uses deterministic tuple validation and transactional SQLite migration while preserving FTS as derived state and avoiding optional projections.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The same exported runtime values govern shared writes, storage, and the thin OpenCode adapter, and the design remains applicable to Codex and Claude without host-specific taxonomy forks.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The design preserves budgets and source attribution, rejects an invalid payload as a whole, and emits bounded non-content diagnostics.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The design explicitly rejects taxonomy expansion, arbitrary repair, daemon adoption, and compatibility shims; only the finite pre-constraint V2 cleanup is migrated.
