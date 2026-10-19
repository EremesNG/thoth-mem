# Feature Specification: Preserve stable local project identity

**Change ID**: `preserve-canonical-project-identity`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: Native lifecycle currently identifies projects by absolute path and then drops that path key from model-visible identity. Besides allowing basename-key duplicates, a path key changes when a repository is moved or renamed and treats every Git worktree as a different project. Users need one local repository identity that survives those operations while keeping separate clones independent by default.<br>
**Impact**: Git repositories will receive one locally generated UUID stored in their shared Git common directory. The UUID becomes the canonical project key for every worktree; paths become exact aliases and workspace context. Current SQLite databases gain transactional alias/adoption support, native identity exposes the stable key separately from the display name, and a bounded CLI operation renames only the display name. Existing duplicate project content is not merged by this change.<br>
**Affected capabilities**: `store`, `harness-integration`, `tools`, `cli`

## User stories

### US1 - Keep one project across moves, renames, and worktrees (Priority: P1)

As a coding-agent user, I can move or rename a Git repository and use any of its worktrees without losing normal project recall or creating another logical project.

**Independent test**: Create a temporary Git repository with a linked worktree, resolve identity from both paths, move the repository root, and prove every resolution returns the same local UUID-backed project key.

**Covers**: FR-001, FR-002, FR-004, FR-005, FR-008, SC-001

**Acceptance scenarios**:

1. **Given** a Git repository without a thoth-mem identity, **When** verified native identity resolves concurrently for the first time, **Then** exactly one fully written UUID marker is published atomically without replacement in the Git common directory and every caller returns `git:<uuid>`.
2. **Given** a repository with an existing local UUID, **When** its working directory is moved from one path or drive to another, **Then** the UUID-backed project key remains unchanged and the new path is recorded as an alias.
3. **Given** a repository folder renamed from `thoth-mem` to `thoth-memory`, **When** lifecycle resumes, **Then** the project key remains unchanged and its persisted display name changes only through the explicit rename CLI.
4. **Given** a main worktree and linked worktrees such as `thoth-mem-imp-size`, **When** any worktree runs lifecycle, save, or recall, **Then** all use the same canonical project while their exact paths remain separately observable aliases.
5. **Given** two independent clones of the same remote, **When** each resolves identity, **Then** each receives a different local UUID unless a future explicit linking operation is requested.

### US2 - Propagate exact identity through every native and MCP boundary (Priority: P1)

As a user of Codex, OpenCode, or Claude Code, I can trust that agents copy the verified stable key instead of deriving identity from a name, path, remote, or nearby database row.

**Independent test**: Exercise each native recovery/identity surface and prove its lifecycle envelope, model-visible block, Skill mapping, and MCP schema preserve one exact `project_key`, use the persisted database name after adoption, and never treat a pre-adoption folder-name hint as identity.

**Covers**: FR-004, FR-005, FR-006, FR-007, FR-008, SC-002

**Acceptance scenarios**:

1. **Given** a verified Git project and root session, **When** native recovery renders, **Then** it exposes `root_session_id`, `project_key=git:<uuid>`, and the database-persisted `project_name` as separate bounded values.
2. **Given** the OpenCode read-only identity helper before lifecycle adoption, **When** it verifies a root caller, **Then** its versioned result returns the exact UUID-backed key plus a non-authoritative `project_name_hint`; after lifecycle, the persisted name in the verified recovery block prevails.
3. **Given** a save, recall, context, project, or session MCP call, **When** the agent maps verified identity, **Then** it copies the key verbatim, treats `project_name` as creation/display metadata only, and never substitutes the display name, current path, Git remote, branch, worktree name, host project ID, or recalled content for the key.
4. **Given** a lifecycle child response with a changed/missing key or a name that is unsafe or inconsistent with its recovery header, **When** the host validates it, **Then** no unverified memory context is injected and the host continues with bounded degradation.

### US3 - Adopt existing path projects without destructive merging (Priority: P1)

As an existing user, I can upgrade the current database and begin using stable Git identity while preserving all authoritative rows and making known path identities diagnosable for later reconciliation.

**Independent test**: Upgrade a revision-6 fixture containing main-worktree and linked-worktree path projects, resolve the repository UUID, and prove one deterministic existing project is adopted as canonical, exact paths resolve to it going forward, all original rows remain intact, and no duplicate content is merged automatically.

**Covers**: FR-002, FR-003, SC-003

**Acceptance scenarios**:

1. **Given** a file-backed revision-6 database, **When** revision 7 starts, **Then** a verified recoverable backup is created before project-alias schema changes commit.
2. **Given** an existing project whose key exactly matches the Git main-worktree path, **When** the local UUID is first resolved, **Then** that project is transactionally re-keyed to the UUID and its prior path plus known worktree paths become aliases.
3. **Given** multiple existing project rows matching worktrees of the same repository, **When** adoption runs, **Then** the main-worktree match wins deterministically, future exact aliases resolve to it, and the other rows remain untouched and reportable for later reconciliation.
4. **Given** an alias already bound to another canonical project or an injected migration/adoption failure, **When** the operation runs, **Then** it fails closed without partial keys, aliases, row moves, or FTS changes.

### US4 - Rename the project display name explicitly (Priority: P2)

As a local operator, I can rename a project's display name from the CLI without changing its UUID, aliases, sessions, evidence, memories, receipts, summaries, observations, or recall behavior.

**Independent test**: Rename one UUID-backed project through the CLI, reopen the database, and prove only `projects.display_name` and `updated_at` changed while the canonical key, aliases, foreign-key targets, FTS rows, and recall results stayed identical.

**Covers**: FR-009, FR-010, SC-004

**Acceptance scenarios**:

1. **Given** one exact project UUID or unambiguous exact alias and a valid new display name, **When** `project rename` runs, **Then** it updates one project name and reports the unchanged canonical key.
2. **Given** an unknown, ambiguous, blank, unsafe, or oversized selector/name, **When** rename is requested, **Then** it performs zero durable changes and returns a bounded nonzero result.
3. **Given** a successful rename repeated with the same target name, **When** the CLI runs again, **Then** it reports an idempotent no-op.

## Edge cases

- Concurrent first use writes and syncs a unique temporary file before an atomic no-replace publication; a losing publisher rereads the complete winner, while crash-left unique temporary files are ignored and never parsed as identity.
- A missing, malformed, symlinked, unsafe, unreadable, or unwritable Git marker degrades without falling back to a path key that could split the project.
- A non-Git workspace retains explicit normalized path identity and does not claim move/worktree stability.
- The marker is local metadata, is not committed, and is shared only through the Git common directory; a fresh clone receives a new UUID even when `origin` matches.
- Git branch, HEAD, remote URL, package name, folder basename, and worktree administrative name are metadata, never canonical identity.
- Exact path aliases may reveal that duplicate rows already exist, but this change does not merge their sessions or memory lineage.
- Reusing a historical path for a different Git UUID conflicts rather than silently reassigning the alias.
- Identity-only recovery remains valid when no memory fits, but it contains the complete verified UUID/name pair within the host cap.

## Functional requirements

- **FR-001 — Git Repositories MUST Use One Stable Local Project Identity**: `[ADDED store]` The system MUST publish one fully written UUID marker atomically without replacing an existing marker in the verified Git common directory, make concurrent losers reread the complete winner, ignore crash-left unpublished temporary files, use `git:<uuid>` as the opaque canonical key for every worktree, preserve it across directory moves/renames, and keep independent clones distinct by default; malformed or unavailable marker state MUST fail closed without a path fallback.
- **FR-002 — Save Paths MUST Use One Explicit Identity Contract**: `[MODIFIED store]` All save, lifecycle, recall, context, project, and session paths MUST resolve canonical keys and exact aliases deterministically, prefer an alias binding over a superseded path-key row, adopt at most one deterministic existing path project for a newly resolved Git UUID, and MUST NOT perform fuzzy, basename, remote, branch, or automatic duplicate-content merging.
- **FR-003 — Startup Migrations MUST Be Structured and Idempotent**: `[MODIFIED store]` Revision 7 MUST create and verify a recoverable pre-upgrade backup for file-backed databases, add closed project-alias state transactionally, preserve every authoritative/FTS row, perform no automatic project-content merge, roll back cleanly, and reopen idempotently.
- **FR-004 — Root Session Identity MUST Be Verified and Host-Specific Only at the Adapter**: `[MODIFIED harness-integration]` Native adapters MUST resolve the Git common-directory UUID or explicit non-Git path identity, pass an initial display-name hint for creation, and preserve the exact canonical key with root session identity; the database-persisted display name becomes authoritative after adoption, while delegated, ambiguous, incomplete, or child-key-mismatched identity MUST NOT receive root authority.
- **FR-005 — Model-Visible Recovery Context MUST Be Bounded and Source-Attributed**: `[MODIFIED harness-integration]` Model-visible verified identity MUST carry the exact canonical `project_key` plus the database-persisted `project_name` within the existing host cap; parent validators MUST require key equality with local dispatch and require the returned name to be safe and identical between lifecycle envelope and recovery header, but MUST NOT compare it to a pre-adoption folder-name hint.
- **FR-006 — Shared Skills MUST Preserve Semantic-Boundary Memory Practice**: `[MODIFIED harness-integration]` Shared Skills MUST instruct agents to copy the exact verified `project_key`, treat a helper's `project_name_hint` only as initial display metadata, prefer the persisted name in verified lifecycle/project output, and never derive a key from paths, basenames, remotes, branches, worktree names, host IDs, database listings, or recalled content.
- **FR-007 — MCP Envelopes MUST Use Closed Current Schemas**: `[MODIFIED tools]` Every project-scoped MCP input contract MUST describe `project_key` as the exact opaque verified identity and `project_name`, where present, as creation/display metadata that never participates in identity equality; incomplete or unknown identity fields MUST retain zero-side-effect failure behavior. Project list inspection MUST return at most 256 exact aliases per project with total-count and truncation metadata while exact resolution remains unbounded by that inspection cap.
- **FR-008 — Native Integrations MUST Use the Documented Tool Contracts**: `[MODIFIED tools]` Codex, OpenCode, and Claude Code integrations MUST propagate the same verified canonical UUID from local Git resolution to lifecycle persistence and documented MCP mapping, then use the child service's persisted display name for model-visible lifecycle identity without substituting path metadata.
- **FR-009 — CLI Command Surface MUST Use Current Product Names**: `[MODIFIED cli]` The CLI MUST expose a bounded `project rename` administration command in addition to setup, MCP, lifecycle, and explicit legacy import, and MUST reject unknown project subcommands without compatibility aliases.
- **FR-010 — CLI MUST Provide Managed Setup for OpenCode, Codex, and Claude Code**: `[MODIFIED cli]` The CLI MUST retain existing managed setup and current runtime/import commands while adding only `project rename` for exact local display-name administration; rename MUST leave canonical identity and related records unchanged.

## Success criteria

- **SC-001** `[buildable]`: All temporary-repository tests pass with exactly `1` complete atomically published marker UUID and `1` canonical project key across concurrent first use, the main worktree, at least `1` linked worktree, a folder rename, and a full repository move; `2` independent clones produce `2` UUIDs and crash-left unpublished files produce `0` identities.
- **SC-002** `[buildable]`: All Codex, OpenCode, and Claude identity/recovery tests pass while preserving the same exact UUID and persisted display name, accepting a renamed persisted name despite an older adapter hint, rejecting every changed/missing key or unsafe/inconsistent name, injecting `0` unverified memories, and staying within `1,000` Unicode code points.
- **SC-003** `[buildable]`: Revision-6-to-7 migration and adoption tests pass with `1` verified backup, `0` lost authoritative or FTS rows, `0` automatically merged duplicate-content rows, deterministic main-worktree adoption, idempotent reopen, and full rollback under injected failure.
- **SC-004** `[buildable]`: CLI rename tests pass with exactly `1` display-name update, `0` canonical-key/alias/foreign-key/FTS changes, unchanged recall results, and an idempotent second invocation.

## Assumptions

- Git repositories provide a writable shared common directory for establishing durable local identity; unavailable marker persistence is degraded rather than guessed.
- A repository move includes its `.git` directory or linked common directory. A fresh clone is a new local project unless explicitly linked by future functionality.
- The first entry in verified `git worktree list --porcelain` output is the main worktree and is the preferred exact existing path match for adoption.
- Project display name is operator-managed after initial creation and is not automatically overwritten by later folder/worktree names.
- The exact six-tool MCP surface remains unchanged.

## Dependencies

- Local Git executable and common-directory/worktree metadata for Git identity resolution; no network or remote lookup.
- Existing structured SQLite migration/backup machinery, project foreign-key model, native lifecycle adapters, bounded continuation renderer, public runner validation, and Skill distribution synchronization.

## Out of scope

- Automatically sharing memory between independent clones, forks, or repositories with the same remote.
- Automatically merging existing duplicate project rows or rewriting their sessions, evidence, memories, summaries, observations, receipts, or FTS lineage.
- Importing the legacy database or defining its final project-reconciliation policy.
- A CLI command to merge, link, split, or rebind project identities; only display-name rename is included.
- Move-stable automatic identity for non-Git directories.
- Adding an MCP administration tool, fuzzy project matching, remote-service identity, or committed repository marker.
