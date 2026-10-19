# Contract: Internal retrieval diagnostics

## Boundary

Diagnostics are an internal `MemoryService` construction option used by tests and the official benchmark runner. They are not an MCP input, MCP output, CLI flag, environment variable, or persisted memory field.

## Observation

For each `recall` invocation with diagnostics enabled, the observer receives exactly one completed observation or no observation if argument validation rejects the call before retrieval begins.

Required fields:

- `strategyId`, `configHash`, and nullable `planHash`;
- `stages`, ordered by actual execution;
- `totalElapsedMs`, finite and non-negative;
- `work`, containing non-negative integer totals;
- `result`, containing requested limit, internal lexical cap, returned count, and budget measurements.

Each stage has a fixed kind from `exact`, `strict`, `relaxed`, or `post_query`; a finite non-negative elapsed value; an `executed` boolean; and either work counters when executed or a stable reason code when skipped. A skipped stage reports zero work and must not be executed merely to make diagnostics complete.

## Reconciliation

- Executed stage elapsed values may sum to less than total elapsed because orchestration overhead is included only in total; they must never sum above total beyond a documented timer precision tolerance.
- Ranked FTS rows equal the sum of rows actually emitted by strict/relaxed ranking statements before cross-stage deduplication.
- Hydrated memory rows and evidence links reflect the bounded selected IDs only.
- Returned rows and UTF-16 budget fields equal the public recall response.
- The same fixture with and without an observer must produce deeply equal public results.

## Benchmark report

The optimized comparison report records per-query observations and recomputes aggregate stage percentiles and work totals. Validation rejects unknown/missing stages, negative/non-finite values, work inconsistencies, configuration mismatch, a diagnostic query order that differs from the lane, or a persisted promotion decision that differs from recomputation.

## Privacy and failure

Observers receive no private text or raw SQL. An observer exception is converted to a bounded internal diagnostic failure during benchmark execution; production recall never enables an observer by default. Model, LLM, network, and remote-service calls remain literal zero.
