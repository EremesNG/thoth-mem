# Change: opencode-v2-migration

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: high

## Exploration

- Current OpenCode integration (verified at `81340e7`, v0.6.3): `src/integration/opencode/index.ts` default-exports the legacy V1 `Plugin` function from `createThothMemPlugin()` (`src/integration/opencode/plugin.ts`), built by `scripts/build.mjs` to `dist/opencode.js` (`package.json#main`, no `exports`). It depends on `@opencode-ai/plugin@1.18.2` (transitive `@opencode-ai/sdk@1.18.2`) and uses V1 hooks `tool` (`thoth_mem_root_identity`), `config` (injects MCP `thoth-mem` → `node dist/index.js mcp --no-http`), `event`, `chat.message` (synthetic recovery part), and `experimental.session.compacting`, plus V1 client calls `session.get/messages/message` and `app.log`. Lifecycle spawns `node dist/index.js lifecycle` per event (`node-lifecycle-client.ts`, adapter protocol 3). Setup (`src/setup/opencode.ts`, `opencode-config.ts`, `opencode-skills.ts`) writes string entries to the V1 `plugin` array (public `thoth-mem@<version>`, local `file:` URL of `dist/opencode.js`), copies the Skill to `<config>/skills/thoth-mem`, keeps receipts/journal under `<config>/.thoth-mem/`, and has no OpenCode version probe. Tests: `tests/integration/opencode-native-plugin.test.ts`, `tests/setup/native-opencode.test.ts`, `tests/packaging/first-product.test.ts`, `scripts/verify-packed-plugins.mjs`.
- OpenCode product V2 (verified against official docs and `anomalyco/opencode` tag `v2.2.6`, commit `dc2ffcf`; locally installed `opencode v2.2.6`): new packages `@opencode/plugin`/`@opencode/client`/`@opencode/sdk` 2.2.6; V1 plugins do not run. Plugin = default export `{ id, setup(ctx) }` returning optional cleanup. `ctx.tool.transform(e => e.add({name, description, input /* JSON Schema | Standard Schema */, execute(input, {sessionID, agent, messageID, id, signal, progress}) => Promise<{content?, output?, metadata?}>}))`; `ctx.skill.transform(e => e.add({id, name, description?, path, content}))`; `ctx.event.subscribe({types, signal})` (location-scoped async iterable, envelope `{id, type, data, ...}`); `ctx.session.hook('prompt' | 'compaction' | ...)`; `ctx.session.get/context/instructions.entry.{put,list,remove}`; `ctx.storage.{get,set,remove,scan}` (durable KV namespaced by plugin id, not by project). Events: `session.created` (`parentID?`), `session.deleted`, `session.compaction.ended` (carries summary `text`); no `session.compacted`/`message.updated`. Config: `plugins` (string or `{package, options}`), `mcp.servers`; configured local plugin paths must be directories; resolver reads `name`+`exports` (`./server` before `.`), ignores `main`.
- npm plugins are installed by `@npmcli/arborist` with `ignoreScripts: true` (`packages/util/src/npm.ts`), so `better-sqlite3`'s install-time binding is absent in the OpenCode npm cache; this matches the earlier 1.19.4 failure (memory `67e6782c`). Claude/Codex public runners already resolve runtime as `runtime.json.entry` → provider `runtimeEntry` → `npx --yes thoth-mem@<version>` (`plugin/runners/public-runner.mjs`: `validatedRuntimeEntry`, `runtimeInvocation`).
- Instruction entries (pinned source): rendered last in the second system part (after skills, discovery/config instructions, date and environment built-ins), sorted by key; baseline frozen at first instruction preparation (an awaited `put` in the `prompt` hook before first source selection is included) and copied into the next epoch at `session.compaction.ended`; later value changes append a durable system transcript message (visible as a TUI row) and never rewrite the baseline; same-value `put` is a no-op. Cache breakpoints: last tool definition, first and last system part, conversation tail.
- Reusable: `src/tools/index.ts` (`MEMORY_TOOL_CATALOG`, `publicInputSchema`, compact schemas), `src/integration/pi/mcp-client.ts` (`createPiMcpClient`: lazy, coalesced, reconnecting stdio client; Pi-coupled names/env), `src/integration/recovery.ts` (`recoveryWithProvenance`, `identityOnlyRecovery`). Pi registers five public tools and runs lifecycle through private `mem_session` calls.
- Reference migration: thoth-agents `.thoth/changes/archive/2026-11-07-opencode-v2-migration` (type-only `@opencode/plugin`, plain-object entry, `exports` required, installer `plugins` migration and version gate, packaged skills).

## Intent

Rewrite the thoth-mem OpenCode integration as a V2-only OpenCode plugin (OpenCode ≥ 2.2.6) that uses V2-native registration: five native memory tools plus the identity helper backed by one owned persistent MCP child, lifecycle through that child, recovery through a keyed session instruction entry, the Skill registered from the package, and `ctx.storage` for delivery state. Setup installs it through V2 `plugins`. The npm-installed plugin must work despite OpenCode skipping install scripts, and nothing added may degrade provider prompt-cache hits within a session.

## Non-goals

- No OpenCode V1 compatibility, dual exports, or `@opencode-ai/*` dependency.
- No TUI/GUI plugin parts, plugin options, commands, agents, or `ctx.mcp` registration.
- No use of the session `context` hook, prompt-text mutation, `session.synthetic`, or supplying a compaction `result`.
- No `experimental.idle` finalization; no change to Codex, Claude Code, or Pi behavior beyond extracting the shared MCP client.
- No package version bump, publication, or real-user-home mutation.

## Acceptance

- AC-1: `dist/opencode.js` default-exports a plain V2 plugin object `{ id: 'thoth-mem', setup }` whose setup returns a cleanup; `package.json` gains `exports` mapping `.` and `./server` to `./dist/opencode.js` (plus `./package.json`); `@opencode-ai/plugin` is removed and `@opencode/plugin@2.2.6` is a devDependency used only for types; the built bundle imports none of `@opencode/*`, `@opencode-ai/*`, or `better-sqlite3`.
- AC-2: Setup registers exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project` and the read-only `thoth_mem_root_identity` through one `ctx.tool.transform` call as directly exposed tools (`options: { codemode: false }`); memory tools publish the shared compact JSON schemas byte-identical to the Pi projection (no `$schema`) and inside a locked aggregate budget; execution goes through the owned MCP child and returns bounded `{ content: [{ type: 'text', text }] }`; `mem_session` is never exposed; no MCP server is registered with the host.
- AC-3: A host-neutral owned MCP stdio client (extracted from Pi, Pi behavior and tests unchanged, including Pi's existing launch default) is lazy, coalesced, reconnecting, bounded and abortable; OpenCode resolves its runtime as validated configured local entry → package-relative `dist/index.js` only when its `better-sqlite3` binding file exists → `npx --yes thoth-mem@<exact plugin version> mcp --no-http`; local entries launch with the literal `node` command and never the host `process.execPath` (OpenCode may be a compiled Bun executable), proven by a test that runs the launcher under a non-Node `process.execPath`; the npx path uses the platform npx command (Windows-safe); `THOTH_MEM_NATIVE_HOST=opencode`, a startup timeout that tolerates first npx install, and bounded diagnostics.
- AC-4: Lifecycle runs through `mem_session` on the owned child: root `session.created` → enroll; session `prompt` hook root text → capture-root (sanitized, prompt not mutated); `compaction` hook → checkpoint-pre-compact without setting `result`; `session.compaction.ended` `text` → guide-post-compact keyed by the event id; root `session.deleted` → one finalize; delegated sessions (parent chain via `parentID`/`ctx.session.get`, ≤ 16 links, cycle-safe) get nothing; failures degrade with bounded diagnostics and never reject the prompt; the event subscription is aborted by cleanup.
- AC-5: Recovery is delivered only as instruction entry `thoth-mem-recovery` on root sessions, written and awaited in the `prompt` hook before the first root request; delivery state lives in `ctx.storage`; at most one write per session normally (none on restart, resume, or compaction), identity-only value when the server is unavailable then exactly one replacement with the verified value on a later root prompt; storage state is removed on `session.deleted`.
- AC-6: The packaged canonical Skill (`integrations/opencode/skills/thoth-mem/SKILL.md`) is registered through `ctx.skill.transform` from its absolute installed path, with content and metadata validated before registration.
- AC-7: `thoth-mem setup opencode` gates on installed stable OpenCode ≥ 2.2.6 before any write; writes exactly one managed entry under `plugins` (public `thoth-mem@<version>`, local the absolute verified package-root directory), removes managed entries from legacy `plugin`, recognizes string and `{package, options}` managed forms, preserves unrelated entries/order/JSONC comments, no longer copies the Skill and removes only a receipt-owned unmodified copy; plan-only zero writes, idempotence, rollback, and interrupted-setup recovery still hold.
- AC-8: V1 code and tests are removed (`node-lifecycle-client.ts`, V1 hooks, V1 client calls); packaging inventory, `scripts/verify-packed-plugins.mjs`, integration smoke, routed docs (`docs/agent/native-lifecycle.md`, `surfaces.md`, `testing.md`) and the OpenCode Skill reference describe the V2 contract; `pnpm run build`, `pnpm test`, `pnpm run integration:verify` and `pnpm run integration:smoke` pass; the packed verification additionally installs the candidate tarball into disposable state with lifecycle scripts disabled (as OpenCode V2 does), confirms the `better-sqlite3` binding is absent and no configured local runtime applies, and drives the installed V2 plugin through a fake V2 context so the exact-version npx runtime—resolved from the existing ephemeral loopback registry serving the candidate tarball, never a published artifact—completes MCP initialization, a native tool call, a root lifecycle event, and cleanup, with Windows command resolution covered.
- AC-9: A disposable-state real-host check against installed OpenCode 2.2.6 (isolated config/data/cache dirs, loopback stub provider, no paid model calls, no real-home writes) shows the local plugin loads, the six tools and the Skill are registered, enrollment persists, the first captured request of a root session carries the recovery entry in its system content after all shared instruction content (skills, discovery/config instructions, date and environment), with any following content host-generated and byte-stable within the session, the tool definitions and first system part are byte-identical across two fresh sessions, and both system parts are byte-identical between two requests of the same session, including across an identity-only → verified recovery replacement (runtime made unavailable for the first prompt, then available), where the replacement appears only as an appended update.

- AC-10: The two check failures that pre-date this change on master `81340e7` are fixed so `pnpm test` and `pnpm run integration:smoke` pass as-is on this machine: `resolveNpmCli` (`scripts/npm-pack.mjs`) finds a real npm CLI when `pnpm run` replaces `npm_execpath` with pnpm and the pnpm-managed Node has no adjacent npm (without accepting a non-npm CLI), and the `tests/release-version.test.ts` fixture's `npm version` lifecycle no longer fails with `ERR_PNPM_IGNORED_BUILDS` in its temporary checkout.

## Clarifications

- Tool exposure: native tools backed by one persistent MCP child, Pi pattern (user, 2026-11-07).
- Recovery delivery: keyed session instruction entries (user, 2026-11-07); after learning that the per-session entry makes the second system part non-shareable across sessions on each session's first request, the user confirmed keeping instruction entries.
- Extras: packaged Skill via `ctx.skill` and `ctx.storage` for delivery dedup; no plugin options or TUI (user, 2026-11-07). User constraint: nothing added may break cache hits.
- Pre-existing check failures (npm CLI discovery under `pnpm run`, release-version fixture `ERR_PNPM_IGNORED_BUILDS`): fix them in this change (user, 2026-11-08, after final-verification round 1 FAIL); added as AC-10.

## Decisions

- D1: V2-only; minimum OpenCode 2.2.6 (the locally installable and source-verified version); `@opencode/plugin` pinned 2.2.6 type-only; plain object entry, no runtime `Plugin.define` import.
- D2: Recovery entry is written once per root session and carried by the host across compaction epochs and process restarts; no post-compaction or per-process refresh (fewest instruction updates, no visible update rows in normal operation). Post-compaction memories are covered by the compaction summary.
- D3: Runtime resolution follows the Claude/Codex public-runner precedent with an added package-relative fast path guarded by the presence of the native binding; the validation logic is shared TypeScript, not duplicated.
- D4: Tool definitions are built once at setup from the shared catalog so the tool-definition prefix is byte-stable across sessions; the Skill registration content is static.
- D5: `ctx.storage` keys are `recovery/<sessionID>`; the instance-global namespace is acceptable because session IDs are unique.
- D6: Real-host verification uses a loopback stub provider inside a project test gated on an installed `opencode` binary; it is part of the repository test suite, not an ad hoc script.
- D7 (implementation amendment, 2026-11-08, from AC-9 host evidence): V2 plugin tools default to `codemode: true`, which hides them behind the code-mode `execute` tool; all six tools set `options: { codemode: false }` to meet AC-2. OpenCode 2.2.6 appends host worktree guidance after the instruction block, so AC-9 asserts first-baseline inclusion after all shared instruction content plus byte stability rather than a literal final position.

## Durable deltas

- `MODIFIED harness-integration` **Every Native Plugin MUST Bundle Hooks, MCP, and Skills** — Every supported host bundle MUST package its supported lifecycle hooks, one registration path for the shared memory tool surface, and the same canonical memory Skill without stale copied contracts; MCP-configured hosts expose the exact six-tool surface, while Pi and OpenCode MUST expose `mem_save`, `mem_recall`, `mem_context`, `mem_get`, and `mem_project` through their native tool APIs (the Pi extension API and the OpenCode V2 `ctx.tool.transform` registration) with the shared compact definitions and MUST NOT expose `mem_session` to the model because their lifecycle hooks perform every root lifecycle operation through the integration's own MCP client; Pi and OpenCode MUST delegate execution to one owned, lazy, reconnectable MCP stdio child running the existing MCP server rather than registering a host MCP server, requiring a community adapter, or importing the SQLite runtime into the host process; OpenCode MUST register the canonical Skill from its installed package path through `ctx.skill.transform` and MUST NOT copy it into host configuration.
  - GIVEN the native Pi package or the OpenCode V2 plugin is loaded; WHEN the host enumerates plugin tools and later runs its session lifecycle hooks; THEN it sees exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, and `mem_project` with the shared compact definitions (OpenCode additionally the read-only `thoth_mem_root_identity` helper), no `thoth-mem` MCP server is registered with the host, and the hooks enroll, recover, capture, checkpoint, guide, and finalize through `mem_session` on the owned child .
- `MODIFIED harness-integration` **Runtime Lifecycle MUST Preserve the Core Contract** — OpenCode, Codex, Claude Code, and Pi lifecycle adapters MUST normalize only fields their supported native contracts actually provide and MUST apply shared privacy sanitation before content-derived identity; Pi MUST map documented session start, admitted root input, pre-compaction, successful compaction, failed compaction, settled-agent, and shutdown events onto enroll with recover, capture-root (one ordered root-prompt evidence event per distinct sanitized interactive or RPC input), checkpoint-pre-compact, guide-post-compact, non-finalizing degradation or flush, and a single finalize, MUST NOT dispatch recover on a root prompt except to retry a delivery boundary whose verified recovery is still pending, and agent-settled or failed-compaction events MUST NOT finalize; OpenCode V2 MUST map root `session.created` to enroll, root text admitted through the session `prompt` hook to capture-root without mutating the prompt, the session `compaction` hook to checkpoint-pre-compact without supplying a compaction result, `session.compaction.ended` to guide-post-compact keyed by the event id, and root `session.deleted` to a single finalize, and MUST NOT finalize on idle or status events; where a native contract provides the host's own generated compaction summary text (Pi `session_compact` compaction entry summary, Claude Code `PostCompact` `compact_summary`, and OpenCode V2 `session.compaction.ended` `text`) the adapter MUST forward it as `guide_post_compact` content, while Codex and any host without such a documented field MUST NOT parse transcripts for it; forwarded compaction text and prompt, model, tool, summary, or lifecycle content MUST NOT be automatically promoted to memories or observations and MAY only become session evidence and harness-derived session summaries.
  - GIVEN Pi reports a successful compaction whose entry carries the default structured summary text, and an OpenCode V2 root session with a delegated child is created, prompts, compacts with summary text, and is deleted; WHEN the lifecycle hooks execute; THEN thoth-mem checkpoints before each compaction, forwards each host summary text with guide-post-compact so it is stored as checkpoint evidence with a harness-derived session summary citing it, creates no memory or observation, appends the bounded Pi recovery block once as a persisted hidden message on the next Pi root prompt, captures the unmodified sanitized OpenCode root text, finalizes the OpenCode root once on deletion, and records nothing for the child .
- `MODIFIED harness-integration` **Recovery Delivery MUST Keep the Request Prefix Stable** — Pi and OpenCode MUST NOT place recovery, identity, or any other database-derived thoth-mem content in any per-request system or message transform or in prompt text; Pi MUST NOT place it in the system prompt and MUST deliver the verified bounded recovery block as one persisted, append-only, model-visible `thoth-mem-recovery` custom message with display disabled returned from `before_agent_start` only on the first root prompt of an extension run and on the first root prompt after a successful compaction, and a Pi run started by reload MUST NOT deliver another block when the active branch already holds a `thoth-mem-recovery` message after its latest compaction; OpenCode V2 MUST deliver the bounded block only as the value of the keyed session instruction entry `thoth-mem-recovery` on root sessions, written and awaited in the session `prompt` hook before the first root request so that it enters the session's frozen instruction baseline, MUST record delivery state in plugin storage, and MUST NOT rewrite it on process restart, resume, or compaction because the host carries admitted entries into every later baseline; when the memory server is unavailable at a delivery boundary the adapter MUST deliver the locally verified identity-only block and retry recovery on later root prompts until one verified recovery block is delivered once, delivering at most two blocks (OpenCode: two entry writes) per boundary; Claude Code and Codex MUST deliver recovery only through `SessionStart` additional context and MUST emit no model-visible context on `UserPromptSubmit`; delegated sessions MUST receive no block.
  - GIVEN a Pi root session and an OpenCode V2 root session with a delegated child, the memory server being unavailable when each root starts; WHEN each root sends several prompts while the server becomes reachable, a memory is saved, the Pi extension reloads, and the OpenCode root is compacted and resumed after OpenCode restarts; THEN no Pi system prompt and no prompt text or request transform carries thoth-mem content, the Pi first prompt carries the identity-only block and exactly one later Pi prompt the verified block, the reloaded Pi run appends nothing, the first OpenCode request's instruction baseline carries the identity-only entry and exactly one later root prompt replaces it with the verified entry, OpenCode compaction and resume write nothing, and the child receives no block or entry .
- `MODIFIED packaging` **OpenCode MUST Keep SQLite Behind a Literal Node Boundary** — The OpenCode V2 plugin MAY execute in Bun or a compiled Bun executable, but its entry MUST NOT import `better-sqlite3`, any `@opencode/*` or `@opencode-ai/*` runtime module, or instantiate the memory service; every SQLite-backed operation MUST cross bounded JSON stdio to one owned MCP child executed by literal Node, never by the host's `process.execPath`: the literal `node` command running an explicitly configured local runtime entry validated for package name and version, else the package-relative built entry only when its `better-sqlite3` native binding file exists, else the platform `npx --yes thoth-mem@<exact plugin version> mcp --no-http`, because OpenCode V2 installs npm plugins without lifecycle scripts.
  - GIVEN a plugin installed with lifecycle scripts disabled so its `better-sqlite3` binding is absent, no configured local runtime, and a host whose `process.execPath` is not Node; WHEN the first memory tool call and root lifecycle event run; THEN the plugin launches the exact-version npx runtime once, both operations succeed through it, no child is launched with the host executable, and the plugin bundle never loads the native module .
- `MODIFIED packaging` **Public and Local Runtime Provenance MUST Be Explicit** — Public Codex and Claude runners MUST resolve the exact package version declared by the plugin runtime. Explicit local setup MAY use only an absolute verified checkout build. OpenCode public setup MUST write the exact `thoth-mem@<version>` entry under V2 `plugins`, and local setup one canonical absolute package-root directory entry, never a file entry.
  - GIVEN a configured local entry from a different package name or version, and explicit local OpenCode setup for a verified checkout; WHEN a native runner validates provenance and OpenCode setup writes configuration; THEN the runner fails closed before executing that entry and `plugins` holds the checkout's absolute package-root directory with no `dist/opencode.js` file entry .
- `MODIFIED cli` **Setup MUST Merge Only Managed Configuration** — Codex and Claude Code setup MUST preserve their current ownership contracts. OpenCode setup MUST require an installed stable OpenCode version of at least 2.2.6 reported by `opencode --version` before any write, MUST manage exactly one thoth-mem entry under `plugins` while removing managed thoth-mem entries from the legacy `plugin` array, MUST recognize string and `{package, options}` managed entries, MUST preserve unrelated entries, their order, and JSONC comments, MUST NOT copy the memory Skill, and MUST remove only a receipt-owned unmodified previously copied Skill. Pi setup MUST use Pi's native package manager to inspect, install, repair, and verify only the exact thoth-mem package, MUST record only receipt-owned thoth-mem state, and MUST preserve unrelated Pi packages, extensions, Skills, settings, and files during success or rollback.
  - GIVEN unrelated Pi packages and an OpenCode 2.2.6 configuration with an unrelated plugin, comments, a legacy `plugin` thoth-mem entry, and a receipt-owned copied Skill; WHEN `thoth-mem setup pi` and `thoth-mem setup opencode` run, then run again; THEN Pi mutates only the exact managed thoth-mem package and its receipt-owned state, OpenCode `plugins` holds exactly one exact thoth-mem entry after the unrelated plugin with the legacy entry and owned Skill copy gone and comments intact, both repeated runs report `changed=false`, and OpenCode setup fails before any write when OpenCode is absent or older than 2.2.6 .
- `MODIFIED tools` **MCP Surface MUST Be Compact and Workflow-Level** — The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, MUST publish concise server instructions that balance progressive recall with deliberate durable save/handoff behavior, and MUST publish a distinct action-oriented description for each tool; tool and field descriptions MUST state each operational constraint once in compact form without repeating a tool description inside a field description; published input schemas on the MCP, Pi, and OpenCode surfaces MUST be identical compact projections (apart from the `$schema` marker, which Pi and OpenCode omit) that keep property names, types, enums, and required lists but omit length, count, range, pattern, and nested `additionalProperties` keywords and express each object as a single variant; every input accepted by runtime validation MUST be accepted by the published schema, while runtime validation MUST keep enforcing the complete strict contract, including rejecting unknown nested keys, on every surface; and the aggregate serialized size of the model-facing definitions on the MCP, Pi, and OpenCode surfaces MUST be locked by budget tests so it grows only through a deliberate definition change.
  - GIVEN the catalog; WHEN an MCP client lists tools, Pi and OpenCode sessions register their tools, and any surface submits an input that violates a strict-only constraint; THEN every surface publishes the same compact schemas within its pinned aggregate budget, every strictly valid input matches the published schema, and the server rejects the violating input with the existing error envelope .

## Plan

**Shape.** `src/integration/opencode/index.ts` default-exports `{ id: 'thoth-mem', setup }` typed with `satisfies` against type-only `@opencode/plugin` 2.2.6. `setup(ctx)` builds one owned MCP client, registers tools and the Skill, subscribes to session events, installs session hooks, and returns a cleanup that aborts the subscription, disposes registrations, and shuts the child down. `scripts/build.mjs` keeps producing `dist/opencode.js`; `package.json` adds `exports` (`.`, `./server` → `./dist/opencode.js`, `./package.json`) and the existing `main` stays consistent. Verify that adding `exports` breaks no path-based Pi/Claude/Codex/bin loading.

**Owned MCP child (AC-3).** Extract the transport from `src/integration/pi/mcp-client.ts` into a host-neutral module (client name, host env value, diagnostics labels injected); Pi wraps it with its current values so Pi behavior and tests stay unchanged. Add a shared runtime resolver: validated configured `runtimeEntry` (reuse the identity/version checks proven in `plugin/runners/public-runner.mjs` as TypeScript) → package-relative `dist/index.js` when `better-sqlite3/build/Release/better_sqlite3.node` resolves from the package root → `npx --yes thoth-mem@<own version>` (Windows-safe spawning as in the public runner). OpenCode passes the literal `node` command for local entries; the extracted transport keeps Pi's current default by having Pi pass its own value, so no shared default silently inherits `process.execPath`. Startup timeout distinguishes the npx path. Tests: launcher under a stubbed non-Node `process.execPath`; resolver precedence; binding-absent detection.

**Tools (AC-2).** Build definitions once from `MEMORY_TOOL_CATALOG`/`publicInputSchema` (without `$schema`), excluding `mem_session`; `execute` forwards to the child with `ToolContext.signal` and returns bounded text content. Port `thoth_mem_root_identity` to a native tool using `ToolContext.sessionID` and `ctx.location`; keep the `thoth-mem.opencode.identity.v2` result contract. Add an OpenCode budget/identity test next to the existing MCP/Pi schema budget tests.

**Lifecycle (AC-4) and recovery (AC-5).** Replace the per-event `lifecycle` spawn with `mem_session` calls on the owned child, mirroring `src/integration/pi/lifecycle.ts` and reusing `normalizeAdapterEvent` sanitation/keys where applicable. Root detection: `session.created.data.parentID`, else `ctx.session.get` parent traversal (≤ 16 links, cycle-safe, cached). `prompt` hook (root only): capture-root first, then, if `ctx.storage` has no delivered state for the session, compute `recoveryWithProvenance` with a bounded wait and `await ctx.session.instructions.entry.put({ sessionID, key: 'thoth-mem-recovery', value })`, then store `{ mode: 'verified' | 'identity' }`; a stored `identity` mode retries verified recovery on later root prompts and replaces the value once. `session.created` may prefetch recovery to cut latency. `compaction` hook: checkpoint-pre-compact from sanitized request content, never sets `result`. `session.compaction.ended`: guide-post-compact with `data.text`, event key from envelope `id`. `session.deleted`: finalize and remove storage state. No `context` hook, prompt mutation, or synthetic input.

**Skill (AC-6).** Resolve the packaged `integrations/opencode/skills/thoth-mem/SKILL.md` relative to the bundle, validate frontmatter, and add it once via `ctx.skill.transform`.

**Setup (AC-7).** `src/setup/opencode*.ts`: version probe (`opencode --version`, parse optional `opencode`/`v` prefix, stable semver ≥ 2.2.6, injectable for tests); config edits target `plugins` with JSONC preservation; local entry is the absolute verified package root; remove legacy managed entries from `plugin`; drop Skill staging, remove a receipt-owned unmodified copy; update receipt schema/verification accordingly; keep provider data-directory handling, plan-only, rollback, journal recovery.

**Packaging and docs (AC-8).** Delete V1-only modules/tests; update `src/integration/package-inventory.ts`/`integrations/inventory.json` if the asset set changes, `scripts/verify-packed-plugins.mjs` (import the V2 object, drive a fake V2 context; add the scripts-disabled install case whose npx runtime resolves the candidate through the existing ephemeral loopback registry and completes MCP init, a tool call, a lifecycle event, and cleanup), integration smoke, `docs/agent/native-lifecycle.md`, `surfaces.md`, `testing.md`, and `integrations/opencode/skills/thoth-mem/references/opencode.md` (tool names, identity, delivery).

**Real host (AC-9).** A gated test (skips without `opencode` ≥ 2.2.6) using disposable `OPENCODE_CONFIG_DIR`/XDG/cache/data dirs and `THOTH_MEM` data dir, local plugin directory, and a loopback OpenAI-compatible stub provider capturing request bodies; no paid calls, no real-home writes. Also capture an identity-only → verified replacement (runtime unavailable at the first prompt, then available) and assert both system parts stay byte-identical while the replacement is appended. If OpenCode cannot target a loopback provider, return the blocker with non-model evidence (plugin load, tool/skill registration, enrollment, `instructions.entry.list`).

**Risks.** Instruction-entry baseline inclusion depends on awaiting `put` before first source selection (AC-9 verifies); first npx install latency vs startup timeout (identity-only fallback covers it); `exports` restricting deep imports; V2 API drift after 2.2.6; storage is instance-global (session-keyed); only 2.2.6 is host-verified.

**Focused checks.** Per unit: targeted vitest files; then `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke`; restore `benchmarks/results/fixture-report.json` after unit runs unless intentionally changed.

## Tasks

- [x] AC-3: Host-neutral owned MCP client and runtime resolver extracted; Pi unchanged
  - Outcome: shared client module plus OpenCode-ready runtime resolver; Pi wraps the shared client with identical behavior
  - Known entrypoints and skill paths: `src/integration/pi/mcp-client.ts`, `src/integration/pi/index.ts`, `plugin/runners/public-runner.mjs`, `src/config/runtime.ts`, `tests/` Pi MCP client tests; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Exploration and Plan "Owned MCP child" of this record
  - Dependencies: none
  - Output: new shared module(s) under `src/integration/` with tests; Pi refactored to use them
  - Owner: thoth-worker
  - Writes: `src/integration/pi/mcp-client.ts`, new shared modules under `src/integration/`, their tests, Pi client tests
  - Interface boundaries: Pi extension behavior, `THOTH_MEM_NATIVE_HOST`, MCP stdio protocol; do not touch OpenCode plugin or setup files
  - Focused check and PASS evidence: Pi + new module vitest files pass, including the non-Node `process.execPath` launch assertion, resolver precedence and binding-absent detection; project typecheck clean
  - Return milestone: shared client and resolver tested, Pi tests green
  - Stop / reassessment: Pi coupling that cannot be injected without behavior change
- [x] AC-7: OpenCode V2 setup (version gate, `plugins` entry, legacy cleanup, Skill copy removal)
  - Outcome: `thoth-mem setup opencode` writes V2 configuration per AC-7
  - Known entrypoints and skill paths: `src/setup/opencode.ts`, `src/setup/opencode-config.ts`, `src/setup/opencode-skills.ts`, `src/cli.ts`, `tests/setup/native-opencode.test.ts`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: AC-7 and Plan "Setup"; thoth-agents reference `src/cli/config-io.ts`, `src/cli/system.ts` (read-only)
  - Dependencies: none
  - Output: updated setup modules and tests
  - Owner: thoth-worker
  - Writes: `src/setup/opencode*.ts`, `src/cli.ts` (OpenCode routing only), `tests/setup/native-opencode.test.ts`, other setup tests that pin OpenCode setup output
  - Interface boundaries: receipt/journal formats, provider data-directory config, other hosts' setup untouched
  - Focused check and PASS evidence: `tests/setup/*.test.ts` pass, typecheck clean
  - Return milestone: setup tests green incl. version gate, legacy migration, JSONC, idempotence, rollback
  - Stop / reassessment: receipt-format change that affects other hosts
- [x] AC-1: V2 plugin entry object, `exports`, and dependency swap
  - Outcome: V2 plugin object with setup/cleanup wiring the shared owned client; `package.json` exports and type-only `@opencode/plugin`
  - Known entrypoints and skill paths: `src/integration/opencode/index.ts`, `src/integration/opencode/plugin.ts`, `scripts/build.mjs`, `package.json`, `pnpm-lock.yaml`, `src/tools/index.ts`, `tests/integration/opencode-native-plugin.test.ts`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: accepted AC-3 shared client/resolver; AC-1, AC-2, AC-6
  - Dependencies: AC-3 unit accepted
  - Output: V2 entry and dependency swap with a fake V2 context test
  - Owner: thoth-worker
  - Writes: `src/integration/opencode/**`, `package.json`, `pnpm-lock.yaml`, `scripts/build.mjs` if needed, OpenCode plugin tests
  - Interface boundaries: build output path `dist/opencode.js`, path-based Pi/Claude/Codex/bin loading
  - Focused check and PASS evidence: OpenCode entry tests pass; `pnpm run build` succeeds and `dist/opencode.js` has no `@opencode`/`@opencode-ai`/`better-sqlite3` imports
  - Return milestone: entry tested with a fake V2 context
  - Stop / reassessment: V2 types conflict with the planned shape
- [x] AC-2: Native tool registration (five memory tools plus identity helper) over the owned child
  - Outcome: tools registered per AC-2 with schema parity and budget lock
  - Known entrypoints and skill paths: `src/integration/opencode/**`, `src/tools/index.ts`, existing MCP/Pi schema budget tests, `tests/integration/opencode-native-plugin.test.ts`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: accepted AC-1 entry and AC-3 client
  - Dependencies: AC-1 unit accepted
  - Output: tool registration, identity tool port, OpenCode budget/parity tests
  - Owner: thoth-worker
  - Writes: `src/integration/opencode/**`, OpenCode plugin tests, schema budget tests
  - Interface boundaries: shared catalog schemas, MCP stdio, `thoth-mem.opencode.identity.v2` contract
  - Focused check and PASS evidence: tool and budget tests pass
  - Return milestone: tools tested with a fake V2 context
  - Stop / reassessment: catalog change required
- [x] AC-6: Packaged Skill registration through `ctx.skill.transform`
  - Outcome: Skill registered from the installed package path per AC-6
  - Known entrypoints and skill paths: `src/integration/opencode/**`, `integrations/opencode/skills/thoth-mem/SKILL.md`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: accepted AC-1 entry
  - Dependencies: AC-2 unit accepted (same writable surface; sequential)
  - Output: Skill registration and tests
  - Owner: thoth-worker
  - Writes: `src/integration/opencode/**`, OpenCode plugin tests
  - Interface boundaries: packaged Skill asset paths and inventory
  - Focused check and PASS evidence: Skill registration tests pass (absolute path, validated metadata, single add)
  - Return milestone: Skill registration tested
  - Stop / reassessment: Skill asset layout change required
- [x] AC-4: V2 lifecycle mapping through `mem_session` on the owned child
  - Outcome: session events/hooks mapped per AC-4 with root detection and degradation
  - Known entrypoints and skill paths: `src/integration/opencode/**`, `src/integration/adapters/index.ts`, `src/integration/pi/lifecycle.ts` (reference), `tests/integration/opencode-native-plugin.test.ts`, `tests/integration/adapters.test.ts`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: accepted AC-1 entry and AC-2 tools
  - Dependencies: AC-6 unit accepted (same writable surface; sequential)
  - Output: lifecycle implementation and tests; V1 lifecycle client removed
  - Owner: thoth-worker
  - Writes: `src/integration/opencode/**`, `src/integration/adapters/**` (OpenCode normalization only), related tests
  - Interface boundaries: `mem_session` contract, shared sanitation, other hosts' adapters
  - Focused check and PASS evidence: lifecycle and adapter tests pass incl. child isolation, cleanup abort, failure degradation
  - Return milestone: lifecycle tests green
  - Stop / reassessment: needed `mem_session` contract change
- [x] AC-5: Recovery delivery through the instruction entry with storage-backed dedup
  - Outcome: recovery delivered per AC-5
  - Known entrypoints and skill paths: `src/integration/opencode/**`, `src/integration/recovery.ts`, `tests/integration/opencode-native-plugin.test.ts`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: accepted AC-4 lifecycle
  - Dependencies: AC-4 unit accepted
  - Output: delivery implementation and tests (first prompt, identity-only then verified once, no rewrite on restart/compaction, child none, storage cleanup, no context hook/prompt mutation)
  - Owner: thoth-worker
  - Writes: `src/integration/opencode/**`, related tests
  - Interface boundaries: recovery provenance contract, instruction entry key
  - Focused check and PASS evidence: delivery tests pass
  - Return milestone: delivery tests green
  - Stop / reassessment: recovery provenance contract change
- [x] AC-8: V1 removal, packaging verification, smoke and docs
  - Outcome: repository-wide V2 consistency and full checks green
  - Known entrypoints and skill paths: `scripts/verify-packed-plugins.mjs`, `scripts/verify-integration-package.mjs`, `src/integration/package-inventory.ts`, `integrations/inventory.json`, `tests/packaging/*.test.ts`, `docs/agent/native-lifecycle.md`, `docs/agent/surfaces.md`, `docs/agent/testing.md`, `integrations/opencode/skills/thoth-mem/references/opencode.md`
  - Inputs: accepted AC-3, AC-7, AC-1, AC-2, AC-6, AC-4, AC-5 units
  - Dependencies: those units accepted
  - Output: updated packaging/verification/docs; full checks run
  - Owner: thoth-worker
  - Writes: listed paths plus remaining V1 leftovers
  - Interface boundaries: packaging inventory contract, other hosts' packaged assets
  - Focused check and PASS evidence: `pnpm run build`, `pnpm test`, `pnpm run integration:verify`, `pnpm run integration:smoke` all pass, and the packed scripts-disabled npx case passes (binding absent, loopback-registry candidate, MCP init + tool call + lifecycle + cleanup)
  - Return milestone: all four commands green including the npx case
  - Stop / reassessment: packaging contract change affecting other hosts
- [x] AC-9: Disposable real-host OpenCode 2.2.6 verification
  - Outcome: gated real-host test proving load, registration, enrollment, and cache-relevant request layout
  - Known entrypoints and skill paths: installed `opencode` (v2.2.6), built `dist/`, new gated test under `tests/integration/`
  - Inputs: accepted AC-8 build
  - Dependencies: AC-8 unit accepted
  - Output: gated test and its passing run evidence
  - Owner: thoth-worker
  - Writes: one new gated test file (and minimal fixture under `tests/`), no other source
  - Interface boundaries: no real-home reads/writes, no paid model calls, no network beyond loopback
  - Focused check and PASS evidence: the gated test passes locally with `opencode v2.2.6` (including the identity-only → verified replacement capture); skips cleanly when absent
  - Return milestone: passing run or concrete blocker with non-model evidence
  - Stop / reassessment: OpenCode cannot target a loopback provider, or the entry is absent from the first baseline (reopens AC-5 design)

- [x] AC-3: Owned MCP client terminates initializing children on timeout, abort, failure, invalidation and shutdown (final-verification round 1 FAIL repair)
  - Outcome: never more than one live child per client; no child survives startup timeout, abort or close
  - Known entrypoints and skill paths: `src/integration/mcp-child-client.ts`, `tests/integration/mcp-child-client.test.ts`; skill `C:\Users\EremesNG\.pi\agent\skills\tdd\SKILL.md`
  - Inputs: Oracle round-1 reproduction (pending `client.connect` leaves the transport unowned)
  - Dependencies: none
  - Output: fix plus real-subprocess regression tests
  - Owner: thoth-worker
  - Writes: `src/integration/mcp-child-client.ts`, its tests and test fixtures
  - Interface boundaries: Pi and OpenCode successful-path behavior unchanged
  - Focused check and PASS evidence: regression tests prove PID termination; MCP client, resolver, Pi and OpenCode suites pass
  - Return milestone: tests green with no stray processes
  - Stop / reassessment: SDK transport cannot be closed before initialization completes
- [x] AC-10: Pre-existing npm CLI discovery and release-fixture failures fixed
  - Outcome: `pnpm test` and `pnpm run integration:smoke` pass as-is
  - Known entrypoints and skill paths: `scripts/npm-pack.mjs` (`resolveNpmCli`), `tests/packaging/first-product.test.ts`, `tests/release-version.test.ts`, `pnpm-workspace.yaml`; skill `C:\Users\EremesNG\.pi\agent\skills\systematic-debugging\SKILL.md`
  - Inputs: root causes recorded in AC-10
  - Dependencies: none
  - Output: minimal fixes plus tests
  - Owner: thoth-worker
  - Writes: `scripts/npm-pack.mjs`, `tests/packaging/first-product.test.ts`, `tests/release-version.test.ts`, release fixture inputs
  - Interface boundaries: npm pack/verify behavior for CI and other hosts unchanged except discovery
  - Focused check and PASS evidence: `pnpm test` and `pnpm run integration:smoke` exit 0 as-is
  - Return milestone: both commands green
  - Stop / reassessment: fix requires changing the global environment

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 1 REJECT (literal-Node launch, scripts-disabled npx verification); repaired. Round 2 fresh Oracle OKAY, recordSha256 67ff4f292288183ee6c39a7a75fddd60f473aaec283cf098806ec9f877313616.
Final verification round 1 FAIL (AC-3 initializing-child leak; AC-8 pre-existing check failures). User directed fixing the pre-existing failures in this change (AC-10, explicit implementation direction). Amended-plan review: fresh Oracle OKAY, recordSha256 0c588deff9aa8e6cff45a50332ea6e7689857b33202c3b22c6dbff42571797cc.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 73bada6f7e9d318aeb85bcc48f563c0440d3723313ccfd4a7f64b8d9baad4877

Final verification round 3 (fresh Oracle, task subtask_thoth-oracle_1794127855449_3a09f35d); delivered gate verdict valid:true, kind final-verification, verdict PASS, mode record, recordDigest match. Rounds 1 and 2 FAILed (AC-3 child leak, repaired; round 2 only lacked full-suite completion evidence, supplied by the root as-is `pnpm test` log).

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. Fresh review supports AC-1–AC-10 and all declared durable deltas. The completed full-suite log closes round 2's timeout-only verification gap.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/opencode-v2-migration/opencode-v2-migration.md",
      "claim": "Exact UTF-8 prefix before ## Authorization hashes to 73bada6f7e9d318aeb85bcc48f563c0440d3723313ccfd4a7f64b8d9baad4877, matching round 2.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "input-review",
      "locator": "opencode-v2 working tree versus master 81340e7",
      "claim": "Directly reviewed current changes and contracts. The 40 non-.thoth changed/untracked inputs remained stable throughout review: SHA-256 of sorted JSON {path,sha256} rows, using DELETED for removal, is 3ca1c1748f08d658577011bc112003c4dfaa1ea90ff15fef22209fa1180e2ee7. Their latest modification precedes the supplied full-suite run.",
      "basis": "observed",
      "uncertainty": "Round-2 fingerprint serialization was unavailable; its aggregate digest was not reproduced. Fresh diff review and checks were used instead of reusing its conclusions."
    },
    {
      "id": "E3",
      "kind": "execution-log",
      "locator": "C:/Users/EremesNG/AppData/Local/Temp/thoth-mem-final-pnpm-test.log",
      "claim": "Complete configured suite reports 73 passed/1 skipped files, 1042 passed/2 skipped tests, duration 494.87s, EXIT=0. Command matches package.json's unfiltered test script. Log SHA-256 is 8ecc32c0466ec671f5acf97e38316e4ae5d48436bca13ad6d2eaa328e6b519c1.",
      "basis": "observed",
      "uncertainty": "Execution was supplied by root; this reviewer inspected the complete log rather than rerunning the full suite. As-is environment provenance comes from the assignment."
    },
    {
      "id": "E4",
      "kind": "independent-checks",
      "locator": "pnpm run build; pnpm run integration:verify; six focused Vitest suites",
      "claim": "Build and integration inventory verification exit 0. All 107 focused OpenCode, shared MCP transport, runtime resolver, Pi client/schema-budget, and OpenCode setup tests pass, including real-child termination regressions.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "independent-smoke",
      "locator": "pnpm run integration:smoke",
      "claim": "As-is command exits 0 for all four hosts, including scripts-disabled OpenCode installation, absent binding, exact candidate npx.cmd fallback, MCP initialization, native tool, persisted lifecycle, recovery and cleanup.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "independent-real-host",
      "locator": "tests/integration/opencode-v2-host.test.ts",
      "claim": "Opt-in disposable OpenCode 2.2.6 test passes: active plugin, six native tools, packaged Skill, enrollment, first-baseline recovery inclusion, cross-session shared-prefix stability, and identity-to-verified replacement appended without baseline changes. No unexpected network requests.",
      "basis": "observed",
      "uncertainty": "Host behavior was verified on 2.2.6, not future versions."
    },
    {
      "id": "E7",
      "kind": "governance-and-cleanup",
      "locator": "thoth-sdd verify validator; canonical specs; final workspace/process checks",
      "claim": "Verify gate passes with all four canonical source digests matching. Delta titles and normative changes align with implementation. git diff --check passes; benchmark fixture remains clean; no owned check processes remain. Additional npm-discovery and installation-isolation checks pass 26 tests.",
      "basis": "observed",
      "uncertainty": "Two pre-existing unrelated node timer processes were preserved and reported to root."
    }
  ],
  "verification": [
    {
      "check": "Record binding and input freshness",
      "method": "Exact byte hashing, stable input manifest, timestamps and direct current-diff review",
      "outcome": "pass",
      "evidenceIds": ["E1", "E2", "E3"],
      "reason": "Record prefix matches round 2; current implementation independently reviewed and unchanged during checks."
    },
    {
      "check": "AC-1, AC-2, AC-6",
      "method": "Entry/dependency/bundle review, native registration, schema-budget and packaged Skill tests",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E6"],
      "reason": "V2 object, thin runtime boundary, exact native surface and packaged Skill verified."
    },
    {
      "check": "AC-3",
      "method": "Transport ownership review, real-child failure/abort/timeout/close tests and resolver tests",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Initializing children terminate; lazy/coalesced reconnecting transport, literal Node and Windows npx fallback pass."
    },
    {
      "check": "AC-4 and AC-5",
      "method": "Lifecycle/recovery implementation review, focused tests and real-host request capture",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5", "E6"],
      "reason": "Root-only lifecycle, sanitation, bounded degradation, durable delivery deduplication and stable baselines verified."
    },
    {
      "check": "AC-7",
      "method": "Setup diff review and focused migration/ownership/rollback tests",
      "outcome": "pass",
      "evidenceIds": ["E4", "E5"],
      "reason": "Version gate, V2 managed configuration, Skill ownership, plan-only behavior and recovery pass."
    },
    {
      "check": "AC-8 and AC-10",
      "method": "Complete full-suite log assessment, fresh build/inventory/smoke, npm-discovery and release-fixture review",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4", "E5", "E7"],
      "reason": "Required commands have successful execution evidence; prior npm discovery and release-fixture failures are resolved."
    },
    {
      "check": "AC-9",
      "method": "Fresh isolated real-host OpenCode 2.2.6 test",
      "outcome": "pass",
      "evidenceIds": ["E6"],
      "reason": "Registration, enrollment, instruction ordering and cache-relevant byte stability pass."
    },
    {
      "check": "Durable deltas and read-only handoff",
      "method": "Baseline digest validation, semantic comparison and final cleanliness checks",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E5", "E6", "E7"],
      "reason": "Declared capability changes are supported; no review-authored workspace changes or owned processes remain."
    }
  ],
  "risks": [
    {
      "description": "Future OpenCode versions remain subject to V2 API and instruction-baseline behavior drift.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should record this PASS and acceptance evidence, validate closeout, then archive through the installed archive workflow.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/opencode-v2-migration/opencode-v2-migration.md",
    "reviewedRecordSha256": "73bada6f7e9d318aeb85bcc48f563c0440d3723313ccfd4a7f64b8d9baad4877"
  }
}
```

- AC-1: PASS | entry/exports/dependency and bundle review; build | Oracle round 3 E4, E5, E6
- AC-2: PASS | native registration, codemode:false, schema parity and budget tests; real host | Oracle round 3 E4, E6
- AC-3: PASS | transport ownership review; real-child timeout/abort/close tests; resolver tests | Oracle round 3 E4, E5; round 2 independent PID probe
- AC-4: PASS | lifecycle review; focused tests; packed smoke SQL lifecycle receipts | Oracle round 3 E4, E5
- AC-5: PASS | recovery state machine tests; real-host first-baseline and append-only replacement capture | Oracle round 3 E4, E6
- AC-6: PASS | packaged Skill tests; packed and real-host registration | Oracle round 3 E4, E5, E6
- AC-7: PASS | setup migration/ownership/rollback tests | Oracle round 3 E4, E5
- AC-8: PASS | pnpm run build, pnpm test (1042 passed/2 skipped, EXIT=0), integration:verify, integration:smoke as-is | Oracle round 3 E3, E4, E5
- AC-9: PASS | opt-in disposable OpenCode 2.2.6 host test | Oracle round 3 E6
- AC-10: PASS | pnpm test and integration:smoke as-is; npm discovery and installation-isolation tests | Oracle round 3 E3, E5, E7
- Source: .thoth/specs/harness-integration/spec.md | sha256:0fab3b2ee97f433634c9481b8e3d7562a2e51bfb3113935e75d0159f5239e6dc
- Source: .thoth/specs/packaging/spec.md | sha256:6283c9423b3297c8f05daa9a24778b0a3cfc6ab75974aa1da101c8a80fb26733
- Source: .thoth/specs/cli/spec.md | sha256:ca008d0db648eb88ec1dd5f70ff97bea62ee69d5cf648167481c839b4670cd5a
- Source: .thoth/specs/tools/spec.md | sha256:72031d71eadf625a383e9e9f47b2e2f2fc10efc760f6dcf61818a84f075f108e

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
