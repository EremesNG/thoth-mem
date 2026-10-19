# Data model: Relaxed lexical latency

## SQLite revision 5

Revision 5 changes only the rebuildable `memory_fts` projection. Authoritative `projects`, `evidence`, `memories`, `memory_evidence`, receipts, sessions, and summaries are unchanged.

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  memory_id UNINDEXED,
  project_id UNINDEXED,
  title,
  content,
  topic_key,
  tokenize='unicode61 tokenchars _',
  prefix='2 3 4 5 6 7 8 9 10 11 12'
);
```

The migration runs transactionally: drop the two FTS maintenance triggers, drop and recreate only `memory_fts`, repopulate it from the immutable `memories` rows in stable row order, recreate the triggers, verify row count and foreign keys, then append schema revision 5. Existing upgrade dispatch remains strictly sequential: revision 2 applies 2→3, then 3→4, then 4→5; revision 3 applies 3→4, then 4→5; revision 4 applies only 4→5. No earlier migration records the current global revision constant. A failure in 4→5 rolls back to revision 4 with the authoritative rows intact. Because FTS is derived, no dual-write or compatibility table is introduced.

## Query execution records

Internal query planning adds strategy-owned term selection, `maxQueryTerms`, and `maxLexicalResults` values. `null` means the caller's remaining result limit. The failed round-one `any-prefix-v1` configuration used twelve relaxed terms and ten lexical rows; round two used four terms/five rows; round three used the first three terms/two rows. The next convergence configuration scans at most 32 sanitized terms, chooses the three longest with stable original-order tie behavior, and retains the two-row cap. Exact authoritative matches are collected before lexical stages and do not consume this internal cap, but the final result never exceeds the caller's public `limit`. Control and adaptive expressions retain their twelve-term behavior.

Diagnostic observations are ephemeral and privacy-safe:

- strategy ID, configuration hash, plan hash;
- ordered executed stage kinds (`exact`, `strict`, `relaxed`, `post_query`);
- monotonic elapsed milliseconds per executed stage and total;
- integer work counters: ranked FTS rows, hydrated memory rows, hydrated evidence links, returned rows, source/evidence/returned UTF-16 units;
- explicit skipped-stage reasons.

No query text, memory content, title, topic key, source reference, evidence content, or SQLite row value is emitted in diagnostics.

## Hydration model

FTS ranking returns only `memory_id`, score, and deterministic ordering fields. One ordered application-level map hydrates selected memories with a single bounded `IN` query; one second bounded query aggregates evidence IDs and character totals for those memory IDs. The final assembler restores the exact rank order and applies existing history filtering, deduplication, snippet budgets, and response budgets.

## Durable benchmark evidence

The optimized comparison report is a new comparison-schema revision. It embeds the unchanged retrieval-lane quality/provenance evidence and adds:

- declared strategy work caps and configuration hashes;
- per-query diagnostic observations;
- aggregate per-stage p50/p95 and work totals;
- archived candidate report hash, quality deltas, and a committed manifest binding that hash to the exact quality/footprint baselines;
- same-run promotion recomputation.

The archived comparison report is immutable and is never overwritten.
