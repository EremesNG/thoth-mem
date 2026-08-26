# Feature Specification: Native plugin distribution parity

**Change ID**: `native-plugin-distribution-parity`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: thoth-mem currently packages OpenCode as a copied nested asset bundle even though OpenCode's native npm plugin loader is already implemented and operated successfully in the sibling `thoth-agents` project. The copied bundle can exist without being resolved by the host, duplicates MCP/config activation, and forces local/private corrections. Rebase distribution on the proven host-native model instead of repairing another custom loader.<br>
**Impact**: OpenCode loads thoth-mem through a real `@opencode-ai/plugin` entry: an exact npm package entry for public releases and an explicit `file://` entry for local development certification. The native Bun adapter owns MCP registration and lifecycle callback mapping, while SQLite-backed lifecycle work executes through its package-relative Node entry; setup synchronizes the memory Skill into OpenCode's native global Skill root because npm plugins do not expose package-relative Skills. Codex and Claude Code continue through their native marketplace/plugin managers and shared generated plugin bundle. All three hosts invoke the same SQLite-first v2 core and selected data directory.<br>
**Affected capabilities**: `cli`, `harness-integration`, `packaging`

## User stories

### US1 - Install thoth-mem as a native OpenCode plugin (Priority: P1)

As an OpenCode user, I can install an exact published thoth-mem plugin or explicitly select a local development build and have OpenCode natively load its six-tool MCP, lifecycle hooks, and memory Skill without copied plugin bridges or duplicate MCP configuration.

**Independent test**: Build the package, configure a disposable OpenCode home with a local `file://` entry and unrelated commented JSONC, synchronize the owned Skill, and use OpenCode `1.18.23` to resolve the plugin, MCP, Skill, and native hooks from an unrelated project directory.

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-024, FR-025, FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032, FR-035, SC-001, SC-002, SC-003, SC-007, SC-010

**Acceptance scenarios**:

1. **Given** public setup executes from a verified `thoth-mem` package version, **When** OpenCode setup completes, **Then** its configuration contains exactly `thoth-mem@<executing-version>`, the native Skill tree is current, and neither `.thoth-mem`, `plugins/thoth-mem.js`, nor an owned `mcp.thoth-mem` block is required.
2. **Given** local-development setup receives an explicit package root and data directory, **When** setup completes, **Then** OpenCode contains exactly one canonical absolute `file://` plugin entry, the local Skill tree is synchronized, and the native plugin starts the checkout-built v2 core without `npx` or a published-package fallback.
3. **Given** recovered memory changes between turns, **When** OpenCode builds the model payload, **Then** thoth-mem changes only its tagged trailing recovery region and preserves the byte-stable prefix used by the provider prompt cache.

### US2 - Distribute Codex and Claude through their native managers (Priority: P1)

As a Codex or Claude Code user, I can discover thoth-mem from the repository marketplace and install one native plugin whose manifest, hooks, MCP registration, Skill, and portable runner all resolve inside the installed bundle or exact package.

**Independent test**: Pack the npm artifact, validate both marketplace catalogs and their shared plugin root, exercise Codex manager installation in a disposable home, run Claude strict plugin validation, and start MCP/lifecycle from isolated paths with spaces and an unrelated CWD.

**Covers**: FR-001, FR-002, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-020, FR-021, FR-022, FR-023, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, FR-039, FR-040, FR-041, SC-004, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** a supported Codex manager, **When** the user registers `EremesNG/thoth-mem` and installs `thoth-mem@thoth-mem`, **Then** Codex resolves one enabled native plugin and starts its exact six-tool MCP and lifecycle hooks without a private descriptor edit.
2. **Given** the repository Claude marketplace and no paid model session, **When** strict validation and isolated packed smoke run, **Then** the manager-visible structure, hooks, MCP, Skill, runtime, and data binding can pass while real model consumption remains explicitly unobserved.

### US3 - Continue one memory across native hosts (Priority: P1)

As a coding-agent user, I can save a durable project handoff in Codex and recover it in native OpenCode from the same SQLite database so that changing hosts does not require re-explaining the work.

**Independent test**: Bind both local installations to one explicit data directory, seed a unique source-attributed handoff through Codex, start a fresh native OpenCode root session without that marker in the prompt, and compare the recovered stable memory/evidence identifiers.

**Covers**: FR-002, FR-013, FR-014, FR-016, FR-017, SC-003, SC-004, SC-008, SC-009, SC-010

**Acceptance scenarios**:

1. **Given** Codex confirmed a handoff in the selected v2 database, **When** native OpenCode starts for the same project, **Then** bounded recovery is injected through a supported native channel and the six tools can expand the same stable IDs.
2. **Given** any host lacks proof of model-visible consumption, **When** certification is reported, **Then** plugin resolution, hook execution, memory confirmation, context delivery, and model use are recorded as distinct dimensions.

### US4 - Keep installation evidence truthful and repairable (Priority: P2)

As a maintainer, I can inspect, repeat, repair, or roll back only thoth-mem-owned native configuration and Skill files while preserving unrelated host state and never treating copied files as proof of activation.

**Independent test**: Exercise public and local OpenCode setup against clean, commented, drifted, malformed, and failure-injected disposable homes; run Codex/Claude manager fakes; and verify exact no-op convergence plus bounded rollback ownership.

**Covers**: FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-012, FR-014, FR-018, FR-019, FR-020, FR-021, FR-022, FR-023, FR-024, FR-025, FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, FR-039, FR-040, FR-041, SC-002, SC-005, SC-006, SC-007

**Acceptance scenarios**:

1. **Given** unrelated OpenCode plugins, MCP entries, comments, and Skills, **When** setup installs, repairs, or rolls back thoth-mem, **Then** only the exact thoth-mem plugin entry and owned Skill tree change.
2. **Given** copied legacy/inert thoth-mem assets still exist, **When** native setup inspects them, **Then** it reports bounded cleanup guidance but does not infer ownership or delete them from name/path alone.

### US5 - Recover the verified root identity in every native host (Priority: P1)

As a root coding agent, I can obtain the exact active root-session identity already known by the host integration so that durable memory is scoped to the real session rather than saved without attribution or under a nearby identifier.

**Independent test**: Invoke the public OpenCode native identity tool for root, delegated, and degraded ancestry; execute Codex and Claude host-shaped lifecycle recovery; and assert the exact six-tool MCP registry remains unchanged while model-visible identity is complete, bounded, and mapped to v2 `root_session_key`.

**Covers**: FR-002, FR-014, FR-017, FR-042, FR-043, FR-044, SC-010, SC-011, SC-012

**Acceptance scenarios**:

1. **Given** an OpenCode root or delegated session, **When** `thoth_mem_root_identity` runs, **Then** it returns the bounded versioned identity contract, resolves at most 16 parent links with cycle detection, grants lifecycle authorization only to the root caller, performs no memory dispatch, and does not change the six MCP tools.
2. **Given** Codex or Claude lifecycle recovery has accepted native `session_id` and project context, **When** host output is produced, **Then** it includes the complete verified identity before bounded memory context; Codex may use its documented root-agent fallback and Claude invents no environment fallback.
3. **Given** identity is absent, delegated, malformed, ambiguous, or too large for bounded output, **When** the integration cannot prove the root, **Then** it fails closed without inventing continuity or emitting a partial identity.

### US6 - Run native OpenCode hooks safely inside Bun (Priority: P1)

As an OpenCode user, I can submit prompts and trigger lifecycle hooks without the Bun-hosted plugin loading Node-native SQLite bindings, while the package-relative Node runtime persists and recovers the same v2 memory.

**Independent test**: Install the packed artifact into a disposable directory, load `dist/opencode.js` with the supported Bun runtime, execute enrollment, checkpoint, post-compaction, and recovery callbacks, and assert that the package-relative Node child returns the saved checkpoint without `ERR_DLOPEN_FAILED` or a source-checkout/CWD dependency.

**Covers**: FR-001, FR-002, FR-010, FR-011, FR-012, FR-014, FR-016, FR-017, FR-045, SC-001, SC-003, SC-007, SC-010, SC-013

**Acceptance scenarios**:

1. **Given** OpenCode loads the native plugin inside Bun, **When** a root lifecycle event requires persistence or recovery, **Then** the Bun bundle sends one bounded v2 JSON request to the package-relative `node dist/index.js lifecycle-v2` entry and never imports or instantiates `better-sqlite3` or `MemoryService` itself.
2. **Given** Node is missing, exits nonzero, times out, or returns malformed output, **When** a lifecycle hook runs, **Then** thoth-mem fails closed without injecting unverified recovery and without rejecting the user's OpenCode prompt.

## Edge cases

- OpenCode uses `opencode.jsonc`, comments, trailing commas, multiple config locations, an older exact package entry, a local `file://` entry, or similarly named third-party plugins.
- The local package path contains spaces, backslashes, URL-encoded characters, or points to a package whose native entry/build output is absent or stale.
- The thoth-mem Skill tree is missing, partially drifted, symlinked, or coexists with unrelated global Skills.
- Public and local OpenCode modes are confused; setup must never silently fall back between npm and `file://` provenance.
- OpenCode resolves the plugin but its MCP or a lifecycle hook fails; asset presence and plugin resolution are not sufficient for certification.
- Codex or Claude marketplace state exists but the plugin is disabled, stale, ambiguous, or manager verification is unavailable.
- A caller starts MCP/hooks from an unrelated CWD or without inheriting a shell-only environment variable.
- Recovery changes after a new memory or compaction event; native injection must not rewrite or reorder earlier payload bytes or introduce volatile timestamps/identifiers before the payload tail.
- Claude structural validation succeeds without a paid session; model consumption remains unobserved.
- Setup fails after config backup, plugin entry mutation, Skill staging, Skill activation, verification, or receipt checkpoint.
- A Codex or Claude manager command is interrupted, returns nonzero after changing state, or verifies a different post-state than its exit code suggests; restart recovery must reconcile exact manager evidence without touching manager-owned caches directly.
- OpenCode executes plugins under Bun while the memory core depends on the Node-native `better-sqlite3` binding; no native binding may cross into the Bun bundle, and Node-child failure must remain bounded and non-fatal to the host prompt.

## Functional requirements

- **FR-001 — Published Package MUST Contain Native Assets for All Three Harnesses**: `[MODIFIED packaging]` The packed release MUST expose a native OpenCode npm plugin entry plus repository-discoverable Codex and Claude Code marketplaces; each host path MUST provide one lifecycle-hook path, one registration path for the shared exact six-tool MCP server, and the v2 memory Skill over the same core version without requiring another host's loader topology.
- **FR-002 — Every Native Plugin MUST Bundle Hooks, MCP, and Skills**: `[MODIFIED harness-integration]` OpenCode MUST export a typed native plugin that contributes the shared MCP and verified lifecycle hooks while its setup synchronizes the bundled Skill source into OpenCode's native Skill root; Codex and Claude MUST expose their hooks, MCP, and Skill through their native marketplace bundle. Equivalent events MUST still terminate in the same host-neutral v2 lifecycle.
- **FR-003 — Converge installer-owned OpenCode state**: `[MODIFIED cli]` Public OpenCode setup MUST converge exactly one `thoth-mem@<executing-version>` plugin entry; explicit local-development setup MUST converge exactly one canonical absolute `file://` entry bound to the verified local native plugin build. Both modes MUST synchronize the exact owned `thoth-mem` Skill tree and MUST NOT install `.thoth-mem`, `plugins/thoth-mem.js`, or an owned `mcp.thoth-mem` configuration block.
- **FR-004 — Repair every non-current state**: `[MODIFIED cli]` OpenCode setup MUST repair an older, newer, duplicated, wrong-provenance, or same-version-diverged thoth-mem plugin entry and owned Skill tree while treating unrelated config/Skills and unproven copied assets as outside its ownership; exact convergence MUST perform zero mutation.
- **FR-005 — Select and repair configuration deterministically**: `[MODIFIED cli]` OpenCode setup MUST select configuration using documented precedence, preserve comments and unrelated JSONC content, replace only exact thoth-mem package/file entries, reject malformed configuration before mutation, and use an explicit local package root rather than inferring development mode.
- **FR-006 — Journal replacement before mutation**: `[MODIFIED cli]` Before changing OpenCode configuration or its owned global Skill tree, setup MUST persist target-bounded recovery evidence for the exact managed entry/tree and MUST restore only those owned values after a handled failure; it MUST NOT snapshot or restore unrelated configuration, plugin directories, or shared Skill roots wholesale.
- **FR-007 — Include skill in managed drift**: `[MODIFIED packaging]` OpenCode inspection MUST compare the packaged canonical thoth-mem Skill source with the exact globally synchronized `skills/thoth-mem` tree so missing, stale, extra, or linked managed entries are reported without scanning or claiming sibling Skills.
- **FR-008 — Keep rollback ownership bounded**: `[MODIFIED packaging]` OpenCode rollback MUST restore or remove only the exact prior thoth-mem plugin entry and receipt-owned `skills/thoth-mem` tree; it MUST preserve unrelated global Skills, config entries, comments, and later user changes.
- **FR-009 — Replace the whole managed asset target safely**: `[REMOVED packaging]` Native OpenCode distribution MUST NOT create or replace a copied managed plugin asset target; npm/file plugin resolution and the separately owned Skill tree supersede that legacy topology.
- **FR-010 — Hook Execution MUST Use Portable Node Runners**: `[MODIFIED packaging]` OpenCode hook adapters MUST execute inside the Bun-loaded native package, but every SQLite-backed lifecycle operation MUST cross a bounded JSON-stdio boundary to the package-relative `node dist/index.js lifecycle-v2` entry without a receipt, CWD assumption, or child `npx`; Codex and Claude hooks plus MCP registration MUST enter through their root-relative portable runner, which resolves the exact pinned npm runtime for public installs or a verified absolute checkout build for explicit local development. The MCP descriptor MUST NOT bypass that provenance decision with a direct public-package command.
- **FR-011 — NPM Tarball MUST Include the Complete Integration Inventory**: `[MODIFIED packaging]` Packed verification MUST prove the native OpenCode main entry, CLI bin, canonical OpenCode Skill source, Codex/Claude marketplaces and shared plugin root, every declared hook/MCP/Skill/runner, and the exact shared core version; no host asset may resolve from the development checkout during public packed smoke.
- **FR-012 — Verify current packed-package convergence**: `[MODIFIED packaging]` Packed verification MUST exercise public exact-version and explicit local-file OpenCode convergence, Skill synchronization, duplicate/drift repair, unrelated-state preservation, exact repeated no-op, native plugin import, MCP startup, and lifecycle execution in disposable homes; it MUST also verify Codex/Claude native manager packages without mutating real homes.
- **FR-013 — Local Native Certification MUST Use Explicit Provenance**: `[INTERNAL]` Local OpenCode certification MUST use a canonical `file://` entry derived from an explicit verified package root/build and bind the selected local data directory without mutating public marketplace artifacts or falling back to the npm release; the resolved configuration MUST expose that provenance before model smoke.
- **FR-014 — Certification MUST Separate Observable Outcome Dimensions**: `[INTERNAL]` Each host report MUST distinguish native plugin/manager resolution, MCP tool enumeration, hook delivery, memory confirmation, bounded context delivery, and model use. Unobserved dimensions MUST remain failed, degraded, or at risk; Claude paid-model use and the user-operated OpenCode cross-host smoke cannot be inferred from fixtures.
- **FR-015 — CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code**: `[MODIFIED cli]` The first-product CLI MUST expose `thoth-mem setup opencode`, `thoth-mem setup codex`, and `thoth-mem setup claude` for global/user-native installation only, with plan and JSON output. OpenCode MUST support public exact-version and explicit local-file provenance; Codex and Claude MUST use their native managers. Project scope, legacy filesystem fallback, and copied-bundle setup MUST be rejected rather than silently emulated.
- **FR-016 — Runtime Configuration MUST Resolve One Shared Data Directory**: `[INTERNAL]` MCP and lifecycle execution in every host MUST resolve one validated data directory with deterministic precedence from an explicit command value, `THOTH_MEM_DATA_DIR`, strict schema-v2 JSON at `${XDG_CONFIG_HOME:-<home>/.config}/thoth-mem/config.json`, and the default directory. An absent file means no persisted override; an unreadable, malformed, schema-invalid, or non-file path MUST fail closed with a bounded diagnostic rather than silently selecting another database. Local setup with `--data-dir` MUST merge only `dataDir` and preserve other schema-valid provider fields. Explicit local Codex/Claude setup MUST additionally persist an absolute regular-file `runtimeEntry` whose package name/version matches the installed bundle; public manager setup MUST clear that local override. Provider updates MUST create parent directories as needed, write a sibling temporary file then atomically rename it, and restore only the provider-owned file after handled failure.
- **FR-017 — Native Recovery Injection MUST Preserve Prompt-Cache Prefix Stability**: `[INTERNAL]` OpenCode recovery injection MUST use a stable plugin-owned tag, remove only prior thoth-mem tagged content, and append deterministic stable recovery or changing recovery as the final supported payload region without rewriting or reordering earlier system/messages. Injected content before the volatile tail MUST contain no timestamps, random values, request IDs, or other turn-varying bytes.
- **FR-018 — Plan-Only Setup MUST Perform Zero Writes**: `[MODIFIED cli]` Plan mode for each native host MUST report the exact package/file provenance, native-manager operations, owned Skill/provider-config changes, verification steps, and restart action without changing files, invoking mutating manager commands, creating backups, or creating receipts; it MUST NOT describe project scope or a legacy filesystem strategy.
- **FR-019 — Setup MUST Merge Only Managed Configuration**: `[MODIFIED cli]` OpenCode setup MAY change only exact thoth-mem npm/file plugin entries, the exact owned `skills/thoth-mem` tree, and provider-owned `config.json`; Codex and Claude setup MAY invoke only their native managers and MUST NOT edit manager caches, add separate MCP configuration, or fall back to copied assets. Ambiguous state MUST fail closed.
- **FR-020 — Every Mutating Attempt MUST Emit an Ownership Receipt**: `[MODIFIED cli]` A mutating setup attempt MUST checkpoint a secret-free receipt before its first owned filesystem change or native-manager command and record selected host, provenance, exact owned config/Skill/provider state, ordered manager outcomes, verification, recovery status, and final result. It MUST NOT record unrelated config, cache contents, prompts, or credentials.
- **FR-021 — Codex Setup Capability Mapping MUST Select Exactly One Ownership Strategy**: `[MODIFIED harness-integration]` Codex setup MUST select `plugin_manager` only when exact manager mutation and verification capabilities are available; otherwise it MUST return a non-mutating unsupported or requires-user-action result. The removed `legacy_filesystem` strategy MUST NOT be selected or emulated.
- **FR-022 — Codex Setup MUST Safely Migrate Proven Dual-Owned State**: `[REMOVED cli]` First-product Codex setup MUST NOT migrate, delete, or adopt copied legacy state; it MAY report independently verified native manager state and bounded manual cleanup guidance for external residue.
- **FR-023 — Legacy Codex Installation Freshness MUST Use Stable Package and Content Identity**: `[REMOVED cli]` First-product freshness MUST be derived from exact native manager marketplace/plugin evidence; no legacy asset metadata, shim path, or copied-content identity participates in setup status.
- **FR-024 — Every Harness Setup MUST Install Its Packaged Skill Asset**: `[MODIFIED harness-integration]` OpenCode setup MUST synchronize the canonical packaged thoth-mem Skill into the exact global native `skills/thoth-mem` directory; Codex and Claude MUST receive the Skill from their native marketplace bundle. Setup MUST preserve unrelated Skills and verify the host-appropriate discovery path.
- **FR-025 — Register bundled discovery path**: `[REMOVED harness-integration]` The native OpenCode plugin MUST NOT mutate `skills.paths`; its npm/file package entry and setup-synchronized global Skill root replace runtime registration of a package-relative bundled path.
- **FR-026 — Preserve user skill configuration**: `[MODIFIED harness-integration]` OpenCode setup and runtime MUST preserve every existing `skills.paths` value and every sibling global Skill; only the exact setup-owned `skills/thoth-mem` tree may be synchronized or restored.
- **FR-027 — Installation Smoke Tests MUST Execute From the Packed Artifact**: `[MODIFIED packaging]` Release verification MUST import the packed native OpenCode main, execute its packed CLI bin, exercise public exact-version and explicit local-file config planning plus Skill synchronization in disposable homes, and run Codex/Claude marketplace, lifecycle, and MCP smoke without reading real homes or resolving public runtime files from the source checkout. The removed `setup-v2` copied canary MUST NOT be exercised.
- **FR-028 — Recover interrupted setup automatically**: `[MODIFIED cli]` A later setup run MUST validate any canonical in-progress receipt, restore only its exact owned OpenCode plugin entries, Skill tree, and provider config or reconcile independently verified native-manager operations, then retry from a clean owned baseline; invalid receipt paths MUST never be followed.
- **FR-029 — Remove durable rollback state after success**: `[MODIFIED cli]` After exact native post-state verification, setup MUST remove temporary journals and superseded backups for the same host/scope while retaining the minimal final ownership receipt needed for status and future bounded repair.
- **FR-030 — Degrade cleanup without false installation failure**: `[MODIFIED cli]` If native installation verifies but cleanup of target-bounded temporary state is incomplete, setup MAY report `complete` with a bounded cleanup warning and MUST retry that cleanup before a later no-op; it MUST NOT roll back a verified host install solely for cleanup failure.
- **FR-031 — Preserve truthful planning and results**: `[MODIFIED cli]` Plan and JSON/human results MUST report native provenance, exact owned mutations, manager evidence, verification dimensions, cleanup, and restart actions consistently. Changed success requests a host restart; exact no-op performs zero writes and requests none; missing native package/Skill/manager capability fails before mutation without legacy fallback.
- **FR-032 — Repeated Setup MUST Be Idempotent**: `[MODIFIED cli]` Repeated setup MUST perform zero mutation and return `complete` with `changed=false` only when the requested global/user native state is independently verified: exact npm/file plus owned Skill/provider state for OpenCode, or exact marketplace and enabled-plugin state for Codex/Claude. The removed `legacy_filesystem` strategy and executable-path identity MUST NOT participate.
- **FR-033 — Codex Setup MUST Attempt Verified Marketplace and Plugin Registration Safely**: `[MODIFIED cli]` Codex setup MUST plan, checkpoint, attempt, and independently verify marketplace registration and enabled-plugin state through supported global/user manager commands. Mixed verified and failed outcomes MUST remain partial or require user action according to receipt evidence; no failure may trigger copied-asset fallback, cache editing, or legacy activation.
- **FR-034 — Automated Codex Setup Verification MUST Be Isolated From Real User State**: `[MODIFIED cli]` Automated Codex verification MUST use injected execution and disposable global/user homes against the supported `0.147.0` contract; it MUST NOT require project-scope coverage, the obsolete `0.144.0` contract, credentials, or a real personal home. Any authorized real-host regression MUST remain a separately recorded manual smoke.
- **FR-035 — Rollback MUST Restore Only Receipt-Owned Changes**: `[MODIFIED cli]` Native rollback/recovery MUST restore only exact receipt-owned OpenCode configuration, Skill, and provider state or reconcile independently verified manager operations. A manager removal MAY run only when a valid receipt proves setup created the exact state and the manager exposes a safe scoped removal; otherwise setup MUST preserve manager state and return bounded manual action. Legacy and migration rollback behavior is removed.
- **FR-036 — Codex Manager Operations MUST Be Independent and Verification-Authoritative**: `[MODIFIED cli]` Codex marketplace registration and plugin installation/enablement MUST remain independently attempted, checkpointed, and verified for the requested global/user native state; exact manager rereads remain authoritative over exit text. The clean supported fixture MUST use Codex `0.147.0` and the executing thoth-mem package version, never the obsolete `0.144.0`/`0.3.7` pair, project scope, or legacy fallback.
- **FR-037 — Claude Code Coexistence and Migration MUST Preserve Ownership Boundaries**: `[MODIFIED cli]` First-product Claude setup MUST classify and preserve manual, external, ambiguous, and pre-existing manager state while operating only through verified native-manager commands. It MUST NOT migrate, adopt, restore, or delete prior copied/managed fragments; such residue receives bounded manual guidance, and rollback is limited to receipt-proven safe manager operations under FR-035.
- **FR-038 — Hidden Codex Manager Residue MUST NOT Equal Registered State**: `[MODIFIED harness-integration]` Exact global/user marketplace and enabled-plugin inspection is the sole authority for Codex native state. Hidden/cache/temporary residue, command text, exit code, or state from another home MUST NOT prove registration or ownership; project-scoped setup and cross-scope project/global verification are removed from the first product.
- **FR-039 — Preserve unforced setup behavior**: `[MODIFIED harness-integration]` Codex `0.147.x` is the supported unforced first-product manager contract. Other versions MUST fail closed before mutation unless an explicit force path independently proves the complete safe native-manager capability contract; safely absent manager state on any version MUST never select or preserve a legacy filesystem strategy.
- **FR-040 — Render a bounded forced-version warning**: `[MODIFIED cli]` A forced Codex version outside `0.147.x`, including `0.146.x`, MUST emit exactly one bounded override warning only after complete safe manager capabilities are independently verified and actually bypass the version gate. Codex `0.147.x` uses the normal supported path without that warning. Forced incomplete, malformed, or unsafe capabilities MUST fail closed with an ordinary bounded capability diagnostic and no override warning; neither diagnostic may change the evidence-derived status or add a manual action by itself.
- **FR-041 — Verify override behavior in isolated controlled execution**: `[MODIFIED cli]` Automated injected verification MUST cover unforced supported `0.147.x`, unforced fail-closed `0.146.x`/future versions, and forced capability-complete plus incomplete/unsafe `0.146.x` and future-version cases in disposable global/user homes. It MUST NOT classify `0.146.x` as unforced-tested, exercise project scope, or read/mutate a real Codex home.
- **FR-042 — OpenCode MUST expose one native identity-only tool**: `[ADDED harness-integration]` The native OpenCode plugin MUST register exactly one host-native tool named `thoth_mem_root_identity`, separate from the exact six-tool MCP registry. It MUST accept no user arguments, return the proven versioned root/caller/project/authorization contract, resolve `parentID` ancestry with a fixed depth-16 bound and cycle detection, deny delegated lifecycle authority, perform no lifecycle or persistence side effect, and fail closed without a root ID when identity cannot be proven.
- **FR-043 — Verified identity header**: `[MODIFIED harness-integration]` OpenCode, Codex, and Claude recovery or post-compaction output MUST preserve the lifecycle-resolved root session and project in a complete bounded identity header before optional memory context. V2 consumers MUST map that exact host root identifier to `root_session_key`; output MUST truncate only optional context and MUST be unavailable rather than truncate identity.
- **FR-044 — Shared Skills MUST Route to One Host-Specific Lifecycle Contract**: `[MODIFIED harness-integration]` Packaged OpenCode, Codex, and Claude Skills MUST document their distinct authoritative sources and rejected substitutes: OpenCode prioritizes `thoth_mem_root_identity`; Codex prioritizes injected verified identity then targeted `CODEX_THREAD_ID` with only an unambiguous current-task cross-check; Claude prioritizes injected identity or official hook `session_id` plus `cwd` and MUST NOT invent `CLAUDE_SESSION_ID`. Canonical and distributed copies MUST remain synchronized.
- **FR-045 — OpenCode Bun Runtime MUST Keep SQLite Behind the Node Boundary**: `[ADDED harness-integration]` The native OpenCode bundle MUST NOT import, bundle, instantiate, or execute `better-sqlite3`, `MemoryService`, or another Node-native persistence binding inside Bun. It MUST derive the lifecycle entry relative to its own package, invoke literal `node` without a shell or `npx`, send one validated host-neutral v2 event over stdin, accept only the versioned lifecycle envelope, bound time/output, and treat launch, timeout, exit, or parse failure as no verified lifecycle result rather than a host-fatal exception.

## Success criteria

- **SC-001** `[buildable]`: Native entry verification passes when the package builds a directly importable OpenCode plugin whose returned registration contains one exact six-tool MCP server and verified lifecycle hooks, while the CLI bin remains independently executable.
- **SC-002** `[buildable]`: OpenCode setup verification passes when public mode converges one exact-version package entry and one owned Skill tree in commented JSONC, local mode converges one absolute `file://` entry and the same Skill contract, and a second identical run changes zero bytes.
- **SC-003** `[buildable]`: OpenCode `1.18.23` resolves the local native plugin, exact six MCP tools, thoth-mem Skill, lifecycle callbacks, checkout runtime, and explicit shared data directory from an unrelated CWD before model smoke.
- **SC-004** `[buildable]`: Codex `0.147.0` installs or resolves one native marketplace plugin without a private descriptor edit, exposes exactly six tools, and preserves the prior restart recovery behavior against the explicit shared database.
- **SC-005** `[buildable]`: Claude `2.1.198` strict validation plus isolated packed MCP/lifecycle smoke pass for its marketplace, manifest, paths, hooks, Skill, runner, runtime, and data binding, while real paid-session model use remains `RISK`.
- **SC-006** `[buildable]`: Failure-injected setup/manager fixtures preserve unrelated state, restore exact receipt-owned pre-state, reject ambiguous ownership, and never claim copied asset presence as native activation.
- **SC-007** `[buildable]`: Packed isolation verification passes when the tarball and disposable homes contain no public dependency on source-checkout paths, private descriptors, caller CWD, shell-only data binding, duplicate MCP activation, or obsolete OpenCode copied-bundle assets.
- **SC-008** `[outcome]`: The cross-host smoke passes when a fresh real OpenCode session recovers a unique Codex-seeded handoff that is absent from the prompt and uses it to continue the task; this remains `RISK` until observed by the user.
- **SC-009** `[outcome]`: The shared-database outcome passes when Codex and OpenCode retrieve the same stable memory/evidence IDs from `C:\Users\EremesNG\.thoth-mem-v2-local\memory-v2.sqlite`; this remains `RISK` until the OpenCode side completes.
- **SC-010** `[buildable]`: Prompt-cache safety passes when property tests over repeated native transforms preserve an identical byte prefix for unchanged conversation content, keep at most one tagged thoth-mem recovery block, and confine all changing recovery bytes to the trailing region.
- **SC-011** `[buildable]`: The OpenCode public plugin exposes exactly one `thoth_mem_root_identity` native tool whose root, delegated, ancestry-failure, authorization, and zero-dispatch behavior pass while MCP enumeration remains exactly six tools.
- **SC-012** `[buildable]`: OpenCode, Codex, and Claude host-output tests observe a complete verified identity plus bounded recovery context, reject partial or invented identity, and package verification proves the detailed host references reach every installed Skill copy.
- **SC-013** `[buildable]`: Packed OpenCode verification loads the installed native main with the supported Bun runtime, persists and recovers a checkpoint through the package-relative Node lifecycle entry, contains no bundled native SQLite implementation, and proves a failed child cannot reject the host callback or inject false recovery.

## Assumptions

- `C:\DEV\Proyectos\Webstorm\thoth-agents` is the primary implementation reference for native OpenCode package loading, exact npm version pinning, explicit `file://` development entries, native plugin composition, OpenCode Skill synchronization, and Codex/Claude manager boundaries.
- Repository `master`, local Engram, and local AgentMemory remain secondary references for lifecycle event mapping and prior installation lessons, not alternate product topologies.
- `C:\DEV\Proyectos\Webstorm\oh-my-opencode-slim` is a secondary reference only for packed host-load smoke and prompt-cache-safe tagged trailing injection.
- The selected local database remains `C:\Users\EremesNG\.thoth-mem-v2-local\memory-v2.sqlite` and must not be deleted or migrated.
- The installed host versions are OpenCode `1.18.23`, Codex `0.147.0`, and Claude Code `2.1.198`.
- The user selected the native-parity scope and retained the Accelerated route after superseding the copied-bundle plan.

## Dependencies

- Local reference repository `C:\DEV\Proyectos\Webstorm\thoth-agents`.
- Installed OpenCode and Codex binaries for real local resolution checks; installed Claude CLI for strict structural validation only.
- `@opencode-ai/plugin` type/runtime contract compatible with the supported OpenCode release.

## Out of scope

- Embedding thoth-mem into thoth-agents or making thoth-agents own provider lifecycle/persistence.
- Publishing npm, tagging, merging, or changing the currently published release during local certification.
- Purchasing or using a paid Claude model session.
- Restoring the v1 Store, vector, graph, dashboard, HTTP, copied OpenCode bundle, or compatibility runtime.
- Adding the unrelated dual OpenCode v1/v2 adapter, orchestration, multiplexer, or prompt-management subsystems from `oh-my-opencode-slim`.
- Deleting, rewriting, or automatically migrating an existing memory database.
