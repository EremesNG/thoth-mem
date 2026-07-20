# Implementation Plan: OpenCode packaged skill delivery

## Technical context

OpenCode setup currently installs `integrations/opencode` under the receipt-owned `.thoth-mem/opencode` directory and `integrations/shared` under `.thoth-mem/shared`, then exposes `opencode/plugin.mjs` through a small plugin entry file. The published package already contains the synchronized skill at `plugin/skills/thoth-mem`, but `resolveSetupPaths` does not expose that source and the setup engine does not copy it into the OpenCode asset layout. OpenCode also does not discover arbitrary skills nested under `plugins`; its supported plugin `config` hook can add an absolute directory to `config.skills.paths` at runtime.

The change will reuse the existing published skill copy, install it at `.thoth-mem/opencode/skills/thoth-mem`, and have `plugin.mjs` register the native absolute `.thoth-mem/opencode/skills` parent. The existing receipt-backed directory comparison, replacement, backup, and rollback remain the ownership boundary. No persistent OpenCode config ownership, database migration, release action, or real-host setup is required.

The read-only integration verifier scans relative runtime declarations from the source OpenCode plugin. Because `./skills` is materialized from the separately inventoried shared plugin bundle during setup, declaration validation must bind that exact runtime directory to the existing shared `plugin/skills/thoth-mem/SKILL.md` inventory asset; packed-install tests remain responsible for proving the setup transformation.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change adds no MCP tools and does not alter any of the six existing registrations.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — Retrieval lanes, fallback behavior, and degradation signaling are untouched.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The memory skill remains the shared packaged contract; OpenCode-specific behavior is limited to its setup paths and plugin adapter boundary.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall modes, result limits, trimming, and response metadata are unchanged.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — Existing MCP, HTTP, CLI, and taxonomy contracts are preserved; setup fulfills the current native-delivery promise without renaming or removing a public element.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add the existing published `plugin/skills/thoth-mem` tree as a third OpenCode directory-layout source targeting `opencode/skills/thoth-mem` for both scopes, and bind the plugin's exact `./skills` runtime declaration to that shared inventory source. | `src/setup/paths.ts`; `src/setup/engine.ts`; `scripts/verify-integration-package.mjs`; `SetupPaths.sourceSkillPath` | Isolated project/global setup fixtures, declaration verification, and packed-install assertions inspect every installed skill file. |
| FR-002 | Resolve an OpenCode-only absolute skill source path and reject setup when it is not a directory with a dedicated `packaged-skill-assets-unavailable` error. | `src/setup/paths.ts`; `src/setup/engine.ts` | Focused setup tests remove or omit the source and assert the explicit failure. |
| FR-003 | Resolve `./skills` relative to `import.meta.url` with `fileURLToPath` and register it through the returned OpenCode `config` hook. | `integrations/opencode/plugin.mjs`; OpenCode hooks object | Runtime tests load the copied production plugin, run `config`, and verify the native absolute path resolves to `thoth-mem/SKILL.md`. |
| FR-004 | Append the bundled path only when missing while retaining the existing `skills` object and ordered `paths` entries. | `integrations/opencode/plugin.mjs`; `config.skills.paths` | Runtime unit cases cover absent configuration, existing entries, and repeated execution. |
| FR-005 | Include the skill source in both inspection and application directory layouts so the existing exact managed-directory comparison detects missing, stale, and extra files. | `src/setup/engine.ts`; receipt-owned filesystem layout | Setup inspection tests mutate installed skill files and assert drift followed by repair. |
| FR-006 | Keep the skill nested under the existing asset directory and make no harness config-manager changes for `skills.paths`; existing receipt rollback therefore owns all skill cleanup. | `src/setup/engine.ts`; existing receipt and rollback engine | Rollback tests assert restoration/removal of the complete managed directory and no shared skills path in planned or applied changes. |

### Affected components and interfaces

- `SetupPaths` gains `sourceSkillPath: string | null`; only OpenCode resolves it to `<packageRoot>/plugin/skills/thoth-mem`.
- OpenCode asset layout gains the target-relative entry `opencode/skills/thoth-mem` in both inspection and application.
- The OpenCode plugin hooks object gains `config(config)`, which performs an in-memory, idempotent registration of the bundle's absolute skill parent.
- The integration verifier recognizes only the exact OpenCode `./skills` runtime directory declaration and resolves its source authority through the existing shared skill inventory entry.
- Existing OpenCode `mcp.thoth-mem` persistent configuration ownership is unchanged.
- Existing package inventory and canonical skill synchronization remain the source-integrity contract; no duplicate generated skill tree is introduced.

## Optional support artifacts

- `research.md`: Not needed; authoritative OpenCode hook/schema evidence and an isolated discovery smoke already resolved the design choice before specification.
- `data-model.md`: Not needed; no persisted thoth-mem data or schema changes.
- `contracts/`: Not needed; the existing OpenCode plugin hook and setup receipt interfaces are sufficient and are exercised directly by tests.
- `quickstart.md`: Not needed; the public setup command and user workflow do not change.

## Risks and migrations

- A legacy managed OpenCode installation lacks the new nested skill tree and will be reported as drifted. Re-running setup replaces the receipt-owned directory through the existing backup/receipt transaction, which also supplies rollback.
- Runtime configuration is mutable host state. The hook will restrict itself to the documented `skills.paths` array, preserve existing entries, and avoid persistent config writes.
- File URLs can encode spaces and platform-specific characters. `fileURLToPath(new URL('./skills', import.meta.url))` avoids leaking URL syntax into OpenCode configuration.
- The setup engine currently repeats the OpenCode asset layout in inspection and application. Both sites must use the same three entries; focused drift and packed-install tests guard divergence.
- The packaged skill files currently have unrelated in-progress edits in the working tree. Implementation will consume but not rewrite or revert that user-owned work.
- No data migration is required. Operational migration is `thoth-mem setup opencode` against an existing managed target; release and real-host execution remain out of scope.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design changes only setup assets and an OpenCode configuration hook; MCP registration remains exactly six tools.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — No retrieval implementation or optional dependency is affected.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One synchronized skill remains shared across harnesses, while path discovery is translated only at the OpenCode adapter boundary with explicit managed ownership.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The design does not alter recall output construction or limits.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — The setup command and native plugin contract are extended compatibly; no public name, route, tool, or taxonomy value is removed or renamed.
