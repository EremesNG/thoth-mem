# Verification Report: Output Caps for getContext-backed Responses

## Round

round 2

## Completeness

- Compliance scenarios: 21 compliant / 21 total.
- Previous C1 is resolved: `mem_context` now applies `max_chars` to the final combined base context plus optional recall section via `selectedMaxChars`, `Store.getContext(...maxOutputChars)`, and final `trimToBudget(...)` unless sentinel `0` is selected.
- Tasks 2.3 and 3.3 are checked complete in `openspec/changes/output-caps-and-pruning/tasks.md`.
- Scope guard remains intact: compact six-tool registry is unchanged; excluded pruning/KEEP files had no diff paths in `src/tools/tracing.ts`, `src/http-server.ts`, `src/http-openapi.ts`, `src/sync/index.ts`, `dashboard/src/api/client.ts`, `src/server/zod-compat.js`, `src/store/schema.ts`, or `src/tools/index.ts`.

## Build and Test Evidence

- Fresh local: `pnpm test tests/tools/mem-context.test.ts` passed, 1 file / 11 tests.
- Fresh local: `pnpm test tests/config.test.ts tests/utils/content.test.ts tests/store/context.test.ts tests/tools/mem-project.test.ts tests/tools/mem-recall.test.ts` passed, 5 files / 59 tests.
- Fresh local: `pnpm test tests/http-server.test.ts tests/cli.test.ts` passed, 2 files / 55 tests.
- Fresh local: `pnpm exec tsc --noEmit` exited successfully.
- Root-provided post-C1 evidence: `pnpm run build` passed.
- Root-provided prior integration evidence: full `pnpm test` passed, 44 files / 461 tests.

## Compliance Matrix

| Domain | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| config | Environment override wins for output budget | Compliant | `THOTH_MAX_CONTEXT_CHARS` resolves before persisted/default in `src/config.ts`; covered by `tests/config.test.ts`. |
| config | Persisted value is used when environment is unset | Compliant | `PersistedConfig.maxContextChars` and `getConfig()` resolution are covered by `tests/config.test.ts`. |
| config | Built-in default applies when unset everywhere | Compliant | Default `maxContextChars` is `8000`; covered by `tests/config.test.ts`. |
| config | Per-call override supersedes resolved default without persisting | Compliant | `maxOutputChars` and `max_chars` override paths are covered by store/tool tests. |
| config | Sentinel disables output bound | Compliant | `0` uses unbounded paths in store/tool summary rendering; covered by config/store/tool tests. |
| config | Oversized save warns without truncation | Compliant | `validateContentLength` remains warn-only; covered by `tests/utils/content.test.ts`. |
| config | Input and output knobs are independent | Compliant | `maxContentLength` and `maxContextChars` remain separate; `mem_recall` independence covered by tests. |
| store | `getContext` output never exceeds budget | Compliant | `Store.getContext` applies preview accumulation and final `trimToBudget`; covered by `tests/store/context.test.ts`. |
| store | `getContext` budget defaults from config and is overridable | Compliant | Budget resolution uses per-call value then config; covered by `tests/store/context.test.ts`. |
| store | `getContext` unbounded sentinel disables enforcement | Compliant | `budget === 0` renders legacy full-content path; covered by tests. |
| store | Preview mode truncates long observation content | Compliant | `formatObservationMarkdown(..., { preview: true })` uses `truncateForPreview`; covered by `tests/utils/content.test.ts`. |
| store | Full mode remains available for explicit callers | Compliant | Default formatter behavior still emits full content; covered by tests. |
| store | Bounded render keeps structure and `mem_get` pointer | Compliant | Context sections, shown/omitted footer, and `mem_get(id=...)` pointer are covered by tests. |
| tools | Large memory store yields bounded context output | Compliant | `mem_context` final output is bounded, including optional recall output; covered by `tests/tools/mem-context.test.ts`. |
| tools | Large memory store yields bounded project summary output | Compliant | `formatProjectSummary` accounts for wrapper header and delegates to `Store.getContext`; covered by tool/HTTP tests. |
| tools | Preview-by-default then escalate to `mem_get` | Compliant | Shared store renderer previews observations and points to `mem_get`; covered by store/tool tests. |
| tools | Per-call budget override is honored | Compliant | `mem_context` and `mem_project action=summary` honor `max_chars`; regression covers `recall_query` append. |
| tools | Unbounded sentinel restores full output | Compliant | `max_chars: 0` restores full output for context/summary paths; covered by tool tests. |
| tools | HTTP and CLI summary inherit shared bound | Compliant | HTTP and CLI call shared render paths without per-surface caps; covered by `tests/http-server.test.ts` and `tests/cli.test.ts`. |
| tools | Compact MCP registry is exposed | Compliant | Registry remains the compact six-tool surface. |
| tools | Bounded-output change does not alter registry | Compliant | No tool was added, removed, or renamed. |

## Design Coherence

- The implementation matches the design's single shared enforcement point: `Store.getContext` resolves the budget once and MCP/HTTP/CLI summary surfaces inherit it.
- The final C1 remediation preserves the design while closing the gap: optional recall is still additive, but final returned `mem_context` text is bounded by the selected budget.
- Scope guard is coherent with proposal/design: pruning D-1/D-2/D-3 remains deferred, `observation_facts` and zod compat remain KEEP, and no compact-surface registry mutation occurred.

## Issues Found

### Critical

None.

### Warnings

None for verification. Advisory constitution suggestion is surfaced separately because artifacts reference constitution principles/P4/P1/P2/P5; this is report-only and does not affect the verdict.

## Verdict

pass
