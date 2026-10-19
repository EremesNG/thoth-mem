# Proposal: Codex Plugin Manager Ownership

## Intent

Make successful modern Codex setup idempotent and safely single-owned. The current
setup can leave two active owners for the same integration: thoth-mem directly
copies plugin assets into the selected Codex home and appends a legacy plugin MCP
activation block, while the Codex plugin manager separately registers the
marketplace, installs/caches the plugin, and updates its own activation state.
That dual state can work, but it makes ownership, repeat setup, migration,
receipts, and rollback ambiguous. The change MUST resolve the ambiguity rather
than merely suppress conflict reporting.

For a verified modern Codex capability/version set, the Codex plugin manager will
be the exclusive owner of marketplace registration, plugin cache/install state,
and plugin activation/configuration. `thoth-mem setup codex` will orchestrate and
independently verify that manager-owned state, but it will not direct-copy the
plugin to `~/.codex/plugins/thoth-mem` (or the project equivalent) and will not
merge the legacy thoth-mem plugin MCP activation/global definitions. A separate
legacy strategy will retain direct-copy and managed-config ownership only when
safe plugin management is unavailable for the selected Codex version, capability
set, and scope.

The change also migrates existing usable dual-owned installations without
destroying official plugin-manager state or unrelated user configuration. It
incorporates the structured Codex state verifier already present as an
uncommitted working-tree change, but does not claim that verifier alone implements
the ownership or migration fix.

## Scope

### In Scope

- Define an explicit Codex setup strategy selected before mutation:
  - `plugin_manager` for a tested modern Codex version/capability combination
    whose exact marketplace, plugin, selected-scope, and verification command
    shapes are safely discoverable;
  - `legacy_filesystem` only when plugin management is unavailable or cannot be
    proven safe for the selected version and scope.
- In `plugin_manager`, make Codex exclusively own marketplace metadata, cache
  contents, installed/enabled plugin state, and any plugin-generated activation
  or MCP configuration. Thoth-mem MUST NOT copy packaged Codex assets into the
  legacy direct-install target and MUST NOT add or refresh the legacy managed TOML
  activation block or equivalent global MCP definition.
- In `legacy_filesystem`, keep direct-copy assets, thoth-owned installation
  metadata, and narrowly managed configuration explicit and internally
  consistent. This strategy MUST NOT impersonate or partially combine with plugin
  manager ownership.
- Detect an existing usable dual state: independently verified official
  marketplace/plugin-manager state together with a legacy thoth-owned copied
  plugin and/or managed activation block. Keep that state usable until modern
  manager state is confirmed and a safe migration decision is checkpointed.
- Migrate dual-owned state by preserving the installed official plugin, Codex
  cache, marketplace registration, enabled state, and unrelated user config;
  remove or transform only legacy locations that are provably thoth-owned through
  signed receipt evidence or exact managed markers, metadata, paths, and stable
  package/content identity. Ambiguous legacy state MUST remain untouched and
  produce precise `requires_user_action` guidance.
- Make migration a normal idempotent setup path. `--force` MUST NOT be required
  for routine migration, MUST NOT establish ownership by itself, and MUST NOT
  authorize overwriting unrelated or ambiguous Codex state.
- Redesign receipt planning and checkpoints around strategy ownership and command
  ordering. Receipts MUST record the selected strategy, ownership evidence,
  attempted external mutations, independently verified post-command state, legacy
  migration actions, and the final post-external state without secrets or raw
  configuration dumps.
- Eliminate obsolete whole-file/full-config post-state hashes where Codex may
  change configuration after the hash was planned. Where a hash remains useful,
  compute it from the final post-external owned state; otherwise record a
  canonical, bounded identity/state snapshot for the strategy-owned location.
- Define rollback per strategy:
  - modern rollback may ask the Codex plugin manager to remove only manager state
    that the selected receipt proves this run created, and only through a safely
    exposed, independently verified command; pre-existing official manager state,
    cache, and user configuration MUST be preserved;
  - legacy rollback restores/removes only receipt-owned copied assets, metadata,
    and managed config fragments;
  - migration rollback restores only the provably owned legacy fragments removed
    by that migration when needed, never an entire pre-CLI config over later Codex
    or user changes. If safe manager rollback is unavailable, return explicit
    manual action rather than deleting manager-owned files directly.
- Replace executable-path equality as the freshness identity for legacy metadata.
  A package installed or invoked through a different shim/path MUST remain current
  when its stable package identity, version/content identity, harness, scope,
  target, and verified owned content still match. Executable paths MAY remain
  diagnostic evidence but MUST NOT cause false staleness by themselves.
- Incorporate the existing uncommitted structured verifier in
  `src/setup/codex-cli.ts` and `tests/setup/codex-cli.test.ts`: detect `--json`
  independently per list command, validate marketplace and installed/enabled
  plugin schemas fail-closed, preserve exact identity/provenance checks, and retain
  a strict legacy text fallback only when JSON is not advertised. Malformed or
  unexpected advertised JSON MUST NOT fall back to permissive text matching.
- Add migration and idempotency tests using controlled filesystems, injected Codex
  executors, isolated homes/projects, and packed-artifact fixtures. Tests MUST
  cover clean modern setup, clean legacy fallback, current usable dual state,
  ambiguous ownership, interrupted migration, later Codex/user config changes,
  rollback boundaries, project/global scope, and executable-path changes without
  mutating a real personal/global Codex installation.
- Keep external-state evidence bounded to version/help capability probes,
  structured or strict legacy list results, canonical identities, owned markers,
  content digests, and receipt facts. Diagnostics and artifacts MUST NOT include
  credentials, secrets, raw config dumps, or unrelated plugin/cache contents.

Material behavior changes:

- **From:** successful Codex setup can direct-copy the plugin, merge a legacy MCP
  activation block, and also install the same plugin through Codex. **To:** one
  preselected strategy owns the installation; modern Codex uses plugin-manager
  ownership exclusively. **Reason:** two writers cannot provide reliable
  idempotency, migration, or rollback. **Impact:** setup planning, paths,
  filesystem changes, verification, receipts, tests, and result diagnostics become
  strategy-aware.
- **From:** an existing dual-owned installation is treated as copied assets/config
  plus separately verified external commands, and conflicts may require force.
  **To:** it is a recognized migration state that preserves manager-owned state and
  removes only proven legacy ownership after manager verification. **Reason:** the
  current working state must remain usable while converging to one owner.
  **Impact:** inspection needs provenance evidence and migration-specific
  checkpoints, failure recovery, and no-force tests.
- **From:** receipts can precompute full configuration hashes before Codex external
  commands later mutate that configuration. **To:** checkpoints record strategy
  ownership and final post-external state, with owned-fragment hashes or canonical
  verified identities instead of stale whole-file snapshots. **Reason:** restoring
  a pre-command file can overwrite legitimate later Codex or user changes.
  **Impact:** receipt schema/validation, apply ordering, recovery, and rollback
  matching must change compatibly and fail closed on ambiguity.
- **From:** legacy metadata requires the same resolved executable path to be
  considered current. **To:** stable package/content identity is authoritative and
  executable path is diagnostic. **Reason:** shims, package-manager layouts, and
  upgrades can change launch paths without changing the installed integration.
  **Impact:** metadata parsing/matching and idempotency tests must distinguish true
  content drift from path-only drift.
- **From:** verification may rely on loose textual identity presence. **To:** each
  advertised JSON command is parsed against a fail-closed schema and exact
  marketplace/plugin state, with strict legacy-format parsing only when JSON is
  unavailable. **Reason:** verification is the ownership and migration safety
  gate. **Impact:** the current structured-verifier diff is retained and completed
  as one part of this broader change.

### Deferred / Needs Discovery

- The exact tested Codex version range and capability matrix for selecting
  `plugin_manager` need scenario-level specification and design evidence. Version
  alone is insufficient; unknown or partially proven command grammars must fail
  closed to the explicit legacy strategy for that scope.
- The exact backward-compatible receipt/metadata schema version and canonical
  manager-state snapshot shape need design. Existing signed receipts must remain
  readable for recovery and must not be silently reinterpreted as proof of modern
  manager ownership.
- Safe Codex manager removal/uninstall grammar may not be available for every
  supported version or scope. The required outcome is fixed—never directly delete
  manager-owned cache/config—but exact automatic rollback coverage depends on
  capability discovery.
- Final real-Codex global and project smoke tests remain deferred until the user
  explicitly authorizes mutations against controlled disposable Codex homes and a
  known installable marketplace ref. Deterministic fixtures are the acceptance
  path before that authorization.

### Out of Scope

- Deleting, rewriting, or repairing unrelated Codex marketplaces, official plugin
  caches, other installed plugins, user settings, or raw global configuration.
- Treating `--force` as proof that an ambiguous path/config/cache is thoth-owned.
- Direct filesystem mutation of Codex plugin-manager cache or manager-generated
  activation state on the modern path.
- Automatic remote publishing, marketplace branch creation, credential use, or
  mutation of a real user Codex home during normal automated verification.
- Changing OpenCode or Claude Code setup ownership, the six-tool MCP surface,
  SQLite schema, retrieval behavior, sync format, or lifecycle memory semantics.
- Editing generated `dist/` output directly or discarding the current uncommitted
  structured-verifier work.
- Amending `openspec/memory/constitution.md` in this change. Governance impact is
  assessed below and any amendment remains a separate user-confirmed action.

## Approach

1. Introduce a strategy decision object derived from Codex version, per-command
   capability evidence, selected scope, and independent verification support.
   Planning reports the decision and performs zero writes or external mutations.
2. Split Codex inspection/planning/apply/verify paths so `plugin_manager` schedules
   only manager commands and their checkpoints, while `legacy_filesystem`
   schedules only owned copy/config/metadata actions. Shared result and exit-code
   contracts remain unchanged.
3. Recognize clean modern, clean legacy, dual-owned, ambiguous, partial, and
   interrupted states. For dual-owned migration, first confirm the manager state,
   persist the migration decision, then remove only proven legacy fragments and
   verify the final single-owned state. A failure before confirmation leaves the
   usable dual state intact; a failure after removal uses receipt-owned recovery.
4. Evolve receipts and metadata additively. Preserve old receipt validation, record
   strategy/provenance/final owned state for new receipts, and bind rollback to the
   receipt-created or receipt-removed locations rather than the complete config
   file. Persist a checkpoint after every external command and migration mutation.
5. Use stable package identity plus packaged-content digests/manifest identity for
   legacy freshness. Treat an executable path change as a diagnostic unless owned
   content, version, scope, target, or package identity also proves drift.
6. Preserve and finish the working-tree structured verifier as the independent
   evidence gate for modern state. JSON capability is selected per command; its
   exact schema fails closed; non-JSON versions use only the recognized strict
   legacy formats.
7. Prove the state machine with controlled executor/filesystem fixtures and packed
   artifacts. Keep real global mutation outside automated tests and require a final
   explicit user authorization before any disposable real-Codex smoke run.

## Affected Areas

- `src/setup/engine.ts`: strategy selection, dual-state inspection, migration
  ordering, post-external verification, checkpoints, idempotency, recovery, and
  strategy-bounded rollback orchestration.
- `src/setup/codex-cli.ts`: version/capability evidence, per-command structured
  verification, exact manager identities, and optional safe manager rollback
  commands. The existing uncommitted verifier diff is part of this change.
- `src/setup/harnesses/codex.ts`: legacy-only managed TOML inspection, merge,
  removal, and owned-fragment rollback planning.
- `src/setup/paths.ts`: strategy-specific targets so the modern path does not treat
  `plugins/thoth-mem` as its owned installation destination.
- `src/setup/receipt.ts` and `src/setup/types.ts`: compatible receipt/step evidence
  for strategy, provenance, final post-external state, migration, and rollback.
- `src/setup/filesystem.ts`: only where a narrowly owned remove/restore operation or
  stable content snapshot is needed for legacy migration; manager-owned state stays
  outside direct filesystem mutation.
- `tests/setup/codex-cli.test.ts`, `tests/setup/engine.test.ts`, and
  `tests/setup/rollback.test.ts`: structured verifier, strategy selection,
  migration, interruption, false-staleness, no-force, and rollback coverage.
- `tests/packaging/packed-install.test.ts`: controlled clean/dual-state global and
  project setup from the packed artifact without real global mutation.
- `README.md`, `codemap.md`, and `src/codemap.md`: ownership model, modern/legacy
  behavior, migration results, and operator recovery guidance.
- Main OpenSpec deltas expected next: `cli` for setup/receipt/rollback behavior,
  `packaging` for packed plugin-manager versus legacy assets and smoke evidence,
  and `harness-integration` for capability/version gating and explicit degradation.

## Risks

- Incorrect capability classification could select modern ownership on an unsafe
  CLI or legacy ownership despite a working manager. Mitigation: require both a
  tested version classification and exact advertised command/verification grammar;
  unknown evidence fails closed and is visible.
- Migration could delete a user-created lookalike directory or config table.
  Mitigation: ownership requires signed receipt or exact marker/metadata/content
  evidence; names and paths alone are insufficient, and ambiguity causes zero
  mutation.
- Removing legacy activation before manager state is durable could break a
  currently usable installation. Mitigation: verify manager state first, persist a
  migration checkpoint, then remove legacy state atomically and reverify.
- Codex or the user may change configuration after setup begins. Mitigation: avoid
  whole-config restoration, compare only owned fragments/canonical manager state,
  and preserve later unrelated changes during rollback.
- Old receipts may not contain enough provenance for automatic migration or
  rollback. Mitigation: validate them under their original schema, use them only
  for claims they actually prove, and request manual action for missing evidence.
- Stable identity could hide real drift if defined too weakly. Mitigation: combine
  package name/version with packaged content or manifest digest and exact target,
  scope, harness, and verified owned state; executable path is only one diagnostic.
- Structured output may change across Codex versions. Mitigation: version-gate the
  schema, parse JSON fail-closed, keep per-command capability selection, and never
  downgrade malformed advertised JSON to permissive text.
- Tests could mutate a developer's global Codex state. Mitigation: inject executors,
  isolate homes/projects, snapshot controlled filesystems, scrub credentials, and
  reserve real smoke mutations for explicit user authorization.

## Rollback Plan

- Retain readable legacy metadata/receipt schemas and keep the
  `legacy_filesystem` strategy available while the modern path rolls out. If the
  new strategy selector regresses, route only unproven capability sets to legacy
  without rewriting existing manager-owned state.
- A failed migration before legacy removal leaves the verified dual installation
  unchanged. A failed migration after removal restores only the receipt-proven
  legacy fragments required to recover usability, then reports the unresolved
  manager/migration state explicitly.
- Modern rollback invokes only a verified Codex manager removal operation for
  state created by the selected receipt. If that operation is unavailable or the
  manager state diverged, return `requires_user_action`; do not delete cache files
  or restore a whole config file.
- Legacy rollback restores/removes only copied assets, metadata, and managed marker
  fragments recorded by the receipt. Unrelated settings and post-setup edits remain
  untouched.
- Reverting the code change leaves pre-existing manager installations and caches
  intact. Any corrected follow-up can continue from signed checkpoints rather than
  assuming that an interrupted run completed.

## Success Criteria

- A controlled modern Codex fixture with supported version, scope, command grammar,
  and exact state verification completes through the plugin manager, creates no
  legacy direct-copy directory or managed MCP activation block, and a second run is
  `complete` with `changed=false` and no mutating command.
- A controlled Codex fixture without plugin management selects the explicit legacy
  strategy, installs only its declared owned assets/config/metadata, verifies them,
  and is idempotent on repeat.
- A controlled current dual-owned fixture remains usable until manager state is
  confirmed, then migrates without `--force`, preserves official marketplace,
  cache, installed/enabled plugin state, and unrelated config, removes only proven
  legacy state, and becomes an idempotent modern no-op.
- Lookalike, incomplete, stale, unsigned, path-only, or content-divergent legacy
  state is not deleted automatically. The result is zero-write
  `requires_user_action` with safe ownership diagnostics.
- Changing only the executable/shim path does not make verified legacy metadata
  stale when package/content identity and owned state match; actual package/content
  drift still requires a planned update or explicit action.
- Receipts/checkpoints prove the selected strategy, attempt and final external
  outcomes, migration actions, and final post-external owned state. No obsolete
  pre-command whole-config hash is used to overwrite later Codex/user changes.
- Rollback tests prove modern receipts never directly mutate manager cache/config,
  legacy receipts restore only owned fragments, pre-existing manager state is not
  removed, and post-setup unrelated edits survive.
- The structured verifier tests prove independent per-command `--json` use, exact
  marketplace Git provenance, exact installed-and-enabled plugin identity,
  fail-closed malformed/unexpected schemas, strict legacy fallback, scoped command
  arrays, bounded output, and privacy-safe diagnostics.
- Interrupted migration at every checkpoint recovers to either the original usable
  dual state or the final verified single-owned state, never a false `complete`.
- Focused setup/rollback tests, packed controlled installation tests,
  `pnpm run build`, and `pnpm test` pass without invoking a real personal/global
  Codex mutation. Any later real smoke test is separately user-authorized and uses
  disposable controlled homes/projects.
- Public setup result fields and exit-code mappings remain deterministic; the
  six-tool MCP surface, storage schema, retrieval, and other harness setup behavior
  remain unchanged.

## Constitution Impact Assessment

This change is governance-touching because it materially refines the capability,
degradation, and ownership behavior used to satisfy **P3 — Harness-Agnostic Memory
Contract**. The proposal preserves P3's host-neutral memory semantics and makes
Codex-specific capability detection, plugin ownership, and unsupported-state
handling more explicit at the adapter/setup boundary. It does not change the
memory model, six-tool MCP surface, or introduce Codex fields into persisted memory.

No constitution edit is part of this proposal. During design and plan review,
assess whether the ownership/degradation guidance is already covered by P3 or
warrants a separately user-confirmed PATCH/MINOR amendment through
`sdd-constitution`. This assessment is advisory and does not replace the normal
constitution gate.
