# Proposal: Refresh README and Agent Memory Recipe

## Intent

Make the repository's primary reader and agent guidance useful at first contact.
The README should work as thoth-mem's presentation card: explain what the
project is, help a reader reach a first successful use, show the main workflows,
summarize the compact MCP surface, and route deeper operational needs without
turning the page into an internal contract. The `thoth-mem` skill should work as
an imperative best-practice recipe that helps an agent select the right memory
tool and preserve privacy, ownership, stable identity, and lifecycle truth.

The change is documentation- and skill-behavior-only. It preserves the existing
runtime, APIs, persistence model, setup behavior, and exact six-tool MCP
registry.

## Scope

### In Scope

- Reorganize `README.md` around a Diátaxis-informed reader journey:
  orientation and value first, a copyable first-use path, task-oriented memory
  and harness workflows, a concise six-tool reference, evaluation guidance,
  and compact pointers to advanced operations.
- Keep the README accurate for the supported native OpenCode, Codex, and Claude
  Code integrations, with a distinct usable integration path for each harness,
  and document Gemini CLI separately as a manual MCP client rather than implying
  native managed integration.
- Keep exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`,
  `mem_project`, and `mem_session` in the README's functional tool overview.
  Explain when to choose each tool without promoting internal tables, state
  machines, retrieval tuning, or setup receipts into the page's main story.
- Rewrite `skills/thoth-mem/SKILL.md` as a lean, imperative agent recipe whose
  frontmatter clearly identifies when it should trigger and whose body covers:
  session start/resume, bounded recall, durable saves, project navigation,
  compaction/finalization, degraded capability handling, privacy redaction,
  root/subagent ownership, and stable session/project identity.
- Make the same recipe byte-identical in
  `integrations/codex/skills/thoth-mem/SKILL.md` and
  `integrations/claude-code/skills/thoth-mem/SKILL.md` so source guidance and
  shipped native assets cannot drift.
- Create `skills/thoth-mem/evals/evals.json` with the three approved realistic
  scenarios and objective assertions:
  1. resume prior work through bounded, identity-scoped recall;
  2. save a durable bug lesson while removing content inside `<private>`;
  3. handle a verified compaction event when semantic recall is degraded while
     keeping supported fallback paths and retry truth visible.
- Treat the three scenarios as non-mutating decision-trace evaluations:
  executor agents receive hypothetical inputs and capability outcomes, produce
  the tool-selection/action sequence they would follow, and must not call live
  thoth-mem tools, alter project/session memory, or perform root-owned lifecycle
  actions during the benchmark.
- Present the exact prompt, expected output, and objective assertions for all
  three scenarios to the user and obtain explicit approval before launching any
  executor run. Approval of the scenario themes does not substitute for review
  of the concrete eval definitions.
- Use the skill-creator improvement loop to snapshot the old skill before
  editing, run matched old-snapshot versus revised-skill outputs for all three
  scenarios, grade the assertions, aggregate the comparison, generate the
  standard static review viewer, collect user feedback, and iterate when the
  acceptance gates are not met.
- Require every executor to create a truthful self-authored `transcript.md`
  alongside its decision trace. The transcript records the supplied prompt,
  skill provenance, hypothetical inputs/outcomes, observable decision sequence,
  and final response, but never claims to be a harness-captured transcript and
  redacts content inside `<private>` tags. Pre-dispatch run metadata anchors the
  exact configuration, skill path/hash, and prompt/assertion digests so those
  transcript claims can be checked mechanically rather than trusted by shape.
- Normalize the standard aggregate before analysis or review so configuration
  order is always revised `with_skill` first and baseline `old_skill` second,
  with every delta recomputed as revised minus old. Preserve the standard raw
  JSON/Markdown for provenance, but expose only truthfully normalized benchmark
  artifacts to the analyst and viewer.
- Run the six scenario executions in bounded batches because the active runtime
  cannot launch six independent runs simultaneously. Each scenario's old and
  revised runs remain a matched pair under equivalent prompts, inputs, and
  grading criteria.
- Keep skill snapshots, run outputs, timing, grading, aggregate benchmark,
  static viewer, and feedback in a temporary workspace outside the repository.
  Only the reusable eval definitions are committed.
- Create and maintain the OpenSpec artifacts for
  `refresh-readme-and-agent-recipe` through the accelerated pipeline.

### Deferred / Needs Discovery

- A larger scenario corpus, repeated variance runs, blind comparison, or a
  dedicated 20-query trigger-description optimization pass may follow the
  approved three-scenario A/B evaluation if its results or user feedback show
  that more evidence is needed.
- Additional reader-facing examples may be proposed later when the compact
  README reveals a concrete gap that cannot be solved with a link or a short
  inline example.

### Out of Scope

- Runtime, MCP API, HTTP API, CLI behavior, storage, schema, retrieval,
  indexing, configuration-default, or lifecycle implementation changes.
- Exhaustive internal state, schema, environment-variable, retrieval-tuning,
  setup-receipt, smoke-internal, or gate-label documentation in the README.
- New LICENSE or legal text, a new secondary technical-reference document, or
  a new contributing guide.
- Changes to OpenCode runtime assets or to Codex/Claude integration assets
  other than their `thoth-mem` skill copies.
- Stateful install, setup, migration, real-host smoke, publication, release, or
  deployment operations.
- Live memory writes, prompt capture, session lifecycle mutations, or other
  persistent thoth-mem side effects from evaluation executors.
- Committing skill snapshots, eval runs, benchmark results, generated viewer
  output, downloaded feedback, or any other temporary evaluation workspace.
- Adding, removing, renaming, splitting, or creating a harness-specific MCP
  tool. The six tools remain a concise README overview and a tool-selection
  recipe in the skill.

## Approach

| Dimension | From | To | Reason | Impact |
| --- | --- | --- | --- | --- |
| README role | A broad page that becomes a detailed setup and operations runbook after initial orientation | A project card with tutorial, how-to, concise reference, and deeper-operation pointers | Readers need a clear first journey before implementation detail | Faster orientation and first use, with advanced facts still discoverable |
| Agent guidance | A correct but reference-like protocol whose source and shipped copies differ in depth | One concise imperative recipe with explicit trigger contexts and decision steps | Agents need actionable tool selection and lifecycle behavior, not a catalog | More consistent memory behavior across supported skill-bearing harnesses |
| Skill evidence | No repository eval definition for the skill | Three committed scenarios plus temporary paired old-versus-revised runs, grading, benchmark, static review, and feedback | The recipe should be improved with observable behavior rather than prose judgment alone | Reviewable evidence without committing generated evaluation artifacts |

Implementation should preserve verified commands and integration facts, remove
or condense details that interrupt the main reader journey, and route advanced
operations to existing authoritative surfaces rather than duplicating volatile
contracts. The skill should explain why bounded escalation, redaction, stable
identity, and truthful capability states matter, then express the actions in
imperative sequence. Evaluation assertions should test observable decisions and
outputs rather than reward wording copied from the skill.

## Affected Areas

- `README.md` — reader-facing project card, first-use journey, workflows,
  integrations, eval guidance, concise tools, and operations pointers.
- `skills/thoth-mem/SKILL.md` — canonical agent recipe and trigger description.
- `skills/thoth-mem/evals/evals.json` — new reusable three-scenario eval set and
  assertions.
- `integrations/codex/skills/thoth-mem/SKILL.md` — byte-identical shipped skill
  copy.
- `integrations/claude-code/skills/thoth-mem/SKILL.md` — byte-identical shipped
  skill copy.
- `openspec/changes/refresh-readme-and-agent-recipe/` — accelerated-pipeline
  coordination, execution, review, and verification artifacts.

Temporary evaluation snapshots, results, timing, grading, aggregate benchmark,
static viewer, and feedback are affected operational outputs but remain outside
the repository and are not committed.

## Risks

- Condensing the README could hide an important operational fact or leave a
  stale command. Mitigate by checking every reader journey against current
  manifests, CLI help/scripts, and main OpenSpec contracts, and by retaining a
  discoverable pointer when detail leaves the main flow.
- A recipe optimized only for three prompts could overfit their wording.
  Mitigate with behavior-oriented assertions, general instructions that explain
  why each decision matters, analyst review for non-discriminating assertions,
  and explicit deferral of a larger trigger/scenario corpus.
- A/B outputs can vary with capacity, timing, or execution order. Mitigate by
  preserving matched old/revised conditions, recording timing and grading per
  run, batching pairs without changing prompts, and reporting uncertainty
  instead of treating a noisy delta as proof.
- The active collaboration runtime may omit `total_tokens` or `duration_ms`
  from completion notifications even though the skill-creator format expects
  them. Mitigate by recording the capability gap explicitly, using zero only as
  a temporary aggregator-compatibility sentinel, and excluding time/token
  fields from comparative claims unless all six runs expose real measurements.
- The standard aggregator discovers `old_skill` before `with_skill` and would
  therefore orient its raw delta as old minus revised. Mitigate by treating its
  output as intermediate provenance, deterministically rebuilding configuration
  order and deltas as revised minus old, and validating that orientation before
  analyst or user review.
- Source and integration skill copies could drift later. Mitigate now with a
  byte-equality check across all three files and the existing integration and
  packaging verification relevant to shipped assets.
- Evaluation outputs may contain repository or prompt context. Mitigate by
  using a disposable non-repo workspace, redacting private content, reviewing
  generated artifacts before sharing, and deleting or retaining that workspace
  only through an explicitly chosen cleanup path.
- Evaluation executors are subagents and cannot safely impersonate root-owned
  session lifecycle. Mitigate by grading non-mutating decision traces against
  hypothetical capability results rather than invoking live memory effects.

## Rollback Plan

Revert only the README, the canonical skill, the two integration skill copies,
and the new eval definition to their pre-change content. Remove the new eval
definition if the recipe reverts and it no longer describes accepted behavior.
Keep or discard the temporary evaluation workspace independently because it is
outside version control and is not required at runtime. No database, schema,
runtime, installation, or user-memory migration is required, so rollback is a
content-only repository change. Preserve the OpenSpec history as the record of
the attempted change unless the normal archive decision says otherwise.

## Success Criteria

- A reader-journey review confirms that `README.md` lets a new reader, in order,
  identify the product and value, copy a verified first-use command, choose a
  common memory workflow, choose the supported native integration path for
  OpenCode, Codex, or Claude Code (or the manual MCP path for Gemini CLI),
  understand how to use and interpret eval evidence, and reach advanced
  operations through compact pointers without reading internal contracts first.
- The README names all six registered MCP tools exactly—`mem_save`,
  `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`—and
  neither presents a seventh tool nor misclassifies setup/administration as MCP.
- The README's copyable commands and per-harness instructions for OpenCode,
  Codex, Claude Code, and Gemini CLI agree with the current package scripts,
  manifests, and supported setup surfaces; Gemini/manual MCP fallback is visibly
  distinct from native managed integration.
- The revised skill frontmatter identifies concrete trigger contexts, and the
  recipe gives an agent an imperative path for start/resume, recall escalation,
  save selection, project navigation, compaction/finalization, and degraded or
  unsupported capability handling.
- The recipe preserves all critical invariants: root ownership of session and
  prompt continuity, no generated prompt saved as user intent, removal of
  `<private>` content before persistence, stable `session_id` and `project`,
  compact-to-context-to-selected-`mem_get` recall, explicit capability truth,
  and no claim of success after a failed or indeterminate memory call.
- `skills/thoth-mem/evals/evals.json` contains exactly the three approved
  scenarios with expected outcomes and objective assertions that cover the
  reader-independent behavior above, and the user explicitly approves those
  exact prompts and assertions before any executor run.
- For every scenario, the old snapshot and revised skill receive the same
  prompt, inputs, and assertion set. All critical privacy, ownership, identity,
  and lifecycle assertions pass for the revised skill; its assertion pass rate
  is not lower than the old snapshot on any scenario; and the revised output is
  strictly better on at least one scenario by pass rate or recorded human
  preference while being preferred or tied on the other two. No executor calls
  live thoth-mem tools or claims that a hypothetical memory effect really
  occurred.
- All six executor runs produce a self-authored transcript with explicit prompt,
  skill provenance, hypothetical conditions, observable decisions, and final
  response; no transcript claims harness capture or retains content from inside
  `<private>` tags. Every required section is non-empty, the supplied-prompt
  section matches the redacted eval prompt, provenance matches immutable run
  metadata, and the observable decision section matches `decision_trace.md`.
- The standard skill-creator grading and aggregate benchmark are produced, an
  analyst pass identifies flaky or non-discriminating assertions and
  time/token tradeoffs when the runtime exposes complete measurements (or the
  unsupported measurement capability when it does not), and the standard
  static review viewer captures user feedback before the recipe is accepted or
  iterated. Missing metrics are never presented as observed zero-cost runs.
- The review benchmark orders `with_skill` before `old_skill` and computes all
  deltas as revised minus old. Raw standard JSON/Markdown remain clearly marked
  provenance artifacts and are not used as normalized review surfaces.
- The canonical, Codex, and Claude Code `SKILL.md` files are byte-identical, and
  focused integration/package verification for the shipped copies passes.
- A scoped status/diff check shows only the README, three skill files, the eval
  definition, and the new OpenSpec artifacts as intended repository changes;
  no snapshot, run output, benchmark, viewer, feedback, generated build output,
  secret, or unrelated concurrent change is included.
