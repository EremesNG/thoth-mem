# Implementation Plan: Forced Codex version override

## Technical context

Codex setup currently parses `SetupRequest.force` at the public CLI boundary, but `inspectCodexCli` receives no force context. Strategy selection therefore requires `version.classification === 'tested'` even when the selected scope exposes complete mutation and independent verification grammar and manager state is exact. On Codex `0.146.0`, this produces `strategy=null` and `requires_user_action` despite compatible marketplace and plugin state.

The change is limited to the managed setup route. It will propagate the existing force bit into each Codex CLI inspection, allow that bit to bypass only the tested-version predicate, attach one safe diagnostic when the bypass actually selects `plugin_manager`, preserve the diagnostic through mutating execution, and make configuration-backup output conditional on an actual legacy filesystem mutation. No persistence schema, receipt schema, command grammar, manager identity, cleanup authority, or plugin asset changes are required.

Repository constraints include strict TypeScript/Node16 ESM, explicit `.js` relative imports, isolated controlled setup tests, no direct real-home mutation during verification, and preservation of the user's unrelated `package.json` modification.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the change touches only setup CLI internals and adds no MCP tools or registrations.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — retrieval, embeddings, and degradation behavior are outside the affected route.
- **P3 — Harness-Agnostic Memory Contract**: PASS — the force override remains at the Codex adapter/setup boundary and does not change memory storage or lifecycle semantics; unsupported capabilities remain explicit.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — recall output and limits are unchanged.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — the existing `--force` option and setup result schema remain stable; its Codex-specific behavior is expanded additively and documented.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add optional `force` context to `InspectCodexCliOptions`; pass `request.force` from every engine inspection and treat it as an override only for the tested-version predicate. | `src/setup/codex-cli.ts`, `src/setup/engine.ts` | Direct inspector tests for forced `0.146.x`, `0.147.x`, and unknown classification; engine test for request propagation. |
| FR-002 | Change strategy selection to require `(testedVersion || forcedVersionOverride) && completeCapabilities` after manager state is classifiable; keep the selected strategy immutable during execution and final reread. | `src/setup/codex-cli.ts`, `src/setup/engine.ts` | Controlled absent, partial, and compatible manager-state setup tests, including final reinspection paths. |
| FR-003 | Default the inspector force context to false and retain the existing unforced selector branches verbatim. | `src/setup/codex-cli.ts` | Paired forced/unforced `0.146.x` and `0.147.x` plan assertions plus existing untested-version regressions. |
| FR-004 | Add one sanitized diagnostic only when force changes an untested/unknown version into a `plugin_manager` selection; initialize execution diagnostics from plan diagnostics so mutating and no-op results agree. Update CLI help and README semantics. | `src/setup/codex-cli.ts`, `src/cli.ts`, `README.md` | Inspector, engine, and CLI rendering assertions for exactly one warning, no warning on tested `0.144.x`, and no warning when force cannot select modern ownership. |
| FR-005 | Leave grammar discovery, exact state parsers, scope handling, collision classification, checkpoints, reconciliation, and cleanup ownership untouched; add regression cases demonstrating force cannot bypass them. | `src/setup/codex-cli.ts`, `tests/setup/codex-cli.test.ts` | Forced incomplete-capability, malformed/conflicting state, and existing orphan/legacy ambiguity tests with zero unauthorized mutation. |
| FR-006 | Pass an explicit `needsFileChanges` decision into setup diagnostics and emit the backup message only for a selected legacy filesystem mutation against an existing config file. | `src/setup/engine.ts` | Modern forced no-op assertion omits the message; controlled legacy existing-config assertion retains exactly one message. |
| FR-007 | Extend controlled executors only; do not run mutating smoke against the real Codex home. Use `0.146.x` and `0.147.x` fixtures for forced and unforced behavior. | `tests/setup/codex-cli.test.ts`, `tests/cli.test.ts` | Focused Vitest suite, setup domain suite, typecheck/build, full tests, and read-only packaging verification as required by the setup route. |

### Component and interface changes

- `InspectCodexCliOptions.force?: boolean` is an internal, default-false adapter input. It does not change `SetupRequest`, which already has `force: boolean`.
- `selectCodexStrategy` receives the derived version-override boolean. Its manager-state early return and complete-capability predicate remain authoritative.
- `CodexCliPlan.diagnostics` carries the forced-version warning. `executeCodexCli` begins with those plan diagnostics so results remain consistent after mutation.
- The warning uses only the parsed semantic version when available; unknown classification uses a fixed message and never echoes raw version output.
- `planDiagnostics` receives whether the chosen strategy actually needs filesystem changes; the existing OpenCode and legacy Codex backup behavior remains intact.
- All three production inspections—prior no-op check, main planning, and migration final reread—receive the same immutable request force value.

### Test-first sequence

1. Add failing inspector tests for forced `0.146.x` and `0.147.x` in absent and compatible states, plus paired unforced expectations.
2. Add failing safety tests proving force does not overcome incomplete capabilities or unclassifiable/conflicting state.
3. Add failing engine tests for the exact user-visible result: `complete`, `changed=false`, confirmed manager state, exactly one warning, no manual action, and no irrelevant backup diagnostic.
4. Add a failing mutating-path test proving the warning survives `executeCodexCli` and final setup rendering.
5. Add or update CLI help/rendering assertions and the README contract.
6. Implement the smallest source changes needed to make those tests pass, then simplify without changing behavior.

## Optional support artifacts

- `research.md`: Not needed; the current `0.146.0` CLI was already inspected read-only and the requested `0.147.x` contract can be represented by the existing controlled executor.
- `data-model.md`: Not needed; no data or receipt schema changes.
- `contracts/`: Not needed; the existing setup result schema and CLI option remain unchanged.
- `quickstart.md`: Not needed; README and CLI help are the durable operator-facing surfaces.

## Risks and migrations

- Broadening `--force` could accidentally be interpreted as ownership authority. Mitigation: isolate it to the version predicate and retain all manager-state, capability, containment, receipt, and cleanup gates; regression-test the existing ambiguous residue cases.
- A warning could be lost on mutating setup because execution currently starts with an empty diagnostic list. Mitigation: copy plan diagnostics once at execution start and assert exactly-one rendering.
- Force context could be lost during no-op detection or migration final reread. Mitigation: pass the same request value to all production `inspectCodexCli` calls and cover compatible and mutating flows.
- Making the backup diagnostic conditional could suppress a real legacy warning. Mitigation: derive it from the already-computed strategy-specific `needsFileChanges` value and retain an explicit legacy existing-config test.
- There is no schema or persistent-state migration. Rollback is a source revert of the inspector option, selector predicate, warning propagation, diagnostic condition, tests, and documentation; existing installations and receipts remain readable.
- Real Codex `0.147.x` mutation is not authorized or required. Verification uses controlled execution; any real-host smoke remains a separately authorized operation against a disposable home.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — the design changes no MCP registration and keeps setup on the CLI/adapter surface.
- **P2 — Deterministic-First Retrieval With Safe Degradation**: PASS — no retrieval path, model dependency, or degradation contract is affected.
- **P3 — Harness-Agnostic Memory Contract**: PASS — all new behavior is confined to Codex capability detection; force cannot simulate unavailable capability success and no native field enters core memory semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — recall stages, trimming, and telemetry are untouched.
- **P5 — Stable Public Contract With Explicit Deprecation Discipline**: PASS — `--force` and the result schema are retained, human/JSON diagnostics stay aligned, and the additive behavior is documented without rename or removal.
