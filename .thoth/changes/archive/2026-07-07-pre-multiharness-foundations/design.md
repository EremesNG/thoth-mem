# Design: Pre-Multiharness Foundations

## Technical Approach

This change is an additive foundation pass over existing thoth-mem behavior. It keeps the six-tool MCP registry unchanged, preserves explicit caller identity, avoids historical repair, extends existing community health readers, and measures token savings through the current trace and retrieval eval paths.

The implementation should preserve the store-centric pattern already used by `src/tools/*.ts`: tools validate and format, while durable identity, health, and telemetry behavior lives in `src/store/`, `src/config.ts`, and small shared utilities.

Upstream handoff hints consumed:
- Preserve identity precedence: explicit input, configured project default, cwd/workspace, git worktree/remote, package/workspace metadata, deterministic compatibility default.
- Do not silently repair historical `unknown` projects or `manual-save-*` sessions.
- Surface exactly seven community health states in `mem_project(action="health")`: `fresh`, `stale`, `rebuilding`, `failed`, `degraded`, `missing`, `disabled`.
- Keep telemetry privacy-safe and bounded.
- Use deterministic token estimates when exact tokenization is unavailable.
- Define concrete `mem_get` avoided/escalated correlation.

OpenSpec `rules.design.sub_artifacts` is `false`, so this phase produces only this `design.md`.

## Architecture Decisions

### Decision: Represent project identity through the existing `project` string plus additive resolution metadata

**Choice**:
Keep persisted observations, prompts, sessions, sync mutations, and filters keyed by the existing `project` string. Extend `src/store/identity.ts` and `src/store/types.ts` with a resolver v2 contract that returns:
- `project`: the effective observation/prompt project, nullable only where existing storage permits null.
- `session_project`: the non-null project required by `sessions.project`.
- `project_id`: an alias for the effective stable project identity used in metadata and HTTP responses.
- `project_source`: `explicit`, `config`, `cwd`, `git`, `package`, or `fallback`.
- `session_source`: `explicit`, `placeholder`, or `fallback`.
- `degraded`: bounded entries for missing, blank, placeholder, synthesized, or compatibility fallback identity.

Do not add a new canonical `project_id` column in this change. If later multi-harness work needs a separate durable key, that must be a separate schema/spec change.

**Alternatives considered**:
- Add `project_id` columns to all persisted tables now. Rejected because current filters, sync/export/import, FTS indexes, and HTTP/CLI contracts already use `project`, and a parallel key would increase migration risk before harness adapters exist.
- Rewrite `unknown` and `manual-save-*` historical rows when a better identity can be derived. Rejected by spec and constitution compatibility requirements.

**Rationale**:
The current schema already treats `project` as the cross-surface grouping key. Preserving it avoids destructive schema repair while still letting callers see how identity was resolved.

### Decision: Centralize project default config in `getConfig`

**Choice**:
Add an optional persisted/env project default to `src/config.ts` and `config.schema.json`:
- persisted config: `project.default`
- environment override: `THOTH_PROJECT`
- resolved type field: `ThothConfig.project.default: string | null`

`getConfig` remains the only config bootstrap path. Tool handlers that already call `getConfig()` should pass the config to identity resolution; store methods should use `this.config`.

**Alternatives considered**:
- Read a second project config file near cwd. Rejected because it creates another bootstrap path.
- Infer config defaults inside each tool. Rejected because surfaces would drift.

**Rationale**:
The spec requires centralized configured identity before workspace inference. `getConfig` is already the central config source.

### Decision: Normalize derived project strings deterministically and safely

**Choice**:
Add helpers in `src/store/identity.ts`:
- `normalizeIdentityToken(value)`: trim, lowercase only for derived values, replace path separators and whitespace with `-`, remove characters outside `[a-z0-9._-]`, collapse repeated separators, trim leading/trailing separators, cap to 80 chars.
- Explicit caller `project` values are trimmed but otherwise preserved for backward compatibility.
- Configured project defaults are treated as caller-controlled stable values: trim and preserve case except blank values are ignored.
- Cwd identity uses `process.cwd()` basename, or an explicit `cwd` option in tests/CLI/HTTP when supplied.
- Git identity uses sanitized remote/worktree name only; credentials, protocols, hosts, drive letters, and user-specific path fragments are discarded. Prefer repo basename from remote URL, then worktree root basename.
- Package identity reads nearest `package.json` name when available and normalizes scoped names like `@scope/pkg` to `scope-pkg`.
- Compatibility fallback stays `unknown` for project and `manual-save-{project}` for required sessions.

**Alternatives considered**:
- Hash all derived identities. Rejected because operators need readable project health/filter values.
- Preserve raw cwd/git strings. Rejected due to privacy and cross-machine instability.

**Rationale**:
This preserves explicit identity while making derived identity deterministic, readable, and safe to expose.

### Decision: Keep session normalization compatibility-oriented

**Choice**:
Session identity v2 should:
- Preserve non-blank, non-placeholder explicit session ids unchanged.
- Treat blank and missing session ids as degraded.
- Treat `manual-save-*` as a placeholder/degraded but query-stable explicit value.
- Synthesize `manual-save-{effectiveProject}` only when the current path requires a session id and no stable explicit session id exists.
- Never mutate historical session rows during reads, imports, sync, health, or startup.

**Alternatives considered**:
- Generate UUID session ids for missing inputs. Rejected because it would break deterministic fallback tests and sync/import compatibility.
- Reject missing session ids for save paths. Rejected because existing MCP behavior permits compatibility saves.

**Rationale**:
The current tests assert `manual-save-*` compatibility behavior. The new resolver should make it more explicit, not break it.

### Decision: Render community health from existing community run metadata

**Choice**:
Extend `Store.getOperationalHealth()` with `community: CommunityHealthReadModel`. Reuse:
- `getCommunitySummaryState({ project })`
- `kg_community_runs.graph_signature`
- `current_graph_signature`
- run status/freshness
- counts and degraded reasons already stored in `kg_community_runs`

Map existing community states into the required seven-state health model:
- `disabled`: community summaries disabled by config.
- `missing`: enabled but no run exists.
- `rebuilding`: latest run status is `running`.
- `failed`: latest run status is `failed`.
- `stale`: latest committed/run graph signature does not match current graph signature, or freshness is `stale`.
- `degraded`: committed/run freshness is `degraded` or `empty`, or sparse/empty coverage makes summaries untrustworthy.
- `fresh`: committed freshness is `fresh`, graph signatures match, and coverage is non-sparse.

`empty` remains an internal community freshness value but is rendered as health state `degraded` with reason `empty_kg`.

**Alternatives considered**:
- Recompute graph signatures and coverage by scanning the full graph inside the formatter. Rejected because `getCommunitySummaryState` already owns the freshness check and bounded metadata.
- Add a new MCP community-health tool. Rejected by six-tool registry invariants.

**Rationale**:
Existing schema and store code already track the needed run/job/freshness basis. Health should be a bounded read projection over that state.

### Decision: Use operation trace metrics JSON for privacy-safe runtime telemetry

**Choice**:
Add additive `operation_traces` columns through schema/migration:
- `correlation_id TEXT`
- `metrics_json TEXT`

`metrics_json` stores only numeric counts, metric basis labels, safe ids, hashes, and bounded state names. It must not store raw prompt, observation, query result, or community summary content.

Add a shared metric utility, likely `src/utils/token-metrics.ts`, with:
- `countChars(value)`.
- `estimateTokensFromChars(chars) = Math.ceil(chars / 4)` for deterministic estimates.
- `buildPayloadMetrics({ request, response, fullChars, evidenceChars, returnedChars, evidenceObservationIds })`.
- fields: `request_chars`, `response_chars`, `full_chars`, `evidence_chars`, `returned_chars`, `saved_chars`, `compression_ratio`, `token_basis`, `estimated_tokens`, `exact_tokens`.

When exact tokenization is unavailable, `exact_tokens` stays `null` or absent and `token_basis` is `estimated_chars_div_4`. No output may imply billing-exact tokens unless an explicit exact tokenizer is later wired.

**Alternatives considered**:
- Add one column per metric. Rejected because retrieval and future tool metrics will evolve; a bounded JSON envelope is less invasive.
- Store raw request/response text for later tokenization. Rejected by privacy requirements.

**Rationale**:
The current `saveOperationTrace` path already sanitizes and bounds request/response JSON. A metrics JSON column lets averages be computed without expanding the public MCP surface.

### Decision: Correlate `mem_get` avoidance/escalation through trace-safe evidence ids and a bounded window

**Choice**:
Runtime aggregation should classify recall paths as:
- `escalated`: a `mem_get(kind="observation", id=X)` trace occurs within 15 minutes after a `mem_recall`/`mem_context` trace whose `metrics_json.evidence_observation_ids` contains `X`, scoped to the same non-null project when present. Prompt `mem_get` uses `kind="prompt"` and prompt ids separately.
- `avoided`: a `mem_recall`/`mem_context` trace is older than the 15-minute correlation window and has no matching later `mem_get` trace for any evidence id.
- `pending`: a recent recall/context trace still inside the 15-minute window.

Eval instrumentation may use explicit per-case answer-path ids instead of wall-clock windows, but runtime trace summaries must use the above deterministic window to avoid adding MCP arguments.

**Alternatives considered**:
- Claim avoidance immediately when compact/context mode returns results. Rejected because a later full fetch may still be required.
- Add a required caller-supplied correlation id to MCP tool schemas. Rejected for this foundation change because it complicates clients; optional future metadata can be considered separately.

**Rationale**:
Evidence observation ids are already safe numeric identifiers and sufficient to avoid false avoidance credit when full content is fetched soon after recall.

### Decision: Extend existing retrieval eval envelope instead of creating a new report format

**Choice**:
Extend `RetrievalTokenSavingsMetricsEnvelope` in `src/evals/retrieval.ts` with:
- `average_payload_chars_by_tool`
- `request_chars`, `response_chars`
- `full_tokens_estimated`, `evidence_tokens_estimated`, `returned_tokens_estimated`
- optional exact token fields, left absent/null when unavailable
- `token_basis`
- `mem_get_avoided_count`
- `mem_get_escalated_count`
- `recall_after_compaction_cases`
- `recall_after_compaction_recovered_count`
- `recall_after_compaction_payload_savings`

Keep existing recall/rank quality gates authoritative.

**Alternatives considered**:
- Add a separate eval command. Rejected because `pnpm run eval:retrieval` is the existing gate and already reports token-savings metrics.

**Rationale**:
The current eval already computes full/evidence/returned character compression. Extending it preserves continuity.

## Data Flow

### Identity Resolution

```text
MCP / HTTP / CLI / import / sync input
  -> shared resolver v2 in src/store/identity.ts
  -> precedence:
     explicit project
     configured project default from getConfig()
     cwd/workspace basename
     git remote/worktree basename
     package metadata name
     compatibility fallback
  -> Store save/session/import/sync methods
  -> persisted existing project/session fields
  -> response identity metadata and trace metadata
```

The resolver may read cwd/git/package context through bounded synchronous helpers. If git/package probing fails, it records a degraded source/reason and continues down the precedence chain.

### Community Health

```text
mem_project(action="health")
  -> formatProjectHealth(store, project, max_chars)
  -> store.getOperationalHealth({ project })
  -> store.getCommunitySummaryState({ project }) when project is supplied
  -> community state mapping to seven public states
  -> bounded Markdown health output
```

For `project` omitted, health should keep global operational sections and include either an aggregate community line or a bounded project sample/count, not unbounded per-project community detail.

### Runtime Telemetry

```text
registerTracedTool wrapper
  -> handler returns MCP result
  -> tool-specific metrics builder derives safe counts
  -> Store.saveOperationTrace({ request, response, metrics, correlation_id })
  -> Store summarizer computes per-tool averages and mem_get avoided/escalated
```

The wrapper must remain non-recursive: saving a trace must not itself invoke a traced tool.

### Retrieval Eval Telemetry

```text
runRetrievalEval()
  -> existing hybrid retrieval cases
  -> compact/context/full-fetch fixture paths
  -> compaction-like fixture with only compact handoff/source key
  -> extended token_savings_metrics envelope
  -> Markdown report and assertion gate
```

## File Changes

Planned implementation files:
- `src/store/identity.ts`: resolver v2, normalization helpers, metadata formatting.
- `src/store/types.ts`: additive identity, community health, trace metrics, and token metric types.
- `src/config.ts`: optional centralized project default config and env parsing.
- `config.schema.json`: schema for optional `project.default`.
- `src/store/schema.ts`: additive `operation_traces.correlation_id` and `operation_traces.metrics_json` columns/indexes.
- `src/store/migrations.ts`: idempotent migration coverage for new trace columns where needed.
- `src/store/index.ts`: consume resolver v2 in save/session/import/sync paths, extend `getOperationalHealth`, save/list trace metrics, add trace telemetry aggregation helper.
- `src/tools/tracing.ts`: compute and pass safe per-tool payload metrics.
- `src/tools/mem-save.ts`: pass/format resolver v2 metadata without changing tool name.
- `src/tools/mem-session.ts`: preserve explicit start ids and format resolver v2 warnings for summary/checkpoint.
- `src/tools/mem-project.ts`: keep `health` as existing action and pass bounds.
- `src/tools/project-views.ts`: render community health state and telemetry summaries in bounded output.
- `src/tools/mem-recall.ts`: expose measurement metadata already known at formatting time and provide evidence ids for trace metrics.
- `src/tools/mem-get.ts`: provide returned/full payload metrics and full-fetch ids for trace correlation.
- `src/evals/retrieval.ts`: extend the existing token-savings envelope and Markdown report.
- `src/http-routes.ts`: mirror identity metadata and health facts on existing HTTP routes where those surfaces already exist.
- `src/cli.ts`: use resolver-compatible Store paths; no new CLI command is required for this change.
- `src/sync/index.ts`: preserve explicit sync identity and propagate resolver metadata through import paths without changing sync format semantics.

Planned tests:
- `tests/store/identity.test.ts` or nearest existing store identity/session tests: resolver precedence, normalization, deterministic repeated resolution, blank/placeholder sessions, no historical repair.
- `tests/config.test.ts`: `THOTH_PROJECT` and persisted `project.default`.
- `tests/store/sessions.test.ts`: compatibility session behavior remains stable.
- `tests/tools/mem-save.test.ts`: identity warnings and explicit identity preservation.
- `tests/tools/mem-session.test.ts`: start/summary/checkpoint identity behavior.
- `tests/http-server.test.ts`: mirrored identity metadata and health route facts.
- `tests/sync/sync.test.ts` and `tests/store/export-import.test.ts`: import/sync degraded identity and no repair.
- `tests/store/community-summaries.test.ts`: direct health read model for fresh, stale, rebuilding, failed, degraded, missing, disabled.
- `tests/tools/mem-project.test.ts`: bounded `health` output, seven states, privacy assertions, no raw content leak.
- `tests/store/operation-traces.test.ts`: metrics JSON, averages, avoided/escalated aggregation, redaction.
- `tests/tools/trace-wrapper.test.ts`: MCP trace payload metrics, non-recursive tracing.
- `tests/tools/mem-recall.test.ts` and `tests/tools/mem-get.test.ts`: measurement metadata and correlation ids.
- `tests/evals/retrieval.test.ts`: extended envelope, compact-only, context-expanded, full-fetch-escalated, recall-after-compaction cases.
- `tests/tools/registry.test.ts`: six-tool registry unchanged.

## Interfaces / Contracts

### Identity resolver v2

The resolver should accept:

```ts
interface ResolveIdentityV2Input {
  project?: string | null;
  session_id?: string | null;
  requireSessionProject?: boolean;
  source?: IdentitySource;
  config?: ThothConfig;
  cwd?: string;
}
```

It should return the existing `IdentityResolution` shape plus additive fields, preserving old consumers:

```ts
interface IdentityResolution {
  session_id?: string;
  project?: string | null;
  session_project: string;
  project_id?: string | null;
  project_source?: 'explicit' | 'config' | 'cwd' | 'git' | 'package' | 'fallback';
  session_source?: 'explicit' | 'placeholder' | 'fallback';
  degraded: DegradedIdentityEntry[];
}
```

`IdentityReason` should add `synthesized`, `compatibility-default`, and `metadata-unavailable` as needed. Existing reasons remain valid.

### Community health read model

```ts
type CommunityHealthState =
  | 'fresh'
  | 'stale'
  | 'rebuilding'
  | 'failed'
  | 'degraded'
  | 'missing'
  | 'disabled';

interface CommunityHealthReadModel {
  state: CommunityHealthState;
  run_id: number | null;
  latest_committed_run_id: number | null;
  latest_job_status: 'running' | 'committed' | 'failed' | 'none';
  graph_signature: string | null;
  current_graph_signature: string | null;
  freshness_basis: 'graph_signature' | 'config_disabled' | 'missing_run';
  coverage: {
    communities: number;
    entities: number;
    triples: number;
    source_observations: number;
  };
  degraded_reasons: string[];
  error: string | null;
  updated_at: string | null;
}
```

Health output must use counts, signatures, timestamps, ids, and reasons only. It must not include raw observation/prompt content or community summary bodies.

### Trace metrics JSON

```ts
interface OperationTraceMetrics {
  schema_version: 1;
  request_chars: number;
  response_chars: number;
  returned_chars: number;
  full_chars?: number;
  evidence_chars?: number;
  saved_chars?: number;
  compression_ratio?: number;
  token_basis: 'estimated_chars_div_4' | 'exact';
  estimated_tokens: {
    request?: number;
    response?: number;
    full?: number;
    evidence?: number;
    returned?: number;
  };
  exact_tokens?: {
    request?: number;
    response?: number;
    full?: number;
    evidence?: number;
    returned?: number;
  };
  evidence_observation_ids?: number[];
  fetched_observation_id?: number;
  fetched_prompt_id?: number;
  retrieval_mode?: 'compact' | 'context';
}
```

## Testing Strategy

Focused commands for later implementation:
- `pnpm exec vitest run tests/store/identity.test.ts tests/config.test.ts tests/store/sessions.test.ts`
- `pnpm exec vitest run tests/tools/mem-save.test.ts tests/tools/mem-session.test.ts tests/http-server.test.ts tests/sync/sync.test.ts tests/store/export-import.test.ts`
- `pnpm exec vitest run tests/store/community-summaries.test.ts tests/tools/mem-project.test.ts`
- `pnpm exec vitest run tests/store/operation-traces.test.ts tests/tools/trace-wrapper.test.ts tests/tools/mem-recall.test.ts tests/tools/mem-get.test.ts`
- `pnpm exec vitest run tests/evals/retrieval.test.ts`

Required broader gates:
- `pnpm run eval:retrieval`
- `pnpm run build`
- `pnpm test`

The registry invariant must be verified with `tests/tools/registry.test.ts` and the full build/test gate.

## Migration / Rollout

All storage changes must be additive. Existing rows remain valid and query-stable:
- No backfill that changes `observations.project`.
- No backfill that changes `sessions.id` or `sessions.project`.
- No import/sync repair of `unknown` or `manual-save-*`.
- New trace columns are nullable and safe for older rows.

Rollout can be reversed by ignoring the additive metadata/metrics and keeping existing project/session values. Community health rendering is read-only. Token telemetry is observational and does not affect retrieval ranking.

## Constitution Check

Result: pass.

- P1 Compact, Workflow-Level MCP Surface: pass. Design keeps exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`; health remains `mem_project(action="health")`.
- P2 Deterministic-First Retrieval With Safe Degradation: pass. Retrieval lanes remain unchanged; telemetry labels exact vs estimated tokens and does not make semantic/tokenizer support load-bearing.
- P3 Harness-Agnostic Memory Contract: pass. Identity resolution is shared and adapter-independent; no harness-specific field semantics or multi-harness adapter code is introduced.
- P4 Token-Efficient, Bounded Recall Outputs: pass. Compact/context/get funnel remains intact; new metrics measure payloads and escalation without widening default outputs.
- P5 Stable Public Contract With Explicit Deprecation Discipline: pass. No public tool, route, CLI command, or taxonomy removal/rename is planned; schema changes are additive.

No violation detected, so design finalization is not blocked.

## Open Questions

- Exact tokenizer integration remains deferred. This design requires deterministic estimates now and exact token fields only if a portable tokenizer is later available.
- Runtime `mem_get` correlation uses a 15-minute bounded trace window. If future harnesses pass explicit answer-path ids, they can improve precision without changing this foundation.

