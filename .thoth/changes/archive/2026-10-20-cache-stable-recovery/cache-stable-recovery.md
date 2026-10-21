# Change: cache-stable-recovery

**Classification**: substantial
**Scope**: coordinated
**Uncertainty**: medium
**Risk**: medium

## Exploration

- **The problem the user measured.** In Pi, the footer showed the context figure jumping and the cost rising about 2 USD on the first call of some turns. Root analysis of session 01a15571 (JSONL usage metadata and live DB `lifecycle_receipts`, read-only) found:
  - Every large cache miss followed one of three events:
    - a compaction;
    - a new Pi process, with an enroll receipt at 22:05, 15:40, 19:56, 21:21 and 21:30, and a resume after a finalize at 23:42;
    - idle expiry of 32 to 662 minutes.
  - Each of the seven mid-session `thoth_mem_recovery` system-section changes was followed by a full cache read. The pi-claude-bridge turns a changed system section into an appended `claude-bridge-appended-instructions` update.
  - The resume misses belong to the bridge rebuild path. That work was handed off to thoth-agents (Orca worktree `bridge-resume-cache`) and is out of scope here.
- **Engram precedent (librarian; engram d85c457, gentle-shell 63d6065).**
  - Engram issue #1894 is the same Pi problem: compaction recovery inserted into and then removed from the system prompt reread about 118K tokens.
  - Merged PR #1946 keeps stable protocol text in the system prompt and delivers recovery as a one-shot hidden custom message.
  - Claude Code and Codex fetch context only on `SessionStart` (startup, resume, clear, compact).
  - Gentle-shell #2195 showed that an unpersisted message recreated per request also breaks the last-message cache breakpoint. #2234 persists snapshots only when they change.
- **Current thoth-mem injection (explorer q1, branch `context` at d39b135).**
  - **Pi:** `src/integration/pi/index.ts` re-dispatches `recover` on every `before_agent_start` (phase `'context'`, `src/integration/pi/lifecycle.ts:45-58`) and rewrites the owned system section `thoth_mem_recovery` (`index.ts:141-197`). `session_compact` caches the recovery returned by `guide_post_compact`.
  - **OpenCode:** `src/integration/opencode/plugin.ts:209-216` re-renders recovery into `experimental.chat.system.transform` on every request. `session.compacted` (`:164-185`) dispatches `guide_post_compact` and discards the returned recovery. `chat.message` (`:191-202`) captures user text and skips synthetic or ignored parts.
  - **Claude Code and Codex:** the shared `plugin/runners/public-runner.mjs:201-207` emits `additionalContext` only for `SessionStart`. `UserPromptSubmit` adds no model-visible context.
  - **Fallback:** `src/integration/recovery.ts:32-69` builds a locally verified identity-only fallback, used when core recovery is missing or invalid.
- **Pi 1.3.0 semantics (explorers q2 and q3; installed package).**
  - Return shape: `before_agent_start` → `{ message: { customType, content, display: false } }` (`dist/core/extensions/types.d.ts:1125-1128`).
  - Persistence: the message is stored as a `custom_message` after the run's user prompt (`agent-session.js:1465-1497,755-761`).
  - Replay: it is replayed in place on later requests and on resume, and converted to provider `user` content (`messages.js:75-95`).
  - Display: `display: false` hides it in the TUI (`interactive-mode.js:3164-3169`), and returning it starts no extra turn.
  - Not model-visible: `pi.appendEntry` entries are not model-visible, and the `context` event is request-only.
  - Compaction keeps the summary, then entries from `firstKeptEntryId`, then later entries.
  - `session_start.reason` is `startup | reload | new | resume | fork`. A reload keeps the session history (`agent-session.js:2969-3002`).
  - `ctx.sessionManager.getBranch()` exposes `custom_message` entries with `customType` and compaction entries (`session-manager.d.ts:46,109-111,311,334`).
  - Precedent: the thoth-agents language anchor already uses this mechanism.
- **OpenCode (librarian q4 at release v1.19.3 e3c4eb24; the user has 1.18.32, and the repo types are 1.18.2).**
  - `chat.message` mutations of the existing `output.parts` array are saved before inference (`packages/opencode/src/session/prompt.ts` L995-L1049).
  - Synthetic text parts are sent to the model (`message-v2.ts` L214-L220) and hidden from TUI user text.
  - `applyCaching` marks the first two system messages and the last two non-system messages, so a changing system entry changes the prefix of the whole conversation.
  - `experimental.chat.messages.transform` is request-only.
  - Part construction (librarian q5). Tags v1.18.32 (545f51d) and v1.19.3 have byte-identical hook, save, schema, identifier and compaction code.
    - Hook flow: the hook receives the already-identified `resolvedParts`, and the same array is saved afterwards. Appending works; replacing `output.parts` does not.
    - Required fields: an appended part must carry its own `id` (schema only checks the `prt` prefix; OpenCode generates `prt_` + 12 hex of `Date.now()*0x1000+counter` + 14 base62 random), `sessionID`, and `messageID = output.message.id`.
    - Persistence and order: `synthetic` is persisted, and parts are reloaded sorted by `id`.
    - Validation: invalid parts are logged, not rejected.
    - Compaction: automatic post-compaction continuation writes its message directly and bypasses `chat.message`, so the next prompt or command is the first hook call.
    - Exactly-once: none. A resubmitted message can re-run the hook.
    - Precedent: opencode-supermemory pushes `{ id, sessionID, messageID, type: "text", text, synthetic: true }` in `chat.message`.

## Intent

Thoth-mem stops changing the request prefix within a session. In Pi and OpenCode, the bounded recovery block (identity plus selected memory, at most 1,000 code points, same content as today) is delivered as one persisted, append-only, model-visible message hidden from the transcript UI:

- on the first root prompt of a run;
- on the first root prompt after a successful compaction;
- once more after an unavailable start, when memory becomes reachable.

It is never re-rendered per prompt and never placed in the system prompt. Claude Code and Codex already deliver only on `SessionStart` and stay as they are.

## Non-goals

- The pi-claude-bridge resume rebuild and its cache misses; handed off to thoth-agents.
- Provider cache TTL or idle expiry.
- Changing recovery selection, ordering, caps, identity fields or the recovery envelope text.
- Adding static protocol text to any system prompt.
- Claude Code and Codex hook behavior.
- Pi tool definitions or MCP server instructions.
- A release, version bump, host install or live-DB write.
- Supporting the unreleased OpenCode `dev` V2 plugin API.

## Acceptance

- AC-1: The Pi extension sets no system-prompt section and no system prompt. No `thoth_mem_recovery` section exists, and a memory save mid-session changes nothing in the system prompt.
- AC-2: On the first root prompt of a run started with `startup`, `resume`, `new` or `fork`, Pi's `before_agent_start` returns exactly one message `{ customType: "thoth-mem-recovery", content: <verified bounded recovery block>, display: false }`.
  - Later prompts return no message and dispatch no `recover`.
  - A run started with `reload` delivers nothing when the active branch already holds a `thoth-mem-recovery` custom message after its latest compaction entry; otherwise it delivers once.
- AC-3: After a successful Pi `session_compact`, the next root prompt returns exactly one `thoth-mem-recovery` message carrying the verified recovery returned by `guide_post_compact`. A failed compaction schedules nothing new.
- AC-4: When the memory server is unavailable at a Pi delivery boundary:
  - the first root prompt delivers the locally verified identity-only block;
  - later root prompts retry `recover` until a verified recovery is obtained, which is delivered once; then retries stop;
  - each boundary delivers at most two blocks;
  - invalid local identity delivers nothing;
  - the once-per-session startup-timeout warning is unchanged.
- AC-5: The OpenCode plugin adds no thoth-mem content to the system prompt, and its per-request transform no longer injects recovery.
  - `chat.message` appends exactly one fully formed synthetic text part, carrying the verified recovery block, to the user message, in two cases: the first root-session message seen by the plugin process for that session, and the first root prompt routed through `chat.message` after `session.compacted`, which uses the recovery returned by `guide_post_compact`. OpenCode's automatic continuation bypasses the hook.
  - The part sorts after every existing part of that message, whatever their id shapes.
  - A restarted plugin that has seen no session event still recognizes a resumed root session on its first message, through an on-demand lookup that fails closed.
  - A message ID that already received or persisted a thoth-mem recovery part never receives a second one, even when it is resubmitted or the plugin has restarted. Any still-pending delivery moves to the next new root message.
  - Delegated sessions receive nothing.
  - Capture never records the injected part.
  - The unavailable path follows AC-4.
- AC-6: Claude Code and Codex remain unchanged: recovery only through `SessionStart` `additionalContext`, and no model-visible context on `UserPromptSubmit`.
- AC-7: Agent docs, the packaged Pi and OpenCode Skill references, and the packed-plugin smoke contract describe and assert the new delivery, and the packed-plugin tests pass.

## Clarifications

- **Engram approach for all hosts.** After hearing the engram and gentle-shell precedent, the user chose the engram approach and an audit of all four hosts.
- **Corrected diagnosis.** After the correction (mid-session refresh does not break the bridge cache; resume rebuilds do), the user chose to do both:
  - this thoth-mem change;
  - a parallel thoth-agents handoff for the bridge, with thoth-mem limited to its own responsibility.
- **Pi boundaries.** The user chose "every start or resume, except reloads".
- **Unavailable memory.** The user chose "identity only, then retry".
- **OpenCode.** The user chose "a synthetic part on the user message".

## Decisions

- D1: Delivery mechanism per host:
  - Pi: a `before_agent_start` `message` with `customType: "thoth-mem-recovery"` and `display: false`.
  - OpenCode: one synthetic text part appended to `output.parts` in `chat.message`.
  - Claude Code and Codex: unchanged.
- D2: Pi boundaries. `startup`, `resume`, `new` and `fork` schedule one delivery. `reload` schedules one only if `ctx.sessionManager.getBranch()` has no `custom_message` with `customType` `thoth-mem-recovery` after the latest compaction entry. OpenCode schedules one per root session per plugin process (an OpenCode restart behaves like a resume).
- D3: Unavailable handling:
  - The identity-only fallback is delivered first.
  - A boundary stays pending-verified, and each later root prompt retries `recover` until a verified recovery is delivered once.
  - Each boundary delivers at most two blocks.
  - Without pending work, no root prompt dispatches `recover`.
- D4: After compaction, both hosts deliver the recovery that `guide_post_compact` returned. If it is unavailable, D3 applies. In OpenCode, delivery happens on the next prompt or command that reaches `chat.message`; the automatic continuation is not hooked, and no extra `experimental.compaction.autocontinue` handling is added.
- D8: The OpenCode part is `{ id, sessionID: input.sessionID, messageID: output.message.id, type: "text", text: block, synthetic: true }`.
  - The `id` is the lexical successor of the complete maximum existing part id in `output.parts`: that id plus the suffix `~thoth-mem`. It is schema-valid (it keeps the `prt` prefix), sorts after every existing id of any shape (a proper extension sorts after its prefix), and cannot collide with OpenCode's fixed-width native ids. The order stays stable across reloads because hydration sorts by id.
  - With no existing parts, the id is native-shaped: `prt_` + the low 48 bits of `Date.now()*0x1000 + counter` as 12 lowercase hex characters + 14 random base62 characters.
- D9: Resolving an OpenCode root session on a cache miss. When `chat.message` arrives for a session that is absent from the event-populated session map (for example, the first resumed prompt after a plugin restart), the plugin resolves it on demand with the existing `client.session.get` parent walk (`plugin.ts:98-118`, with its cycle, identifier and depth checks) and populates the map. A lookup failure, a child session or an ambiguous identity fails closed: no part, and the delivery stays pending for the next message.
- D10: OpenCode deduplication per message ID.
  - The plugin remembers in memory the message IDs it gave a part, and never pushes to them again.
  - Before pushing, when `input.messageID` is present (a client-supplied ID, so a possible resubmission), it reads the persisted message with `client.session.message({ path: { id: sessionID, messageID } })`:
    - a not-found result means a new message, and the push goes ahead;
    - a persisted part containing the owned recovery start delimiter means no push; the message is recorded as delivered, and any pending verified delivery waits for the next new message;
    - any other failure means no push, and the delivery stays pending.
  - Delimiter scans of `output.parts` remain as an extra guard.
- D5: The recovery content and envelope are unchanged. Only the placement and timing change.
- D6: No static protocol text is added to any system prompt. The protocol stays in the packaged Skills and tool descriptions.
- D7: Out of scope:
  - The pi-claude-bridge resume rebuild (thoth-agents worktree `bridge-resume-cache`).
  - The OpenCode `dev` V2 API: the supported baseline stays the released V1 hooks the plugin compiles against.

## Durable deltas

- `MODIFIED harness-integration` **Runtime Lifecycle MUST Preserve the Core Contract** — OpenCode, Codex, Claude Code, and Pi lifecycle adapters MUST normalize only fields their supported native contracts actually provide and MUST apply shared privacy sanitation before content-derived identity; Pi MUST map documented session start, admitted root input, pre-compaction, successful compaction, failed compaction, settled-agent, and shutdown events onto enroll with recover, capture-root (one ordered root-prompt evidence event per distinct sanitized interactive or RPC input), checkpoint-pre-compact, guide-post-compact, non-finalizing degradation or flush, and a single finalize, MUST NOT dispatch recover on a root prompt except to retry a delivery boundary whose verified recovery is still pending, and agent-settled or failed-compaction events MUST NOT finalize; where a native contract provides the host's own generated compaction summary text (Pi `session_compact` compaction entry summary, Claude Code `PostCompact` `compact_summary`, and the OpenCode assistant summary message readable after `session.compacted`) the adapter MUST forward it as `guide_post_compact` content, while Codex and any host without such a documented field MUST NOT parse transcripts for it; forwarded compaction text and prompt, model, tool, summary, or lifecycle content MUST NOT be automatically promoted to memories or observations and MAY only become session evidence and harness-derived session summaries.
  - GIVEN Pi reports a successful compaction whose entry carries the default structured summary text; WHEN the lifecycle hooks execute; THEN thoth-mem checkpoints before compaction, forwards the text with guide-post-compact so it is stored as checkpoint evidence with a harness-derived session summary citing it, creates no memory or observation, and appends the returned bounded recovery block once as a persisted hidden message on the next root prompt.
- `ADDED harness-integration` **Recovery Delivery MUST Keep the Request Prefix Stable** — Pi and OpenCode MUST NOT place recovery, identity, or any other database-derived thoth-mem content in the system prompt or in any per-request system or message transform, and MUST deliver the verified bounded recovery block as one persisted, append-only, model-visible message hidden from the host transcript UI (in Pi a `thoth-mem-recovery` custom message with display disabled returned from `before_agent_start`; in OpenCode one synthetic text part appended to the root user message in `chat.message`) only on the first root prompt of an extension run and on the first root prompt after a successful compaction (an OpenCode automatic continuation that bypasses `chat.message` does not count); a Pi run started by reload MUST NOT deliver another block when the active branch already holds a `thoth-mem-recovery` message after its latest compaction; when the memory server is unavailable at such a boundary the adapter MUST deliver the locally verified identity-only block and retry recovery on later root prompts until one verified recovery block is delivered once, delivering at most two blocks per boundary; Claude Code and Codex MUST deliver recovery only through `SessionStart` additional context and MUST emit no model-visible context on `UserPromptSubmit`; delegated sessions MUST receive no block.
  - GIVEN a Pi root session and an OpenCode root session with a delegated child, the memory server being unavailable when each root run starts; WHEN each root sends several prompts while the server becomes reachable, a memory is saved, the Pi extension reloads, and the OpenCode root is compacted and sends another message; THEN no system prompt carries thoth-mem content, each root's first prompt carries the identity-only block and exactly one later prompt carries the verified block, the reloaded Pi run appends nothing, the first post-compaction OpenCode message carries one synthetic recovery part, and the child receives no block.
- `MODIFIED retrieval` **Project Briefing MUST Be Deterministic and Bounded** — Automatic recovery for a verified root session (enroll/recover at a delivery boundary, its retry while a verified recovery is pending, and `guide_post_compact`) MUST render one deterministic bounded selection that never includes that session's own summaries, and `guide_post_compact` MUST render the same project recovery as ordinary recovery instead of abstaining, whether or not a pre-compaction event preceded it; the selection MUST order the newest open handoff first, then the newest current summary of the previous session (the most recent other root session of the same project by last non-summary activity, from any harness), then the remaining project memories in the existing kind order, within the existing aggregate and host rendering caps, and summaries of every other session MUST stay absent; explicit `mem_context` with a verified session pair MAY still return that session's own newest summary; degraded-identity post-compaction events MUST keep failing closed without injecting memory.
  - GIVEN a root session with its own summary, an open project handoff, and a previous root session with a summary; WHEN `guide_post_compact` runs; THEN recovery renders the open handoff, then the previous session's summary, then remaining memories within the caps and omits the current session's own summary.

## Plan

- **Pi (U1).** Remove the system-section path (`systemPromptOptions.sections` write and delete) and the per-prompt refresh. Keep a per-run delivery state: `pending` (none | fallback-delivered | verified-pending) plus the recovery to deliver.
  - **session_start:** enroll and recover as today. Classify by `reason`. On `reload`, scan `ctx.sessionManager.getBranch()` from the end back to the latest compaction entry for a `custom_message` whose `customType` is `thoth-mem-recovery`; if one exists, schedule nothing.
  - **before_agent_start:**
    - with a scheduled verified recovery: return it once as `{ message: { customType: "thoth-mem-recovery", content, display: false } }`;
    - with only the local fallback: return the identity-only block once and keep retrying `recover` on later root prompts, returning the first verified result once;
    - otherwise: return nothing and dispatch nothing.
  - **session_compact:** schedule the `guide_post_compact` recovery.
  - Remove the `'context'` phase if it becomes unused, or reuse it only for the pending retry key. Distinguish verified recovery from local fallback in `src/integration/recovery.ts` without changing its validation.
- **OpenCode (U2).**
  - Remove recovery injection from `experimental.chat.system.transform`; drop the hook if it is left empty.
  - Keep a per-root-session delivery map: process-first delivery, plus post-compaction delivery from the `session.compacted` `guide_post_compact` result.
  - In `chat.message`, when a verified root session has a scheduled delivery, push the one synthetic text part described in D8 into the existing `output.parts` array, never replacing the array.
  - Apply D9 on a session-map miss and D10 before every push.
  - Pending state is kept per root session: `{ kind: verified | fallback-delivered-awaiting-verified, block }`. It is cleared only when the verified block is pushed.
  - Capture keeps skipping synthetic parts. The unavailable path follows D3.
  - The D9 and D10 SDK reads only run at delivery boundaries, inside `chat.message`. The plugin already awaits `client.session.get` for identity, so this follows existing practice. A live OpenCode check after the merge is recommended, and it is outside this record's acceptance.
- **Docs and packed contract (U3).** Update `docs/agent/native-lifecycle.md`, `docs/agent/persistence-retrieval.md`, `integrations/pi/skills/thoth-mem/references/pi.md` and `integrations/opencode/skills/thoth-mem/references/opencode.md`, plus any packaged copies they generate. Update `scripts/verify-packed-plugins.mjs` assertions:
  - Pi: the recovery message replaces the system section;
  - OpenCode: no system-array recovery, and the `chat.message` synthetic part.
- **Verification seams:**
  - `pnpm exec vitest run tests/integration/pi-native-plugin.test.ts tests/integration/pi-lifecycle.test.ts tests/integration/opencode-native-plugin.test.ts tests/integration/public-plugin-runner.test.ts tests/integration/adapters.test.ts tests/integration/lifecycle.test.ts tests/memory-core/continuation.test.ts`
  - `pnpm run build`
  - the packed `tests/packaging/first-product.test.ts` and `tests/integration/public-marketplace-smoke.test.ts`, with `npm_execpath` set to the pnpm global npm-cli.js
  - `tests/packaging/canonical-product-contract.test.ts` after archive
- **Order.** U1, then U2, then U3, run sequentially so that `src/integration/recovery.ts` has a single owner (U1).

## Tasks

- [x] AC-1: Pi system prompt carries no thoth-mem content
  - Outcome: the extension no longer writes or deletes system sections and has no per-prompt refresh
  - Known entrypoints and skill paths: src/integration/pi/index.ts (:141-210), src/integration/pi/lifecycle.ts (:45-81); skills tdd, simplify
  - Inputs: Exploration (Pi 1.3.0 semantics); D1, D5, D6
  - Dependencies: none
  - Output: code + tests (unit U1, which also covers AC-2 to AC-4)
  - Owner: thoth-worker
  - Writes: src/integration/pi/{index,lifecycle}.ts, src/integration/recovery.ts, tests/integration/pi-native-plugin.test.ts, tests/integration/pi-lifecycle.test.ts, tests/integration/recovery.test.ts
  - Interface boundaries: the `mem_session` lifecycle dispatch contract and the verifiedRecovery validation stay unchanged; OpenCode consumes recovery.ts after U1
  - Focused check and PASS evidence: the Pi tests assert that no `systemPromptOptions.sections` mutation occurs across start, prompts, a save and compaction
  - Return milestone: the U1 tests and `tsc` are green, with a diff summary
  - Stop / reassessment: Pi's typed `before_agent_start` result cannot carry `message` without `systemPrompt`, or sections cannot be left untouched
- [x] AC-2: Pi delivers one hidden recovery message per run boundary, with reload deduplication
  - Outcome: one `thoth-mem-recovery` message (`display: false`) on the first root prompt for startup/resume/new/fork; none on reload when the branch already has one after the latest compaction; no later message or `recover` dispatch
  - Known entrypoints and skill paths: src/integration/pi/index.ts; installed Pi types `dist/core/extensions/types.d.ts:575-580,1125-1128`, `dist/core/session-manager.d.ts:46,109-111,311,334`
  - Inputs: D1, D2
  - Dependencies: none (unit U1)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: as for AC-1
  - Interface boundaries: lifecycle keys stay unique per run (run nonce)
  - Focused check and PASS evidence: the tests cover each reason, reload with and without an existing message, and a reload after a compaction that has no message after it
  - Return milestone: with AC-1
  - Stop / reassessment: `getBranch` is unavailable in the extension context type
- [x] AC-3: Pi post-compaction delivery
  - Outcome: the next root prompt after a successful compaction carries one message with the `guide_post_compact` recovery; a failed compaction schedules nothing
  - Known entrypoints and skill paths: src/integration/pi/index.ts (`session_compact`, `session_compact_failed`)
  - Inputs: D4
  - Dependencies: none (unit U1)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: as for AC-1
  - Interface boundaries: the compaction summary forwarding and its keys are unchanged
  - Focused check and PASS evidence: a test runs compaction, then two prompts, and asserts exactly one message on the first
  - Return milestone: with AC-1
  - Stop / reassessment: none expected
- [x] AC-4: Pi unavailable-start fallback and retry
  - Outcome: the identity-only block first, then the verified block exactly once on a later prompt, after which retries stop; at most two blocks per boundary; invalid identity delivers nothing; the startup-timeout warning is unchanged
  - Known entrypoints and skill paths: src/integration/pi/index.ts (:90-110), src/integration/recovery.ts (:32-69), src/integration/pi/mcp-client.ts (:129-149)
  - Inputs: D3
  - Dependencies: none (unit U1)
  - Output: code + tests
  - Owner: thoth-worker
  - Writes: as for AC-1
  - Interface boundaries: verifiedRecovery validation stays intact; it only exposes whether the block is verified or a fallback
  - Focused check and PASS evidence: a test with the client failing at start and recovering later asserts the messages per prompt and the dispatch counts
  - Return milestone: with AC-1
  - Stop / reassessment: the fallback and verified paths cannot be told apart without changing the envelope
- [x] AC-5: OpenCode delivers recovery as a persisted synthetic part
  - Outcome: the system transform carries no recovery; `chat.message` appends one synthetic part on the process-first root message and the first message after compaction; delegated sessions receive none; capture excludes the part; the unavailable path follows D3
  - Known entrypoints and skill paths: src/integration/opencode/plugin.ts (:98-216), node_modules/@opencode-ai/plugin/dist/index.d.ts:185-199,259-270, node_modules/.pnpm/@opencode-ai+sdk@1.18.2/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:142-149; skills tdd, simplify
  - Inputs: D1, D2, D3, D4, D8, D9, D10; Exploration (librarian q5)
  - Dependencies: AC-1 to AC-4 accepted (shared recovery.ts)
  - Output: code + tests (unit U2)
  - Owner: thoth-worker
  - Writes: src/integration/opencode/plugin.ts, tests/integration/opencode-native-plugin.test.ts
  - Interface boundaries: the native identity tool, MCP configuration, capture, checkpoint and finalize are unchanged
  - Focused check and PASS evidence: the tests assert:
    - an empty system output;
    - one D8-shaped part on the first and the post-compaction messages only;
    - D8 ordering for an empty parts array, native ids, non-canonical ids (e.g. `prt_supermemory-nudge-1`) and a maximum-component id (`prt_ffffffffffff…`);
    - a fresh plugin, with no prior created or updated events, that receives a resumed root message gets the part, while a child session or a failed lookup gets none and the delivery stays pending;
    - no second part when the same message ID is resubmitted with a reconstructed parts array, both in-process and on a fresh plugin whose stubbed persisted message already has the part, with the pending verified block delivered on the next new message instead;
    - no part for a child session;
    - no capture of the part;
    - the fallback then verified sequence.
  - Return milestone: the U2 tests and `tsc` are green, with a diff summary
  - Stop / reassessment: the typed `Part` or the SDK `session.get`/`session.message` call cannot be used inside `chat.message` with the 1.18.2 types
- [x] AC-6: Claude Code and Codex stay SessionStart-only
  - Outcome: confirmation that the existing tests still pin `SessionStart`-only `additionalContext`
  - Known entrypoints and skill paths: plugin/runners/public-runner.mjs (:201-207), tests/integration/public-plugin-runner.test.ts (:406,442,479), tests/integration/adapters.test.ts (:60,74)
  - Inputs: Exploration
  - Dependencies: AC-7 accepted
  - Output: check result
  - Owner: root
  - Writes: none
  - Interface boundaries: none
  - Focused check and PASS evidence: `pnpm exec vitest run tests/integration/public-plugin-runner.test.ts tests/integration/adapters.test.ts` passes, and "injects only on SessionStart" is green
  - Return milestone: before final verification
  - Stop / reassessment: a test reveals per-prompt context
- [x] AC-7: Docs, Skill references and packed-plugin smoke follow the new delivery
  - Outcome: the docs and packaged Skill references describe message delivery at the boundaries; the packed smoke asserts the Pi message and the OpenCode part, with no system recovery
  - Known entrypoints and skill paths: docs/agent/native-lifecycle.md (:15,94,183), docs/agent/persistence-retrieval.md (:31), integrations/pi/skills/thoth-mem/references/pi.md (:8-10), integrations/opencode/skills/thoth-mem/references/opencode.md, scripts/verify-packed-plugins.mjs (:277-279,321-324)
  - Inputs: the accepted U1 and U2 diffs
  - Dependencies: AC-1 to AC-5 accepted
  - Output: doc and script edits (unit U3)
  - Owner: thoth-worker
  - Writes: the files above, any packaged copies the build generates from them, and tests/packaging/first-product.test.ts (pins the Skill guidance)
  - Interface boundaries: canonical specs change only through the archive deltas
  - Focused check and PASS evidence: the packed `tests/packaging/first-product.test.ts` and `tests/integration/public-marketplace-smoke.test.ts` pass with `npm_execpath` set
  - Return milestone: the packed tests are green, with a diff summary
  - Stop / reassessment: the packed harness cannot observe a `before_agent_start` message

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: round 1 REJECTed with three OpenCode blockers (part-id ordering, cold resume, resubmission duplicates), which were repaired as D8-D10. Round 2, a fresh Oracle, returned OKAY with no blocking risks; the envelope was validated by validate-result.mjs (exit 0). Nonblocking caution: select the D8 maximum by binary/byte ordering, not localeCompare, and add a Unicode ordering regression.
Implementation: the user explicitly chose "Implementar" after the validated OKAY (2026-10-20). No commit, release or host install is authorized by that choice.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: ff4650f39adebdb405a3b8c9b2c3e3f446efb627027663d11a85f83e8ded8d28

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-7 and the declared durable deltas are satisfied. Cold-session capture is consistent with D9: verified resumed roots enter the existing sanitized capture path; delegated and unverifiable sessions remain excluded.",
  "evidence": [
    {
      "id": "E1",
      "kind": "integrity",
      "locator": ".thoth/changes/cache-stable-recovery/cache-stable-recovery.md; .thoth/specs/{harness-integration,retrieval}/spec.md",
      "claim": "Independently computed record-prefix SHA-256 is ff4650f39adebdb405a3b8c9b2c3e3f446efb627027663d11a85f83e8ded8d28. Canonical digests match 5bfaa8ddc63a8794d5df6e4c72d2c5ecb9eff41e0a00b9dcf40c87e26ba9277c and 23d7eba03c94e5f0af3ff3e08f532e3dcbee0d1fa3044a9bf994c26d9981a7f0.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "code-and-tests",
      "locator": "src/integration/pi/index.ts:87-195; tests/integration/pi-native-plugin.test.ts",
      "claim": "Pi no longer accesses or mutates system-prompt sections. Tests cover startup/resume/new/fork, unchanged frozen sections across saves, no later recovery dispatch, and reload branch scans stopping at the latest compaction.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "code-and-tests",
      "locator": "src/integration/pi/index.ts:202-215; tests/integration/pi-native-plugin.test.ts",
      "claim": "Successful compaction queues the guide_post_compact block verbatim for one subsequent hidden message. Failed compaction queues nothing new. Tests also verify stale in-flight retries cannot replace a newer compaction boundary.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "code-and-tests",
      "locator": "src/integration/recovery.ts; src/integration/pi/{index,lifecycle}.ts; src/integration/opencode/plugin.ts; tests/integration/{recovery,pi-native-plugin,opencode-native-plugin}.test.ts",
      "claim": "Recovery validation is preserved while provenance distinguishes verified blocks from local fallback. Startup and compaction tests for both hosts exercise fallback once, unavailable retries without further blocks, one verified delivery, and stopped retries. Invalid identity produces no block; timeout-warning regressions pass.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "code-and-tests",
      "locator": "src/integration/opencode/plugin.ts:81-102,133-150,225-280; tests/integration/opencode-native-plugin.test.ts",
      "claim": "OpenCode removes the system transform and pushes fully formed synthetic parts into the original array. D8 uses UTF-8 Buffer.compare plus the complete maximum ID suffix, with native-shaped empty-array IDs and Unicode regressions. D9 reuses bounded ancestry verification and retries failed cold lookups. D10 covers in-process, persisted, output-delimiter and reasoning-delimiter duplicates; 404/NotFoundError permits new messages, while other failures defer pending delivery.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "scope-and-tests",
      "locator": "plugin/runners/public-runner.mjs:201-207; tests/integration/{public-plugin-runner,adapters}.test.ts; git diff",
      "claim": "Claude Code and Codex implementation/assets are unchanged. The shared runner emits additionalContext only for SessionStart; relevant runner and adapter tests pass, including empty UserPromptSubmit output.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "documentation-and-packaging",
      "locator": "docs/agent/{native-lifecycle,persistence-retrieval}.md; integrations/{pi,opencode}/skills/thoth-mem/references; scripts/verify-packed-plugins.mjs; tests/packaging/first-product.test.ts",
      "claim": "Documentation accurately describes boundary delivery, fallback/retry, reload behavior and OpenCode deduplication. Packed smoke assertions check exact Pi message shape, untouched system state, absent OpenCode system transform, synthetic-part fields/order, and no repeated ordinary/post-compaction delivery. Script syntax check passes.",
      "basis": "observed",
      "uncertainty": "Packed execution was not independently repeated."
    },
    {
      "id": "E8",
      "kind": "execution",
      "locator": "Independent focused Vitest run; tsc --noEmit; git diff --check; validate.mjs --through verify --json",
      "claim": "All eight assigned Vitest files pass: 183/183 tests. Type checking, whitespace checking and verify validation pass. The validator's existing-capability overlap warning is nonblocking: the added requirement governs delivery placement/timing, distinct from existing normalization and attribution requirements.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E9",
      "kind": "supplied-execution-evidence",
      "locator": "Delegated assignment: U3 packed-test execution report",
      "claim": "Reported first-product 13/13 and marketplace inventory 1/1; marketplace smoke passed alone in 160.42 seconds. Direct smoke exited zero in approximately 154–157 seconds with no surviving processes. A combined run exceeded the unchanged 180-second child budget.",
      "basis": "inferred",
      "uncertainty": "Accepted supplied worker execution evidence; no independent packed-smoke replay, as instructed."
    },
    {
      "id": "E10",
      "kind": "durable-contract",
      "locator": "src/memory-core/service.ts:1102-1136; tests/integration/lifecycle.test.ts:89-107,378-449; tests/memory-core/continuation.test.ts",
      "claim": "Unchanged core recovery selection is used by recover and guide_post_compact. Passing tests verify handoff-before-predecessor ordering, own-summary exclusion, preserved explicit reads, content-less guidance, degraded identity, unchanged bounds and no automatic memory promotion.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E11",
      "kind": "freshness-and-scope",
      "locator": "git status; git diff --binary; git ls-files --others --exclude-standard",
      "claim": "HEAD matches d39b1356f50e071b2e8ad48f708446afe94bc27b. Changes are confined to the 14 declared files and the sole change record; no generated or unrelated changes were found. Tracked-diff SHA-256 remained db044aa6a3a94f543ebd378be237953689b355011c5194ec8b502b3d9aa9d14a throughout review.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect Pi diff and frozen-system-state tests; run focused tests.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E8"],
      "reason": "No system-prompt write remains, including after a memory save."
    },
    {
      "check": "AC-2",
      "method": "Inspect delivery state and reverse branch scan; exercise all start reasons and reload variants.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E8"],
      "reason": "Exact hidden message delivered once; reload suppression respects the latest compaction."
    },
    {
      "check": "AC-3",
      "method": "Inspect compaction handlers and passing verbatim-delivery/failure regressions.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E8"],
      "reason": "One guide-returned block follows successful compaction; failure adds no boundary."
    },
    {
      "check": "AC-4",
      "method": "Review provenance validation and boundary state transitions; run fallback/retry, identity and timeout tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E8"],
      "reason": "At most one fallback plus one verified block per boundary; invalid identity injects nothing."
    },
    {
      "check": "AC-5 including D8-D10",
      "method": "Inspect OpenCode hook/state logic and ordering, cold-resume, deduplication, capture and failure tests.",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E8"],
      "reason": "Append-only synthetic delivery replaces system injection; byte ordering, not-found semantics, deferred pending work and delegated exclusion satisfy the contract."
    },
    {
      "check": "D9 cold-session capture behavior",
      "method": "Compare old skip behavior with the new verified-root path and cold-session capture tests.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E8"],
      "reason": "Capturing the resumed root's current sanitized user input is consistent with D9, not transcript harvesting or expanded delegated authority."
    },
    {
      "check": "AC-6",
      "method": "Check unchanged host paths, shared output guard and passing runner/adapter tests.",
      "outcome": "pass",
      "evidenceIds": ["E6", "E8", "E11"],
      "reason": "Claude Code and Codex remain SessionStart-only."
    },
    {
      "check": "AC-7",
      "method": "Review docs and packed assertions; evaluate supplied packed execution evidence.",
      "outcome": "pass",
      "evidenceIds": ["E7", "E9"],
      "reason": "Docs and smoke contract match implementation. Standalone successful executions adequately establish packed correctness, with a nonblocking contention-related timeout risk."
    },
    {
      "check": "Declared durable deltas and source binding",
      "method": "Inspect lifecycle/retrieval contracts, passing regressions, canonical baselines and exact-byte hashes.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3", "E5", "E6", "E8", "E10"],
      "reason": "Both harness-integration deltas and the retrieval delta are supported; reviewed canonical digests match."
    },
    {
      "check": "Freshness and change hygiene",
      "method": "Compare initial/final status and tracked diff digest; inspect complete changed-file scope.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8", "E11"],
      "reason": "Reviewed inputs remained unchanged, with no unrelated or generated changes."
    },
    {
      "check": "Independent packed-smoke replay",
      "method": "Not executed, per assignment.",
      "outcome": "not-run",
      "evidenceIds": ["E7", "E9"],
      "reason": "Reused supplied successful isolated execution evidence instead."
    }
  ],
  "risks": [
    {
      "description": "The packed smoke has limited headroom under its unchanged 180-second budget and timed out under combined execution. Run expensive packaging checks serially; this is a test-reliability risk, not evidence of incorrect delivery or leaked processes.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E9"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this unchanged envelope, record concrete AC evidence, run closeout, and archive only after closeout passes.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/cache-stable-recovery/cache-stable-recovery.md",
    "reviewedRecordSha256": "ff4650f39adebdb405a3b8c9b2c3e3f446efb627027663d11a85f83e8ded8d28"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | pi-native-plugin tests (frozen sections across start, prompts, save, compaction) | Oracle E2/E8; 183/183 focused tests
- AC-2: PASS | pi-native-plugin tests (startup/resume/new/fork, reload scans to latest compaction) | Oracle E2/E8
- AC-3: PASS | pi-native-plugin compaction tests (verbatim guide_post_compact delivery once; failure adds none) | Oracle E3/E8
- AC-4: PASS | recovery + pi/opencode fallback-retry tests (attempt-keyed retries, at most two blocks, invalid identity none) | Oracle E4/E8
- AC-5: PASS | opencode-native-plugin tests (D8 byte-order ids incl. Unicode, D9 cold resume, D10 dedup, capture exclusion) | Oracle E5/E8
- AC-6: PASS | public-plugin-runner + adapters tests (SessionStart-only additionalContext, empty UserPromptSubmit) | Oracle E6/E8
- AC-7: PASS | docs/Skill refs reviewed; packed smoke isolated: first-product 13/13, inventory 1/1, four-host smoke 160.42 s alone | Oracle E7/E9
- Source: .thoth/specs/harness-integration/spec.md | sha256:5bfaa8ddc63a8794d5df6e4c72d2c5ecb9eff41e0a00b9dcf40c87e26ba9277c
- Source: .thoth/specs/retrieval/spec.md | sha256:23d7eba03c94e5f0af3ff3e08f532e3dcbee0d1fa3044a9bf994c26d9981a7f0

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
