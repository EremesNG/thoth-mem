# Archive Report: Optimize Relaxed Lexical Latency

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-28-optimize-relaxed-lexical-latency/`

## Completed scope

- Added opt-in privacy-safe recall diagnostics, bounded deterministic FTS work, batch hydration, revision-5 prefix indexes, and strict comparison-v2 validation without changing the exact six-tool local-only contract.
- Converged `any-prefix-v1` to the three longest sanitized terms and at most two lexical rows, preserving exact-first precedence, deterministic BM25 order, lineage, caller budgets, and control compatibility.
- Produced four immutable 470-question-per-lane LongMemEval-S reports. Round 4 uniquely promotes `any-prefix-v1` at p95 `1.3659 ms` versus control `0.9527 ms`, with higher ranking quality, equal SQLite bytes, provenance 1, and zero errors or external calls.
- Bound legacy import reporting to the authoritative SQLite schema revision and hardened durable evidence validation against impossible, compensated, relabeled, promotion, and archived-baseline mutations.

## Verification lineage

- `verify-report.md` records independent Oracle round-4 PASS after four final-verification rounds and five bounded convergence rounds.
- Focused verification passed 5 files / 39 tests; full verification passed 41 files / 228 tests together with TypeScript build, integration inventory, fixture benchmark, packed lifecycle smoke, prepublish, four report validators, Full `ready`, and diff hygiene.
- Round-4 SHA-256 is `842805cc423cc48d33cf07b05e73c25967f532b79e24131b44407d87b1e6fe36`; all four report validators and nine independent adversarial probes pass.

## Canonical specification sync

- Updated: `evals`, `retrieval`.
## Deviations and residual warnings

- No scope deviation. No official report was overwritten or regenerated during validator convergence.
- Same-run wall-clock latency is host-specific; the supported conclusion is the frozen candidate-to-control ratio.

## Follow-up

- Use the promoted deterministic lexical default as the next local-memory baseline; address a separate measured bottleneck in a new change rather than weakening these frozen gates.
