# Agent context router

| Task | Primary guide | Source | Tests |
| --- | --- | --- | --- |
| SQLite schema, evidence, memory, FTS, lineage, projections, import | [Persistence and retrieval](persistence-retrieval.md) | `src/memory-core/` | `tests/memory-core/` |
| MCP, CLI, startup, output | [Surfaces](surfaces.md) | `src/tools/`, `src/{index,server,cli}.ts` | `tests/tools/` |
| Hooks, adapters, setup, package inventory | [Native lifecycle](native-lifecycle.md) | `src/integration/`, `src/setup/`, `integrations/` | `tests/integration/`, `tests/setup/` |
| Build, test, pack, benchmark | [Testing](testing.md) | `scripts/`, `benchmarks/`, manifests | `tests/benchmarks/` |

Load [engineering](engineering.md) for TypeScript changes. The retired Store, HTTP, dashboard, graph, vector, HyDE, semantic indexing, and sync surfaces are not valid routes in the current product.
