# Implementation Plan: Restore V2 memory Skill semantic boundaries

## Technical context

Commit `ad01c03` replaced the former 175-line memory recipe with a six-line V2 placeholder. The new text retained the six-tool name and privacy warning but lost intent classification, root ownership, confirmation truth, and the pre-final semantic-boundary save decision. Four `SKILL.md` copies now exist: the shared public plugin copy plus one copy under each OpenCode, Codex, and Claude integration. Host references are already separate and correct; `scripts/sync-plugin-distribution.mjs` synchronizes those references into the public plugin but does not synchronize the Skill body. Existing tests prove file presence and reject retired assets, not the behavior of the Skill text.

The implementation is instruction-only plus deterministic distribution/test support. It changes no MCP schema, SQLite state, runtime lifecycle operation, setup scope, or host identity algorithm. The public seam is the installed Skill content and the integration synchronization command. TDD will first make the missing instruction contract fail against the current Skill, then converge the canonical body and all destinations.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the change documents the existing six tools and neither registers nor removes an MCP operation.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — the recipe keeps bounded SQLite-first recall and adds no retrieval lane or load-bearing projection.
- **P3 — Harness-Agnostic Memory Contract**: PASS — one shared behavioral recipe maps only identity discovery to host-specific references and preserves the host-neutral V2 tool contract.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — compact → context → selected get remains the only recall funnel and the Skill itself stays intentionally concise.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — the master Skill is evidence, not a compatibility target; only V2-compatible behavior is restored and no legacy action, parameter, or fallback is accepted.

## Design

### Implementation ownership

- **Owner**: adaptive root.
- **Net-gain rationale**: the Skill wording, synchronization direction, tests, and OpenSpec deltas form one small coupled contract. Root already holds the master/current comparison and V2 tool schemas; delegation would add rediscovery and merge coordination without isolating a meaningful mutable surface.
- **Owned surface**: `plugin/skills/thoth-mem/SKILL.md`, the three `integrations/*/skills/thoth-mem/SKILL.md` copies, `scripts/sync-plugin-distribution.mjs`, focused integration/package tests, and this change's artifacts.
- **Non-goals**: host installation, host-home mutation, real-host restart, public release, runtime/schema/tool changes, and restoration of retired behavior.

### Canonical Skill and progressive disclosure

`plugin/skills/thoth-mem/SKILL.md` becomes the canonical shared instruction body because it is the Skill consumed by the common public Codex/Claude plugin root. The body remains host-neutral and tells callers to load exactly the one available `references/<active-host>.md` when session attribution or lifecycle ownership matters. OpenCode, Codex, and Claude integration copies become deterministic synchronized destinations with the same bytes; their directories retain only the applicable host reference.

The Skill description explicitly triggers on resume/prior work, durable decisions or failures, semantic completion, handoff, compaction/finalization, and explicit save/remember requests. The body remains substantially smaller than the master recipe and contains five focused sections:

1. classify recall, durable save, project briefing/history, or lifecycle intent;
2. recover context through compact → context → selected get;
3. resolve host identity before session-attributed writes and preserve root/delegated ownership;
4. decide before the final response whether a durable semantic boundary requires one `mem_save` handoff;
5. report only confirmed reads/writes and their project/session bounds.

Semantic boundaries include user-approved architecture/product direction, verified root causes or failures, reusable conventions, completed changes, and continuation-critical handoffs. Noise exclusions include transient status, speculation, raw logs, full transcripts, secrets/private blocks, generated prompts, assistant/tool traffic, and facts already fully represented by canonical artifacts. A meaningful boundary uses `mem_save` with `evidence.kind="handoff"`, `memory.kind="handoff"`, compact evidence plus a promoted memory, a stable `topic_key`, and a stable `event_key` when replay is possible. It does not call `mem_session(finalize)` merely because one response is ending.

### Deterministic synchronization

`scripts/sync-plugin-distribution.mjs` copies the canonical public Skill body to:

- `integrations/opencode/skills/thoth-mem/SKILL.md`
- `integrations/codex/skills/thoth-mem/SKILL.md`
- `integrations/claude-code/skills/thoth-mem/SKILL.md`

The existing reference direction remains intentionally narrower than the Skill-body direction: the OpenCode reference stays in the native OpenCode integration, while the canonical Codex and Claude references flow from their integration directories into the shared public Codex/Claude plugin. Distribution-lock generation runs after the canonical body has been simplified and all body/reference destinations have converged. Repeated synchronization writes the same bytes and therefore leaves no Git diff.

### TDD seams

The user-confirmed public seams are:

- **Installed Skill contract**: read each shipped `SKILL.md` exactly as a host would and assert independent literal/regex invariants for trigger description, recall funnel, semantic-boundary decision, durable handoff contents, privacy/noise filtering, identity pairing, confirmation truth, and final reporting.
- **Distribution convergence**: run the supported synchronization command in the repository fixture, then assert all four Skill bodies are byte-identical and the existing host references remain present and byte-identical to their canonical sources.
- **V2 boundary**: assert the restored text contains all six current tool names while excluding known V1 action/parameter examples and retired feature vocabulary.

The RED slice adds the behavioral Skill assertions before editing any Skill. GREEN introduces only the minimum V2 recipe and synchronization copy operation needed to pass. No model compliance is inferred from static text; SC-005 remains an outcome gate for later authorized real-host use.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Keep one host-neutral body and load exactly one active-host identity reference before session attribution. | `plugin/skills/thoth-mem/SKILL.md`, `integrations/*/skills/thoth-mem/references/*.md` | Installed Skill contract; existing identity-reference tests |
| FR-002 | Add a pre-final semantic-boundary decision and one confirmed V2 `mem_save` using `evidence.kind="handoff"` plus `memory.kind="handoff"` for reusable completed state. | `plugin/skills/thoth-mem/SKILL.md` | RED/GREEN Skill behavior assertions |
| FR-003 | Name only the exact six V2 tools; use `mem_save` for handoffs and reserve `mem_session` for actual lifecycle operations. | `plugin/skills/thoth-mem/SKILL.md` | V2 boundary assertions; six-tool MCP suite |
| FR-004 | Copy the canonical public Skill body to all three integration roots, retain the native OpenCode reference, copy only Codex/Claude references into the shared public plugin, then hash distribution assets. | `scripts/sync-plugin-distribution.mjs`, distributed Skill copies | Sync command followed by body/reference equality and second-run diff checks |
| FR-005 | Protect each required instruction independently instead of snapshotting prose. | `tests/integration/package-v2.test.ts`, `tests/packaging/public-plugin-distribution.test.ts` | Focused Vitest RED/GREEN |
| FR-006 | Reject retired feature vocabulary and V1 invocation examples in every shipped Skill. | Distributed Skill files and focused tests | Existing/new exclusion assertions |
| FR-007 | Require final responses to disclose confirmed record IDs and project/session bounds or explicit degradation. | Canonical and distributed Skill files | Installed Skill contract assertion |

## Optional support artifacts

- `research.md`: Not needed; the exact regression is established by `git show master:...` and current files.
- `data-model.md`: Not needed; persistence schema and tool contracts do not change.
- `contracts/`: Not needed; `spec.md` plus the installed Skill content are the contract.
- `quickstart.md`: Not needed; no user-facing setup command changes.

## Risks and migrations

- **Instruction bloat**: restoring master wholesale would raise token cost and reintroduce invalid behavior. Mitigation: retain only the five V2 workflow sections and review the final diff with `simplify`.
- **False persistence pressure**: an overbroad trigger could save every turn. Mitigation: enumerate durable boundaries and negative/noise cases, and require one concise handoff only when future sessions benefit.
- **Wrong lifecycle operation**: the old `summary` action no longer exists. Mitigation: use `mem_save(kind=handoff)` for semantic completion and reserve current `mem_session` operations for verified native events.
- **Identity fabrication**: a save may be incorrectly session-attributed. Mitigation: load one active-host reference and require `root_session_key` plus `harness` together; allow explicit project-only save without claiming session continuity.
- **Bundle drift**: four copies can diverge. Mitigation: one canonical body, deterministic copy in `integration:sync`, byte-equality tests, and existing distribution lock.
- **Model compliance remains unobserved**: static tests prove the shipped instruction, not that a model follows it. Mitigation: keep SC-005 as an explicit outcome risk until authorized install/restart testing.
- **Migration/rollback**: no data migration exists. Rollback is a source-only revert of Skill text, synchronization logic, tests, and generated distribution hashes; no database or host-home state is touched.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design protects the exact six names in tests and routes semantic completion through existing `mem_save`.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — no projection is introduced and optional retrieval behavior is absent from the recipe.
- **P3 — Harness-Agnostic Memory Contract**: PASS — all hosts receive byte-identical behavior while identity remains progressively loaded from one host-specific reference.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — the design preserves progressive recall and controls Skill size by excluding master-only navigation and administration material.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — tests explicitly reject V1 actions/parameters and retired vocabulary; no compatibility shim or dormant path is added.
