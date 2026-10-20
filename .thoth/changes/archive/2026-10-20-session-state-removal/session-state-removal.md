# Change: session-state-removal

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

The user asked what value marking a session open or closed provides, given that no harness exposes such an indicator and any session can be resumed. Explorer reports (read-only, 2026-10-20):

- **Value of state.**
  - Previous-session selection orders by non-summary activity, not by state (`ledger.ts:124-133`). Retention, privacy, ranking, revision-11 cleanup and metrics never read state (cleanup is reference-based; metrics use `started_at` only, `service.ts:379-385`).
  - `ended` only selects whether a lazily derived summary is `final` or `checkpoint` (`service.ts:974-977`); derived claims do not depend on it (`session-summary-derivation.ts:178-195`).
  - `compacted` gates `guide_post_compact`: without it, guidance records a degraded `precompact_unconfirmed` receipt and drops the host text (`service.ts:1151-1153`). Finalize sets `ended` and pre-compaction sets `compacted` (`:1177-1178`).
  - Non-summary evidence reopens an ended session (`ledger.ts:142-152`, `service.ts:464`).
  - No production path writes `degraded` session state. Creation always inserts `active` (`ledger.ts:96-100`), the importer writes `ended`/`active` (`import/writer.ts:209-212`), and lifecycle degradation lives only in receipts. Observation promotion and review still reject a degraded session (`service.ts:617-618`, `observations.ts:174-175`); a test manufactures one through SQL (`observation-promotion.test.ts:54`).
- **Live data** (read-only):
  - 7,441 sessions: 5,906 active, 57 compacted, 1,478 ended; 6,766 of them are imports.
  - 14 summaries in 4 sessions. Only session `22fdbab7` holds both kinds, and its checkpoint v8 and final v3 share coverage 1-51 with identical claims.
  - The file is 138 MB.
- **Summary kind.**
  - It is part of the closed contracts (`contracts.ts:17,56`) and of the submission evidence schema `thoth-mem.session-summary.v1`, whose canonicalizer requires it (`session-summaries.ts:17,64-128`).
  - The projection keys current rows and versions per `(session, kind)` and rejects equal coverage (`:188-196`). Rebuild replays submissions in event order (`:204-228`).
  - In the DDL (`schema.ts:127-130`), kind appears in a CHECK, `UNIQUE(session_id,kind,version)`, the current-per-kind unique index and the selection index. The immutability triggers (`:54-72`) protect it.
  - Foreign keys to `session_summaries` come from `lifecycle_receipts.summary_id`, `supersedes_id` and `session_summary_claims`. Projection IDs derive from submission evidence IDs, not from kind or version.
  - Derivation caching keys on kind and watermark (`service.ts:1065-1078`). Selection prefers final on coverage ties (`:915,972`). Lifecycle checks the submitted kind against the operation (`:1094-1096`).
  - Kind also reaches recovery rendering `[summary:<kind> vN]` (`continuation.ts:115-123`), kind validation in `integration/recovery.ts:67-68` and the OpenCode client (`node-lifecycle-client.ts:122,185`), the `mem_session` input schema and context items (`tools/index.ts:183-197,250,262-267`), and summary submissions in `benchmarks/run.mjs:205,226,259`. Pi rendering already falls back to the record type (`pi/render.ts:130-134`).
- **Schema.**
  - `sessions.state` has a column-level CHECK and no index. `ended_at` has no constraint. Six tables reference `sessions(id)`.
  - Revision 10 demonstrates a table rebuild with foreign keys off, a revision recheck under `BEGIN IMMEDIATE`, logical-state comparison, and integrity and foreign-key checks (`migrations.ts:433-468`). Revision 11 shows set-based work with `ensureBackup` (`:515-546`).
  - The backup of the whole 138 MB file dominates migration time. The previous revision took 5.4 s on a copy, against the 5 s host timeout; `thoth-mem migrate` is the manual path.
- **Importer.** It maps legacy end into `state` and `ended_at`, and into the transformed receipt hash (`writer.ts:209-218`). Verification reconstructs both (`verify.ts:134-141,325-326`). Evidence metadata does not preserve the legacy end separately.
- **Pi run nonce.** It still has value without state: a resumed quit does not replay the earlier finalize receipt, so new activity is summarized at exit.
- **Codex/Claude.** Their resume-key repetition needs no fix, because lazy derivation at the next recovery covers it.
- **Untracked governance files** in the main worktree (master `f340d11`):
  - `.thoth/changes/archive/2026-10-13-proactive-memory-adoption/proactive-memory-adoption.md` is an archived record (Oracle PASS) of commit `5173c07`, which was never committed. It contains no secrets or private paths.
  - `.thoth/specs/agent-memory-adoption/spec.md` is a tenth capability that breaks the nine-capability check in `tests/packaging/canonical-product-contract.test.ts:52-58`. Its three requirements are still implemented (`continuation.ts:231-246`, `tools/index.ts:32-47,59-71`, `cli.ts:251-275`, `service.ts:363-406`). They are not fully covered by canonical specs, and one has a dangling "AC-2 size limits" reference. Current bounds: hint at most 97 code points; topic keys over 60 code points abstain; server instructions at most 699 UTF-16 units, the six descriptions at most 1,653, and the Skill under 7,244.

## Intent

Sessions carry no lifecycle state, and every session has one versioned summary lineage. Lifecycle operations become moments ("derive or accept a summary now"; "store this compaction text") instead of state transitions. The never-committed adoption record is committed, and its requirements move into the canonical specs.

## Non-goals

- No fix for the Codex/Claude resume-key repetition.
- No change to derivation claim rules or the generator identity.
- No change to recovery selection order or caps, to privacy, or to lazy session creation.
- No change to receipts beyond losing the `precompact_unconfirmed` outcome.
- No new tools. Tool descriptions are unchanged.
- No rewriting of immutable evidence.
- No push, publish or real-host smoke. The live database migration runs only with explicit user authorization.

## Acceptance

- AC-1: Sessions have no lifecycle state.
  - Schema: a new schema revision drops `sessions.state` and `sessions.ended_at`; fresh databases are created without them.
  - Behavior: no code path reads or writes session state or end time. Lifecycle operations never transition a session. New activity on a finalized session is appended normally, and a later finalize derives a new summary version covering it.
  - Removed: reopening (`reopenSessionOnActivity`); the `degraded` session guard in observation promotion and review (their missing, foreign-project, import-session and authority guards are unchanged); the importer's target state and end mapping. The importer's transformed receipt hash stays byte-identical, so re-importing the same legacy source is idempotent and verification passes.
- AC-2: Lifecycle operations are moments, not transitions.
  - `checkpoint_pre_compact` and `finalize` accept a submitted summary or derive/reuse one. There is no operation/kind check. A finalize after a pre-compaction with no new activity reuses the current summary without a new version.
  - `guide_post_compact` no longer requires a prior pre-compaction. It stores confirmed host text as `checkpoint` evidence, parses recognized headings into a summary, and renders recovery. The `precompact_unconfirmed` outcome disappears.
  - Degraded identity still fails closed. Lazy sessions are unchanged: untouched sessions write nothing.
  - Pi keeps its per-run nonce, so quit→resume→prompt→quit records a second finalize receipt and a new summary version covering the new prompt (real temporary database test).
- AC-3: One summary lineage per session.
  - No summary carries a checkpoint/final kind. Each session has at most one current summary and versions 1..n.
  - A new summary (submitted, derived, or parsed from host text) supersedes the current one when its coverage end is at least the current coverage end, and is rejected as late otherwise. Derivation reuses the current summary whenever it already covers the latest non-summary evidence.
  - New submissions are canonicalized without kind under a new submission evidence schema identifier. Evidence under the previous identifier is still parsed with its kind ignored.
  - Rebuilding projections from evidence orders submissions by coverage end, then event sequence, and reproduces the migrated projection.
  - Selection orders by coverage end, then creation time, then ID, with no kind preference.
- AC-4: Migration.
  - Revision 12 runs from revision 11 with the standard verified backup, revision recheck under `BEGIN IMMEDIATE`, integrity and foreign-key checks, and `MigrationReport`.
  - It drops the two session columns and rebuilds `session_summaries` without kind. Each session's summaries are renumbered into one lineage ordered by coverage end, then submission event sequence, then ID: versions 1..n, predecessor links recomputed, the last one current. Every summary, claim, support and receipt link keeps its ID. A rerun changes nothing.
  - Tests cover:
    - an interleaved-kind session with equal coverage;
    - a file-backed database of about 8,000 sessions within a generous bound;
    - fresh-database DDL equal to the migrated DDL.
  - Root check on a copy of the live database: 11→12 succeeds; counts of sessions, evidence, memories, receipts and summaries are unchanged; session `22fdbab7` holds 11 versions with `ce958fa1` current.
- AC-5: Surfaces.
  - The `mem_session` input summary has no `kind`. MCP tool descriptions and the Pi tool definitions are unchanged, and the budget tests pass without raising ceilings.
  - Context items, `mem_project` summaries/briefing, `mem_get` summary records and recovery provenance carry no kind. Recovery renders `[summary vN] … (summary:<id>)` within unchanged caps.
  - Integration validation accepts kind-free summaries: shared recovery parsing, the OpenCode client, Pi rendering, adapters, and generic MCP close-finalize.
  - The benchmark runner submits kind-free summaries. The tracked benchmark reports are left untouched; any regenerated difference is reported.
- AC-6: Governance.
  - The three adoption requirements are added to the retrieval, tools and cli specs per the deltas below.
  - The archived proactive-memory-adoption record is committed byte-identical, and the stray `agent-memory-adoption` capability directory is removed from the main worktree.
  - After archive, `tests/packaging/canonical-product-contract.test.ts` passes with nine capabilities.
- AC-7: Docs describe:
  - stateless sessions and lifecycle moments;
  - the single summary lineage and the late-summary rule;
  - post-compaction guidance without a gate;
  - revision 12 and the manual `thoth-mem migrate` path;
  - the removed final/checkpoint labels.

  Docs: README, `docs/agent/{native-lifecycle,persistence-retrieval,testing}.md`, plus packaged Skill text only if it states something now wrong (reported).

## Clarifications

- **User decision:** remove all session state and unify the final/checkpoint summaries, dropping the compaction gate; no Codex/Claude key fix. Chosen over removing only "ended" and over keeping things as they are.
- **User decision:** commit the adoption record and fold its three requirements into existing specs as deltas of this change.
- Root technical decisions are D1-D12 below. They resolve the explorers' open questions; none is human-owned.

## Decisions

- **D1 — Session columns.** Drop `sessions.state` and `sessions.ended_at`, keeping `started_at` and `next_event_sequence`. Prefer `ALTER TABLE … DROP COLUMN`: the CHECK is column-level and there is no index or trigger on either column. Fall back to the revision-10 rebuild pattern only if SQLite refuses.
- **D2 — Summary table.** Rebuild `session_summaries` without `kind`, using the revision-10 pattern with foreign keys off:
  - Constraints: `UNIQUE(session_id,version)`, a unique current index on `(session_id) WHERE status='current'`, and a selection index without kind.
  - Triggers: recreated with identical guarantees, minus kind.
  - Renumbering is set-based with window functions: order by `source_sequence_to`, then the submission event sequence, then `id`. `supersedes_id` is the previous row in that order; the last row is current.
- **D3 — Insertion rule.** A new summary supersedes the current one when its coverage end is ≥ the current coverage end. Equal coverage is allowed, so a submitted summary can replace a derived one at the same watermark. A lower coverage end is rejected as late.
- **D4 — Rebuild.** Rebuild replays submissions ordered by coverage end, then event sequence, so it matches D2/D3. Previous-identifier submissions keep their immutable bytes; their kind is ignored.
- **D5 — Submission schema.** New submissions use the next submission schema identifier (the current one with its generation number incremented) and carry no kind. The parser accepts both identifiers. Canonical spec text describes this without naming the identifier, so the transitional-label check in `canonical-product-contract.test.ts:61-72` stays green.
- **D6 — Lifecycle.**
  - No state writes or gates.
  - The submitted-kind/operation check is removed; structured summaries remain accepted only on pre-compaction and finalize.
  - `guide_post_compact` has no compaction gate. Identity degradation (`identity_unconfirmed`) stays fail-closed.
  - Derivation caching keys on session and watermark.
- **D7 — Rendering.** Recovery renders a summary as `[summary vN]` with the unchanged `(summary:<id>)` marker. Selection ties order by creation time descending, then ID.
- **D8 — Removed code.** Delete `reopenSessionOnActivity` and the final-if-ended choice. Keep the Pi per-run nonce for exit-time summaries.
- **D9 — Observation guards.** Remove the degraded-session guard; no production writer produces that state, and observation APIs carry no lifecycle confidence. Delete the SQL-manufactured test case. The canonical taxonomy requirement is unchanged: delegated-authority and other guards still fail closed.
- **D10 — Importer.** Stop writing target state and end time. Keep computing the transformed receipt hash from the same legacy-derived fields so the hash stays byte-identical. Drop only the target state/end preservation assertions in `verify.ts`.
- **D11 — Tool surface.** The `mem_session` summary schema drops `kind`, which is a deliberate schema change. Update the exact schema expectations; keep the budget ceilings, which are upper bounds.
- **D12 — Governance files.**
  - Root copies the archived adoption record byte-identical into this worktree before archive.
  - The three requirements become ADDED deltas.
  - Before merging into master, root deletes both untracked directories in the main worktree. Otherwise git refuses to overwrite untracked files, and the stray capability fails the nine-capability check.

## Durable deltas

- `ADDED store` **Sessions MUST Carry No Lifecycle State** — A session MUST record only its project, root session key, harness, start time, and event sequence; no operation MUST mark a session active, compacted, ended, or degraded or record an end time, every session MUST accept new activity at any time, and no lifecycle operation MUST depend on a prior lifecycle operation for admission.
  - GIVEN a Codex session that was finalized; WHEN a new root prompt is captured and finalize runs again; THEN the prompt is appended without any session transition and the second finalize derives a new summary version covering it.
- `ADDED store` **Session Summaries MUST Form One Version Lineage per Session** — Every session MUST have at most one current summary and one linear version history regardless of whether a summary was submitted, derived, or parsed from host compaction text, and summary records, submissions, and listings MUST carry no checkpoint or final distinction; a new summary MUST supersede the current one when its coverage end is at least the current coverage end and MUST be rejected as late otherwise; deriving a summary MUST reuse the current summary when it already covers the session's latest non-summary evidence; and rebuilding summary projections from immutable submission evidence MUST order submissions by coverage end and then event sequence, ignoring any distinction recorded by earlier submissions.
  - GIVEN a session with a pre-compaction summary and no later activity; WHEN finalize runs and an agent then submits a summary with the same coverage; THEN finalize reuses the current summary without a new version and the submission becomes the next current version superseding it.
- `ADDED store` **Schema Migration MUST Drop Session State and Unify Summary Lineage** — The schema migration that removes session state MUST, after the standard pre-migration backup and under the existing cross-process migration safety, drop the session state and end-time columns and rebuild session summaries without the checkpoint or final distinction, renumbering each session's summaries into one lineage ordered by coverage end, then submission event sequence, then identifier, with exactly one current summary per session and each predecessor linked, while preserving every summary, claim, support, receipt link, and identifier; it MUST verify integrity and foreign-key validity before recording the revision, and rerunning it MUST change nothing.
  - GIVEN a database at the preceding revision with about 8,000 sessions in every state and one session whose checkpoint and final summaries interleave in coverage, two of them with equal coverage; WHEN the migration runs; THEN no session records a state or end time, that session has one lineage whose versions follow coverage then event order with the later equal-coverage summary current, every summary, claim, and receipt link keeps its identifier, a backup exists, and rerunning it changes nothing.
- `REMOVED store` **Session Activity MUST Reopen an Ended Session** — Sessions no longer carry a state to reopen; new activity is always accepted.
- `MODIFIED store` **Session Summaries MUST Be Derived Deterministically When Not Supplied** — When `checkpoint_pre_compact` or `finalize` carries no submitted summary, or the previous session needed by automatic recovery has no current summary covering its latest non-summary evidence, the service MUST derive a harness-generated summary under the current harness generator identity, distinct from the identity used before these derivation rules, without any model or network call from that session's own evidence: substantive root prompts (at least 40 code points after whitespace normalization; the first and the latest distinct one, or only the first prompt when none is substantive) as objective bounded to 300 code points; promoted decision, convention, architecture, and preference memories as decision; discovery and project-structure memories as completed; failure memories as completed with outcome failed; open handoffs as next action; closed handoffs as completed; and the newest parsed host compaction claims, omitting its objective, next-action, pending, and blocker claims when a later evidence event of the session is a substantive root prompt or supports a memory-derived claim; each memory-derived claim MUST state the memory title with its primary labeled line (Result for direct memories, First pending action for open handoffs, the closing Result for closed handoffs, otherwise the first line) bounded to 300 code points, claims with identical kind and content MUST collapse into one claim citing their combined supports within the support limit, every claim MUST cite in-session evidence inside its coverage and respect the existing claim and size limits, a session without citable evidence MUST receive no summary, and every derived summary MUST join the session's single summary lineage.
  - GIVEN a Pi session whose compaction listed a goal, a next step, a pending checklist, decisions, and modified files, followed by a substantive root prompt and a newly saved open handoff; WHEN its summary is derived at finalize; THEN it keeps the compaction's decision, completed, and changed-surface claims, takes its objectives only from root prompts and its next action only from the open handoff, and contains no compaction pending claim.
- `MODIFIED harness-integration` **Runtime Lifecycle MUST Preserve the Core Contract** — OpenCode, Codex, Claude Code, and Pi lifecycle adapters MUST normalize only fields their supported native contracts actually provide and MUST apply shared privacy sanitation before content-derived identity; Pi MUST map documented session start, admitted root input, context preparation, pre-compaction, successful compaction, failed compaction, settled-agent, and shutdown events onto enroll, recover, capture-root (one ordered root-prompt evidence event per distinct sanitized interactive or RPC input), checkpoint-pre-compact, guide-post-compact, non-finalizing degradation or flush, and a single finalize, and agent-settled or failed-compaction events MUST NOT finalize; where a native contract provides the host's own generated compaction summary text (Pi `session_compact` compaction entry summary, Claude Code `PostCompact` `compact_summary`, and the OpenCode assistant summary message readable after `session.compacted`) the adapter MUST forward it as `guide_post_compact` content, while Codex and any host without such a documented field MUST NOT parse transcripts for it; forwarded compaction text and prompt, model, tool, summary, or lifecycle content MUST NOT be automatically promoted to memories or observations and MAY only become session evidence and harness-derived session summaries.
  - GIVEN Pi reports a successful compaction whose entry carries the default structured summary text; WHEN the lifecycle hooks execute; THEN thoth-mem checkpoints before compaction, forwards the text with guide-post-compact so it is stored as checkpoint evidence with a harness-derived session summary citing it, creates no memory or observation, and refreshes the next bounded recovery block.
- `MODIFIED harness-integration` **Lifecycle Events MUST Be Idempotent and Truthful** — Stable capture keys MUST identify distinct sanitized root-user submissions rather than only their enclosing turn; a native immutable message ID MUST be used when available, otherwise, including for Pi root input, a deterministic key MUST bind documented stable session or turn fields with the sanitized prompt fingerprint so different prompts remain distinct and exact retries remain idempotent; harness-derived and host-harvested session summaries MUST be idempotent per session and latest non-summary evidence sequence, so a replayed lifecycle event or lazy derivation returns the identical canonical summary or none, and persisting a summary MUST NOT itself trigger another derivation.
  - GIVEN two different interactive or RPC root inputs, an exact retry of one, and then a replayed finalize; WHEN the events are processed; THEN the prompts receive distinct capture keys, the retry is a duplicate, and the replayed finalize returns the original derived summary without creating a new version.
- `MODIFIED harness-integration` **Host Compaction Text MUST Become Cited Checkpoint Evidence** — When `guide_post_compact` carries host compaction text from a confirmed identity, whether or not a pre-compaction event preceded it, the service MUST sanitize and store it as `checkpoint` session evidence and MUST derive a harness session summary only from recognized section headings (goal, request, or intent as objective; done or completed as completed; in progress or pending as pending; blocked as blocker; decisions as decision; next steps as next action; modified files as changed surface), each claim citing that evidence and bounded to 300 code points; only the first objective section MUST yield an objective, the file paths of every modified-files section or block MUST merge into one changed-surface claim in first-seen order without duplicates, text without recognized headings MUST remain evidence only, and the text MUST never become a memory or observation.
  - GIVEN Pi split-turn compaction text with Goal, Done, In Progress, Key Decisions, and Next Steps sections, a later Original Request section, and two modified-files blocks with overlapping paths, plus another text with no recognized headings, both arriving without a preceding pre-compaction event; WHEN each arrives on `guide_post_compact`; THEN the first yields a session summary with one objective from Goal, completed, pending, decision, and next-action claims, and one changed-surface claim listing each path once, all citing its evidence, and the second yields evidence only.
- `MODIFIED harness-integration` **Pi Lifecycle Keys MUST Be Unique per Extension Run** — The Pi extension MUST derive enroll, recovery, post-compaction refresh, and finalize event keys from a nonce created at each `session_start`, so that keys stay stable within one run and differ across runs of the same root session; quitting a resumed session MUST therefore record a new finalize receipt and derive a summary covering its new activity, while an untouched start still writes nothing.
  - GIVEN a Pi session that is quit, resumed, given a new prompt, and quit again; WHEN its lifecycle hooks run; THEN two finalize receipts exist and the session's current summary covers the new prompt.
- `MODIFIED retrieval` **Project Briefing MUST Be Deterministic and Bounded** — Automatic recovery for a verified root session (enroll/recover, per-prompt refresh, and `guide_post_compact`) MUST render one deterministic bounded selection that never includes that session's own summaries, and `guide_post_compact` MUST render the same project recovery as ordinary recovery instead of abstaining, whether or not a pre-compaction event preceded it; the selection MUST order the newest open handoff first, then the newest current summary of the previous session (the most recent other root session of the same project by last non-summary activity, from any harness), then the remaining project memories in the existing kind order, within the existing aggregate and host rendering caps, and summaries of every other session MUST stay absent; explicit `mem_context` with a verified session pair MAY still return that session's own newest summary; degraded-identity post-compaction events MUST keep failing closed without injecting memory.
  - GIVEN a root session with its own summary, an open project handoff, and a previous root session with a summary; WHEN `guide_post_compact` runs; THEN recovery renders the open handoff, then the previous session's summary, then remaining memories within the caps and omits the current session's own summary.
- `ADDED retrieval` **Recovered Handoffs MUST Be Closable Within the Recovery Budget** — Recovery MUST append at most one closure hint, immediately after the first rendered handoff's unchanged memory marker, containing its exact `topic_key`; the hint MUST add at most 97 code points and MUST use only post-render slack within the effective recovery limit of at most 1000 code points, without changing selection, allocation, or other rendered bytes; recovery MUST omit the hint when the key is absent, exceeds 60 code points, changes under display normalization or privacy sanitation, contains any selected memory's evidence ID or selected summary's submission evidence ID, or does not fit.
  - GIVEN a selected handoff with an eligible exact topic key; WHEN recovery renders within its effective limit; THEN at most one closure hint follows that handoff's unchanged marker if sufficient slack remains, otherwise the output remains unchanged.
- `MODIFIED tools` **MCP Surface MUST Be Compact and Workflow-Level** — The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, MUST publish concise server instructions that balance progressive recall with deliberate durable save/handoff behavior, and MUST publish a distinct action-oriented description for each tool; tool and field descriptions MUST state each operational constraint once in compact form without repeating a tool description inside a field description, the catalog schemas registered natively in Pi MUST omit the `$schema` marker, and the aggregate serialized size of the model-facing definitions on the MCP and Pi surfaces MUST be locked by budget tests so it grows only through a deliberate definition change; compacting descriptions MUST NOT alter input schemas or runtime validation.
  - GIVEN the catalog; WHEN an MCP client lists tools and a Pi session registers its tools; THEN each surface stays within its pinned aggregate budget and every listed input schema is the one runtime validation enforces.
- `ADDED tools` **Memory Guidance MUST Name Proactive Recall, Save, and Closure Triggers** — Server instructions, the relevant tool descriptions, and the shared Skill MUST direct unprompted recall before exploring non-trivial repository work, immediate saving of verified durable findings, and closure of completed recovered handoffs by saving their outcome under the same `topic_key`; server instructions and the Skill MUST exclude trivial or conversational turns; server instructions MUST remain at most 699 UTF-16 code units, the six tool descriptions MUST total at most 1653 UTF-16 code units, and the canonical Skill MUST remain below 7244 UTF-16 code units, with distributed Skill copies synchronized.
  - GIVEN the MCP server and packaged shared Skill; WHEN an agent loads their memory guidance; THEN it receives the task-start recall, verified-save, and same-key closure triggers within the stated text ceilings, with equivalent Skill guidance across supported distributions.
- `MODIFIED tools` **Generic MCP Connections MUST Receive an Unverified Connection Session** — When an MCP client that does not identify as a supported native host calls a tool without a session pair, the server MUST attribute the call to one server-assigned `mcp` session per connection, MUST finalize that session with a derived summary when the transport closes and otherwise leave it to lazy derivation, and MUST use it as the current session for previous-session selection in `mem_context` without a pair; this session MUST NOT authorize observation review or promotion or lifecycle summary submission, and native clients MUST keep their existing attribution.
  - GIVEN a generic MCP client that saves two memories without a session pair and then closes stdin; WHEN a later connection reads context; THEN both saves belong to one `mcp` connection session with a derived summary shown as the previous-session summary, and an observation review attempted with that session's identity is rejected.
- `MODIFIED tools` **mem_project Summaries MUST Return Oversized Records in Bounded Form** — `mem_project action=summaries` MUST list summaries newest first within `budget_chars`; when a record does not fit the remaining budget, the response MUST include it in bounded form with its identifiers, version, status, coverage, and generator plus as many leading claims as fit, clipping the last included claim when necessary and marking the item truncated, and MUST then stop with `payload_truncated`, so a budget able to hold one record's metadata never yields an empty list while summaries exist; the full record MUST remain available through `mem_get`.
  - GIVEN a project whose only summary serializes to 13,000 characters; WHEN `mem_project action=summaries` runs with `budget_chars` 4000; THEN it returns that summary's ID and metadata with leading claims within 4,000 characters, marks it truncated, and warns `payload_truncated`.
- `MODIFIED tools` **Tool Results MUST Be Valid Bounded JSON** — Every MCP tool result MUST carry text content that is valid JSON of at most 20,000 characters and equal to the serialization of its `structuredContent`; when the full envelope would exceed that cap, the server MUST shrink it deterministically by first clipping the longest string values (never object keys) and then dropping trailing elements of the largest arrays, preserving the schema, the envelope structure, and every string of at most 64 code points, and MUST add `payload_truncated` to the envelope warnings; every clip MUST strictly shorten its string so shrinking terminates; results that carry a continuation cursor MUST be sized against the complete envelope so that bounding never alters them; results that fit MUST remain unchanged; and no host bridge, including Pi, MUST cut tool text, replacing an over-limit text with a valid bounded notice instead.
  - GIVEN a valid submitted session summary close to the submission limit whose expanded envelope exceeds 20,000 characters, and a Pi tool call; WHEN `mem_get` expands it through MCP and through the Pi extension; THEN both receive valid JSON within 20,000 characters with the summary ID, version, coverage, and leading claims, clipped claim text, and the `payload_truncated` warning.
- `ADDED cli` **Adoption Baseline MUST Report Exact-Project Metrics Without Writes** — `thoth-mem adoption --project <exact-key-or-alias> [--json] [--data-dir <dir>]` MUST report exact-project open, replaced, and closed handoff counts, open-handoff ages, and save totals and zero-save counts across persisted sessions, including per-session counts of distinct session-attributed agent evidence of kind `explicit_save` or `handoff`; automatic captures and unattributed evidence MUST NOT count; replacement MUST mean supersession by another handoff and closure MUST mean supersession by a non-handoff under the same topic key; human and JSON output MUST state that recall usage is not measured; and the command MUST NOT create, migrate, or mutate storage.
  - GIVEN an existing database containing the selected project's handoffs and persisted sessions alongside another project's records; WHEN the adoption command runs in human or JSON mode; THEN it reports only the selected project's lifecycle, age, and attributed-save metrics, explicitly leaves recall usage unmeasured, and performs no storage writes.

## Plan

Work is sequential and test-first (`tdd`), one worker per unit, each followed by a `simplify` pass. Code is strict TypeScript with ESM `.js` imports. No commits, no edits to `dist/`, and workers never edit this record. After every run of the unit vitest config, restore `benchmarks/results/fixture-report.json` with `git checkout --`. Never touch `~/.thoth-mem` or host configs.

1. **U1 — Stateless sessions (AC-1, AC-2, part of AC-4).**
   - Revision 12, first part: drop the two session columns and change the fresh DDL.
   - Remove every state/end read and write: the ledger, lifecycle writes, the `guide_post_compact` gate and `precompact_unconfirmed`, reopening, the degraded observation guard, and the importer's target mapping (with the hash unchanged).
   - Interim lazy kind: until U2 removes kinds, finalize derives `final` and every other derivation `checkpoint`.
   - Tests: migration (columns gone, rerun no-op, 8,000-session scale), lifecycle (finalize then new prompt then finalize; guidance without pre-compaction; degraded identity still closed), importer idempotency/verification, observation guards.
2. **U2 — One summary lineage (AC-3, AC-5, rest of AC-4).**
   - Contracts without kind; canonicalizer and parser for both submission identifiers (D5); insertion rule (D3); rebuild order (D4).
   - Revision 12, second part: rebuild `session_summaries` with set-based renumbering (D2).
   - Cache by watermark; selection without kind preference; `[summary vN]` rendering.
   - Tool schema and outputs (D11); recovery, OpenCode and Pi validation and rendering; benchmark runner submissions.
   - Update every kind-bearing test and fixture, and add the interleaved/equal-coverage migration test and the rebuild-equals-migration test.
3. **U3 — Docs (AC-7).** README and `docs/agent/{native-lifecycle,persistence-retrieval,testing}.md`. Report packaged Skill statements that need changes.
4. **Root.**
   - Copy the adoption archive record byte-identical (D12).
   - After the build, run the live-copy migration check: back up the live database read-only to a temp copy, then `node dist/index.js migrate --data-dir <copy> --json`, then compare counts and the `22fdbab7` lineage.
   - Final Oracle verification, archive, then the post-archive canonical test.
   - Commit, delete the untracked main-worktree directories, merge, build.
   - With user authorization: migrate the live database and restart Pi for a live check.

Verification:
- `pnpm exec tsc --noEmit`
- `pnpm exec vitest run --config vitest.unit.config.ts` (known: 7 CRLF report-hash failures)
- `pnpm run build`
- `pnpm exec vitest run --config vitest.integration.config.ts` (known: 4 failures from the missing adjacent `npm-cli.js`, 1 from the OpenCode checkout name)
- Root live-copy migration check and post-archive canonical test.

Risks:
- Migration time on the live 138 MB file can exceed host timeouts. Mitigated by migrating out-of-band with `thoth-mem migrate` under explicit authorization.
- The wide type ripple of U2. Mitigated by a single cohesive unit with a full tsc and suite run.
- Equal-coverage supersession changes which summary is current when two share a watermark. This is intended: the later submission wins.
- Removing the compaction gate accepts post-compaction text without a pre-compaction event. This is intended; degraded identity still fails closed.
- Merging into master fails if the untracked directories remain. Root removes them first (D12).

## Tasks

- [x] AC-1: Sessions carry no state
  - Outcome: no state or end-time columns, reads or writes; reopening and the degraded observation guard removed; importer target mapping removed with the hash byte-identical
  - Known entrypoints and skill paths: src/memory-core/sqlite/{schema,ledger,migrations}.ts, src/memory-core/service.ts (`save` ~464, lifecycle ~1090-1180, promotion ~617), src/memory-core/observations.ts:174, src/memory-core/import/{writer,verify}.ts; skills tdd, simplify, sqlite
  - Inputs: Exploration; D1, D6, D8, D9, D10
  - Dependencies: none
  - Output: code + tests
  - Owner: thoth-worker (unit U1, which also covers AC-2 and the session part of AC-4)
  - Writes: the files above plus tests/memory-core/{lifecycle,schema-migration,observation-promotion,importer,context,taxonomy-migration}.test.ts and the tests/integration lifecycle tests that pin state
  - Interface boundaries: summary kinds remain until U2 (interim: finalize derives `final`, other derivations `checkpoint`)
  - Focused check and PASS evidence: the migration drops both columns, fresh DDL matches, a rerun is a no-op, and the scale test passes; finalize→prompt→finalize gives a new version; the importer re-import is idempotent with an unchanged hash
  - Return milestone: tests green with a diff summary
  - Stop / reassessment: SQLite refuses DROP COLUMN and the rebuild pattern also fails, or a production reader of state appears that is not listed
- [x] AC-2: Lifecycle operations are moments
  - Outcome: no gate; no `precompact_unconfirmed`; degraded identity closed; Pi resume test passes
  - Known entrypoints and skill paths: src/memory-core/service.ts lifecycle, src/integration/pi/{lifecycle,index}.ts, tests/integration/{lifecycle,pi-native-plugin,pi-lifecycle}.test.ts
  - Inputs: D6, D8
  - Dependencies: U1 (same unit)
  - Output: code + tests
  - Owner: thoth-worker (U1)
  - Writes: as in AC-1
  - Interface boundaries: lazy sessions and receipts unchanged
  - Focused check and PASS evidence: guidance without pre-compaction stores evidence and a summary and renders recovery; a degraded guide fails closed; the Pi temp-DB quit→resume→prompt→quit test passes
  - Return milestone: delivered with U1
  - Stop / reassessment: a host that relies on `precompact_unconfirmed`
- [x] AC-3: One summary lineage per session
  - Outcome: kind-free contracts and submissions; D3 insertion; D4 rebuild; watermark cache; no kind preference
  - Known entrypoints and skill paths: src/memory-core/{contracts,session-summaries,session-summary-derivation,service}.ts, src/memory-core/sqlite/{schema,migrations}.ts; skills tdd, simplify, sqlite
  - Inputs: D2-D5, D7
  - Dependencies: AC-1 and AC-2 accepted
  - Output: code + tests
  - Owner: thoth-worker (unit U2, which also covers AC-5 and the summary part of AC-4)
  - Writes: memory-core, tools, integration, benchmarks/run.mjs, and every kind-bearing test or fixture
  - Interface boundaries: derivation claims and generator identity unchanged; evidence immutable
  - Focused check and PASS evidence: equal coverage supersedes and lower is rejected; finalize after pre-compaction with no activity reuses; parsing old submissions ignores kind; rebuild equals the migrated projection
  - Return milestone: tests green with a diff summary
  - Stop / reassessment: immutable evidence or triggers that cannot coexist with D4
- [x] AC-4: Revision 12 migration
  - Outcome: both migration parts with backup, recheck, integrity and FK checks, and a report; renumbering per D2
  - Known entrypoints and skill paths: src/memory-core/sqlite/migrations.ts (revision 10 rebuild ~433-468, revision 11 ~515-546), tests/memory-core/schema-migration.test.ts
  - Inputs: D1, D2
  - Dependencies: U1 for the session part, U2 for the summary part
  - Output: code + tests
  - Owner: thoth-worker (U1, then U2)
  - Writes: migrations.ts, schema.ts, schema-migration tests
  - Interface boundaries: `thoth-mem migrate` CLI unchanged
  - Focused check and PASS evidence: the interleaved/equal-coverage test; the 8,000-session scale test within its bound; fresh DDL equals migrated DDL; root live-copy check (counts unchanged, `22fdbab7` has 11 versions with `ce958fa1` current)
  - Return milestone: with U2
  - Stop / reassessment: renumbering that violates the triggers or foreign keys
  - Status: done in U1 and U2. Root live-copy check on 2026-10-20: an online backup of the live database migrated 11→12 in 5,318.7 ms. Every row count was unchanged (7,441 sessions, 23,314 evidence, 8,559 memories, 4,741 receipts, 14 summaries, 203 claims, 3,097 events). Session 22fdbab7 now has 11 versions with ce958fa1 current. Each of the 4 sessions has exactly one current summary, every receipt link resolves, integrity is ok, FK violations are 0, and a rerun reported alreadyCurrent in 74.75 ms. The copy was deleted afterwards. The live migration exceeds the 5 s host timeout, so it runs out-of-band with user authorization.
- [x] AC-5: Kind-free surfaces
  - Outcome: `mem_session` schema without kind; outputs and recovery label `[summary vN]`; integration validation; benchmark runner
  - Known entrypoints and skill paths: src/tools/index.ts:169-267, src/memory-core/continuation.ts:115-123, src/integration/recovery.ts:67, src/integration/opencode/node-lifecycle-client.ts:122,185, src/integration/pi/render.ts:130, benchmarks/run.mjs:205-259
  - Inputs: D7, D11
  - Dependencies: same unit as AC-3
  - Output: code + tests
  - Owner: thoth-worker (U2)
  - Writes: as in AC-3
  - Interface boundaries: tool descriptions unchanged; budget ceilings unchanged
  - Focused check and PASS evidence: tool budget tests and the exact schema test pass; recovery caps pass; the OpenCode and public runner tests pass
  - Return milestone: with U2
  - Stop / reassessment: a tracked benchmark report hash that must change
- [x] AC-6: Adoption requirements folded; record committed; stray capability removed
  - Outcome: three ADDED deltas applied by archive; record copied byte-identical; untracked main-worktree directories removed before merge; canonical test 2/2
  - Known entrypoints and skill paths: C:/DEV/Proyectos/Webstorm/thoth-mem/.thoth/changes/archive/2026-10-13-proactive-memory-adoption/proactive-memory-adoption.md, tests/packaging/canonical-product-contract.test.ts
  - Inputs: D12; Exploration (untracked governance files)
  - Dependencies: none for the copy; after archive for the test
  - Output: record file and merge preparation
  - Owner: root
  - Writes: .thoth/changes/archive/2026-10-13-proactive-memory-adoption/proactive-memory-adoption.md (copy)
  - Interface boundaries: archive records are historical and not scanned
  - Focused check and PASS evidence: sha256 of the copy equals the source; post-archive canonical test passes
  - Return milestone: before final verification (copy) and after archive (test)
  - Stop / reassessment: the copy differs from the source
  - Status: the record is copied byte-identical (sha256 ec0a4ae7…950d on both sides). Two root steps remain: the post-archive canonical test, and deleting the untracked main-worktree directories before the merge.
- [x] AC-7: Docs
  - Outcome: README and `docs/agent/{native-lifecycle,persistence-retrieval,testing}.md` updated; stale packaged Skill text reported
  - Known entrypoints and skill paths: README.md:140-142, docs/agent/native-lifecycle.md:3-9,88-113,177-181, docs/agent/persistence-retrieval.md:7-15,29,45, docs/agent/testing.md:141
  - Inputs: accepted outputs of U1 and U2
  - Dependencies: U2
  - Output: documentation edits
  - Owner: thoth-worker (U3)
  - Writes: the docs above
  - Interface boundaries: packaged Skills unchanged unless reported
  - Focused check and PASS evidence: grep shows no remaining reopen/ended/compacted-gate/final-vs-checkpoint statements; `git diff --check` passes
  - Return milestone: docs diff
  - Stop / reassessment: a packaged Skill statement that is now wrong

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

A fresh Oracle returned OKAY in round 1 with no risks; its envelope was validated with `validate-result.mjs --review-kind plan-review`. The Oracle also checked, in memory, that SQLite 3.53.1 accepts both column drops and that set-based renumbering preserves the receipt, claim, and support links.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 4d580bff24c4dbc0349af26437111b8d7a9a9ac973eeeaecf5eed7383f477d53

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The implementation satisfies AC-1–AC-7, D1–D12, and the 17 durable deltas without a blocking finding.",
  "evidence": [
    {
      "id": "E1",
      "kind": "governance",
      "locator": ".thoth/changes/session-state-removal/session-state-removal.md",
      "claim": "Independently calculated prefix SHA-256 matches the assigned digest; the verify validator passes. Constitution and affected canonical baselines were reviewed.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "code-and-tests",
      "locator": "src/memory-core/{service,observations}.ts; sqlite/ledger.ts; import/{writer,verify}.ts",
      "claim": "Runtime session-state reads/writes, reopening, and the compaction gate are removed. Identity and observation authority guards remain. Import receipt hash inputs are unchanged; replay and verification tests pass.",
      "basis": "observed",
      "uncertainty": "Historical migration DDL and legacy-source end-time processing intentionally remain."
    },
    {
      "id": "E3",
      "kind": "code-and-tests",
      "locator": "src/memory-core/session-summaries.ts; tests/memory-core/{session-summaries,schema-migration}.test.ts",
      "claim": "One current lineage, equal-coverage supersession, lower-coverage rejection, receipt replay, kind-free new canonicalization, previous-identifier parsing, and coverage/event-ordered rebuild are implemented and tested.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "migration-verification",
      "locator": "src/memory-core/sqlite/migrations.ts; tests/memory-core/schema-migration.test.ts; independent in-memory HEAD-DDL experiment",
      "claim": "Revision 12 preserves backup/recheck/rollback/integrity/FK safety. Targeted tests cover scale, concurrency, no-op rerun, and rebuild equivalence. An independent experiment using actual HEAD revision-11 DDL preserved evidence, events, claims, supports, receipts and IDs, produced the expected interleaved lineage, and matched fresh affected DDL.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "execution",
      "locator": "Independent targeted Vitest commands and pnpm exec tsc --noEmit",
      "claim": "455 tests across 15 permitted unit files and 111 tests across 10 integration files passed; TypeScript checking passed. Coverage includes Pi resume, lazy sessions, recovery validators, generic MCP finalization, rendering, schemas, budgets and adoption metrics.",
      "basis": "observed",
      "uncertainty": "No full suite or benchmark runner was executed by this reviewer."
    },
    {
      "id": "E6",
      "kind": "governance-verification",
      "locator": ".thoth/specs/; archived proactive-memory-adoption record",
      "claim": "Archive and supplied source are byte-identical, SHA-256 ec0a4ae7416f4ceff917a994f6ba71d8b81f347ad3709f309c3eb27e0362950d. Applying all 17 deltas in memory preserves nine capabilities and passes the canonical test's assertions, including its transitional-label regex. Resulting requirements no longer mandate session state, summary kinds, reopening or the compaction gate. The three adoption additions match current code.",
      "basis": "observed",
      "uncertainty": "Actual archive application and post-archive test remain root closeout steps."
    },
    {
      "id": "E7",
      "kind": "documentation",
      "locator": "README.md; docs/agent/{native-lifecycle,persistence-retrieval,testing}.md; distributed Skills",
      "claim": "Documentation accurately describes stateless lifecycle moments, unified lineage, late rejection, ungated guidance and revision-12 manual migration. Five Skill copies are identical, contain no stale summary-state statements, and measure 6828 UTF-16 units.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "failure-provenance",
      "locator": "Root thoth-fv-ssr-unit.txt and thoth-fv-ssr-int.txt; unchanged benchmark and setup sources",
      "claim": "The seven unit failures are attributable to CRLF: LF-normalizing all three implicated reports reproduces HEAD bytes and pinned hashes. The five integration failures match unchanged npm-resolution code and unchanged OpenCode basename-dependent ownership logic. They are pre-existing environmental failures, not introduced by this diff.",
      "basis": "inferred",
      "uncertainty": "Confirmed from failure logs, unchanged source and exact byte comparisons, not a separate historical-suite execution."
    },
    {
      "id": "E9",
      "kind": "diff-hygiene",
      "locator": "Final git status, git diff --check and scoped diff inspection",
      "claim": "No dist, pinned-hash or tracked benchmark-report diff exists. After targeted tests, benchmarks status shows only the intended benchmarks/run.mjs edit. No unrelated edits or secrets were found; working-tree scope remained unchanged.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E10",
      "kind": "recorded-root-evidence",
      "locator": "Change record AC-4 task Status",
      "claim": "Root records a successful live-copy 11→12 migration with unchanged counts, 11 versions for session 22fdbab7, ce958fa1 current, valid integrity/FKs and an alreadyCurrent rerun. This evidence is consistent with the reviewed migration and passing tests.",
      "basis": "inferred",
      "uncertainty": "Live data was not accessed or independently rerun, as prohibited."
    }
  ],
  "verification": [
    {
      "check": "Record binding and governance",
      "method": "Prefix hashing, verify validator, constitution and baseline review",
      "outcome": "pass",
      "evidenceIds": ["E1"],
      "reason": "Assigned digest and structural gate match."
    },
    {
      "check": "AC-1: Stateless sessions and importer identity",
      "method": "Scoped source/diff inspection and targeted tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E5"],
      "reason": "Only intended historical and legacy-source references remain."
    },
    {
      "check": "AC-2: Lifecycle moments",
      "method": "Lifecycle and Pi temporary-database tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E5"],
      "reason": "Ungated guidance, degraded rejection, summary reuse, resume and lazy-session behavior pass."
    },
    {
      "check": "AC-3: Unified summary lineage",
      "method": "Canonicalizer, insertion, selection and rebuild review with tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E5"],
      "reason": "Coverage ordering, compatibility parsing and replay meet the contract."
    },
    {
      "check": "AC-4: Revision-12 migration",
      "method": "Safety review, targeted migration tests and independent actual-HEAD-DDL experiment",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E10"],
      "reason": "Preservation, renumbering, fresh DDL, scale and rerun requirements are supported."
    },
    {
      "check": "AC-5: Kind-free bounded surfaces",
      "method": "Diff review and targeted tool/integration tests",
      "outcome": "pass",
      "evidenceIds": ["E5", "E9"],
      "reason": "Schemas, outputs, recovery labels and clients pass; descriptions, Pi definitions and budget ceilings are unchanged."
    },
    {
      "check": "AC-6: Adoption and canonical reconciliation",
      "method": "Exact archive comparison, code review and in-memory application of every delta",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "All pre-archive verification requirements pass; actual archival bookkeeping remains with root."
    },
    {
      "check": "AC-7: Documentation accuracy",
      "method": "Documentation diff, stale-statement search and Skill comparison",
      "outcome": "pass",
      "evidenceIds": ["E7"],
      "reason": "Documented behavior agrees with implementation."
    },
    {
      "check": "Broad-check failure attribution and workspace hygiene",
      "method": "Root-log inspection, HEAD byte/source comparison and final git checks",
      "outcome": "pass",
      "evidenceIds": ["E8", "E9"],
      "reason": "Known environmental failures are unrelated; no unintended benchmark or generated diff was introduced."
    }
  ],
  "risks": [
    {
      "description": "Full-suite green and packed smoke remain unavailable in this environment because of the confirmed CRLF, npm-location and checkout-basename failures.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E8"]
    },
    {
      "description": "Root's live-copy migration exceeded the five-second host timeout; real migration should use the manual out-of-band path under separate authorization.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E7", "E10"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this envelope, complete closeout/archive, run the post-archive canonical test, and perform the recorded pre-merge cleanup.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/session-state-removal/session-state-removal.md",
    "reviewedRecordSha256": "4d580bff24c4dbc0349af26437111b8d7a9a9ac973eeeaecf5eed7383f477d53"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | lifecycle, observation-promotion, importer (hash bytes pinned, idempotent replay), context and taxonomy-migration tests; src grep shows only historical DDL and legacy hash inputs | Oracle E2/E5
- AC-2: PASS | memory-core lifecycle (ungated guidance, degraded closed, finalize reuse) plus integration lifecycle and the Pi temp-DB quit→resume→prompt→quit test | Oracle E2/E5
- AC-3: PASS | session-summaries (equal supersedes, lower rejected, replay, v2 canonicalization, v1 parsing), derivation caching, context selection, rebuild-equals-migration | Oracle E3/E5
- AC-4: PASS | schema-migration (interleaved/equal coverage, IDs and links, DDL parity, rerun, 8,000-session scale at 1,284.7 ms, concurrency); root live copy 11→12 in 5,318.7 ms with counts unchanged and 22fdbab7 at 11 versions with ce958fa1 current | Oracle E4/E10
- AC-5: PASS | tools/mcp exact schema, tool-budget and pi-tool-budget unchanged, continuation [summary vN] with caps, OpenCode/public runner/adapters/Pi render tests; no tracked benchmark report changed | Oracle E5/E9
- AC-6: PASS | archive record byte-identical (ec0a4ae7…950d); in-memory application of all 17 deltas keeps nine capabilities and passes the label regex; post-archive test rerun by root | Oracle E6
- AC-7: PASS | README.md and docs/agent/{native-lifecycle,persistence-retrieval,testing}.md; Skill copies identical and unchanged | Oracle E7
- Root broad checks: tsc exit 0; unit config 657 passed with 7 known CRLF hash failures; build exit 0; integration 242 passed, 1 skipped, 5 known environmental failures
- Source: .thoth/specs/store/spec.md | sha256:270132888afed88c0b1478ffce751c8aeb32c0db97e60bee7849e0bb5b3e397a
- Source: .thoth/specs/harness-integration/spec.md | sha256:d68154c89a4b55d73f2c4916bcbe729470110efbae2d96be8e535cf227f74be4
- Source: .thoth/specs/tools/spec.md | sha256:ab48cb0a4ec08d84db7d9c3db4cc523cb35bd3ac37d28e772d72dd44ac06254b
- Source: .thoth/specs/retrieval/spec.md | sha256:0352d7c7e6e10b14cd729f97c0d03e91acd22de7118ea363fdc5ac5798118305
- Source: .thoth/specs/cli/spec.md | sha256:eea646e6bb663fba5f8964f4a4c4d1fbf1af9b4ac5761175902a8540e3027420

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
