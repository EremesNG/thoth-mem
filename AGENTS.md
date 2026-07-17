# AGENTS.md

This repository is `thoth-mem`, a TypeScript/ESM persistent-memory service for coding agents. It stores prompts, observations, sessions, retrieval indexes, and derived graph data in SQLite; exposes a six-tool MCP server plus CLI and optional HTTP/dashboard surfaces; and packages opt-in native lifecycle integrations for OpenCode, Codex, and Claude Code.

This file is the canonical repository-wide agent guide for `C:\DEV\Proyectos\Webstorm\thoth-mem`. Load task-specific detail from [`docs/agent/index.md`](docs/agent/index.md); do not read every linked document by default.

## Navigation and context

1. Classify the task by behavior, then select one primary route in the context router.
2. Prefer `webstorm-index` MCP tools for project text/file search, reading, navigation, and refactoring. This applies to root and delegated agents.
3. Check index readiness before indexed operations. If the index is unavailable, errors, lacks a capability, or returns incomplete results, use the least invasive fallback and resume indexed navigation when practical.
4. Search named paths, symbols, imports, registrations, and nearby tests before broad reading.
5. Read the smallest relevant runtime entrypoints, registrations/imports, and tests first. Expand only to answer a concrete unresolved question.
6. Exclude `.claude/worktrees/`, vendored or local skills under `.agents/skills/` and `skills/`, dependency/build/generated output, and archived `openspec/changes/archive/` from routine exploration unless the task targets them.
7. Ask subagents for conclusions, inspected paths/symbols, relevant checks, risks, and unresolved questions—not raw logs, full files, or unfiltered searches.

The root `AGENTS.md` is the only confirmed repository-wide instruction entrypoint. Skill-owned `AGENTS.md` files under `.agents/skills/` are local skill assets, not nested project rules. No `CLAUDE.md`, Copilot instruction file, `.cursorrules`, or `.cursor/rules/` project bridge is currently maintained; do not add or duplicate client instructions without evidence that a client needs one.

## Repository map

- `src/store/`, `src/retrieval/`, `src/indexing/`, `src/sync/`: durable memory, recall, derived indexes, maintenance, and synchronization.
- `src/tools/`, `src/index.ts`, `src/server.ts`, `src/cli.ts`, `src/http-*.ts`: MCP, process, CLI, and HTTP surfaces.
- `src/integration/` and `integrations/`: host-neutral lifecycle logic and published native harness assets.
- `src/setup/`, `scripts/`, package/plugin manifests: managed setup, packaging, verification, and release preparation.
- `dashboard/`: React/Vite operations console consumed by the HTTP bridge.
- `tests/`: Vitest suites organized by behavior; `docs/agent/`: on-demand agent context.
- `dist/`: generated output; never edit directly.

## Verified baseline

- Package manager: pnpm `11.1.3`; Node.js runtime floor: `>=18`.
- Stack: strict TypeScript, Node16 ESM, Vitest, SQLite via `better-sqlite3`, zod; dashboard uses React and Vite.
- Common scripts from `package.json`: `pnpm install`, `pnpm run dev`, `pnpm run build`, `pnpm test`, `pnpm run test:watch`, and `pnpm run prepublishOnly`.
- There is no root lint script. Do not invent or claim `pnpm run lint`; use only checks verified in manifests or CI.
- Detailed test selection and verification rules are owned by [`docs/agent/testing.md`](docs/agent/testing.md).

## Universal working rules

- Read each touched file before editing it. Match its existing patterns and formatting.
- Prefer small, focused changes. Fix bugs minimally and do not refactor unrelated modules.
- Preserve unrelated and concurrent working-tree changes; review the diff before finishing.
- Do not edit generated output, copy secrets or private operational data into docs/code, or claim a check passed unless it ran.
- Keep source relative imports ESM-compatible with explicit `.js` extensions. Never suppress type errors with `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Every `request_user_input` call must omit `autoResolutionMs` entirely, including `null` or `undefined`.
- Treat install, setup, migration, deployment, publication, release, and real-host smoke as stateful operations requiring task-specific scope and authorization. A documentation or discovery task does not authorize them.
- Update routed documentation only when a durable, non-obvious fact changes. Keep commands aligned with manifests and CI.

For coding style, module organization, naming, error boundaries, and type rules, load the [engineering overlay](docs/agent/engineering.md). For privacy, FTS, schema, taxonomy, deduplication, and topic-key invariants, load the [persistence and retrieval route](docs/agent/persistence-retrieval.md).

## Change workflow

1. Confirm scope, the primary route, and only the overlays the change actually touches.
2. Inspect existing contracts and nearest tests before editing.
3. Implement the requested behavior without expanding ownership.
4. Run the narrowest relevant check first, then broader checks required by [`docs/agent/testing.md`](docs/agent/testing.md).
5. Review status and diff for unrelated, generated, dependency, worktree, or secret material.
6. Report completed behavior, files changed, checks run, failures, and remaining uncertainty.

## Definition of done

- The requested behavior or analysis is complete and remains within scope.
- Relevant focused checks pass; required broader checks pass, or exact failures and unexecuted checks are reported.
- Public contracts, persistence behavior, packaging inventory, and durable documentation are updated when the change requires them.
- Cleanup responsibilities are preserved, and the final diff contains no unrelated, generated, dependency, or secret material.
- Assumptions and unresolved uncertainty are explicit.
