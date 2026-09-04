# Implementation Plan: Agent Memory Timeline

## Technical context

The authoritative `memories` table already stores project identity, temporal status, `valid_from`, `invalid_at`, `supersedes_id`, and stable IDs. Current public history paths are either lexical (`mem_recall temporal=history`) or anchored to a known record (`mem_get history=true` and `mem_project action=history`); none provides a project-wide chronological list. `mem_project` is therefore the existing workflow-level seam for a new read-only `timeline` action, preserving the exact six-tool registry.

The implementation crosses one coupled runtime contract and one distribution contract:

- Core records and query: `src/memory-core/contracts.ts` and `src/memory-core/service.ts`.
- MCP validation/rendering: `src/tools/index.ts`.
- Focused behavior tests: a new `tests/memory-core/timeline.test.ts` and `tests/tools/mcp.test.ts`.
- Canonical agent guidance: `plugin/skills/thoth-mem/SKILL.md`, synchronized by `scripts/sync-plugin-distribution.mjs` into the three `integrations/*/skills/thoth-mem/SKILL.md` copies and `plugin/distribution-lock.json`.
- Durable/runtime documentation and packaging assertions: `README.md`, `docs/agent/persistence-retrieval.md`, `docs/agent/surfaces.md`, `tests/integration/package.test.ts`, `tests/packaging/first-product.test.ts`, and, only if its canonical public assertions need the new semantic check, `tests/integration/public-plugin-package.test.ts`.

The timeline is a live, promoted-memory-only traversal. It does not add storage, mutate records, expose raw evidence, or merge summaries, observations, or session events. Input uses `action=timeline`, exact `project_key`, optional inclusive `since`/`until` ISO timestamps, optional opaque `cursor`, existing positive `limit` capped at 100, and existing `budget_chars`. Default order is newest semantic validity first.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the feature adds an action to `mem_project`; `ALL_TOOLS` remains the same six names.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — the authoritative SQLite `memories` table and structured filters provide the result with no optional projection, model, graph, vector, or network dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — timeline input/output is plain MCP and shared `MemoryService` behavior; host copies receive equivalent guidance rather than host-specific semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — entries are compact, budgeted, cursor-paged, and expanded only through `mem_get`.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — the new action and exclusions are declared explicitly; no alias, compatibility shim, or legacy `include_timeline` field is introduced.

## Design

### Public contract

`mem_project` accepts the additional action and timeline-only fields:

```json
{
  "action": "timeline",
  "project_key": "<verified opaque key>",
  "since": "<optional ISO-8601 instant>",
  "until": "<optional ISO-8601 instant>",
  "cursor": "<optional opaque continuation>",
  "limit": 20,
  "budget_chars": 4000
}
```

The structured data is:

```json
{
  "action": "timeline",
  "items": [
    {
      "id": "...",
      "title": "...",
      "snippet": "...",
      "kind": "decision",
      "topicKey": "...",
      "outcome": "succeeded",
      "status": "superseded",
      "validFrom": "...",
      "invalidAt": "...",
      "supersedesId": "..."
    }
  ],
  "nextCursor": "...",
  "hasMore": true
}
```

The envelope also reports `sources` as returned memory IDs, the effective requested/returned character budget, and `payload_truncated` when either the item limit or character budget leaves eligible rows. Unknown projects return an empty successful page. Zod parses the public shape; the service independently normalizes/validates bounds and cursor data so direct callers receive the same safety.

### Core timeline query

Add `TimelineInput`, `TimelineItem`, and `TimelineResult` application contracts. `MemoryService.timeline` resolves the exact project identity, normalizes `since` and `until`, rejects `since > until`, decodes an opaque versioned base64url cursor, and binds that cursor to the resolved project and normalized bounds.

The cursor carries only continuation state: schema version, project ID, normalized bounds, last `validFrom`, and last ID. It is not an authorization token. Malformed shapes, unknown versions, mismatched projects/bounds, invalid instants, or empty IDs fail with a bounded error.

The SQLite query uses keyset ordering:

```text
ORDER BY valid_from DESC, id ASC
```

After a cursor it selects rows with an older `valid_from`, or a greater ID at the same `valid_from`. Inclusive `since`/`until` filters apply to `valid_from`. It requests at most the normalized `limit + 1`; row hydration produces compact items, clips title/topic/snippet at Unicode code-point boundaries, and stops before exceeding the effective aggregate character budget. `hasMore` and `nextCursor` are based on the last emitted row and observed remaining eligibility, so a page never skips a row merely because the budget filled before the item limit. Tests will fix the exact compact caps while keeping full values available through `mem_get`.

The query intentionally includes all four promoted-memory statuses by default. No FTS table, score, insertion watermark, session sequence, observation state, or summary coverage participates in order.

### Skill and distribution guidance

Edit only `plugin/skills/thoth-mem/SKILL.md` as the canonical shared body. Add a concise chronological-exploration branch under the pre-action workflow:

- use compact lexical recall when the agent has a topic/query;
- use bounded `mem_project action=timeline` when the question is how project memory changed over time;
- follow cursors only as needed, treat historical entries as untrusted context, and expand selected stable IDs with `mem_get`;
- do not mistake the memory timeline for raw session/evidence history.

Do not add a new reference file: the action is small enough for the main routing cadence, and hiding it behind a conditional reference would reduce discoverability. Run `pnpm run integration:sync` to update all three host copies and the distribution lock rather than editing generated copies independently. Extend semantic tests to assert timeline guidance and byte-equivalent host copies while keeping the Skill concise and its existing discovery description, identity, privacy, save, and handoff rules intact.

### Ownership and sequencing

- **Core/MCP writer — fresh `deep` implementation subagent after implementation approval**: owns `src/memory-core/contracts.ts`, `src/memory-core/service.ts`, `src/tools/index.ts`, `tests/memory-core/timeline.test.ts`, and `tests/tools/mcp.test.ts`. Rationale: cursor validation, total ordering, budget accounting, and public schemas form one coupled correctness surface. Requirements/checks: FR-001–FR-004 and FR-007; focused unit tests and build diagnostics.
- **Skill distribution writer — fresh `quick` implementation subagent after implementation approval**: owns `plugin/skills/thoth-mem/SKILL.md`, synchronized integration copies/lock, and packaging/integration Skill assertions. Rationale: the plan fixes a narrow mechanical guidance update and the existing sync workflow, allowing safe isolation from runtime code. Requirements/checks: FR-005–FR-006; Skill validation, integration/package tests, and distribution verification.
- **Documentation/artifact writer — root**: owns `README.md`, routed docs, SDD artifacts, task state, and final reconciliation so the user's product intent remains canonical without overlapping either implementation lane.
- The two delegated writers have disjoint files and may work in the same ready wave once the action/output contract above is fixed. Root reconciles both lanes, completes documentation, updates task state, and runs repository-wide verification. Neither implementation writer performs final approval; a fresh Oracle owns mandatory final verification.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add `timeline` inside `mem_project`; retain six registered tools and read-only behavior. | `src/tools/index.ts`, `MemoryService.timeline` | MCP tool enumeration, schema, unknown-project, and no-write tests. |
| FR-002 | Use `validFrom DESC, id ASC` keyset pagination with inclusive normalized bounds and truthful continuation. | `src/memory-core/contracts.ts`, `src/memory-core/service.ts` | Tied timestamp, status, backdated import, bounds, limit, budget, and multi-page tests. |
| FR-003 | Return capped compact metadata/snippet only; delegate full expansion to existing `mem_get`. | Timeline record mapper, `createToolHandlers` | Forbidden-field assertions and selected-ID expansion test. |
| FR-004 | Bind versioned cursors to project and bounds; validate again in service and isolate SQL by resolved project ID. | Timeline cursor helpers in `src/memory-core/service.ts` | Tampered/malformed/mismatched cursor and cross-project tests with zero writes. |
| FR-005 | Add discoverable timeline routing to the canonical Skill and synchronize all host copies. | `plugin/skills/thoth-mem/SKILL.md`, `integrations/*/skills/thoth-mem/SKILL.md` | Canonical phrase/behavior assertions, byte parity, Skill validator. |
| FR-006 | Extend disposable packaging checks for timeline guidance and unchanged six-tool inventory. | `tests/integration/package.test.ts`, `tests/packaging/first-product.test.ts`, distribution lock | Focused integration tests, `integration:verify`, `integration:smoke`. |
| FR-007 | Leave recall, context, FTS, summaries, observations, lifecycle, and persistence unchanged. | No migration; existing services remain untouched except additive timeline method/handler branch. | Existing memory-core/tool/integration suites and full `pnpm test`. |

## Optional support artifacts

- `research.md`: Not needed; current repository analysis identified the authoritative tables, public handlers, Skill source, and sync path.
- `data-model.md`: Not needed; no table, relationship, migration, or persisted cursor is added.
- `contracts/`: Not needed; the complete additive MCP request/response and cursor semantics are specified in this plan.
- `quickstart.md`: Not needed; agent usage belongs in the canonical `thoth-mem` Skill and routed product documentation.

## Risks and migrations

- **Cursor correctness**: Mixed descending time and ascending ID comparisons are easy to invert. Mitigation: centralize the predicate and prove full duplicate-free traversal across tied timestamps. Rollback: remove the additive action/method/types; no data rollback exists because the feature is read-only.
- **Live backdated inserts**: A cursor is not a snapshot and a newly inserted older memory may appear during traversal. Mitigation: state live traversal semantics explicitly; callers restart for a fresh view. Snapshot isolation remains out of scope.
- **Oversized historical fields**: Existing rows can contain long Unicode titles/topic keys/content. Mitigation: compact at code-point boundaries, account serialized item characters, and leave full values behind `mem_get`.
- **Privacy/provenance leakage**: Joining evidence or returning `evidenceIds` would widen the contract. Mitigation: query `memories` only and assert forbidden record types/fields in MCP tests.
- **Skill drift**: Four maintained copies can diverge. Mitigation: edit the canonical plugin Skill, run the existing sync script, retain byte-parity tests, and refresh `plugin/distribution-lock.json`.
- **Legacy vocabulary regression**: `include_timeline` is explicitly rejected by current package tests. Mitigation: add only `mem_project action=timeline`; keep legacy field assertions intact.
- **Query performance**: The current compound index is not optimized for an all-status project-wide validity sort. Mitigation: keep the first implementation bounded and measure focused fixtures/`EXPLAIN`; do not create revision 10 or a new index without evidence. If later evidence warrants an index, treat it as a same-intent planned refinement with migration/backup review.
- **Migration/rollback**: No SQLite schema revision or durable-data migration is planned. Reverting code and resynchronizing the prior canonical Skill fully rolls back behavior; existing databases remain byte-compatible.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design changes one `mem_project` action enum/handler and explicitly verifies that all six and only six tools remain registered.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — keyset SQL over authoritative promoted memories is deterministic and offline; the design adds no optional or load-bearing projection.
- **P3 — Harness-Agnostic Memory Contract**: PASS — one service and MCP contract serves every host, and the canonical Skill is synchronized byte-for-byte across host bundles.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — aggregate character accounting, capped fields, limits, cursors, stable IDs, and selective `mem_get` expansion preserve progressive disclosure.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — request/response, live-cursor behavior, exclusions, no-migration rollback, and rejection of legacy `include_timeline` semantics are explicit.
