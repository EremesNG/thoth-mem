# Proposal: Stable Memory Identity Bootstrap

## Intent

Thoth-mem exists to give AI coding agents persistent memory across sessions without forcing repeated rediscovery. This change establishes a stable project/session identity and memory bootstrap contract across the current MCP, HTTP, CLI, Store, and sync surfaces before returning to broader multi-harness work.

The immediate problem is not data-dir bootstrap: project/data-dir identity is already centralized through `getConfig`, `resolveDataDir`, and the server/CLI entry points. The material risk is persisted fallback identity. Several current save/session/import paths synthesize placeholder session or project values such as `manual-save-{project}` or `unknown`, which can make later recall, graph filters, sync convergence, and session/project-scoped queries less stable than the product goal requires.

## Scope

### In Scope

- Define an explicit identity/bootstrap contract for current surfaces:
  - MCP tools: `mem_session`, `mem_save`, and their project/session handling.
  - HTTP routes that mirror session/save behavior.
  - Store-level session, prompt, observation, import, and sync apply paths.
  - CLI sync and sync-import defaults where identity affects persisted artifacts.
- Reduce placeholder session/project fallbacks where a stable caller-provided or configured identity is available.
- Make remaining placeholder fallback behavior visible and deterministic when compatibility requires keeping it.
- Preserve stable session/project filters for recall, context, graph, timeline, sync, and import/export flows.
- Test existing behavior across MCP tool handlers, HTTP routes, Store persistence/import logic, sync behavior, and config bootstrap.
- Keep schema changes additive and conservative if any are needed. The existing schema already requires `sessions.project` while allowing nullable `observations.project` and `user_prompts.project`, so destructive schema changes are not part of this foundation.

### Deferred / Needs Discovery

- Exact compatibility policy for callers that currently rely on `manual-save-{project}` fallback sessions.
- Whether the CLI sync directory default should move from `process.cwd()/.thoth-sync` to a resolved-data-dir/project-aware default, or whether it should remain as-is with clearer documentation and warnings.
- Exact warning/reporting shape for fallback identities in MCP and HTTP responses.
- Future per-harness deterministic hook behavior, including Codex/OpenCode/Gemini-specific metadata extraction.
- Whether imported records with absent project/session identity should be repaired at import time, reported as degraded identity, or left unchanged with explicit query semantics.

### Out of Scope

- Implementing multi-harness hooks or harness-specific identity adapters.
- Moving or redesigning any `MemoryIntegrationCore` layer.
- Destructive schema changes or making nullable observation/prompt project fields non-null.
- Changing the six-tool MCP surface.
- Adding new MCP tools.
- Replacing the existing config/data-dir bootstrap mechanism.

## Approach

Define the identity contract first, then apply it consistently where current fallbacks are synthesized.

| Behavior | From | To | Reason | Impact |
| --- | --- | --- | --- | --- |
| Session start | `mem_session action=start` already requires a session id | Preserve explicit session-start identity | Starting a session should remain an intentional bootstrap act | No compatibility risk expected |
| Session summary/checkpoint | Missing session id can fall back to `manual-save-{project}` | Prefer explicit active/session identity; if fallback remains, make it deterministic and visible | Summary observations currently persist under synthetic sessions, which can blur true session continuity | Later recall can distinguish real sessions from compatibility fallbacks |
| Prompt/session summary save | `mem_save` can synthesize `manual-save-{project || 'unknown'}` | Prefer supplied session/project identity and report fallback use when absent | Prompt and summary memory are high-value continuity anchors | Reduces rediscovery caused by memories filed under placeholder sessions |
| Observation save | Optional session/project can flow to Store, which may synthesize fallbacks | Define when Store may auto-create sessions and how placeholder project/session values are represented | Store is the shared behavior behind MCP/HTTP/CLI/import | Keeps filters stable across surfaces |
| HTTP mirror routes | HTTP route fallbacks mirror MCP behavior | Keep HTTP and MCP identity behavior equivalent | Constitution P3 requires harness-agnostic memory semantics | Dashboard/API clients see the same contract as MCP callers |
| Import/sync apply | Missing identity can become `unknown` | Preserve portable import compatibility while making missing identity explicit and query-stable | Imported memory must remain usable without hiding degraded identity | Import/export remains backward compatible |
| CLI sync dir | `sync` and `sync-import` default to `process.cwd()/.thoth-sync` | Decide in spec/design whether to warn/document or move to resolved identity-aware default | CWD can diverge from resolved data-dir/project identity | Avoid accidental cross-project sync artifacts |

The later spec should express identity behavior as observable requirements rather than a large refactor. Design should prefer central helpers or store-level normalization only where they remove duplicated fallback rules without changing public surfaces.

## Affected Areas

- `src/tools/mem-session.ts`
  - `action=start` requires id, while summary/checkpoint can default to `manual-save-{project}`.
  - Summary writes `session_summary` observations using fallback identity when no session id is supplied.
- `src/tools/mem-save.ts`
  - Prompt saves can default to `manual-save-{project || 'unknown'}`.
  - Session summaries can default to `manual-save-{project}`.
  - Observation saves pass optional session/project data down to Store.
- `src/http-routes.ts`
  - HTTP save/session routes mirror fallback behavior and should remain equivalent to MCP semantics.
- `src/store/index.ts`
  - `ensureSession` / `startSession` idempotently create or enrich sessions and only replace empty/unknown project placeholders in limited cases.
  - `savePrompt` / `saveObservation` can auto-create sessions and synthesize fallback ids/projects.
  - Import/sync apply paths can turn missing project/session data into `unknown`.
- `src/store/schema.ts`
  - `sessions.project` is `NOT NULL`; `observations.project` and `user_prompts.project` are nullable.
- `src/config.ts`, `src/server.ts`, `src/index.ts`, `src/cli.ts`
  - Existing data-dir identity resolution should be treated as a foundation, not the main risk.
  - CLI sync and sync-import default path behavior needs explicit treatment.
- Tests likely affected:
  - `tests/tools/mem-session.test.ts`
  - `tests/tools/mem-save.test.ts`
  - `tests/http-server.test.ts`
  - `tests/store/sessions.test.ts`
  - `tests/store/export-import.test.ts`
  - `tests/config.test.ts`

## Risks

- Compatibility risk: existing callers may depend on omitted session ids creating `manual-save-*` sessions.
- Data interpretation risk: silently rewriting existing placeholder records could damage historical meaning. This proposal should avoid retroactive mutation unless a later spec explicitly requires an opt-in repair.
- Query stability risk: project/session filters may change result sets if fallback identity semantics are tightened too aggressively.
- Sync risk: changing sync directory defaults or import repair behavior could alter operator workflows or cross-machine convergence.
- Schema risk: forcing non-null project values on prompts/observations would be destructive and conflicts with current schema flexibility.

## Rollback Plan

- Keep any behavior changes behind code paths that can fall back to current placeholder synthesis without schema rollback.
- If new warnings or response metadata cause client issues, disable the warning text/metadata while preserving persistence behavior.
- If sync-dir default changes prove disruptive, revert to the current `process.cwd()/.thoth-sync` default and keep the identity warning/documentation path.
- Avoid data migrations that rewrite historical sessions/prompts/observations. If an opt-in repair command is later designed, it must be separately reversible or dry-run first.
- No destructive schema changes are planned, so rollback should not require database downgrade.

## Success Criteria

- A caller-provided session id and project are preserved consistently across MCP, HTTP, Store, and sync/import paths.
- Missing session/project identity no longer silently creates ambiguous persisted memory without either deterministic compatibility behavior or explicit fallback visibility.
- `manual-save-*` and `unknown` placeholders are reduced where stable identity is available and remain query-stable where retained.
- Session/project filters continue to behave predictably for recall, context, graph, timeline, sync import/export, and direct Store reads.
- Existing data-dir resolution remains centralized and covered by config tests.
- The compact six-tool MCP registry remains unchanged.
- Backward-compatible imports continue to work for legacy payloads with missing identity.
- Focused tests cover MCP session/save, HTTP route mirrors, Store session/save/import behavior, sync/export-import identity behavior, and config bootstrap.
