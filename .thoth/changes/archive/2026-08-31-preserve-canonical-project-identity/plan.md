# Implementation Plan: Preserve stable local project identity

## Technical context

The current core persists projects by `projects.identity_key`; native adapters derive `path:<absolute-workspace>` and model-visible recovery then drops that key in favor of the display name. This produces basename duplicates today and guarantees a new identity after a folder move, rename, drive change, or linked worktree. Local inspection confirms `thoth-mem` and `thoth-mem-imp-size` have different worktree roots but the same Git common directory and origin. Git itself exposes no portable repository UUID, so the product must establish one local identifier in the shared common directory.

The revised design atomically publishes an untracked marker named `thoth-mem.project-id` directly under the verified Git common directory and formats its UUID as `git:<uuid>`. Publication uses a fully written and fsynced unique temporary file followed by an atomic no-replace hard-link to the final marker; a concurrent loser rereads the complete winner, and unpublished crash-left temporary files never count as identity. Every linked worktree therefore shares one key, while a fresh clone receives a distinct marker. SQLite revision 7 adds exact alias bindings so current path-based projects can be adopted without moving or merging content. A new `project rename` CLI changes only `display_name`; it is the current-core equivalent of the old `master` branch's `migrate-project`, but no longer rewrites identity across every record because foreign keys already point to one immutable project ID.

The earlier path-key plan review is stale because its recorded spec/plan/task hashes no longer match. Implementation remains root-owned under reason codes `shared-state` and `sequential-chain`: Git marker creation, schema migration, adoption, native identity, runner validation, Skill distribution, and CLI administration form one ordered contract and overlap existing authorized runner/distribution changes. Mandatory TDD precedes each behavior, `simplify` follows implementation, and a fresh Oracle performs final verification.

### Semantic-overlap review

`Git Repositories MUST Use One Stable Local Project Identity` is intentionally ADDED rather than folded into `Save Paths MUST Use One Explicit Identity Contract`. The existing requirement governs verified project/session identity at save and review boundaries; it does not define how a repository identity is established, shared across worktrees, persisted outside SQLite, or recovered after a move. The new requirement owns only that bootstrap/lifetime contract. FR-002 modifies the existing save-path requirement to consume the resulting canonical key and aliases. No other canonical store requirement covers Git common-directory marker creation.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The plan keeps exactly six MCP tools; rename is a CLI administration operation.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — Identity uses local Git metadata, an atomic UUID marker, and SQLite aliases with no network, model, embedding, graph, or optional projection dependency.
- **P3 — Harness-Agnostic Memory Contract**: PASS — All hosts consume the same `{ key, name, aliases }` lifecycle identity; Git payload details and marker resolution stay at the native adapter boundary.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recovery remains progressive and capped at 1,000 Unicode code points; only the verified UUID/name identity prefix changes.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — Revision 7, adoption, non-merge behavior, backup, rollback, CLI scope, and stale-review boundary are explicit; no compatibility shim or legacy import is introduced.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add a synchronous local Git identity resolver. It obtains the top-level/common directory and ordered worktrees through fixed `git -C` argument vectors plus lossless porcelain `-z` parsing, resolves real absolute paths, and validates the common-directory/marker boundary. It writes and fsyncs a unique temporary file, publishes it with an atomic same-directory hard link that fails if the final marker exists, then removes only its own temporary file; a loser rereads and validates the complete winner. A crash before publication leaves an ignored unique temporary file, and a filesystem without atomic hard-link publication degrades rather than using a weaker protocol. It returns `git:<uuid>`, a main-worktree display-name hint, and ordered `path:` aliases. Non-Git returns the existing normalized path identity; unsafe/unreadable/unwritable Git state never falls back to path. | `src/integration/project-identity.ts` (new), `src/integration/adapters/index.ts`, `src/integration/opencode/node-lifecycle-client.ts`, `src/integration/opencode/plugin.ts` | New `tests/integration/project-identity.test.ts` uses disposable real repositories/worktrees, racing child processes including a loser during publication, crash-left temp files, move/rename, two clones, malformed marker, symlink/boundary, hard-link failure, and read-only fixtures. |
| FR-002 | Extend internal `ProjectIdentityInput` with bounded exact path aliases. `ensureProject` resolves alias bindings before superseded path-key rows. For a missing Git key it chooses the first existing exact path project in resolver order (main worktree first), rekeys only that project to the Git key, binds its old/current/worktree paths, and leaves every other project/content row untouched. Existing canonical projects only refresh exact alias observation timestamps. Alias collision with another project fails the enclosing transaction. | `src/memory-core/contracts.ts`, `src/memory-core/sqlite/ledger.ts`, `src/memory-core/service.ts` | New `tests/memory-core/project-identity.test.ts` proves deterministic adoption, alias precedence over a shadowed path row, no merge, project isolation, rollback, and idempotency. |
| FR-003 | Raise SQLite to revision 7 and add `project_aliases(alias_key PRIMARY KEY, project_id FK, alias_kind CHECK(path), first_seen_at, last_seen_at)`. Fresh schema includes it. Introduce a distinct revision-6 constant so revision-5 migration records 6 before the new step instead of using the latest constant. Revision-6 upgrade first creates/verifies `.pre-v7.bak`, then creates the table/index in one transaction, verifies foreign keys, authoritative row counts, and exact logical memory FTS contents, records revision 7, and reopens idempotently. Older supported revisions continue their ordered upgrades through both 6 and 7. | `src/memory-core/sqlite/schema.ts`, `src/memory-core/sqlite/migrations.ts` | `tests/memory-core/schema-migration.test.ts` covers backup, v6→v7, v3/v4/v5 ordered chains containing distinct 6/7 records, FTS/row preservation, injected rollback, conflict, and reopen. |
| FR-004 | Native payload normalization calls the shared resolver once per lifecycle input and carries canonical key, display-name hint, and aliases into the host-neutral contract. The hint initializes a new project only; `ensureProject` returns the database-persisted display name after create/adoption and never overwrites a manual rename. Delegated identity remains denied; Git identity resolution failure returns bounded degraded behavior rather than a guessed project. The OpenCode read-only helper v2 exposes `project_key` plus `project_name_hint`, not a claim about persisted display state. | `src/integration/adapters/index.ts`, `src/integration/opencode/node-lifecycle-client.ts`, `src/integration/opencode/plugin.ts`, `src/memory-core/sqlite/ledger.ts` | `tests/integration/adapters.test.ts`, `tests/integration/opencode-native-plugin.test.ts`, and project service tests prove cross-host key parity, root/delegated authority, worktree equality, persisted rename survival, helper-hint semantics, and degraded marker handling. |
| FR-005 | Extend `ContinuationRenderInput` with `projectKey`; render `root_session_id`, `project_key`, and the service-returned persisted `project_name` in stable order. Change lifecycle/project ensure results to carry the authoritative stored name. OpenCode Node dispatch returns both lifecycle data and the child identity envelope instead of discarding identity. Public/OpenCode parents require root/key equality with local dispatch, validate the returned name as bounded/safe, and require exact name self-consistency between child envelope and recovery header; they deliberately do not compare it with the pre-adoption folder-name hint. Identity-only fallback before a successful child may use the safe hint and is explicitly non-delivered context. | `src/memory-core/continuation.ts`, `src/memory-core/service.ts`, `src/cli.ts`, `src/integration/opencode/node-lifecycle-client.ts`, `src/integration/opencode/plugin.ts`, `plugin/runners/public-runner.mjs` | `tests/memory-core/continuation.test.ts`, `tests/integration/lifecycle.test.ts`, `tests/integration/public-plugin-runner.test.ts`, and OpenCode tests cover exact key validation, renamed persisted-name acceptance, envelope/header name consistency, poisoning, caps, and neutral fallback. |
| FR-006 | Rewrite the common Skill and each host identity reference to copy the exact verified UUID key and treat name/path/worktree/remote as non-authoritative metadata. OpenCode identity helper moves to schema `thoth-mem.opencode.identity.v2`. Synchronize canonical copies and distribution hashes only after runtime/reference edits. | `plugin/skills/thoth-mem/SKILL.md`, host references under `integrations/`, `docs/agent/native-lifecycle.md`, synchronized plugin/integration copies, `plugin/distribution-lock.json` | `tests/integration/public-plugin-package.test.ts`, `tests/packaging/first-product.test.ts`, integration verification, and packed smoke prove wording/parity. |
| FR-007 | Reuse described Zod schemas for every MCP `project_key` and `project_name`. Advertised JSON schema says the key is exact/opaque and the name is display-only; handlers retain strict inputs and introduce no alias inference from model prose. `mem_project action=list` exposes at most 256 exact aliases per project plus total-count/truncation metadata and whether an old path-key row is shadowed, without becoming a mutation or limiting exact alias resolution. | `src/tools/index.ts`, `src/memory-core/service.ts` | `tests/tools/mcp.test.ts` inspects tool schemas, the 256-alias list cap and truncation metadata, exact alias resolution, and zero-side-effect partial identity failure. |
| FR-008 | Lifecycle stdout identity becomes `{ root_session_id, project_key, project_name }`; child validators compare both project fields to the dispatched canonical identity. All three native bundles consume the same output. | `src/cli.ts`, `src/integration/opencode/node-lifecycle-client.ts`, `plugin/runners/public-runner.mjs` | Cross-harness integration fixtures prove the same UUID/name pair and reject a self-consistent forged child header/envelope that differs from dispatched identity. |
| FR-009 | Extend CLI parsing with `project rename --project <exact-key-or-alias> --name <display-name> [--data-dir <dir>]`. Unknown project subcommands and malformed/extra options return deterministic nonzero codes. The command opens only the selected database and emits bounded JSON or concise text consistent with existing CLI output. | `src/cli.ts` | New `tests/cli.test.ts` covers help, parsing, unknown command, missing/unsafe inputs, success, and no-op. |
| FR-010 | Add `MemoryService.renameProject` to resolve alias-first, validate a bounded safe display name, update only `projects.display_name` and `updated_at`, and report project ID/key, old/new names, and `changed`. It never mutates identity/alias/child tables or FTS. | `src/memory-core/service.ts` | `tests/memory-core/project-identity.test.ts` snapshots all project-related tables and recall before/after rename and injects update failure for rollback. |

### Identity and alias state

- Canonical Git key: `git:<lowercase UUID>` read from `<git-common-dir>/thoth-mem.project-id`.
- Non-Git key: existing normalized `path:<absolute-path>` with no claim of move stability.
- Display name hint: main-worktree basename from the adapter, used only if a project is created. OpenCode's pre-lifecycle identity helper labels it `project_name_hint`.
- Authoritative display name: `projects.display_name` returned by `ensureProject`/`MemoryService.lifecycle`; lifecycle recovery and child stdout use it, and no later adapter hint overwrites a manual rename.
- Alias: exact normalized `path:` key with kind `path`. Alias keys are globally unique and fail closed on cross-project reuse.
- Resolution order: exact alias binding first, then canonical project key. During first UUID adoption only, ordered current Git path keys identify a candidate; main worktree precedes linked worktrees.
- If several path-key projects already exist, one candidate is rekeyed and the others remain unchanged. Alias precedence prevents future writes to their path keys, while bounded project listing exposes the shadowed state for later reconciliation.
- Branch, HEAD, remote, package name, and basename never participate in equality.

### Migration and rollback

- Revision 7 is schema-only at startup; it does not know a repository cwd and therefore does not infer aliases or rekey projects.
- The first verified lifecycle for a Git repository performs alias adoption inside the same database transaction that ensures the project/session. A failed adoption commits neither lifecycle state nor aliases.
- File-backed revision 6 receives one verified `.pre-v7.bak` before forward mutation. Existing v3/v4/v5 upgrade chains retain their prior backups and also create the pre-v7 backup once revision 6 is reached.
- Code rollback can restore the pre-change package. Data rollback after revision 7 uses the verified pre-v7 backup; the source legacy database remains untouched.
- Existing duplicate project rows and their content remain intact. Removing or merging them belongs to the later reconciliation/import change.

### TDD and implementation order

1. Add failing real-Git identity tests for atomic marker creation, worktrees, moves, clones, and degradation.
2. Add failing revision-7 schema/backup tests and project adoption/alias/rename service tests.
3. Add failing continuation, native envelope, MCP schema/list, and CLI rename tests.
4. Implement the resolver, schema migration, alias-aware ledger adoption, and rename service until core tests pass.
5. Propagate canonical identity through adapters, continuation, CLI lifecycle, OpenCode/public runners, and MCP descriptions.
6. Update Skill/reference/docs, run `pnpm run integration:sync`, and preserve every pre-existing authorized hunk.
7. Apply `simplify`, rerun focused checks, then broader build/test/package/fixture gates and fresh Oracle verification.

### Verification commands

```sh
pnpm exec vitest run tests/memory-core/project-identity.test.ts tests/memory-core/schema-migration.test.ts tests/memory-core/continuation.test.ts tests/tools/mcp.test.ts tests/cli.test.ts --config vitest.unit.config.ts
pnpm exec vitest run tests/integration/project-identity.test.ts tests/integration/adapters.test.ts tests/integration/lifecycle.test.ts tests/integration/opencode-native-plugin.test.ts tests/integration/public-plugin-runner.test.ts tests/integration/public-plugin-package.test.ts tests/packaging/first-product.test.ts --config vitest.integration.config.ts
pnpm run integration:verify
pnpm run build
pnpm test
pnpm run integration:smoke
pnpm run benchmark:fixture
pnpm run prepublishOnly
git diff --check
```

No command operates on the user's real Git marker or real database during tests; all identity, migration, rename, and packed-smoke fixtures use disposable directories. After implementation, a fresh Oracle verifies FR-001 through FR-010 and SC-001 through SC-004. Root records evidence in `verify-report.md`; only PASS permits archive.

## Optional support artifacts

- `research.md`: Not needed; current source, `master` history, and local Git/worktree evidence answer the implementation questions.
- `data-model.md`: Not needed; the complete one-table revision-7 schema, ownership, resolution precedence, and rollback contract are recorded in this plan.
- `contracts/`: Not needed; lifecycle/identity/CLI shapes are small and specified above with direct executable tests.
- `quickstart.md`: Not needed; runtime identity is transparent and CLI help covers the one operator action.

## Risks and migrations

- **Automatic write inside Git metadata**: First verified use creates one untracked marker. Mitigation: fixed common-directory boundary, no remote lookup, exclusive create, canonical UUID validation, symlink/path checks, bounded errors, and disposable real-Git tests.
- **Concurrent first lifecycle**: Two processes can generate candidates, and a directly created final file could be observed before its write completes. Mitigation: write/fsync a unique temporary file, atomically hard-link it without replacement to publish, make losers reread/validate the complete winner, ignore unpublished temps, and fail closed where atomic hard-link publication is unavailable.
- **Marker loss or repository copy**: Removing the marker creates a new local identity; copying the full `.git` directory copies identity. Mitigation: fail closed on malformed state, document the local-instance model, and reserve explicit link/rebind for a later CLI change.
- **Path alias collision/reuse**: A path may later host another repository. Mitigation: globally unique exact aliases and conflict instead of silent rebinding; no remote/basename heuristic.
- **Existing duplicate rows**: Worktree aliases can shadow old path-key rows without merging their history. Mitigation: preserve and expose them for the subsequent reconciliation/import design.
- **Revision-7 migration**: Schema mutation could fail. Mitigation: verified pre-v7 backup, one transaction, row/FTS/FK verification, idempotent reopen, and injected-failure tests.
- **Identity prefix size/privacy**: UUID adds fixed metadata but removes the need to expose absolute path in the model-visible key. Aliases stay in bounded project inspection, not recovery; the 1,000-code-point cap remains authoritative.
- **Dirty plugin assets**: Runner and distribution lock already contain authorized local-plugin work. Mitigation: one writer, edit current disk state, canonical sync after source edits, and final diff review.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design retains exactly six tools and places rename in the CLI, as required for administration.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — UUID/alias resolution is entirely local and deterministic after exclusive marker creation; retrieval and optional projections are unchanged.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One host-neutral canonical key/name/alias contract serves all adapters; Git execution and native validation remain outside persistence semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recovery preserves the existing cap, selection count, useful-content floors, and progressive expansion while using a shorter UUID key instead of a path.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — Revision 7, backup, adoption, alias precedence, non-merge behavior, rename-only CLI, rollback, and excluded clone linking/import are all explicit without shims.
