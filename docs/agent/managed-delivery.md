# Managed setup, packaging, and release

## Responsibility

Owns bounded harness setup planning/mutation/verification, managed configuration, receipts and rollback, canonical published-asset inventory, asset synchronization, package verification/build composition, and CI/release gates.

## Entry points and ownership

- `src/setup/engine.ts`, `paths.ts`, `managed-config.ts`, `receipt.ts`, `transaction-lock.ts`: setup strategy, scope, ownership, transactions, and recovery.
- `src/setup/harnesses/`, `codex-cli.ts`, `claude-code-cli.ts`: host-specific setup/capability evidence.
- `integrations/inventory.json`: sole executable authority for published native harness assets.
- `scripts/sync-integration-assets.mjs`: explicit mutating synchronization step.
- `scripts/verify-integration-package.mjs`: read-only inventory/containment/package/runtime verification.
- `scripts/build.mjs`, `package.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`: build and publication gates.

## Invariants and hazards

- Public setup covers `opencode`, `codex`, and `claude`; the Claude setup/runtime contract uses `claude`.
- Claude Code product-branded assets and modules retain names such as `claude-code-cli.ts` and `integrations/claude-code/**`.
- Resolve a confined target and choose one immutable strategy before mutation. Plan/no-op paths remain read-only.
- Mutations and rollback are limited to proven ownership. Receipts/checkpoints preserve unrelated and later user edits; ambiguity fails closed or requires operator action.
- External command success alone is not proof of manager ownership or complete setup.
- Inventory, runner copies, manifests, versions, and package file lists must stay consistent. Do not edit generated `dist/`.
- Automated verification is isolated and credential-free. Real host smoke, setup mutation, publication, version bump, and release commands require explicit authorization and disposable controlled environments.
- Do not run `integration:sync` merely to inspect drift; it mutates published assets. Use the read-only verifier for verification tasks.

## Tests and verification

Start in `tests/setup/`, `tests/packaging/`, and their fixtures. Delivery changes commonly require focused suites, `pnpm run integration:verify`, build, and full tests; follow [testing](testing.md). Release workflow evidence uses Node `22.13`, pnpm `11.1.3`, dashboard typecheck, build, tests, retrieval eval, release-note generation, npm publish, and GitHub release creation—do not execute release steps during ordinary verification.

## Escalate context

Load [native lifecycle](native-lifecycle.md) when runtime behavior/assets change, and [surfaces](surfaces.md) when CLI setup contracts or exit behavior change.

Evidence: setup source/tests, `integrations/inventory.json`, scripts, manifests, CI, and release workflow.
