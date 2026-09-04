# Archive Report: Compare Lexical Query Strategies

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-28-compare-lexical-query-strategies/`

## Completed scope

- Added stable deterministic `all-prefix-v1`, `any-prefix-v1`, and `all-then-any-prefix-v1` SQLite FTS5 query strategies while preserving the six-tool local-only surface and the archived control behavior.
- Added strategy-aware internal recall execution, strict lane/comparison report contracts, atomic non-overwriting runners, exact fail-closed promotion policy, documentation, packaging inventory, and adversarial tests covering FR-001 through FR-009 and SC-001 through SC-005.
- Produced and validated the official 470-question-per-lane LongMemEval-S comparison artifact; both broader candidates improved lexical quality but exceeded the predeclared 2x p95 latency gate, so `all-prefix-v1` remains the runtime default.

## Verification lineage

- `verify-report.md` records independent Oracle round-4 PASS after four verification rounds and convergence findings F-001 through F-005.
- Focused verification passed 30/30 tests; full verification passed 41 files and 213 tests together with build, integration verification, packed lifecycle smoke, fixture benchmark, prepublish, report digest, SDD validation, and diff hygiene.
- Official report SHA-256 is `319dd6155059afcc180f7638deb841a9ca56c1c242f8d63c6a6c87209c9cb358`; executable validation returned no errors.

## Canonical specification sync

- Updated: `evals`, `retrieval`.
## Deviations and residual warnings

- No scope deviation. The official corpus was not rerun after policy-only convergence; its immutable bytes were verified by exact digest and strict reconciliation.
- Same-run latency is host-specific. The official decision supports retaining the control, not generalizing absolute millisecond performance to other hosts.

## Follow-up

- Pursue a separate latency-focused lexical retrieval change before reconsidering either broader candidate as the runtime default.
