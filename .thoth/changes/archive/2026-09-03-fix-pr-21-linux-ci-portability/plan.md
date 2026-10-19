# Implementation Plan: Portable PR Verification

## Technical context

PR #21 runs one Ubuntu job through build, the full Vitest suite, integration verification, packed smoke, and the deterministic fixture benchmark. The first failing run stops in `pnpm test` with 13 failures across five suites. The same focused suites reduce to npm pack-shape failures on the Windows development host, demonstrating that the product behavior is largely intact while its verification seams encode host and tool-version assumptions.

The affected surfaces are `scripts/verify-packed-plugins.mjs`, `tests/packaging/first-product.test.ts`, `tests/integration/public-plugin-runner.test.ts`, `tests/setup/native-managers.test.ts`, and `tests/release-marketplace.test.ts`. A small shared npm helper under `scripts/` will own CLI discovery and pack-envelope validation. Test-only fixture changes will remove the sibling-repository, Windows-path, and ambient-XDG dependencies. No runtime source, dependency, schema, command, package inventory, or public lifecycle envelope changes.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The change touches verification helpers and fixtures only; the exact six-tool MCP registration remains unchanged and is rechecked by packed verification.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — No retrieval or projection code changes; all new fixtures are local, deterministic, and network-free.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Platform-native fixture paths exercise the existing host-neutral identity contract without adding harness-specific core fields or semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — Recall output, budgets, trimming, and metadata are outside the touched surfaces.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The design preserves current package and lifecycle contracts and adds no compatibility shim or legacy fallback.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add one ESM helper that resolves the npm CLI from the executing Node installation across Windows and Unix layouts and parses exactly one recognized package record from either supported top-level JSON envelope. Both the smoke script and inventory test consume the helper. | `scripts/npm-pack.mjs` exports CLI resolution and pack-record parsing; `scripts/verify-packed-plugins.mjs`; `tests/packaging/first-product.test.ts` | Focused helper assertions plus package dry-run and full packed smoke through the existing public seams. |
| FR-002 | Replace hard-coded `C:/fixture` inputs and expectations with a nonexistent absolute path derived beneath each disposable test root. Supply an explicit empty environment to native-manager cases that assert `homeDir/.config`, preventing ambient `XDG_CONFIG_HOME` from redirecting those test-owned files. | `tests/integration/public-plugin-runner.test.ts`; `tests/setup/native-managers.test.ts` | Existing identity-only, recovery, provider-config, journal, and fail-closed assertions run unchanged apart from computed paths and isolated env. |
| FR-003 | Build the minimum valid central marketplace checkout inside each disposable release fixture, including the three descriptors, a second plugin entry, updater, validator, and node:test file required by the publication script. | `tests/release-marketplace.test.ts` | Existing publication, exact changed-path, adjacent-entry preservation, retry, missing-tag, and push-race assertions run with no sibling checkout. |
| FR-004 | Limit edits to verification infrastructure and test fixtures; preserve all production lifecycle/setup/publication implementations and rerun the repository's declared broad gates. | All paths above; no `src/`, product manifest, integration inventory, workflow, or dependency mutation | Focused five-suite reproduction; build; full tests; integration verify/smoke; fixture benchmark; prepublish; diff check. |

## Optional support artifacts

- `research.md`: Not needed; the GitHub job log, local reproduction, CodeGraph call paths, and canonical packaging requirement already isolate the causes and constraints.
- `data-model.md`: Not needed; no schema, persistence, or durable data changes.
- `contracts/`: Not needed; the only durable delta is expressed by the exact existing packaging requirement in `spec.md`.
- `quickstart.md`: Not needed; no operator workflow or new command is introduced.

## Risks and migrations

- npm versions expose at least two `pack --json` top-level shapes. The parser will explicitly accept only one valid record from an array or keyed object and reject empty, multiple, malformed, or missing-field payloads. Rollback is removal of the helper and restoration of the two direct calls.
- npm CLI placement varies. Discovery remains bounded to the active npm execution path and known layouts relative to `process.execPath`; it will fail with an actionable diagnostic instead of invoking an arbitrary binary. Tests cover the active installation, and Ubuntu CI remains the operational outcome check.
- A synthetic marketplace fixture could drift from the separate central repository. It will model only the stable contract consumed by `publishMarketplace` and keep assertions on all owned files, the adjacent plugin, validation, and push behavior. Cross-repository release validation remains the responsibility of the real marketplace release flow.
- Computed fixture paths could accidentally exist. Each path is created beneath a fresh disposable root and intentionally left nonexistent when exercising non-Git identity.
- Explicitly clearing the test environment must not imply changed production precedence. Only the tests that assert `homeDir/.config` receive `{}`; production continues to honor `XDG_CONFIG_HOME`.
- No migration or destructive operation is required. All generated repositories, homes, and tarballs remain inside existing disposable roots and cleanup paths.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — The mapped edits do not register, remove, or rename MCP tools, and broad packed checks retain the exact inventory assertion.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The plan adds only offline deterministic parsing and disposable fixtures; no optional lane becomes load-bearing.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One platform-native fixture strategy is shared across public runner scenarios, while host-specific behavior remains at existing adapter and manager boundaries.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No retrieval response or budget surface is included in ownership; existing full verification protects it from regression.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — The plan changes verification portability without expanding product compatibility or adding fallback runtime paths.
