# Research: Central Thoth plugin marketplace

## Observed failure

- The installed Codex catalog reports thoth-mem at
  `C:/Users/EremesNG/.codex/plugins/cache/thoth-mem-codex/thoth-mem/0.4.13/skills/thoth-mem/SKILL.md`.
- A fresh agent nevertheless first probed
  `C:/Users/EremesNG/.codex/plugins/cache/thoth-mem-codex/0.4.13/skills/thoth-mem/SKILL.md`, omitting the required plugin segment, and recovered only after a second lookup.
- The prior change made the marketplace and plugin strings unequal, but the marketplace still embedded the complete plugin identity (`thoth-mem-codex` beside `thoth-mem`). That left the semantic repetition which triggered the observed collapse.

## Host contracts

- Codex documents installed snapshots under
  `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/` and supports marketplace entries sourced from a git subdirectory.
- Claude Code supports a marketplace-level git source whose entries may independently use `git-subdir` sources with an exact `ref` and `path`.
- A marketplace is the catalog identity; a plugin is a separate entry below that identity. The host-required plugin directory cannot be removed from the cache topology.
- Authoritative references:
  - <https://developers.openai.com/plugins/build/plugins>
  - <https://code.claude.com/docs/en/plugin-marketplaces>
  - <https://code.claude.com/docs/en/plugins-reference>

## Local repository evidence

- thoth-mem `0.4.13` derives host-specific identities in
  `src/setup/native-manager.ts`, generates per-repository descriptors from
  `scripts/sync-plugin-distribution.mjs`, and packages those descriptors through
  `package.json`.
- thoth-agents `0.3.11` hard-codes equivalent identities in
  `src/cli/codex-plugin-install.ts` and `src/cli/claude-code-install.ts`, and
  generates its descriptors in `src/harness/generate-integration-packages.ts`.
- Both repositories currently implement `release:patch`, `release:minor`, and
  `release:major` as `npm version ...` followed by `git push --follow-tags`.
- Remote tags `v0.4.13` and `v0.3.11` are reachable. Their Codex and Claude plugin
  manifests agree on plugin name and version and contain the required `plugin/`
  distribution roots.
- `https://github.com/EremesNG/thoth-plugins.git` is reachable and empty, so the
  initial publication will establish branch `main`.

## Selected design

1. Use one neutral internal marketplace name, `thoth-plugins`, for both native
   hosts. Keep plugin names `thoth-mem` and `thoth-agents` unchanged.
2. Make `thoth-plugins` the sole owner of host marketplace descriptors. Plugin
   package repositories retain their plugin bundles and manifests but stop
   publishing competing marketplace catalogs.
3. Store independent plugin source/version records once in a central registry and
   deterministically render both host descriptors from it.
4. Pin each entry to its authoritative repository, `plugin/` subdirectory, and
   exact `v<version>` tag. Never infer or follow a moving branch in an installed
   catalog entry.
5. Extend each plugin release flow with a post-tag catalog publication step and a
   separate idempotent catalog-only retry command.
6. Validate the remote tag, both plugin manifests, required Skill entrypoints,
   rendered descriptor agreement, and non-target entry preservation before a
   catalog commit. Push normally; never force-push over a concurrent release.

## Release ordering decision

The source tag must be pushed before the catalog can reference it. This makes a
single atomic transaction across three Git repositories impossible. The supported
state machine is therefore:

1. version, verify, commit, and tag the plugin through the existing npm lifecycle;
2. push the plugin branch and tag;
3. clone a fresh central catalog, update only the released entry, validate, commit,
   and push;
4. if step 3 fails, report the release operation as incomplete and retry only step 3
   with `release:marketplace`.

The retry is safe because it reads the already published plugin version and tag and
does not execute `npm version` again.

## Alternatives rejected

- **Manual central edits**: rejected because they recreate the version drift the
  user identified.
- **Moving branch or automatic “latest tag” lookup**: rejected because installation
  would no longer be reproducible and a pre-release or accidental tag could become
  current without an explicit release action.
- **Cross-repository GitHub Actions dispatch**: not selected for this cut because it
  requires a separately managed cross-repository token or application and makes the
  local release command's completion asynchronous. The local authenticated Git flow
  already used by the maintainer can provide deterministic completion and retry.
- **One version for both plugins**: rejected because thoth-mem and thoth-agents have
  independent release cadence and source histories.
- **Automatic removal of old manager state**: rejected because native caches and
  registrations are host-owned, and the user explicitly retained manual cleanup.

## Implementation constraints

- Preserve unrelated concurrent thoth-agents changes; marketplace/install/release
  surfaces are the only writable area there.
- Do not edit generated `dist/` output.
- Test release publication against disposable local bare remotes before exercising
  the real empty `thoth-plugins` remote.
- The initial central push is authorized. Existing plugin repository remotes are not
  part of that publication authorization and will not be pushed by this change.
