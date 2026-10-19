# Change: session-summaries

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- No host produces session summaries today: the core only validates externally submitted summaries (README.md:137, docs/agent/native-lifecycle.md:101) and no adapter submits one; the thoth-mem project has 0 summaries. Pi hooks dispatch every `mem_session` operation automatically but never send a summary (`src/integration/pi/{index,lifecycle}.ts`).
- Summaries surface only to the exact same root session (`src/memory-core/service.ts:900-951`); `guide_post_compact` is summary-only (`:951,1020-1024`), so post-compaction recovery is identity-only. In Pi the refresh replays that guidance on every later prompt, removing handoffs and memories from `<thoth_mem_recovery>` for the rest of the session; Codex and Claude compact routes use the same path.
- Every supported host keeps its own compaction summary in context after compaction and on resume, so a session's own summary in its automatic recovery is redundant; the useful audience is other sessions and explicit reads.
- Host compaction text available without extra inference: Pi 1.3.0 `session_compact` `compactionEntry.summary` (default headings Goal, Constraints & Preferences, Progress/Done/In Progress/Blocked, Key Decisions, Next Steps, Critical Context; split-turn and extension compactions differ); Claude Code `PostCompact` `compact_summary` (since 2.1.76; the public plugin does not register PostCompact); OpenCode assistant message with `summary:true` readable via `client.session.messages` after `session.compacted` (source-ordering inference). Codex `PostCompact` has no summary field and its transcript is documented as unstable.
- Session-end signals: Pi `session_shutdown` (non-reload) is reliable; Claude `SessionEnd` has a 1.5 s budget; Codex `SessionEnd` has 1 s default/3 s max and also fires after 30 min idle; OpenCode has no exit event (only `session.deleted`); generic MCP has none and process exit is not a conversation end. No host guarantees hooks after a crash.
- Generic MCP clients rarely send a session pair, so their saves are sessionless (`src/tools/index.ts:137-138,244-252`); `src/index.ts:25-33` only closes the service on exit. Installed hosts: Claude Code 2.1.296, Codex 0.162.1, OpenCode 1.18.32, Pi 1.3.0.
- Summary contract: claim kinds objective/completed/decision/changed_surface/verification/pending/blocker/next_action; 1-32 claims, 2,000 code points each, 20,000 UTF-16 total; supports must be in-session evidence within coverage starting at 1; generator kind root_agent/harness/model is metadata only; summaries are versioned projections of `session_summary` evidence (`src/memory-core/{contracts,session-summaries}.ts`). Persisting a summary appends an evidence event and advances the session sequence.
- Recovery budgets: selector default 4,000 (64-20,000), host renderer 1,000 code points and 3 items (`src/memory-core/continuation.ts:6-12`).

## Intent

Session summaries exist for every supported harness without any model call: hosts forward their own compaction text where a documented field provides it, and the service derives deterministic checkpoint and final summaries from session evidence, including a lazy fallback for sessions that never finalize. Automatic recovery stops showing a session its own summary, stops abstaining after compaction, and shows the previous session's summary so continuity no longer depends on the agent writing a handoff. Generic MCP clients without hooks get a per-connection session so their work can be summarized too.

## Non-goals

- No LLM or network call to generate summaries; no Codex or Claude transcript parsing.
- Pi `/tree` branch summaries, observation workflows, and memory promotion are unchanged.
- Recovery caps (1,000 code points, 3 items; selector budgets) are not raised.
- Model-facing tool schema compaction is a separate follow-up change (`thoth-mem/tool-schema-compaction`).
- No change to how verified native root identity is resolved.

## Acceptance

- AC-1: When `checkpoint_pre_compact` or `finalize` carries no submitted summary, the service derives a deterministic harness summary from that session's evidence using the agreed mapping; every claim cites in-session evidence within coverage and respects claim and size limits; a session without citable evidence gets none; replays return the identical summary and persisting a summary never triggers another derivation.
- AC-2: `guide_post_compact` content is sanitized and stored as `checkpoint` evidence; recognized section headings yield a harness checkpoint summary citing it; unrecognized text stays evidence only; nothing becomes a memory or observation.
- AC-3: Automatic recovery (enroll/recover, per-prompt refresh, `guide_post_compact`) never selects the current session's own summary and `guide_post_compact` renders the same project recovery as recover; explicit `mem_context` with a verified session pair still returns that session's newest summary; degraded or premature post-compaction events still fail closed.
- AC-4: Automatic recovery includes the newest current summary of the previous session (most recent other root session of the project by last non-summary activity, any harness), lazily deriving one when missing (final if ended, else checkpoint), ordered newest open handoff, previous-session summary, then other memories, within existing caps.
- AC-5: Pi forwards `compactionEntry.summary` on successful compaction; both Claude bundles register `PostCompact` and forward `compact_summary`; OpenCode forwards the latest `summary:true` assistant message text after `session.compacted`; Codex behavior is unchanged; adapter failures degrade without blocking the host.
- AC-6: A generic MCP client that is not a known native host gets one server-assigned `mcp` session per connection for sessionless calls, finalized with a derived summary when the transport closes; that session cannot review or promote observations or submit lifecycle summaries; native clients keep their current attribution; `mem_context` without a pair from such a connection uses it as the current session for previous-session selection.
- AC-7: Canonical deltas, docs, Skills (via the sync script), benchmark fixture, and tests reflect the new behavior; `pnpm test`, `pnpm run build`, `pnpm run integration:verify`, and `pnpm run benchmark:fixture` pass or exact pre-existing failures are reported.

## Clarifications

- RESOLVED: Scope covers all three parts (post-compaction recovery fix, automatic summary production, cross-session visibility); user approved.
- RESOLVED: Final summary uses option B (deterministic, no LLM) for every harness, including generic MCP; user approved.
- RESOLVED D1: Automatic recovery never shows a session its own summary; post-compact recovery equals normal recovery.
- RESOLVED D2: Previous session = most recent other root session in the project by last activity, any harness.
- RESOLVED D3: Order = newest open handoff, previous-session summary, other memories.
- RESOLVED D4: Generic MCP gets a server-assigned per-connection `mcp` session, not verified root identity.
- RESOLVED: OpenSpec governance migrated to `.thoth/` first (commit db34896), user approved.

## Decisions

- Claim mapping: root prompts -> objective (first and latest distinct, truncated); decision/convention/architecture/preference memories -> decision; discovery/project_structure -> completed; failure -> completed with outcome failed; open handoff -> next_action; closed handoff -> completed; newest parsed host compaction claims reused; Pi modified-files section -> changed_surface.
- Host compaction text travels in the existing `mem_session` `content` field on `guide_post_compact` (no new field); evidence kind `checkpoint`; generator `{kind: harness}`.
- Heading recognition is a keyword table over Markdown headings (goal/request/intent -> objective; done/completed -> completed; in progress/pending -> pending; blocked -> blocker; decisions -> decision; next steps -> next_action; modified files -> changed_surface); other sections are ignored; no headings -> evidence only.
- Activity watermark = latest non-`session_summary` evidence sequence; derivation key = (session, kind, watermark), so stored summaries never retrigger derivation.
- Lazy derivation runs only for the single previous session selected by automatic recovery and only when its watermark exceeds its newest summary coverage.
- Native client detection for the connection session primarily uses a launch-time native-host marker that thoth-mem's own native bundles and the Pi extension set when starting the MCP server (U3 server side, U4 bundle side); MCP client identity (`getClientVersion()`) is only a fallback for known native client names. Misclassification affects attribution only, never authority. Memory-core exposes `service.context(input, 'recovery')` (default `'explicit'`) so connection pairs get automatic-recovery selection without lifecycle authority.
- MODIFIED deltas replace a migrated multi-scenario requirement with one statement and one scenario (archive format); retained behaviors from dropped duplicated Pi scenarios are folded into the statements. The historical revision-9 to 10 migration scenario is not carried forward.
- Task order is sequential in one worktree to avoid concurrent writers and cross-unit test interference.
- Compaction forwarding event keys bind an immutable host compaction identity (Pi `compactionEntry.id`, OpenCode summary message ID) or, when none exists (Claude `PostCompact`), the sanitized content fingerprint, so distinct compactions in one session never collide and exact retries stay idempotent; the current OpenCode `session-compacted:<sessionID>` key is replaced.
- Generic MCP shutdown: the installed MCP SDK 1.29.0 stdio transport does not fire `onclose` on stdin EOF, so `src/index.ts` handles stdin end/close and SIGINT/SIGTERM through one idempotent shutdown path that finalizes the connection session before `service.close()`.
- Receipt ordering: checkpoint/finalize retries return their original receipt without re-deriving from newer evidence; duplicate recover replays still refresh the lazy predecessor summary when its watermark advanced.
- Authority rejection keys on the server-assigned `mcp` session identity, never on self-reported client info; connection sessions are eligible predecessors without gaining root authority.
- Vitest configs: `vitest.unit.config.ts` excludes `tests/integration/**`, `tests/setup/**`, and `tests/packaging/**`; those run with `vitest.integration.config.ts`.
- Implementation finding: Claude `SessionStart` with source startup/clear/fork mapped to `enroll`, which returns no recovery, so new Claude sessions only got the identity fallback and could never see the previous-session summary (AC-4). It is mapped to `recover` (as Codex already does) within AC-5; the packed smoke now asserts no own summary after compaction and a previous-session summary for a new Claude session.
- ADDED-requirement overlap reviewed: host compaction storage/parsing is service-side and complements the adapter forwarding rule in Runtime Lifecycle; derived summaries are projections governed alongside, not replacing, Optional Projection Lineage; the connection session complements Native Integrations MUST Use the Documented Tool Contracts.

## Durable deltas

- `MODIFIED retrieval` **Project Briefing MUST Be Deterministic and Bounded** — Automatic recovery for a verified root session (enroll/recover, per-prompt refresh, and `guide_post_compact`) MUST render one deterministic bounded selection that never includes that session's own summaries, and `guide_post_compact` MUST render the same project recovery as ordinary recovery instead of abstaining; the selection MUST order the newest open handoff first, then the newest current summary of the previous session (the most recent other root session of the same project by last non-summary activity, from any harness), then the remaining project memories in the existing kind order, within the existing aggregate and host rendering caps, and summaries of every other session MUST stay absent; explicit `mem_context` with a verified session pair MAY still return that session's own newest summary; degraded or premature post-compaction events MUST keep failing closed without injecting memory.
  - GIVEN a compacted root session with its own checkpoint summary, an open project handoff, and a previous root session with a final summary; WHEN `guide_post_compact` runs; THEN recovery renders the open handoff, then the previous session's summary, then remaining memories within the caps and omits the compacted session's own summary.
- `MODIFIED harness-integration` **Runtime Lifecycle MUST Preserve the Core Contract** — OpenCode, Codex, Claude Code, and Pi lifecycle adapters MUST normalize only fields their supported native contracts actually provide and MUST apply shared privacy sanitation before content-derived identity; Pi MUST map documented session start, admitted root input, context preparation, pre-compaction, successful compaction, failed compaction, settled-agent, and shutdown events onto enroll, recover, capture-root (one ordered root-prompt evidence event per distinct sanitized interactive or RPC input), checkpoint-pre-compact, guide-post-compact, non-finalizing degradation or flush, and a single finalize, and agent-settled or failed-compaction events MUST NOT finalize; where a native contract provides the host's own generated compaction summary text (Pi `session_compact` compaction entry summary, Claude Code `PostCompact` `compact_summary`, and the OpenCode assistant summary message readable after `session.compacted`) the adapter MUST forward it as `guide_post_compact` content, while Codex and any host without such a documented field MUST NOT parse transcripts for it; forwarded compaction text and prompt, model, tool, summary, or lifecycle content MUST NOT be automatically promoted to memories or observations and MAY only become session evidence and harness-derived session summaries.
  - GIVEN Pi reports a successful compaction whose entry carries the default structured summary text; WHEN the lifecycle hooks execute; THEN thoth-mem checkpoints before compaction, forwards the text with guide-post-compact so it is stored as checkpoint evidence with a harness checkpoint summary citing it, creates no memory or observation, and refreshes the next bounded recovery block.
- `MODIFIED harness-integration` **Root Session Identity MUST Be Verified and Host-Specific Only at the Adapter** — Native adapters, including Pi, MUST resolve the Git common-directory UUID or explicit non-Git path identity from the host working directory, pass an initial display-name hint only for adoption, and preserve the exact canonical project key with a stable root session identity; Pi MUST use its documented session identity and working directory, while delegated, ambiguous, incomplete, or child-key-mismatched identity and any server-assigned generic MCP connection session MUST NOT receive root authority.
  - GIVEN a delegated, ambiguous, incomplete, or child-key-mismatched Pi identity or a generic MCP connection session; WHEN it attempts root-only capture, recovery injection, lifecycle summary submission, or observation review or promotion; THEN it receives no root authority and no unverified context is injected.
- `MODIFIED harness-integration` **Lifecycle Events MUST Be Idempotent and Truthful** — Stable capture keys MUST identify distinct sanitized root-user submissions rather than only their enclosing turn; a native immutable message ID MUST be used when available, otherwise, including for Pi root input, a deterministic key MUST bind documented stable session or turn fields with the sanitized prompt fingerprint so different prompts remain distinct and exact retries remain idempotent; harness-derived and host-harvested session summaries MUST be idempotent per session, kind, and latest non-summary evidence sequence, so a replayed lifecycle event or lazy derivation returns the identical canonical summary or none, and persisting a summary MUST NOT itself trigger another derivation.
  - GIVEN two different interactive or RPC root inputs, an exact retry of one, and then a replayed finalize; WHEN the events are processed; THEN the prompts receive distinct capture keys, the retry is a duplicate, and the replayed finalize returns the original derived final summary without creating a new version.
- `ADDED harness-integration` **Host Compaction Text MUST Become Cited Checkpoint Evidence** — When `guide_post_compact` carries host compaction text, the service MUST sanitize and store it as `checkpoint` session evidence and MUST derive a harness checkpoint summary only from recognized section headings (goal, request, or intent as objective; done or completed as completed; in progress or pending as pending; blocked as blocker; decisions as decision; next steps as next action; modified files as changed surface), each claim citing that evidence; text without recognized headings MUST remain evidence only, and the text MUST never become a memory or observation.
  - GIVEN Pi compaction text with Goal, Done, In Progress, Blocked, Key Decisions, and Next Steps sections and another text with no recognized headings; WHEN each arrives on `guide_post_compact`; THEN the first yields a checkpoint summary with objective, completed, pending, blocker, decision, and next-action claims citing its evidence, and the second yields evidence only.
- `ADDED store` **Session Summaries MUST Be Derived Deterministically When Not Supplied** — When `checkpoint_pre_compact` or `finalize` carries no submitted summary, or the previous session needed by automatic recovery has no current summary covering its latest non-summary evidence, the service MUST derive a harness-generated summary without any model or network call from that session's own evidence: root prompts as objective; promoted decision, convention, architecture, and preference memories as decision; discovery and project-structure memories as completed; failure memories as completed with outcome failed; open handoffs as next action; closed handoffs as completed; and the newest parsed host compaction claims; every claim MUST cite in-session evidence inside its coverage and respect the existing claim and size limits, a session without citable evidence MUST receive no summary, and a lazily derived summary MUST be final only when the session has ended and checkpoint otherwise.
  - GIVEN an ended Codex session with two root prompts, one decision memory, and one open handoff and no submitted summary; WHEN finalize runs or a later session's recovery needs it; THEN exactly one harness final summary exists whose objective, decision, and next-action claims cite those evidence events within coverage.
- `ADDED tools` **Generic MCP Connections MUST Receive an Unverified Connection Session** — When an MCP client that does not identify as a supported native host calls a tool without a session pair, the server MUST attribute the call to one server-assigned `mcp` session per connection, MUST finalize that session with a derived summary when the transport closes and otherwise leave it to lazy derivation, and MUST use it as the current session for previous-session selection in `mem_context` without a pair; this session MUST NOT authorize observation review or promotion or lifecycle summary submission, and native clients MUST keep their existing attribution.
  - GIVEN a generic MCP client that saves two memories without a session pair and then closes stdin; WHEN a later connection reads context; THEN both saves belong to one `mcp` connection session with a final derived summary shown as the previous-session summary, and an observation review attempted with that session's identity is rejected.

## Plan

Sequential units in this worktree, each a fresh `thoth-worker` session with test-first behavior changes (installed `tdd` skill) and a behavior-preserving `simplify` pass; root accepts each before the next starts.

1. **Core derivation (AC-1, AC-2)** — new `src/memory-core/session-summary-derivation.ts` (claim mapping, heading parser, watermark), wired into the lifecycle path of `src/memory-core/service.ts` (checkpoint/finalize without summary; `guide_post_compact` content as checkpoint evidence plus parsed summary), reusing `session-summaries.ts` validation and `sqlite/ledger.ts` event access. Tests in `tests/memory-core/` and `tests/integration/lifecycle.test.ts`.
2. **Recovery selection (AC-3, AC-4)** — `service.ts` selection (~900-982) and `src/memory-core/continuation.ts`: drop own-session summary from automatic recovery, make `guide_post_compact` use project recovery, add previous-session selection with lazy derivation and ordering, keep explicit `mem_context` session reads. Update `tests/integration/lifecycle.test.ts`, `tests/memory-core/context.test.ts`, continuation tests, and the benchmark fixture (`benchmarks/run.mjs`, `benchmarks/report.mjs`) to the new contract.
3. **MCP surface (AC-6)** — `src/server.ts`, `src/index.ts`, `src/tools/index.ts`: native-client detection via `getClientVersion()`, per-connection `mcp` session injection for sessionless calls, one idempotent shutdown path (stdin end/close, SIGINT/SIGTERM) that finalizes the connection session before closing the service, authority rejection for review/promotion/lifecycle summary submission, `mem_session` description noting `content` on `guide_post_compact`. Tests in `tests/tools/mcp.test.ts` (and a server close test).
4. **Host adapters (AC-5)** — compaction-identity event keys plus text forwarding in `src/integration/pi/{index,lifecycle}.ts`, `src/integration/adapters/index.ts`, `src/integration/opencode/plugin.ts`, `plugin/hooks/claude-hooks.json`, `integrations/claude-code/hooks/hooks.json` if needed, distribution lock via `scripts/sync-plugin-distribution.mjs`. Tests in `tests/integration/{pi-lifecycle,pi-native-plugin,adapters,opencode-native-plugin,public-plugin-runner}.test.ts`.
5. **Docs and Skills (AC-7)** — `README.md:137`, `docs/agent/native-lifecycle.md:63,101,103,110`, `docs/agent/persistence-retrieval.md:7,21`, canonical Skill `plugin/skills/thoth-mem/SKILL.md:114-115` then the sync script; run the broad checks.

Verification seams: focused Vitest files per unit (`tests/memory-core/**` and `tests/tools/**` with `--config vitest.unit.config.ts`; `tests/integration/**`, `tests/setup/**`, `tests/packaging/**` with `--config vitest.integration.config.ts`), then `pnpm test`, `pnpm run build`, `pnpm run integration:verify`, `pnpm run benchmark:fixture` (restore regenerated `benchmarks/results/fixture-report.json` if only timestamps change). Final verification by a fresh independent Oracle.

Risks: re-derivation loop if the watermark counts summary events; per-prompt recovery latency in Pi (derivation only when the watermark advances); concurrent sessions make "previous" ambiguous (most recent by activity, checkpoint kind when not ended); host summary formats are prompt-defined (evidence-only fallback); OpenCode summary timing is a source-ordering inference (degrade when absent); clientInfo is self-reported (attribution only); compaction text may hold sensitive data (shared privacy sanitation, same class as root prompts); packaging tests may fail locally on the pre-existing missing `npm-cli.js`.

## Tasks

- [x] AC-1: Deterministic summary derivation and host compaction parsing in memory-core
  - Outcome: service derives harness summaries for checkpoint/finalize without a submitted summary and turns `guide_post_compact` content into checkpoint evidence plus a parsed checkpoint summary
  - Known entrypoints and skill paths: `src/memory-core/service.ts` lifecycle (~1000-1090), `src/memory-core/session-summaries.ts`, `src/memory-core/contracts.ts`, `src/memory-core/sqlite/ledger.ts`; installed `tdd` and `simplify` skills
  - Inputs: this record's Decisions (mapping, heading table, watermark, idempotency key)
  - Dependencies: none
  - Output: new `src/memory-core/session-summary-derivation.ts`, lifecycle wiring, tests
  - Owner: thoth-worker
  - Writes: `src/memory-core/**`, `tests/memory-core/**`, `tests/integration/lifecycle.test.ts`
  - Interface boundaries: `mem_session` input contract unchanged except accepting `content` on `guide_post_compact`; observation and memory promotion untouched
  - Focused check and PASS evidence: `pnpm exec vitest run tests/memory-core --config vitest.unit.config.ts` and `pnpm exec vitest run tests/integration/lifecycle.test.ts --config vitest.integration.config.ts` pass with new derivation, parser, idempotency (retry returns original receipt), and no-loop tests (support after summary evidence); `pnpm exec tsc --noEmit -p .` clean
  - Return milestone: derivation and parser tests green
  - Stop / reassessment: a schema migration or contract field becomes necessary
- [x] AC-2: Covered by the AC-1 unit (host compaction text parsing)
  - Outcome: same unit as AC-1; parser and evidence-only fallback verified there
  - Known entrypoints and skill paths: as AC-1
  - Inputs: Pi default headings from Exploration
  - Dependencies: none
  - Output: parser tests for Pi format, a Claude-style format, and unrecognized text
  - Owner: thoth-worker
  - Writes: as AC-1
  - Interface boundaries: as AC-1
  - Focused check and PASS evidence: parser tests pass in the AC-1 run
  - Return milestone: with AC-1
  - Stop / reassessment: as AC-1
- [x] AC-3: Automatic recovery without own-session summaries and with project recovery after compaction
  - Outcome: recover, per-prompt refresh, and `guide_post_compact` exclude the session's own summary and render project recovery; explicit `mem_context` session reads unchanged
  - Known entrypoints and skill paths: `src/memory-core/service.ts` selection (~900-982), `src/memory-core/continuation.ts`
  - Inputs: accepted AC-1 unit output
  - Dependencies: AC-1 unit accepted
  - Output: selection changes and updated lifecycle/context/continuation tests
  - Owner: thoth-worker
  - Writes: `src/memory-core/**`, `tests/memory-core/**`, `tests/integration/lifecycle.test.ts`, `benchmarks/run.mjs`, `benchmarks/report.mjs`
  - Interface boundaries: host renderer caps unchanged; degraded/premature fail-closed preserved
  - Focused check and PASS evidence: `pnpm exec vitest run tests/memory-core --config vitest.unit.config.ts`, `pnpm exec vitest run tests/integration/lifecycle.test.ts --config vitest.integration.config.ts`, and `pnpm run benchmark:fixture` pass
  - Return milestone: recovery tests and fixture green
  - Stop / reassessment: a cap or contract change outside the record becomes necessary
- [x] AC-4: Previous-session summary with lazy derivation and ordering
  - Outcome: automatic recovery shows the previous session's newest summary after the newest open handoff, deriving it lazily when missing
  - Known entrypoints and skill paths: as AC-3
  - Inputs: accepted AC-1 unit output
  - Dependencies: AC-1 unit accepted (delivered in the same worker unit as AC-3)
  - Output: previous-session selector, lazy derivation call, ordering tests including concurrent and ended sessions
  - Owner: thoth-worker
  - Writes: as AC-3
  - Interface boundaries: as AC-3
  - Focused check and PASS evidence: ordering, lazy final/checkpoint, predecessor refresh across duplicate recover replays, idempotency, and cap tests pass in the AC-3 commands
  - Return milestone: with AC-3
  - Stop / reassessment: as AC-3
- [x] AC-6: Generic MCP per-connection session
  - Outcome: non-native MCP clients get one `mcp` connection session, finalized on transport close, without root authority
  - Known entrypoints and skill paths: `src/server.ts`, `src/index.ts`, `src/tools/index.ts`
  - Inputs: accepted AC-1 and AC-3/AC-4 unit outputs
  - Dependencies: AC-3/AC-4 unit accepted
  - Output: server/tool changes and MCP tests
  - Owner: thoth-worker
  - Writes: `src/server.ts`, `src/index.ts`, `src/tools/**`, `tests/tools/**`
  - Interface boundaries: exact six MCP tools; native client attribution unchanged
  - Focused check and PASS evidence: `pnpm exec vitest run tests/tools --config vitest.unit.config.ts` passes with connection-session, stdin-EOF finalize (not only explicit server.close), single-shutdown idempotency, and authority-rejection tests
  - Return milestone: MCP tests green
  - Stop / reassessment: the MCP SDK cannot expose client identity or transport close
- [x] AC-5: Host adapters forward compaction text
  - Outcome: Pi, Claude (both bundles), and OpenCode forward host compaction text on `guide_post_compact`; Codex unchanged; every native MCP launch (bundles, setup-written configs, Pi child) sets `THOTH_MEM_NATIVE_HOST`
  - Known entrypoints and skill paths: `src/integration/pi/{index,lifecycle}.ts`, `src/integration/adapters/index.ts`, `src/integration/opencode/plugin.ts`, `plugin/hooks/claude-hooks.json`, `integrations/claude-code/hooks/hooks.json`, `scripts/sync-plugin-distribution.mjs`
  - Inputs: accepted AC-6 unit output
  - Dependencies: AC-6 unit accepted
  - Output: adapter changes, hook registration, regenerated distribution lock, integration tests
  - Owner: thoth-worker
  - Writes: `src/integration/**`, `plugin/hooks/**`, `plugin/distribution-lock.json`, `integrations/**/hooks/**`, `tests/integration/**`
  - Interface boundaries: host failures degrade without blocking; no transcript parsing
  - Focused check and PASS evidence: `pnpm exec vitest run tests/integration --config vitest.integration.config.ts` passes with Pi, Claude PostCompact, and OpenCode forwarding tests, including two distinct compactions in one session plus an exact retry per host
  - Return milestone: integration tests green
  - Stop / reassessment: a host payload differs from the documented field
- [x] AC-7: Docs, Skills, and broad verification
  - Outcome: docs and Skills match the new behavior and the broad checks pass
  - Known entrypoints and skill paths: `README.md`, `docs/agent/native-lifecycle.md`, `docs/agent/persistence-retrieval.md`, `plugin/skills/thoth-mem/SKILL.md`, `scripts/sync-plugin-distribution.mjs`
  - Inputs: accepted AC-5 unit output
  - Dependencies: AC-5 unit accepted
  - Output: updated docs/Skills, synced copies, broad check results
  - Owner: thoth-worker
  - Writes: `README.md`, `docs/agent/**`, `plugin/skills/**`, `integrations/*/skills/**`, `plugin/distribution-lock.json`
  - Interface boundaries: canonical `.thoth/specs` change only at archive
  - Focused check and PASS evidence: `pnpm test`, `pnpm run build`, `pnpm run integration:verify`, `pnpm run benchmark:fixture` pass or exact pre-existing failures are reported
  - Return milestone: broad checks reported
  - Stop / reassessment: an unrelated pre-existing failure blocks a required check

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 1 (fresh Oracle): REJECT with three blockers (stdin EOF shutdown, OpenCode compaction key collision, Vitest config selection); repaired in this record for a fresh round.
Plan review round 2 (fresh Oracle): OKAY, envelope validated with validate-result.mjs --review-kind plan-review. Nonblocking caution: dist-consuming focused checks (public-plugin runner tests, benchmark fixture) need `pnpm run build` first.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 56788ba1661e3dcfe0306db20c268dfafe6b6d19d2ac397d91cb89517b958423

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. Independent review and read-only checks support AC-1–AC-7. No blocking implementation findings; observed test failures match the disclosed environmental failures.",
  "evidence": [
    {
      "id": "E1",
      "kind": "artifact",
      "locator": ".thoth/changes/session-summaries/session-summaries.md",
      "claim": "Independently recomputed prefix SHA-256 matches 56788ba1661e3dcfe0306db20c268dfafe6b6d19d2ac397d91cb89517b958423. Verify validator passes. All four canonical baseline digests match; git reports no spec changes, and LF-normalized contents match HEAD.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "code-and-tests",
      "locator": "src/memory-core/{session-summary-derivation.ts,service.ts,sqlite/ledger.ts}; tests/memory-core/session-summary-derivation.test.ts; tests/integration/lifecycle.test.ts",
      "claim": "Derivation implements the agreed mappings, bounded claims, same-session citations, host-heading parsing, non-summary watermark, original retry receipts, and evidence-only fallback. Host text remains sanitized evidence/summary, not memory or observation.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "code-and-tests",
      "locator": "src/memory-core/{service.ts,continuation.ts}; tests/memory-core/{context,continuation}.test.ts; tests/integration/pi-native-plugin.test.ts",
      "claim": "Automatic recovery excludes own summaries, selects one predecessor by non-summary activity, lazily refreshes it even on duplicate recover, preserves ordering/caps and explicit session reads, and keeps degraded/premature guidance fail-closed. Pi refresh uses ordinary recovery after compaction.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "code-and-tests",
      "locator": "src/integration/{adapters/index.ts,opencode/plugin.ts,pi}; plugin/hooks/claude-hooks.json; integrations/claude-code/hooks/hooks.json",
      "claim": "Pi entry IDs, Claude sanitized content, and OpenCode summary message IDs bind compaction forwarding. Lookup failures degrade safely; Codex does not harvest transcripts. Claude startup/clear/fork now recover. Native launch markers cover bundles, split descriptors, setup outputs, OpenCode and Pi.",
      "basis": "observed",
      "uncertainty": "Actual external host/model consumption was not exercised."
    },
    {
      "id": "E5",
      "kind": "code-and-tests",
      "locator": "src/{server,index}.ts; src/tools/index.ts; tests/tools/connection-session.test.ts; tests/integration/mcp-stdin-eof.test.ts",
      "claim": "Generic connections receive stable per-connection attribution and recovery selection without root authority. Reserved MCP identities are rejected across instances. Repeated closure is idempotent; the real stdin-EOF test persisted exactly one derived final summary and finalize receipt.",
      "basis": "observed",
      "uncertainty": "Signal handlers were inspected; OS-level signal delivery was not separately exercised."
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "build; TypeScript; integration inventory; Vitest; git diff --check",
      "claim": "Build, tsc, integration:verify and diff --check pass. Core/tools: 260 passed, one disclosed CRLF hash failure. Integration/setup/packaging: 215 passed, one skipped, five disclosed failures: four missing-npm-cli.js failures and the OpenCode checkout-name assumption. Benchmark report tests: seven passed. LF normalization independently reproduces the expected historical report hash.",
      "basis": "observed",
      "uncertainty": "Full packed installation remains unavailable in this environment."
    },
    {
      "id": "E7",
      "kind": "artifact-and-behavior",
      "locator": "scripts/verify-packed-plugins.mjs:444-455; benchmarks/report.mjs; benchmarks/results/fixture-report.json; plugin/distribution-lock.json",
      "claim": "Packed-smoke edits agree with implemented behavior; their exact Claude lifecycle assertions passed through the native normalizer and core. Existing fixture validates without regeneration. Inventory/lock verification passes and all four Skill copies are byte-identical to the canonical Skill.",
      "basis": "observed",
      "uncertainty": "The targeted lifecycle reproduction is not a packed-install smoke."
    },
    {
      "id": "E8",
      "kind": "documentation",
      "locator": "docs/agent/native-lifecycle.md: Pi lifecycle mapping, before_agent_start row",
      "claim": "One minor stale parenthetical still says post-compaction refresh replays the guidance key; implementation correctly switches to a recover key.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record binding and canonical baselines",
      "method": "Independent byte hashing, verify validator, Git comparison",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Record digest and reviewed baselines match."
    },
    {
      "check": "AC-1 and AC-2",
      "method": "Actual diff inspection and derivation/lifecycle tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6"],
      "reason": "Mapping, limits, citations, sanitation, retries and no-loop behavior satisfy the declared contracts."
    },
    {
      "check": "AC-3 and AC-4",
      "method": "Selector/renderer inspection and context, lifecycle and Pi tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6"],
      "reason": "Own-summary exclusion, predecessor refresh, ordering, caps and fail-closed behavior are preserved."
    },
    {
      "check": "AC-5",
      "method": "Adapter, hook, descriptor and setup review with integration tests",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6", "E7"],
      "reason": "Forwarding, compaction identity, native attribution and Claude startup recovery match the record."
    },
    {
      "check": "AC-6",
      "method": "Connection-session tests, real stdin-EOF subprocess test and shutdown inspection",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "Attribution, authority rejection, predecessor selection and idempotent finalization are verified."
    },
    {
      "check": "AC-7",
      "method": "Build, type-check, inventory/lock verification, fixture validation, focused tests and documentation review",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6", "E7", "E8"],
      "reason": "Required surfaces reflect the change; exact environmental exceptions are accounted for. Documentation has only minor nonblocking wording drift."
    },
    {
      "check": "Broad core/tools and integration/setup/packaging commands",
      "method": "Executed the two suggested Vitest commands",
      "outcome": "fail",
      "evidenceIds": ["E6"],
      "reason": "Six failures, all matching the disclosed environmental failures; no additional failures."
    },
    {
      "check": "pnpm test and benchmark:fixture regeneration",
      "method": "Intentionally omitted",
      "outcome": "not-run",
      "evidenceIds": ["E7"],
      "reason": "Assignment prohibits commands that rewrite the tracked fixture. Existing fixture was validated read-only instead."
    }
  ],
  "risks": [
    {
      "description": "Full packed-install smoke remains unverified because npm-cli.js is unavailable; focused runtime, packaging-contract and exact changed-assertion checks passed.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6", "E7"]
    },
    {
      "description": "The Pi before_agent_start documentation parenthetical should say recovery key rather than post-compaction guidance key.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E8"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root may validate and record this envelope, document the exact environmental exceptions, then run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/session-summaries/session-summaries.md",
    "reviewedRecordSha256": "56788ba1661e3dcfe0306db20c268dfafe6b6d19d2ac397d91cb89517b958423"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | tests/memory-core/session-summary-derivation.test.ts + tests/integration/lifecycle.test.ts | derivation mapping, limits, citations, non-summary watermark, original retry receipts (Oracle E2, E6)
- AC-2: PASS | parser tests (Pi headings + <modified-files>, Claude-style, unrecognized) | sanitized checkpoint evidence, evidence-only fallback, no memory/observation (Oracle E2)
- AC-3: PASS | tests/memory-core/{context,continuation}.test.ts, lifecycle and Pi plugin tests | own-summary exclusion incl. post-compact and Pi refresh; explicit reads and fail-closed preserved (Oracle E3)
- AC-4: PASS | context/lifecycle tests + benchmark report tests | predecessor by non-summary activity, lazy final/checkpoint, refresh on duplicate recover, ordering and caps (Oracle E3, E6)
- AC-5: PASS | tests/integration/{adapters,pi-native-plugin,opencode-native-plugin,public-plugin-runner}.test.ts + integration:verify | Pi entry id / Claude content / OpenCode message id keys, Claude startup recover, native markers in all launches (Oracle E4, E7)
- AC-6: PASS | tests/tools/connection-session.test.ts + tests/integration/mcp-stdin-eof.test.ts | per-connection mcp attribution, namespace authority rejection across instances, single EOF finalize (Oracle E5)
- AC-7: PASS | build, tsc, integration:verify, Vitest suites, lock/Skill sync | docs and Skills updated; only disclosed environmental failures (Oracle E6, E7, E8)
- Source: .thoth/specs/retrieval/spec.md | sha256:4394ab103e5574c74c666ff28b087c659b4ad622ef3cc3a006221dccfe9b96f5
- Source: .thoth/specs/harness-integration/spec.md | sha256:c402e9f42a242484e7df3faa91fc3442dcca9b416d3ef2b59221347a0181a5e9
- Source: .thoth/specs/store/spec.md | sha256:58dccc6836cb119401df258d99d367cb5c11b9c7f7e8b620ec86c47f2c00ba55
- Source: .thoth/specs/tools/spec.md | sha256:82e5cd3f89612a7e846643a23977f759950cdef482f8c4bfd510ffe53f983d4f

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Environmental exceptions accepted (pre-existing, reproduced or LF-verified): tests/memory-core/retrieval.test.ts:233, tests/benchmarks lexical-comparison-report and longmemeval-compare CRLF report hashes, packed-plugin smoke and packaging tests needing an adjacent npm-cli.js, tests/setup/native-opencode.test.ts checkout-name assumption. Follow-up: the nonblocking docs/agent/native-lifecycle.md Pi before_agent_start parenthetical (recover key) is fixed separately after archive. Packed-install and real-host smokes remain unverified in this environment.
