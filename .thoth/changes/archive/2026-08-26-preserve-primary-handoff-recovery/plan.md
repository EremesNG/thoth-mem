# Implementation Plan: Preserve primary handoff recovery

## Technical context

`MemoryService.context` already returns current memories in deterministic priority order with handoffs first and newest first. `renderContinuation` then selects at most three items under `MAX_HOST_OUTPUT_CODE_POINTS = 1_000`, reserves only a 120-code-point minimum for every selected item, and distributes remaining content in selection order. In a real OpenCode restart, fixed metadata for two secondary memories consumed enough of the shared cap that an otherwise individually fitting primary handoff was truncated. The change is a bounded correction to the shared renderer and its behavioral tests; it does not alter SQLite, MCP schemas, adapters, setup, or public tool count.

Implementation ownership remains with the root agent because the renderer and its focused tests form one small ordered reasoning chain, the relevant context is already loaded, and delegation would add rediscovery and coordination cost without creating a separate mutable surface. Independent Oracle instances retain plan-review and final-verification ownership.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The exact six tools and their schemas remain unchanged.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Selection remains deterministic, SQLite-first, and independent of every optional projection or model.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The correction is confined to the shared host-neutral continuation renderer; adapters continue consuming one lifecycle envelope.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The 1,000-code-point cap, progressive retrieval funnel, content measurements, and explicit truncation remain mandatory.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — No compatibility shim, legacy alias, schema migration, or hidden public-contract change is introduced.

## Design

The renderer will derive safe candidates once, identify the first eligible `handoff` in input order as the primary handoff, and determine whether that candidate's full sanitized content fits with the fixed recovery envelope, its title, and complete memory ID. When it fits, the primary candidate's required content floor becomes its full content length and it is considered before all secondary candidates. Secondary candidates retain the existing useful-content floor and may enter only when their fixed metadata plus floor fit the remaining budget. The existing allocation pass may grant unused budget to selected items, but it can no longer reduce the reserved primary handoff.

When the primary handoff cannot fit alone, its floor remains the existing bounded minimum and current explicit ellipsis behavior is preserved. When no handoff exists, selection follows the current input order and useful-content policy. Sanitization, metadata-starvation checks, maximum item count, measurements, trust delimiters, evidence withholding, and complete memory references remain in the same renderer.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Promote the first eligible handoff to a full-content reservation only when it fits alone inside the existing envelope and cap. | `src/memory-core/continuation.ts` / `renderContinuation` | `tests/memory-core/continuation.test.ts` public renderer output |
| FR-002 | Admit secondary candidates against the remaining budget using the existing minimum useful-content floor and maximum of three items. | `src/memory-core/continuation.ts` | Competing-memory continuation fixture and deterministic replay |
| FR-003 | Leave sanitization, code-point measurement, fixed metadata, source IDs, evidence withholding, trust boundaries, and cap constants unchanged. | `src/memory-core/continuation.ts` | Existing continuation, lifecycle, privacy, poisoning, and budget tests |
| FR-004 | Preserve current truncation for a handoff that cannot fit alone and report measurements from the actual rendered block. | `src/memory-core/continuation.ts` | Existing oversized-content fixture plus an explicit oversized primary handoff assertion |
| FR-005 | Verify the shared lifecycle result contains the complete hidden action, then require fresh Codex and OpenCode sessions with zero tool calls or tool parts for outcome PASS. | `tests/integration/lifecycle.test.ts`, real-host smoke evidence | Lifecycle integration fixture; Codex task and OpenCode SQLite session inspection |

## Optional support artifacts

- `research.md`: Not needed; the real-host artifact and traced renderer allocation already establish the root cause.
- `data-model.md`: Not needed; persistence schema and record taxonomy do not change.
- `contracts/`: Not needed; this restores existing canonical retrieval and harness-integration requirements without changing public schemas.
- `quickstart.md`: Not needed; installation and smoke commands remain unchanged.

## Risks and migrations

- A complete primary handoff may reduce or eliminate secondary memories in the automatic capsule. This is intentional because continuation actionability outranks optional background guidance; tests will assert the unchanged cap and useful-content policy.
- Reordering an eligible handoff ahead of unsorted input could expose caller inconsistency. The shared canonical selector already orders handoffs first, and the renderer-level guard makes the invariant host-neutral and deterministic.
- An oversized primary handoff remains truncated. Verification will ensure the ellipsis and complete memory ID remain truthful rather than claiming completeness.
- No database, provider configuration, receipt, or public-schema migration exists. Rollback is the isolated renderer allocation change plus its new tests.
- Final real-host evidence requires rebuilding the local bundles, restarting Codex and OpenCode, and running fresh no-tools sessions in both hosts; lack of either user-operated smoke leaves SC-004 as residual `RISK`, not a fabricated PASS.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design changes no MCP registration, name, argument, or response envelope.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The algorithm uses only ordered SQLite-derived candidates and deterministic code-point arithmetic.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One shared renderer establishes the guarantee for OpenCode, Codex, Claude, MCP briefing, and lifecycle consumers without adapter forks.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — A fitting actionable handoff receives budget priority while total output remains capped at 1,000 code points and oversized data remains explicitly truncated.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The design contains no compatibility path or migration and directly repairs the active product contract.
