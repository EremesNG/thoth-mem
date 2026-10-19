# Implementation log: SQLite-first persistent memory core v2

## Ownership decision

- Owner: one `deep` implementation writer for all product surfaces in T001-T053; root retains OpenSpec task state and gate coordination.
- Net-gain rationale: the schema, `MemoryService`, retrieval, MCP handlers, lifecycle adapters, setup inventory, importer, package cutover, and retirement deletions share breaking contracts and require one ordered atomic cutover. A single correctness-focused writer avoids divergent intermediate contracts while isolating the large implementation context from final verification.
- Mutable product surface: `src/`, `tests/`, `integrations/`, `scripts/`, `benchmarks/`, package/workspace/config/Vitest/CI manifests, `dashboard/` retirement, `README.md`, `docs/agent/`, and `AGENTS.md` as assigned by T001-T053.
- Root-only surface: `openspec/changes/sqlite-first-memory-core/`, including task state, verification evidence, convergence, and archive coordination.

## Accepted scope

- Requirements: FR-001 through FR-063 and buildable SC-001 through SC-012; SC-013 and SC-014 remain measured outcome gates and cannot promote speculative optional lanes.
- TDD seams: `MemoryService`; the exact six MCP tools; host-neutral lifecycle plus OpenCode, Codex, and Claude Code adapters; managed setup/package receipts; the read-only one-way importer; and benchmark report/adaptor contracts.
- Non-goals: backward-compatibility shims, dual reads/writes, dashboard, observatory, HTTP, graph/KG product runtime, required vectors/embeddings/HyDE/reranking/LLM work, model downloads, network calls on the hot path, and mutation of a legacy source database.

## Required checks

Run the nearest focused Vitest file on every red/green slice. Before handoff, run the focused v2 suites, `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run prepublishOnly`, the packed three-host smoke, the committed fixture benchmark, deleted-reference audits, and `git diff --check`. Record unavailable external benchmark lanes explicitly; do not treat availability as a product pass.
