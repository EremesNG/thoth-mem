# Change: proactive-memory-adoption

**Classification**: substantial
**Scope**: cross-cutting
**Uncertainty**: medium
**Risk**: medium

## Exploration

- Agents use thoth-mem passively: they rarely recall unprompted, rarely save decisions/discoveries, and leave recovered handoffs open.
- Guidance already exists but is conditional and judgment-gated: server instructions (`src/server.ts:13-18`, 549 chars) say recall "when prior work may affect the task" and never mention handoff closure; `mem_recall` description (`src/tools/index.ts:43`) states what, not when; the Skill (`plugin/skills/thoth-mem/SKILL.md`, synced byte-identical to four hosts by `scripts/sync-plugin-distribution.mjs`) loads only when the model matches its description.
- Hooks capture evidence and deliver recovery only. Codex/Claude inject solely at SessionStart (`plugin/runners/public-runner.mjs:201-207`); OpenCode and Pi refresh recovery per prompt. No host performs query-based recall, end-of-turn reminders, or handoff-closure prompts.
- Recovery renderer (`src/memory-core/continuation.ts`) is shared by all hosts, capped at 1000 code points and 3 records; host validator rejects larger output (`src/integration/recovery.ts:56`). Memory records render as `- [kind] title: content (memory:id)`; `topic_key` is never rendered, so an agent cannot close a recovered handoff without an extra `mem_get`.
- Wording tests: `tests/tools/mcp.test.ts` (catalog equality + required substrings), `tests/integration/package.test.ts:23-40`, `tests/packaging/first-product.test.ts:202-212` (Skill < 7244 UTF-16 units, required phrases), distribution byte-equality tests. No server-instruction wording test. No adoption evaluation exists.
- CLI (`src/cli.ts`) has setup, project rename, import-legacy, lifecycle, mcp; human setup output at `cli.ts:222-228`. Read-only `MemoryService` mode exists (`service.ts:313-315`). Stored data supports handoff open/replaced/closed counts with age and session-attributed save counts; recall-per-session is not persisted and not computable.
- `.thoth/` governance and `.thoth/specs/` are absent.

## Intent

Make agents proactively recall, save, and close handoffs through cheap, low-noise, always-visible surfaces, and provide a read-only adoption baseline, without increasing per-turn injected context beyond strict budgets. This is phase 1; prompt-time recall injection (A1) and end-of-turn reminders (A3) are a follow-up change after host capability research.

## Non-goals

- No prompt-time recall injection, Stop/end-of-turn hooks, or new hook events (deferred follow-up).
- No new MCP tool (the exact six-tool surface stays), no schema migration, no recall telemetry persistence.
- No automatic writing into users' AGENTS.md/CLAUDE.md; no change to the 1000-code-point recovery cap or the Skill size ceiling.
- No change to evidence capture, lifecycle semantics, or handoff supersession rules.

## Acceptance

- AC-1: A recovered open handoff renders its `topic_key` and a short closure hint after its unchanged `(memory:<id>)` marker, at most one hint per recovery block (on the first rendered handoff), adding at most 100 code points in total, only when the key is eligible (≤ 60 code points, unchanged by display normalization, unchanged by `sanitizePrivateContent`, and containing no evidence ID of any selected memory or summary submission in the block) and the hint fits under the renderer's effective code-point limit (≤ 1000); otherwise the hint is omitted. Selection and every other rendered byte are identical to output without the hint, and the result still passes `verifiedRecovery`.
- AC-2: Server instructions, `mem_recall`/`mem_save` descriptions, and the Skill use trigger-oriented wording (recall at task start before exploring; save at verified boundaries unprompted; close finished handoffs under the same topic_key; skip trivial turns) with net growth ≤ 150 chars for server instructions, ≤ 200 chars across tool descriptions, and the Skill still below its existing 7244 limit; all host copies stay synchronized.
- AC-3: README documents an optional ≤ 6-line AGENTS.md/CLAUDE.md snippet, and human-readable `thoth-mem setup` output prints one line pointing to it; `--json` setup output is unchanged.
- AC-4: A read-only CLI command reports, per exact project key, open/replaced/closed handoff counts with open-handoff ages and session-attributed save counts (sessions with zero saves, saves per session), with human and `--json` output, never creating or migrating a database, and explicitly stating that recall usage is not measured.

## Clarifications

- Token/noise budget is a hard constraint from the user: every new model-facing text is bounded by the limits in AC-1 and AC-2; AC-3 and AC-4 add zero runtime context.
- "Closed handoff" is defined from stored facts: open = current handoff; replaced = superseded by a newer handoff; closed = superseded by a non-handoff memory under the same topic_key. Settled as a safe assumption, no human decision needed.
- Recalls-per-session is not computable; reported as unmeasured instead of adding telemetry (would need a schema change and session attribution of recall input).

## Decisions

- D-1: Phase 1 = A2 + B + C + D, as accepted by the user; A1 and A3 move to a follow-up change gated on host hook research.
- D-2: A2 is a post-render insertion: render recovery exactly as today, then, only for the first rendered handoff line and only if its key is eligible and total + hint ≤ the renderer's effective maxCodePoints (≤ 1000), insert ` close: save outcome under topic_key=<k>` immediately after that line's exact `(memory:<id>)` marker. At most one hint per block, so aggregate growth ≤ 100. Ineligible key (> 60 code points, altered by display normalization, or altered by `sanitizePrivateContent`, i.e. private-tagged or credential-like, or containing any block-wide withheld evidence ID that `verifiedRecovery` rejects) or insufficient slack means bounded abstention (no hint); keys are never truncated and budgets never relaxed. Storage and the stored key are never altered. Final recovery measurements are recomputed after insertion. This preserves selection, allocation, and all non-hint bytes (Oracle plan-review rounds 1–2 repairs).
- D-6: Adoption save counts include only session-attributed agent evidence of kind `explicit_save` and `handoff`; automatic captures (`root_prompt`, `checkpoint`, `session_summary`, lifecycle/legacy kinds) are excluded. Distinct evidence ids avoid counting receipt retries.
- D-3: C never writes user instruction files; README owns the snippet; setup prints only a single pointer line in human mode.
- D-4: D is a CLI-only read-only command using the existing readonly `MemoryService` mode; exact name chosen to match CLI conventions (proposed `thoth-mem adoption --project <key> [--json]`).
- D-5: Work proceeds on branch `feat/proactive-memory-adoption` created from local `master`.

## Durable deltas

- `ADDED agent-memory-adoption` **Recovered handoffs are closable in place** — A rendered open handoff in recovery shows its topic_key and a bounded closure hint within the existing recovery budget.
  - GIVEN a current handoff selected for recovery; WHEN recovery renders; THEN at most one hint follows the first handoff's unchanged memory marker only when the key is eligible and privacy-safe and it fits under the effective limit, otherwise it is omitted, and all other bytes are unchanged .
- `ADDED agent-memory-adoption` **Trigger-oriented memory guidance** — Server instructions, tool descriptions, and the Skill state when to recall, save, and close handoffs within fixed text budgets.
  - GIVEN the MCP server and packaged Skill; WHEN an agent loads them; THEN guidance names task-start recall, unprompted verified saves, and handoff closure, within the AC-2 size limits .
- `ADDED agent-memory-adoption` **Read-only adoption baseline** — A CLI command reports handoff lifecycle and save metrics for an exact project without mutating storage.
  - GIVEN an existing database and exact project key; WHEN the adoption command runs; THEN it prints handoff open/replaced/closed counts, open ages, and per-session save counts, and states recall usage is unmeasured .

## Plan

- AC-1: Add a post-render step in `continuation.ts` per D-2 (requires handoff candidates to carry `topicKey`). Tests in `tests/memory-core/continuation.test.ts`: hint present with slack; output equals no-hint output plus exactly the hint; growth ≤ 100; exactly one hint and growth ≤ 100 with two or more rendered handoffs; abstention for long, Unicode-normalized/unsafe, private-tagged, credential-like, and missing keys; abstention when a caller maxCodePoints below 1000 leaves no slack; abstention when the first handoff's key contains another selected record's evidence ID (cross-record regression, baseline still passes `verifiedRecovery`); abstention in a saturated handoff-plus-decision block with byte-identical output; non-handoff-only output unchanged; hinted output passes `verifiedRecovery` (`src/integration/recovery.ts`). Update exact-output runner tests only if their fixtures include handoffs.
- AC-2: Rewrite `src/server.ts` instructions and `TOOL_DESCRIPTIONS` for `mem_recall`/`mem_save` with triggers; edit canonical Skill frontmatter description and "Before acting" to be default-on with explicit skip criteria; run `scripts/sync-plugin-distribution.mjs`; add a size assertion for server instructions and tool-description growth; keep existing required-phrase tests passing.
- AC-3: Add README section under "Use the memory" with the snippet; add one human-mode line in `cli.ts` setup presentation; test that `--json` output is unchanged and human output contains the pointer.
- AC-4: Add a read-only service query method plus CLI subcommand; tests with a seeded temporary DB covering open/replaced/closed classification, ages, zero-save sessions, missing DB (no creation), nonexistent project key, and `--json` shape.
- Verification: focused Vitest files per unit; after all edits freeze, root runs `pnpm run build`, `pnpm test`, and `pnpm run integration:verify` per `docs/agent/testing.md` (shared build outputs are root-owned); final independent Oracle review.

## Tasks

- [x] AC-1: Handoff recovery lines render topic_key and closure hint within budget
  - Outcome: open handoffs in recovery are closable without an extra lookup, within budget
  - Known entrypoints and skill paths: src/memory-core/continuation.ts, src/memory-core/service.ts:913-1001 (read-only), tests/memory-core/continuation.test.ts, tests/integration/public-plugin-runner.test.ts; skills tdd, simplify
  - Inputs: Exploration section facts on templates and budget algorithm
  - Dependencies: none
  - Output: renderer change plus tests
  - Owner: thoth-worker
  - Writes: src/memory-core/continuation.ts, tests/memory-core/continuation.test.ts, tests/integration/public-plugin-runner.test.ts (only if fixture output changes)
  - Interface boundaries: recovery output consumed by OpenCode, Pi, public runner; 1000-code-point validator in src/integration/recovery.ts unchanged
  - Focused check and PASS evidence: `pnpm vitest run tests/memory-core/continuation.test.ts tests/integration` passes including new budget assertions
  - Return milestone: tests green with diff summary
  - Stop / reassessment: hint cannot fit without changing selection semantics or cap
- [x] AC-2: Trigger-oriented server instructions, tool descriptions, and Skill within size limits
  - Outcome: always-visible texts state when to recall/save/close, within AC-2 budgets, synced to all hosts
  - Known entrypoints and skill paths: src/server.ts:13-25, src/tools/index.ts:34-49, plugin/skills/thoth-mem/SKILL.md, scripts/sync-plugin-distribution.mjs, tests/tools/mcp.test.ts, tests/integration/package.test.ts, tests/packaging/first-product.test.ts, tests/packaging/public-plugin-distribution.test.ts
  - Inputs: Exploration wording findings; snippet triggers from Decisions
  - Dependencies: none
  - Output: edited texts, synced copies, size/trigger assertions
  - Owner: thoth-worker
  - Writes: src/server.ts, src/tools/index.ts, plugin/skills/thoth-mem/SKILL.md, integrations/*/skills/thoth-mem/SKILL.md and plugin/distribution-lock.json (via sync script), tests/tools/mcp.test.ts, tests/packaging/first-product.test.ts
  - Interface boundaries: exact six-tool catalog and schemas unchanged except description strings
  - Focused check and PASS evidence: `pnpm vitest run tests/tools tests/integration/package.test.ts tests/packaging` passes with new budget assertions
  - Return milestone: tests green with before/after char counts
  - Stop / reassessment: budget cannot hold required phrases
- [x] AC-3: README AGENTS.md snippet and setup pointer line
  - Outcome: users can opt into a short always-loaded instruction; setup points to it in human mode only
  - Known entrypoints and skill paths: README.md:91-153, src/cli.ts:217-229, tests/setup/plugins.test.ts
  - Inputs: snippet draft agreed in conversation (≤ 6 lines)
  - Dependencies: none
  - Output: README section, one CLI line, test
  - Owner: thoth-worker (same worker as AC-4, shares src/cli.ts)
  - Writes: README.md, src/cli.ts, tests/setup/plugins.test.ts
  - Interface boundaries: setup `--json` output unchanged
  - Focused check and PASS evidence: CLI setup tests pass; JSON output assertion unchanged
  - Return milestone: tests green
  - Stop / reassessment: setup human output is pinned by external consumers
- [x] AC-4: Read-only adoption baseline CLI command
  - Outcome: handoff lifecycle and save metrics per exact project, human and JSON
  - Known entrypoints and skill paths: src/cli.ts, src/memory-core/service.ts:248-335 (readonly mode), src/memory-core/sqlite/schema.ts; skill tdd
  - Inputs: Clarifications definitions of open/replaced/closed
  - Dependencies: AC-3 shares src/cli.ts; same worker, sequential
  - Output: service read method, CLI subcommand, tests, README CLI mention
  - Owner: thoth-worker
  - Writes: src/memory-core/service.ts (new read method only), src/cli.ts, new tests file under tests/, README.md
  - Interface boundaries: no MCP tool, no schema/migration, never creates DB
  - Focused check and PASS evidence: new test file passes covering D-6 save semantics, exact-key isolation between two projects, missing DB leaves no file created, and an existing DB file's bytes and schema are unchanged after the command
  - Return milestone: tests green with sample output
  - Stop / reassessment: metric requires schema change

## Authorization

Accepted values: Plan review: `OKAY | SKIPPED`; Plan review selection:
`EXPLICIT_REVIEW | EXPLICIT_SKIP | DEFAULT_REVIEW_AFTER_3`; Implementation:
`AUTHORIZED`. Put notes on separate lines below the fields, never on field lines.

**Plan review**: OKAY
**Plan review selection**: EXPLICIT_REVIEW
**Implementation**: AUTHORIZED

Plan review round 4 OKAY (rounds 1-3 REJECT, repaired in AC-1/D-2/D-6); reviewed record SHA-256 233f63f99b7140d2283b58fe9cbceb7ddabed2be140d99484a0249e1e5160189; envelope validated with validate-result.mjs exit 0.

## Verification

Accepted values: Reviewer: `oracle`; Independent from implementer: `Yes`;
Verdict: `PASS`; Reviewed record SHA-256: 64 lowercase hex characters hashing
exact UTF-8 bytes before the case-sensitive `## Authorization` heading. Use
exactly one SHA field line; put notes on separate lines below the fields.

**Reviewer**: oracle
**Independent from implementer**: Yes
**Verdict**: PASS
**Reviewed record SHA-256**: cd567bb4be220eb3ddab03b60e0c9924f3deb0d76bc2d3a5972845d021a41b0c

Round 1 FAIL (AC-4 cross-topic handoff replacement undercount) fixed in the adoption method with regressions; round 2 fresh Oracle PASS. Envelope validated with validate-result.mjs exit 0.

**Oracle envelope**:

```thoth-result
{
  "schemaVersion": 1,
  "role": "oracle",
  "status": "complete",
  "conclusion": "PASS. The whole diff satisfies AC-1..AC-4, D-2, D-6, non-goals, and hard budgets. The cross-topic handoff replacement defect is fixed.",
  "evidence": [
    {
      "id": "E1",
      "kind": "artifact-binding",
      "locator": ".thoth/changes/proactive-memory-adoption/proactive-memory-adoption.md",
      "claim": "Independently recomputed prefix SHA-256 matches cd567bb4be220eb3ddab03b60e0c9924f3deb0d76bc2d3a5972845d021a41b0c. The verify gate passes; declared canonical spec is absent.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E2",
      "kind": "source-and-tests",
      "locator": "src/memory-core/continuation.ts:229-251; tests/memory-core/continuation.test.ts",
      "claim": "Post-render insertion changes only the first handoff's marker suffix. Eligibility checks cover normalization, privacy, and block-wide evidence IDs. Selection/allocation remain unchanged; insufficient slack abstains. Maximum added hint is 97 code points.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E3",
      "kind": "measured-budgets",
      "locator": "src/server.ts; src/tools/index.ts; plugin/skills/thoth-mem/SKILL.md; integrations/*/skills/thoth-mem/SKILL.md",
      "claim": "Server instructions: 672 chars, +123, limit 699. Six tool descriptions: 2962 chars, +172, limit 2990. Skill: 6470 UTF-16 units, below 7244. Trigger wording is present; all four host copies are byte-identical and the distribution-lock hash matches.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E4",
      "kind": "source-and-tests",
      "locator": "README.md:93-109; src/cli.ts:269; tests/setup/plugins.test.ts",
      "claim": "README snippet is six lines. Human setup prints exactly one pointer; JSON output remains unchanged. No instruction-file writing was added.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E5",
      "kind": "source-and-tests",
      "locator": "src/memory-core/service.ts:347-386; src/cli.ts:180-201; tests/adoption.test.ts",
      "claim": "Adoption counts cross-topic handoff successors as replacements, but non-handoff closure requires the same topic. Tests pass for exact-key/alias isolation, ages, zero-save sessions, distinct attributed agent explicit_save/handoff evidence, human/JSON output, missing-database noncreation, and unchanged database bytes/schema.",
      "basis": "observed",
      "uncertainty": ""
    },
    {
      "id": "E6",
      "kind": "independent-execution",
      "locator": "Round-2 terminating checks",
      "claim": "Focused suite: 105 passed, 1 skipped. Four host/lifecycle suites: 48 passed. Targeted Skill wording test: 1 passed. tsc --noEmit --incremental false, integration:verify, and git diff --check passed. Final reviewed-input digest remained f3570b1767939eb3a105ae4ad294444b0051295efdcb09c1811b3fc3807bee97.",
      "basis": "observed",
      "uncertainty": "The full suite and packed smoke were not rerun in this round."
    },
    {
      "id": "E7",
      "kind": "reported-environmental-residuals",
      "locator": "Root's round-2 assignment",
      "claim": "Root reports npm-cli resolution failures under pnpm-managed Node, live-Pi-home digest interference in packed smokes, and release-version failure only with overridden npm_execpath.",
      "basis": "inferred",
      "uncertainty": "These earlier environmental failures were not independently reproduced in round 2."
    }
  ],
  "verification": [
    {
      "check": "AC-1 / D-2",
      "method": "Renderer inspection, continuation/recovery tests, and host delivery regressions",
      "outcome": "pass",
      "evidenceIds": ["E2", "E6"],
      "reason": "PASS | one eligible post-marker hint; growth <=97 code points; cap, privacy, evidence withholding, selection, allocation, and non-hint bytes preserved."
    },
    {
      "check": "AC-2",
      "method": "Independent length/hash measurements and guidance tests",
      "outcome": "pass",
      "evidenceIds": ["E3", "E6"],
      "reason": "PASS | triggers present; server 672/699, descriptions 2962/2990, Skill 6470<7244; all host copies synchronized."
    },
    {
      "check": "AC-3",
      "method": "README inspection and setup output regression",
      "outcome": "pass",
      "evidenceIds": ["E4", "E6"],
      "reason": "PASS | six-line optional snippet; one human-only pointer; unchanged JSON; no user instruction-file writes."
    },
    {
      "check": "AC-4 / D-6",
      "method": "Read-only CLI/query inspection and adoption regressions",
      "outcome": "pass",
      "evidenceIds": ["E5", "E6"],
      "reason": "PASS | cross-topic replacement fixed; same-topic closure retained; exact-project metrics and attributed distinct save counts correct; database creation/migration absent; recall explicitly unmeasured."
    },
    {
      "check": "Non-goals and regression boundaries",
      "method": "Whole git diff master plus untracked adoption test; catalog and integration checks",
      "outcome": "pass",
      "evidenceIds": ["E2", "E3", "E4", "E5", "E6"],
      "reason": "No new MCP tool, schema, hook event, prompt-time recall injection, end-of-turn hook, telemetry persistence, or supersession/lifecycle mutation."
    },
    {
      "check": "Record binding and final freshness",
      "method": "Independent raw-byte prefix hashing, verify validator, and final input digest comparison",
      "outcome": "pass",
      "evidenceIds": ["E1", "E6"],
      "reason": "Assigned record hash matches; structural verify passes; reviewed inputs remain unchanged."
    }
  ],
  "risks": [
    {
      "description": "Full-suite and packed-release confidence remains limited by the reported environmental residuals. Do not represent this review as a full-suite or packed-smoke PASS.",
      "severity": "low",
      "blocking": false,
      "evidenceIds": ["E6", "E7"]
    }
  ],
  "openQuestions": [],
  "nextAction": "Root should validate the unchanged envelope, record the per-AC PASS evidence, and run closeout before archive.",
  "review": {
    "kind": "final-verification",
    "verdict": "PASS",
    "reviewedRecord": ".thoth/changes/proactive-memory-adoption/proactive-memory-adoption.md",
    "reviewedRecordSha256": "cd567bb4be220eb3ddab03b60e0c9924f3deb0d76bc2d3a5972845d021a41b0c"
  }
}
```

After PASS, root pastes the Oracle's unchanged final-verification envelope here.

- AC-1: PASS | pnpm vitest run tests/memory-core/continuation.test.ts tests/integration/recovery.test.ts | one post-marker hint per block, max 97 code points, abstention cases and verifiedRecovery covered; benchmark control +180 = 3 blocks x 60
- AC-2: PASS | pnpm vitest run tests/tools tests/integration/package.test.ts tests/integration/public-plugin-package.test.ts tests/packaging/public-plugin-distribution.test.ts | server 549->672 (<=699), tool descriptions 2790->2962 (<=2990), Skill 6470 (<7244), four host copies synced
- AC-3: PASS | pnpm vitest run tests/setup/plugins.test.ts | six-line optional README snippet, one human-only setup pointer, JSON unchanged
- AC-4: PASS | pnpm vitest run tests/adoption.test.ts | read-only, exact-key isolation, D-6 counts, cross-topic replacement, recall reported unmeasured
- Residual: full pnpm test 568 passed, 1 skipped; packaging tests fail on npm-cli.js discovery under pnpm-managed Node and packed Pi smokes fail on live ~/.pi/agent digest interference (environmental, judged non-blocking); pnpm run build and pnpm run integration:verify passed.
- Source: .thoth/specs/agent-memory-adoption/spec.md | absent

## Closeout

Accepted value: Archive: `READY`. Put notes on separate lines below the field.

**Archive**: READY
