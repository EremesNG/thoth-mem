# Implementation Plan: Public plugin marketplace distribution

## Technical context

The current rewrite packages receipt-owned local bundles under `integrations/` and installs them through `setup-v2`, but repository discovery files and the historical shared `plugin/` distribution root are deleted in the working tree. `master` proves the repository previously published both marketplace anchors; its v1 runner cannot be restored because clean marketplace hooks could not resolve the new v2 runtime. The implementation will reconstruct only the public distribution surface over the current six-tool SQLite-first core.

Implementation ownership remains with the root agent. The manifests, shared launcher, inventory, version synchronization, package scripts, and tests form one ordered mutable contract, and the root already holds the current-vs-master comparison; delegation would add rediscovery and cross-file coordination without creating an independent writable surface. Final verification remains Oracle-owned.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Both public plugins register the existing exact six-tool MCP server and add no tools.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Distribution launches the current SQLite/FTS5 v2 core and introduces no model, vector, graph, or network service into memory behavior; npm retrieval is installation/runtime delivery only.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Codex and Claude hooks remain adapters over `lifecycle-v2`; public packaging does not introduce host fields into `MemoryService` or SQLite.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The public launcher preserves the current bounded lifecycle output and progressive six-tool Skill contract.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The plan reconstructs public v2 distribution without restoring v1 runtime/setup compatibility and keeps the local canary boundary explicit.

## Design

### Distribution topology

The repository will publish two catalogs that resolve one shared public plugin root:

```text
.agents/plugins/marketplace.json ─┐
                                  ├─> plugin/
.claude-plugin/marketplace.json ──┘

plugin/
  .codex-plugin/plugin.json
  .claude-plugin/plugin.json
  .mcp.json
  hooks/hooks.json
  hooks/claude-hooks.json
  runners/public-runner.mjs
  runtime.json
  distribution-lock.json
  skills/thoth-mem/...
```

`plugin/runtime.json` is the single generated public-runtime identity and contains the package name and exact version. The shared MCP descriptor and public runner must agree with it. `plugin/distribution-lock.json` seals both marketplace anchors and every declared public asset. The runner accepts host-shaped JSON on stdin, invokes the exact published `thoth-mem@<version>` CLI through a portable process seam, calls `lifecycle-v2 --harness codex|claude`, and converts successful recovery into the host's supported bounded hook output. It fails closed with bounded stderr and neutral host output when runtime resolution or lifecycle confirmation fails.

The existing `integrations/<harness>/runner.mjs` files remain receipt-first local/canary launchers. `setup-v2` neither reads nor writes the public catalogs. No public runner consults `.thoth-mem-managed-v2.json`; no local canary runner falls back silently to the public package.

### Inventory, synchronization, and release

`integrations/inventory.json` and `src/integration/package-inventory.ts` will gain an explicit public-distribution inventory alongside the existing three local harness inventories. The validator will require exactly two marketplace anchors and the complete shared plugin asset set with contained unique paths.

A deterministic synchronization script will update `plugin/runtime.json`, the shared MCP descriptor, both plugin manifest versions, the Claude marketplace version, copied Skill/reference assets from the current package version and canonical integration Skills, and the complete distribution lock. `package.json#version` will run synchronization followed by verification, and `package.json#files` will include the public plugin and marketplace anchors.

### Host contracts

- Codex catalog: `.agents/plugins/marketplace.json`, one `AVAILABLE` plugin sourced from `./plugin`.
- Codex manifest: `.codex-plugin/plugin.json` with validator-supported interface metadata, `skills`, and the shared `.mcp.json`; Codex uses default discovery for `hooks/hooks.json`, whose commands use `${PLUGIN_ROOT}`.
- Claude catalog: `.claude-plugin/marketplace.json`, one plugin sourced from `./plugin`.
- Claude manifest: `.claude-plugin/plugin.json` with current metadata and root-relative `skills`, `hooks/claude-hooks.json`, and shared `.mcp.json` fields.
- Claude hooks use current nested command-handler shape and `${CLAUDE_PLUGIN_ROOT}`. Unsupported events are not declared merely for symmetry with Codex.
- The shared MCP descriptor starts the exact pinned public package and exposes one `thoth-mem` server whose runtime registry contains exactly the six v2 tools.

### Test strategy

Behavior changes follow TDD. Focused tests will first assert missing public catalogs/inventory and runner behavior, then implementation will satisfy them. Deterministic tests use temporary homes, paths containing spaces, an unrelated working directory, and a controlled `npx`/runtime seam. They must prove:

- catalog-to-plugin containment and exact identity;
- current host manifest/hook shapes;
- version synchronization and stale-version rejection;
- package file inclusion;
- Codex and Claude host-shaped lifecycle output;
- successful MCP initialize against a locally packed/installed runtime;
- public runner independence from receipts/source checkout;
- local `setup-v2` target confinement and unchanged public-catalog hashes.

When present, `claude plugin validate --strict` validates a disposable copy of the public marketplace/plugin. Codex controlled manager fixtures validate repository discovery and install state without touching the real user profile. The existing packed three-harness smoke remains a regression gate.

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Restore two repository catalogs resolving one shared public v2 plugin root | `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, `plugin/**`, `package.json#files` | Catalog containment/inventory tests and packed file list |
| FR-002 | Add a receipt-independent pinned-package public runner while retaining receipt-only local runners | `plugin/runners/public-runner.mjs`, `plugin/runtime.json`, `integrations/*/runner.mjs` | Unrelated-CWD/path-with-spaces process tests and missing-receipt smoke |
| FR-003 | Synchronize all public version/path metadata and validate current host schemas | public manifests/descriptors, `scripts/sync-plugin-distribution.mjs`, inventory validator | stale fixture failures, `claude plugin validate --strict`, Codex schema assertions |
| FR-004 | Extend packed verification with isolated public distribution and canary-isolation lanes | `scripts/verify-packed-plugins.mjs`, setup/public packaging tests | lifecycle + MCP handshake for both public hosts; pre/post marketplace hashes |
| FR-005 | Register one hook source, one six-tool MCP path, and the v2 Skill for each host | `plugin/.codex-plugin/plugin.json`, `plugin/.claude-plugin/plugin.json`, `plugin/hooks/*`, MCP descriptors, Skill | exact component counts, MCP tool registry, host-shaped hook fixtures |

## Optional support artifacts

- `research.md`: Created because the historical branch, current host CLIs, external reference repositories, and receipt-vs-marketplace runtime gap materially affect the design.
- `data-model.md`: Not needed; SQLite schema and memory semantics do not change.
- `contracts/`: Not needed; the host JSON contracts are small and remain expressed in manifests plus executable tests.
- `quickstart.md`: Not needed as a separate artifact; README installation commands will be updated in implementation.

## Risks and migrations

- **Unpublished version cannot be fetched publicly during CI**: use an injected controlled package-runtime seam for buildable verification; keep real public-host recovery as SC-005/SC-006 until a matching npm version is published.
- **`npx` startup cost on hooks**: pin the exact version and rely on npm cache; measure process smoke and keep the launcher LLM-free. A future installed-runtime optimization requires evidence and cannot weaken clean-install behavior.
- **Claude contract drift**: require strict validation when the installed CLI supports it and deterministic schema tests regardless of CLI availability.
- **Duplicate public and canary activation**: document distinct identities and test catalog immutability; real-host certification must enable only the intended hook source.
- **Historical deletions overlap the rewrite**: reconstruct only the catalog/shared-public assets and required release verification; do not restore removed v1 setup, HTTP, dashboard, vector, graph, or compatibility code.
- **Rollback**: removing the two public catalog anchors, `plugin/`, public inventory entries, and release-script wiring returns to local-only v2 distribution without changing databases or receipt-owned canary installations.
- **Durable data migration**: none; no schema or database is changed.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design verifies one shared MCP registration per host against the existing exact six-tool registry.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The distribution layer adds only package/runtime resolution and preserves the no-LLM deterministic core.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One public runner dispatches host-specific envelopes into the existing host-neutral lifecycle contract, with differences confined to manifests and output rendering.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Host output stays bounded and the distributed Skill retains compact → context → get guidance.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The design explicitly separates public release and local canary paths and restores no legacy runtime aliases or dual behavior.
