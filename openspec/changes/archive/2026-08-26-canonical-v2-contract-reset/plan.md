# Implementation Plan: Canonical product contract reset

## Technical context

The executable package already implements the intended compact product, but the active contract is inverted: `openspec/specs` contains 18 capabilities and more than 11,000 lines accumulated from the retired implementation, while the current source has no dashboard, HTTP server, graph engine, semantic indexer, sync subsystem, embedding runtime, or LLM hot path. The truthful runtime consists of `src/memory-core/`, an exact six-tool MCP server, scoped setup/import/lifecycle CLI operations, one native OpenCode adapter, repository-distributed Codex and Claude bundles, and a contract-only benchmark fixture.

The same replacement architecture is still named V2 in public envelopes, CLI commands, default database and receipt filenames, source and test filenames, Skills, documentation, package verifiers, and canonical requirements. The user explicitly selected a complete new-base normalization: remove that transitional generation name from product surfaces and internal organization while retaining only numeric version fields that distinguish actual machine formats or SQLite migration revisions. Backward-compatible aliases are out of scope.

Implementation remains root-owned. One ordered writer has a net gain because the canonical rewrite, CLI/envelope rename, runner synchronization, test renames, and generated bundle verification all share the same breaking contract and must change atomically; splitting them would create overlapping imports, fixtures, and distribution assets. The mutable surface is limited to active OpenSpec/config, current source/tests/docs/Skills/integrations/package verification, and required file renames. Archived OpenSpec changes, generated dependencies, publication, and real user host state remain untouched. Fresh Oracle instances own plan review and final verification.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change preserves exactly the six named tools and changes only their generation-neutral descriptions and envelope namespace.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The canonical reset makes SQLite/FTS5 the only active baseline and removes affirmative vector, graph, reranker, and LLM requirements rather than promoting an optional lane.
- **P3 — Harness-Agnostic Memory Contract**: PASS — All three native hosts continue through one renamed host-neutral lifecycle and the same ledger/tool schemas; no host-specific memory behavior enters the core.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Compact/context/get escalation, deterministic budgets, attribution, and payload metadata remain canonical and behaviorally unchanged.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The specification enumerates the breaking names, rejects aliases and dual paths, preserves legacy source data, and leaves local installation/data adoption as an explicit operator action.

## Design

### Canonical capability rebaseline

Replace the active specification tree atomically with eight concise capabilities:

- `cli`: managed setup/plan/receipts/rollback plus `mcp`, internal `lifecycle`, and one-way `import-legacy` operations;
- `config`: deterministic data-directory/provider resolution, strict validation, and `memory.sqlite` as the default current database;
- `store`: SQLite authority, immutable evidence, promoted temporal memory, canonical identity/taxonomy, ordered migrations, FTS atomicity, and non-destructive legacy import;
- `retrieval`: FTS5/BM25 plus structured lookup, immediate visibility, progressive bounded recall, current/history semantics, attribution, telemetry, and truthful optional-projection state;
- `tools`: exact six-tool registry, closed unversioned envelopes, bounded errors, progressive retrieval actions, project briefing/history, and root lifecycle operations;
- `harness-integration`: host-neutral lifecycle, verified root identity, privacy-safe capture, recovery/compaction/finalization, graceful degradation, and synchronized Skills for OpenCode, Codex, and Claude;
- `packaging`: public/local provenance, Bun-to-literal-Node separation, marketplace/manager layouts, exact inventory, setup ownership, and packed verification;
- `evals`: fixture-only contract status, equal-budget external protocol, metric semantics, resource/token reporting, and fail-closed optional-module promotion.

Delete `dashboard-control-room`, `dashboard-design-system`, `dashboard-memory-navigation`, `dashboard`, `http-api`, `indexing`, `knowledge-graph`, `observability`, `sync`, and `visualization-api`. Optional projection rules belong in `store`, `retrieval`, and `evals`; there is no active indexer capability to preserve. Update `openspec/config.yaml` so its context names the actual Node 22/TypeScript/SQLite memory-core architecture and verified scripts.

A dedicated baseline test will assert the exact eight-directory inventory, required current requirement titles, forbidden retired titles/surfaces, and active-context truth. This makes the destructive reset reproducible instead of relying on manual prose review.

### Product-generation name removal

The breaking transition is direct:

| Transitional surface | Current base |
| --- | --- |
| `lifecycle-v2` | `lifecycle` |
| `import-v2` | `import-legacy` |
| `memory-v2.sqlite` | `memory.sqlite` |
| `.thoth-mem-managed-v2.json` | `.thoth-mem-managed.json` |
| `thoth-mem.mcp.v2.<tool>` | `thoth-mem.mcp.<tool>` |
| `thoth-mem.lifecycle.v2` | `thoth-mem.lifecycle` |
| `thoth-mem.import.v2` | `thoth-mem.import` |
| `thoth-mem-config-v2` | `thoth-mem-config` |
| `src/integration/adapters/v2.ts` | `src/integration/adapters/index.ts` |
| `src/integration/core/lifecycle-v2.ts` | `src/integration/core/lifecycle.ts` |
| V2-named test files and exported types | generation-neutral names |

`src/cli.ts`, `src/server.ts`, and `src/tools/index.ts` own the public command and MCP boundary. `src/integration/` owns the shared lifecycle rename. OpenCode's Bun adapter continues to spawn literal Node with the package-relative entry; Codex, Claude, shared, and public runners consume the same renamed command/envelope. Setup manifests and receipts use the new current name and no fallback reads the old receipt.

The old commands and namespaces are not aliases. Tests assert explicit rejection. Numeric `schemaVersion: 2`, the SQLite revision sequence, benchmark/report version fields, and the `legacy-v1.ts` source-format label remain because they identify real formats rather than the current product generation.

### Existing data and installation boundary

Changing the default filename deliberately does not auto-adopt `memory-v2.sqlite`. A clean runtime creates or opens `memory.sqlite`; it will not guess, move, copy, or dual-read an older file. The source file remains untouched. Before a real-host restart, an operator who wants the current local ledger must explicitly close host processes, create a recoverable backup, and move or copy the exact selected database into the new filename. That stateful user-home operation is not performed by repository tests or this implementation.

Managed setup similarly writes only the new receipt name. Existing old receipts remain inert residue until the operator removes them or performs a clean reinstall. Packed and disposable-home verification proves the new topology without editing real Codex, OpenCode, or Claude state.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Replace accumulated specs and stale OpenSpec context with eight current capabilities. | `openspec/specs`, `openspec/config.yaml` | Exact inventory and required-title assertions in the canonical-baseline test. |
| FR-002 | Delete ten retired capability directories and prohibit affirmative retired surfaces. | `openspec/specs` | Forbidden directory/title/term assertions plus Oracle runtime-to-contract audit. |
| FR-003 | Rename MCP envelopes and contract types without aliases. | `src/tools/index.ts`, `src/server.ts` | Six-tool focused tests accept only `thoth-mem.mcp.*`. |
| FR-004 | Rename shared lifecycle command, module, and envelope across all adapters/runners. | `src/integration`, `integrations`, `plugin/runners/public-runner.mjs` | Lifecycle, OpenCode Bun, public runner, and packed-host tests. |
| FR-005 | Rename CLI help/dispatch and legacy importer command. | `src/cli.ts` | CLI tests pass for `import-legacy` and reject `import-v2`/`lifecycle-v2`. |
| FR-006 | Use `memory.sqlite` while preserving numeric migrations and fail-closed legacy handling. | `src/config/runtime.ts`, `src/server.ts`, `src/cli.ts`, `src/memory-core/sqlite` | Runtime, ledger, migration, and importer tests. |
| FR-007 | Rename managed receipts, runners, Skills, and distribution assertions coherently. | `integrations`, `plugin`, `scripts` | Integration inventory, sync, packed plugin, and public marketplace smoke. |
| FR-008 | Preserve exact registry while making descriptions/envelopes generation-neutral. | `src/tools/index.ts` | Registry length/name snapshot and handler response assertions. |
| FR-009 | Synchronize one generation-neutral Skill and host references across every distribution. | `plugin/skills/thoth-mem`, `integrations` | Distribution hash/inventory verification and package tests. |
| FR-010 | Retain numeric technical discriminators and remove product-generation literals from owned active surfaces. | `src`, `tests`, `docs`, `README.md`, `config.schema.json` | Allowlisted residue scan, migration/manifest/report tests, and full build. |

## Optional support artifacts

- `research.md`: Not needed; the target architecture, removed surfaces, and reference boundaries were already approved and persisted in memory `8bfb6f3b-3ed4-538e-a41f-542ac429e9bb`.
- `data-model.md`: Not needed; the data model and SQLite revisions do not change, only the current default filename and generation-neutral terminology do.
- `contracts/`: Not needed; the complete breaking name map is contained in this plan and will be enforced directly by existing/focused tests.
- `quickstart.md`: Not needed; README owns the small current command surface and will be updated with the explicit data-adoption warning.

## Risks and migrations

- **Existing memory appears empty after restart**: `memory.sqlite` intentionally does not auto-open `memory-v2.sqlite`. Mitigation is an explicit, backed-up operator copy/move after closing hosts; rollback is the untouched old file. Repository verification must not mutate the user's home.
- **Runner/envelope split-brain**: One stale runner could invoke the removed command or reject the new envelope. Mitigation is a single ordered source change followed by distribution synchronization and packed execution for all three hosts.
- **Bun/native dependency regression**: Renaming lifecycle modules could accidentally move SQLite into the OpenCode process. Mitigation is the existing Bun bundle import/execute smoke and assertions that `better-sqlite3` remains behind literal Node.
- **Over-pruned canonical contract**: Replacing 18 accumulated specs could omit a real invariant. Mitigation is the exact target capability model above, a runtime/package-to-requirement baseline test, recent archived SDD evidence, and independent Oracle review before and after implementation.
- **Technical version erasure**: A mechanical replacement could corrupt manifest or migration discrimination. Mitigation is targeted changes, explicit preservation of numeric fields, focused revision tests, and a residue allowlist that distinguishes product labels from format numbers.
- **Destructive delta**: Ten canonical capability directories and old requirement histories are removed from the active tree. Mitigation is the user-approved reset, immutable archived changes and Git history as recovery, plus the configured destructive-delta archive warning.
- **Rollback**: Revert the repository change for code/contracts and restore the prior explicit database/receipt files for local hosts. No in-product compatibility branch or down-migration is introduced.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The name map and canonical `tools` capability preserve the exact six registrations and explicitly reject aliases or new admin tools.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The eight-capability model keeps SQLite/FTS5 authoritative and places all optional complexity behind an eval/promotion boundary instead of an active indexer.
- **P3 — Harness-Agnostic Memory Contract**: PASS — A single unversioned lifecycle/envelope crosses OpenCode, Codex, and Claude adapters, and every runner still delegates to the same core.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The retained retrieval/tool specifications require bounded compact/context/get flow, attribution, and measurable payload metadata without widening defaults.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The plan declares every renamed surface, adds no compatibility aliases, preserves source data, requires explicit operator adoption, and keeps rollback in prior files/Git rather than dormant code.

