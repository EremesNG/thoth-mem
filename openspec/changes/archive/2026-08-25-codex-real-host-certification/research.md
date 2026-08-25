# Research: native plugin contracts

## Question

How should thoth-mem package lifecycle memory for Codex, Claude Code, and OpenCode without forcing one host's plugin model onto the others?

## Authoritative contracts

### Codex

- Official hooks documentation: <https://developers.openai.com/codex/hooks>
- Official plugin packaging documentation: <https://developers.openai.com/plugins/build/plugins>
- A plugin owns `.codex-plugin/plugin.json`; hook components live at the plugin root and are referenced with a `./`-prefixed path.
- A hook manifest has three levels: event, matcher group, and one or more handlers. A command handler declares `type: "command"`, `command`, and bounded `timeout` where appropriate.
- Plugin commands resolve installed assets through `${PLUGIN_ROOT}`. Codex also exposes `${CLAUDE_PLUGIN_ROOT}` for compatibility, but the native variable is preferred for a Codex-owned bundle.
- Every command hook receives one JSON object on stdin. The common fields include `session_id`, `transcript_path`, `cwd`, and `hook_event_name`; turn events add `turn_id`. Codex does not document `event_id`.
- `SessionStart` context is returned as `hookSpecificOutput.hookEventName = "SessionStart"` plus `additionalContext`. `Stop` requires valid JSON on successful stdout. Plain-text behavior differs by event, so the runner must adapt its output per event.
- Hook sources are additive, trust is recorded against the current definition hash, and enabling a plugin does not trust its hooks automatically.

### Claude Code

- Official plugin reference: <https://code.claude.com/docs/en/plugins-reference>
- Claude Code uses its own `.claude-plugin/plugin.json`, root-level `hooks/hooks.json`, `.mcp.json`, and `skills/` layout.
- Plugin paths use `${CLAUDE_PLUGIN_ROOT}`; current documentation recommends exec-form handlers with separate `args` when paths are passed as arguments.
- Claude hooks share the nested event/matcher/handler shape with Codex, but supported events, output semantics, installation, trust, and path variables remain host-owned contracts.

### OpenCode

- Official V2 plugin documentation: <https://opencode.ai/v2/docs/build/plugins>
- OpenCode plugins are JavaScript/TypeScript modules that default-export `Plugin.define({ id, setup })`; they are not hook JSON bundles.
- Runtime behavior is registered through the V2 context (`ctx.session.hook`, `ctx.tool.hook`, transforms, and event subscriptions). Registrations are scoped to activation and released on reload or disable.
- Package plugins expose their module through `package.json`; local files and package directories are imported directly. The installed package, not only a workspace link, must be tested.

## Repository evidence

### `agentmemory`

Inspected local checkout: `C:\DEV\Proyectos\Webstorm\agentmemory`.

- `plugin/.codex-plugin/plugin.json` points at a Codex-specific hook manifest and MCP file, while `plugin/opencode/` contains a separate TypeScript plugin.
- `plugin/hooks/hooks.codex.json` uses the current nested Codex handler shape.
- `src/cli/connect/codex-hooks.ts` resolves bundled assets to absolute paths for user-scope fallback installs, preserves unrelated hooks, and makes reinstall idempotent.
- Codex packaging tests verify manifest fields, version consistency, referenced paths, supported event inventory, script existence, quoted paths with spaces, marketplace source, and idempotent hook merging.
- Hook scripts bound network and subprocess time and generally fail open so memory outages do not stall the coding host.

### `engram`

Inspected local checkout: `C:\DEV\Proyectos\Webstorm\engram` after applying its `plugin-thin` boundary guidance.

- `plugin/codex`, `plugin/claude-code`, and `plugin/opencode` are separate native bundles over one shared memory service.
- Codex uses `${PLUGIN_ROOT}` and `commandWindows`; Claude Code uses `${CLAUDE_PLUGIN_ROOT}`; OpenCode uses a TypeScript module. This is deliberate host adaptation, not duplication of persistence logic.
- Codex tests execute Unix and Windows adapters through paths containing spaces, validate malformed inputs, enforce silent bounded failure behavior, and verify platform-specific commands.
- The Codex session-start script reads only documented fields such as `session_id` and `cwd`; it does not require `event_id`.

## Adopted decisions

1. Keep one host-neutral lifecycle contract and one SQLite core, but retain three native packaging/transport adapters.
2. For Codex, use the current nested hook structure, `${PLUGIN_ROOT}`, bounded handlers, documented stdin fields, and event-specific stdout adaptation.
3. Derive retry identity only from documented stable fields. Turn events use `turn_id`; `SessionStart` uses session, source, and operation; `SessionEnd` uses session, reason, and operation. Missing stable evidence is explicitly degraded.
4. Test the installed bundle and real host, including paths with spaces and trust state; source-tree fixtures alone cannot certify activation.
5. Do not copy either reference repository's product complexity, remote service dependency, hook inventory, or memory protocol. Only validated adapter and verification patterns are adopted.
6. Recover memory for new `startup` sessions as well as `resume` and `clear`; route `compact` through post-compaction recovery. Use `SessionEnd`, not turn-level `Stop`, to finalize a durable session.

## Rejected approaches

- One shared hook JSON for all hosts: rejected because OpenCode's plugin API is a module contract and host output semantics differ.
- Continue requiring `event_id`: rejected because it is absent from the Codex wire contract.
- Treat plugin installation as runtime proof: rejected because enabled assets may still be untrusted or skipped.
- Global user hooks as the primary Codex integration: rejected for the product bundle; the native plugin source is the certification target and avoids duplicate additive hooks.
