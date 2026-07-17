# Proposal: Rename the Claude Setup Target

## Intent

Make `thoth-mem setup claude` the sole public setup command for Claude Code and
use `claude` consistently as the complete setup-contract identifier. The current
contract exposes and persists `claude-code` across CLI parsing, setup requests,
receipts, dispatch, documentation, and tests, while other runtime and packaging
surfaces already use `claude`. A single setup identifier removes that mismatch
without changing the Claude Code product name or the locations of its packaged
assets.

No existing installations require migration or backward compatibility. The
only known persisted consumers are test fixtures, so `claude-code` can be
removed rather than retained as an alias or legacy receipt value.

## Scope

### In Scope

- Replace the public command target `thoth-mem setup claude-code` with
  `thoth-mem setup claude` in CLI help, parsing, validation errors, eager setup
  dispatch, examples, and operator-facing setup documentation.
- Rename the `SetupHarness` setup-contract value from `claude-code` to `claude`
  throughout request/result typing, setup dispatch and comparisons, target and
  source-path selection, and Claude setup strategy execution.
- Update setup receipt validation and serialization so newly written and valid
  Claude setup receipts carry `harness: 'claude'`; receipts carrying
  `harness: 'claude-code'` become invalid by design.
- Update relevant unit, fixture, and packed-install expectations that consume
  the setup-contract value, including rejection coverage proving that
  `claude-code` is no longer accepted.
- Update the active CLI contract in `openspec/specs/cli/spec.md`, which currently
  requires the old command and old result/receipt harness value, so the durable
  main spec agrees with the renamed public contract. Product-branded references
  in the CLI, harness-integration, and packaging specs remain Claude Code.
- Preserve all existing setup behavior other than the identifier rename,
  including scope, plan-only, force, rollback, ownership, coexistence,
  diagnostics, status/exit-code, and idempotency semantics.

### Deferred / Needs Discovery

None. Discovery must still classify every `claude-code` occurrence by meaning
before editing so setup-contract values change while product and asset identities
remain stable.

### Out of Scope

- Renaming the Claude Code product in prose, diagnostics, test descriptions, or
  upstream CLI/version text such as `claude-code 1.0.0`.
- Renaming product-branded files, modules, imports, symbols, test filenames, or
  directories such as `src/setup/claude-code-cli.ts`,
  `src/setup/harnesses/claude-code.ts`, `tests/setup/claude-code.test.ts`, and
  `integrations/claude-code/**`.
- Renaming unrelated private runtime or integration identity already expressed
  as `claude`, or changing the runtime/inventory contract beyond mappings needed
  from setup harness `claude` to stable Claude Code asset paths.
- Providing a compatibility alias, migration path, or legacy receipt reader for
  the removed setup value `claude-code`.
- Changing Claude Code setup ownership, capability detection, filesystem layout,
  manager commands, plugin identity, or packaged asset contents.

## Approach

| Dimension | From | To | Reason | Impact |
| --- | --- | --- | --- | --- |
| Public setup target | `thoth-mem setup claude-code` | `thoth-mem setup claude` | Establish one concise public identifier aligned with the existing `claude` runtime/inventory identity | Help, parser validation, errors, examples, and packed CLI invocations change; the old target fails validation |
| Setup contract | `SetupHarness` and setup comparisons use `claude-code` | The complete setup request/result/dispatch contract uses `claude` | Avoid translating the public target into a second setup-only identifier | Types, path routing, strategy dispatch, JSON results, fixtures, and assertions change together |
| Receipt contract | Claude setup receipts validate and serialize `claude-code` | Claude setup receipts validate and serialize `claude` | Keep persisted setup evidence identical to the selected setup harness | Old Claude fixture receipts become invalid; other harness receipt behavior is unchanged |
| Product and asset identity | Claude Code branding and `integrations/claude-code/**` paths | Unchanged | These identify the product or physical package layout, not the setup target | Setup path resolution explicitly maps harness `claude` to the stable Claude Code locations |

Implementation should classify occurrences rather than perform a repository-wide
text replacement. Contract-facing branches and fixtures change to `claude`;
product branding, upstream command/version evidence, module paths, and packaged
asset paths remain unchanged. The old CLI target must be rejected before setup
dispatch or mutation, with no hidden fallback.

## Affected Areas

- `src/cli.ts`: public help, setup parsing, accepted-value errors, and eager
  setup dispatch.
- `src/setup/types.ts`, `src/setup/receipt.ts`, `src/setup/paths.ts`, and
  `src/setup/engine.ts`: the shared harness union, receipt boundary, physical
  path mapping, setup/rollback routing, and harness comparisons.
- `src/setup/harnesses/claude-code.ts`: setup request/result values while its
  product-branded module name and Claude manager behavior remain stable.
- `tests/cli.test.ts`, `tests/setup/engine.test.ts`,
  `tests/setup/claude-code.test.ts`, and relevant setup fixtures: focused
  parsing, dispatch, receipt, routing, behavior, and rejection coverage.
- `tests/packaging/packed-install.test.ts` and any directly supporting packed
  setup fixture values: tarball-level invocation, JSON result, rollback, and
  coexistence expectations for the renamed setup target.
- `README.md` and `docs/agent/managed-delivery.md`: public examples and durable
  setup-contract guidance.
- `openspec/specs/cli/spec.md`: active requirements and scenarios that currently
  mandate `setup claude-code` or accept `claude-code` as a setup result value.
  `openspec/specs/packaging/spec.md` and
  `openspec/specs/harness-integration/spec.md` retain Claude Code product
  branding unless a setup-contract value is found.

## Risks

- A mechanical global replacement could rename stable product assets, module
  paths, behavior-evidence identifiers, or upstream version text and break
  packaging/runtime discovery.
- A missed comparison or validator could accept `claude` at the CLI but route it
  through Codex defaults, reject its receipt, or serialize inconsistent JSON.
- Retaining any parser or eager-dispatch acceptance for `claude-code` would
  accidentally create the explicitly rejected compatibility alias.
- The active CLI spec's general legacy-receipt readability language can conflict
  with this deliberate exception unless the Claude setup identifier boundary is
  updated explicitly; existing OpenCode and Codex receipt compatibility must not
  be weakened.
- Packed verification can pass unit-level behavior while still using the old
  command or expected JSON harness value, so tarball-level setup and rollback
  coverage must be updated and retained.

## Rollback Plan

Revert the coordinated setup-contract rename across CLI, setup types and routing,
receipt validation, tests, specifications, and public documentation, restoring
`claude-code` as the sole setup value. Because this change intentionally has no
compatibility or data migration and no existing installations depend on it,
rollback requires no receipt transformation or filesystem migration. Re-run the
same focused and packed verification after the revert to ensure every contract
surface again agrees.

## Success Criteria

- `thoth-mem setup claude` is accepted in normal, plan, JSON, scoped, and
  rollback flows and routes to the existing Claude Code setup strategy and
  physical `.claude`, `.claude-plugin`, and `integrations/claude-code/**` assets.
- `thoth-mem setup claude-code` is rejected as an invalid harness before setup
  dispatch or mutation; no parser, eager dispatch, or compatibility alias accepts
  it.
- `SetupHarness`, setup results, and newly serialized/validated Claude receipts
  use exactly `claude`; receipt validation rejects the removed `claude-code`
  harness value while preserving other harness receipt behavior.
- CLI help, validation errors, README examples, managed-delivery guidance, and
  the active CLI OpenSpec advertise only `opencode`, `codex`, and `claude` as
  setup targets.
- Focused CLI and setup tests cover acceptance of `claude`, rejection of
  `claude-code`, dispatch/path correctness, receipt round trips, and unchanged
  Claude ownership/rollback behavior.
- Packed-install verification invokes `setup claude`, observes
  `harness: 'claude'`, and continues to prove coexistence, mutation, rollback,
  unavailable-capability, and stable asset resolution behavior.
- Remaining `claude-code` text is limited to intentional Claude Code product
  branding, product-branded module/test/asset paths, runtime evidence identifiers,
  or upstream CLI/version text; no remaining occurrence represents the public or
  persisted setup-contract value.
