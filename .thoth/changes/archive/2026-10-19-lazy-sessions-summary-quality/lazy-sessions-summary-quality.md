# Change: lazy-sessions-summary-quality

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

Live dogfooding of master `80f9ede` (compact tools + session summaries) in Pi 1.3.0 on 2026-10-19, checked read-only in `~/.thoth-mem/memory.sqlite` and confirmed by two Explorer reports:

- Empty sessions: `MemoryService.lifecycle` (`src/memory-core/service.ts:1048-1049`) calls `ensureSession` (`src/memory-core/sqlite/ledger.ts:90-96`, `INSERT INTO sessions`) before every operation, including `enroll`, `recover` and `finalize`. Pi enrolls and recovers at every `session_start` (`src/integration/pi/index.ts:127-135`), OpenCode enrolls on `session.created` (`src/integration/opencode/plugin.ts:147`), and Codex/Claude Code recover at `SessionStart` (`src/integration/adapters/index.ts:63-66,85-86`). Opening and closing a host without activity therefore leaves 0-event sessions: 430 Pi, 138 Codex, 13 OpenCode, and 1 Claude Code sessions exist today (6,766 empty `import` sessions are importer-owned). Recovery does not need a session row: `context` tolerates a missing session (`service.ts:904-923`), previous-session selection uses actual non-summary activity (`ledger.ts:121-131`), and `lifecycle_receipts` has no foreign key to `sessions` (`schema.ts:107`). Session-attributed `save` already creates sessions on first use (`service.ts:433`). The Pi recovery check compares the returned `sessionId` with the deterministic expected ID (`src/integration/recovery.ts:46-47`).
- Missing finalize on quit: Pi awaits extension `session_shutdown` handlers on `/quit`, double Ctrl+C, and Ctrl+D (`interactive-mode.js:2683-2686,3465-3477,3506-3519`), and 185 Pi sessions with activity ended normally. The user closed the Orca terminal tab both times. A throwaway probe under `orca terminal close` (`ptyKilled: true`) received no SIGHUP/SIGINT/SIGTERM/SIGBREAK and ran no `exit` handler, and both the process and its piped child died at once. No in-process code can finalize after a tab close, and lazy previous-session derivation already produced the missing summary (v5, a checkpoint).
- Summary quality (`src/memory-core/session-summary-derivation.ts`): objectives are the first and latest distinct root prompts with no substance filter (`:79-86`), so "Ya hice /reload" became an objective. Memory claims copy the whole memory content up to 2,000 code points (`:107,125-128`), which produced summaries of 13.4k characters and summary evidence of 19,896 characters. The compaction parser maps the split-turn `## Original Request` preamble ("No explicit user-typed request is visible…") to an objective and appends one `changed_surface` claim per modified-files block without dedup (`:17,24-39,61-72`). There is no claim deduplication.
- Summaries budget: `projectSummaries` (`service.ts:881-901`) measures each whole hydrated record and breaks before an oversized first record, so `budget_chars` 4000 returned `items: []` with `payload_truncated` while a 13,404-character summary existed. Timeline instead shrinks items to fit (`service.ts:199-227`).
- Recovery renders the same claims (`service.ts:920-959`, `continuation.ts:94-110`). Same-watermark derivation reuses the current summary, and the derived event key excludes the generator version (`service.ts:1023-1028`).

## Intent

Opening and closing any host without activity leaves no trace for that session. Existing empty host sessions are removed. Derived summaries are compact and meaningful. `mem_project action=summaries` never hides an oversized summary. The tab-close limitation is documented instead of worked around.

## Non-goals

- No in-process signal handling or orphaned-session detection for killed host processes (user decision: accept and document).
- No regeneration of existing summaries; they stay until new activity moves the watermark.
- No change to the six MCP / five Pi tool definitions, the recovery caps, or the summary submission contract limits.
- No change to importer (`import` harness) sessions.
- No push, publish, or real-host smoke.

## Acceptance

- AC-1: For a root session with no persisted session, `enroll`, `recover`, `finalize`, and `capture_root` without sanitized content create no session row, lifecycle receipt, or summary for that root session in any harness, including a generic MCP connection that closes without saves. With a verified identity, `recover` still returns the project recovery block and the deterministic session ID. A degraded-identity no-op keeps outcome `degraded`, selects and derives no recovery context, and reports `memoryConfirmed` and `contextDelivered` as false (the existing degraded-recover regression test stays green). Operations on an existing session keep their current receipts and effects.
- AC-2: The first real activity creates the session: `capture_root` with content, `checkpoint_pre_compact`, `guide_post_compact`, or a session-attributed `mem_save`. A Pi adapter sequence of start, recover, then resume-away or quit without input leaves no session row or receipt for the untouched session.
- AC-3: The next schema migration takes the standard backup and then deletes every non-import session that no row references, together with that root session's lifecycle receipts that cite no evidence or summary. It keeps `import` sessions and every referenced session. Rerunning it is a no-op.
- AC-4: Derived objectives come only from substantive root prompts, meaning at least 40 code points after whitespace normalization: the first such prompt and the latest distinct one, each bounded to 300 code points. When no prompt is substantive, the first prompt is used.
- AC-5: Each memory-derived claim is the memory title plus its primary labeled line, bounded to 300 code points. The primary line is `Result` for direct memories, `First pending action` for open handoffs, the closing `Result` for closed handoffs, and otherwise the first line. Claims with identical kind and content collapse into one claim with combined supports, up to the support limit. The generator becomes `thoth-mem.session-evidence.v2`. A realistic v2 previous-session summary renders at least one non-next-action claim in the recovery block within the existing caps.
- AC-6: Compaction parsing yields at most one objective, from the first objective section. The paths from every modified-files section or block merge into one deduplicated `changed_surface` claim in first-seen order. Each compaction claim is bounded to 300 code points. A fixture shaped like Pi's split-turn text (main summary + Turn Context with an `## Original Request` preamble and repeated file blocks) passes.
- AC-7: `mem_project action=summaries` returns an oversized record in bounded form within `budget_chars`: its ID, kind, version, status, coverage, generator, and the leading claims that fit, with the last claim clipped if needed and the item marked truncated. It then stops with `payload_truncated`, so a budget that can hold one record's metadata never yields an empty list while summaries exist.
- AC-8: Agent docs describe lazy session creation, the empty-session migration, derivation v2 rules, bounded summary listing, and the tab-close limitation, which recommends `/quit`, double Ctrl+C, or Ctrl+D for a clean close.

## Clarifications

- How the user quit Pi: by closing the Orca terminal tab (answer to the question tool).
- Where to fix empty sessions: in the core, for all hosts.
- What an untouched session leaves behind: nothing, neither a session nor receipts.
- Existing empty sessions: delete them with a migration.
- Tab-close finalize: accept it and document it, with no new code.

## Decisions

- D1: Session creation is lazy in the core for every harness. `enroll`, `recover`, and `finalize` never create a session. Activity operations and session-attributed saves do.
- D2: Lifecycle operations for a nonexistent session write nothing for that session: no row, receipt, or summary. Lazy derivation of the previous session's summary during `recover` is still allowed, because it writes to another session.
- D3: The migration also deletes the deleted sessions' lifecycle receipts that cite no evidence or summary, consistent with D2. It never touches `import` sessions or any referenced session.
- D4: No-op lifecycle results keep the existing confidence-dependent outcome: `confirmed` for a verified identity and `degraded` for degraded identity. They carry null `evidenceId`/`summaryId`, `duplicate` false, and the deterministic session ID. A degraded recover still selects and derives no context and reports `memoryConfirmed` and `contextDelivered` as false. No new outcome value is added. (Repair after the plan-review REJECT, round 1.)
- D5: `guide_post_compact` without a prior session keeps its current behavior (it creates the session and records a degraded `precompact_unconfirmed` receipt), because compaction is activity.
- D6: The generator identity bumps to `thoth-mem.session-evidence.v2`. Existing summaries are not regenerated; same-watermark reuse is unchanged.
- D7: The thresholds are 40 code points for a substantive prompt and 300 code points per derived objective, memory, or compaction claim. 300 fits the recovery renderer's allowance of about 480 code points for non-next-action claims; 500 never could. Existing submission limits (32 claims, 2,000 code points per claim, 16 supports, 20,000 UTF-16 units) are unchanged.
- D8: The tab-close finalize gap is a documented host limitation, with no code workaround.

## Durable deltas

- `ADDED harness-integration` **Lifecycle Operations MUST Create Sessions Only on Session Activity** — For a root session that has no persisted session, `enroll`, `recover`, `finalize`, and `capture_root` without sanitized content MUST create no session, lifecycle receipt, or summary for that root session in any harness or generic MCP connection, while `recover` MUST still render the project recovery selection for a verified identity, report the deterministic session identity, and keep a degraded-identity outcome degraded with no selected or derived context; root prompt capture with content, `checkpoint_pre_compact`, `guide_post_compact`, and session-attributed saves MUST create the session on first use; lifecycle operations on an existing session MUST keep their receipts and effects; and a session whose host process is killed before finalize, such as by closing an Orca terminal tab on Windows, MUST remain covered by lazy previous-session summary derivation.
  - GIVEN Pi starts a session, injects recovery, and the user then resumes another session or quits without typing; WHEN enroll, recover, and finalize run for the untouched session; THEN no session row, lifecycle receipt, or summary exists for it, the recovery block was still rendered, and only a session that receives a typed prompt is created.
- `ADDED store` **Schema Migration MUST Remove Empty Host Sessions** — The schema migration that introduces lazy session creation MUST, after the standard pre-migration backup, delete every session of a non-import harness that no session event, evidence, summary, memory, observation, receipt citing evidence or summary, or other row references, together with that root session's lifecycle receipts that cite no evidence or summary, and MUST keep import-harness sessions and every referenced session unchanged.
  - GIVEN a database with an empty Pi session holding only enroll, recover, and finalize receipts, an empty import session, and a Codex session with one root prompt; WHEN the migration runs; THEN only the empty Pi session and its receipts are removed, a backup exists, and rerunning the migration changes nothing.
- `MODIFIED store` **Session Summaries MUST Be Derived Deterministically When Not Supplied** — When `checkpoint_pre_compact` or `finalize` carries no submitted summary, or the previous session needed by automatic recovery has no current summary covering its latest non-summary evidence, the service MUST derive a harness-generated summary with generator `thoth-mem.session-evidence.v2` without any model or network call from that session's own evidence: substantive root prompts (at least 40 code points after whitespace normalization; the first and the latest distinct one, or only the first prompt when none is substantive) as objective bounded to 300 code points; promoted decision, convention, architecture, and preference memories as decision; discovery and project-structure memories as completed; failure memories as completed with outcome failed; open handoffs as next action; closed handoffs as completed; and the newest parsed host compaction claims; each memory-derived claim MUST state the memory title with its primary labeled line (Result for direct memories, First pending action for open handoffs, the closing Result for closed handoffs, otherwise the first line) bounded to 300 code points, claims with identical kind and content MUST collapse into one claim citing their combined supports within the support limit, every claim MUST cite in-session evidence inside its coverage and respect the existing claim and size limits, a session without citable evidence MUST receive no summary, and a lazily derived summary MUST be final only when the session has ended and checkpoint otherwise.
  - GIVEN an ended Codex session whose root prompts are "Ya hice /reload" and a 120-code-point request, one decision memory with long Result and Rationale lines, one open handoff, and no submitted summary; WHEN finalize runs or a later session's recovery needs it; THEN exactly one v2 harness final summary exists whose only objective is the substantive request, whose decision claim is the memory title with its Result line within 300 code points, and whose next-action claim carries the handoff's first pending action, all citing in-session evidence within coverage.
- `MODIFIED harness-integration` **Host Compaction Text MUST Become Cited Checkpoint Evidence** — When `guide_post_compact` carries host compaction text, the service MUST sanitize and store it as `checkpoint` session evidence and MUST derive a harness checkpoint summary only from recognized section headings (goal, request, or intent as objective; done or completed as completed; in progress or pending as pending; blocked as blocker; decisions as decision; next steps as next action; modified files as changed surface), each claim citing that evidence and bounded to 300 code points; only the first objective section MUST yield an objective, the file paths of every modified-files section or block MUST merge into one changed-surface claim in first-seen order without duplicates, text without recognized headings MUST remain evidence only, and the text MUST never become a memory or observation.
  - GIVEN Pi split-turn compaction text with Goal, Done, In Progress, Key Decisions, and Next Steps sections, a later Original Request section, and two modified-files blocks with overlapping paths, plus another text with no recognized headings; WHEN each arrives on `guide_post_compact`; THEN the first yields a checkpoint summary with one objective from Goal, completed, pending, decision, and next-action claims, and one changed-surface claim listing each path once, all citing its evidence, and the second yields evidence only.
- `ADDED tools` **mem_project Summaries MUST Return Oversized Records in Bounded Form** — `mem_project action=summaries` MUST list summaries newest first within `budget_chars`; when a record does not fit the remaining budget, the response MUST include it in bounded form with its identifiers, kind, version, status, coverage, and generator plus as many leading claims as fit, clipping the last included claim when necessary and marking the item truncated, and MUST then stop with `payload_truncated`, so a budget able to hold one record's metadata never yields an empty list while summaries exist; the full record MUST remain available through `mem_get`.
  - GIVEN a project whose only summary serializes to 13,000 characters; WHEN `mem_project action=summaries` runs with `budget_chars` 4000; THEN it returns that summary's ID and metadata with leading claims within 4,000 characters, marks it truncated, and warns `payload_truncated`.

## Plan

The work is sequential and test-first (`tdd`), with one worker per unit followed by a `simplify` pass. Code is strict TypeScript with ESM `.js` imports. There are no commits and no edits to `dist/`. Workers do not edit this record.

1. **Lazy sessions (AC-1, AC-2).** In `MemoryService.lifecycle`, resolve the session without inserting it (a ledger lookup plus the deterministic ID helper used by `ensureSession`). For `enroll`, `recover`, `finalize`, and `capture_root` without content on a missing session, return a no-op result per D4 without writing a receipt. With a verified identity, `recover` still renders recovery, which may lazily derive the previous session's summary. With degraded identity it stays degraded and selects and derives no context (`tests/integration/lifecycle.test.ts:329-340` must stay green). Activity operations keep calling `ensureSession`. Check the generic MCP connection close path (`src/server.ts` / tools) and the adapters (Pi, OpenCode, Codex, Claude Code) for assumptions that a row exists, and update tests that relied on enroll creating rows. Seams: `tests/integration/lifecycle.test.ts`, `tests/memory-core/context.test.ts`, `tests/integration/pi-native-plugin.test.ts`, `tests/tools/mcp.test.ts`.
2. **Empty-session migration (AC-3).** Add the next schema version in `src/memory-core/sqlite/migrations.ts` / `schema.ts`, following the existing backup convention (`memory.sqlite.pre-vN.bak`). It deletes unreferenced non-import sessions after checking every table that references sessions, including `observation_reviews.reviewer_session_id`, `legacy_import_rows.session_id`, and the composite identity of `lifecycle_receipts`, together with their receipts that cite no evidence or summary. When raising the current revision, pin the historical revision-9 migration target to 10, and cover both the 9→10→11 and 10→11 paths. Seam: `tests/memory-core/schema-migration.test.ts`.
3. **Derivation v2 (AC-4, AC-5, AC-6).** In `session-summary-derivation.ts`, add the substantive-prompt filter, title-plus-primary-line memory claims, claim dedup, the compaction changes (first objective only, merged changed-surface paths, 300-code-point bound), and the generator v2 identity. Seams: `tests/memory-core/session-summary-derivation.test.ts` (update the verbatim-content expectations), `tests/memory-core/continuation.test.ts` (a realistic v2 summary renders at least one non-next-action claim within the unchanged caps), `tests/integration/lifecycle.test.ts`.
4. **Bounded summaries listing (AC-7).** In `projectSummaries` (`service.ts:881-901`) and the tool mapping (`src/tools/index.ts:353`), shrink an oversized record in the way timeline does and mark it truncated. Tool descriptions are unchanged, so the budget tests stay green. Seam: `tests/tools/mcp.test.ts` plus a memory-core test.
5. **Docs (AC-8).** `docs/agent/native-lifecycle.md` (lazy sessions, tab-close limitation, clean-quit keys) and `docs/agent/persistence-retrieval.md` (derivation v2, migration, bounded listing). No code.

Verification: `pnpm exec tsc --noEmit`; `pnpm exec vitest run --config vitest.unit.config.ts`; `pnpm run build` then `pnpm exec vitest run --config vitest.integration.config.ts`. The known environmental failures are the CRLF hashes, adjacent `npm-cli.js`, and the OpenCode checkout name. Do not run `pnpm test` or `benchmark:fixture`, because they rewrite tracked reports. After an independent Oracle PASS and archive, run the live Pi dogfood: open and close Pi without typing leaves no row, the migration removes existing empty sessions, and a new summary is v2 and compact.

Risks:
- Many tests assume enroll creates a row.
- The Pi recovery `sessionId` check needs the deterministic ID without a row.
- The migration deletes user data, but only unreferenced rows and only after a backup.
- Generic MCP close must stay a no-op without saves.
- Changing derivation changes recovery text.

## Tasks

- [x] AC-1: Core lifecycle no-op for untouched sessions across all harnesses
  - Outcome: enroll, recover, finalize, and empty capture on a missing session write nothing for it; recover still renders recovery; existing sessions are unchanged
  - Known entrypoints and skill paths: src/memory-core/service.ts (lifecycle ~1041-1127, context ~904-959), src/memory-core/sqlite/ledger.ts (ensureSession ~90-96), src/integration/recovery.ts:46-47, src/server.ts, src/tools/index.ts; skills tdd, simplify
  - Inputs: Exploration, decisions D1, D2, D4, and D5
  - Dependencies: none
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: src/memory-core/service.ts, src/memory-core/sqlite/ledger.ts, src/server.ts or src/tools/index.ts only if the MCP close path needs it, related tests under tests/memory-core, tests/integration, and tests/tools
  - Interface boundaries: LifecycleResult shape unchanged; mem_session tool contract; adapters' recovery identity check
  - Focused check and PASS evidence: new failing-then-passing tests for every no-op operation and harness, including a generic MCP connection closed without saves and degraded-identity no-ops (still degraded, no context, no writes); the existing degraded-recover test stays green; tsc clean; unit + integration suites green except the known environmental failures
  - Return milestone: tests green with the diff summary
  - Stop / reassessment: an adapter or contract that requires a session row for recover, or a need for a new outcome value
- [x] AC-2: First activity creates the session; the Pi untouched start/resume/quit sequence leaves nothing
  - Outcome: capture with content, pre/post-compact, and session-attributed saves create the session; a Pi adapter integration test proves that the untouched sequence writes no row or receipt
  - Known entrypoints and skill paths: src/integration/pi/index.ts, src/integration/pi/lifecycle.ts, tests/integration/pi-native-plugin.test.ts, tests/integration/lifecycle.test.ts; skills tdd, simplify
  - Inputs: accepted AC-1 unit output
  - Dependencies: AC-1 core no-op unit
  - Output: tests (adapter code only if needed)
  - Owner: thoth-worker (the same unit as AC-1, delivered together)
  - Writes: the tests above; Pi adapter files only if required
  - Interface boundaries: Pi hook mapping unchanged
  - Focused check and PASS evidence: Pi adapter test against a real temporary database shows zero sessions and receipts for the untouched root and exactly one session after a typed prompt
  - Return milestone: delivered together with AC-1
  - Stop / reassessment: Pi hooks that require changes to their event mapping
- [x] AC-3: Migration removes existing empty host sessions and their lifecycle-only receipts
  - Outcome: next schema version with the backup; deletes only unreferenced non-import sessions and their receipts that cite no evidence or summary; idempotent
  - Known entrypoints and skill paths: src/memory-core/sqlite/migrations.ts, src/memory-core/sqlite/schema.ts, existing migration tests in tests/memory-core; skills tdd, simplify, SQLite skill at C:\Users\EremesNG\orca\workspaces\thoth-mem\context\.agents\skills\sqlite\SKILL.md
  - Inputs: decision D3; current schema version and backup convention
  - Dependencies: accepted AC-1/AC-2 unit
  - Output: migration + tests
  - Owner: thoth-worker
  - Writes: src/memory-core/sqlite/migrations.ts, src/memory-core/sqlite/schema.ts, migration tests
  - Interface boundaries: every table that references sessions (session_events, evidence, session_summaries, memories, observations, save_receipts, lifecycle_receipts, and others found)
  - Focused check and PASS evidence: a migration test with empty Pi/Codex sessions, an empty import session, and referenced sessions (including observation reviewer and legacy import references) shows only the unreferenced non-import sessions and their lifecycle-only receipts deleted, the backup created, and a rerun as a no-op, on both the 9→10→11 and 10→11 paths
  - Return milestone: tests green
  - Stop / reassessment: a reference that cannot be determined safely, or empty sessions that other rows reference
- [x] AC-4: Substantive-prompt objectives in derivation v2
  - Outcome: objectives only from prompts of at least 40 code points (first + latest distinct), bounded to 300 code points, falling back to the first prompt
  - Known entrypoints and skill paths: src/memory-core/session-summary-derivation.ts:79-86, tests/memory-core/session-summary-derivation.test.ts; skills tdd, simplify
  - Inputs: decisions D6 and D7
  - Dependencies: accepted AC-3 unit (sequential worker rule)
  - Output: code + tests
  - Owner: thoth-worker (one derivation unit covering AC-4, AC-5, and AC-6)
  - Writes: src/memory-core/session-summary-derivation.ts, src/memory-core/contracts.ts only for the generator identity, derivation, continuation, and lifecycle tests
  - Interface boundaries: summary submission limits unchanged; recovery rendering consumes the claims
  - Focused check and PASS evidence: tests with trivial and substantive prompts plus the fallback
  - Return milestone: delivered with AC-5 and AC-6
  - Stop / reassessment: a spec conflict with an existing summary contract
- [x] AC-5: Compact title-plus-primary-line memory claims, dedup, and generator v2
  - Outcome: memory claims bounded to 300 code points with title + primary labeled line; identical claims collapse; generator `thoth-mem.session-evidence.v2`
  - Known entrypoints and skill paths: src/memory-core/session-summary-derivation.ts:97-145, src/memory-core/session-summaries.ts; skills tdd, simplify
  - Inputs: decisions D6 and D7
  - Dependencies: the same unit as AC-4
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: as in AC-4
  - Interface boundaries: canonical submission canonicalization; recovery renderer
  - Focused check and PASS evidence: derivation tests for direct memories, open/closed handoffs, failures, dedup, and the generator name; a continuation test shows a realistic v2 previous-session summary rendering at least one non-next-action claim within the unchanged caps
  - Return milestone: delivered with AC-4 and AC-6
  - Stop / reassessment: dedup that would break support-limit invariants
- [x] AC-6: Compaction parsing with one objective, merged changed surface, and bounded claims
  - Outcome: only the first objective section counts; the paths of all modified-files blocks merge into one deduplicated claim; claims are bounded to 300 code points; a Pi split-turn fixture passes
  - Known entrypoints and skill paths: src/memory-core/session-summary-derivation.ts:10-73 (parseHostCompactionClaims); skills tdd, simplify
  - Inputs: the Pi split-turn compaction shape (main summary, then `**Turn Context (split turn):**` with `## Original Request`, then repeated read/modified-files blocks)
  - Dependencies: the same unit as AC-4
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: as in AC-4
  - Interface boundaries: guide_post_compact persistence path in service.ts unchanged
  - Focused check and PASS evidence: the split-turn fixture yields one objective (Goal) and one changed_surface claim with unique paths; existing parser tests are still green
  - Return milestone: the derivation unit returns with all three ACs
  - Stop / reassessment: heading detection that cannot distinguish sections without language-specific heuristics
- [x] AC-7: Bounded mem_project summaries listing
  - Outcome: an oversized record is returned in bounded form, marked truncated, with payload_truncated; never an empty list when a record's metadata fits
  - Known entrypoints and skill paths: src/memory-core/service.ts:881-901 (projectSummaries), src/memory-core/service.ts:199-227 (timeline shrinking convention), src/tools/index.ts:353; skills tdd, simplify
  - Inputs: Exploration G2
  - Dependencies: accepted derivation unit (sequential worker rule)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: src/memory-core/service.ts (projectSummaries only), src/tools/index.ts only if the item mapping needs the flag, tests/tools/mcp.test.ts or memory-core tests
  - Interface boundaries: tool descriptions unchanged (budget tests); mem_get full expansion
  - Focused check and PASS evidence: a 13k-character summary listed with budget 4000 returns one bounded item marked truncated within budget; tool budget tests are still green
  - Return milestone: tests green
  - Stop / reassessment: an output schema that forbids the truncated marker
- [x] AC-8: Agent docs for lazy sessions, migration, derivation v2, bounded listing, and the tab-close limitation
  - Outcome: durable docs updated to match the behavior
  - Known entrypoints and skill paths: docs/agent/native-lifecycle.md, docs/agent/persistence-retrieval.md
  - Inputs: accepted outputs of all code units
  - Dependencies: accepted AC-7 unit
  - Output: documentation edits
  - Owner: thoth-worker
  - Writes: docs/agent/native-lifecycle.md, docs/agent/persistence-retrieval.md
  - Interface boundaries: packaged Skill copies unchanged unless they state that enroll creates sessions
  - Focused check and PASS evidence: docs mention each behavior; packaging/skill-lock tests are still green if a skill changes
  - Return milestone: docs diff ready
  - Stop / reassessment: packaged skill text that requires a lock refresh

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 (fresh Oracle): REJECT with one blocker, the degraded-identity no-op; repaired in D4, AC-1, plan step 1, and the lifecycle delta.
Round 2 (fresh Oracle): OKAY, validated with validate-result.mjs --review-kind plan-review (exit 0); the stale 500 literal in plan step 3 was corrected to 300.
The user explicitly selected Oracle review and then explicitly selected Implement on 2026-10-19.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 693e3424882ed31310e94f023168344349270441303bdbce6a407f2674830dea

A fresh read-only Oracle (not an implementer) produced this envelope. Root validated it with validate-result.mjs --review-kind final-verification --record-sha256 693e3424…0dea (exit 0, valid, no issues).
Known environmental failures: 7 unit tests (CRLF report hashes) and 5 integration tests (adjacent npm-cli.js, OpenCode checkout name). All other checks passed.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1–AC-8, D1–D8, and all five durable deltas are satisfied. Observed test failures are limited to the declared environmental failures.",
  "evidence": [
    {
      "id": "binding",
      "kind": "record-and-baselines",
      "locator": ".thoth/changes/lazy-sessions-summary-quality/lazy-sessions-summary-quality.md",
      "claim": "Independently hashed the exact 29,495 UTF-8 bytes before ## Authorization: 693e3424882ed31310e94f023168344349270441303bdbce6a407f2674830dea. Source digests match: store ff8b564e6774f2135bef39c6e71aa4cf950b019fc5d57a3ae949b88d1ec6ec04; harness-integration ccb14bec7b5db0e1c5e00eb0843738c6c8ea91e8ebbe567f6897990fa61d93f4; tools 871d80579112f2ede65a9dd2f24b1268fb2a0db6bbe4e17063b94323fca95ca7. Structural verification is valid.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac1",
      "kind": "implementation-and-tests",
      "locator": "src/memory-core/service.ts:1070-1129; src/memory-core/sqlite/ledger.ts:90; tests/memory-core/lifecycle.test.ts; tests/tools/connection-session.test.ts",
      "claim": "Missing-session no-ops preserve deterministic identity without session, receipt, evidence, or summary writes across all harnesses. Verified recovery selects predecessor context; degraded recovery selects and derives none and reports both capabilities false. Existing-session receipts, duplicate detection, and changed-payload rejection remain covered. Generic MCP close without saves leaves no session.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac2",
      "kind": "implementation-and-tests",
      "locator": "tests/memory-core/lifecycle.test.ts; tests/integration/pi-native-plugin.test.ts",
      "claim": "Contentful capture, precompact, postcompact, and attributed saves create the session. Premature postcompact retains degraded precompact_unconfirmed behavior. Pi start/recover/resume-or-quit leaves untouched roots absent; typed input creates exactly the active root.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac3",
      "kind": "migration-safety",
      "locator": "src/memory-core/sqlite/migrations.ts:452-527; src/memory-core/sqlite/schema.ts; tests/memory-core/schema-migration.test.ts",
      "claim": "Deletion checks every direct session reference and the complete lifecycle composite identity; indirect memory/save references retain sessions through evidence. Import sessions and referenced rows survive. Tests cover exact verified backups, locked comparison, mismatched-backup rejection, write exclusion, rollback after deletions, idempotency, and both 9→10→11 and 10→11. Historical migration explicitly records revision 10. The 30-second describe timeout changes no assertions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac4",
      "kind": "derivation",
      "locator": "src/memory-core/session-summary-derivation.ts:111-127; tests/memory-core/session-summary-derivation.test.ts",
      "claim": "Objectives use first/latest distinct substantive prompts after whitespace collapse, the 40-code-point threshold, 300-code-point clipping, and first-prompt fallback. Boundary, Unicode, normalization, and occurrence-order tests pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac5",
      "kind": "derivation-and-recovery",
      "locator": "src/memory-core/session-summary-derivation.ts:26-31,140-198; tests/memory-core/session-summary-derivation.test.ts; tests/memory-core/continuation.test.ts",
      "claim": "Title-plus-primary-line claims handle direct memories and open/closed handoffs; kind/content dedup merges supports within 16 and preserves failed outcomes. Generator is v2. Same-watermark v1 reuse and same-session citations remain intact. Realistic v2 recovery renders an objective within unchanged 1,000-code-point and record caps; submission limits are unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac6",
      "kind": "compaction-parsing",
      "locator": "src/memory-core/session-summary-derivation.ts:40-108; tests/memory-core/session-summary-derivation.test.ts",
      "claim": "Only the first objective section contributes. Markdown and repeated XML modified-file blocks merge into one first-seen deduplicated claim. Claims remain sanitized and bounded to 300 code points. The Pi split-turn fixture and existing evidence-only cases pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac7",
      "kind": "bounded-listing",
      "locator": "src/memory-core/service.ts:881-930; tests/memory-core/session-summaries.test.ts; tests/tools/mcp.test.ts",
      "claim": "Oversized summaries retain metadata and fitting leading claims, clip the last claim using serialized size and Unicode-safe prefixes, mark truncated, and stop with payload_truncated. Tests cover a 13k record at budget 4000, escaped Unicode, metadata floor, multi-record ordering, exact accounting, and unchanged full mem_get expansion.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "ac8",
      "kind": "documentation",
      "locator": "README.md; docs/agent/native-lifecycle.md; docs/agent/persistence-retrieval.md",
      "claim": "Documentation accurately covers lazy sessions, revision-11 cleanup and backup, v2 derivation, bounded listing, and killed-terminal limitations with /quit, double Ctrl+C, and Ctrl+D recommendations. No signal workaround was added.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "unit",
      "kind": "test-execution",
      "locator": "pnpm exec vitest run --config vitest.unit.config.ts",
      "claim": "548 tests: 541 passed, 7 failed; 38 files passed, 3 failed. Failures are lexical-comparison-report (3), longmemeval-compare (3), and retrieval.test.ts:233 (1). LF-normalizing the three immutable report files reproduces their pinned hashes; relevant benchmark code/tests are unchanged. No lifecycle, migration, derivation, listing, recovery, or MCP tool-budget failure occurred.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "integration",
      "kind": "test-execution",
      "locator": "pnpm exec vitest run --config vitest.integration.config.ts",
      "claim": "224 tests: 218 passed, 5 failed, 1 skipped; 24 files passed, 3 failed. Four failures require absent npm-cli.js adjacent to the selected Node executable; one is native-opencode.test.ts:148, whose unchanged ownership predicate assumes a checkout directory named thoth-mem rather than context. All other integration checks, including lifecycle, Pi, EOF, and Pi tool-budget coverage, passed.",
      "basis": "observed",
      "uncertainty": "Packed installation and smoke execution remain environmentally unavailable."
    },
    {
      "id": "scope",
      "kind": "worktree-and-checks",
      "locator": "git status --short; git diff; untracked tests/memory-core/lifecycle.test.ts",
      "claim": "Branch context and HEAD 2fc3d8f match dispatch. Reviewed all 17 tracked-file diffs and both untracked files. Tool definitions, schemas, recovery caps, dependencies, and adapter implementations are unchanged. tsc, build, and final diff-check exit successfully. Unit tests rewrote fixture-report.json with measured values, not merely line endings; restored exactly that authorized file using git checkout -- benchmarks/results/fixture-report.json and verified no remaining diff. Final scope contains no generated, dependency, or unrelated files.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record binding, Source digests, and structural gate",
      "method": "Independent Node SHA-256 calculation; node C:/DEV/Proyectos/Webstorm/thoth-agents/skills/thoth-sdd/scripts/validate.mjs --change .thoth/changes/lazy-sessions-summary-quality --through verify --json",
      "outcome": "pass",
      "evidenceIds": ["binding"],
      "reason": "Expected prefix and all three Source hashes match; validator reports valid=true."
    },
    {
      "check": "AC-1 and AC-2",
      "method": "Trace lifecycle and connection paths against passing unit/integration coverage.",
      "outcome": "pass",
      "evidenceIds": ["ac1", "ac2", "unit", "integration"],
      "reason": "Lazy no-ops, degraded recovery, existing-session behavior, first activity, and untouched Pi/MCP sequences satisfy their contracts."
    },
    {
      "check": "AC-3",
      "method": "Audit schema references, deletion predicate, backup transaction, and executed migration regressions.",
      "outcome": "pass",
      "evidenceIds": ["ac3", "unit"],
      "reason": "Complete reference protection, verified backup, rollback, idempotency, and both upgrade paths are covered."
    },
    {
      "check": "AC-4, AC-5, and AC-6",
      "method": "Inspect derivation/parser diff and passing derivation, context, continuation, and lifecycle tests.",
      "outcome": "pass",
      "evidenceIds": ["ac4", "ac5", "ac6", "unit", "integration"],
      "reason": "Substance filtering, compact claims, deduplication, v2 identity, compaction parsing, and unchanged recovery limits hold."
    },
    {
      "check": "AC-7",
      "method": "Inspect clipping algorithm and passing service/MCP bounded-listing tests.",
      "outcome": "pass",
      "evidenceIds": ["ac7", "unit"],
      "reason": "Metadata survives whenever it fits; claims are bounded and truncation is truthful."
    },
    {
      "check": "AC-8",
      "method": "Review all documentation changes against implementation.",
      "outcome": "pass",
      "evidenceIds": ["ac8"],
      "reason": "All required durable behavior and clean-close guidance are documented."
    },
    {
      "check": "D1–D8 and five durable deltas",
      "method": "Compare decisions and deltas with implementation, canonical baselines, and tests.",
      "outcome": "pass",
      "evidenceIds": ["binding", "ac1", "ac2", "ac3", "ac4", "ac5", "ac6", "ac7", "ac8", "scope"],
      "reason": "D1–D5 match lifecycle/migration behavior; D6–D7 match v2 derivation and unchanged limits; D8 remains documentation-only. All five deltas align with their reviewed canonical baselines."
    },
    {
      "check": "pnpm exec tsc --noEmit",
      "method": "Executed requested command.",
      "outcome": "pass",
      "evidenceIds": ["scope"],
      "reason": "Exit 0; no diagnostics."
    },
    {
      "check": "pnpm exec vitest run --config vitest.unit.config.ts",
      "method": "Executed full unit suite.",
      "outcome": "fail",
      "evidenceIds": ["unit"],
      "reason": "541 passed, 7 failed; only confirmed pre-existing CRLF report-hash failures."
    },
    {
      "check": "pnpm run build",
      "method": "Executed before integration suite.",
      "outcome": "pass",
      "evidenceIds": ["scope"],
      "reason": "Exit 0; only allowed gitignored dist output regenerated."
    },
    {
      "check": "pnpm exec vitest run --config vitest.integration.config.ts",
      "method": "Executed full integration suite after build.",
      "outcome": "fail",
      "evidenceIds": ["integration"],
      "reason": "218 passed, 5 failed, 1 skipped; failures are exclusively the declared npm-cli.js and checkout-name issues."
    },
    {
      "check": "git diff --check",
      "method": "Executed again after authorized fixture-report restoration; checked final status and unchanged contract paths.",
      "outcome": "pass",
      "evidenceIds": ["scope"],
      "reason": "Exit 0; no whitespace errors or unrelated final changes."
    }
  ],
  "risks": [
    {
      "description": "Full suites are not entirely green in this environment; packed smoke/install remains unverified because npm-cli.js is unavailable. These failures are independently attributable to unchanged environmental assumptions.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["unit", "integration"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record acceptance evidence, and run closeout before archiving.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/lazy-sessions-summary-quality/lazy-sessions-summary-quality.md",
    "reviewedRecordSha256": "693e3424882ed31310e94f023168344349270441303bdbce6a407f2674830dea"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | tests/memory-core/lifecycle.test.ts no-op matrix (all harnesses, verified + degraded), tests/tools/connection-session.test.ts close without saves, degraded-recover regression in tests/integration/lifecycle.test.ts | Oracle evidence ac1; unit 541/548 and integration 218/224, with only the known environmental failures
- AC-2: PASS | tests/memory-core/lifecycle.test.ts activity cases, tests/integration/pi-native-plugin.test.ts untouched resume/quit with a real temporary database | Oracle evidence ac2
- AC-3: PASS | tests/memory-core/schema-migration.test.ts revision-11 cleanup on the 9→10→11 and 10→11 paths, backup mismatch, write reservation, rollback, idempotent reopen | Oracle evidence ac3
- AC-4: PASS | tests/memory-core/session-summary-derivation.test.ts substantive-objective, fallback, and Unicode threshold tests | Oracle evidence ac4
- AC-5: PASS | derivation tests for primary-line claims, dedup, and generator v2; tests/memory-core/continuation.test.ts realistic v2 recovery | Oracle evidence ac5
- AC-6: PASS | Pi split-turn compaction fixture and merged changed-surface tests | Oracle evidence ac6
- AC-7: PASS | tests/memory-core/session-summaries.test.ts and tests/tools/mcp.test.ts bounded-listing tests (13k summary at budget 4000, metadata floor, multi-record) | Oracle evidence ac7
- AC-8: PASS | review of README.md, docs/agent/native-lifecycle.md, and docs/agent/persistence-retrieval.md | Oracle evidence ac8
- Source: .thoth/specs/store/spec.md | sha256:ff8b564e6774f2135bef39c6e71aa4cf950b019fc5d57a3ae949b88d1ec6ec04
- Source: .thoth/specs/harness-integration/spec.md | sha256:ccb14bec7b5db0e1c5e00eb0843738c6c8ea91e8ebbe567f6897990fa61d93f4
- Source: .thoth/specs/tools/spec.md | sha256:871d80579112f2ede65a9dd2f24b1268fb2a0db6bbe4e17063b94323fca95ca7

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
