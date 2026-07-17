# Agent context router

Select the smallest useful context for the task. Do not read every linked document.

## Deterministic routing

1. An explicit user-named path or package wins over vocabulary, except excluded/generated copies are not authoritative unless explicitly targeted.
2. Otherwise choose the route that owns the behavior being changed.
3. If behavior spans runtimes, choose the owner of the externally visible contract as primary.
4. Add only overlays whose invariants or verification are actually affected.
5. When ownership is still unclear, use the evidence-gathering fallback below.

## Primary routes

| Task signals | Read first | Search first | Nearest tests | Optional overlays |
| --- | --- | --- | --- | --- |
| save, session, prompt, SQLite, schema, FTS, recall, embeddings, KG, communities, maintenance, sync | [Persistence and retrieval](persistence-retrieval.md) | `src/store/`, `src/retrieval/`, `src/indexing/`, `src/sync/`, `src/utils/` | `tests/store/`, `tests/retrieval/`, `tests/indexing/`, `tests/sync/`, `tests/utils/` | [Engineering](engineering.md), [Surfaces](surfaces.md) when a public adapter changes |
| MCP tool, CLI command, HTTP route, OpenAPI, server startup, transport, operation trace | [MCP, CLI, and HTTP surfaces](surfaces.md) | `src/tools/`, `src/index.ts`, `src/server.ts`, `src/cli.ts`, `src/http-*.ts` | `tests/tools/`, `tests/cli.test.ts`, `tests/index.test.ts`, `tests/http-*.test.ts` | [Persistence and retrieval](persistence-retrieval.md), [Dashboard](dashboard.md) |
| lifecycle event, hook, compaction, checkpoint, adapter, capability evidence, native output, OpenCode/Codex/Claude runtime | [Native lifecycle integrations](native-lifecycle.md) | `src/integration/`, `integrations/*/` | `tests/integration/`, `tests/integration.test.ts`, `tests/fixtures/integration/` | [Managed delivery](managed-delivery.md) when published assets change |
| setup, receipt, rollback, managed config, inventory, runner sync, package contents, CI, release | [Managed setup, packaging, and release](managed-delivery.md) | `src/setup/`, `integrations/inventory.json`, `scripts/`, manifests, `.github/workflows/` | `tests/setup/`, `tests/packaging/`, `tests/fixtures/setup/`, `tests/fixtures/packaging/` | [Native lifecycle](native-lifecycle.md), [Engineering](engineering.md) |
| React, dashboard, observatory, map, route, browser state, API client, CSS, Vite | [Dashboard UI](dashboard.md) | `dashboard/src/`, `dashboard/package.json`, `dashboard/vite.config.ts` | `tests/dashboard/`, HTTP visualization tests when contracts change | [Surfaces](surfaces.md), [Engineering](engineering.md) |

## Shared and cross-cutting context

- [Architecture](architecture.md): stable boundaries and cross-domain flows; load for cross-route changes or unclear ownership.
- [Testing](testing.md): canonical test selection, commands, CI gates, and cleanup expectations.
- [Engineering overlay](engineering.md): TypeScript/ESM, imports, naming, formatting, file organization, and error handling.
- [Task template](task-template.md): compact handoff for work spanning sessions or agents.
- [`routing-cases.json`](routing-cases.json): regression examples for route selection.

## Precedence examples

- A dashboard component bug is dashboard-primary even if it calls HTTP; add surfaces only if the response contract changes.
- A new HTTP field is surfaces-primary; add persistence only if store/query behavior changes and dashboard only if the client consumes it.
- A native hook behavior change is lifecycle-primary; setup/delivery becomes primary only when installation ownership, receipts, inventory, or published layout is the behavior under change.
- A schema change is persistence-primary even when initiated through CLI or HTTP; surface documents are overlays only for changed public contracts.

## Evidence-gathering fallback

When no route fits:

1. Search the exact user terms, paths, symbols, imports, registrations, and matching tests with WebStorm Index first.
2. Inspect the nearest manifest and runtime entrypoint, not the entire repository.
3. Exclude `.claude/worktrees/`, local/vendored skills, generated/dependency output, and archived OpenSpec unless directly targeted.
4. Identify the behavior owner, return to this router, and open only that route plus necessary overlays.
5. Record uncertainty instead of inventing ownership or commands. Add a route only for a durable, recurring responsibility.
