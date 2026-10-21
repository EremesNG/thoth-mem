# Native lifecycle and delivery

`src/integration/adapters/index.ts` maps OpenCode, Codex, Claude Code, and Pi evidence to six host-neutral intents. Delegated or unverifiable identity fails closed. `MemoryService.lifecycle` owns event idempotency, evidence capture, and summary persistence; adapters never access SQLite.

Session creation is lazy across all hosts. For a missing session, `enroll`, `recover`, `finalize`, and `capture_root` without sanitized content write no session row, lifecycle receipt, or summary for that root. Results retain the deterministic session ID and null evidence/summary IDs: verified identity returns `confirmed`; degraded identity stays `degraded` with no recovery context. Verified `recover` still renders project recovery and may lazily derive the previous session's summary. Non-empty root capture, `checkpoint_pre_compact`, `guide_post_compact`, or a session-attributed `mem_save` creates the session on first use.

Sessions have no lifecycle state or end time and always accept new evidence across hosts. Lifecycle operations are moments, not transitions: `checkpoint_pre_compact` and `finalize` accept a submitted summary or derive/reuse one in the session's single version lineage. `guide_post_compact` stores confirmed host text as checkpoint evidence, parses recognized headings into a summary, and renders recovery without requiring prior pre-compaction. Degraded identity still fails closed.

Known limitation: Codex and Claude Code lifecycle keys repeat across resumes of the same root session. A resumed session's second `finalize` may therefore replay the stored receipt instead of deriving a summary covering new activity. Lazy derivation at the next recovery covers that activity when the session is selected as the previous session; the host keys are unchanged.

Git repositories establish one local UUID in the shared Git common directory; every worktree uses `git:<uuid>` while exact normalized paths are aliases. Independent clones remain independent. Model-visible identity carries `root_session_id`, the exact `project_key`, and the database-persisted `project_name`; adapter basenames are creation hints only. A folder rename never changes the display name automatically; operators use `thoth-mem project rename`. OpenCode exposes these semantics through `thoth_mem_root_identity` v2.

OpenCode loads `dist/opencode.js` through its native npm/file plugin loader and evaluates that thin adapter inside Bun. The adapter contributes one package-relative `dist/index.js` MCP command and never mutates `skills.paths`; each SQLite-backed lifecycle operation sends one bounded host-neutral event over JSON stdio to literal `node` plus the same package-relative entry. Only the Node process loads `MemoryService` and `better-sqlite3`. Child launch, timeout, exit, output-limit, or envelope failure is logged as degraded, injects no unverified memory, and never rejects the host callback. Setup synchronizes only `integrations/opencode/skills/thoth-mem` into the selected global OpenCode config directory; copied OpenCode manifests, bridges, MCP descriptors, runners, and retired copied-setup commands no longer exist.

OpenCode also exposes one read-only host-native `thoth_mem_root_identity` tool. It is not part of the six-tool MCP registry: it resolves a bounded `parentID` chain, distinguishes root from delegated callers, and grants root lifecycle authorization only to the root caller. OpenCode recovery plus Codex and Claude `SessionStart` output carry the already verified host root ID and project in a complete identity-first bounded block; the core maps that host ID to `root_session_key`. Pi instead resolves its documented session-manager ID and `cwd` during `session_start` and returns its validated recovery block once from `before_agent_start` as a persisted hidden `thoth-mem-recovery` message (`display: false`). Codex may target `CODEX_THREAD_ID` only when no injected identity is visible and may use one unambiguous current-task inventory entry as a cross-check. Claude uses official hook `session_id` and `cwd` and defines no synthetic session environment variable. Pi's tested `1.0.1` SDK baseline has no delegated-agent identity; this adapter never grants root authority from child or community metadata.

Pi and OpenCode never place recovery in the system prompt or re-render it per prompt. Pi delivers on the first root prompt after startup, resume, new, fork, or successful compaction; reload delivers only if the active branch has no `thoth-mem-recovery` message after its latest compaction. OpenCode appends one persisted synthetic text part in `chat.message` on the first root message per plugin process (including resume) and the first message after `session.compacted`. Its automatic continuation bypasses that hook. Cold sessions are verified on demand; message-ID deduplication prevents repeat delivery on resubmission, and capture excludes synthetic parts. At an unavailable-memory boundary, both hosts deliver the locally verified identity-only block first and retry recovery on later root prompts until one verified block is delivered, at most two blocks per boundary. Invalid local identity delivers nothing. Claude Code and Codex remain `SessionStart`-only through `additionalContext`; `UserPromptSubmit` adds no model-visible context.

Codex and Claude Code use the central `thoth-plugins` marketplace and the shared `plugin/` root from the pinned `thoth-mem` tag. Setup registers `https://github.com/EremesNG/thoth-plugins.git` and manages only `thoth-mem@thoth-plugins` through supported native-manager commands. Their native managers own marketplace/cache state; setup independently rereads marketplace provenance plus enabled-plugin state. Hooks and the separate MCP descriptors (`plugin/.mcp.json` for Claude, `plugin/codex.mcp.json` for Codex) enter through the root-relative `plugin/runners/public-runner.mjs`. It delegates public lifecycle/MCP to the exact npm version in `plugin/runtime.json`, or uses the absolute package-identity-checked `runtimeEntry` persisted by explicit local setup. It does not edit manager caches or use an OpenCode loader.

Pi is a native package with a reproducible SDK test baseline at
`@earendil-works/pi-coding-agent` `1.0.1`. Setup has no version allowlist or
upper version limit: it requires parseable version output, the package-manager
capabilities, and verified installed resources/loadability. A version change
alone never requires an override or recertification to install; passing setup
does not certify every runtime behavior on an untested release.
`thoth-mem setup pi` uses Pi's global
package manager and records a receipt for either the exact public source
`npm:thoth-mem@<version>` or an explicitly supplied absolute local package
root. The extension registers exactly five model-facing native tools:
`mem_save`, `mem_recall`, `mem_context`, `mem_get`, and `mem_project`.
`mem_session` remains hook-only in Pi; the shared MCP catalog still has six tools.
Each native tool has self-framed
`renderCall`/`renderResult` output in the Thoth Pi theme style (titled frame,
tool-aware call summary, structured result lines, status footer) that imports
no Pi TUI module at runtime. `mem_get` renders the selected record first, then
any predecessor lineage. Tool text within 20,000 characters passes through
unchanged; Pi never slices it. Unexpected over-cap text becomes a valid JSON
notice under 1,000 characters with schema `thoth-mem.pi.output_truncated`,
`tool`, `original_chars`, `cap_chars`, and `guidance` to use a smaller
`budget_chars` or a selective `mem_get`. The extension shares one lazy,
time/size-bounded MCP SDK child running the package-relative
`dist/index.js mcp --no-http` entry for both tool and lifecycle calls. The Pi
process never loads `MemoryService` or `better-sqlite3`; a failed child is
invalidated and may reconnect on a later call.

`integrations/inventory.json` remains the packed inventory contract for exactly
OpenCode, Codex, Claude Code, and Pi. OpenCode inventory contains only its
canonical Skill source; the package contains the complete Codex/Claude plugin
bundle but owns no marketplace descriptor; Pi owns its Skill, observation-review
reference, and native Pi reference. Distribution verification version-locks the
native manifests, runner, hooks, MCP descriptor, Skills, and asset hashes.
Runtime data selection is shared through `src/config/runtime.ts`: explicit
value, environment, strict provider file, then default. The same strict
provider file may contain the local-development `runtimeEntry`; setup journals
and atomically converges it with `dataDir`.

Unforced Codex native setup supports the capability-checked `0.151.x` family. Other Codex versions fail closed unless the caller explicitly forces setup, and forced setup still requires the native plugin-manager capabilities used by the plan. A same-name `thoth-plugins` marketplace from another source is a provenance conflict and causes zero mutation.

On Windows, an implicit `codex` manager command follows the operator-visible `cmd.exe` `PATH` contract through the effective `ComSpec`, with a fixed argument vector and Node shell execution disabled. This prevents Node from bypassing an earlier npm `.cmd` shim for a later Desktop `.exe`. Setup does not enumerate installations or choose a version: the existing version and capability checks remain authoritative. An explicit manager-command override is executed literally, and non-Windows lookup remains direct.

Pi setup checks `pi --version`, the `install`, `remove`, and `list` help
contracts, and an independently parsed `pi list --no-approve` record before
reporting completion. It is global/user-scoped; project-local Pi state is a
provenance conflict. Plan mode performs no writes, repeated matching setup is
`changed=false`, and an interrupted or failed operation rolls back only the
receipt-owned package/configuration state while preserving unrelated Pi data.

## MCP launch attribution

Native bundles, setup-written MCP configs, and Pi's MCP child set
`THOTH_MEM_NATIVE_HOST=opencode|codex|claude|pi` to the active host. This launch
marker preserves native attribution; client info is only a fallback and neither
supplies root authority. A non-native connection receives a server-assigned
`mcp` session identity with a root key in `thoth-mem:mcp-connection:<uuid>` for
sessionless saves; the session is persisted only on a save. Sessionless
`mem_context` and `mem_project action=briefing` use that pair
as the current session for recovery selection. The reserved namespace never
authorizes observation review, promotion, or `mem_session`. Native/project-only
callers can still save without session attribution.

Stdin EOF/close, transport close, SIGINT, and SIGTERM share an idempotent shutdown
path that calls finalization once before the service closes. A connection
closed without saves leaves no session row, lifecycle receipt, or summary. A
crash has no finalization guarantee; a later recovery can derive its summary
lazily. Connection lifetime is not a verified conversation boundary.

## Pi lifecycle mapping

The Pi extension maps documented events as follows:

| Pi event | Lifecycle behavior |
| --- | --- |
| `session_start` | Resolve `cwd` and session-manager ID, enroll and recover without creating an untouched session, and schedule one bounded delivery (except reload with a recovery message after the latest compaction). |
| `input` | Capture only `interactive` or `rpc` root input after privacy sanitation; hash the session, leaf, source, streaming mode, and sanitized text for idempotency. `extension` input is excluded. |
| `before_agent_start` | Return the pending recovery once as a persisted hidden `thoth-mem-recovery` message (`display: false`), without changing the system prompt or its sections. After identity-only fallback, retry `recover` on later root prompts until one verified block is delivered; otherwise return nothing and dispatch no recovery. No per-request `context` hook is registered. |
| `session_before_compact` | Record a checkpoint event from stable IDs/reason/retry metadata and derive or reuse a session summary from citable session evidence, without copying model, tool, or branch content. |
| `session_compact` | Forward `compactionEntry.summary` as `guide_post_compact` content, keyed by the compaction entry ID, and schedule the returned recovery for one delivery on the next root prompt. |
| `session_compact_failed` / `agent_settled` | Emit bounded degradation when needed; preserve safe recovery and never finalize. |
| `session_shutdown` | Finalize for quit/session replacement, skip finalization on hot reload, and close the owned MCP child in every case. |

Each `session_start` creates a random UUID nonce in the per-run lifecycle state.
Enroll, recover (including pending-delivery retries), and finalize keys include
it: they are stable within one run but distinct across runs of the same root.
Quitting after resume therefore records a new finalize receipt and derives a
summary covering new activity. Capture and compaction keys retain their stable
leaf/entry-based inputs.

Starting Pi on a new root and then switching sessions or quitting without
activity leaves no session row, receipt, or summary for that untouched root.
On Windows, closing an Orca terminal tab kills the host process tree without a
signal, so neither Pi's `session_shutdown` nor finalization can run. Use `/quit`,
double Ctrl+C, or Ctrl+D for an awaited clean close. A killed process has no
exit-time summary guarantee; a later session's recovery lazily derives a summary
when the selected previous session's summary is missing or stale.

Recovery validates the local project and root-session identity, owned delimiters,
record IDs, source omission, taxonomy, and the 1,000-code-point bound. Invalid,
degraded, mismatched, or oversized results fall back to the locally rendered
identity-only block with an unavailable-recovery notice. A native failure never
rejects a valid Pi prompt and never injects unverified memory.

## Migration diagnostics

Hosts migrate supported schemas to revision 12 at startup. Backups and migration on large databases can exceed host timeouts; `thoth-mem migrate [--data-dir <dir>] [--json]` completes pending migrations manually without those limits. See [schema migrations](persistence-retrieval.md#schema-migrations), [CLI surfaces](surfaces.md), and the [README troubleshooting guide](../../README.md#troubleshooting). A timeout does not prove that a migration is pending.

`MigrationError` bounds the observed failure and names the step: ``SQLite migration revision A→B failed: <observed failure>. Run `thoth-mem migrate` to complete migrations without host timeouts.`` SQLite busy/locked failures say `database is locked by another process`. The error reaches MCP startup; the CLI prefixes it with `Lifecycle failed: ` or `Migration failed: `. Codex/Claude hook execution through `plugin/runners/public-runner.mjs` forwards bounded child stderr with `thoth-mem public plugin: `, preserving the migration detail and recommendation.

Pi classifies a connect/startup timeout as `PiMcpStartupTimeoutError` and reports `pi_mcp_startup_timeout`, distinct from a request failure after connection. With UI available, at most once per root session it warns: `` thoth-mem degraded: pi_mcp_startup_timeout — the memory server did not start in time; if memory stays unavailable, run `thoth-mem migrate` ``. Other failure codes, including `pi_lifecycle_request_failed`, and child invalidation/reconnect behavior are unchanged. Prompts continue without unverified memory, and the extension still never opens SQLite.

OpenCode retains the last 500 code points of child stderr on nonzero exit, normalizes control characters, and logs `OpenCode lifecycle degraded: node_lifecycle_nonzero_exit — <bounded stderr tail>`. Its complete log message is capped at 560 code points. A lifecycle timeout logs, at most once per plugin instance: `` OpenCode lifecycle degraded: node_lifecycle_timeout — memory did not respond in time; if memory stays unavailable, run `thoth-mem migrate` ``. Both paths degrade without rejecting the host callback or injecting unverified memory.

## Host compaction forwarding

Claude's public and managed bundles register `PostCompact` and forward
`compact_summary`, keyed by its sanitized-content fingerprint. After
`session.compacted`, OpenCode reads the newest `summary:true` assistant message
and forwards its text with a message-ID key; an absent or unreadable message
degrades safely. These keys distinguish compactions and keep exact retries
idempotent. Codex has no
documented summary field and does not parse transcripts. The service stores
forwarded text as sanitized checkpoint evidence and parses recognized headings
into harness claims; unrecognized text stays evidence only, never a memory or
observation.

## Revision-10 migration

The Pi harness requires the existing SQLite `sessions.harness` constraint to
accept `pi`. Writable startup or `thoth-mem migrate` on a revision-9 database
creates or reuses the retained `memory.sqlite.pre-v10.bak` and verifies integrity,
foreign keys, revision, and
the complete logical snapshot. It then acquires one immediate write-excluding
migration lock, re-reads the revision, and skips a step another process has
already applied. Otherwise it rechecks the live source against that backup before
the first mutation. Backup publication follows the shared concurrency rules in
[persistence and retrieval](persistence-retrieval.md#schema-migrations). Only the
`sessions` table is rebuilt with the widened allowlist; all rows, identifiers,
relations, sequences, receipts, summaries, evidence, and FTS
results remain equivalent. Source drift or a structurally valid but mismatched
backup fails closed before mutation; an interruption rolls back to revision 9
with the verified backup retained. The 9→10 step records revision 10 explicitly;
current startup then applies revision 11's empty-session cleanup and revision
12's stateless sessions and unified summary lineage (see
[persistence and retrieval](persistence-retrieval.md#schema-migrations)). No
downgrade is provided.

## Release and catalog handoff

`release:patch`, `release:minor`, and `release:major` update and verify the package, then push its commit and `v<version>` tag. That tag starts the release workflow, which verifies the package, publishes npm, creates the GitHub release, and then uses the scoped GitHub App to publish only the `thoth-mem` pin to the central catalog. CI is the sole automatic marketplace publisher. The catalog-only publisher verifies the remote tag, updates only the `thoth-mem` record in a fresh clone of central `main`, validates the generated Codex and Claude catalogs, and uses a normal non-force push.

If the product push succeeds but the catalog handoff fails, rerun `pnpm run release:marketplace`. The retry does not create another version or tag. A concurrent central update is reported as a rejected race; rerun the same command from the unchanged product version instead of force-pushing.

## Legacy manager state

Claude setup continues to preserve former identities. Codex setup instead requires every Codex process to be closed and first verifies the enabled, executing-version `thoth-mem@thoth-plugins` installation. It then removes only `thoth-mem@thoth-mem` and `thoth-mem@thoth-mem-codex`, followed by marketplaces `thoth-mem` and `thoth-mem-codex`, through official `codex plugin remove ... --json` and `codex plugin marketplace remove ... --json` commands.

If official removal leaves orphaned state, setup may delete only `plugins/cache/{thoth-mem,thoth-mem-codex}` and `.tmp/marketplaces/{thoth-mem,thoth-mem-codex}` below the resolved `CODEX_HOME`. Every existing root is validated before manager mutation and again before deletion: nominal and real paths must remain inside `CODEX_HOME`, link/junction/file boundaries are rejected, and manifests must identify only thoth-mem with the expected repository provenance. Sibling and unrelated roots are never inferred from directory listings or globs. A conflict, path race, or filesystem lock retains the central plugin and returns close-Codex-and-retry guidance. Process-name inspection is not treated as proof that Codex is stopped, and restart is activation only—not cache garbage collection.

Hook execution, memory confirmation, context delivery, and model consumption are different facts. Automatic capture is limited to verified root prompts and checkpoints; arbitrary tool/subagent streams are excluded. OpenCode identifies each root prompt with the native immutable message ID. Codex combines `turn_id` with the sanitized prompt so multiple steers inside one active turn remain distinct. Claude derives a deterministic fingerprint from documented session/event fields and the sanitized prompt; it does not require a synthetic `event_id`. Exact retries reuse one key. Because Claude exposes no per-submission ID, two byte-different prompts that become identical after sanitization are intentionally treated as one retry-safe submission.

Lifecycle persistence separates authoritative capture from derived continuity. A verified root prompt appends filtered immutable evidence and one ordered session event. Non-empty pre- and post-compaction content becomes checkpoint evidence, never an automatic handoff. At verified `checkpoint_pre_compact` or `finalize`, the core validates and versions a submitted structured summary or deterministically derives/reuses a harness summary from citable session evidence, with no model or network call. All summaries share one lineage: a new submission supersedes the current summary when its coverage end is at least the current one's; a lower end is rejected as late. Invalid, unsupported, cross-scope, delegated, or degraded summary submissions commit nothing. Derivation, coverage, and claim mapping are detailed in [persistence and retrieval](persistence-retrieval.md).

Explicit promoted memories remain root-owned. Assistant reasoning, arbitrary tool traffic, delegated output, filesystem sweeps, full transcripts, secrets, and private blocks are never automatic capture sources. Shared sanitation removes private blocks and recognizable credentials before adapters derive content-dependent keys; the core reapplies it before persistence or hashing. Event keys bind the original session identity and make exact retries idempotent within their host-specific scope; Pi's enroll, recover, and finalize keys are scoped to one run.

Recovery first obtains deterministic candidates, then `src/memory-core/continuation.ts` renders the only model-visible representation. Recovery at delivery boundaries, unavailable-memory retries, and `guide_post_compact` use the same selection: newest open handoff, then the previous session's newest current summary, then other project memories. Previous means the most recent other root session in this project by non-summary activity, from any harness; its summary is lazily derived when missing or stale. Automatic recovery never selects the current session's own summary. Explicit `mem_context` or briefing with a verified session pair can still select that session's summary first. Post-compaction guidance needs no prior pre-compaction event; degraded identity still fails closed.

The renderer preserves the verified identity and owned delimiters, labels all recovered history as untrusted data rather than instructions, selects at most three records, exposes complete summary or memory IDs, renders summaries as `[summary vN] … (summary:<id>)`, withholds summary support payloads and memory evidence IDs, and caps the complete block at 1,000 Unicode code points. Summary claims are included whole or omitted, and a supported next action is protected when it fits. When memory truncation is necessary, every selected long item receives at least 120 useful code points; candidates that cannot meet the floor or whose complete metadata would starve abundant useful content below 50% are omitted.

OpenCode, Codex, Claude, and Pi validate that final block and inject it unchanged. They do not reselect, summarize, truncate, or reconstruct it. A missing, degraded, malformed, or oversized result falls back to verified identity only or no block. `contextDelivered` is true only when the final renderer selected at least one useful item; an identity-only block is not recovered context. Empty service recovery adds a
notice that no memory was recovered, not proof that the project has none; local
fallback adds a distinct unavailable-recovery notice. Both appear immediately
after identity and direct the agent to `mem_recall` before relying on prior context. `modelConsumed` remains false until a real host observation proves consumption, regardless of hook execution, persistence, candidate availability, or delivery.

`integration:smoke` installs the actual tarball in a disposable directory, imports and executes the OpenCode `main` with Bun, delegates its persistence/recovery fixture to the separate Node CLI, converges public and local OpenCode state twice, synchronizes the Skill, enumerates exactly six MCP tools, and executes OpenCode, Codex, Claude Code, and Pi lifecycle fixtures from unrelated paths. Its host-shaped fixtures exercise checkpoint capture, structured summaries, recovery, and isolation; the Pi fixture loads `dist/pi.js`, exercises all five model-facing native tools plus hook-driven lifecycle events via `mem_session`, and proves the real Pi home is unchanged. It also rejects an OpenCode bundle containing the Node-native persistence graph. It never reads or mutates real homes. It cannot prove that a real host model consumes returned guidance; host acceptance and paid Claude model use remain separate real-host evidence dimensions.
