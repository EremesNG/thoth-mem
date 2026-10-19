# Archive Report: Establish Ordered Session Summaries

**Status**: ARCHIVED<br>
**Oracle verdict**: PASS<br>
**Archive path**: `openspec/changes/archive/2026-08-27-establish-ordered-session-summaries/`

## Completed scope

- FR-001 through FR-005 and SC-001/SC-002 establish the revision-4 SQLite ledger, deterministic ordered session events, verified forward migration, immutable source-supported summary projections, atomic submission, and rebuildable lineage without inferred backfill.
- FR-006 through FR-012 and SC-003/SC-004 preserve the exact six-tool MCP surface while adding bounded summary submit/current/history/get workflows and consistent summary-first recovery across OpenCode, Codex, and Claude without automatic memory promotion.
- FR-013 and SC-005 add a strict offline equal-budget experiment whose isolated candidate preserves all 869 useful code points with a higher useful-content ratio than the handoff control and zero unsupported claims, leakage, promotion, or core model/network calls.

## Verification lineage

- `verify-report.md` records the fresh independent Oracle PASS from `oracle_final_verification_round2`, a complete FR/SC compliance matrix, executed focused and broad checks, the historical failed stop gate, the user-authorized corrective convergence, and observed SC-005 evidence.

## Canonical specification sync

- Updated: `evals`, `harness-integration`, `retrieval`, `store`, `tools`.
Declared targets: `[MODIFIED store]`, `[MODIFIED tools]`, `[MODIFIED harness-integration]`, `[MODIFIED retrieval]`, and `[MODIFIED evals]`.

## Deviations and residual warnings

- The user authorized a bounded second convergence after the original SC-005 stop gate. The failed measurements remain in `verify-report.md`; SC-005 was not relaxed.
- A valid existing `.pre-v4.bak` is integrity/revision checked but not compared with the current revision-3 source; hardening could detect a stale backup after an interrupted attempt.
- Zero model/network calls are contract- and dependency-supported constants in the benchmark report; runtime instrumentation would strengthen that evidence.
- Pre-existing LongMemEval changes remain separate and are not part of this archive.

## Follow-up

- Consider backup freshness comparison and runtime model/network-call instrumentation as separate hardening work; neither blocks this verified change.
