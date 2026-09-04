# Native lifecycle and delivery

`src/integration/adapters/index.ts` maps OpenCode, Codex, Claude Code, and Pi evidence to six host-neutral intents. Delegated or unverifiable identity fails closed. `MemoryService.lifecycle` owns event idempotency and state changes; adapters never access SQLite.

Git repositories establish one local UUID in the shared Git common directory; every worktree uses `git:<uuid>` while exact normalized paths are aliases. Independent clones remain independent. Model-visible identity carries `root_session_id`, the exact `project_key`, and the database-persisted `project_name`; adapter basenames are creation hints only. A folder rename never changes the display name automatically; operators use `thoth-mem project rename`. OpenCode exposes these semantics through `thoth_mem_root_identity` v2.

OpenCode loads `dist/opencode.js` through its native npm/file plugin loader and evaluates that thin adapter inside Bun. The adapter contributes one package-relative `dist/index.js` MCP command and never mutates `skills.paths`; each SQLite-backed lifecycle operation sends one bounded host-neutral event over JSON stdio to literal `node` plus the same package-relative entry. Only the Node process loads `MemoryService` and `better-sqlite3`. Child launch, timeout, exit, output-limit, or envelope failure is logged as degraded, injects no unverified memory, and never rejects the host callback. Setup synchronizes only `integrations/opencode/skills/thoth-mem` into the selected global OpenCode config directory; copied OpenCode manifests, bridges, MCP descriptors, runners, and retired copied-setup commands no longer exist.

OpenCode also exposes one read-only host-native `thoth_mem_root_identity` tool. It is not part of the six-tool MCP registry: it resolves a bounded `parentID` chain, distinguishes root from delegated callers, and grants root lifecycle authorization only to the root caller. OpenCode recovery plus Codex and Claude `SessionStart` output carry the already verified host root ID and project in a complete identity-first bounded block; the core maps that host ID to `root_session_key`. Pi instead resolves its documented session-manager ID and `cwd` during `session_start`, caches only its validated recovery block, and injects that block only from its `context` hook. Codex may target `CODEX_THREAD_ID` only when no injected identity is visible and may use one unambiguous current-task inventory entry as a cross-check. Claude uses official hook `session_id` and `cwd` and defines no synthetic session environment variable. Pi's `0.84.x` contract has no delegated-agent identity, so child or community metadata never receives root authority.

Codex and Claude Code use the central `thoth-plugins` marketplace and the shared `plugin/` root from the pinned `thoth-mem` tag. Setup registers `https://github.com/EremesNG/thoth-plugins.git` and manages only `thoth-mem@thoth-plugins` through supported native-manager commands. Their native managers own marketplace/cache state; setup independently rereads marketplace provenance plus enabled-plugin state. Both hooks and `.mcp.json` enter through the root-relative `plugin/runners/public-runner.mjs`. It delegates public lifecycle/MCP to the exact npm version in `plugin/runtime.json`, or uses the absolute package-identity-checked `runtimeEntry` persisted by explicit local setup. It does not edit manager caches or use an OpenCode loader.

Pi is a native package at `@earendil-works/pi-coding-agent` `0.84.4` (the
initially certified `0.84.x` family). `thoth-mem setup pi` uses Pi's global
package manager and records a receipt for either the exact public source
`npm:thoth-mem@<version>` or an explicitly supplied absolute local package
root. The extension registers exactly the six catalog tools and shares one lazy,
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

## Pi lifecycle mapping

The Pi extension maps documented events as follows:

| Pi event | Lifecycle behavior |
| --- | --- |
| `session_start` | Resolve `cwd` and session-manager ID, enroll idempotently, recover, and cache only a verified bounded block. |
| `input` | Capture only `interactive` or `rpc` root input after privacy sanitation; hash the session, leaf, source, streaming mode, and sanitized text for idempotency. `extension` input is excluded. |
| `context` | Remove only the extension's prior `customType=thoth-mem-recovery` message and append the cached verified block; this handler performs no I/O. |
| `session_before_compact` | Record a checkpoint event from stable IDs/reason/retry metadata without copying model, tool, or branch content. |
| `session_compact` | Request session-summary-only post-compaction guidance and refresh the verified cache. Pi's free-form compaction text is not an automatic summary or memory. |
| `session_compact_failed` / `agent_settled` | Emit bounded degradation when needed; preserve safe recovery and never finalize. |
| `session_shutdown` | Finalize for quit/session replacement, skip finalization on hot reload, and close the owned MCP child in every case. |

Recovery validates the local project and root-session identity, owned delimiters,
record IDs, source omission, taxonomy, and the 1,000-code-point bound. Invalid,
degraded, mismatched, or oversized results fall back to the locally rendered
identity-only block. A native failure never rejects a valid Pi prompt and never
injects unverified memory.

## Revision-10 migration

The Pi harness requires the existing SQLite `sessions.harness` constraint to
accept `pi`. Opening an exact revision-9 database creates or reuses the retained
`memory.sqlite.pre-v10.bak` and verifies integrity, foreign keys, revision, and
the complete logical snapshot. It then acquires one immediate write-excluding
migration lock and rechecks the live source against that backup before the first
mutation. Only the `sessions` table is rebuilt with the widened allowlist; all
rows, identifiers, relations, sequences, receipts, summaries, evidence, and FTS
results remain equivalent. Source drift or a structurally valid but mismatched
backup fails closed before mutation; an interruption rolls back to revision 9
with the verified backup retained. Revision 10 reopening is idempotent, and no
downgrade is provided.

## Release and catalog handoff

`release:patch`, `release:minor`, and `release:major` update and verify the package, then push its commit and `v<version>` tag. That tag starts the release workflow, which verifies the package, publishes npm, creates the GitHub release, and then uses the scoped GitHub App to publish only the `thoth-mem` pin to the central catalog. CI is the sole automatic marketplace publisher. The catalog-only publisher verifies the remote tag, updates only the `thoth-mem` record in a fresh clone of central `main`, validates the generated Codex and Claude catalogs, and uses a normal non-force push.

If the product push succeeds but the catalog handoff fails, rerun `pnpm run release:marketplace`. The retry does not create another version or tag. A concurrent central update is reported as a rejected race; rerun the same command from the unchanged product version instead of force-pushing.

## Legacy manager state

Claude setup continues to preserve former identities. Codex setup instead requires every Codex process to be closed and first verifies the enabled, executing-version `thoth-mem@thoth-plugins` installation. It then removes only `thoth-mem@thoth-mem` and `thoth-mem@thoth-mem-codex`, followed by marketplaces `thoth-mem` and `thoth-mem-codex`, through official `codex plugin remove ... --json` and `codex plugin marketplace remove ... --json` commands.

If official removal leaves orphaned state, setup may delete only `plugins/cache/{thoth-mem,thoth-mem-codex}` and `.tmp/marketplaces/{thoth-mem,thoth-mem-codex}` below the resolved `CODEX_HOME`. Every existing root is validated before manager mutation and again before deletion: nominal and real paths must remain inside `CODEX_HOME`, link/junction/file boundaries are rejected, and manifests must identify only thoth-mem with the expected repository provenance. Sibling and unrelated roots are never inferred from directory listings or globs. A conflict, path race, or filesystem lock retains the central plugin and returns close-Codex-and-retry guidance. Process-name inspection is not treated as proof that Codex is stopped, and restart is activation only—not cache garbage collection.

Hook execution, memory confirmation, context delivery, and model consumption are different facts. Automatic capture is limited to verified root prompts and checkpoints; arbitrary tool/subagent streams are excluded. OpenCode identifies each root prompt with the native immutable message ID. Codex combines `turn_id` with the sanitized prompt so multiple steers inside one active turn remain distinct. Claude derives a deterministic fingerprint from documented session/event fields and the sanitized prompt; it does not require a synthetic `event_id`. Exact retries reuse one key. Because Claude exposes no per-submission ID, two byte-different prompts that become identical after sanitization are intentionally treated as one retry-safe submission.

Lifecycle persistence separates authoritative capture from derived continuity. A verified root prompt appends filtered immutable evidence and one ordered session event. A non-empty pre-compaction payload appends checkpoint evidence, but never promotes a handoff. On verified checkpoint or finalization, a harness may additionally submit one structured externally generated summary with source coverage, generator metadata, atomic claims, and per-claim support IDs. The core validates and versions that summary without generating semantics; invalid, unsupported, cross-scope, delegated, or degraded submissions commit nothing. Explicit promoted memories remain root-owned. Assistant reasoning, arbitrary tool traffic, delegated output, filesystem sweeps, full transcripts, secrets, and private blocks are never automatic capture sources. One local policy removes private blocks and recognizable credential forms before OpenCode/Codex derive content-dependent event keys; the core reapplies it before persisted content or hashes are derived. Stable event keys are bound to the original session identity and make allowed retries idempotent across restart.

Recovery first obtains deterministic candidates, then `src/memory-core/continuation.ts` renders the only model-visible representation. Post-compaction guidance is session-summary-only: it may select the newest eligible current summary for that exact verified root session, but it never substitutes project memories or another session's summary. If the compacted session has no eligible summary, the result is the verified identity-only block with empty selected IDs, empty sources, and `contextDelivered=false`. Ordinary session recovery, `mem_context`, and project briefing retain the project-wide handoff-first policy and may use promoted project memory without fabricating a session summary. The renderer preserves the verified identity and owned delimiters, labels all recovered history as untrusted data rather than instructions, selects at most three records, exposes complete summary or memory IDs, withholds summary support payloads and memory evidence IDs, and caps the complete block at 1,000 Unicode code points. Summary claims are included whole or omitted, and a supported next action is protected when it fits. When memory truncation is necessary, every selected long item receives at least 120 useful code points; candidates that cannot meet the floor or whose complete metadata would starve abundant useful content below 50% are omitted.

OpenCode, Codex, Claude, and Pi validate that final block and inject it unchanged. They do not reselect, summarize, truncate, or reconstruct it. A missing, degraded, malformed, or oversized result falls back to verified identity only or no block. `contextDelivered` is true only when the final renderer selected at least one useful item; an identity-only block is not recovered context. `modelConsumed` remains false until a real host observation proves consumption, regardless of hook execution, persistence, candidate availability, or delivery.

`integration:smoke` installs the actual tarball in a disposable directory, imports and executes the OpenCode `main` with Bun, delegates its persistence/recovery fixture to the separate Node CLI, converges public and local OpenCode state twice, synchronizes the Skill, enumerates exactly six tools, and executes OpenCode, Codex, Claude Code, and Pi lifecycle fixtures from unrelated paths. Its OpenCode checkpoint-only fixture proves identity fallback without automatic handoff promotion; its Claude fixture persists ordered support plus a structured summary and recovers that summary without mixed memory; its Pi fixture loads `dist/pi.js`, exercises all six native tools and lifecycle events, and proves the real Pi home is unchanged. It also rejects an OpenCode bundle containing the Node-native persistence graph. It never reads or mutates real homes. It cannot prove that a real host model consumes returned guidance; host acceptance and paid Claude model use remain separate real-host evidence dimensions.
