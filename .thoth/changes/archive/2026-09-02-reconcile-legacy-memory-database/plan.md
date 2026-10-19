# Implementation Plan: Reconcile Legacy Memory Database

## Technical context

The current `importLegacyV1` path in `src/memory-core/import/legacy-v1.ts` is a synchronous fresh-target rebuild. It reads only `sessions`, `user_prompts`, and the current `observations` rows, derives `legacy:<project>` identities, routes writes through `MemoryService`, counts every remaining table, and publishes a staging database with `renameSync`. That shape cannot merge into the populated current target, cannot inventory missing `vec0` modules safely, omits session summaries and observation revisions, loses session timestamps/state, and can change current topic winners.

The implementation will replace that behavior with a closed two-step CLI contract:

1. `import-legacy plan` reads both databases without mutation and creates an immutable plan bound to logical/file fingerprints, policy version, and exact project dispositions.
2. `import-legacy apply` verifies that plan, creates a verified recovery backup and isolated candidate from the current target, reconciles legacy rows inside the candidate, validates it, and publishes one closed single-file SQLite database only after the target is no longer in use.

The runtime remains TypeScript/Node ESM with `better-sqlite3`, schema revision 8, SQLite FTS5, no network/model calls, no legacy vector/KG extension, no new MCP tool, and no compatibility read path. The real legacy/current databases are verification inputs only after separate authorization; implementation and normal tests use disposable fixtures.

**Implementation ownership**: one `deep` implementation owner will own `src/memory-core/import/`, the revision-8 import-ledger schema/migration, CLI wiring, and focused tests. The net gain is context isolation for a coupled, destructive-boundary migration whose timestamp, identity, FTS, backup, idempotency, and publication invariants must be reasoned about together. Root retains all OpenSpec artifacts/gates and no second writer may overlap those code surfaces.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the change modifies only the existing CLI import command and internal SQLite core; the exact six MCP tools remain unchanged.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — source inspection and merge use authoritative SQLite tables only; legacy graph/vector/FTS/operational tables are classified and ignored without loading optional modules.
- **P3 — Harness-Agnostic Memory Contract**: PASS — imported sessions use the host-neutral `import` harness and canonical ledger records; no OpenCode/Codex/Claude payload enters the core.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — the recall contract and limits remain unchanged, and verification explicitly protects pre-existing recall order/current winners.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — this is one observable one-way data importer with an untouched source, recovery backup, exact report, and rollback; it adds no dual read/write or runtime legacy shim.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add revision-8 import audit tables and a dedicated candidate-only writer that streams supported legacy rows, preserves source timestamps/revisions, records every row disposition, imports prior observation versions as superseded memory lineage, imports current observations/session summaries as legacy evidence plus memory, and ignores schema-classified derivatives. Existing target topic winners have authority precedence; exact canonical matches link provenance without duplicate memory. | `src/memory-core/sqlite/schema.ts`, `src/memory-core/sqlite/migrations.ts`, `src/memory-core/import/legacy-v1.ts`, new `src/memory-core/import/contracts.ts`, `inspect.ts`, `writer.ts`, `verify.ts` | Revision 7→8 migration tests; importer fixtures covering counts, timestamps, revisions, privacy, lineage, FTS, exact dedup, current-winner stability, and replay. |
| FR-001 | Resolve projects using an explicit map first, then one exact current identity/path alias; unmatched non-placeholder values create deterministic isolated `legacy:` projects, while ambiguity/placeholders/conflicts quarantine or block. Persist normalized source mapping, basis, destination, and plan hash. | `src/memory-core/import/contracts.ts`, `inspect.ts`, `writer.ts`, `src/memory-core/sqlite/ledger.ts` helpers | Identity matrix fixture proves one disposition per project/row and zero fuzzy/basename/name matching. |
| FR-001 | Apply importer-specific privacy validation: reuse credential/private-block sanitization, classify transformed rows, and quarantine malformed/unmatched private delimiters or required fields empty after filtering. Do not weaken or reinterpret ordinary save behavior. | `src/memory-core/privacy.ts` reusable helper as needed; `src/memory-core/import/inspect.ts`, `writer.ts` | Private/malformed/empty fixtures reconcile to exact imported/quarantined counts without leaking raw content in reports. |
| FR-002 | Replace the one-shot CLI syntax with `import-legacy plan --source --target --plan [--map]` and `import-legacy apply --plan --report`; plans/reports are create-only closed JSON contracts and apply accepts no unbound path overrides. | `src/cli.ts`, `src/memory-core/import/contracts.ts`, `openspec/changes/reconcile-legacy-memory-database/contracts/` | CLI tests cover unknown/duplicate options, absent/occupied artifacts, zero-write plan, stale/tampered plan, and bounded JSON/error output. |
| FR-002 | Fingerprint canonical authoritative content and the relevant database file set before/after inspection. At apply, use SQLite online backup from a read-only target connection to create a verified recovery snapshot, clone it to an importer-owned candidate, reconcile in transactions, checkpoint candidate WAL to a closed single-file database, and recheck input fingerprints before publication. | `src/memory-core/import/inspect.ts`, new `backup.ts`, `verify.ts` | WAL-aware target/source fixtures, changed-input injection, backup hash/revision/integrity checks, and candidate cleanup tests. |
| FR-002 | Publish only after candidate integrity passes: acquire the safe stopped-target boundary, move the complete prior target file set into an owned recovery bundle, rename the closed candidate to the target, verify reopen/hash, and restore the prior bundle on publication failure. Never delete a pre-existing unrelated artifact. | `src/memory-core/import/backup.ts`, `legacy-v1.ts`, `src/cli.ts` | Failure injection at every publication step proves original recovery and no committed report on partial publication. |

### Data flow and ordering

1. **Plan**
   - Validate distinct explicit paths and create-only plan/mapping inputs.
   - Open source and target read-only with `query_only=ON`; target may be absent.
   - Classify source schema objects from `sqlite_master.sql`; query only the supported authoritative tables.
   - Stream rows to compute logical fingerprints, inventories, privacy/result classifications, revision cardinality, project candidates, and expected dispositions.
   - Validate explicit mappings against exact current keys/aliases and emit the canonical plan plus `planHash`.
   - Recompute input fingerprints before returning.
2. **Candidate apply**
   - Parse/canonicalize the plan and verify `planHash`, policy version, input paths, and current fingerprints.
   - Create and verify a unique recovery backup from the target (or initialize a clean current candidate when target was absent); clone that closed snapshot into a unique candidate.
   - Open only the candidate writable. Migrate it to revision 8 before import and persist the import header/project map.
   - Import sessions first, prompts second, raw session summaries third, prior observation versions fourth, and active observation heads last. Use stable IDs derived from source fingerprint, entity type/key/revision, and resolved project.
   - Reconcile exact existing memories before insertion; preserve current target topic winners, then build legacy-only revision/topic chains deterministically by source timestamp, version/order, and source key.
   - Persist one row receipt per logical authoritative entity and compare actual dispositions with the plan.
3. **Verification/publication**
   - Check schema revision, `integrity_check`, `foreign_key_check`, authoritative baseline preservation, receipt closure, stable lineage, one current winner per imported legacy-only topic, memory/FTS equality, source unchanged, and target base unchanged.
   - Close/checkpoint the candidate into a single-file publication form and calculate the committed candidate hash.
   - Publish through the recoverable stopped-target protocol, reopen read-only, re-run bounded integrity/receipt checks, then create the report.

### Temporal and provenance rules

- Legacy prompts remain immutable `legacy_prompt` evidence associated with imported sessions; no ordered `session_events` or root authority is inferred.
- `sessions.summary` and legacy `session_summary` observations remain separate source records. Both become `legacy_observation` evidence plus `handoff` memory; no structured current `session_summaries` projection is fabricated.
- Every `observation_versions` row is a prior version; the corresponding active `observations` row is the head. Prior versions are stored as superseded memories ordered by `(created_at, version_number, source id)` and the head uses `updated_at` when revisions exist, otherwise `created_at`.
- Deleted observations and their versions are not resurrected; their skip disposition remains auditable.
- Existing current memory status/lineage is never demoted by import. When an imported topic collides with an existing current winner, all imported versions remain historical and end at the import boundary. Without a target winner, the latest imported legacy version becomes current.
- Exact dedup requires equal resolved project, topic key, kind, normalized title, normalized content, and outcome. It adds legacy evidence provenance to the existing memory and records `linked`; similarity never deduplicates.
- Raw legacy content never appears in plan/report errors. Reports contain IDs/hashes, counts, enums, and bounded reason codes; the target contains only content accepted by the declared privacy policy.

## Optional support artifacts

- `research.md`: not needed; repository exploration and aggregate real-schema evidence resolve the current behavior and source shape without external research.
- `data-model.md`: required because revision-8 receipt/project/row lineage and temporal reconciliation are the main idempotency and audit risks.
- `contracts/`: required because plan/apply safety depends on closed canonical plan and report envelopes whose hashes and create-only paths must not drift between CLI and core.
- `quickstart.md`: not needed until implementation is verified; operator instructions belong in routed durable documentation at closeout.

## Risks and migrations

- **Revision-8 audit schema**: startup migration adds empty import-ledger tables only, after a verified `.pre-v8.bak`; it must preserve every revision-7 authoritative and FTS row and reopen idempotently. Rollback is the verified revision-7 backup.
- **Direct candidate ledger writes**: public `MemoryService.save` cannot preserve historical timestamps/status without changing current winners. A dedicated importer-internal writer may insert only into the candidate, must reuse canonical taxonomy/privacy/hash/ID helpers, and is verified against public recall/hydration seams.
- **WAL publication**: replacing only the main target file can combine a new database with stale sidecars. Apply therefore requires a stopped target, publishes a closed single-file candidate, and moves the complete old main/WAL/SHM set into an importer-owned recovery bundle before replacement.
- **Large source and extension absence**: planning/import streams authoritative rows and inventories virtual/derived objects from schema metadata. It never counts or selects a legacy virtual table and never loads `vec0`.
- **Overlapping capture periods**: authority precedence keeps existing target current winners unchanged even when a legacy timestamp is later. Imported content remains searchable through history and can be explicitly reviewed later.
- **Project ambiguity**: exact path evidence can still collide because the current target may contain prior duplicate projects. Ambiguity blocks/isolate according to the approved plan; it never auto-merges project content.
- **Sensitive legacy prose**: malformed private delimiters and required fields emptied by filtering are quarantined with hashes/reason codes; no raw payload enters the report.
- **Real-data operations**: normal implementation does not copy, rewrite, or cut over the real databases. A rehearsal on copies and final cutover each require separate user authorization and preserve verified originals/backups.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the concrete design adds revision-8 audit state and CLI plan/apply only; it registers no MCP tool or hidden admin operation.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — the data flow streams only declared authoritative rows, classifies derived tables from SQLite metadata, and validates using SQLite/FTS without any vector, graph, model, or network dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — imported evidence, sessions, memories, provenance, taxonomy, and audit receipts are host-neutral; the `import` harness explicitly signals unavailable root authority instead of simulating it.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — no recall output shape or budget changes; exact-dedup and authority precedence prevent import-created duplicates/current-winner churn from degrading the existing funnel.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — closed plan/apply contracts, source preservation, revision backup, candidate publication, durable receipts, rollback, and explicit ignored tables satisfy the one-way migration boundary without retaining a legacy runtime path.
