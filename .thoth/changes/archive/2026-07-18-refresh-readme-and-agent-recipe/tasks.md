# Tasks: Refresh README and Agent Memory Recipe

> **Acceptance reference:** This is an accelerated SDD change. The success criteria in `proposal.md` are the acceptance reference; no delta spec or design artifact exists. The `Spec:` tags below are stable proposal-derived trace tags.
>
> **Execution boundary:** Repository mutations are limited to `README.md`, `skills/thoth-mem/SKILL.md`, `skills/thoth-mem/evals/evals.json`, the Codex and Claude Code skill copies, and this change's OpenSpec artifacts. Snapshots, transcripts, outputs, timing, grading, benchmark data, viewer HTML, and feedback stay in the disposable non-repository workspace established in Task 1.1. Evaluation executors produce non-mutating decision traces from hypothetical tool outcomes; they must not call live thoth-mem tools, alter persistent memory, or perform root-owned lifecycle actions.
>
> **Capacity rule:** `parallel_markers` is disabled, and the active runtime cannot launch all six executor runs simultaneously. Tasks 3.2-3.4 therefore launch exactly one matched old/revised pair at a time (two executor agents in the same dispatch), wait for both terminal results, and capture each completion notification immediately before starting the next pair. This preserves matched A/B conditions while recording the runtime enforcement limitation.
>
> **Benchmark compatibility:** The verified `aggregate_benchmark.py` CLI accepts an iteration directory and discovers configurations dynamically, but its current output hardcodes `metadata.runs_per_configuration` to `3` and does not add `eval_name`. Task 4.3 performs a deterministic schema enrichment to `1` run per configuration and adds names from `eval_metadata.json` before analyst review or viewer generation; it does not replace the standard aggregator.
>
> **Existing-skill baseline:** `skill-creator` names the existing-skill baseline `old_skill`. The local aggregator and viewer source explicitly support `with_skill`/`old_skill`, so this plan preserves those names instead of relabeling the old snapshot as a no-skill baseline.
>
> **Measurement truth:** Collaboration completion notifications are not guaranteed to expose `total_tokens` or `duration_ms`. Each run records whether both measurements were actually available. Zero values are permitted only as explicit temporary compatibility sentinels when `measurement_available` is false; Task 4.3 removes those unavailable metrics from the review comparison. Time/token comparisons are valid only when all six runs have real measurements, and no missing value may be described as an observed zero-cost run.
>
> **Benchmark orientation:** The standard aggregator discovers `old_skill` before `with_skill` and computes its raw delta as first configuration minus second. Task 4.3 treats that output as provenance, rebuilds review order as `with_skill` then `old_skill`, and recomputes every delta as revised minus old before analysis or viewer generation.
>
> **Transcript contract:** Every executor writes both `outputs/decision_trace.md` and a self-authored `transcript.md` beginning `Self-authored evaluation record; not a harness-captured transcript.` and containing the exact headings `## Supplied prompt`, `## Skill provenance`, `## Hypothetical inputs and outcomes`, `## Observable decision sequence`, and `## Final response`. Every section body is non-empty. The supplied prompt is the exact eval prompt after replacing each complete private block body with `[REDACTED]`; provenance contains exact `Configuration:`, `Skill path:`, and `Skill SHA-256:` values from immutable `run_metadata.json`; the observable decision body equals `outputs/decision_trace.md` after LF/trim normalization. Any complete `<private>...</private>` block may retain its tags only when its body is exactly `[REDACTED]`, and after the mandatory first-line disclaimer no transcript may contain `harness` or a `captur*` term.

## Phase 1: Controlled Evaluation Foundation

- [x] 1.1 Establish a disposable evaluation workspace outside the repository — system temporary directory and pointer file
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Disposable Evaluation Workspace`
  **Independent Test:** Resolve the repository and workspace paths and prove the workspace is under the system temporary directory, is not inside the repository, and contains no pre-existing run evidence before any snapshot or repository edit.
  **Verification**:
  - Run: `$repo = (Resolve-Path '.').Path; $workspace = Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe'; if (Test-Path $workspace) { throw "Refusing to reuse existing evaluation workspace: $workspace" }; New-Item -ItemType Directory -Path (Join-Path $workspace 'iteration-1') -Force | Out-Null; Set-Content -NoNewline -Path (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace') -Value $workspace; $resolved = (Resolve-Path $workspace).Path; if ($resolved.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'Evaluation workspace is inside the repository' }; $resolved`
  - Expected: A new empty `iteration-1` workspace is created beneath the system temporary directory, its absolute path is printed and recorded in the pointer file, and the command fails rather than reusing or nesting an unsafe path.

- [x] 1.2 Snapshot the complete old skill before editing any repository skill file — temporary `skill-snapshot/`
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Old Skill Baseline Snapshot`
  **Independent Test:** Compare the pre-edit canonical `SKILL.md` with the snapshot byte-for-byte and record its SHA-256 digest before Tasks 2.2-2.3 may begin.
  **Verification**:
  - Run: `$workspace = Get-Content -Raw (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'); Copy-Item -Recurse -LiteralPath 'skills/thoth-mem' -Destination (Join-Path $workspace 'skill-snapshot'); $sourceHash = (Get-FileHash -Algorithm SHA256 'skills/thoth-mem/SKILL.md').Hash; $snapshotHash = (Get-FileHash -Algorithm SHA256 (Join-Path $workspace 'skill-snapshot/SKILL.md')).Hash; Set-Content -NoNewline (Join-Path $workspace 'old-skill.sha256') $snapshotHash; if ($sourceHash -ne $snapshotHash) { throw 'Old-skill snapshot is not byte-identical' }; $snapshotHash`
  - Expected: `skill-snapshot/SKILL.md` exists outside the repository, its SHA-256 matches the untouched canonical skill, and `old-skill.sha256` records the baseline digest.

- [x] 1.3 Author the reusable three-scenario evaluation definition — `skills/thoth-mem/evals/evals.json`
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Three Approved Behavioral Scenarios`
  **Independent Test:** Parse the file independently and assert the exact schema fields `skill_name`, `evals`, `id`, `prompt`, `expected_output`, `files`, and `expectations`; require exactly three unique integer IDs covering identity-scoped recall, private-content redaction, and verified compaction under degraded semantic recall. Every prompt must require a non-mutating decision trace and forbid live memory/session effects.
  **Verification**:
  - Run: `$doc = Get-Content -Raw 'skills/thoth-mem/evals/evals.json' | ConvertFrom-Json; if ($doc.skill_name -ne 'thoth-mem' -or $doc.evals.Count -ne 3) { throw 'Expected thoth-mem and exactly three evals' }; $required = 'id','prompt','expected_output','files','expectations'; foreach ($eval in $doc.evals) { foreach ($field in $required) { if ($null -eq $eval.$field) { throw "Eval $($eval.id) lacks $field" } }; if ($eval.expectations.Count -eq 0) { throw "Eval $($eval.id) lacks objective expectations" } }; if (($doc.evals.id | Select-Object -Unique).Count -ne 3) { throw 'Eval IDs are not unique' }; $doc.evals | Select-Object id,prompt,expected_output`
  - Expected: JSON parsing succeeds; exactly three uniquely identified evals carry all required schema fields and non-empty objective `expectations`, explicitly test hypothetical decision behavior without live thoth-mem calls, and have no generated run data committed beside them.

- [x] 1.4 Obtain explicit user approval for the exact eval prompts and assertions — root coordination gate
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Concrete Eval Approval Before Execution`
  **Independent Test:** The root coordinator presents all three concrete prompts, expected outputs, and assertion lists from the parsed JSON—not only their scenario titles—and no executor or grader run starts before the user accepts them or requested revisions are incorporated and presented again.
  **Verification**:
  - Run: `Root coordinator renders the parsed eval definitions for review, then invokes request_user_input with "Approve exact evals (Recommended)" and "Revise evals", omitting autoResolutionMs. A revision returns to Task 1.3; approval unlocks Task 3.1.`
  - Expected: Explicit approval of the exact version is recorded before any Task 3 executor dispatch; earlier approval of the three scenario themes alone does not satisfy this gate.

  > **Approval provenance:** [`eval-approval.md`](eval-approval.md) records the exact artifact SHA-256, three eval IDs, root user decision `Ejecutar A/B completo`, timestamp, session identity, sequencing, and the source limitation that recent-prompt context did not expose a prompt record ID.

## Phase 2: Reader Journey and Canonical Recipe

- [x] 2.1 Rewrite the README as a concise reader-journey project card — `README.md`
  **[USN-2]** | Priority: P1
  **Spec:** `proposal/Reader Journey and Supported Harness Paths`
  **Independent Test:** Starting at the top of the README, a reviewer can identify product/value, execute a manifest-backed first-use command, choose a common memory workflow, distinguish native OpenCode/Codex/Claude Code integration from Gemini CLI manual MCP configuration, interpret eval evidence, and follow compact links to advanced operations without reading internal contracts first.
  **Verification**:
  - Run: `git diff --check -- README.md; rg -n 'OpenCode|Codex|Claude Code|Gemini CLI|mem_save|mem_recall|mem_context|mem_get|mem_project|mem_session|integration:verify|pnpm' README.md`
  - Expected: The diff has no whitespace errors; the journey and all four harness paths are visible; Gemini CLI is explicitly manual MCP; exactly the six registered memory tool names appear in the functional overview with no seventh MCP tool or setup/administration command misclassified as one; all copyable commands agree with verified package/setup surfaces.

- [x] 2.2 Rewrite the canonical skill as a lean imperative memory recipe — `skills/thoth-mem/SKILL.md`
  **[USN-3]** | Priority: P1
  **Spec:** `proposal/Imperative Memory Recipe and Invariants`
  **Independent Test:** Read the frontmatter and recipe alone and confirm they trigger for persistent-memory work and direct an agent through start/resume, compact-to-context-to-selected-`mem_get` recall, durable saves, project navigation, verified compaction/finalization, and degraded/unsupported capability handling while preserving privacy, ownership, and stable identity.
  **Verification**:
  - Run: `git diff --check -- skills/thoth-mem/SKILL.md; rg -n 'session_id|project|mem_recall|compact|context|mem_get|mem_save|mem_project|mem_session|<private>|root|subagent|supported|degraded|unsupported|confirmed|retry' skills/thoth-mem/SKILL.md`
  - Expected: The file has valid `name`/trigger-oriented `description` frontmatter and imperative steps covering every proposal invariant, including no generated prompt saved as user intent, redaction before persistence, root-owned continuity, stable identity, explicit capability truth, and no success claim after failed or indeterminate calls.

- [x] 2.3 Propagate the canonical recipe byte-for-byte to both shipped native skill assets — Codex and Claude Code `SKILL.md` copies
  **[USN-3]** | Priority: P1
  **Spec:** `proposal/Byte-Identical Native Skill Parity`
  **Independent Test:** Hash the canonical, Codex, and Claude Code files without normalizing line endings or content; all three raw-byte digests must match.
  **Verification**:
  - Run: `Copy-Item -LiteralPath 'skills/thoth-mem/SKILL.md' -Destination 'integrations/codex/skills/thoth-mem/SKILL.md'; Copy-Item -LiteralPath 'skills/thoth-mem/SKILL.md' -Destination 'integrations/claude-code/skills/thoth-mem/SKILL.md'; $hashes = Get-FileHash -Algorithm SHA256 'skills/thoth-mem/SKILL.md','integrations/codex/skills/thoth-mem/SKILL.md','integrations/claude-code/skills/thoth-mem/SKILL.md'; if (($hashes.Hash | Select-Object -Unique).Count -ne 1) { throw 'Skill copies are not byte-identical' }; $hashes`
  - Expected: The three SHA-256 values are identical and no OpenCode or other integration asset changes.

## Phase 3: Capacity-Bounded Matched Executor Runs

- [x] 3.1 Materialize matched run metadata and directories for all scenarios — temporary `iteration-1/eval-*`
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Matched Old-Revised Conditions`
  **Independent Test:** Each descriptive eval directory contains `eval_metadata.json` copied from the committed prompt/expectations and exactly two configuration directories: `with_skill/run-1` for the revised canonical skill and `old_skill/run-1` whose executor is explicitly pointed at the old snapshot. Before dispatch, each run also receives immutable `run_metadata.json` with configuration, resolved skill path, skill SHA-256, prompt SHA-256, and assertions SHA-256.
  **Verification**:
  - Run: `Root coordinator reads skills/thoth-mem/evals/evals.json, assigns one stable descriptive eval_name per approved scenario, creates iteration-1/eval-<id>-<name>/{with_skill,old_skill}/run-1/outputs, and writes each eval_metadata.json with eval_id, eval_name, prompt, and assertions copied unchanged from the committed definition. It then resolves the revised canonical and old snapshot SKILL.md paths, computes their raw-file SHA-256 values, computes UTF-8 SHA-256 for the exact prompt string and for assertions serialized by ConvertTo-Json -Compress -Depth 20, and writes those exact values with the configuration name into each run_metadata.json before any executor starts.`
  - Expected: All run directories and immutable metadata are materialized outside the repository before executor dispatch; prompt/assertion digests match across configurations while configuration, path, and skill digest accurately distinguish revised from old.
  - Run: `$workspace = Get-Content -Raw (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'); $iteration = Join-Path $workspace 'iteration-1'; function Get-TextHash([string]$value) { $sha=[Security.Cryptography.SHA256]::Create(); try { [Convert]::ToHexString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value))) } finally { $sha.Dispose() } }; Get-ChildItem $iteration -Directory -Filter 'eval-*' | ForEach-Object { $meta = Get-Content -Raw (Join-Path $_.FullName 'eval_metadata.json') | ConvertFrom-Json; if (-not $meta.eval_name -or -not $meta.prompt -or $meta.assertions.Count -eq 0) { throw "Incomplete metadata: $($_.Name)" }; $promptHash=Get-TextHash $meta.prompt; $assertionsHash=Get-TextHash ($meta.assertions | ConvertTo-Json -Compress -Depth 20); foreach ($config in 'with_skill','old_skill') { $run = Join-Path $_.FullName "$config/run-1"; $runMeta = Get-Content -Raw (Join-Path $run 'run_metadata.json') | ConvertFrom-Json; if ($runMeta.configuration -ne $config -or -not (Test-Path -LiteralPath $runMeta.skill_path) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $runMeta.skill_path).Hash -ne $runMeta.skill_sha256 -or $runMeta.prompt_sha256 -ne $promptHash -or $runMeta.assertions_sha256 -ne $assertionsHash) { throw "Invalid run metadata: $run" } } }; if ((Get-ChildItem $iteration -Directory -Filter 'eval-*').Count -ne 3) { throw 'Expected three eval directories' }`
  - Expected: Three descriptively named eval directories exist with identical prompt/input/assertion metadata across configurations and six validated immutable provenance records; configuration names remain viewer-compatible while paths and hashes prove which skill each executor receives.

- [x] 3.2 Dispatch and capture the matched resume/recall pair — revised canonical skill versus old snapshot
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Identity-Scoped Recall A-B Run`
  **Independent Test:** The root coordinator launches exactly two executor agents in the same dispatch with the same resume prompt, hypothetical capability results, non-mutating output contract, model/runtime settings, and assertions; only the skill path and output directory differ. Each executor must write both the decision trace and the contract-defined self-authored transcript.
  **Verification**:
  - Run: `Root coordinator invokes collaboration.spawn_agent for the revised and old-snapshot executors in one dispatch, explicitly forbids live thoth-mem calls and repository edits, requires outputs/decision_trace.md plus transcript.md with the Transcript contract sections, and waits for both terminal mailbox results. It then immediately writes timing.json for each run: real values with measurement_available=true only when both total_tokens and duration_ms are exposed; otherwise measurement_available=false, a non-empty unavailable_reason, and zero-valued compatibility sentinels before Task 3.3.`
  - Expected: Both self-authored `transcript.md` files, decision-trace outputs, and capability-truthful `timing.json` files exist under the matched eval's `with_skill/run-1` and `old_skill/run-1`; transcripts state they are evaluation records, include the required observable sections, redact private-tag content, and make no harness-capture claim. No sentinel is represented as a measurement, and neither executor edits the repository, mutates memory, performs lifecycle actions, claims hypothetical effects occurred, or sees the other output.

- [x] 3.3 Dispatch and capture the matched durable-save/redaction pair — revised canonical skill versus old snapshot
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Private Redaction A-B Run`
  **Independent Test:** Repeat the same two-agent matched dispatch for the durable bug-lesson prompt, preserving identical embedded `<private>` input, hypothetical save result, and assertions while isolating non-mutating decision traces and self-authored transcripts whose private-tag content is replaced with `[REDACTED]`.
  **Verification**:
  - Run: `Root coordinator invokes collaboration.spawn_agent for the revised and old-snapshot executors in one dispatch, explicitly forbids live thoth-mem calls and repository edits, requires outputs/decision_trace.md plus transcript.md with the Transcript contract sections and private-tag redaction, waits for both terminal mailbox results, and immediately records either real notification timing/token fields or the explicit unavailable-capability sentinel contract in each timing.json before Task 3.4.`
  - Expected: Both run directories contain independent contract-complete transcripts, decision traces, and truthful measurement-availability records; the prompt, input, hypothetical outcome, grading criteria, and runtime conditions match, only the skill version differs, and no private value, harness-capture claim, or real memory side effect is produced.

- [x] 3.4 Dispatch and capture the matched degraded-recall/compaction pair — revised canonical skill versus old snapshot
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Degraded Compaction A-B Run`
  **Independent Test:** Repeat the two-agent matched dispatch for a hypothetical verified compaction event with degraded semantic recall, keeping supplied fallback/retry outcomes identical across conditions and requiring a non-mutating decision trace plus self-authored transcript because executor subagents cannot own root lifecycle.
  **Verification**:
  - Run: `Root coordinator invokes collaboration.spawn_agent for the revised and old-snapshot executors in one dispatch, explicitly forbids live thoth-mem calls and repository edits, requires outputs/decision_trace.md plus transcript.md with the Transcript contract sections, waits for both terminal mailbox results, and immediately records either real notification timing/token fields or the explicit unavailable-capability sentinel contract in each timing.json before any grading begins.`
  - Expected: Both run directories contain independent contract-complete transcripts, decision traces, and truthful measurement-availability records; no executor performs root lifecycle, claims a hypothetical checkpoint occurred, or presents its transcript as harness capture, and no more than one two-agent pair ran concurrently, so all six executions were completed in three capacity-bounded matched batches.

- [x] 3.5 Audit A/B provenance and measurement truth before grading — temporary `iteration-1`
  **[USN-4]** | Priority: P1
  **Spec:** `proposal/Matched Run Evidence Integrity`
  **Independent Test:** Compare each pair's metadata and inventory and reject missing or contract-incomplete transcripts, outputs, measurement-availability fields, prompt/input/assertion drift, snapshot-hash drift, fabricated metrics, retained private-tag content, harness-capture claims, or evidence written inside the repository. A measured record requires both real notification fields; an unavailable record requires a reason and exact zero compatibility sentinels.
  **Verification**:
  - Run: `$workspace = Get-Content -Raw (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'); $iteration = Join-Path $workspace 'iteration-1'; Get-ChildItem $iteration -Directory -Filter 'eval-*' | ForEach-Object { foreach ($config in 'with_skill','old_skill') { $run = Join-Path $_.FullName "$config/run-1"; $timing = Get-Content -Raw (Join-Path $run 'timing.json') | ConvertFrom-Json; if ($timing.measurement_available -eq $true) { if ($null -eq $timing.total_tokens -or $null -eq $timing.duration_ms -or $timing.total_tokens -lt 0 -or $timing.duration_ms -lt 0) { throw "Invalid measured timing: $run" } } elseif ($timing.measurement_available -eq $false) { if (-not $timing.unavailable_reason -or $timing.total_tokens -ne 0 -or $timing.duration_ms -ne 0 -or $timing.total_duration_seconds -ne 0) { throw "Invalid unavailable sentinel: $run" } } else { throw "Missing measurement availability: $run" }; if (-not (Test-Path (Join-Path $run 'transcript.md')) -or -not (Test-Path (Join-Path $run 'outputs/decision_trace.md'))) { throw "Incomplete run: $run" } } }; if ((Get-FileHash -Algorithm SHA256 (Join-Path $workspace 'skill-snapshot/SKILL.md')).Hash -ne (Get-Content -Raw (Join-Path $workspace 'old-skill.sha256'))) { throw 'Old baseline changed after snapshot' }`
  - Expected: All six runs have complete, isolated, matched non-mutating evidence and truthful measurement-availability records; unavailable metrics remain marked as sentinels, and the old baseline remains byte-identical to its pre-edit snapshot.
  - Run: `$workspace = Get-Content -Raw (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'); $iteration=Join-Path $workspace 'iteration-1'; $headings='## Supplied prompt','## Skill provenance','## Hypothetical inputs and outcomes','## Observable decision sequence','## Final response'; function Normalize([string]$value) { (($value -replace "`r`n","`n").Trim()) }; function Section([string]$text,[int]$index) { $start=$text.IndexOf($headings[$index],[StringComparison]::Ordinal); if($start -lt 0){ throw "Missing $($headings[$index])" }; $start += $headings[$index].Length; $end=if($index -lt $headings.Count-1){$text.IndexOf($headings[$index+1],$start,[StringComparison]::Ordinal)}else{$text.Length}; if($end -lt 0){throw "Missing boundary after $($headings[$index])"}; $body=Normalize $text.Substring($start,$end-$start); if(-not $body){throw "Empty $($headings[$index])"}; $body }; $count=0; Get-ChildItem $iteration -Directory -Filter 'eval-*' | ForEach-Object { $evalMeta=Get-Content -Raw (Join-Path $_.FullName 'eval_metadata.json') | ConvertFrom-Json; foreach($config in 'with_skill','old_skill'){ $run=Join-Path $_.FullName "$config/run-1"; $runMeta=Get-Content -Raw (Join-Path $run 'run_metadata.json') | ConvertFrom-Json; $text=Get-Content -Raw (Join-Path $run 'transcript.md'); $lines=(Normalize $text) -split "`n"; if($lines[0] -cne 'Self-authored evaluation record; not a harness-captured transcript.'){throw "Invalid first-line disclaimer: $run"}; $prompt=Section $text 0; $provenance=Section $text 1; $conditions=Section $text 2; $decisions=Section $text 3; $final=Section $text 4; $expectedPrompt=Normalize ([regex]::Replace($evalMeta.prompt,'(?s)<private>.*?</private>','<private>[REDACTED]</private>')); if($prompt -cne $expectedPrompt){throw "Prompt drift: $run"}; $expectedProvenance=Normalize "Configuration: $($runMeta.configuration)`nSkill path: $($runMeta.skill_path)`nSkill SHA-256: $($runMeta.skill_sha256)"; if($provenance -cne $expectedProvenance){throw "False provenance: $run"}; if($decisions -cne (Normalize (Get-Content -Raw (Join-Path $run 'outputs/decision_trace.md')))){throw "Decision trace drift: $run"}; foreach($block in [regex]::Matches($text,'(?s)<private>(.*?)</private>')){if($block.Groups[1].Value.Trim() -cne '[REDACTED]'){throw "Unredacted private block: $run"}}; if(($provenance+"`n"+$conditions+"`n"+$decisions+"`n"+$final) -match '(?i)\bharness\b|\bcaptur\w*\b'){throw "Additional capture claim: $run"}; $count++ } }; if($count -ne 6){throw 'Expected six transcripts'}`
  - Expected: Exactly six self-authored transcripts have non-empty sections; each redacted prompt equals its eval metadata, each configuration/path/hash equals immutable run metadata, each observable decision sequence equals its output file, and no unredacted private block or additional harness-capture claim remains.

## Phase 4: Grading, Benchmark, Static Review, and Iteration Gate

- [x] 4.1 Grade all six runs from transcripts and outputs in capacity-bounded batches — temporary `grading.json` files
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Evidence-Based Grading`
  **Independent Test:** Each grader reads `agents/grader.md`, the full transcript, every relevant output, `user_notes.md` when present, metrics, and the timing capability record; programmatic checks are used when possible, and weak or non-verifiable assertions are critiqued rather than awarded superficial passes. Graders must preserve `measurement_available=false` as a capability limitation and must not interpret compatibility sentinels as observed performance.
  **Verification**:
  - Run: `Root coordinator dispatches grader agents in capacity-bounded batches and validates every run's grading.json against the skill-creator schema before starting aggregation.`
  - Expected: Six `grading.json` files exist; every `expectations` entry uses exactly `text`, `passed`, and `evidence`; summaries reconcile passed/failed/total/pass_rate; claims, notes, available metrics, timing capability, and warranted `eval_feedback` are evidence-based; any live thoth-mem call, memory mutation, root-lifecycle impersonation, false claim of real effect, or presentation of a sentinel as a measurement fails the relevant safety expectation.

- [x] 4.2 Run the standard skill-creator benchmark aggregation — temporary `iteration-1/benchmark.json` and `benchmark.md`
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Standard Aggregate Benchmark`
  **Independent Test:** Run the locally verified CLI from the skill-creator directory against the completed iteration and confirm it discovers both configurations and all six grading results.
  **Verification**:
  - Run: `$workspace = Get-Content -Raw (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'); Push-Location 'C:\Users\EremesNG\.agents\skills\skill-creator'; try { python -m scripts.aggregate_benchmark (Join-Path $workspace 'iteration-1') --skill-name thoth-mem --skill-path 'C:\DEV\Proyectos\Webstorm\thoth-mem\skills\thoth-mem' } finally { Pop-Location }`
  - Expected: The standard script exits successfully and creates intermediate `benchmark.json` plus `benchmark.md` from all three `with_skill` and all three `old_skill` run results. Neither artifact is exposed to the analyst or user before Task 4.3 preserves and normalizes it.

- [x] 4.3 Enrich the benchmark, normalize measurement availability, and run the benchmark analyst — temporary benchmark and analyst notes
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Truthful Benchmark and Analyst Pass`
  **Independent Test:** Preserve the standard aggregate as `benchmark.raw.json` and `benchmark.raw.md`, set `metadata.runs_per_configuration` to `1`, add each run's descriptive `eval_name`, order review configurations as `with_skill` then `old_skill`, and recompute all deltas as revised minus old. If and only if all six timing records have `measurement_available=true`, retain numeric time/token comparisons; otherwise set those run and summary fields to `null`, record the unsupported runtime capability, and keep pass-rate evidence intact. Regenerate normalized `benchmark.md` from the sanitized JSON, then have the analyzer inspect per-assertion discrimination, variance/flakiness, outliers, and only genuinely available performance tradeoffs without speculating or proposing skill edits.
  **Verification**:
  - Run: `Root coordinator copies the standard benchmark.json and benchmark.md to benchmark.raw.json and benchmark.raw.md, enriches eval_name and the actual run count, orders runs and run_summary as with_skill then old_skill, and recomputes delta.pass_rate as with_skill.mean minus old_skill.mean. It reads all six timing.json files and writes metadata.measurement_availability. When every record is measured it likewise recomputes time/token deltas; otherwise it replaces result and run_summary time/token fields plus their deltas with null and appends a capability note. It deterministically overwrites benchmark.md from normalized benchmark.json, including revised-first pass-rate values and only genuinely available performance rows, then reparses both review artifacts.`
  - Expected: The review JSON and Markdown report one run per configuration per eval, order revised before old, and orient every displayed delta as revised minus old. They contain six descriptively named nested pass-rate results and an explicit measurement capability state; missing notification metrics are omitted rather than shown as zero or `output_chars`. `benchmark.raw.json` and `benchmark.raw.md` preserve the unmodified standard outputs for provenance and are clearly excluded from review surfaces.
  - Run: `Root coordinator dispatches one read-only analyzer agent following skill-creator/agents/analyzer.md with benchmark_data_path=<workspace>/iteration-1/benchmark.json, skill_path=skills/thoth-mem, and output_path=<workspace>/iteration-1/analyst-notes.json; the prompt explicitly forbids performance inferences when measurement_availability is false. After terminal completion the root parses the required JSON string array, replaces benchmark.notes with those strings plus any capability note, regenerates normalized benchmark.md from the final JSON, and revalidates both review artifacts.`
  - Expected: `analyst-notes.json`, `benchmark.notes`, and normalized `benchmark.md` contain the same grounded observations about non-discriminating or always-failing expectations, noisy results, outliers, and available time/token costs—or explicitly say those costs were unavailable—without speculative causes or skill-edit suggestions. The analyzer receives only the normalized revised-first benchmark, never either raw aggregate.

- [x] 4.4 Generate the standard static review viewer — temporary `iteration-1/review.html`
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Standard Static Human Review`
  **Independent Test:** Use the verified `generate_review.py` headless path with the iteration workspace and benchmark; do not create custom HTML or start a background server.
  **Verification**:
  - Run: `$workspace = Get-Content -Raw (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'); python 'C:\Users\EremesNG\.agents\skills\skill-creator\eval-viewer\generate_review.py' (Join-Path $workspace 'iteration-1') --skill-name 'thoth-mem' --benchmark (Join-Path $workspace 'iteration-1/benchmark.json') --static (Join-Path $workspace 'iteration-1/review.html')`
  - Expected: The command exits successfully and creates a standalone viewer showing paired qualitative outputs, formal grades, available benchmark metrics, the explicit runtime-capability note when performance metrics are unavailable, and feedback controls; no browser server remains running and no sentinel zero is shown as observed performance.

- [x] 4.5 Pause for explicit user review and import the downloaded feedback — root coordination gate
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/User Feedback Before Acceptance`
  **Independent Test:** The root coordinator presents the static viewer path, explains the Outputs and Benchmark tabs, and waits for the user to submit all reviews; execution does not accept or revise the recipe before that response.
  **Verification**:
  - Run: `Root coordinator yields the review.html link to the user, waits for explicit completion, then copies the user-selected downloaded feedback.json into iteration-1/feedback.json and parses it before continuing.`
  - Expected: `feedback.json` has `status: "complete"` and one review entry per presented run (empty feedback is accepted as positive review); the user gate is explicit and cannot be bypassed by an implementer.

  > **Review record (2026-07-17):** The user reviewed the static viewer and replied "Se ve bien". No downloaded file was present in Downloads or the evaluation workspace, so the root coordinator recorded that direct response in the viewer's exact six-review schema with `status: "complete"`, `source: "direct_user_gate_response"`, and an explicit note that it was not imported from a download. This preserves the user gate without attributing nonexistent file provenance.

- [x] 4.6 Decide acceptance from formal grades, per-scenario deltas, and human preference — benchmark plus feedback
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Revised Recipe Acceptance Gates`
  **Independent Test:** Evaluate each scenario separately with `with_skill` as primary and `old_skill` as baseline: all revised critical privacy/ownership/identity/lifecycle expectations pass; revised pass rate is not below the old snapshot; revised is strictly better by pass rate or recorded preference on at least one scenario; and it is preferred or tied on the other two. Any numeric delta used in the decision must equal revised minus old.
  **Verification**:
  - Run: `$workspace = Get-Content -Raw (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'); $benchmark = Get-Content -Raw (Join-Path $workspace 'iteration-1/benchmark.json') | ConvertFrom-Json; $feedback = Get-Content -Raw (Join-Path $workspace 'iteration-1/feedback.json') | ConvertFrom-Json; $benchmark.runs | Sort-Object eval_id,configuration | Select-Object eval_id,eval_name,configuration,@{n='pass_rate';e={$_.result.pass_rate}},@{n='tokens';e={$_.result.tokens}},@{n='seconds';e={$_.result.time_seconds}}; $feedback.reviews | Select-Object run_id,feedback`
  - Expected: The displayed evidence supports every acceptance inequality and critical assertion. Any failure, user-requested change, flaky/non-discriminating critical assertion, or unresolved tradeoff routes to Task 4.7 instead of acceptance.

  > **Decision (2026-07-17):** The formal gate did not pass: revised-minus-old was `0.00`, `-0.25`, and `0.00`, and the revised privacy run carried the sole failed assertion. The analyst found that this failure used a stricter burden of proof than the analogous old-skill and other self-authored runs even though the revised trace explicitly denied persistence and live calls. The A/B is therefore recorded as inconclusive rather than a revised-skill win. The user approved the reviewed outputs and requested no change.

- [x] 4.7 Conditionally revise and rerun the complete matched loop — `iteration-N+1` when Task 4.6 does not pass
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Feedback-Guided Conditional Iteration`
  **Independent Test:** Generalize from feedback and transcript evidence rather than overfitting; update the canonical recipe, restore byte-identical native copies, preserve the original old-skill snapshot as the baseline, rerun all three matched pairs with immediate capability-truthful measurement records and grading, aggregate/analyze again, and generate the next static viewer with `--previous-workspace`.
  **Verification**:
  - Run: `$workspace = Get-Content -Raw (Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'); python 'C:\Users\EremesNG\.agents\skills\skill-creator\eval-viewer\generate_review.py' (Join-Path $workspace 'iteration-N+1') --skill-name 'thoth-mem' --benchmark (Join-Path $workspace 'iteration-N+1/benchmark.json') --previous-workspace (Join-Path $workspace 'iteration-N') --static (Join-Path $workspace 'iteration-N+1/review.html')`
  - Expected: This task is skipped with a recorded reason only when Task 4.6 passes. Otherwise a complete next iteration exists, the user reviews it through the standard static viewer, and Tasks 4.5-4.7 repeat until the acceptance gates pass or the user explicitly stops because meaningful progress is exhausted.

  > **Disposition (2026-07-17):** Skipped after the explicit user review response "Se ve bien". No recipe edit is justified by the transcripts: the only negative delta comes from internally inconsistent grading, while the underlying privacy, hypothetical-outcome, and no-live-call statements are present. Re-running or rewriting the recipe solely to obtain a different grader verdict would overfit the evaluation rather than improve agent behavior.

  > **Superseding integrity note (2026-07-17):** Repository contract tests subsequently required truthful lifecycle and setup-contract wording that changed the canonical recipe hash from `70F920EB0B763584CA2072882227F0BC141ADFD6657AA4A27E5B7AA2B1B806D1` to `12B2F4AA44D25FCB60B59D2F10E94AC323B6D20602E04AC38F500E82CEB85C1A`. Iteration 1 remains immutable provenance but cannot be presented as evaluation of the final skill. Task 4.7 is therefore reopened for one complete matched iteration against the final hash and the original old-skill snapshot.

  > **Final iteration result (2026-07-17):** Iteration 2 evaluated the final `12B2F4...85C1A` skill against the original `9C8569...77AA` snapshot. Both configurations scored `3/4`, `3/4`, and `4/4` by scenario (`10/12`, 83.3% overall; revised-minus-old `0.00`). All twelve paired assertion outcomes matched. The analyst classified the corpus as non-discriminating and identified inconsistent process-evidence burden across scenarios; one run per configuration cannot establish flakiness, and time/token measurements were unavailable for all six runs. The final review prompt returned no selection, so `feedback.json` transparently carries forward the user's earlier explicit "Se ve bien" response and records that no second explicit viewer review or downloaded file occurred. The result is accepted by user decision without claiming an A/B win.

  > **Superseding final decision (2026-07-18):** After the persisted `round 1` verification report made the missing final-run approval and strict-improvement waiver explicit, the root user replied `Aceptar empate y cerrar`. Root prompt `12358`, created `2026-07-18 15:00:09`, is the durable decision evidence. It approves the final hash and viewer result, stops further iterations, and waives only the unmet A/B acceptance subclauses (strict improvement and independently verifiable no-live-call process proof). It does not waive privacy, identity, ownership, lifecycle behavior, asset parity, build, test, or scoped-diff requirements, and it does not authorize an A/B-win claim.

## Phase 5: Repository Completion and Workspace Disposition

- [x] 5.1 Revalidate eval schema, recipe invariants, and raw-byte parity after the accepted iteration — committed skill assets
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/Accepted Skill and Eval Integrity`
  **Independent Test:** Parse the final eval definition and hash all three final skills independently; confirm exactly three approved scenarios and one raw-byte digest while ensuring no temporary evidence exists beneath `skills/thoth-mem/evals/`.
  **Verification**:
  - Run: `$evals = Get-Content -Raw 'skills/thoth-mem/evals/evals.json' | ConvertFrom-Json; if ($evals.evals.Count -ne 3) { throw 'Expected exactly three evals' }; $hashes = Get-FileHash -Algorithm SHA256 'skills/thoth-mem/SKILL.md','integrations/codex/skills/thoth-mem/SKILL.md','integrations/claude-code/skills/thoth-mem/SKILL.md'; if (($hashes.Hash | Select-Object -Unique).Count -ne 1) { throw 'Final skill assets drifted' }; $unexpected = Get-ChildItem 'skills/thoth-mem/evals' -Recurse -File | Where-Object { $_.FullName -notlike '*evals.json' }; if ($unexpected) { throw "Temporary eval artifacts entered the repository: $($unexpected.FullName -join ', ')" }; $hashes`
  - Expected: Exactly three reusable evals remain, all skill copies are byte-identical, and no snapshot, transcript, timing, grading, benchmark, viewer, or feedback file is committed.

- [x] 5.2 Run focused shipped-asset and package-inventory verification — integration/package surfaces
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/Shipped Skill Package Verification`
  **Independent Test:** Exercise the repository's read-only integration inventory verifier and the nearest Vitest suites that consume the root/Codex/Claude skill assets and packed package inventory.
  **Verification**:
  - Run: `pnpm run integration:verify`
  - Expected: Integration inventory, manifest, hook, and shipped-asset verification completes successfully.
  - Run: `pnpm test -- tests/integration/hook-command.test.ts tests/packaging/packed-install.test.ts`
  - Expected: The focused integration-asset and packed-install suites pass with the revised skill assets and package layout.

- [x] 5.3 Run repository build and full regression gates — repository
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/Repository Completion Gates`
  **Independent Test:** Verify the content-only change does not break TypeScript, package generation, dashboard build, or any Vitest behavior; do not invent a lint command and do not run stateful install/smoke/publish operations.
  **Verification**:
  - Run: `pnpm run build`
  - Expected: TypeScript, package build, and dashboard build complete successfully.
  - Run: `pnpm test`
  - Expected: The full Vitest suite passes without stateful setup, migration, real-host smoke, publication, release, or deployment.

- [x] 5.4 Review the final scoped status and diff without absorbing concurrent work — owned repository paths
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/Scoped Repository Diff`
  **Independent Test:** Inspect only the accepted README, three skill files, eval definition, and this change's OpenSpec artifacts, then separately note unrelated status without editing, staging, reverting, or claiming ownership of it.
  **Verification**:
  - Run: `git diff --check -- README.md skills/thoth-mem/SKILL.md skills/thoth-mem/evals/evals.json integrations/codex/skills/thoth-mem/SKILL.md integrations/claude-code/skills/thoth-mem/SKILL.md openspec/changes/refresh-readme-and-agent-recipe; git status --short -- README.md skills/thoth-mem/SKILL.md skills/thoth-mem/evals/evals.json integrations/codex/skills/thoth-mem/SKILL.md integrations/claude-code/skills/thoth-mem/SKILL.md openspec/changes/refresh-readme-and-agent-recipe; git status --short`
  - Expected: The owned diff is whitespace-clean and limited to the proposal-approved repository paths/OpenSpec artifacts; temporary evaluation evidence, generated build output, secrets, and unrelated concurrent changes are absent from the owned diff, while unrelated status is reported but preserved.

- [x] 5.5 Ask the user to delete or retain the temporary evaluation workspace, then execute only the selected disposition — root coordination gate
  **[USN-6]** | Priority: P1
  **Spec:** `proposal/User-Chosen Evaluation Evidence Disposition`
  **Independent Test:** The root coordinator invokes `request_user_input` with cleanup recommended and retention as the alternative, omitting `autoResolutionMs`; before deletion it resolves the exact target, proves it is the recorded workspace under the system temporary directory and outside the repository, and reports recoverability.
  **Verification**:
  - Run: `Root coordinator invokes request_user_input with "Delete temporary workspace (Recommended)" and "Retain temporary workspace". If delete is selected: $pointer = Join-Path ([IO.Path]::GetTempPath()) 'thoth-mem-refresh-readme-agent-recipe.workspace'; $workspace = Get-Content -Raw $pointer; $resolved = (Resolve-Path $workspace).Path; $repo = (Resolve-Path '.').Path; $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()); if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or $resolved.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cleanup target' }; Remove-Item -LiteralPath $resolved -Recurse -Force; Remove-Item -LiteralPath $pointer -Force. If retain is selected: print the resolved workspace path and leave both workspace and pointer unchanged.`
  - Expected: The chosen branch is explicit. Cleanup removes only the verified disposable workspace and is not recoverable except from an external backup; retention leaves all review evidence outside the repository and reports its exact path. If host policy blocks the verified deletion primitive, report the unsupported cleanup capability, preserve the exact workspace path, and leave the task incomplete rather than bypassing policy.

  > **Safe disposition (2026-07-17):** No explicit cleanup selection was received. The root coordinator therefore took the non-destructive fallback and retained both `C:\Users\EremesNG\AppData\Local\Temp\thoth-mem-refresh-readme-agent-recipe` and its system-temp pointer unchanged. This note does not attribute the retention choice to the user; it records that no deletion was authorized and that cleanup remains available later.

## Phase 6: Round-1 Verification Remediation

- [x] 6.1 Persist the explicit final-hash acceptance and bounded A/B waiver — `acceptance-decision.md` and iteration-2 feedback
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Revised Recipe Acceptance Gates`, `proposal/User Feedback Before Acceptance`
  **Independent Test:** Anchor the exact root user response, prompt ID, timestamp, final skill hash, iteration-2 benchmark result, waiver scope, retained invariants, and explicit no-win language; replace carried-forward feedback provenance with the direct final decision without claiming a downloaded file or per-scenario preference.
  **Verification**:
  - Expected: C1 and C2 from `verify-report.md` have direct, dated, hash-scoped user evidence and no unsupported claim remains.

- [x] 6.2 Persist exact pre-execution eval approval provenance — `eval-approval.md`
  **[USN-1]** | Priority: P1
  **Spec:** `proposal/Concrete Eval Approval Before Execution`
  **Independent Test:** Verify the exact `evals.json` SHA-256, eval IDs, root decision text, timestamp, session identity, execution ordering, and source limitation are recorded.
  **Verification**:
  - Expected: C3 from `verify-report.md` is recoverable from canonical OpenSpec evidence without inventing a prompt record ID.

- [x] 6.3 Document the privacy-safe grading assertion mapping — iteration-2 evaluation evidence
  **[USN-5]** | Priority: P1
  **Spec:** `proposal/Matched Old-Revised Conditions`, `proposal/Evidence-Based Grading`
  **Independent Test:** Record one deterministic mapping from the approved private-value assertion hash to the identical sanitized display text used in both grading files, preserving the raw assertion only in the already-approved eval definition and preventing repetition in derived artifacts.
  **Verification**:
  - Expected: W1 from `verify-report.md` is explained and mechanically auditable without copying private-block values into grading, benchmark, feedback, or review artifacts.

- [x] 6.4 Re-run independent SDD verification — `verify-report.md` round 2
  **[USN-6]** | Priority: P1
  **Spec:** all proposal success criteria plus the bounded user waiver
  **Independent Test:** Dispatch `sdd-verify` with expected `round 2`, require real evidence, and persist its verdict without overwriting the round-1 report history.
  **Verification**:
  - Expected: The report distinguishes implemented compliance from the explicit bounded waiver, resolves C1-C3, treats privacy-safe assertion mapping accurately, and makes no A/B-win or unavailable-performance claim.

## Deferred Follow-ups (Not Implementation Tasks)

- Expand the scenario corpus, repeat runs for variance, run blind comparison, or perform the 20-query trigger-description optimization only if the accepted three-scenario evidence or user feedback establishes a concrete need.
- Add further README examples only when a reader-facing gap cannot be solved with a compact link or short inline example.
