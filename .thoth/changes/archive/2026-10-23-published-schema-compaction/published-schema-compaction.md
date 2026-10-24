# Change: published-schema-compaction

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Pi measures the five registered thoth-mem tools at ~2.8k tokens (mem_save 1,759; mem_project 522; mem_recall 228; mem_context 182; mem_get 98). Source-based serialized size: Pi aggregate 11,895 chars (save 7,572, project 2,067, recall 1,172, context 708, get 376); MCP tools/list baseline 14,457 chars.
- `src/integration/pi/index.ts:120-138` registers Pi tools from `MEMORY_TOOL_CATALOG` with `parameters: tool.inputSchema` and forwards arguments unchanged through the MCP client (`src/integration/pi/mcp-client.ts:65`) to the same MCP server.
- `src/tools/index.ts:386-410` builds catalog schemas with `z.toJSONSchema(z.object(shape), { target: 'draft-7' })` from `TOOL_SCHEMA_SHAPES`; only top-level `$schema`/`additionalProperties` are stripped. MCP registration passes the same zod shapes to the SDK (`:380-382`), so the SDK both publishes and pre-validates with them before the handler.
- Handlers re-validate with `schema.safeParse` (`:225-228`); `memSaveInputSchema` (`:150-164`, `:312`) adds `superRefine` rules (exclusive branches, metadata/memory incompatibility, event/session requirements, coverage). Authoritative validation is therefore already separable from the published representation.
- mem_save schema is 6,283 chars: observation 2,008 (proposed_memory 425, generator 325, coverage 268 with two `maximum: 9007199254740991`), evidence 1,803 (an `anyOf` of three variants, 306/646/732, each repeating kind/content/source_ref), observation_review 830, memory 535. Keyword weight: descriptions 952, nested `additionalProperties` 435 (15), `minLength` 392 (28), `maxLength` 306 (19), `minItems`/`maxItems` 82, `maximum` 54.
- mem_project schema is 1,609 chars, of which field descriptions are ~859.
- Observation branches are agent-facing workflows taught by every host skill (`integrations/*/skills/thoth-mem/references/observation-review.md`), so they stay.
- Coupling: `tests/tools/mcp.test.ts:30-114` (MCP schema equals catalog; field description/constraint assertions; pinned descriptions/instructions at `:15-27`), `tests/integration/pi-native-plugin.test.ts:344-348` (Pi parameters equal catalog, no `$schema`), budgets in `tests/integration/pi-tool-budget.test.ts` and `tests/tools/tool-budget.test.ts`. Policy in `docs/agent/surfaces.md:7` and `docs/agent/testing.md:48-53`.
- Active spec `.thoth/specs/tools/spec.md` requirement "MCP Surface MUST Be Compact and Workflow-Level" currently requires every listed input schema to be the one runtime validation enforces.

## Intent

Cut the model-facing token footprint of every thoth-mem tool definition on all hosts (Pi and MCP: Codex, Claude Code, OpenCode) by publishing compact input schemas, while runtime validation keeps enforcing the complete strict contract and no capability is removed.

## Non-goals

- No removal or hiding of any tool, branch, field, or enum value (observation lifecycle stays available everywhere).
- No change to runtime validation rules, error envelopes, storage, retrieval, or tool results.
- No change to server instructions, tool descriptions, Pi promptSnippet/promptGuidelines, or pinned proactive trigger sentences.
- No change to tools owned by other extensions (subagents, codemode, bg_task, web search) or the codemode-added "resolves to" line.
- No package version bump, build artifact edits, release, or real-host smoke.

## Acceptance

- AC-1: Every published input schema (MCP tools/list and Pi `parameters`, still identical apart from `$schema`) omits `minLength`, `maxLength`, `minItems`, `maxItems`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `pattern`, and nested `additionalProperties`, while preserving property names, types, enums, and `required` lists; `mem_save.evidence` is one object schema without `anyOf`/`oneOf` whose optional `metadata` may hold `observation_validation` or `observation_review_attestation`.
- AC-2: Runtime validation is unchanged on both the MCP and Pi paths: all existing validation and behavior tests pass unmodified in intent, and inputs the compact schema admits but the strict contract rejects (over-length or empty strings, out-of-range numbers, unknown nested keys, invalid evidence metadata combinations, bad `config_hash`) are still rejected with the existing error envelope; unknown nested keys are not silently stripped before strict validation.
- AC-3: Every input accepted by strict runtime validation is accepted by the published schema, proven by running representative valid inputs for every tool and every mem_save branch through both.
- AC-4: Field descriptions (notably mem_project) state each constraint once in shorter form; tool descriptions and server instructions remain byte-identical to their pinned values.
- AC-5: Budget tests are re-pinned to the new measured sizes with the existing ~5% headroom; the Pi aggregate and the MCP tools/list aggregate each drop by at least 20% from 11,895 and 14,457 chars; `docs/agent/surfaces.md` and `docs/agent/testing.md` reflect the compact-published/strict-validated split and new numbers.

## Clarifications

- Level: the user selected option A, compact without losing capability (observation branches stay), over option B (hide observation lifecycle from Pi).
- Hosts: the user selected applying the compact schema to all hosts (Pi + MCP) instead of Pi only, keeping one published catalog.

## Decisions

- Published schema and validation schema are split: a compact published representation drives MCP tools/list and the Pi catalog; strict schemas (existing constraints, union variants, `superRefine`) stay authoritative in handlers.
- Because the MCP SDK pre-parses arguments with the published zod shape, the compact representation must pass unknown keys through (loose/passthrough objects or an equivalent seam) so strict handler validation still rejects them; the implementer chooses the mechanism and proves it with a test.
- Integers publish as `type: integer` without safe-integer bounds.
- Field descriptions may be shortened; anything pinned verbatim by tests stays verbatim.
- Budgets keep the ~5% headroom convention and grow only through deliberate definition changes.

## Durable deltas

- `MODIFIED tools` **MCP Surface MUST Be Compact and Workflow-Level** — The server MUST continue to expose exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`, MUST publish concise server instructions that balance progressive recall with deliberate durable save/handoff behavior, and MUST publish a distinct action-oriented description for each tool; tool and field descriptions MUST state each operational constraint once in compact form without repeating a tool description inside a field description; published input schemas on the MCP and Pi surfaces MUST be identical compact projections (apart from the `$schema` marker, which Pi omits) that keep property names, types, enums, and required lists but omit length, count, range, pattern, and nested `additionalProperties` keywords and express each object as a single variant; every input accepted by runtime validation MUST be accepted by the published schema, while runtime validation MUST keep enforcing the complete strict contract, including rejecting unknown nested keys, on both surfaces; and the aggregate serialized size of the model-facing definitions on the MCP and Pi surfaces MUST be locked by budget tests so it grows only through a deliberate definition change.
  - GIVEN the catalog; WHEN an MCP client lists tools, a Pi session registers its tools, and either surface submits an input that violates a strict-only constraint; THEN both surfaces publish the same compact schemas within their pinned aggregate budgets, every strictly valid input matches the published schema, and the server rejects the violating input with the existing error envelope .

## Plan

Approach:
1. Test-first (installed `tdd`): add failing tests for AC-1 (recursive keyword scan of every published schema; evidence has no `anyOf`/`oneOf`), AC-2 (strict-only violations rejected through MCP `callTool` and through the Pi tool path, including an unknown nested key), AC-3 (representative valid inputs per tool and mem_save branch accepted by both the published representation and strict validation), and lowered budgets.
2. In `src/tools/index.ts`, introduce the compact published representation next to the strict schemas; feed it to both MCP registration and `MEMORY_TOOL_CATALOG`; keep handlers on the strict schemas. Prefer deriving the shared parts once over duplicating field lists where that keeps code simple.
3. Shorten mem_project and other field descriptions where they repeat; leave tool descriptions/instructions untouched.
4. Update coupled assertions in `tests/tools/mcp.test.ts` and `tests/integration/pi-native-plugin.test.ts` that pinned published constraints; move constraint assertions to strict-validation tests rather than deleting coverage.
5. Re-pin budgets; update `docs/agent/surfaces.md` and `docs/agent/testing.md`.
6. Behavior-preserving `simplify` pass on the diff.

Mutable surfaces (single writer): `src/tools/index.ts`, `tests/tools/*.test.ts`, `tests/integration/pi-tool-budget.test.ts`, `tests/integration/pi-native-plugin.test.ts`, `docs/agent/surfaces.md`, `docs/agent/testing.md`. The canonical spec delta syncs only at archive.

Verification seams: `pnpm exec vitest run tests/tools tests/integration/pi-tool-budget.test.ts tests/integration/pi-native-plugin.test.ts`, then `pnpm run build` and `pnpm test`; `pnpm run integration:verify` if packed inventory checks touch schemas.

Risks: models lose length hints (mitigated by descriptions and server errors); SDK pre-parse stripping unknown keys (guarded by AC-2 test); character savings do not map 1:1 to tokens.

## Tasks

- [x] AC-1: Compact published schemas shared by MCP and Pi with strict handler validation preserved and budgets re-pinned
  - Outcome: compact published representation in place for all six tools, strict validation unchanged, tests and docs updated
  - Known entrypoints and skill paths: `src/tools/index.ts` (TOOL_SCHEMA_SHAPES, memSaveInputSchema, publicInputSchema, MCP registration, handlers), `src/integration/pi/index.ts:120-138`, `tests/tools/mcp.test.ts`, `tests/tools/tool-budget.test.ts`, `tests/integration/pi-tool-budget.test.ts`, `tests/integration/pi-native-plugin.test.ts`, `docs/agent/surfaces.md`, `docs/agent/testing.md`; skills `tdd`, `simplify`, `zod`
  - Inputs: Exploration measurements and coupling list in this record; user choices A + all hosts
  - Dependencies: none
  - Output: diff plus measured new Pi and MCP aggregate sizes and per-tool sizes
  - Owner: thoth-worker
  - Writes: the mutable surfaces listed in Plan
  - Interface boundaries: MCP tools/list and callTool contract, Pi tool registration, error envelopes, pinned descriptions/instructions
  - Focused check and PASS evidence: focused vitest command from Plan passes; `pnpm run build` and `pnpm test` pass; new AC-1/AC-2/AC-3 tests fail before and pass after
  - Return milestone: all checks green with measured sizes reported
  - Stop / reassessment: return if keeping strict rejection of unknown nested keys requires changing the MCP SDK registration path beyond `src/tools/index.ts`, or if the 20% reduction is unreachable without removing capability
- [x] AC-2: Strict-only violations still rejected on MCP and Pi paths
  - Outcome: tests proving server-side rejection for inputs admitted by the compact schema
  - Known entrypoints and skill paths: same as first row
  - Inputs: first row's compact representation
  - Dependencies: delivered together with the first row by the same writer
  - Output: new rejection tests
  - Owner: thoth-worker
  - Writes: tests listed in Plan
  - Interface boundaries: error envelope shape
  - Focused check and PASS evidence: new rejection tests pass, including unknown nested key
  - Return milestone: same as first row
  - Stop / reassessment: same as first row
- [x] AC-3: Strictly valid inputs match the published schema
  - Outcome: superset test over representative valid inputs for every tool and mem_save branch
  - Known entrypoints and skill paths: same as first row
  - Inputs: existing valid fixtures in tool tests
  - Dependencies: delivered together with the first row by the same writer
  - Output: superset test
  - Owner: thoth-worker
  - Writes: tests listed in Plan
  - Interface boundaries: none
  - Focused check and PASS evidence: superset test passes
  - Return milestone: same as first row
  - Stop / reassessment: same as first row
- [x] AC-4: Shorter field descriptions with pinned text unchanged
  - Outcome: compact field descriptions; pinned tests untouched and passing
  - Known entrypoints and skill paths: `src/tools/index.ts`, `tests/tools/mcp.test.ts:15-27`
  - Inputs: description sizes in Exploration
  - Dependencies: delivered together with the first row by the same writer
  - Output: description edits
  - Owner: thoth-worker
  - Writes: `src/tools/index.ts`
  - Interface boundaries: pinned descriptions and server instructions
  - Focused check and PASS evidence: `tests/tools/mcp.test.ts` passes without editing pinned strings
  - Return milestone: same as first row
  - Stop / reassessment: same as first row
- [x] AC-5: Budgets and agent docs updated to the new sizes
  - Outcome: re-pinned budgets and docs reflecting the split
  - Known entrypoints and skill paths: budget tests and docs listed in Plan
  - Inputs: measured sizes from the first row
  - Dependencies: delivered together with the first row by the same writer
  - Output: budget and doc edits
  - Owner: thoth-worker
  - Writes: budget tests, `docs/agent/surfaces.md`, `docs/agent/testing.md`
  - Interface boundaries: none
  - Focused check and PASS evidence: budget tests pass with at least 20% reduction on both surfaces
  - Return milestone: same as first row
  - Stop / reassessment: same as first row

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review: fresh Oracle subtask_thoth-oracle_1792809061901_9b386178, delivered verdict valid OKAY, recordSha256 99a52dd272d436166c3591388754be4bfa57ddd328be444feabf05b9be3e7244 (recordDigest match).
Non-blocking cautions carried to implementation: SDK pre-validation currently returns a text-only MCP error while handlers return the structured invalid_request envelope, so AC-2 must preserve whichever envelope each input gets today (a metadata-only seam that keeps strict SDK validation is available); AC-3 fixtures must include plain evidence, both metadata variants, nested optional fields and session-summary inputs; current MCP listing measures 14,327 chars, not 14,457, so report against both.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: 760c0ea56bfceb95741152678a4bd7c99cb7b781e0efdae107ff7537ca919526

Final verification: fresh Oracle subtask_thoth-oracle_1792811747595_ff7800c4, delivered verdict valid PASS, mode record, recordDigest match. Implementer: thoth-worker subtask_thoth-worker_1792810609749_eac1511b.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. AC-1 through AC-5 are satisfied by the inspected diff and independent checks. No blocking findings.",
  "evidence": [
    {
      "id": "E1",
      "kind": "record-binding",
      "locator": ".thoth/changes/published-schema-compaction/published-schema-compaction.md",
      "claim": "Bundled --through verify validation passed. Exact bytes before ## Authorization hash to 760c0ea56bfceb95741152678a4bd7c99cb7b781e0efdae107ff7537ca919526. The tools spec baseline still matches 9085d9e91abd286384d8954bd4c4c56d2cb4b61ffe389124d8a8c6f6a8655c8d.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "schema-contract",
      "locator": "src/tools/index.ts:379-440; tests/tools/published-schema.test.ts:80; tests/integration/pi-native-plugin.test.ts:346",
      "claim": "Recursive keyword checks and MCP/catalog/Pi equality tests passed. Evidence publishes as one object with optional metadata variants. Independent comparison against HEAD confirmed preservation or widening of every prior field, type, enum and required constraint, including every evidence union variant.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "runtime-equivalence",
      "locator": "src/tools/index.ts:379-387; tests/tools/published-schema.test.ts:103; tests/integration/pi-native-plugin.test.ts:365",
      "claim": "Original strict schemas remain authoritative. MCP and Pi rejection tests passed, including unknown nested keys. An independent in-memory comparison with the HEAD implementation produced identical complete MCP rejection results for 16 invalid inputs covering SDK and handler errors.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "valid-input-coverage",
      "locator": "tests/tools/published-schema.test.ts:118-165",
      "claim": "Representative inputs passed published-schema validation and actual MCP execution for all six tools, all project actions, plain evidence, direct memory, both metadata variants, observation submission/correction, review, promotion and session summaries.",
      "basis": "observed",
      "uncertainty": "Representative execution coverage, supplemented by structural superset comparison; not exhaustive input enumeration."
    },
    {
      "id": "E5",
      "kind": "text-and-budget",
      "locator": "tests/tools/mcp.test.ts:15-27; tests/tools/tool-budget.test.ts; tests/integration/pi-tool-budget.test.ts; docs/agent/surfaces.md:7; docs/agent/testing.md:48-63",
      "claim": "HEAD/current tool descriptions and instruction sentences compare exactly equal. Field descriptions are shortened. Independently measured Pi 11,895→9,478 chars (-20.32%) and MCP 14,327→11,332 (-20.90%; also exceeds 20% against recorded 14,457). Ceilings 9,952/11,899 retain approximately 5% headroom. Documentation matches the declared delta.",
      "basis": "observed",
      "uncertainty": "Character counts are not token measurements."
    },
    {
      "id": "E6",
      "kind": "execution",
      "locator": "pnpm run build; pnpm exec vitest run tests/tools tests/integration/pi-tool-budget.test.ts tests/integration/pi-native-plugin.test.ts tests/integration.test.ts",
      "claim": "Build passed, including tsc --noEmit. All 8 selected test files passed: 127 tests.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E7",
      "kind": "workspace-hygiene",
      "locator": "git diff; tests/tools/published-schema.test.ts; final git status and SHA-256 checks",
      "claim": "Inspected the complete tracked diff and new test. Frozen inputs, tracked diff and record prefix remained unchanged. No prohibited type suppressions; relative imports use .js. git diff --check passed. No unrelated tracked changes, tracked dist changes or fixture-report.json changes; dist is gitignored.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E8",
      "kind": "broader-suite-triage",
      "locator": "C:/Users/EremesNG/AppData/Local/Temp/thoth-full-test.FtpxCP.log; src/setup/opencode-config.ts:35-40",
      "claim": "Inspected the reported 963-pass/12-failure/1-skip log. Classification is supported: seven immutable-report failures, four missing-npm-CLI failures and one basename-dependent OpenCode setup failure. Three independently checked LF-normalized report hashes match their pins; checkout bytes are CRLF. Relevant failure sources are outside this diff.",
      "basis": "observed",
      "uncertainty": "The full suite was intentionally not rerun."
    },
    {
      "id": "E9",
      "kind": "memory-recall",
      "locator": "mem_recall project git:81415e00-4866-4668-8ec8-6c1821fd0470",
      "claim": "Recall returned bff12027-5e2b-4c22-b250-97ea0455c649, 382290a6-c85d-5168-a870-ba74ff93f2fc and 1ccde72f-328e-4b43-9d78-b14299db6b2f. No memory writes or lifecycle operations were performed.",
      "basis": "observed",
      "uncertainty": "Results supplied no directly relevant compaction guidance; no session attribution asserted."
    }
  ],
  "verification": [
    {
      "check": "AC-1",
      "method": "Inspect projection and flattened evidence; execute recursive keyword and cross-surface equality checks; compare prior structural constraints.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6"],
      "reason": "Published schemas satisfy the compact structural contract without removing capability."
    },
    {
      "check": "AC-2",
      "method": "Inspect unchanged strict validators; execute MCP/Pi rejection tests and exact HEAD/current rejection comparison.",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6"],
      "reason": "Strict rejection remains intact, including nested unknown keys and existing SDK/handler error forms."
    },
    {
      "check": "AC-3",
      "method": "Execute representative valid inputs against publication and runtime; independently compare schema widening against HEAD.",
      "outcome": "pass",
      "evidenceIds": ["E2", "E4", "E6"],
      "reason": "Required tool/action/branch coverage passes; structural projection introduces no narrower constraints."
    },
    {
      "check": "AC-4",
      "method": "Compare exported descriptions/instructions against HEAD and inspect field-description edits.",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "Pinned text is unchanged and field descriptions are shorter."
    },
    {
      "check": "AC-5",
      "method": "Independently measure actual registered definitions; inspect ceilings, docs, declared delta and baseline digest.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E5", "E6"],
      "reason": "Both surfaces exceed 20% savings with approximately 5% budget headroom and consistent documentation."
    },
    {
      "check": "Build, hygiene and freshness",
      "method": "Run build and diff checks; scan changed TypeScript; compare before/after input hashes and tracked status.",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6", "E7"],
      "reason": "Checks passed without tracked-file mutation or stale reviewed inputs."
    },
    {
      "check": "Full-suite rerun",
      "method": "Inspect existing log and independently spot-check reported causes.",
      "outcome": "not-run",
      "evidenceIds": ["E8"],
      "reason": "Explicitly excluded by assignment; observed failures are unrelated to this change."
    }
  ],
  "risks": [
    {
      "description": "A clean full-suite signal remains unavailable in this checkout because of the documented CRLF, npm CLI and worktree-basename failures.",
      "severity": "medium",
      "blocking": false,
      "evidenceIds": ["E8"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate this gate result, record PASS and the digest, then run closeout and archive/apply the declared tools delta.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/published-schema-compaction/published-schema-compaction.md",
    "reviewedRecordSha256": "760c0ea56bfceb95741152678a4bd7c99cb7b781e0efdae107ff7537ca919526"
  }
}
```

- AC-1: PASS | recursive keyword scan + MCP/catalog/Pi equality tests (tests/tools/published-schema.test.ts, tests/integration/pi-native-plugin.test.ts) | Oracle E2, E6
- AC-2: PASS | MCP and Pi rejection tests incl. unknown nested keys; Oracle HEAD/current comparison of 16 invalid inputs | Oracle E3, E6
- AC-3: PASS | valid inputs for all six tools, project actions and mem_save branches accepted by published schema and MCP execution | Oracle E4, E6
- AC-4: PASS | pinned descriptions/instructions unchanged (tests/tools/mcp.test.ts:15-27); field descriptions shortened | Oracle E5, E6
- AC-5: PASS | budgets Pi 11,895→9,478 (−20.32%), MCP 14,327→11,332 (−20.90%), ceilings 9,952/11,899; docs updated | Oracle E1, E5
- Source: .thoth/specs/tools/spec.md | sha256:9085d9e91abd286384d8954bd4c4c56d2cb4b61ffe389124d8a8c6f6a8655c8d

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY

Residual risk: full suite in this worktree has 12 pre-existing environmental failures (CRLF report hashes, missing npm CLI, worktree basename `context`), classified unrelated by implementer and Oracle.
