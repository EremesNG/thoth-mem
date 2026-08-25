# Engineering

The root package is strict TypeScript/Node16 ESM targeting Node `>=22.12.0`. Relative source imports use explicit `.js`; type-only imports use `import type`. Never suppress errors with `as any`, `@ts-ignore`, or `@ts-expect-error`.

Keep dependencies pointing inward: host adapters and MCP handlers depend on `MemoryService`; the service owns ledger/retrieval rules; SQLite types do not escape it. Close owned services and clean disposable directories. Preserve unrelated worktree changes and never edit generated `dist/` directly.
