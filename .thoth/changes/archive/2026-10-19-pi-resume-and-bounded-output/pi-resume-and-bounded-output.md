# Change: pi-resume-and-bounded-output

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

Live verification of master `780b0ad` in Pi 1.3.0 on 2026-10-20 (read-only database checks) and three Explorer reports:

- Truncated JSON: `success()` in `src/tools/index.ts:238` cuts any serialized envelope longer than 20,000 characters to `text.slice(0, 19_900) + '…'`, while `structuredContent` stays complete. Every host therefore receives invalid JSON text for an oversized result. Pi slices tool text again to 20,000 characters (`src/integration/pi/index.ts:53-59`). Its MCP client also rejects responses above 256,000 UTF-8 bytes (`mcp-client.ts:10,130-151`). Pi's own built-in tool truncation defaults are 2,000 lines / 50 KiB, so the 20,000-character cap is thoth-mem's own. In Pi, `mem_get` of a 13k-character summary and of a 25-claim summary both failed `JSON.parse` at about 19.8k characters. The tools that can exceed the cap are `mem_get` (unbudgeted records and history chains), `mem_project` history (unbudgeted), and summaries/observations/timeline/recall/context, whose budgets exclude envelope overhead.
- `mem_get` lineage: `MemoryService.get` (`service.ts:853-890`) always starts `lineage` with the selected record for memories, summaries, and observations, even without `history: true`. Evidence has `lineage: []`. The tool's input description already says "true: include predecessor lineage; evidence has no lineage". Tests pin the current shape: `tests/memory-core/context.test.ts:87` expects `[current.id, old.id]`, `tests/memory-core/ledger.test.ts:38-40`, and `tests/tools/mcp.test.ts:279-280,451,479`. No closed output-envelope schema definition exists; envelopes are built dynamically with a `warnings` array.
- Pi resume keys: Pi's `session_start` (reason, previousSessionFile) and `session_shutdown` (reason, targetSessionFile) events carry no occurrence ID, and Pi never retries an extension event (`runner.js:813-839`). thoth-mem keys are `eventKey('start',[root, reason])`, `eventKey('recovery',[root, phase])`, and `eventKey('shutdown',[root, reason, sessionFile])` (`src/integration/pi/lifecycle.ts:53,57,80`). Quitting a resumed session therefore hits the stored finalize receipt. Root `01a15571` has one finalize receipt (23:40) despite two `/quit` exits, and its row stayed `ended` while in use; lazy derivation at the next start re-derived its final summary. Codex keys bind root plus source or reason, and Claude keys bind documented fields (`src/integration/adapters/index.ts:62-93`). Both repeat across resumes; that is out of scope here.
- Reopening: `resolveSession`/`ensureSession` (`ledger.ts:90-100`) and `save` (`service.ts:445-464`) never change an existing session's state. `finalize` sets `ended`; `checkpoint_pre_compact` sets `compacted`. Lazy derivation yields `final` only when `state === 'ended'` (`service.ts:964-966`). `guide_post_compact` requires `compacted` (`:1139-1142`). Previous-session selection orders by evidence timestamps, not by state (`ledger.ts:124-135`). Internal summary persistence goes through session-attributed `save` (`service.ts:1069-1074`).
- Stale compaction claims: derivation adds prompt objectives first, then the newest parseable `host_compaction` checkpoint's claims, then memory claims (`session-summary-derivation.ts:110-170`). Within each kind the order is prompts, compaction, memories; claims are deduped by exact kind and content, and trailing claims are dropped to fit the limits (`:175-193`). Every claim cites supports whose sequences are known during derivation (`evidenceById`, `ledger.ts:136-139`). The live final summary (1-42) kept the compaction's next_action "Run the live tests above…" and a pending checklist from event 26 despite 16 later events. It had three objectives and two next actions. Recovery protects and concatenates every next action (`service.ts:969-987`, `continuation.ts:94-118`). Same-watermark reuse means persisted summaries are not rederived (`service.ts:1062`).

## Intent

Every tool result is valid JSON that fits the host cap. `mem_get` returns a record once. Quitting a resumed Pi session finalizes it again. New activity reopens an ended session. Derived summaries drop compaction claims that later activity has made stale.

## Non-goals

- Codex and Claude Code resume-key repetition (user decision): documented as a known limitation, not fixed.
- No new tool parameters. Model-facing tool descriptions and input schemas stay unchanged.
- No regeneration of persisted summaries. No schema revision.
- No change to recovery caps, the summary submission limits, or immediate parsing of compaction text at `guide_post_compact`.
- No push, publish, or real-host smoke beyond the root live check.

## Acceptance

- AC-1: Every tool's text content is valid JSON of at most 20,000 characters. It is the serialization of the returned `structuredContent`. When the full envelope would exceed the cap, the server shrinks it deterministically:
  - it first clips the longest string values (never object keys), appending `…`;
  - then it drops trailing elements of the largest arrays;
  - it keeps the schema, the envelope structure, and every string of at most 64 code points (which keeps IDs intact);
  - it adds `payload_truncated` to the envelope's `warnings`.

  Results that fit are byte-identical to today. Clipping always shortens a string, ellipsis included, so shrinking terminates; tests cover adversarial inputs and the `output_too_large` fallback. Coverage includes `mem_get` of a valid near-limit submitted summary whose expanded envelope exceeds 20,000 characters, an oversized `mem_project` history, and a helper-only synthetic case far beyond the cap. Timeline pages (and any other result that carries a continuation cursor) are sized against the complete serialized envelope before it is built. Bounding therefore never alters them: an MCP traversal at maximum budget returns every eligible ID exactly once.
- AC-2: The `mem_get` tool returns the selected record once. `lineage` is empty unless `history: true`; with history, it lists only the predecessors, newest first. Evidence keeps `lineage: []`. The change is made in the tool mapping only: `MemoryService.get` and `mem_project action=history` keep returning the selected record followed by its predecessors. Pi's result rendering shows the selected record when present, then any lineage.
- AC-3: The Pi extension never slices tool text. If a text result exceeds its 20,000-character cap, it is replaced by a valid bounded JSON notice that names the tool, states the size, and says to narrow the request (a smaller `budget_chars` or a selective `mem_get`). Text within the cap passes through unchanged.
- AC-4: Pi lifecycle keys (`enroll`, `recover` including the post-compaction refresh, and `finalize`) include a per-run nonce created at each `session_start`. Within one run, the keys stay stable, so the same event replayed is a duplicate. This scenario passes against a real temporary database: quit, resume, add activity, quit again. It produces a second finalize receipt and a new final summary version covering the new activity. An untouched start still writes nothing.
- AC-5: Appending non-summary session evidence to an `ended` session reopens it in the same transaction: state becomes `active` and `ended_at` is cleared. Summary-submission evidence never reopens a session, and lifecycle no-ops never do. A reopened session's lazy summary is a checkpoint until it is finalized again. A later `finalize` ends it and supersedes the earlier final summary. `compacted` and `guide_post_compact` behavior is unchanged.
- AC-6: Derivation omits the newest compaction's objective, next-action, pending, and blocker claims when the session has, after that compaction's sequence, either a substantive root prompt (at least 40 code points after whitespace collapse) or a promoted memory with an in-session support. Its decision, completed, and changed-surface claims are kept. A short prompt alone keeps everything. The generator identity changes again. A fixture of the live example yields two prompt objectives, the open handoff as the only next action, and no compaction pending claim. Persisted summaries are reused unchanged at their watermark.
- AC-7: The docs describe:
  - bounded valid tool output and `payload_truncated`;
  - `mem_get` lineage;
  - Pi per-run keys and the Pi output notice;
  - session reopening;
  - the compaction staleness rule and the new generator identity;
  - the Codex/Claude resume-key limitation.

  After archive, `tests/packaging/canonical-product-contract.test.ts` passes, because no canonical requirement carries a transitional generation label.

## Clarifications

- Oversized output: generic valid trimming (the user chose it over per-type trimming and over raising Pi's cap).
- Stale compaction claims: drop only the current-state kinds after substantive activity (the user chose it over dropping all of them and over reordering).
- Codex/Claude resume keys: excluded and documented (user choice).
- Root technical decisions, stated to the user without objection: a per-run nonce in Pi keys, and reopening an ended session on new non-summary evidence.

## Decisions

- D1: A single bounded serializer is applied in `success()` for every tool. `structuredContent` and the text carry the same bounded envelope, so hosts never see two versions of a result.
- D2: Shrinking is deterministic. Repeat until the result fits:
  - clip the longest string longer than 64 code points to a total of `max(64, floor(length / 2))` code points, with the trailing `…` counted in that total, so every clip strictly shortens the string; ties are broken by traversal order;
  - only when no such string remains, drop the last element of the array with the largest serialized size.

  It never removes object keys and never changes numbers, booleans, or nulls. If a result still cannot fit, the bounded error envelope `output_too_large` is returned instead (it fits by construction).
- D3: The Pi notice is valid JSON with schema `thoth-mem.pi.output_truncated`. It carries the tool name, the original character count, the cap, and guidance, and stays under 1,000 characters. With D1 it should only trigger for non-thoth-mem text.
- D4: The Pi nonce is a random UUID per `session_start`. It is kept in the extension's per-run lifecycle state and passed into the enroll, recover, refresh, and finalize key inputs. The capture and compaction keys keep their existing stable inputs (leaf and entry IDs), which are already distinct per event.
- D5: "Non-summary session evidence" means every evidence kind except `session_summary` submissions: root prompts, checkpoints, and session-attributed saves of direct evidence. Reopening happens in the core (`save` or `appendSessionEvent`), so it covers all hosts.
- D6: Compaction claims are stale when an evidence event with a higher sequence is either a root prompt of at least 40 code points or a support of a memory that yields a memory-derived claim. The generator identity becomes `thoth-mem.session-evidence.v3`.
- D7: Keep the cap at 20,000 characters for both server text and Pi text, as today.
- D8 (repair after the plan-review REJECT, round 1): The `timeline` action sizes each page against the complete serialized MCP envelope (data, sources, warnings, cursor, and framing) within the 20,000-character cap before computing `nextCursor`. The generic shrinker therefore never clips a cursor or drops delivered items from a paginated result.
- D9 (repair after the plan-review REJECT, round 1): The lineage change lives in the `mem_get` tool mapping (`src/tools/index.ts`), which returns `lineage.slice(1)` with history and `[]` without. `MemoryService.get`, `mem_project action=history`, and the importer/retrieval service-level tests stay unchanged. Pi `render.ts` prefers `data.record` when present.

## Durable deltas

- `ADDED tools` **Tool Results MUST Be Valid Bounded JSON** — Every MCP tool result MUST carry text content that is valid JSON of at most 20,000 characters and equal to the serialization of its `structuredContent`; when the full envelope would exceed that cap, the server MUST shrink it deterministically by first clipping the longest string values (never object keys) and then dropping trailing elements of the largest arrays, preserving the schema, the envelope structure, and every string of at most 64 code points, and MUST add `payload_truncated` to the envelope warnings; every clip MUST strictly shorten its string so shrinking terminates; results that carry a continuation cursor MUST be sized against the complete envelope so that bounding never alters them; results that fit MUST remain unchanged; and no host bridge, including Pi, MUST cut tool text, replacing an over-limit text with a valid bounded notice instead.
  - GIVEN a valid submitted session summary close to the submission limit whose expanded envelope exceeds 20,000 characters, and a Pi tool call; WHEN `mem_get` expands it through MCP and through the Pi extension; THEN both receive valid JSON within 20,000 characters with the summary ID, kind, coverage, and leading claims, clipped claim text, and the `payload_truncated` warning.
- `ADDED tools` **mem_get MUST Return the Selected Record Once** — `mem_get` MUST return the selected record only in its record field; its lineage MUST be empty unless history is requested and then MUST list only the selected record's predecessors, newest first, while evidence lineage remains empty and `mem_project` history keeps listing the selected record followed by its predecessors.
  - GIVEN a memory corrected twice under one topic key; WHEN `mem_get` expands the current version without and with history; THEN the first response has an empty lineage and the second lists the two predecessors newest first, neither repeating the selected record.
- `ADDED harness-integration` **Pi Lifecycle Keys MUST Be Unique per Extension Run** — The Pi extension MUST derive enroll, recovery, post-compaction refresh, and finalize event keys from a nonce created at each `session_start`, so that keys stay stable within one run and differ across runs of the same root session; quitting a resumed session MUST therefore record a new finalize receipt and derive a final summary covering its new activity, while an untouched start still writes nothing.
  - GIVEN a Pi session that is quit, resumed, given a new prompt, and quit again; WHEN its lifecycle hooks run; THEN two finalize receipts exist, the session ends again, and its current final summary covers the new prompt.
- `ADDED store` **Session Activity MUST Reopen an Ended Session** — Appending any non-summary session evidence to a session in state `ended` MUST, in the same transaction, set its state to `active` and clear its end time; summary-submission evidence and lifecycle operations that write no evidence MUST NOT reopen a session; a reopened session MUST receive checkpoint lazy summaries until it is finalized again, and a later finalize MUST end it and supersede its earlier final summary.
  - GIVEN an ended Codex session with a final summary; WHEN a new root prompt is captured and the session is later finalized again; THEN the session is active between the two events, any lazy summary in between is a checkpoint, and the second finalize ends it with a new current final summary.
- `MODIFIED store` **Session Summaries MUST Be Derived Deterministically When Not Supplied** — When `checkpoint_pre_compact` or `finalize` carries no submitted summary, or the previous session needed by automatic recovery has no current summary covering its latest non-summary evidence, the service MUST derive a harness-generated summary under the current harness generator identity, distinct from the identity used before these derivation rules, without any model or network call from that session's own evidence: substantive root prompts (at least 40 code points after whitespace normalization; the first and the latest distinct one, or only the first prompt when none is substantive) as objective bounded to 300 code points; promoted decision, convention, architecture, and preference memories as decision; discovery and project-structure memories as completed; failure memories as completed with outcome failed; open handoffs as next action; closed handoffs as completed; and the newest parsed host compaction claims, omitting its objective, next-action, pending, and blocker claims when a later evidence event of the session is a substantive root prompt or supports a memory-derived claim; each memory-derived claim MUST state the memory title with its primary labeled line (Result for direct memories, First pending action for open handoffs, the closing Result for closed handoffs, otherwise the first line) bounded to 300 code points, claims with identical kind and content MUST collapse into one claim citing their combined supports within the support limit, every claim MUST cite in-session evidence inside its coverage and respect the existing claim and size limits, a session without citable evidence MUST receive no summary, and a lazily derived summary MUST be final only when the session has ended and checkpoint otherwise.
  - GIVEN an ended Pi session whose compaction listed a goal, a next step, a pending checklist, decisions, and modified files, followed by a substantive root prompt and a newly saved open handoff; WHEN its final summary is derived; THEN it keeps the compaction's decision, completed, and changed-surface claims, takes its objectives only from root prompts and its next action only from the open handoff, and contains no compaction pending claim.

## Plan

The work is sequential and test-first (`tdd`), with one worker per unit followed by a `simplify` pass. Code is strict TypeScript with ESM `.js` imports. There are no commits and no edits to `dist/`. Workers do not edit this record. After the unit vitest config, restore `benchmarks/results/fixture-report.json` with `git checkout --`. Never touch `~/.thoth-mem` or host configs.

1. **Bounded output + lineage (AC-1, AC-2).** Add a pure bounded-envelope helper (for example `src/tools/bounded-json.ts`) implementing D2, and use it in `success()`. Size timeline pages against the complete envelope per D8. Change only the `mem_get` tool mapping per D9, and make Pi `render.ts` prefer the record. Update the pinned `mem_get` tool tests (`mcp.test.ts:279-280,451,479`); keep `mem_project` history (`mcp.test.ts:402-407`) and the service-level lineage tests unchanged. Add tests:
   - helper: valid JSON, at most 20,000 characters, IDs and short strings kept, keys never removed, the warning added, unchanged output when it fits, termination on adversarial inputs (many 65-code-point strings, deep nesting, huge arrays of short strings), the `output_too_large` fallback, and a helper-only synthetic case far beyond the cap;
   - MCP: `mem_get` of a valid near-limit summary whose expanded envelope exceeds 20,000 characters, an oversized `mem_project` history, and a maximum-budget timeline traversal returning every eligible ID exactly once;
   - Pi render: a `mem_get` result without lineage shows the selected record.
2. **Pi output notice (AC-3).** In `src/integration/pi/index.ts` `textContent()`, replace the slice with D3. Tests are in `tests/integration/pi-native-plugin.test.ts`.
3. **Reopen on activity (AC-5).** In the core append path (`service.ts` `save` / ledger `appendSessionEvent`), reopen `ended` sessions on non-summary evidence (D5). Tests cover capture, a direct save, summary submission (does not reopen), the lazy checkpoint kind while reopened, re-finalize superseding the earlier final summary, and unchanged compacted/guide behavior (`tests/memory-core/lifecycle.test.ts`, `tests/integration/lifecycle.test.ts`).
4. **Pi per-run nonce (AC-4).** In `src/integration/pi/lifecycle.ts` and `index.ts`, add the nonce per D4. Update `tests/integration/pi-lifecycle.test.ts` key expectations, keep retry duplicates within a run, and add the quit→resume→prompt→quit integration test against a real temporary database (`tests/integration/pi-native-plugin.test.ts`).
5. **Compaction staleness + generator (AC-6).** In `session-summary-derivation.ts`, apply D6. Tests in `tests/memory-core/session-summary-derivation.test.ts`: the live-example fixture, the short-prompt case, the memory-support case, kept historical kinds, and the generator identity. Keep `tests/integration/lifecycle.test.ts:13` green or adapt it with the same intent.
6. **Docs (AC-7).** `docs/agent/persistence-retrieval.md`, `docs/agent/native-lifecycle.md`, `docs/agent/surfaces.md`, plus a README line if user-facing behavior is described there.

Verification: `pnpm exec tsc --noEmit`; `pnpm exec vitest run --config vitest.unit.config.ts`; `pnpm run build` then `pnpm exec vitest run --config vitest.integration.config.ts`. The known failures are the CRLF report hashes, adjacent `npm-cli.js`, and the OpenCode checkout name. Root post-archive check: `pnpm exec vitest run tests/packaging/canonical-product-contract.test.ts --config vitest.integration.config.ts`. Root live check after build and Pi restart: `mem_get` of a large summary in Pi parses, and quitting a resumed session writes a second finalize receipt.

Risks:
- Generic shrinking can clip meaningful text: mitigated by preserving short strings and IDs, marking the result with a warning, and keeping full data reachable through narrower requests.
- Reopening affects every host: the scope is limited to non-summary evidence, and finalize semantics are unchanged.
- The nonce changes Pi key expectations in tests.
- Recovery output changes as stale compaction claims disappear.

## Tasks

- [x] AC-1: Deterministic bounded valid JSON for every tool result
  - Outcome: a pure helper per D2 used by `success()`, with guaranteed termination; every tool's text is valid JSON of at most 20,000 characters equal to `structuredContent`; `payload_truncated` is added when shrinking; output that fits is unchanged; timeline pages are sized against the complete envelope (D8)
  - Known entrypoints and skill paths: src/tools/index.ts:238 (`success`), src/tools/index.ts:345-347 (timeline), src/memory-core/service.ts:103-225,526-560 (timeline sizing), new src/tools/bounded-json.ts, src/integration/pi/render.ts:143-162, tests/tools/mcp.test.ts; skills tdd, simplify
  - Inputs: Exploration (truncated JSON), D1, D2, D7
  - Dependencies: none
  - Output: code + tests
  - Owner: thoth-worker (one unit covering AC-1 and AC-2)
  - Writes: src/tools/index.ts, src/tools/bounded-json.ts, src/memory-core/service.ts (timeline page sizing only), src/integration/pi/render.ts, tests/tools/*.test.ts, the Pi render test (tests/integration/pi-native-plugin.test.ts or the nearest render test)
  - Interface boundaries: tool descriptions and input schemas unchanged (tool budget tests green); envelope warnings vocabulary
  - Focused check and PASS evidence: helper unit tests (determinism, termination on adversarial inputs, keys never removed, short strings kept, warning added, unchanged output when it fits, `output_too_large` fallback, a synthetic case far beyond the cap); MCP tests showing `mem_get` of a valid near-limit summary and an oversized history return parseable text of at most 20,000 characters; a maximum-budget timeline traversal returning every eligible ID exactly once
  - Return milestone: tests green with the diff summary
  - Stop / reassessment: an envelope consumer that requires the untruncated `structuredContent`, or another cursor-paginated result that the shrinker could alter
- [x] AC-2: mem_get returns the selected record once, with predecessors-only lineage
  - Outcome: in the `mem_get` tool output only, lineage is empty without history and lists predecessors only, newest first, with history; evidence unchanged; `MemoryService.get` and `mem_project` history unchanged; Pi render prefers the record
  - Known entrypoints and skill paths: src/tools/index.ts:338 (`mem_get` mapping), src/tools/index.ts:352 (history, unchanged), src/integration/pi/render.ts:143-162
  - Inputs: Exploration (mem_get lineage)
  - Dependencies: the same unit as AC-1
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: as in AC-1
  - Interface boundaries: `mem_project` history and the service-level lineage (importer, retrieval, context, and ledger tests) stay unchanged
  - Focused check and PASS evidence: updated `mem_get` tool lineage tests for memory, summary, and observation, with and without history; unchanged `mem_project` history test; a Pi render test showing the selected record without lineage
  - Return milestone: delivered with AC-1
  - Stop / reassessment: a caller that relies on `lineage[0]` being the selected record
- [x] AC-3: Pi replaces over-limit tool text with a valid bounded notice
  - Outcome: `textContent()` never slices; over-limit text becomes the D3 notice; text within the cap passes through unchanged
  - Known entrypoints and skill paths: src/integration/pi/index.ts:53-59, tests/integration/pi-native-plugin.test.ts; skills tdd, simplify
  - Inputs: D3
  - Dependencies: AC-1/AC-2 unit
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: src/integration/pi/index.ts, tests/integration/pi-native-plugin.test.ts
  - Interface boundaries: structured `details` passthrough unchanged; the Pi extension never opens SQLite
  - Focused check and PASS evidence: a test with a 25,000-character text result showing a parseable notice under 1,000 characters and a 19,000-character result unchanged
  - Return milestone: tests green
  - Stop / reassessment: Pi rendering that requires plain text rather than JSON
- [x] AC-5: Non-summary evidence reopens an ended session
  - Outcome: the ended session becomes active and its end time is cleared in the same transaction; summary submissions and no-ops do not reopen it; the lazy kind is checkpoint while reopened; re-finalize supersedes the earlier final summary
  - Known entrypoints and skill paths: src/memory-core/service.ts (`save` ~445-464, lifecycle ~1132-1166, lazy kind ~964-966), src/memory-core/sqlite/ledger.ts (`appendSessionEvent`); skills tdd, simplify
  - Inputs: D5
  - Dependencies: AC-3 unit (sequential worker rule)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: src/memory-core/service.ts, src/memory-core/sqlite/ledger.ts, tests/memory-core/lifecycle.test.ts, tests/integration/lifecycle.test.ts
  - Interface boundaries: lazy-session no-ops; `guide_post_compact` compacted check; revision-11 cleanup unaffected
  - Focused check and PASS evidence: tests for capture and direct-save reopening, no reopening by summary submission, a lazy checkpoint while reopened, a new final version after re-finalize, and unchanged compacted behavior
  - Return milestone: tests green
  - Stop / reassessment: an existing contract that requires ended sessions to stay ended
- [x] AC-4: Pi per-run nonce in enroll, recover, refresh, and finalize keys
  - Outcome: keys are stable within a run and differ across runs; a quit after resume writes a second finalize receipt and a new final summary
  - Known entrypoints and skill paths: src/integration/pi/lifecycle.ts:43-81, src/integration/pi/index.ts:93-196, tests/integration/pi-lifecycle.test.ts, tests/integration/pi-native-plugin.test.ts; skills tdd, simplify
  - Inputs: D4; accepted AC-5 reopening
  - Dependencies: AC-5 unit
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: the two Pi files and their tests
  - Interface boundaries: capture and compaction keys unchanged; untouched starts write nothing (lazy sessions)
  - Focused check and PASS evidence: key tests (same within a run, distinct across runs) and a real temporary database integration test for quit→resume→prompt→quit
  - Return milestone: tests green
  - Stop / reassessment: Pi state that cannot carry the nonce across the recover refresh
- [x] AC-6: Drop stale compaction current-state claims; new generator identity
  - Outcome: the D6 rule is applied; historical compaction kinds are kept; short prompts alone keep everything; the generator becomes `thoth-mem.session-evidence.v3`; persisted summaries are reused
  - Known entrypoints and skill paths: src/memory-core/session-summary-derivation.ts:110-193, tests/memory-core/session-summary-derivation.test.ts, tests/integration/lifecycle.test.ts:13, tests/memory-core/continuation.test.ts; skills tdd, simplify
  - Inputs: D6; Exploration (stale compaction claims)
  - Dependencies: AC-4 unit
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: src/memory-core/session-summary-derivation.ts and the tests above
  - Interface boundaries: immediate `guide_post_compact` parsing unchanged; submission limits and recovery caps unchanged
  - Focused check and PASS evidence: live-example fixture (two prompt objectives, the handoff as the only next action, no compaction pending, decisions and files kept), short-prompt case, memory-support case, generator name
  - Return milestone: tests green
  - Stop / reassessment: a contract that requires compaction objectives regardless of later prompts
- [x] AC-7: Docs for bounded output, lineage, Pi keys and notice, reopening, staleness, and the Codex/Claude limitation; canonical spec test passes after archive
  - Outcome: durable docs updated; the post-archive canonical test passes
  - Known entrypoints and skill paths: docs/agent/persistence-retrieval.md, docs/agent/native-lifecycle.md, docs/agent/surfaces.md, README.md, tests/packaging/canonical-product-contract.test.ts
  - Inputs: accepted outputs of all code units
  - Dependencies: AC-6 unit
  - Output: documentation edits (worker); post-archive test run (root)
  - Owner: thoth-worker (docs), root (post-archive check)
  - Writes: the docs above
  - Interface boundaries: packaged Skill copies unchanged (report if they need a change)
  - Focused check and PASS evidence: docs cover each item; `git diff --check` passes; root reruns the canonical test after archive (2/2 pass)
  - Return milestone: docs diff ready; post-archive check
  - Stop / reassessment: packaged Skill text that needs a lock refresh
  - Status: the docs are done. The packaged Skill copies were reviewed and left unchanged: their "full content with mem_get" wording still holds, because bounding applies only to over-cap results and is flagged by a warning. The canonical-product-contract rerun is a root check deferred to after archive.

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Round 1 (fresh Oracle) returned REJECT with three blockers: D2 clipping could stall and the 32×2,000 fixture was invalid; generic shrinking could corrupt timeline continuation; the lineage change broke `mem_project` history, service-level tests, and Pi rendering. They were repaired with D2 (strictly shortening clips), D8, and D9. Round 2 (fresh Oracle) returned OKAY with no risks; the envelope was validated with `validate-result.mjs --review-kind plan-review`.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 7b26585ee3e6fbeb69863b8fbc3be95ae3e65b4979d8e25caeceaa3683f4811c

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The task-completion blocker is resolved. Independent inspection and fresh targeted checks found no implementation blocker against AC-1–AC-7, D1–D9, or the governing contracts.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/pi-resume-and-bounded-output/pi-resume-and-bounded-output.md",
      "claim": "All seven task rows are checked; verify validation passes; the independently calculated prefix SHA-256 matches the assigned digest. Affected canonical-spec baselines match.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "diff-review",
      "locator": "git diff --stat; implementation-file timestamps",
      "claim": "The implementation scope matches the supplied file list: 20 tracked files plus the new serializer and its tests. Implementation-file timestamps precede the saved broad checks; the record timestamp is later.",
      "basis": "observed",
      "uncertainty": "No round-1 per-file hash manifest was supplied, so historical byte identity cannot be proven. Current files were independently inspected and tested."
    },
    {
      "id": "E3",
      "kind": "implementation",
      "locator": "src/tools/bounded-json.ts; src/tools/index.ts; src/memory-core/service.ts; src/integration/pi/render.ts",
      "claim": "The shared serializer implements deterministic, strictly shortening clipping, array reduction, warning preservation, and bounded fallback. Timeline sizing includes the complete envelope. Lineage changes are tool-only, and Pi renders the selected record first.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "implementation",
      "locator": "src/integration/pi/index.ts; src/integration/pi/lifecycle.ts",
      "claim": "Pi replaces oversized text with the bounded JSON notice and preserves in-cap text. Each session_start creates a nonce used by enroll, recovery/refresh, and finalize; capture and compaction inputs remain stable.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "implementation",
      "locator": "src/memory-core/sqlite/ledger.ts; src/memory-core/service.ts",
      "claim": "New non-summary evidence reopens ended sessions inside the write transaction. Summary evidence, duplicate receipts, no-ops, and compacted-session behavior retain their exclusions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "implementation",
      "locator": "src/memory-core/session-summary-derivation.ts",
      "claim": "Compaction staleness uses later substantive-prompt or qualifying memory-support sequences before caps. Historical claim kinds remain eligible, generator v3 is emitted, and persisted same-watermark summaries remain reusable.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "execution",
      "locator": "Fresh targeted Vitest runs and pnpm exec tsc --noEmit",
      "claim": "TypeScript passes; 279 unit tests across eight files and 52 integration tests across five files pass, including both tool-definition budget guards.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "documentation",
      "locator": "README.md; docs/agent/{surfaces,native-lifecycle,persistence-retrieval}.md; tests/packaging/canonical-product-contract.test.ts",
      "claim": "Documentation covers every AC-7 topic. Canonical-product preflight passes 2/2; durable deltas contain no transitional v2 label. Canonical and four packaged Skill bodies have identical SHA-256 hashes.",
      "basis": "observed",
      "uncertainty": "The required post-archive rerun remains a root closeout check."
    },
    {
      "id": "E9",
      "kind": "environment",
      "locator": "Saved thoth-fv-prbo-unit.txt and thoth-fv-prbo-int.txt; benchmark reports; src/setup/opencode-config.ts",
      "claim": "The twelve broad failures reconcile with CRLF-dependent immutable-report hashes, missing adjacent npm-cli.js, and the unchanged OpenCode basename assumption. LF-normalized report hashes match the pinned values; both reported npm CLI paths are absent.",
      "basis": "inferred",
      "uncertainty": "Broad suites were not rerun, as instructed."
    },
    {
      "id": "E10",
      "kind": "workspace",
      "locator": "Final git diff --check; git status --short benchmarks/ dist/",
      "claim": "Diff whitespace checks pass. benchmarks/ and dist/ status are clean after targeted testing.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "SDD, constitution, canonical contracts, and record binding",
      "method": "Loaded verify guidance; reviewed governing requirements and durable deltas; ran verify validator and independently hashed exact prefix bytes.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E3", "E4", "E5", "E6"],
      "reason": "Tasks, authorization, source baselines, and record binding are valid; no conflicting implementation contract found."
    },
    {
      "check": "AC-1 and AC-2; D1, D2, D7, D8, D9",
      "method": "Source inspection plus serializer, MCP, ledger, and Pi-render tests.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E7"],
      "reason": "Adversarial bounding, near-limit summary expansion, oversized history, complete timeline traversal, predecessor-only tool lineage, and selected-record rendering pass."
    },
    {
      "check": "AC-3 and AC-4; D3 and D4",
      "method": "Pi lifecycle and native-plugin tests, including the temporary-database quit/resume/prompt/quit scenario.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E7"],
      "reason": "Notice sizing, passthrough, stable within-run keys, distinct cross-run keys, untouched starts, and second finalization pass."
    },
    {
      "check": "AC-5; D5",
      "method": "Core and host-neutral lifecycle tests with database-state assertions.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E7"],
      "reason": "Reopening, rollback, exclusions, lazy checkpoints, renewed final summaries, and compacted behavior pass."
    },
    {
      "check": "AC-6; D6",
      "method": "Derivation, continuation, and context tests plus sequence-order inspection.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E7"],
      "reason": "Live-example claims, Unicode thresholds, memory-support ordering, historical kinds, pre-cap staleness, and persisted-summary reuse pass."
    },
    {
      "check": "AC-7 documentation and archive readiness",
      "method": "Reviewed documentation and Skill copies; ran canonical-product preflight.",
      "outcome": "pass",
      "evidenceIds": ["E8", "E10"],
      "reason": "Documentation is complete and preflight passes; the explicitly post-archive rerun remains scheduled."
    },
    {
      "check": "Type safety and workspace hygiene",
      "method": "Fresh tsc, tool-budget tests, diff check, and final scoped git status.",
      "outcome": "pass",
      "evidenceIds": ["E7", "E10"],
      "reason": "Checks pass; benchmarks/ is clean."
    }
  ],
  "risks": [
    {
      "description": "Broad suites remain environmentally non-green; packaging smoke is not established in this environment.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E9"]
    },
    {
      "description": "Canonical-product-contract must be rerun after archive applies the durable deltas.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E8"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record concrete AC evidence, complete closeout/archive, and rerun canonical-product-contract after archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/pi-resume-and-bounded-output/pi-resume-and-bounded-output.md",
    "reviewedRecordSha256": "7b26585ee3e6fbeb69863b8fbc3be95ae3e65b4979d8e25caeceaa3683f4811c"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | tests/tools/bounded-json.test.ts (adversarial termination, `output_too_large` fallback, warning kept first, keys and short strings kept, unchanged when it fits) plus tests/tools/mcp.test.ts (near-limit summary `mem_get`, oversized history, 120-ID maximum-budget timeline traversal) | Oracle E3/E7
- AC-2: PASS | tests/tools/mcp.test.ts `mem_get` lineage with and without history; unchanged `mem_project` history test; tests/integration/pi-render.test.ts selected-record rendering | Oracle E3/E7
- AC-3: PASS | tests/integration/pi-native-plugin.test.ts notice cases at 25,000/20,001 characters and passthrough at 0/19,000/20,000 | Oracle E4/E7
- AC-4: PASS | tests/integration/pi-lifecycle.test.ts key invariants; tests/integration/pi-native-plugin.test.ts temporary-database quit→resume→prompt→quit with two finalize receipts and final summary v2 covering sequence 3 | Oracle E4/E7
- AC-5: PASS | tests/memory-core/lifecycle.test.ts reopening, rollback, exclusions, lazy checkpoint, and re-finalize; adapted tests/memory-core/context.test.ts; ended-without-activity final test; tests/integration/lifecycle.test.ts | Oracle E5/E7
- AC-6: PASS | tests/memory-core/session-summary-derivation.test.ts (live example, short prompt, memory support before and after compaction, generator v3, v1/v2 watermark reuse) plus continuation tests | Oracle E6/E7
- AC-7: PASS | README.md and docs/agent/{persistence-retrieval,native-lifecycle,surfaces}.md; canonical-product preflight 2/2; post-archive rerun by root | Oracle E8
- Root broad checks: tsc exit 0; unit config 644 passed with 7 known CRLF hash failures; build exit 0; integration config 241 passed, 1 skipped, and 5 known environmental failures (4 missing npm-cli.js, 1 OpenCode checkout basename)
- Source: .thoth/specs/tools/spec.md | sha256:323221d99c3321cc0506225f2f03668feea65fafe06a58c44d739981bc0a6995
- Source: .thoth/specs/store/spec.md | sha256:fd07ac1b32ac357dceecd9c291820fa2e873672bb239b6495ab69c1a0cef1ee6
- Source: .thoth/specs/harness-integration/spec.md | sha256:65592dfe3249855ea19034a05576f5fa65513c68238c541911776ff566d304e3

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
