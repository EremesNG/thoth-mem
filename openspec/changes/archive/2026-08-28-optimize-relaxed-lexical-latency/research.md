# Research: Relaxed lexical latency

## Question

Why do `any-prefix-v1` and `all-then-any-prefix-v1` miss the frozen p95 latency gate, and which bounded local changes can make one candidate eligible without changing the control, corpus, public Top-20 budget, quality thresholds, or six-tool surface?

## Evidence

- The archived 470-question comparison records p95 retrieval latency of 1.432 ms for `all-prefix-v1`, 6.833 ms for `any-prefix-v1`, and 8.130 ms for `all-then-any-prefix-v1`. Both relaxed lanes return 20 ranked results on almost every question and process roughly 100 times the ranked source text of the strict control.
- A 12-question statement profiler attributed relaxed mean time to the FTS query (~1.38 ms), repeated evidence-character queries (~0.78 ms), repeated evidence-ID queries (~0.37 ms), and JavaScript/snippet work (~0.89 ms). Exact lookup was negligible (~0.09 ms).
- `ORDER BY rank` did not remove the deterministic secondary-sort temporary B-tree and did not materially improve p95. Rank-only ordering changed one of 80 results. This option is rejected.
- FTS5 prefix indexes for lengths 2 through 12 preserved 80/80 IDs and scores and reduced the isolated relaxed FTS p95 from about 2.00 ms to 0.71 ms. The measured FTS allocation grew about 2.18 times and the estimated whole-database footprint about 1.43 times.
- A short-circuit snippet search preserved 80/80 snippets and reduced isolated snippet p95 from about 1.39 ms to 0.23 ms.
- Batched memory/evidence hydration preserved 80/80 IDs and evidence totals and reduced the measured hydration p95 from about 1.87 ms to 0.56 ms.
- Ranking only IDs/scores before ordered bulk hydration preserved 60/60 IDs and scores and reduced a representative p95 from about 3.27 ms to 2.31 ms.
- Combining prefix indexes, narrow ranking, batched hydration, and short-circuit snippets preserved the complete 100-question `items`, budgets, and warnings but still measured about 3.17 times the co-run control. Exact candidate-output preservation is therefore insufficient for the frozen relative gate.
- Native FTS5 `snippet()` through a second MATCH query preserved IDs but worsened the candidate ratio to roughly 15 times control. This option is rejected.
- Rescoring the archived relaxed rankings at smaller deterministic prefixes showed that Top-10 preserves the full archived NDCG@10 (0.8537) while retaining RecallAny@20 0.9745 and fractional Recall@20 0.9229. These remain far above the archived control values 0.1298, 0.1045, and 0.0980 respectively and satisfy the unchanged co-run quality rules in principle. Top-10 is therefore the smallest pre-evidenced cap that preserves the metric whose cutoff is exactly ten while materially reducing downstream work.

## Decision

Keep the caller-visible Top-20 as an equal maximum budget, keep `all-prefix-v1` byte-compatible, and make the relaxed candidate's internal lexical work cap an explicit configuration-hashed value of ten. Exact authoritative matches remain outside that lexical cap but the final caller limit remains authoritative. Combine this with narrow FTS ranking, ordered batch hydration, short-circuit snippets, and FTS5 prefix indexes shared by every lane. Report the cap and stage/work diagnostics; do not hide it as a benchmark-only behavior.

The official same-run comparison remains the outcome test. Historical rescoring is design evidence, not promotion evidence. If the candidate misses any frozen gate, the default remains `all-prefix-v1` and verification fails closed.

## Convergence evidence — round 1

The first official optimized run is valid and immutable at SHA-256 `8ae428b3855d3ee2b6bf034780d5f76a02e3ae4656d9a8a125e88c9d602f65b9`. Control p95 fell to 0.9651 ms, making the unchanged ceiling 1.9302 ms. The ten-result any-prefix candidate measured 2.9549 ms and failed only latency; its stage p95 values were 1.7874 ms relaxed MATCH and 0.9936 ms post-query. It retained RecallAny@20 0.9745, fractional Recall@20 0.9229, and NDCG@10 0.8537, leaving ample quality margin over control.

The next convergence candidate therefore reduces both remaining dimensions: at most four deterministic relaxed query terms and at most five lexical results. Archived Top-5 rescoring retains RecallAny@20 0.9489, fractional Recall@20 0.8793, and NDCG@10 0.8347, still far above control. This is a versioned configuration change, not a public Top-K or promotion-threshold change. Round 1 remains preserved and round 2 writes a new artifact.

## Convergence evidence — round 2

The immutable round-2 report is `benchmarks/results/longmemeval-s-lexical-latency-report-r2.json`, SHA-256 `967a2e520fd523c0500ed2bfa64fdfb3bb7121015f58caebc626f59c2eeb1db6`. It validates completely and retains control only because `any-prefix-v1` measured `2.0404 ms` p95 against the unchanged two-times co-run ceiling of `1.7850 ms`. RecallAny@20 `0.531915`, Recall@20 `0.432270`, and NDCG@10 `0.366620` remain above control `0.129787`, `0.098014`, and `0.104505`.

Candidate diagnostics attribute p95 to relaxed FTS `1.2022 ms` and post-query `0.6193 ms`, with exactly 2,350 ranked/hydrated rows. Rescoring its persisted ordering at two rows yields RecallAny@20 `0.397872`, Recall@20 `0.290638`, and NDCG@10 `0.288292`, preserving all quality gates before query-term narrowing is applied. The next answer-independent candidate uses three relaxed terms and two lexical rows, targeting both remaining stages without changing public Top-20/delivery budgets, control/adaptive plans, or any promotion threshold.

## Convergence evidence — round 3

The immutable round-3 report is `benchmarks/results/longmemeval-s-lexical-latency-report-r3.json`, SHA-256 `884b89576ded26333f8c25e462c4c202d79766034b9a19491fc1898048f4d058`. It validates and preserves every quality gate, but `any-prefix-v1` p95 `2.1348 ms` remains above the co-run ceiling `2.0502 ms`. Hydration fell from round-two p95 `0.6193 ms` to `0.4830 ms` and ranked rows fell from 2,350 to 940, while relaxed FTS rose from `1.2022 ms` to `1.3917 ms`.

The evidence isolates term selectivity rather than row hydration as the remaining bottleneck. Prefix-OR over the first three question terms disproportionately selects frequent interrogative/function words. The next candidate keeps the proven two-row cap but deterministically chooses the three longest sanitized terms from a bounded input window, restoring original order before query construction. This is language-neutral, query-only, configuration-hashed, and independent of answers, gold IDs, labels, and corpus statistics.

## Passing evidence — round 4

The immutable round-4 report is `benchmarks/results/longmemeval-s-lexical-latency-report-r4.json`, SHA-256 `842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36`. It selects `any-prefix-v1` as the unique eligible candidate. Candidate p95 is `1.3659 ms` versus control `0.9527 ms` (1.4337×, below 2×); RecallAny@20 is `0.825532`, Recall@20 `0.677021`, and NDCG@10 `0.696544`, all above control. Relaxed FTS p95 falls to `0.7796 ms`, post-query p95 is `0.4101 ms`, and 939 rows are ranked/hydrated. Every lane has equal SQLite bytes `1,519,955,968`, provenance coverage 1, zero errors, and zero network/model/LLM calls. The runtime default may now change under the unchanged fail-closed policy.

## Rejected alternatives

- Relaxing the 2x threshold, lowering the public Top-20 budget, changing the corpus/order, or comparing against a separately timed control: violates the frozen comparison contract.
- Exact-output-only optimization: measured at roughly 3.17x control after the strongest behavior-preserving composite.
- Rank-only FTS ordering: changes deterministic results and does not improve p95 reliably.
- A second FTS query for native snippets: materially slower.
- Remote, model, embedding, vector, graph, or reranking dependencies: outside the local lexical core and six-tool boundary.
- Strategy-specific schema indexes: would make lane footprint incomparable. Prefix indexes, if adopted, apply to every lane through one schema revision.

## Sources

- Local archived report: `benchmarks/results/longmemeval-s-lexical-comparison-report.json`.
- Local profiling against the current `MemoryService`, FTS schema, benchmark corpus, and deterministic ranking SQL.
- SQLite FTS5 documentation: prefix indexes accelerate exact configured prefix lengths but add index entries and storage: https://www.sqlite.org/fts5.html#prefix_indexes
