# Research: Public plugin marketplace distribution

## Repository evidence

- `master` and `origin/master` at `099bdd0` contain `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, and a shared `plugin/` root used by Codex and Claude Code.
- The historical MCP descriptors invoke the exact published package through `npx --yes thoth-mem@<version> mcp --no-http`, so marketplace installation does not depend on an npm package checkout.
- The historical hook runner does not have an equivalent pinned-`npx` fallback: it resolves only managed metadata, `THOTH_MEM_BIN`, or `PATH`. Restoring it unchanged would therefore leave repository-marketplace hooks unable to start for a clean public user.
- The current SQLite-first v2 rewrite has receipt-owned local bundles under `integrations/codex/` and `integrations/claude-code/`; `setup-v2` copies one bundle to an explicit target and records the local `dist/index.js` path in `.thoth-mem-managed-v2.json`.
- Current tests deeply validate the Codex local bundle but only prove asset presence for the Claude local bundle. Public marketplace installation is not represented in the current working tree.

## Host evidence

- Installed Codex CLI `0.147.0` exposes `plugin add/list/remove` and `plugin marketplace add/list/upgrade/remove`. Its installed marketplace convention uses `.agents/plugins/marketplace.json`, `.codex-plugin/plugin.json`, `${PLUGIN_ROOT}`, and a host-specific MCP object.
- Installed Claude Code `2.1.198` exposes `plugin marketplace add/list/remove/update`, `plugin install`, and `plugin validate --strict`.
- Current Claude Code documentation requires plugin components at the plugin root, supports `.claude-plugin/plugin.json`, `hooks/hooks.json`, `.mcp.json`, and root-relative manifest fields such as `hooks` and `mcpServers`. Marketplace installation copies the selected plugin root into a versioned cache, so public assets cannot depend on files outside that root.
- AgentMemory uses one shared public plugin root selected by both Codex and Claude marketplaces and invokes its MCP package through `npx`.
- Engram uses separate host plugin roots and expects an independently installed `engram` executable. Both repositories commit marketplace catalogs at their host discovery anchors.

## Selected direction

- Recover the historical shared-public-root concept, not the removed v1 lifecycle implementation.
- Keep `plugin/` as the repository-distributed root for both Codex and Claude Code.
- Keep `integrations/* + setup-v2` as the private/local canary mechanism.
- Store exact public package identity/version in one generated runtime metadata file used by the public hook launcher and MCP descriptors.
- Resolve the public runtime through an exact pinned npm package. Tests inject a controlled executable/process seam rather than reaching the network or a real package cache.
- Validate Claude artifacts with `claude plugin validate --strict` when the installed CLI is available; otherwise deterministic schema/containment checks remain mandatory and capability absence is explicit.

## Rejected alternatives

- **Restore all deleted v1 plugin/setup code**: rejected because it reintroduces the retired runtime and compatibility surface.
- **Point marketplaces at `integrations/codex` and `integrations/claude-code`**: rejected because those runners require a receipt created only by `setup-v2`.
- **Commit the personal marketplace under the user profile**: rejected because it is machine-private state, not repository distribution.
- **Use one marketplace for local and public runtime selection**: rejected because it can silently test or activate the wrong version.

