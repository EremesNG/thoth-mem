# Implementation Plan: Disambiguate native plugin cache paths

## Technical context

Both repository marketplace descriptors and the shared native-manager implementation currently use `thoth-mem` for marketplace and plugin identity. Codex has already materialized `cache/thoth-mem/thoth-mem/<version>/`; official Claude Code documentation specifies the same `cache/<marketplace>/<plugin>/<version>/` topology. Agents can incorrectly collapse the repeated adjacent segment while expanding a catalog root alias. The change stays at the native distribution/setup boundary: `.agents/plugins/marketplace.json` becomes `thoth-mem-codex`, `.claude-plugin/marketplace.json` becomes `thoth-mem-claude`, `src/setup/native-manager.ts` selects the correct qualified identifier per host, and deterministic tests/package verification enforce both distinctions. No real manager, cache, home, network, persistence, or MCP state is mutated.

**Implementation owner**: root. The source, tests, two descriptors, documentation, and lock update form one short ordered contract change with shared identity selection and coupled assertions; retaining the already-loaded context has greater net gain than delegating the writer and avoids overlaps in the dirty worktree. Final approval remains owned by a fresh read-only Oracle.

**Owned mutable surface**: `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`, `src/setup/native-manager.ts`, `tests/setup/native-managers.test.ts`, `tests/packaging/public-plugin-distribution.test.ts`, `scripts/verify-packed-plugins.mjs`, `README.md`, `plugin/distribution-lock.json`, and this change directory. Existing unrelated changes, including other entries already changed in `plugin/distribution-lock.json`, are preserved.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change modifies only native distribution/setup identity and adds no MCP tool or registry entry.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — No retrieval, projection, SQLite, model, or network behavior changes.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Host-specific marketplace metadata remains at native manager boundaries and does not enter the memory or lifecycle contract.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall APIs, limits, rendering, and telemetry are untouched.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — Both marketplace identity breaks are explicit; no compatibility shim or implicit deletion is added, and real migration remains separately authorized.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Introduce one host-specific native-manager identity value: Codex uses marketplace `thoth-mem-codex` and qualified plugin `thoth-mem@thoth-mem-codex`; Claude uses `thoth-mem-claude` and `thoth-mem@thoth-mem-claude`. Apply it consistently to inspection, plans, mutation, repair, rollback, and ambiguity diagnostics. | `src/setup/native-manager.ts`; public `setupNativeManager` result and injected `NativeManagerExecutor` | `tests/setup/native-managers.test.ts` observes command arguments, structured list state, result actions, rollback, idempotency, cross-host isolation, legacy residue, and provenance collision. |
| FR-002 | Give each repository marketplace a host-specific identifier, preserve plugin/Skill names, and make packed verification derive/assert distinct cache identity segments and resolvable Skill assets for both hosts. | `.agents/plugins/marketplace.json`; `.claude-plugin/marketplace.json`; `tests/packaging/public-plugin-distribution.test.ts`; `scripts/verify-packed-plugins.mjs`; `plugin/distribution-lock.json`; `README.md` | Disposable packed repository fixtures and manifest parsing; no real host binary or home mutation. |
| SC-001 | Run focused native-manager tests with exact identifiers for both hosts. | `tests/setup/native-managers.test.ts` | `pnpm exec vitest run tests/setup/native-managers.test.ts --config vitest.integration.config.ts` |
| SC-002 | Validate both descriptor topologies and packed Skill resolution, then run package verification. | `tests/packaging/public-plugin-distribution.test.ts`; `scripts/verify-packed-plugins.mjs` | `pnpm exec vitest run tests/packaging/public-plugin-distribution.test.ts --config vitest.integration.config.ts`, `pnpm run integration:verify`, `pnpm run integration:smoke`, and `pnpm run prepublishOnly`. |
| SC-003 | Reserve real-host consumption as an outcome check requiring separate authorization for each host. | No repository mutation in this change | Oracle records explicit residual RISK until later authorized real Codex and Claude installs observe their catalog paths. |

The TDD seam is the public managed-setup boundary (`setupNativeManager` plus its injected process executor) and the published marketplace/package boundary. Tests assert externally observable commands, structured manager state, and packed paths; they do not call private helpers or inspect a real cache.

## Optional support artifacts

- `research.md`: Records the official Claude Code cache topology that justified broadening the reproduced Codex defect to both native hosts.
- `data-model.md`: Not needed; no persisted data model changes.
- `contracts/`: Not needed; `spec.md` and existing CLI/packaging capability deltas contain the complete contract.
- `quickstart.md`: Not needed; `README.md` owns installation commands.

## Risks and migrations

- Existing installations remain registered as `thoth-mem@thoth-mem`. Mitigation: do not auto-remove or mutate them; document new clean-install identities and require separately authorized manager migration. Rollback is to restore descriptor/native-manager identifiers before publication.
- A new marketplace name may already exist with different provenance. Mitigation: retain provenance-aware ambiguity detection per host and return `requires-user-action` without mutation.
- Shared setup code could cross-wire host identities. Mitigation: one explicit host identity selection and exact assertions for both hosts in every affected command/state seam.
- `plugin/distribution-lock.json` already contains unrelated user changes. Mitigation: update only the two marketplace descriptor digests after rereading current files and preserve every other entry byte-for-byte.
- SC-003 cannot be honestly observed without stateful real-host installations. Mitigation: verify deterministic topology now and declare both unexecuted operational outcomes as residual RISK rather than performing unauthorized mutations.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The design owns only marketplace/setup/package files and its verification never changes the six-tool registry.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — All acceptance evidence is deterministic local fixture evidence with zero retrieval or optional projection impact.
- **P3 — Harness-Agnostic Memory Contract**: PASS — The design centralizes host-specific distribution identity at `src/setup/native-manager.ts` and proves exact host isolation.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No plan task touches recall selection, delivery, limits, or rendering.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — Both breaking marketplace identifiers, clean-install paths, non-migration boundary, collision handling, and rollback are explicit without legacy aliases.
