# Implementation Plan: Restore agent memory adoption

## Technical context

The current persistence and recovery implementation is healthy, but three model-facing discovery layers bias agents away from durable writes. `src/server.ts` publishes one recall-only instruction string that the host surfaces beside every tool; `src/tools/index.ts` registers every tool with only `thoth-mem <name>`; and the canonical packaged Skill delays save/handoff cues while placing the full advanced observation-review workflow on the ordinary path. The legacy product had balanced global save guidance, distinct tool descriptions, a more assertive Skill trigger, and scenario evals. Current distribution correctly keeps one Skill body, so this is a behavior/discovery change rather than a setup or packaging repair.

The implementation changes only discovery text, Skill progressive disclosure, packed reference inventory, and tests. It does not change the exact six tool names, Zod schemas, handlers, SQLite state, lifecycle adapters, identity mapping, observation authority, or host setup. The MCP public seam already exists in `tests/integration.test.ts`: `Client` connects through `InMemoryTransport`, reads `client.getInstructions()` and `client.listTools()`, then calls real tools. The installed-Skill seam reads canonical and shipped package files exactly as hosts do.

### Implementation ownership

- **Owner**: adaptive root.
- **Net-gain rationale**: server instructions, tool descriptions, Skill routing, conditional-reference inventory, synchronization, and regression tests form one ordered behavioral contract. Root already holds the legacy/current comparison and public SDK seam; splitting writers would create wording/inventory drift and duplicate contract reasoning.
- **Owned mutable surface**: `src/server.ts`, `src/tools/index.ts`, `plugin/skills/thoth-mem/`, `integrations/*/skills/thoth-mem/`, `integrations/inventory.json`, `src/integration/package-inventory.ts`, `scripts/sync-plugin-distribution.mjs`, focused tests, generated `plugin/distribution-lock.json`, and this change's artifacts.
- **Non-goals**: real host installation/restart, release publication, database/schema migration, tool/schema changes, lifecycle mutation, passive telemetry, and compatibility behavior.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design preserves exactly six workflow tools and changes only model-facing instructions/descriptions for those existing tools.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — no retrieval, projection, persistence, network, or model dependency changes; SQLite remains authoritative.
- **P3 — Harness-Agnostic Memory Contract**: PASS — server/tool guidance remains host-neutral and one Skill body is shared; host identity remains isolated in existing references.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — the compact → context → selected get funnel remains explicit and no response budget or retrieval default changes.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — legacy text is comparison evidence only; the implementation uses current contracts and restores no retired API, parameter, or fallback.

## Design

### Balanced MCP discovery

`src/server.ts` will replace the recall-only sentence with a concise host-neutral instruction block whose first clauses cover both bounded recall and deliberate durable persistence. It will name semantic boundaries—decisions, discoveries, failures, conventions, completed-change lessons, and continuation handoffs—then preserve verified identity, privacy/noise, and lifecycle boundaries. `Client.getInstructions()` provides the public verification seam.

`src/tools/index.ts` will define one typed `Record<MemoryToolName, string>` and pass the matching value to `server.tool`. Descriptions will stay concise and distinguish:

- `mem_save`: direct durable evidence/memory plus conditional observation candidate/review/promotion;
- `mem_recall`: compact or context search over current/history memory;
- `mem_context`: bounded handoff-first project/session continuity;
- `mem_get`: full expansion of one selected record and lineage;
- `mem_project`: bounded project briefing/history/summary/observation inspection;
- `mem_session`: verified root lifecycle and structured session-summary events only.

No description will imply a new operation or weaken closed schemas. `Client.listTools()` will verify names, descriptions, and unchanged input schemas through the SDK rather than an exported implementation constant.

### Skill discovery and common cadence

`plugin/skills/thoth-mem/SKILL.md` remains the canonical shared body. Its frontmatter will put `recall`, `save`, and `handoff` applicability before exclusions so truncated catalogs still expose the decisive trigger. The entrypoint will be shorter than the current 7,244-character baseline and organized around the ordinary decision path:

1. recall compactly before acting when prior work may change the task;
2. save a verified durable decision, root cause, discovery, convention, or completed-change lesson at the semantic boundary without waiting for an explicit “remember this” request;
3. before meaningful work ends, save one actionable handoff only when continuation state exists;
4. load exactly one host identity reference before session attribution and report only confirmed reads/writes;
5. exclude transient, speculative, canonical, private, delegated, user-forbidden, or duplicate content.

The direct `{ evidence, memory }` branch remains the simple path for explicit user authority and directly verified reusable outcomes. The entrypoint will not prescribe saving every turn and will not call `mem_session` merely because a response ends.

### Conditional observation review

The complete existing uncertain-claim candidate/review/promotion policy will move verbatim in substance to `references/observation-review.md`. `SKILL.md` will route to it only when a reusable claim lacks direct authority. The reference will retain support IDs, generator provenance, scope/coverage, root review identity, basis-specific support, immutable verdicts/corrections, explicit promotion, and trust boundaries.

The canonical reference lives at `plugin/skills/thoth-mem/references/observation-review.md`. `scripts/sync-plugin-distribution.mjs` copies it to all three integration Skill roots alongside the canonical body. `integrations/inventory.json`, `src/integration/package-inventory.ts`, and public distribution assets will include the reference; synchronization regenerates `plugin/distribution-lock.json`. Existing host-specific references retain their current ownership and content.

### TDD seams

The user-confirmation gate will cover these proposed public seams before any RED test is written:

- **MCP initialization/list-tools seam**: `createServer` + SDK `Client` + `InMemoryTransport`; assert server instructions, exact six names, six distinct descriptions, action cues, and unchanged callable behavior.
- **Installed Skill/package seam**: read the canonical and every shipped `SKILL.md`/conditional reference via package paths; assert early trigger terms, ordinary cadence, negative boundaries, conditional routing, exact body/reference ownership, and deterministic synchronization.
- **Packed distribution seam**: run existing integration verification/smoke and inspect inventories/lock through supported scripts; no real host home is touched.

TDD proceeds in vertical slices: first MCP discovery RED→GREEN, then Skill trigger/common path RED→GREEN, then conditional reference/inventory RED→GREEN. Static tests prove shipped contracts, not model compliance; SC-005 remains an outcome risk pending an authorized real-host evaluation.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 / SC-001 | Publish balanced server instructions and six typed distinct tool descriptions without changing registration names or schemas. | `src/server.ts`, `src/tools/index.ts` | SDK `Client.getInstructions()`, `Client.listTools()`, and existing calls in `tests/integration.test.ts` |
| FR-002 / SC-002 | Front-load recall/save/handoff and provide a concise three-moment cadence plus identity/privacy/confirmation/noise rules. | `plugin/skills/thoth-mem/SKILL.md`, synchronized copies | Installed Skill contract in packaging tests |
| FR-003 / SC-001 | Put durable write categories in always-visible server and `mem_save` metadata while retaining bounded recall and verified lifecycle descriptions. | `src/server.ts`, `src/tools/index.ts` | Exact literal/semantic assertions over public discovery output |
| FR-004 / SC-003 | Move advanced uncertain-claim policy to one conditionally loaded packaged reference without semantic loss. | `plugin/skills/thoth-mem/references/observation-review.md`, `integrations/*/skills/thoth-mem/references/` | Reference content/routing/inventory assertions |
| FR-005 / SC-002 / SC-003 | Extend deterministic sync and canonical inventories for the shared reference; preserve host identity reference ownership. | `scripts/sync-plugin-distribution.mjs`, `integrations/inventory.json`, `src/integration/package-inventory.ts`, `plugin/distribution-lock.json` | Sync twice, body/reference equality, inventory and packed verification |
| FR-006 / SC-004 / SC-005 | Add public-seam static regression tests now and retain explicit real-host behavioral outcome later. | `tests/integration.test.ts`, `tests/packaging/first-product.test.ts`, `tests/packaging/public-plugin-distribution.test.ts` | Focused Vitest; full verification; later 3-positive/2-negative host evaluation |

## Optional support artifacts

- `research.md`: Not needed; the current/legacy evidence, SDK seam, and existing distribution contracts are already verified.
- `data-model.md`: Not needed; no database, record, schema, or lifecycle model changes.
- `contracts/`: Not needed; MCP discovery output and installed Skill files are the directly testable contracts.
- `quickstart.md`: Not needed; no setup or operator command changes.

## Risks and migrations

- **Over-triggering and memory noise**: stronger cues could cause saves after every turn. Mitigation: name positive semantic boundaries and independent negative/user-forbidden/duplicate cases; keep one handoff conditional on future continuation value.
- **Instruction truncation**: a host may expose only the beginning of descriptions. Mitigation: put recall/save/handoff terms in the first sentence and keep server/tool descriptions short.
- **Advanced-policy semantic loss**: moving observation review could omit a safety invariant. Mitigation: preserve every current basis, support, scope, identity, correction, trust, and promotion rule in the conditional reference and assert its key contract phrases.
- **Reference packaging drift**: the Skill could link to a file absent from one host bundle. Mitigation: one canonical reference, deterministic copies, explicit inventory entries, distribution lock, packed verification, and path-existence tests.
- **Static-text overconfidence**: phrase tests cannot prove agent adoption. Mitigation: verify MCP metadata through SDK behavior, label real-host adoption SC-005 as residual risk, and do not claim it until the 3/3 positive and 2/2 negative evaluation is observed.
- **Test brittleness**: exact prose snapshots would resist harmless editing. Mitigation: assert distinct public purposes and independent behavioral invariants, using exact equality only for canonical distributed copies.
- **Migration**: none. No persisted data or host state changes.
- **Rollback**: revert source instructions/descriptions, Skill/reference/inventory changes, tests, and regenerated lock; no database or host-home rollback is required.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the mapped design keeps the exact six-tool array and changes only descriptions verified through list-tools.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — requirement mapping contains no core, projection, storage, model, or network mutation.
- **P3 — Harness-Agnostic Memory Contract**: PASS — one host-neutral body/reference is distributed to every host while existing identity references remain host-specific.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — server, tool, and Skill discovery all retain compact-first progressive recall and no output budgets change.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — implementation paths are current-only, no legacy runtime files are restored, and rollback is source-only.
