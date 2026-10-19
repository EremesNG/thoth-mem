# Tasks: Stable Memory Identity Bootstrap

## Phase 1: Identity Foundation

- [x] 1.1 Add identity helper module - `src/store/identity.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `store/Store Fallback Identity MUST Be Deterministic and Reportable`
  **Independent Test:** Helper behavior is exercised through Store save/import tests before surface integration.
  **Verification**:
  - Run: `pnpm test -- tests/store/sessions.test.ts tests/store/export-import.test.ts`
  - Expected: Focused Store tests can assert deterministic fallback ids, placeholder detection, and merged degraded identity metadata.

- [x] 1.2 Add additive identity metadata types - `src/store/types.ts`
  **[USN-1]** | Priority: P1
  **Spec:** `config/Identity Bootstrap Defaults MUST Resolve Deterministically Without New Required Configuration`
  **Independent Test:** TypeScript compilation proves new metadata is optional and existing row interfaces remain source-compatible.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build passes with `IdentityMetadata`, degraded-entry types, and additive result fields without requiring callers to supply new config.

- [x] 1.3 Preserve centralized data-dir bootstrap - `src/config.ts`, `src/server.ts`, `src/cli.ts`
  **[USN-1]** | Priority: P2
  **Spec:** `config/Data-Dir Bootstrap MUST Remain Centralized and Semantics-Preserving`
  **Independent Test:** Existing config tests continue to prove `THOTH_DATA_DIR`, explicit data-dir, and default db path behavior.
  **Verification**:
  - Run: `pnpm test -- tests/config.test.ts`
  - Expected: Data-dir resolution remains unchanged and no new required identity config key is introduced.

## Phase 2: Store Identity Semantics

- [x] 2.1 Preserve explicit session identity and enrichment rules - `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `store/Store Session Persistence MUST Preserve Explicit Session and Project Identity`
  **Independent Test:** Store session tests cover explicit `startSession` / `ensureSession`, placeholder enrichment, and stable-project non-downgrade.
  **Verification**:
  - Run: `pnpm test -- tests/store/sessions.test.ts`
  - Expected: Explicit session/project values persist, placeholder projects enrich idempotently, and stable projects are not replaced by placeholders.

- [x] 2.2 Preserve nullable prompt/observation project compatibility - `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `store/Store Save Paths MUST Retain Nullable Prompt and Observation Project Compatibility`
  **Independent Test:** Store tests prove prompt/observation project fields may remain null while `sessions.project` stays non-null through deterministic compatibility identity.
  **Verification**:
  - Run: `pnpm test -- tests/store/sessions.test.ts tests/store/export-import.test.ts`
  - Expected: Missing project saves remain backward-compatible and explicit project saves remain explicit.

- [x] 2.3 Return Store degraded identity metadata on save paths - `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `store/Store Fallback Identity MUST Be Deterministic and Reportable`
  **Independent Test:** Store save results distinguish explicit identity from synthesized fallback identity.
  **Verification**:
  - Run: `pnpm test -- tests/store/sessions.test.ts tests/store/export-import.test.ts`
  - Expected: `identity` metadata appears only when identity is missing, blank, placeholder, or schema-required.

- [x] 2.4 Preserve or degrade identity explicitly during import/apply - `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `store/Import and ApplyV2Chunk MUST Preserve or Degrade Identity Explicitly`
  **Independent Test:** Import and `applyV2Chunk` tests cover explicit identity preservation and legacy missing-identity degradation.
  **Verification**:
  - Run: `pnpm test -- tests/store/export-import.test.ts tests/sync/sync.test.ts`
  - Expected: Imported explicit session/project fields are preserved and missing identity reports deterministic degraded metadata.

- [x] 2.5 Keep historical placeholders query-stable - `src/store/index.ts`
  **[USN-2]** | Priority: P1
  **Spec:** `store/Historical Placeholder Records MUST Not Be Silently Rewritten`
  **Independent Test:** Regression tests create existing `manual-save-*` and `unknown` rows and verify initialization/read/save paths do not silently repair them.
  **Verification**:
  - Run: `pnpm test -- tests/store/sessions.test.ts tests/store/export-import.test.ts`
  - Expected: Historical placeholder ids/projects remain filterable and unchanged unless explicit idempotent enrichment rules apply.

## Phase 3: MCP and HTTP Surfaces

- [x] 3.1 Report explicit and fallback identity in `mem_session` - `src/tools/mem-session.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `tools/MCP Session and Save Tools MUST Preserve Explicit Identity`
  **Independent Test:** Tool tests verify `action=start` preserves explicit identity and summary/checkpoint fallback use is visible when `id` is omitted.
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-session.test.ts`
  - Expected: Explicit `mem_session` calls report no fallback; omitted ids report the deterministic fallback session id.

- [x] 3.2 Report explicit and fallback identity in `mem_save` - `src/tools/mem-save.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `tools/Compatibility Fallback Identity MUST Be Observable and Deterministic`
  **Independent Test:** Tool tests verify prompt, session summary, observation, missing project, and missing session behavior.
  **Verification**:
  - Run: `pnpm test -- tests/tools/mem-save.test.ts`
  - Expected: `mem_save` responses include concise identity fallback text only when degraded identity metadata exists.

- [x] 3.3 Mirror identity semantics in HTTP save/session routes - `src/http-routes.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `tools/HTTP Save and Session Routes MUST Mirror MCP Identity Semantics`
  **Independent Test:** HTTP tests compare explicit and missing-identity behavior against MCP-equivalent outcomes.
  **Verification**:
  - Run: `pnpm test -- tests/http-server.test.ts`
  - Expected: HTTP responses preserve explicit identity and include structured `identity` metadata for the same degraded fields as MCP.

- [x] 3.4 Preserve compact MCP registry - `src/tools/index.ts`
  **[USN-3]** | Priority: P1
  **Spec:** `tools/Identity Bootstrap MUST NOT Expand the Compact MCP Tool Surface`
  **Independent Test:** Registry tests continue to assert exactly six workflow-level tools and no identity-specific tool.
  **Verification**:
  - Run: `pnpm test -- tests/tools/registry.test.ts`
  - Expected: Registered tools remain exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`.

## Phase 4: Sync and CLI Reporting

- [x] 4.1 Preserve explicit identity in sync export - `src/sync/index.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `sync/Sync Export MUST Preserve Stable Identity Fields`
  **Independent Test:** Sync export tests inspect v2 chunks for explicit session/project fields and nullable project compatibility.
  **Verification**:
  - Run: `pnpm test -- tests/sync/sync.test.ts`
  - Expected: Exported chunks preserve present identity and do not invent placeholders for nullable projects.

- [x] 4.2 Report degraded identity during sync import - `src/sync/index.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `sync/Sync Import MUST Report Missing or Degraded Identity Explicitly`
  **Independent Test:** Sync import tests cover legacy chunks with missing project/session identity and chunks with fully explicit identity.
  **Verification**:
  - Run: `pnpm test -- tests/sync/sync.test.ts`
  - Expected: Legacy imports report degraded identity, while explicit imports do not emit degraded identity metadata.

- [x] 4.3 Keep sync import idempotent with fallback identity - `src/sync/index.ts`
  **[USN-4]** | Priority: P1
  **Spec:** `sync/Sync Import MUST Remain Idempotent With Identity Fallbacks`
  **Independent Test:** Replay and equivalent-payload tests prove fallback identity does not create divergent sessions/projects.
  **Verification**:
  - Run: `pnpm test -- tests/sync/sync.test.ts`
  - Expected: Replayed or equivalent legacy chunks converge without duplicate or divergent placeholder identity.

- [x] 4.4 Show CLI sync directory defaults explicitly - `src/cli.ts`
  **[USN-4]** | Priority: P2
  **Spec:** `sync/CLI Sync Directory Default MUST Remain Stable and Identity Warnings MUST Be Explicit`
  **Independent Test:** CLI tests verify omitted sync dir prints the resolved `process.cwd()/.thoth-sync` default and explicit dirs remain unchanged.
  **Verification**:
  - Run: `pnpm test -- tests/cli.test.ts`
  - Expected: `sync` and `sync-import` output identify the resolved directory and keep explicit directory arguments intact.

## Phase 5: Integration and Release Gates

- [x] 5.1 Verify focused identity surfaces - targeted test files
  **[USN-5]** | Priority: P1
  **Spec:** `tools/HTTP Save and Session Routes MUST Mirror MCP Identity Semantics`
  **Independent Test:** Run the focused suites that exercise Store, MCP, HTTP, sync, CLI, and config identity behavior.
  **Verification**:
  - Run: `pnpm test -- tests/store/sessions.test.ts tests/store/export-import.test.ts tests/tools/mem-session.test.ts tests/tools/mem-save.test.ts tests/http-server.test.ts tests/sync/sync.test.ts tests/cli.test.ts tests/config.test.ts tests/tools/registry.test.ts`
  - Expected: All focused identity/bootstrap suites pass together.

- [x] 5.2 Run build and full suite - repository gate
  **[USN-5]** | Priority: P1
  **Spec:** `config/Data-Dir Bootstrap MUST Remain Centralized and Semantics-Preserving`
  **Independent Test:** Full TypeScript/build and test suite verify additive metadata did not regress shared contracts.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: Build passes with no TypeScript errors.
  - Run: `pnpm test`
  - Expected: Full Vitest suite passes.

## Non-Goals / Guardrails

- Do not add MCP tools or alter tool registry shape.
- Do not perform schema migrations that make `user_prompts.project` or `observations.project` non-null.
- Do not rewrite historical placeholder rows (`manual-save-*`, `unknown`) without explicit opt-in behavior.
- Do not implement multi-harness hooks or move `MemoryIntegrationCore`.
