# Proposal: Pre-Multiharness Foundations

## Intent
Prepare thoth-mem for later multi-harness work by closing three local foundation gaps that were identified in the pre-multiharness audit: stable identity resolution, community-summary health visibility, and measured token-savings telemetry. This change keeps the current MCP surface and retrieval architecture intact while making the runtime state easier to trust, diagnose, and compare across future harness adapters.

## Scope

### In Scope
- P2.5 stable project/session identity resolver v2:
  - From: existing identity handling preserves explicit caller identity and reports deterministic compatibility fallbacks, but does not yet derive stable project identity from local workspace context.
  - To: a shared resolver derives `project_id` from explicit input, centralized config, cwd, git remote/worktree context, and deterministic defaults in a documented precedence order.
  - Reason: future harness parity requires identical local identity decisions without each adapter inventing its own project/session normalization.
  - Impact: `mem_save`, `mem_session`, HTTP mirror routes, CLI/import/sync paths, and identity metadata warnings can share one project/session identity contract.
- Normalize incoming `session_id` values enough to distinguish explicit stable IDs from missing, blank, placeholder, or synthesized compatibility IDs.
- Emit clear warning/degraded metadata when project or session identity falls back to compatibility defaults, without silently rewriting historical placeholder records.
- P6.5 community health state:
  - From: community summaries have freshness and degraded-state concepts in store/retrieval specs, while `mem_project(action="health")` does not yet expose a complete operator-facing community state.
  - To: project health reports community summary state as `fresh`, `stale`, `rebuilding`, `failed`, `degraded`, `missing`, or disabled where applicable, with coverage, graph signature/freshness basis, and latest job visibility.
  - Reason: operators and agents need to see whether community summaries are trustworthy before using rollout or retrieval evidence.
  - Impact: `mem_project(action="health")`, health/project-view formatting, store health reads, community rebuild/job metadata, tests, and docs/evals that consume health state.
- P4.5 real token-savings telemetry:
  - From: retrieval and context outputs report character-based compression and boundedness, but do not directly measure average payload per tool, avoided `mem_get` fetches, or recall-after-compaction behavior.
  - To: runtime telemetry and eval reports measure average payload per tool, returned/evidence/full payload sizes, `mem_get` avoided where compact/context recall answered without full fetch, recall after compaction, and token estimates when exact token accounting is not practical.
  - Reason: token savings should be measured with operational evidence, not inferred only from compression ratios.
  - Impact: retrieval eval envelope, tracing/observability metrics, tool output metadata where already appropriate, and regression gates for future harness work.

### Deferred / Needs Discovery
- Exact `project_id` derivation order across explicit tool input, persisted config, cwd folder name, git remote URL, package metadata, and default fallback needs spec/design confirmation against current config and sync semantics.
- Whether `project_id` is persisted as a new stable field or represented by the existing `project` string plus normalized metadata needs design proof; destructive schema changes are not assumed.
- Community graph signature source needs design selection: it may reuse existing KG/community freshness metadata if sufficient, or add a bounded derived signature if not.
- Exact token counting may depend on model tokenizer availability. If exact tokenizer support is not portable, the spec should require deterministic token estimates and label them as estimates.
- The definition of "mem_get avoided" needs an eval/runtime heuristic that avoids claiming savings when a later full fetch is still required for the same answer path.

### Out of Scope
- Implementing multi-harness adapters, G3 harness parity, or a `MemoryIntegrationCore` migration.
- Adding, removing, renaming, or splitting MCP tools. The registered MCP surface remains exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.
- Reopening shipped P3 community read-path rollout or P5 graph navigation v2 behavior except where health/telemetry consumes their existing state.
- Full GraphRAG global-answer synthesis, query-time subquery planning, or a fifth retrieval lane.
- Broad unrelated refactors, historical placeholder identity repair, and portable sync/export format expansion unless a later spec explicitly requires it.

## Approach
- Add a shared identity-resolution contract that preserves explicit identity first, uses centralized config and local workspace/git signals where available, and falls back deterministically with visible degraded metadata.
- Thread the resolver through existing save/session and mirrored HTTP/CLI/import/sync boundaries without changing the compact MCP registry or requiring new mandatory configuration.
- Extend project health reads to include community summary state, coverage, graph signature/freshness basis, latest rebuild/job status, and degraded/failure reasons in bounded output.
- Extend retrieval/eval/trace telemetry to collect payload-size and token-savings evidence: full/evidence/returned chars, estimated tokens, per-tool payload averages, recall/context tier usage, `mem_get` escalation/avoidance, and compaction recovery cases.
- Keep all new behavior additive and reversible through configuration, fallback visibility, or telemetry-only reporting where possible.

## Affected Areas
- `src/store/identity.ts`, `src/config.ts`, `config.schema.json`, and related identity/config tests.
- `src/tools/mem-save.ts`, `src/tools/mem-session.ts`, `src/tools/mem-project.ts`, `src/tools/project-views.ts`, and MCP registration tests that assert the six-tool surface.
- HTTP and CLI surfaces that mirror save/session, project health, import/export, or sync identity behavior.
- Store project/community health readers and any community summary job/freshness metadata used to compute state.
- `src/evals/retrieval.ts` and related eval fixtures/reporting for payload, token estimate, `mem_get` avoidance, and compaction recall evidence.
- Observability/trace persistence where per-tool payload averages and safe bounded telemetry are recorded.
- OpenSpec domains likely touched by later phases: `config`, `tools`, `store`, `evals`, `observability`, `retrieval`, and `knowledge-graph`.

## Risks
- Identity derivation can accidentally change project grouping. Mitigation: explicit caller identity always wins, historical placeholders are not silently repaired, fallback warnings are visible, and tests cover old and new paths.
- Git/cwd-derived project IDs can differ across clones or CI paths. Mitigation: normalize deterministically, document precedence, prefer configured or explicit IDs, and expose the source used for resolution.
- Community health can become expensive if it recomputes graph signatures on demand. Mitigation: use stored freshness/signature metadata where possible and bound health reads.
- Token estimates can be mistaken for exact billing tokens. Mitigation: label estimates clearly when exact tokenizer accounting is unavailable and keep exact-vs-estimated fields distinct.
- Telemetry may store too much request/response content. Mitigation: reuse existing trace sanitization and bounded payload summaries, recording counts and hashes/signatures instead of raw full bodies where possible.

## Rollback Plan
- Identity resolver v2 can be disabled or bypassed by preserving explicit input and existing compatibility fallback behavior; historical data does not require migration rollback.
- Community health additions are read/reporting additions; rollback can hide the new health fields while leaving community artifacts untouched.
- Token-savings telemetry is additive; rollback can stop collecting or rendering new metrics without changing retrieval results.
- If any schema/index additions are introduced during design, they must be additive and safe to leave in place or guarded so old behavior remains available.

## Success Criteria
- Explicit `project` and `session_id` supplied by MCP/HTTP/CLI/import/sync callers are preserved and never replaced by derived or fallback identity.
- Missing or blank identity resolves through deterministic, visible fallback metadata, and repeated equivalent inputs produce the same fallback identity.
- Project identity can be derived consistently from accepted local sources such as cwd/git/config/defaults, with warnings that name the selected source and degraded fallback reason.
- `mem_project(action="health")` reports community summary state, coverage, graph signature/freshness basis, and latest job status for fresh, stale, rebuilding, failed, degraded, missing, and disabled states.
- Retrieval evals and runtime telemetry report average payload per tool, full/evidence/returned sizes, estimated or exact tokens, `mem_get` avoided/escalated counts, and recall-after-compaction evidence.
- The compact MCP tool registry remains exactly six tools.
- Existing retrieval, KG, community read-path, graph navigation, build, and full test gates do not regress.
