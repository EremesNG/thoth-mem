# Implementation Plan: Automate Marketplace Release Publication

## Technical context

The existing tag-triggered workflow in `.github/workflows/release.yml` installs,
verifies, builds, smoke-tests, benchmarks, publishes npm, and creates the GitHub
release, but never invokes `scripts/publish-marketplace.mjs`. The local
semantic-version scripts in `package.json` currently push the tag and immediately
invoke that publisher. Adding CI publication without removing that tail would
create two competing automatic publishers and keep releases dependent on a
maintainer's local cross-repository credentials.

The archived `thoth-agents` change
`openspec/changes/archive/2026-09-03-automate-marketplace-release` supplies the
approved reference contract. This repository has the same publisher safety
boundary: remote tag verification, a fresh `thoth-plugins/main` clone, central
validation, exactly three owned catalog paths, already-current success, and a
normal non-force push. The implementation will compose that existing publisher
with an ephemeral GitHub App installation token instead of duplicating catalog
logic.

Implementation ownership remains with Root because the workflow, manifest
scripts, contract test, and routed documentation form one short ordered behavior
change whose context is already loaded. Root owns `.github/workflows/release.yml`,
`package.json`, `tests/release-marketplace.test.ts`, `docs/agent/testing.md`, and
`docs/agent/native-lifecycle.md`, while preserving the uncommitted PR-portability
change already present in the worktree. A fresh read-only Oracle will own final
verification.

## Constitution Check (pre-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Release orchestration changes no MCP registration or six-tool contract.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The design does not touch retrieval, SQLite, projections, or offline operation.
- **P3 — Harness-Agnostic Memory Contract**: PASS — Marketplace release automation is repository packaging behavior and does not alter host adapters or memory semantics.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — No recall response, selection, or budget changes are in scope.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — Workflow, package-script, recovery, and credential boundaries are explicit and testable; no compatibility shim or hidden fallback is introduced.

## Design

### Requirement mapping

| Requirement | Technical decision | Files/interfaces | Verification seam |
| --- | --- | --- | --- |
| FR-001 | Add App-token creation and marketplace publication steps after the existing GitHub release command so any failed package or release step prevents the cross-repository push. | `.github/workflows/release.yml`; `pnpm run release:marketplace` | A workflow contract test reads the workflow and verifies step order and the publisher command. |
| FR-002 | Remove the marketplace tail from `release:patch`, `release:minor`, and `release:major`; retain the standalone manual retry command unchanged. | `package.json`; package-script interface | The package-script contract fails first against the current manifest, then proves one automatic publisher plus manual recovery. |
| FR-003 | Use `actions/create-github-app-token@v3` with both configured Actions secrets, `owner: ${{ github.repository_owner }}`, only `repositories: thoth-plugins`, and only `permission-contents: write`; expose its output as `GH_TOKEN` solely to the step that configures Git credentials and runs the publisher. | `.github/workflows/release.yml`; `THOTH_RELEASE_APP_CLIENT_ID`; `THOTH_RELEASE_APP_PRIVATE_KEY`; Git credential helper | The workflow contract verifies exact secret references, owner/repository/permission scope, token flow, ordering, and absence of a broader marketplace credential fallback. |

### Execution and sequencing

1. Extend `tests/release-marketplace.test.ts` with workflow and single-publisher
   contract assertions, then run the focused suite to record the expected red
   state.
2. Update `package.json` and `.github/workflows/release.yml` minimally until the
   focused contracts pass.
3. Update `docs/agent/testing.md` and `docs/agent/native-lifecycle.md` so release
   ownership, buildable verification, credential failure, and manual recovery
   match the executable contract.
4. Apply the simplify review only to this change, then run focused marketplace
   tests, workflow validation when available, the repository-required broad
   checks, diff/secret hygiene, and fresh Oracle verification.

### Verification strategy

- TDD seam: `tests/release-marketplace.test.ts` owns the public package-script,
  workflow ordering, least-privilege credential, and publisher integration
  contracts.
- Focused red/green: `pnpm exec vitest run tests/release-marketplace.test.ts
  --config vitest.config.ts`.
- Workflow syntax: run `actionlint .github/workflows/release.yml` when
  `actionlint` is available; otherwise retain the repository contract test and
  exact static inspection as reported evidence.
- Repository verification: `pnpm run build`, `pnpm test`,
  `pnpm run integration:verify`, `pnpm run integration:smoke`,
  `pnpm run benchmark:fixture`, `pnpm run prepublishOnly`, and
  `git diff --check`.
- Security review: inspect the final diff for secret values, unintended
  repositories or permissions, fallback credentials, force-push behavior,
  generated output, and unrelated worktree changes.

## Optional support artifacts

- `research.md`: not needed; the archived approved implementation supplies the selected GitHub App action contract.
- `data-model.md`: not needed; no application or persisted data changes.
- `contracts/`: not needed; the workflow, package scripts, and repository test are the executable contracts.
- `quickstart.md`: not needed; existing routed release documentation will describe automatic publication and recovery.

## Risks and migrations

- A missing App installation, insufficient `Contents: write`, malformed secret,
  or incorrectly stored private key will fail after npm and GitHub release
  publication. The release job must expose that failure, retain the idempotent
  `release:marketplace` recovery command, and never fall back to
  `GITHUB_TOKEN` or a broader credential.
- If `thoth-plugins/main` advances between clone and push, the existing
  publisher rejects the non-fast-forward push. Preserve the explicit retry
  contract rather than force-pushing or adding hidden retries.
- The Client ID is not confidential, but consuming both configured values
  through `secrets.*` matches the user's GitHub configuration and prevents the
  private key from entering repository variables or files.
- The live cross-repository write cannot be exercised safely during local
  verification. SC-004 remains outcome evidence for the next real release;
  static workflow contracts and disposable Git integration provide buildable
  evidence beforehand.
- Rollback is a normal revert of the workflow and package-script edits. No data
  migration is required, and any already-published marketplace commit remains a
  valid version update.

## Constitution Check (post-design)

- **P1 — Compact, Workflow-Level MCP Surface**: PASS — Every technical decision stays outside the MCP registry and preserves the exact six-tool surface.
- **P2 — Deterministic Core With Rebuildable Optional Projections**: PASS — The plan changes only release composition and leaves deterministic storage/retrieval untouched.
- **P3 — Harness-Agnostic Memory Contract**: PASS — One existing host-neutral package artifact and publisher remain authoritative across all integrations.
- **P4 — Token-Efficient, Bounded Recall Outputs**: PASS — The completed design introduces no retrieval or rendering branch.
- **P5 — Explicit Product Boundaries Over Legacy Compatibility**: PASS — CI becomes the sole automatic publisher, manual retry remains explicit, and credential scope/failure behavior is directly asserted without fallback paths.
