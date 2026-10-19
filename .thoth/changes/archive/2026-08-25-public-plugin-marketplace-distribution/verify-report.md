# Verification Report: Public plugin marketplace distribution

**Reviewer**: oracle<br>
**Independent from implementer**: Yes<br>
**Verdict**: PASS

## Review dimensions

- **Completeness**: Every FR and buildable SC is implemented and independently evidenced; SC-005 and SC-006 are explicitly retained as outcome risks.
- **Correctness**: Public catalogs, validator-compatible manifests, sealed assets, isolated installed-cache execution, lifecycle hooks, one shared MCP server, and the six-tool registry match the accepted contract.
- **Coherence**: Spec, converged plan, tasks, implementation, tests, package inventory, and public documentation agree.

## Compliance matrix

| Requirement | Implementation evidence | Executed check | Result |
| --- | --- | --- | --- |
| FR-001 | `src/integration/package-inventory.ts`, `package.json`, both repository catalogs | Focused packaging tests; packed file verification; strict host validation | PASS |
| FR-002 | `plugin/runners/public-runner.mjs`, adjacent `plugin/runtime.json` | Receipt-free Codex/Claude runner tests, unrelated CWD/path-with-spaces cases, bounded failure case | PASS |
| FR-003 | `scripts/sync-plugin-distribution.mjs`, `plugin/distribution-lock.json` | Complete stale matrix; Codex plugin-creator validator; disposable Codex manager; both Claude strict validators | PASS |
| FR-004 | `scripts/verify-packed-plugins.mjs`, `tests/setup/public-canary-isolation.test.ts` | Packed installed-cache lifecycle/MCP smoke; canary before/after filesystem trace | PASS |
| FR-005 | Public manifests, hook sources, shared `.mcp.json`, shared v2 Skill | Exact component assertions and `tests/tools/mcp-v2.test.ts` exact six-tool registry | PASS |
| SC-001 `[buildable]` | Exactly two anchors resolve one contained shared root | Catalog, inventory, validator, and isolated manager tests | PASS |
| SC-002 `[buildable]` | Lock covers both anchors and every declared public asset | Synchronized fixture plus stale marketplace, manifest, MCP, hook, Skill, launcher, and runtime fixtures | PASS |
| SC-003 `[buildable]` | Public hashes, sibling sentinel, target trace, receipt runtime | Canary isolation test | PASS |
| SC-004 `[buildable]` | Per-host installed cache copies; unpacked `plugin/` renamed away before execution | Packed lifecycle and MCP initialize for Codex and Claude | PASS |
| SC-005 `[outcome]` | No clean real Codex public-profile enable/restart/recovery run yet | N/A until published-version host certification | RISK |
| SC-006 `[outcome]` | No clean real Claude public-profile enable/new-session/recovery run yet | N/A until published-version host certification | RISK |

## Findings

| ID | Severity | Dimension | Evidence | Remediation anchor |
| --- | --- | --- | --- | --- |
| W-001 | Warning | Coherence | Pre-convergence plan topology named a custom Codex hook/MCP path | Reconciled in `plan.md` before archive to validator-supported default hook discovery and shared `.mcp.json` |
| W-002 | Warning | Maintainability | Windows packed smoke emits Node `DEP0190` for fixed-argument `npm pack` subprocesses | Replace shell invocation with an explicit safe Windows executable path in a future bounded change |

## Executed evidence

- Verification round: fresh Oracle assignment `oracle_public_marketplace_final_verify_r2`.
- Focused convergence lane: 4 files, 15 tests PASS.
- Codex validator/manager lane and public runner lane: PASS.
- `pnpm run build`: PASS.
- `pnpm test`: 24 files, 84 tests PASS.
- `pnpm run integration:verify`: PASS.
- `pnpm run integration:smoke`: PASS, including installed roots isolated from the unpacked npm package.
- `pnpm run prepublishOnly`: PASS, 24 files and 84 tests.
- `claude plugin validate --strict .`: PASS.
- `claude plugin validate --strict plugin`: PASS.
- Installed Codex plugin-creator validator: PASS.
- `git diff --check`: exit 0; line-ending warnings only.
- Task-surface credential scan: no matches; generated `dist/` has no working-tree change.

## Residual risks

- SC-005: Certify a matching published version in a clean real Codex profile, enable only the public plugin, restart Codex, and observe unique recovery.
- SC-006: Certify a matching published version in a clean real Claude profile, enable only the public plugin, start a new session, and observe unique recovery.
- Cold `npx` availability and latency remain operational risks; the runner degrades with bounded neutral output.
- Node `DEP0190` remains a non-failing maintenance warning on the current fixed-argument Windows npm-pack seam.
