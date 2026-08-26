# Verification Report: Memory operating model

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

Independent verification instance: `oracle_final_verify_memory_operating_model_round3`.

## Review dimensions

- **Completeness**: PASS — every FR and buildable SC is implemented and covered; outcome gaps remain explicitly separated.
- **Correctness**: PASS — the focused, adversarial, full, packed, benchmark, and type checks found no unresolved buildable blocker.
- **Coherence**: PASS — specification, plan, sequential tasks, implementation, synchronized distributions, documentation, and evaluation contracts agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/memory-core/service.ts:save/lifecycle` keeps root prompts as immutable evidence and checkpoints as at most one source-linked handoff. | Oracle focused lifecycle checks; full Vitest. | PASS |
| FR-002 | `src/memory-core/privacy.ts:sanitizePrivateContent` is shared by adapters and core before content-derived keys, persisted content, and hashes. | Oracle rotated-credential replay; adapter/lifecycle suites. | PASS |
| FR-003 | `plugin/skills/thoth-mem/SKILL.md` and synchronized host copies define promotion, privacy, failure, supersession, handoff, and progressive-recall practice. | Integration inventory and Skill hash verification. | PASS |
| FR-004 | `src/memory-core/service.ts:save/lifecycle` and identity helpers scope by project plus verified harness/root session and preserve topic lineage. | Identity, lifecycle, context, and isolation suites. | PASS |
| FR-005 | `src/memory-core/service.ts:context` provides one deterministic handoff-first continuation policy. | Context, lifecycle, MCP, and adversarial replay checks. | PASS |
| FR-006 | `src/memory-core/continuation.ts:renderContinuation` owns the bounded trust-delimited memory-ID-only representation. | Oracle metadata-starvation and embedded-evidence cases; renderer and packed smoke. | PASS |
| FR-007 | `src/tools/index.ts` defers evidence IDs and lineage to get/history while compact/context/briefing expose memory IDs only. | MCP progressive-funnel suite and Oracle inspection. | PASS |
| FR-008 | `src/tools/index.ts` preserves the bounded context/recall/get funnel without widening the registry. | MCP tests; exact six-tool assertion. | PASS |
| FR-009 | `src/tools/index.ts` keeps briefing/history bounded behind project operations without projection dependence. | MCP briefing/history and project-isolation tests. | PASS |
| FR-010 | `src/memory-core/service.ts:lifecycle` derives delivery from final selected output and keeps hook, persistence, delivery, and consumption facts separate. | Replay, degraded, no-fit, cross-host, and packed lifecycle fixtures. | PASS |
| FR-011 | `benchmarks/run.mjs` and `benchmarks/report.mjs` report actionable recovery, abstention, isolation, poisoning, budgets, latency, provenance, and coding outcome fields. | Benchmark runner/report suites and schema validation. | PASS |
| FR-012 | `benchmarks/report.mjs` rejects unequal/incomparable lanes and fixture-only external claims. | Negative report-validator cases and fixture run. | PASS |
| SC-001 `[buildable]` | Closed capture allowlist plus shared pre-hash sanitation. | Rotated-credential adversarial replay; lifecycle and adapter suites. | PASS |
| SC-002 `[buildable]` | Stable save/lifecycle receipts and truthful duplicates/capabilities. | Root prompt, checkpoint, recovery, and post-compaction replay fixtures. | PASS |
| SC-003 `[buildable]` | One complete block at or below 1,000 code points with memory IDs and zero evidence IDs. | Renderer, host-adapter parity, and packed smoke checks. | PASS |
| SC-004 `[buildable]` | Content-first allocation, 120-code-point floor, and metadata-starvation omission. | Oracle adversarial ratio checks and renderer suite. | PASS |
| SC-005 `[buildable]` | Shared deterministic selection and exact six-tool progressive contract. | Context, tools, lifecycle, history, and isolation suites. | PASS |
| SC-006 `[buildable]` | Offline report separates metrics, enforces comparability, and makes no unsupported external claim. | Benchmark report/runner tests and schema validation. | PASS |
| SC-007 `[outcome]` | Packed OpenCode/Codex/Claude lifecycle fixtures pass, but fresh real-host model consumption was not observed and paid Claude is unavailable. | `pnpm run integration:smoke`; real-host check N/A. | RISK |
| SC-008 `[outcome]` | Lexical-only remains the default; optional/external lanes are unavailable and unpromoted. | Fixture report promotion remains `incomplete`; repository inspection. | PASS |

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| None | — | — | Oracle round 3 found no unresolved buildable issue. | — |

## Executed verification

- Oracle critical focused verification: 8 files, 57 tests passed.
- Oracle broad read-only verification: 31 files, 146 tests passed.
- Root full verification after final convergence: `pnpm test` — 32 files, 147 tests passed.
- `pnpm run build` and Oracle `pnpm exec tsc --noEmit` — passed.
- Full `ready` validator — `valid=true`, no errors; conditional-checklist warning only.
- `pnpm run integration:verify` — passed.
- `pnpm run integration:smoke` — packed OpenCode, Codex, and Claude Code passed.
- `pnpm run benchmark:fixture` — passed with schema-valid, fixture-only, incomplete promotion.
- `pnpm run prepublishOnly` — passed, including 32 files and 147 tests.
- `git diff --check` — passed; Windows line-ending notices only.

## Residual risks

- SC-007: certify fresh real-host OpenCode and Codex model consumption separately; paid Claude remains unavailable until access exists.
- External LongMemEval-S, LoCoMo, BEAM/PersonaMem, SDEBench, and Agent Memory Benchmark lanes remain unavailable and must not be used to promote optional complexity until prepared under equal budgets.
