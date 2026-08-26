# Persistence and retrieval

`src/memory-core/` is the sole durable core. `contracts.ts` defines public application records, `sqlite/` owns the current schema/ledger/FTS transaction, `service.ts` is the shared seam, and `retrieval/projections.ts` records disposable optional-lane lineage.

Evidence is immutable. A promoted memory must link supporting evidence. Corrections append a memory, close the prior validity interval, and preserve failed/superseded history. Confirmed saves and FTS visibility commit together. Startup rejects a legacy schema without mutation; only `import-legacy` may read it, read-only, into a distinct target.

Recall is lexical-first, sanitizes FTS syntax, uses deterministic ties, prefers current guidance, and reports optional lane state without depending on it. Compact/context responses are bounded and expose stable IDs for `mem_get`.

Start with `tests/memory-core/`; schema changes require focused tests, `pnpm run build`, and `pnpm test`.
