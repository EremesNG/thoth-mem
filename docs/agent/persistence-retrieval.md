# Persistence and retrieval

`src/memory-core/` is the sole durable core. `contracts.ts` defines public application records, `sqlite/` owns the current schema/ledger/FTS transaction, `service.ts` is the shared seam, and `retrieval/projections.ts` records disposable optional-lane lineage.

Evidence is immutable source material; promoted memory is a selective typed interpretation that must link supporting evidence. Promote only information that materially changes how a future coding agent acts. Preserve `failed`, `mixed`, `succeeded`, or `unknown` outcomes, and reuse a stable topic key when a correction appends a replacement, closes the prior validity interval, and keeps superseded history. Confirmed saves and FTS visibility commit together. Startup rejects a legacy schema without mutation; only `import-legacy` may read it, read-only, into a distinct target.

Recall is lexical-first, sanitizes FTS syntax, uses deterministic ties, prefers current guidance, and reports optional lane state without depending on it. The shared continuation selector powers `mem_context`, `mem_project action=briefing`, and native recovery: newest current handoff first, then decisions/conventions, failed or mixed lessons, project structure, and remaining current promoted memories. Selection is project-scoped, deterministic, bounded by one aggregate budget, and never reads raw evidence into recovery.

Compact recall, context, and briefing expose stable memory IDs only. Use `mem_get` or `mem_project action=history` after selecting a record to obtain evidence IDs and temporal lineage. No graph, vector, entity, reranker, or consolidation projection participates in the baseline. An optional module may be added only after equal Top-K and final-context budgets show a reproducible quality gain without violating latency, memory, provenance, privacy, or host-cap gates.

Start with `tests/memory-core/`; schema changes require focused tests, `pnpm run build`, and `pnpm test`.
