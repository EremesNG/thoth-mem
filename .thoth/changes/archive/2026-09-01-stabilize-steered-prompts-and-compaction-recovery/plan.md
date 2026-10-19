# Implementation Plan: Stabilize Steered Prompt Capture and Compaction Recovery

## Technical context

`normalizeNativePayload()` currently gives Codex `UserPromptSubmit` events a key based on `turn_id` whenever that field exists, so two different steered prompts in one active turn reach `MemoryService.lifecycle()` with one key and different payload hashes. The Claude branch instead requires a non-standard `event_id`; official Claude Code prompt-hook input has no such field. OpenCode's native `chat.message` hook already owns a stable `output.message.id` per admitted message.

`MemoryService.lifecycle()` uses the same project briefing for ordinary `recover` and `guide_post_compact`. `MemoryService.context()` considers one current summary from the exact session first, then unconditionally fills the remaining budget with current project memories. The affected real session had no summary, so a zero-lexical-score LongMemEval handoff from another conversation became the primary continuation item. The implementation must preserve the current dirty worktree's canonical-project-identity changes in these same files, must not edit generated `dist/`, and must keep the exact six-tool MCP surface and schema revision unchanged.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change modifies native normalization and internal lifecycle selection only; no MCP tool is added, removed, or renamed.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Event fingerprints and summary-only compaction selection are deterministic, local, SQLite-backed, and require no optional projection, model, or network service.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Harness-specific identifiers remain at adapter/plugin boundaries and all three hosts continue to call the same host-neutral lifecycle operations.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Post-compaction selection becomes narrower while the existing renderer, 1,000-code-point host cap, progressive IDs, and explicit project context budgets remain intact.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The plan targets the current native contracts directly, removes the synthetic Claude field assumption, and adds no shim, dual read/write, schema migration, or destructive data handling.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Bind Codex capture identity to `turn_id` plus the already-sanitized prompt fingerprint. Bind Claude capture identity to documented session/event fields plus the sanitized prompt fingerprint. Preserve deterministic equality for an exact retry and keep privacy filtering before hashing. | `src/integration/adapters/index.ts`; `normalizeNativePayload()` and a small shared deterministic key helper | `tests/integration/adapters.test.ts`; `tests/integration/lifecycle.test.ts` |
| FR-002 | Stop requiring Claude `event_id`; use official hook fields. Keep OpenCode's `message:${output.message.id}` as authoritative per-message identity and add an explicit multi-message regression without altering its runtime path. | `src/integration/adapters/index.ts`; `src/integration/opencode/plugin.ts` (verification/read-only unless a discovered defect requires a minimal edit); native hook payload fixtures | `tests/integration/adapters.test.ts`; `tests/integration/opencode-native-plugin.test.ts`; `tests/integration/public-plugin-runner.test.ts` |
| FR-003 | Add an internal context-selection policy that can exclude project memories while retaining exact-session summary selection and accurate budget/source accounting. `guide_post_compact` uses summary-only selection; ordinary `recover` keeps the default project-memory policy. Rendering and capability truth remain centralized in `MemoryService.lifecycle()`. | `src/memory-core/service.ts`; internal `context()` input/selection policy; lifecycle recovery closure | `tests/integration/lifecycle.test.ts`; nearest `tests/memory-core/context.test.ts` regression if needed |
| FR-004 | Leave public `mem_context`, project briefing, and ordinary recovery call sites on the default project-memory policy. Do not change `ContextResult`, MCP schemas, FTS, ranking, continuation item shapes, or renderer caps. | `src/memory-core/service.ts`; `src/tools/index.ts` unchanged contract; `src/memory-core/continuation.ts` unchanged unless a test exposes a truthful-cap defect | Existing context, continuation, MCP, benchmark, and packaged-runner suites plus one ordinary-recovery assertion |

### Event identity rules

1. Sanitize capture content exactly once before constructing any content-derived key or lifecycle payload.
2. OpenCode root-user capture continues to use the immutable native message ID supplied by the admitted message.
3. Codex root-user capture hashes the verified root session, event/operation, `turn_id` when present, and sanitized prompt. Different prompt text inside one `turn_id` therefore yields a different key; an exact repeat yields the same key.
4. Claude root-user capture hashes the verified root session, event/operation, and sanitized prompt using only documented hook fields. A supplied extra `event_id` is not required for correctness and does not define the contract.
5. Non-prompt lifecycle events retain their existing stable event-specific fields and degraded-identity behavior; this change does not invent an occurrence counter or parse transcripts.

### Compaction recovery rules

1. `guide_post_compact` first enforces the existing confirmed compacted-session state gate.
2. Its recovery selector may return only the newest current supported summary for the exact resolved session `(project, harness, rootSessionKey)`.
3. It never appends promoted project memories, even if the summary leaves budget unused.
4. If no eligible summary fits, `renderContinuation()` receives an empty item list, producing verified identity only, empty selected IDs, and `contextDelivered=false`.
5. `recover`, explicit `mem_context`, and project briefing retain the existing summary-first plus project-memory fallback.

### Implementation ownership

- **Owner**: root.
- **Net-gain rationale**: The implementation is a short ordered chain across two tightly coupled functions already loaded by root, and the target files contain substantial uncommitted canonical-project-identity work that must be preserved. A second writer would add merge and rediscovery risk without an independent mutable surface.
- **Mutable surface**: `src/integration/adapters/index.ts`, `src/memory-core/service.ts`, the nearest integration tests, and only durable task-routed documentation required by the finished behavior. OpenCode runtime code remains unchanged unless its public regression fails.
- **Requirements/checks**: FR-001 through FR-004; red-first adapter/lifecycle/plugin tests; focused Vitest lanes; build; broader repository verification defined in `docs/agent/testing.md`; fresh read-only Oracle final verification.

### Implementation entry record

- **Decided owner**: root retains the single writer role; no native specialist assignment or dispatch group is active.
- **Task shape and net gain**: T001 through T013 form one sequential vertical red/green/regression/simplify chain. Each behavior change has its own tracer test immediately followed by the smallest green implementation; the adapter and lifecycle behaviors share idempotency semantics, the integration fixtures overlap, and the existing dirty canonical-project-identity changes occupy the same production and test files. Root continuity therefore has lower rediscovery and reconciliation cost than delegation, while no disjoint `[P]` lane creates a demonstrated parallelism gain.
- **Authorized mutable path union**:
  - `tests/integration/adapters.test.ts`
  - `tests/integration/public-plugin-runner.test.ts`
  - `tests/integration/lifecycle.test.ts`
  - `tests/integration/opencode-native-plugin.test.ts`
  - `src/integration/adapters/index.ts`
  - `src/memory-core/service.ts`
  - `benchmarks/run.mjs`
  - `docs/agent/native-lifecycle.md`
  - `docs/agent/persistence-retrieval.md`
- **Verification-only paths**: `src/integration/opencode/plugin.ts`, `src/tools/index.ts`, `src/memory-core/continuation.ts`, and `package.json` remain read-only unless red evidence preserves the accepted intent and root updates/revalidates the artifact before expanding the mutable union. `benchmarks/results/fixture-report.json` is command-generated benchmark evidence, not a hand-edited implementation surface.
- **Accepted scope**: FR-001 through FR-004 and buildable SC-001 through SC-005 exactly as specified. Root owns task-state transitions; selected tasks move from `[ ]` to `[~]` only when implementation is authorized and to `[x]` only after task-specific evidence is checked.
- **Non-goals**: no transcript parsing, generated summaries, embeddings, semantic relevance model, schema revision, data rewrite, new MCP tool, recall-ranking change, generated `dist/` edit, real-host installation/restart, or paid Claude certification.
- **Focused verification commands**:
  - `pnpm exec vitest run tests/integration/adapters.test.ts tests/integration/opencode-native-plugin.test.ts tests/integration/public-plugin-runner.test.ts tests/integration/lifecycle.test.ts --config vitest.integration.config.ts`
  - `pnpm exec vitest run tests/memory-core/context.test.ts tests/memory-core/continuation.test.ts tests/tools/mcp.test.ts --config vitest.unit.config.ts`
  - `pnpm run build`
- **Broad verification commands**: `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`, `pnpm run benchmark:fixture`, `pnpm run prepublishOnly`, and `git diff --check`.
- **Independent approval boundary**: after root implementation and simplification, a fresh read-only Oracle must verify the unchanged candidate; the implementation writer never supplies the final PASS.

## Optional support artifacts

- `research.md`: Not needed; the Full explore result, official host documentation, current canonical specs, and concrete reproduction already resolve the design uncertainty.
- `data-model.md`: Not needed; no table, projection, persistence shape, or migration changes.
- `contracts/`: Not needed; the public lifecycle/MCP envelopes stay unchanged and the new selection policy is internal.
- `quickstart.md`: Not needed; this is a runtime correctness fix with no new operator workflow.

## Risks and migrations

- **Identical Claude prompts**: Without a native per-submission ID, a byte-identical sanitized prompt in the same session is indistinguishable from a retry and is deduplicated. Mitigation: document and test this explicit limit; never invent a counter that would make retries non-idempotent.
- **Privacy-key drift**: Hashing raw content would leak distinctions that persistence later removes. Mitigation: derive the key from the same sanitized bounded content passed to lifecycle and test credential/private-block variants.
- **Over-scoping recovery**: Applying session-only behavior to all context would regress project memory. Mitigation: make summary-only selection an explicit internal policy used only by `guide_post_compact`, with normal recovery/MCP regression tests.
- **Budget telemetry drift**: Filtering after project context selection would report irrelevant source/evidence measurements. Mitigation: prevent the project-memory query under summary-only policy rather than dropping items after selection.
- **Dirty overlapping files**: Existing canonical project identity work touches adapters, service, docs, runner, and tests. Mitigation: patch only read current content, inspect focused diffs, preserve unrelated hunks, and never regenerate or reset the worktree.
- **Packaging drift**: Some older packed fixtures still supply an extra `event_id`. Mitigation: the public-runner regression uses the official shape without that field, normalization ignores the extra field when present, and integration verification/smoke exercises both paths without touching real host homes.
- **Verification convergence**: The first full-suite run exposed that the fixture benchmark still counted project-handoff delivery after a summary-less compaction as success. The accepted intent required safe abstention, so `benchmarks/run.mjs` now counts confirmed identity-only recovery with empty selected records and sources as the successful post-compaction outcome; the focused benchmark and the full suite then passed.
- **Migration**: None. No schema, data rewrite, setup, or host installation is authorized or required.
- **Rollback**: Revert only this change's source/test/doc hunks and SDD artifacts; existing databases and unrelated dirty work remain valid because no persistent format changes.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped files leave the six MCP registrations and schemas untouched.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Both event fingerprinting and session-summary-only selection have deterministic inputs and explicit abstention without optional lanes.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The design gives each adapter a native identity rule but converges on unchanged `capture_root`, `recover`, and `guide_post_compact` operations in the shared service.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The existing bounded renderer remains authoritative, project-wide progressive retrieval is preserved, and compaction can only reduce irrelevant payload.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The design replaces an unsupported Claude assumption in the current contract and introduces no compatibility machinery, destructive delta, or hidden migration.
