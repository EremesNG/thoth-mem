# Verification Report: Optimize Relaxed Lexical Latency

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: PASS — every FR-001 through FR-007 and SC-001 through SC-006 is satisfied.
- **Correctness**: PASS — nine direct adversarial probes reject impossible, compensated, relabeled, promotion, and baseline mutations.
- **Coherence**: PASS — the round-4 unique winner, runtime default, immutable evidence, schema revision, documentation, and package contracts agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | Three sequential 470-query lanes share corpus, order, Top-20, delivery, diagnostics, and scoring | Runner/comparison tests and official reports | PASS |
| FR-002 | Sanitized deterministic plans plus revision-5 prefix indexes | Retrieval and migration tests | PASS |
| FR-003 | Exact-first precedence, two-row candidate cap, deterministic order, lineage, and batch hydration | Focused retrieval tests | PASS |
| FR-004 | V2 envelopes, hashes, diagnostics, archived reference, and four immutable reports | Validators and direct probes | PASS |
| FR-005 | Opt-in monotonic privacy-safe observer with stage/work/budget reconciliation | Observer tests and adversarial probes | PASS |
| FR-006 | Round-4 uniquely selects the runtime `any-prefix-v1` default and matching config hash | Official decision/default inspection | PASS |
| FR-007 | Six tools, local SQLite, unchanged dependencies, and zero external calls | Build/package/report inspection | PASS |
| SC-001 `[buildable]` | On/off equality and exact/strict/relaxed/post accounting | Focused tests | PASS |
| SC-002 `[buildable]` | Control and both candidates cover declared query, scope, history, overlap, empty, and limit cases | Parameterized retrieval tests | PASS |
| SC-003 `[buildable]` | Three longest bounded terms, two-row cap, and batch hydration | Focused retrieval tests | PASS |
| SC-004 `[buildable]` | Nine impossible, compensated, relabeled, promotion, and baseline mutations | Independent Oracle probes | PASS |
| SC-005 `[outcome]` | Quality gains, equal bytes, provenance 1, zero errors/calls across 470 queries | Round-4 official report | PASS |
| SC-006 `[outcome]` | Any-prefix p95 1.3659 ms versus control 0.9527 ms; sole eligible candidate | Round-4 official report | PASS |

## Closed historical findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| F-001 | critical | partial | Any-prefix is 3.0618× control and adaptive 4.3628× | Reduce measured relaxed/post-query work without changing the 2× gate or default |
| F-002 | critical | partial | Mutated ranked/hydrated counters validate when aggregates are changed consistently | Reconcile stage rows, hydrated rows, and hydration statements in semantic validation |
| F-003 | critical | partial | Mutated archived footprint baseline can alter promotion under unchanged SHA | Bind archived bytes/hash and exact derived baselines together |
| W-001 | warning | missing | Both candidates are not explicit across every SC-002 matrix dimension | Add parameterized candidate coverage |

## Residual risks

- Non-blocking: wall-clock latency is host-specific; the supported conclusion is the frozen same-run ratio.
- Preserve all four immutable reports and their recorded hashes during archive.

## Convergence evidence after Oracle round 1

F-002 and F-003 are closed by adversarial tests, semantic reconciliation, and the committed archived-baseline manifest. W-001 is closed by parameterized both-candidate project/history/query-shape/overlap/limit coverage. The first convergence candidate reduced work to four query terms and five rows and passed all focused, full, integration, fixture, smoke, packaging, prepublish, diff, and Full-ready checks.

The immutable round-2 report (`967a2e520fd523c0500ed2bfa64fdfb3bb7121015f58caebc626f59c2eeb1db6`) is valid but remains an outcome FAIL for SC-006: `any-prefix-v1` p95 `2.0404 ms` exceeds twice control p95 `0.8925 ms`. The default therefore remains `all-prefix-v1`; convergence continues against the remaining relaxed-query and post-query hydration work without weakening a gate.

## Final implementation evidence pending fresh Oracle

Round 3 remained a valid latency FAIL and isolated low-selectivity leading question terms as the dominant relaxed-query cost. The final configuration (`d31ca3f7d1a0fd6662af2148cd51d1f3149b681012f8f756629d6bdd67aeb553`) chooses the three longest sanitized terms from a bounded 32-term window, restores original order, and ranks at most two lexical rows after exact matches.

The immutable round-4 report (`842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36`) validates and selects `any-prefix-v1` as the unique eligible candidate: p95 `1.3659 ms` versus control `0.9527 ms`, RecallAny@20 `0.825532`, Recall@20 `0.677021`, NDCG@10 `0.696544`, equal SQLite bytes `1,519,955,968`, provenance 1, zero errors, and zero network/model/LLM calls. The runtime default now follows that decision. After the default change, focused tests, build, 41-file/224-test full suite, integration verification, fixture, packed smoke, prepublish, and all four historical report validations pass. Final PASS remains reserved for a fresh Oracle.

## Oracle verification round 2 — FAIL

The fresh Oracle independently confirmed FR-001–003, FR-006–007, SC-001, SC-003, SC-005, SC-006, all immutable hashes, the round-4 unique promotion, migrations, packaging, and the default. It reopened F-002 as a critical SC-004 correctness blocker: semantic validation accepted an impossible executed strict stage for any-prefix, an invented exact row, invented post/hydration rows, and round-one work relabeled to the two-row configuration. W-001 remains only for explicit both-candidate empty-normalized-input coverage. D-001 records that routed testing documentation names the archived comparison path instead of the implemented latency-report default. Archive remains blocked pending bounded convergence and another fresh Oracle.

## Convergence evidence after Oracle round 2

F-002 is closed by strategy-specific stage-plan validation plus exact/lexical/post row reconciliation, result bounds, ranked-row reconciliation, and configuration-hash-specific historical caps. Four new adversarial mutations now reject the precise impossible-stage, invented-exact, invented-post/hydration, and cap-relabeling cases; all four immutable latency reports still validate. W-001 is closed by explicit empty-normalized-input plan/result coverage for both candidates. D-001 is closed by documenting `benchmarks/results/longmemeval-s-lexical-latency-report.json` as the implemented no-clobber default. FR-006 and the change status now state the validated round-4 `any-prefix-v1` decision explicitly.

Post-convergence evidence passes: four focused files / 35 tests; integration inventory; TypeScript build; 41 files / 227 tests; fixture benchmark; packed OpenCode, Codex, and Claude Code smoke; `git diff --check` (line-ending warnings only); all four immutable report validators; and Full `ready` validation with zero errors and zero warnings. Final PASS remains reserved for a new independent Oracle.

## Oracle verification round 3 — FAIL

The fresh Oracle independently passed FR-001–003, FR-006–007, SC-001–003, and SC-005–006, including the round-4 hash, unique promotion, default/configuration, exact-six/local-only inventory, output path, migrations, package, and both-candidate empty-input coverage. It found two critical closeout blockers. First, SC-004 validation still accepts compensated fabricated evidence by shifting a relaxed row to exact while reducing ranked work, adding an in-cap relaxed/post/hydrated row, or incrementing hydrated evidence links with its aggregate. Second, the legacy importer reports target schema revision 4 while its database migrates to revision 5. Archive remains blocked pending round-5 TDD convergence and another fresh Oracle.

## Convergence evidence after Oracle round 3

The LongMemEval-S validator now requires the benchmark profile's independently observable invariants: zero exact rows, post-query rows equal lexical/ranked/returned rows, hydrated memory rows equal post-query rows, and hydrated evidence-link rows equal hydrated memory rows. Three compensated adversarial mutations reproduce the Oracle probes and are rejected, while all four immutable reports remain valid. The legacy importer now derives its public `targetSchemaVersion` type and value from `SQLITE_SCHEMA_REVISION`; its test proves both the report and the created database resolve to revision 5.

Round-5 evidence passes: five focused files / 39 tests; integration inventory; TypeScript build; 41 files / 228 tests; fixture benchmark; packed OpenCode, Codex, and Claude Code smoke; all four immutable report validators; `git diff --check` (line-ending warnings only); and Full `ready` validation with zero errors and zero warnings. Final PASS remains reserved for a new independent Oracle.

## Oracle verification round 4 — PASS

The fresh Oracle independently passes completeness, correctness, and coherence for every FR-001 through FR-007 and SC-001 through SC-006. It confirms all 5,640 lane-query observations across the four immutable reports satisfy the benchmark-profile invariants, rejects nine direct adversarial mutations, verifies the round-4 SHA-256 `842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36`, confirms the `any-prefix-v1` runtime default and configuration hash, and proves the importer report/database both resolve to SQLite revision 5. Its independent checks pass 39 focused tests, 17 migration/tool/package tests, 228 full tests, TypeScript, integration inventory, source/dist comparison, Full `ready`, report validation, and diff inspection. Archive is approved with only the non-blocking host-specific timing caveat.
