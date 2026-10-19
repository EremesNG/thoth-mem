# Implementation Plan: Central Thoth plugin marketplace

## Technical context

Codex and Claude Code both require a cache topology containing marketplace, plugin,
and version segments. The current per-plugin marketplace names still repeat the full
plugin identity and have produced an observed first-read failure in Codex. The change
coordinates three repositories:

- `C:/DEV/Proyectos/Webstorm/thoth-mem`: native manager setup, package inventory,
  release handoff, tests, and routed documentation.
- `C:/DEV/Proyectos/Webstorm/thoth-agents`: Codex/Claude installer identities,
  generated package inventory, release handoff, tests, and packaging guidance.
- `C:/DEV/Proyectos/Webstorm/thoth-plugins`: new dependency-free central registry,
  deterministic descriptor generation/validation, publication tooling, tests, and
  operator documentation; initial branch `main` will be pushed to the authorized
  empty GitHub remote.

The plugins remain independently versioned. Current central entries begin at
thoth-mem `0.4.13` / `v0.4.13` and thoth-agents `0.3.11` / `v0.3.11`. Real host
state is changed only in the separately authorized migration task. Product installers
use official Codex removal commands first and may remove only their own exact orphan
roots after validating those paths beneath the resolved `CODEX_HOME`.

The central repository is scaffolded before any catalog test with Node `>=22.12.0`,
`pnpm@11.20.0`, ESM, and zero runtime/development dependencies. Its exact package
commands are `node --test tests/*.test.mjs` for `pnpm test`,
`node scripts/render.mjs` for `pnpm run catalog:render`, and
`node scripts/validate.mjs` for `pnpm run validate`. The current real Codex host is
`0.151.0`; this cut makes `0.151.x` the unforced supported family after full manager
capability inspection, while any other family still requires the existing explicit
force option and the same complete capability contract.

A real read-only dry run exposed a Windows command-resolution split: PowerShell and
`cmd.exe` select the npm `codex.cmd` at `0.151.0`, but Node's direct
`spawnSync('codex', ...)` bypasses that earlier shim and selects the Desktop
`codex.exe` at `0.147.0`. thoth-agents already normalizes implicit Codex execution
through `cmd.exe` with `shell:false`; thoth-mem must adopt the same bounded invocation
contract before real-host migration. This changes no target, version, or cleanup
authorization.

**Implementation ownership**: the adaptive root is the single writer for all three
ordered surfaces. The central registry schema, two installer migrations, and release
handoff form one coupled transaction, while thoth-agents already contains unrelated
concurrent edits; keeping one loaded writer has greater net gain than rediscovery and
merge coordination. A fresh read-only Oracle remains mandatory for final verification
and, if selected by the user after the ready gate, for plan review.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change alters marketplace packaging, setup, and release tooling only; it adds or removes zero MCP tools.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — SQLite, lexical recall, projections, and runtime retrieval are untouched; catalog generation is deterministic and dependency-free.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One plugin bundle remains authoritative while Codex and Claude descriptors stay at host adapter boundaries; no harness payload enters memory semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall modes, limits, trimming, and response metadata are outside the affected surfaces.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The new canonical marketplace is explicit, competing per-repository catalogs are removed, no compatibility shim is added, and each product retires only its own exact Codex legacy state after the replacement is verified.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Replace host-derived thoth-mem marketplace identities with constants for remote `thoth-plugins`; make Codex `0.151.x` the unforced family only after complete capability inspection; keep provenance conflict detection, journal ownership, rollback, forced-family gating, and add post-verification cleanup for only exact thoth-mem legacy IDs/roots. On Windows, route only the implicit `codex` invocation through `ComSpec /d /s /c` with `shell:false`; preserve literal explicit overrides and direct non-Windows execution. | `src/setup/native-manager.ts`, `tests/setup/native-managers.test.ts`, setup result/receipt interfaces | Disposable executor/filesystem tests assert `0.151.x` acceptance, other-family rejection/forced capability proof, remote source, exact plugin ID, install-before-cleanup ordering, idempotence, conflict failure, exact-root safety, retry after cleanup failure, rollback before cleanup, and deterministic Windows `.cmd`-before-`.exe` resolution. |
| FR-002 | Remove per-repository marketplace descriptors from both npm inventories and generators; retain one shared plugin distribution per repository. Central descriptors become the only catalog source. | thoth-mem `package.json`, `scripts/sync-plugin-distribution.mjs`, `scripts/verify-integration-package.mjs`, `scripts/verify-packed-plugins.mjs`; thoth-agents `package.json`, `src/harness/generate-integration-packages.ts` and nearest tests | Packed inventory and generator tests pass with zero plugin-repository marketplace catalogs and unchanged plugin manifests/Skills. |
| FR-003 | Append catalog publication after `git push --follow-tags`; add `release:marketplace` as an idempotent retry that reads the already bumped package version. | both plugin `package.json` files; both `scripts/publish-marketplace.mjs`; release-focused tests | Disposable bare-remotes test proves tag visibility precedes the central commit, target-only update, retry no-op, and nonzero failure without another version bump. |
| FR-004 | Scaffold a pinned dependency-free central tool package, introduce one registry record per plugin, and render both native descriptor formats with internal name `thoth-plugins` and exact `git-subdir` source refs. | thoth-plugins `package.json`, `catalog/plugins.json`, `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, `scripts/catalog.mjs`, `scripts/render.mjs`, `scripts/validate.mjs` | The declared package commands execute on a clean checkout; `pnpm test` and `pnpm run validate` assert exactly two entries, schema-specific fields, cross-host agreement, and expected cache paths. |
| FR-005 | Point both thoth-agents native installers and user-facing success text at the central source/ID while preserving setup ordering and global agent configuration; after central verification, make only the Codex installer retire exact thoth-agents legacy IDs/roots. | `src/cli/codex-plugin-install.ts`, `src/cli/claude-code-install.ts`, `src/cli/install.ts`, their nearest tests | Codex tests assert install-before-cleanup, exact owned removal, sibling/unrelated preservation, retry, and no-op convergence; Claude tests retain their existing non-cleanup contract. |
| FR-006 | Treat stopped Codex as an explicit operator precondition because process-name checks are cross-platform and race-prone. Install/verify central state first, use official manager removal for known owned identities, then delete only still-orphaned non-symlink descendants at fixed product roots under `CODEX_HOME`; preserve sibling, unrelated, conflicting-provenance, and Claude state. | both Codex setup implementations, path guards, diagnostics, tests, migration documentation | Seeded manager/filesystem tests prove ordering, exact roots, conflict failure before mutation, cleanup-failure retry, sibling/unrelated byte preservation, and zero broad or sibling deletions. |
| FR-007 | Central updater verifies tag existence, both plugin manifests, expected Skills, descriptor agreement, and untouched non-target registry records before commit; normal push rejects races. | thoth-plugins `scripts/update-plugin.mjs`, `scripts/validate.mjs`, `scripts/catalog.mjs`, `tests/catalog.test.mjs`; plugin publisher scripts | Local source fixtures and bare remotes cover manifest/version mismatch, missing Skill, stale base/non-fast-forward, exact no-op retry, and no force push. |
| SC-001 | Derive expected cache paths from rendered marketplace/plugin/version tuples and reject missing or equal adjacent segments. | central validator and tests | Both host descriptors pass and yield two distinct valid paths. |
| SC-002 | Perform one final real Codex smoke after central installation, owned legacy cleanup, and restart; inspect the fresh skill-read path. | Codex native manager and session catalog | First `SKILL.md` read has zero omitted-plugin probes; only the central product cache path exists after the user closes and restarts Codex. |
| SC-003 | Search executable setup surfaces and run all native setup tests after migration, including the observed Codex family. | both repositories' setup modules/tests | Codex `0.151.x` passes unforced only with complete capabilities, exact new IDs appear, and former IDs have zero executable occurrences (historical OpenSpec archives excluded). |
| SC-004 | Exercise the release state machine in isolation from GitHub. | central and plugin release tests with temporary repositories | All ordering, preservation, rejection, and retry cases pass. |
| SC-005 | Initialize, validate, commit, and push central branch `main` to the authorized empty remote. | complete thoth-plugins repository | `git push -u origin main` succeeds and `git ls-remote` resolves the pushed commit. |
| SC-006 | With Codex closed, verify the central plugin before retiring exact owned legacy manager/cache state. | real Codex manager state and bounded product-owned roots only where explicitly authorized | Before/after manager JSON and recursive manifests prove the selected product's old IDs/roots are absent, its central ID is enabled, and sibling/unrelated roots remain byte-identical. |

### Immutable Codex cleanup registry and order

No implementation may infer a destructive target from a manager-returned path, a
directory scan, or a glob. The complete immutable registry is:

| Owner | Legacy plugin IDs | Legacy marketplaces | Required normalized source | Fixed cache roots below `CODEX_HOME` | Fixed snapshot roots below `CODEX_HOME` |
| --- | --- | --- | --- | --- | --- |
| thoth-mem | `thoth-mem@thoth-mem`; `thoth-mem@thoth-mem-codex` | `thoth-mem`; `thoth-mem-codex` | `https://github.com/EremesNG/thoth-mem.git` | `plugins/cache/thoth-mem`; `plugins/cache/thoth-mem-codex` | `.tmp/marketplaces/thoth-mem`; `.tmp/marketplaces/thoth-mem-codex` |
| thoth-agents | `thoth-agents@thoth-agents`; `thoth-agents@thoth-agents-codex` | `thoth-agents`; `thoth-agents-codex` | `https://github.com/EremesNG/thoth-agents.git` | `plugins/cache/thoth-agents`; `plugins/cache/thoth-agents-codex` | `.tmp/marketplaces/thoth-agents`; `.tmp/marketplaces/thoth-agents-codex` |

Each product implements the following order through its public setup seam:

1. Resolve the effective absolute `CODEX_HOME`; inspect central and legacy manager
   state; reject any named central/legacy marketplace with different normalized
   provenance.
2. Preflight every existing fixed root for that product before mutation: the nominal
   and real path must remain below the nominal and real `CODEX_HOME`; every path
   component at the target boundary must resolve to a directory rather than a symlink,
   junction, or file; cache manifests must name only the owning plugin; snapshot
   manifests must name the expected legacy marketplace and owning plugin. Empty exact
   roots are allowed. Any ambiguity returns user action with zero manager mutation.
3. Add/repair the central marketplace and plugin, then re-inspect and require the
   central plugin installed, enabled, and at the executing package version.
4. For each registered legacy plugin ID in table order, run
   `codex plugin remove <plugin-id> --json`; then for each registered legacy marketplace
   in table order, run `codex plugin marketplace remove <name> --json`.
5. Re-inspect manager state. Only after the official commands complete, remove any
   still-existing preflight-approved fixed cache/snapshot root for that product.
6. Require the central identity still enabled, every owned legacy manager identity and
   fixed root absent, and every sibling/unrelated control unchanged. Persist a complete
   receipt; on any cleanup failure, retain central state and return close-Codex-and-retry
   guidance. A retry repeats preflight and converges without a new version or broadening
   the target registry.

### Windows native-manager invocation

The default thoth-mem executor distinguishes command selection from shell execution.
For the implicit literal command `codex` on Windows, it invokes the effective
`ComSpec` with argument vector `/d`, `/s`, `/c`, `codex`, followed by the fixed manager
arguments, while keeping Node `shell:false`. This preserves the command ordering an
operator observes in `cmd.exe` and avoids Node selecting a later Desktop `.exe` over an
earlier npm `.cmd`. An explicit command override, including an absolute executable or
test double, is passed directly; non-Windows hosts continue to execute `codex`
directly. The resolver neither enumerates installations nor chooses a version itself:
the existing version and capability inspection remains the authority after lookup.

### Central registry and rendering

The first central-repository task creates `package.json`, `.gitignore`, the empty
source/test directories, and the exact dependency-free commands described in Technical
context. This scaffold is the prerequisite for every later `pnpm` command; no package
manager or runtime version is inferred from either plugin repository.

`catalog/plugins.json` is the single editable source for plugin release metadata. Each
record contains the plugin name, semantic version, exact `v<version>` ref, repository
URL, `plugin` subdirectory, descriptions, author/category metadata, and required Skill
entrypoints. `scripts/catalog.mjs` validates this registry and renders:

- `.agents/plugins/marketplace.json` using Codex `git-subdir` source objects and
  policy metadata;
- `.claude-plugin/marketplace.json` using Claude Code `git-subdir` source objects,
  exact versions, and public metadata.

The renderer sorts plugins by name and emits stable two-space JSON plus a final
newline. Validation re-renders in memory and fails if either committed descriptor
differs, if the two host views disagree, or if an expected cache tuple would omit the
plugin segment.

### Source validation and catalog update

`scripts/update-plugin.mjs` accepts only the known plugin names and an exact semantic
version. It resolves the repository/ref from the registry's immutable plugin identity,
checks out the exact remote tag into a temporary directory, and validates:

1. both native plugin manifests exist under `plugin/`;
2. both manifest names and versions match the requested release;
3. every registry-declared `skills/<name>/SKILL.md` exists;
4. the requested Git ref is exactly `v<version>`;
5. only the selected registry record changes before both descriptors are regenerated.

Temporary directories are always removed. The updater writes no Git state; the
calling publisher owns commit and push boundaries.

### Release handoff

Each plugin repository adds the same dependency-free publisher script. After the
existing `npm version` lifecycle and `git push --follow-tags`, it:

1. reads package name/version and verifies `refs/tags/v<version>` on the authoritative
   plugin remote;
2. clones a fresh `thoth-plugins` default branch into a temporary directory;
3. runs the central updater and validation/tests for only the catalog surface;
4. exits successfully without a commit when the catalog already matches;
5. otherwise commits only registry/descriptors and pushes normally to `main`;
6. reports a retry command on any failure after the plugin tag is public.

The script never invokes `npm version`, never force-pushes, and never mutates a
pre-existing sibling checkout. A concurrent central update therefore produces either
a preserved fresh merge from a later retry or an explicit non-fast-forward failure,
not lost metadata.

### Migration and rollback

- Initial publication: create the central repository locally, validate current tagged
  plugin bundles, commit the two entries, and push `main`.
- Installer migration: update local thoth-mem and thoth-agents code/tests/docs to use
  the remote central source. Do not push those two repositories under the central-repo
  publication authorization.
- Host migration: require the operator to close Codex, then use each product's CLI to
  add/install and independently verify central state before any destructive step. A
  portable process-name scan is not a reliable lock and is therefore not a gate. Before
  apply, a real read-only dry run against the resolved user `CODEX_HOME` must report the
  operator-visible Codex `0.151.x` manager and the exact bounded cleanup plan.
- Owned cleanup: follow the immutable registry and six-step order above. Official
  plugin removals precede official marketplace removals; exact orphan filesystem roots
  are last and only after their preflight evidence remains valid.
- Host cleanup evidence: before mutation, capture complete manager JSON and sorted
  relative-path/length/SHA-256 manifests for exact selected-product roots plus sibling
  and unrelated controls. After migration, require the central identity enabled, the
  selected product's former IDs/roots absent, and control manifests equal. Keep these
  operational manifests in a temporary directory until final Oracle inspection.
- Code rollback: revert local installer/release changes. Host cleanup is intentionally
  forward-only after central verification; a cleanup failure retains the verified
  central installation and the supported recovery is an idempotent retry, not restoring
  obsolete cache bytes.
- Catalog rollback: publish a normal revert commit on `thoth-plugins`; never rewrite
  branch history or plugin tags.

### Optional support artifacts

- `research.md`: created because official host topology, cross-repository release ordering, initial tag evidence, and rejected synchronization alternatives resolve concrete implementation risks.
- `data-model.md`: not needed; the small catalog registry is fully defined above and has no runtime persistence or migration model.
- `contracts/`: not needed; official host descriptor schemas remain authoritative and are exercised by generated fixtures/tests.
- `quickstart.md`: not needed; durable operator and release instructions belong in repository READMEs and existing routed packaging documentation.

## Risks and migrations

- **Two-repository publication cannot be atomic**: push the plugin tag first, fail the
  overall release command if catalog publication fails, and provide catalog-only retry.
- **Concurrent plugin releases**: clone fresh state, update one record, verify the
  other record is unchanged, and use non-forced pushes so Git rejects a race.
- **Host schema drift**: render each descriptor explicitly from one registry and run
  official manager smoke checks in disposable state before real installation.
- **Observed Codex version rejected by the current gate**: update the unforced family
  from `0.147.x` to `0.151.x` test-first, retain full capability inspection, and keep
  the explicit forced path fail-closed for every other family.
- **Windows Node lookup bypasses an earlier command shim**: wrap only the implicit
  `codex` lookup with `ComSpec /d /s /c` and `shell:false`, preserve explicit overrides,
  and regression-test the invocation vector plus real read-only dry-run evidence.
- **Conflicting existing `thoth-plugins` registration**: compare normalized provenance
  and return user action without mutation.
- **Codex is still running**: documentation and the plan state the stopped-host
  precondition; a locked cleanup returns bounded close-and-retry guidance while keeping
  the already verified central installation. Process enumeration is omitted because
  executable names, helpers, containers, and time-of-check races differ across hosts.
- **Unsafe orphan path**: refuse symlinks/junction escapes, files in place of expected
  directories, unresolved `CODEX_HOME`, and any target outside the exact product-owned
  root set; never broaden deletion to make cleanup pass.
- **Unrelated dirty thoth-agents work**: inspect status before every edit, touch only
  declared installer/generator/release/test/doc surfaces, and review its scoped diff.
- **Central push authentication or network failure**: retain the complete local central
  commit and report the exact failed push; no plugin/cached user data is affected.
- **Current tagged bundles predate central installer code**: acceptable because the
  catalog fetches only their valid `plugin/` subdirectories; future npm releases carry
  the updated installer and automatic catalog publisher.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped file inventory and verification seams contain zero MCP registration changes.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The complete design leaves storage/retrieval untouched and makes catalog output reproducible from a checked-in registry.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The design maps both native schemas to one release record and one plugin bundle without duplicating memory or lifecycle semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No mapped requirement, file, migration, or verification seam changes recall behavior or output budgets.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The plan declares the sole new catalog, removes competing package catalogs, retires only explicitly owned Codex legacy paths after replacement verification, and preserves sibling/unrelated state without compatibility shims.
