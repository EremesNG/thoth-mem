# Verification Report: Refresh README and Agent Memory Recipe

## Round
round 1

## Completeness

All task checkboxes are complete, and scoped repository changes match the approved paths. Plan review proceeded under the explicit user override recorded at `plan-review.md:5-11`, not a fresh `[OKAY]`. Three proposal acceptance criteria remain unverified.

## Build and Test Evidence

- `pnpm run integration:verify` — passed; 15 native assets verified.
- Focused lifecycle/setup/inventory/hook/packed tests — 5 files, 121 tests passed.
- `pnpm run build` — passed.
- `pnpm test` — 68 files passed; 1,025 passed, 1 skipped.
- Scoped diff/status and whitespace checks — clean; only approved paths changed.
- Iteration-2 integrity audit — 184/186 checks passed; two grading-assertion text mismatches found.

## Compliance Matrix

| # | Proposal success criterion | Result | Evidence |
|---|---|---|---|
| 1 | Ordered README reader journey | Pass | `README.md:5-44`, `README.md:98-213` |
| 2 | Exactly six MCP tools | Pass | `README.md:61-72`; registry `src/tools/index.ts:23-28` |
| 3 | Accurate commands and harness paths | Pass | `README.md:21-36`, `README.md:98-175`; focused contract tests passed |
| 4 | Trigger-oriented imperative recipe | Pass | `skills/thoth-mem/SKILL.md:3-8`, `skills/thoth-mem/SKILL.md:17-136` |
| 5 | Privacy, identity, ownership, recall, and capability invariants | Pass | `skills/thoth-mem/SKILL.md:27-83`, `skills/thoth-mem/SKILL.md:113-136`; lifecycle tests passed |
| 6 | Three exact evals approved before execution | Fail | Three evals exist at `evals.json:1-41`, but `tasks.md:45-51` contains only a checked gate—not independently verifiable approval provenance |
| 7 | Matched A/B acceptance gates | Fail | `tasks.md:193` records three ties, 10/12 assertions for each configuration, and no A/B win; strict improvement and all-critical-pass requirements at `proposal.md:222-229` are unmet |
| 8 | Six truthful transcripts | Pass | All six passed prompt, metadata, provenance, section, redaction, and decision-trace equality checks |
| 9 | Grading, benchmark, analyst, viewer, and user feedback | Fail | Artifacts exist, but `tasks.md:193` records `no_selection` for final review and carries earlier approval forward |
| 10 | Revised-first normalized benchmark | Pass | Iteration 2 records `with_skill-minus-old_skill`, null unavailable metrics, and `0.00` delta |
| 11 | Byte parity and shipped-asset verification | Pass | Three skills share SHA-256 `12B2F4…85C1A`; integration and focused tests passed |
| 12 | Scoped repository diff | Pass | Status contains only README, three skills, eval definition, and this OpenSpec change |

## Issues Found

### Critical

- **[C1]** The A/B success criterion is not satisfied and has no recorded criterion override.
  - file: `openspec/changes/refresh-readme-and-agent-recipe/tasks.md:193`
  - criterion: `proposal.md:222-229`
  - fix: Run a matched iteration that passes all revised critical assertions and establishes strict improvement/preference, or explicitly amend/waive the criterion through a recorded user decision without claiming an A/B win.

- **[C2]** Final-hash user review is unsupported by the recorded provenance.
  - file: `openspec/changes/refresh-readme-and-agent-recipe/tasks.md:193`
  - criterion: `proposal.md:236-241`
  - fix: Present the iteration-2 viewer and record an explicit final review or explicit stop decision; do not treat carried-forward blanket approval as final-run feedback or per-scenario preference.

- **[C3]** Exact pre-execution eval approval is not recoverable from canonical artifacts.
  - file: `openspec/changes/refresh-readme-and-agent-recipe/tasks.md:45`
  - criterion: `proposal.md:218-221`
  - fix: Persist dated, version/hash-anchored evidence of the actual approval; if approval did not precede execution, approve the exact definitions and rerun the matched benchmark.

### Warnings

- **[W1]** Both privacy grading files altered the approved second assertion text.
  - file: `skills/thoth-mem/evals/evals.json:23`
  - criterion: Exact matched assertion-set provenance
  - fix: Preserve the exact assertion text in grading output while redacting private prompt/evidence content, then regenerate downstream benchmark artifacts.

## Verdict

**fail** — repository behavior and tests pass, but user acceptance does not establish quantitative acceptance, and the final benchmark provides neither strict improvement nor fresh human preference.

- Change: `refresh-readme-and-agent-recipe`
- Artifact: `openspec/changes/refresh-readme-and-agent-recipe/verify-report.md`
- Topic Key: `sdd/refresh-readme-and-agent-recipe/verify-report`
- Round: `round 1`
- Verdict: `fail`
- Compliance Summary: `9/12 compliant`
- Critical Issues: `C1 — tasks.md:193 — A/B acceptance gate — satisfy or explicitly amend/waive`; `C2 — tasks.md:193 — final review provenance — obtain explicit final review/stop`; `C3 — tasks.md:45 — exact eval approval — persist valid pre-run approval evidence or rerun`
- Constitution Suggestion: `None`
