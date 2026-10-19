# Change: tool-schema-compaction

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: low
**Risk**: medium

## Exploration

- Handoff `thoth-mem/tool-schema-compaction` (thoth-agents project) asked to shrink thoth-mem's model-facing Pi tool definitions without losing capabilities, locked by a size-budget test like thoth-agents' `compact-pi-tool-schemas` (aggregate `JSON.stringify({name, description, parameters, promptSnippet, promptGuidelines}).length` per package, names asserted, ~5% headroom).
- Baseline at HEAD 370aaf6: Pi registration 20,390 chars (mem_save 8,782; mem_session 4,481; mem_project 3,703; mem_recall 1,649; mem_context 1,077; mem_get 698); MCP `tools/list` projected {name, description, inputSchema} 19,561 chars; server instructions 672. Pi and MCP schemas are deeply equal and both carry the draft-07 `$schema` marker.
- Descriptions and zod `.describe()` texts in `src/tools/index.ts` are shared by MCP hosts and Pi (`TOOL_DESCRIPTIONS` :52-70, field texts :74-220, `publicInputSchema` :383-391, MCP registration :362-375). Largest texts: mem_save description 1,115; mem_project description 599 duplicated verbatim as `action.description` (:69, :209); mem_session description 482; session summary field 364; project `project_key` variant 303; temporal 224; save `root_session_key` 197; shared `project_key` 189 x4; `project_name` 156 x2.
- Runtime acceptance is independent of description text: MCP validates with its own zod shapes and handlers (`src/tools/index.ts:226-238,303,334-358`), Pi forwards params unchanged (`src/integration/pi/index.ts:109-111`, `mcp-client.ts:54,127-132`). Some descriptions carry behavioral guidance not enforced by schemas (verified identity provenance, non-derived project_key, memory prose format, proactive timing, root-only lifecycle intent) and must be compressed, not dropped.
- Pi hooks call `mem_session` through the extension's own MCP client for every lifecycle operation (enroll, recover, capture, checkpoint, guide with compaction text, finalize), and summaries are now derived automatically (change `session-summaries`), so the model-facing Pi `mem_session` is unused.
- Pins: `tests/tools/mcp.test.ts:14-118` (exact instructions, <=699, shared descriptions <=2,990, proactive phrases, schema substrings, six names), `tests/integration.test.ts:18-36`, `tests/integration/pi-native-plugin.test.ts:18-70` (Pi names/parameters equal catalog, exact snippets/guidelines), `tests/packaging/first-product.test.ts:126-161`, `tests/integration/public-plugin-package.test.ts:116`, `scripts/verify-packed-plugins.mjs:315`; Skill line "Use only the six memory tools — MCP tools on most hosts, native tools in Pi" (canonical and copies :12-13); `docs/agent/native-lifecycle.md:22,144`, `docs/agent/surfaces.md:3`.
- thoth-agents prompts do not reference thoth-mem parameter names or `mem_session`; only provider Skill guidance does.

## Intent

Model-facing thoth-mem tool definitions become compact on every host while keeping every capability: each constraint is stated once and briefly, duplicated texts and the `$schema` marker disappear from what Pi registers, Pi no longer shows the hook-only `mem_session` tool to its model, and aggregate size budgets on both the Pi and MCP surfaces lock the result.

## Non-goals

- No change to zod input shapes, enums, required fields, branches, limits, handler behavior, or the six-tool MCP registry.
- Server instructions (`MEMORY_INSTRUCTION_SENTENCES`), Pi snippets, and Pi guideline texts stay unchanged.
- No change to thoth-agents or other repositories; no tool renames.
- No change to lifecycle hooks or session-summary behavior.

## Acceptance

- AC-1: Shared tool and field descriptions are compacted: every operational constraint (verbatim verified `project_key`, paired `root_session_key`/`harness`, exactly one `mem_save` branch, root-only lifecycle, labeled memory prose and handoff formats, proactive recall/save triggers) is stated once in compact form, no tool description is repeated inside a field description, and the input schemas are structurally identical to HEAD 370aaf6 apart from description text (same properties, types, enums, required fields, branches, and limits); runtime validation is unchanged.
- AC-2: Pi registers exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, and `mem_project` with the catalog definitions minus the `$schema` marker and unchanged snippets/guidelines; Pi lifecycle hooks still dispatch every `mem_session` operation.
- AC-3: Budget tests lock both surfaces: Pi aggregate serialized definitions (names asserted) and MCP `tools/list` projected definitions (names asserted), each pinned at the achieved size plus about 5% headroom, with achieved Pi <= 12,500 chars (baseline 20,390) and MCP <= 16,000 chars (baseline 19,561); the shared-description budget is tightened to the achieved size plus headroom.
- AC-4: Skills (canonical and synced copies), docs, packed-smoke expectations, and packaging tests reflect Pi's five model-facing tools; `pnpm run build`, focused suites, `pnpm run integration:verify`, and `pnpm exec tsc --noEmit -p .` pass apart from the known environmental failures.

## Clarifications

- RESOLVED: Scope is the shared catalog (Pi and all MCP hosts benefit), chosen by the user.
- RESOLVED: `mem_session` is hidden from the Pi model, chosen by the user after confirming hook coverage and automatic summaries.

## Decisions

- Compaction edits only tool description strings and zod `.describe()` texts; zod shapes are untouched, so MCP acceptance cannot change. The pinned proactive trigger sentences in the recall and save descriptions stay verbatim; other description pins in tests are updated deliberately to the new compact texts.
- `$schema` is stripped where thoth-mem builds the public JSON schema registered in Pi; the MCP SDK-generated schema keeps whatever the SDK emits unless a supported SDK option removes it without structural change.
- Pi filters `mem_session` at registration only; `MEMORY_TOOL_CATALOG` and the MCP registry keep six tools.
- Budgets count `JSON.stringify(...).length` characters per surface in aggregate, following the thoth-agents precedent; raising a budget requires a deliberate definition change.
- Structural equivalence is evidenced by comparing HEAD 370aaf6 and new schemas with all `description` keys (and `$schema` for Pi) removed.
- The full project_key provenance rule appears only on `mem_save`; other tools use the short "Verified project_key, copied verbatim; never derived." The MCP SDK emits its own `$schema` and offers no supported omission option, so MCP keeps it.
- Work runs sequentially in one worktree; MODIFIED deltas collapse migrated multi-scenario requirements to one statement and scenario, folding retained behavior into the statements.

## Durable deltas

- `MODIFIED tools` **MCP Surface MUST Be Compact and Workflow-Level** — The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, MUST publish concise server instructions that balance progressive recall with deliberate durable save/handoff behavior, and MUST publish a distinct action-oriented description for each tool; tool and field descriptions MUST state each operational constraint once in compact form without repeating a tool description inside a field description, the catalog schemas registered natively in Pi MUST omit the `$schema` marker, and the aggregate serialized size of the model-facing definitions on the MCP and Pi surfaces MUST be locked by budget tests so it grows only through a deliberate definition change, all without changing input schema structure or runtime semantics.
  - GIVEN the compacted catalog; WHEN an MCP client lists tools and a Pi session registers its tools; THEN each surface stays within its pinned aggregate budget, every property, type, enum, required field, branch, and limit of the previous schemas is retained, and runtime validation is unchanged.
- `MODIFIED harness-integration` **Every Native Plugin MUST Bundle Hooks, MCP, and Skills** — Every supported host bundle, including Pi, MUST package its supported lifecycle hooks, one registration path for the shared memory tool surface, and the same canonical memory Skill without stale copied contracts; MCP hosts expose the exact six-tool surface, while Pi MUST expose `mem_save`, `mem_recall`, `mem_context`, `mem_get`, and `mem_project` through its native extension API with the shared definitions and MUST NOT expose `mem_session` to the model because its extension hooks perform every root lifecycle operation through the extension's own MCP client; Pi MUST delegate execution to the existing MCP server rather than requiring a community MCP adapter or importing the SQLite runtime into the Pi process.
  - GIVEN the native Pi package is loaded; WHEN Pi enumerates extension tools and later runs its session lifecycle hooks; THEN it sees exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, and `mem_project` with the shared compact definitions, and the hooks still enroll, recover, capture, checkpoint, guide, and finalize through `mem_session`.
- `MODIFIED harness-integration` **Native Failures MUST Degrade Without Blocking the Host Prompt** — Child launch, timeout, nonzero exit, protocol failure, oversized output, invalid envelope, tool bridge failure, or unverifiable identity in any native adapter, including Pi, MUST produce bounded safe diagnostics, inject no unverified memory, and MUST NOT reject an otherwise valid host prompt; Pi tool calls MUST cross the package-relative Node boundary to the existing MCP server with the same storage, identity, privacy, validation, and error semantics as direct MCP use; the Pi extension MUST NOT open SQLite directly, and concurrent MCP/lifecycle cold start MUST preserve the database bootstrap safety contract.
  - GIVEN the thoth-mem child cannot start, times out, exits nonzero, or returns an invalid or oversized envelope; WHEN a Pi prompt or lifecycle hook continues; THEN no unverified memory is injected, the prompt is not rejected, and only a bounded diagnostic is emitted.

## Plan

Two sequential `thoth-worker` units in this worktree, test-first (installed `tdd`) with a closing `simplify` pass; root accepts each before the next.

1. **Catalog compaction, Pi registration, budgets (AC-1, AC-2, AC-3)** — `src/tools/index.ts` (tool descriptions, field `.describe()` texts, `publicInputSchema` `$schema` removal, mem_project `action` description de-duplication) and `src/integration/pi/index.ts` (register five tools; hooks untouched). New budget tests: Pi in `tests/integration/pi-tool-budget.test.ts` (fake client, captured `registerTool` args) and MCP in `tests/tools/tool-budget.test.ts` (in-memory client `listTools`). Update description pins in `tests/tools/mcp.test.ts`, `tests/integration.test.ts`, `tests/integration/pi-native-plugin.test.ts` (Pi parameters equal catalog minus `$schema`; five names; mem_session still used by hooks). Evidence: before/after structural comparison with descriptions removed against HEAD 370aaf6.
2. **Docs, Skills, packaging (AC-4)** — canonical `plugin/skills/thoth-mem/SKILL.md` (six-tool sentence becomes five native tools in Pi with `mem_session` hook-only) then `node scripts/sync-plugin-distribution.mjs` and lock; `integrations/pi/skills/thoth-mem/references/pi.md` if it implies model access to `mem_session`; `docs/agent/native-lifecycle.md:22,144`, `docs/agent/surfaces.md:3`; `scripts/verify-packed-plugins.mjs:315`; `tests/packaging/first-product.test.ts`, `tests/integration/public-plugin-package.test.ts`; broad checks.

Verification seams: `tests/tools/**` and `tests/memory-core/**` with `--config vitest.unit.config.ts`; `tests/integration/**`, `tests/setup/**`, `tests/packaging/**`, and `tests/integration.test.ts` with `--config vitest.integration.config.ts`; `pnpm run build` before dist-consuming tests; `pnpm run integration:verify`; `pnpm exec tsc --noEmit -p .`. Known environmental failures: retrieval/benchmark CRLF hashes, missing adjacent `npm-cli.js` (packed smoke/packaging), native-opencode checkout-name test. Final verification by a fresh independent Oracle.

Risks: over-compaction can weaken model behavior (keep each constraint once, keep proactive triggers verbatim); description pins and budgets must be updated together; hidden Pi `mem_session` must not break hook dispatch (hooks use the client, not registration); Pi custom-prompt mode drops guidelines, so descriptions keep the trigger sentences; budget numbers are chars, not provider tokens.

## Tasks

- [x] AC-1: Compact shared tool and field descriptions with unchanged schema structure
  - Outcome: compact descriptions in the shared catalog with structural equivalence evidence
  - Known entrypoints and skill paths: `src/tools/index.ts` (:52-70, :74-220, :362-391); installed `tdd` and `simplify` skills
  - Inputs: this record's Exploration, Decisions, and baseline numbers
  - Dependencies: none
  - Output: edited descriptions, updated description pins, structural comparison evidence
  - Owner: thoth-worker
  - Writes: `src/tools/index.ts`, `tests/tools/**`, `tests/integration.test.ts`
  - Interface boundaries: zod shapes, handlers, server instructions, and Pi snippets/guidelines unchanged
  - Focused check and PASS evidence: `pnpm exec vitest run tests/tools --config vitest.unit.config.ts` and `pnpm exec vitest run tests/integration.test.ts --config vitest.integration.config.ts` pass; structural comparison with descriptions removed shows no difference from HEAD 370aaf6
  - Return milestone: compacted catalog with green tool tests
  - Stop / reassessment: a constraint cannot be compacted without a schema change
- [x] AC-2: Pi registers five tools without `$schema`
  - Outcome: Pi registration omits `mem_session` and the `$schema` marker; hooks unchanged
  - Known entrypoints and skill paths: `src/integration/pi/index.ts` (:93-121), `src/tools/index.ts` `publicInputSchema`
  - Inputs: AC-1 unit output (same worker unit)
  - Dependencies: none beyond the same unit
  - Output: registration change and Pi tests
  - Owner: thoth-worker
  - Writes: `src/integration/pi/index.ts`, `src/tools/index.ts`, `tests/integration/pi-native-plugin.test.ts`
  - Interface boundaries: Pi lifecycle dispatch through the MCP client unchanged
  - Focused check and PASS evidence: `pnpm exec vitest run tests/integration/pi-native-plugin.test.ts tests/integration/pi-lifecycle.test.ts --config vitest.integration.config.ts` pass with five names and hook dispatch to `mem_session`
  - Return milestone: with AC-1
  - Stop / reassessment: Pi requires `$schema` or registration-time tool filtering breaks hooks
- [x] AC-3: Aggregate budget tests for Pi and MCP
  - Outcome: budget tests pin both surfaces within the AC-3 targets
  - Known entrypoints and skill paths: thoth-agents pattern `C:\DEV\Proyectos\Webstorm\thoth-agents\pi-packages\pi-todo\tool\tool-budget.test.ts`
  - Inputs: AC-1/AC-2 output (same worker unit)
  - Dependencies: none beyond the same unit
  - Output: `tests/integration/pi-tool-budget.test.ts`, `tests/tools/tool-budget.test.ts`, tightened shared-description budget
  - Owner: thoth-worker
  - Writes: those test files and `tests/tools/mcp.test.ts`
  - Interface boundaries: none
  - Focused check and PASS evidence: both budget tests pass; reported achieved sizes Pi <= 12,500 and MCP <= 16,000
  - Return milestone: with AC-1
  - Stop / reassessment: targets unreachable without schema changes
- [x] AC-4: Skills, docs, packaging, and broad checks for five Pi tools
  - Outcome: guidance and packaging match Pi's five model-facing tools and broad checks pass
  - Known entrypoints and skill paths: `plugin/skills/thoth-mem/SKILL.md`, `integrations/pi/skills/thoth-mem/references/pi.md`, `docs/agent/{native-lifecycle,surfaces}.md`, `scripts/verify-packed-plugins.mjs`, `scripts/sync-plugin-distribution.mjs`
  - Inputs: accepted AC-1..AC-3 unit output
  - Dependencies: AC-1..AC-3 unit accepted
  - Output: updated Skill and synced copies, lock, docs, smoke script, packaging tests, broad check results
  - Owner: thoth-worker
  - Writes: `plugin/skills/**`, `integrations/*/skills/**`, `plugin/distribution-lock.json`, `docs/agent/**`, `scripts/verify-packed-plugins.mjs`, `tests/packaging/**`, `tests/integration/public-plugin-package.test.ts`
  - Interface boundaries: canonical `.thoth/specs` change only at archive
  - Focused check and PASS evidence: `pnpm run build`, `pnpm exec vitest run tests/integration tests/setup tests/packaging tests/integration.test.ts --config vitest.integration.config.ts`, `pnpm exec vitest run tests/tools tests/memory-core --config vitest.unit.config.ts`, `pnpm run integration:verify`, `pnpm exec tsc --noEmit -p .` pass apart from known environmental failures
  - Return milestone: broad checks reported
  - Stop / reassessment: a pinned Skill phrase conflicts with the five-tool wording

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 1 (fresh Oracle): OKAY, envelope validated with validate-result.mjs --review-kind plan-review. Nonblocking cautions: make the MCP/catalog equality assertion (tests/tools/mcp.test.ts:39) dialect-marker aware while keeping structural coverage; keep semantic pins alongside budgets; clarify docs/agent/testing.md:109 six-tool wording as MCP-only. Implementation authorized by the user in the same question round.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 5dcd9ef55baed600c6f5a7ef5438c16d10c980b1b9e0c2a42f3140da66c7d3eb

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS: actual diff satisfies AC-1..AC-4, Decisions, and all three MODIFIED deltas. Only declared environmental test failures remain.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/tool-schema-compaction/tool-schema-compaction.md",
      "claim": "Independently recomputed record-prefix SHA-256 matches the expected digest; verify validator passes and both canonical spec digests match.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "structural-comparison",
      "locator": "src/tools/index.ts versus HEAD 370aaf6",
      "claim": "Independently loaded baseline and current catalogs and MCP tools/list schemas: all six structures match after stripping descriptions/dialect markers. AST comparison proves runtime code unchanged except description metadata and public-schema dialect omission.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "behavioral-contract",
      "locator": "src/tools/index.ts; src/integration/pi/index.ts; tests/tools/mcp.test.ts; tests/integration/pi-native-plugin.test.ts",
      "claim": "Compact guidance retains identity provenance, session pairing, save branches/prerequisites, labeled formats, topic closure, root lifecycle/summary restrictions, and project action/cursor rules. Pinned proactive sentences, server instructions, Pi snippets/guidelines remain unchanged. Five Pi tools omit $schema; hooks dispatch all six lifecycle operations through mem_session.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "budget-measurement",
      "locator": "tests/integration/pi-tool-budget.test.ts; tests/tools/tool-budget.test.ts; tests/tools/mcp.test.ts",
      "claim": "Independent measurements: Pi 11,895/12,490; MCP 14,457/15,180; shared descriptions 1,574/1,653 characters. Tests assert exact names and required projections; ceilings provide approximately 5% headroom.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "distribution-consistency",
      "locator": "plugin/; integrations/; docs/agent/; scripts/verify-packed-plugins.mjs; packaging tests",
      "claim": "Canonical and copied Skills, documentation, lock, smoke expectations, and packaging assertions consistently distinguish six MCP tools from five Pi tools. MCP six-tool enumeration is unchanged. Build, integration:verify, tsc, and git diff --check pass.",
      "basis": "observed",
      "uncertainty": "Packed end-to-end execution encounters the declared missing adjacent npm-cli.js."
    },
    {
      "id": "E6",
      "kind": "unit-execution",
      "locator": "pnpm exec vitest run tests/tools tests/memory-core --config vitest.unit.config.ts",
      "claim": "261 passed; one declared retrieval fixture hash failure. Read-only LF normalization reproduces the expected hash; fixture is unchanged from HEAD.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "integration-execution",
      "locator": "pnpm exec vitest run tests/integration tests/setup tests/packaging tests/integration.test.ts --config vitest.integration.config.ts",
      "claim": "216 passed, one skipped, five failed: four missing-adjacent-npm-cli packaging/smoke failures and the declared OpenCode checkout-name failure. No additional failures.",
      "basis": "observed",
      "uncertainty": "OpenCode clean-HEAD reproduction supplied by root; relevant setup implementation and test are unchanged."
    },
    {
      "id": "E8",
      "kind": "freshness",
      "locator": "working-tree inputs",
      "claim": "The 21 changed/untracked inputs retained identical combined fingerprint d8011c4119cda6efcfd284260296cc58cc10b784798993a10bb7f9ef09a8f5cd through verification; record digest was rechecked.",
      "basis": "observed",
      "uncertainty": ""
    }
  ],
  "verification": [
    {
      "check": "Record and canonical baseline binding",
      "method": "Bundled verify validator and independent byte hashing",
      "outcome": "pass",
      "evidenceIds": ["E1", "E8"],
      "reason": "Valid record, matching sources, stable reviewed inputs."
    },
    {
      "check": "AC-1: structure, guidance, runtime preservation",
      "method": "Independent schema dumps, AST normalization, diff review, semantic contract tests",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E6"],
      "reason": "No schema acceptance or runtime changes; operational guidance retained."
    },
    {
      "check": "AC-2: Pi registration and lifecycle",
      "method": "Captured registrations, AST comparison, lifecycle tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E7"],
      "reason": "Exactly five marker-free tools; hook-only mem_session dispatch preserved."
    },
    {
      "check": "AC-3: aggregate budgets",
      "method": "Independent serialization measurements and budget tests",
      "outcome": "pass",
      "evidenceIds": ["E4"],
      "reason": "Both targets met with approximately 5% pinned headroom."
    },
    {
      "check": "Unit suite",
      "method": "Requested terminating Vitest command",
      "outcome": "fail",
      "evidenceIds": ["E6"],
      "reason": "Only the expressly allowed pre-existing CRLF fixture hash failure."
    },
    {
      "check": "Integration/setup/packaging suite",
      "method": "Requested terminating Vitest command",
      "outcome": "fail",
      "evidenceIds": ["E7"],
      "reason": "Only the expressly allowed npm-cli and OpenCode environmental failures."
    },
    {
      "check": "AC-4 and three durable deltas",
      "method": "Distribution/diff review, build, integration:verify, tsc, diff hygiene, broad-suite classification",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E5", "E6", "E7", "E8"],
      "reason": "Contracts satisfied under AC-4's explicit environmental exceptions; no new failures."
    }
  ],
  "risks": [
    {
      "description": "Packed end-to-end smoke remains unverified beyond its npm-cli prerequisite; declared CRLF and checkout-name failures also prevent fully green broad suites.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E5", "E6", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this envelope, record accepted verification evidence, and run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/tool-schema-compaction/tool-schema-compaction.md",
    "reviewedRecordSha256": "5dcd9ef55baed600c6f5a7ef5438c16d10c980b1b9e0c2a42f3140da66c7d3eb"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | independent description-free schema comparison vs 370aaf6 + AST normalization + tests/tools/mcp.test.ts | structure and runtime unchanged; guidance retained in compact form (Oracle E2, E3)
- AC-2: PASS | tests/integration/pi-native-plugin.test.ts + lifecycle tests | five Pi tools without $schema; hooks dispatch mem_session through the client (Oracle E3, E7)
- AC-3: PASS | tests/integration/pi-tool-budget.test.ts + tests/tools/tool-budget.test.ts | Pi 11,895/12,490 (from 20,390); MCP 14,457/15,180 (from 19,561); descriptions 1,574/1,653 (Oracle E4)
- AC-4: PASS | build, integration:verify, tsc, Vitest unit/integration suites, Skill sync/lock | six MCP vs five Pi consistent across Skills/docs/smoke/packaging; only declared environmental failures (Oracle E5, E6, E7)
- Source: .thoth/specs/tools/spec.md | sha256:314c5e09f89de881a7d2a65d9fa67e075394d0dce4d04c23989577be5bf47141
- Source: .thoth/specs/harness-integration/spec.md | sha256:be347c3511ddd4b5803831872b4bbc5406c04a3077307aeff10462aa990d33c1

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Environmental exceptions accepted (pre-existing): tests/memory-core/retrieval.test.ts:233 CRLF fixture hash, packed smoke/packaging tests needing an adjacent npm-cli.js, tests/setup/native-opencode.test.ts checkout-name assumption. Packed-install and real-host smokes remain unverified in this environment.
