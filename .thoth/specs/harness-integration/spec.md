# Harness Integration

## Requirements

### Requirement: Every Native Plugin MUST Bundle Hooks, MCP, and Skills

Every supported host bundle, including Pi, MUST package its supported lifecycle hooks, one registration path for the shared memory tool surface, and the same canonical memory Skill without stale copied contracts; MCP hosts expose the exact six-tool surface, while Pi MUST expose `mem_save`, `mem_recall`, `mem_context`, `mem_get`, and `mem_project` through its native extension API with the shared definitions and MUST NOT expose `mem_session` to the model because its extension hooks perform every root lifecycle operation through the extension's own MCP client; Pi MUST delegate execution to the existing MCP server rather than requiring a community MCP adapter or importing the SQLite runtime into the Pi process.

#### Scenario: Every Native Plugin MUST Bundle Hooks, MCP, and Skills

- **GIVEN** the native Pi package is loaded
- **WHEN** Pi enumerates extension tools and later runs its session lifecycle hooks
- **THEN** it sees exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, and `mem_project` with the shared compact definitions, and the hooks still enroll, recover, capture, checkpoint, guide, and finalize through `mem_session`

### Requirement: Runtime Lifecycle MUST Preserve the Core Contract

OpenCode, Codex, Claude Code, and Pi lifecycle adapters MUST normalize only fields their supported native contracts actually provide and MUST apply shared privacy sanitation before content-derived identity; Pi MUST map documented session start, admitted root input, context preparation, pre-compaction, successful compaction, failed compaction, settled-agent, and shutdown events onto enroll, recover, capture-root (one ordered root-prompt evidence event per distinct sanitized interactive or RPC input), checkpoint-pre-compact, guide-post-compact, non-finalizing degradation or flush, and a single finalize, and agent-settled or failed-compaction events MUST NOT finalize; where a native contract provides the host's own generated compaction summary text (Pi `session_compact` compaction entry summary, Claude Code `PostCompact` `compact_summary`, and the OpenCode assistant summary message readable after `session.compacted`) the adapter MUST forward it as `guide_post_compact` content, while Codex and any host without such a documented field MUST NOT parse transcripts for it; forwarded compaction text and prompt, model, tool, summary, or lifecycle content MUST NOT be automatically promoted to memories or observations and MAY only become session evidence and harness-derived session summaries.

#### Scenario: Runtime Lifecycle MUST Preserve the Core Contract

- **GIVEN** Pi reports a successful compaction whose entry carries the default structured summary text
- **WHEN** the lifecycle hooks execute
- **THEN** thoth-mem checkpoints before compaction, forwards the text with guide-post-compact so it is stored as checkpoint evidence with a harness-derived session summary citing it, creates no memory or observation, and refreshes the next bounded recovery block

### Requirement: Root Session Identity MUST Be Verified and Host-Specific Only at the Adapter

Native adapters, including Pi, MUST resolve the Git common-directory UUID or explicit non-Git path identity from the host working directory, pass an initial display-name hint only for adoption, and preserve the exact canonical project key with a stable root session identity; Pi MUST use its documented session identity and working directory, while delegated, ambiguous, incomplete, or child-key-mismatched identity and any server-assigned generic MCP connection session MUST NOT receive root authority.

#### Scenario: Root Session Identity MUST Be Verified and Host-Specific Only at the Adapter

- **GIVEN** a delegated, ambiguous, incomplete, or child-key-mismatched Pi identity or a generic MCP connection session
- **WHEN** it attempts root-only capture, recovery injection, lifecycle summary submission, or observation review or promotion
- **THEN** it receives no root authority and no unverified context is injected

### Requirement: Automatic Capture MUST Remain Privacy-Safe and Minimal

Native adapters MUST continue their root allowlists and privacy filtering and MUST NOT automatically convert arbitrary prompts, assistant text, tool output, delegated output, summaries, or lifecycle content into observation candidates or memories.

#### Scenario: US2 - Review and explicitly promote a candidate 1

- **GIVEN** a pending candidate
- **WHEN** a verified root reviewer accepts it using a canonical policy basis appropriate to the claim
- **THEN** an immutable review event records reviewer actor/authority, reason, policy identifier/version, and source support without mutating candidate content

#### Scenario: US2 - Review and explicitly promote a candidate 2

- **GIVEN** a pending candidate
- **WHEN** it is rejected
- **THEN** the rejection remains inspectable and the candidate can never be promoted by similarity, confidence, lifecycle, replay, or a later conflicting verdict

#### Scenario: US2 - Review and explicitly promote a candidate 3

- **GIVEN** an accepted candidate
- **WHEN** explicit promotion succeeds
- **THEN** candidate, review, promotion evidence, resulting memory, original supports, receipt, topic supersession, and FTS visibility commit atomically and a replay returns the same memory

#### Scenario: US2 - Review and explicitly promote a candidate 4

- **GIVEN** a pending/rejected candidate, degraded/delegated identity, unsupported policy basis, or promoted content that adds an unsupported claim
- **WHEN** promotion is attempted
- **THEN** it fails with zero durable or FTS side effects

#### Scenario: US2 - Review and explicitly promote a candidate 5

- **GIVEN** a later correction or contradiction
- **WHEN** it is recorded
- **THEN** it creates a new supported candidate and uses existing memory supersession/retraction semantics after review rather than rewriting the prior observation or verdict

#### Scenario: US3 - Inspect candidates without contaminating recall 1

- **GIVEN** pending, accepted, rejected, and promoted observations
- **WHEN** `mem_project` requests observations with project/session/status bounds
- **THEN** it returns a deterministic capped queue with stable IDs, compact metadata, and no raw support payloads

#### Scenario: US3 - Inspect candidates without contaminating recall 2

- **GIVEN** one selected observation ID
- **WHEN** `mem_get` expands it
- **THEN** it returns only that candidate, generator, scope, supports, immutable review lineage, promotion mapping, and related temporal memory IDs

#### Scenario: US3 - Inspect candidates without contaminating recall 3

- **GIVEN** any unpromoted observation
- **WHEN** compact recall, context, briefing, or native recovery runs
- **THEN** the observation is absent and existing memory/summary ordering, payload budget, trust boundary, and FTS rows remain unchanged

#### Scenario: US3 - Inspect candidates without contaminating recall 4

- **GIVEN** candidate similarity or related-memory surfacing during explicit review
- **WHEN** lexical scoring runs
- **THEN** the bounded scores are advisory diagnostics only and cannot accept, reject, supersede, or promote any record

### Requirement: Model-Visible Recovery Context MUST Be Bounded and Source-Attributed

Model-visible verified identity MUST carry the exact canonical `project_key` plus the database-persisted `project_name` within the existing host cap; parent validators MUST require key equality with local dispatch and require the returned name to be safe and identical between lifecycle envelope and recovery header, but MUST NOT compare it to a pre-adoption folder-name hint.

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 1

- **GIVEN** a Git repository without a thoth-mem identity
- **WHEN** verified native identity resolves concurrently for the first time
- **THEN** exactly one fully written UUID marker is published atomically without replacement in the Git common directory and every caller returns `git:<uuid>`

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 2

- **GIVEN** a repository with an existing local UUID
- **WHEN** its working directory is moved from one path or drive to another
- **THEN** the UUID-backed project key remains unchanged and the new path is recorded as an alias

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 3

- **GIVEN** a repository folder renamed from `thoth-mem` to `thoth-memory`
- **WHEN** lifecycle resumes
- **THEN** the project key remains unchanged and its persisted display name changes only through the explicit rename CLI

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 4

- **GIVEN** a main worktree and linked worktrees such as `thoth-mem-imp-size`
- **WHEN** any worktree runs lifecycle, save, or recall
- **THEN** all use the same canonical project while their exact paths remain separately observable aliases

#### Scenario: US1 - Keep one project across moves, renames, and worktrees 5

- **GIVEN** two independent clones of the same remote
- **WHEN** each resolves identity
- **THEN** each receives a different local UUID unless a future explicit linking operation is requested

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 1

- **GIVEN** a verified Git project and root session
- **WHEN** native recovery renders
- **THEN** it exposes `root_session_id`, `project_key=git:<uuid>`, and the database-persisted `project_name` as separate bounded values

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 2

- **GIVEN** the OpenCode read-only identity helper before lifecycle adoption
- **WHEN** it verifies a root caller
- **THEN** its versioned result returns the exact UUID-backed key plus a non-authoritative `project_name_hint`; after lifecycle, the persisted name in the verified recovery block prevails

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 3

- **GIVEN** a save, recall, context, project, or session MCP call
- **WHEN** the agent maps verified identity
- **THEN** it copies the key verbatim, treats `project_name` as creation/display metadata only, and never substitutes the display name, current path, Git remote, branch, worktree name, host project ID, or recalled content for the key

#### Scenario: US2 - Propagate exact identity through every native and MCP boundary 4

- **GIVEN** a lifecycle child response with a changed/missing key or a name that is unsafe or inconsistent with its recovery header
- **WHEN** the host validates it
- **THEN** no unverified memory context is injected and the host continues with bounded degradation

### Requirement: Lifecycle Events MUST Be Idempotent and Truthful

Stable capture keys MUST identify distinct sanitized root-user submissions rather than only their enclosing turn; a native immutable message ID MUST be used when available, otherwise, including for Pi root input, a deterministic key MUST bind documented stable session or turn fields with the sanitized prompt fingerprint so different prompts remain distinct and exact retries remain idempotent; harness-derived and host-harvested session summaries MUST be idempotent per session and latest non-summary evidence sequence, so a replayed lifecycle event or lazy derivation returns the identical canonical summary or none, and persisting a summary MUST NOT itself trigger another derivation.

#### Scenario: Lifecycle Events MUST Be Idempotent and Truthful

- **GIVEN** two different interactive or RPC root inputs, an exact retry of one, and then a replayed finalize
- **WHEN** the events are processed
- **THEN** the prompts receive distinct capture keys, the retry is a duplicate, and the replayed finalize returns the original derived summary without creating a new version

### Requirement: Native Failures MUST Degrade Without Blocking the Host Prompt

Child launch, timeout, nonzero exit, protocol failure, oversized output, invalid envelope, tool bridge failure, or unverifiable identity in any native adapter, including Pi, MUST produce bounded safe diagnostics, inject no unverified memory, and MUST NOT reject an otherwise valid host prompt; a schema migration failure or locked database MUST surface a bounded diagnostic naming the failing revision step and recommending `thoth-mem migrate` through the MCP server startup error, the lifecycle CLI stderr forwarded by the public runner, and the OpenCode lifecycle log; Pi and OpenCode MUST distinguish a memory-server startup or lifecycle timeout and show at most once per session a bounded hint that the user can run `thoth-mem migrate` if memory stays unavailable, without claiming that a migration is pending; Pi tool calls MUST cross the package-relative Node boundary to the existing MCP server with the same storage, identity, privacy, validation, and error semantics as direct MCP use; the Pi extension MUST NOT open SQLite directly, and concurrent MCP/lifecycle cold start MUST preserve the database bootstrap safety contract.

#### Scenario: Native Failures MUST Degrade Without Blocking the Host Prompt

- **GIVEN** Pi's memory server does not finish starting within its timeout and, separately, a lifecycle child whose migration fails
- **WHEN** session start, the next prompt, and an OpenCode or Codex lifecycle hook run
- **THEN** prompts continue without injected memory, Pi shows one bounded startup-timeout warning that suggests `thoth-mem migrate` if memory stays unavailable, and the hook diagnostics carry the bounded migration error with the same recommendation

### Requirement: Shared Skills MUST Preserve Semantic-Boundary Memory Practice

The shared Skill MUST front-load recall, save, and handoff applicability in its discovery description; MUST provide a concise default cadence for pre-action recall, durable in-task saves, and pre-final continuation handoffs; and MUST preserve verified identity, privacy, confirmation, root ownership, noise exclusion, and exact-key requirements. The canonical shared Skill and every supported host/plugin copy MUST also add concise routing for chronological exploration using `mem_project action=timeline` followed by selective `mem_get` without displacing those practices.

#### Scenario: US3 - Teach every packaged agent to use the timeline 1

- **GIVEN** the canonical `thoth-mem` Skill
- **WHEN** an agent needs chronological project context rather than relevance-ranked recall
- **THEN** the guidance directs it to bounded `mem_project action=timeline` exploration and subsequent `mem_get` expansion of selected IDs

#### Scenario: US3 - Teach every packaged agent to use the timeline 2

- **GIVEN** the OpenCode, Codex, and Claude Code plugin bundles
- **WHEN** packaging verification compares their Skills
- **THEN** all copies contain equivalent timeline guidance and retain the established identity, privacy, save, and handoff rules

#### Scenario: US3 - Teach every packaged agent to use the timeline 3

- **GIVEN** the timeline action is added
- **WHEN** MCP and packed integration tests enumerate tools
- **THEN** the server still exposes exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`

#### Scenario: US6 - Preserve semantic-boundary memory cadence 1

- **GIVEN** prior project work may affect a task
- **WHEN** the agent selects workflows from the Skill description and common path
- **THEN** it is prompted to start with bounded compact recall and expand only selected evidence

#### Scenario: US6 - Preserve semantic-boundary memory cadence 2

- **GIVEN** a verified reusable decision, root cause, discovery, convention, or completed change
- **WHEN** the agent reaches that semantic boundary
- **THEN** the common path directs a deliberate confirmed `mem_save` without requiring the user to say “remember this”

#### Scenario: US6 - Preserve semantic-boundary memory cadence 3

- **GIVEN** meaningful work ends with continuation-critical state
- **WHEN** the agent prepares its final response
- **THEN** it saves one concise handoff with the established actionable fields if future work benefits

#### Scenario: US6 - Preserve semantic-boundary memory cadence 4

- **GIVEN** work is transient, speculative, already canonical, private, delegated, or explicitly excluded by the user
- **WHEN** the agent evaluates persistence
- **THEN** it does not create a promoted memory or invent attribution

#### Scenario: US6 - Preserve semantic-boundary memory cadence 5

- **GIVEN** a reusable claim lacks direct authority
- **WHEN** policy review is actually needed
- **THEN** the Skill loads the conditional observation-review reference and preserves candidate, review, and promotion requirements without burdening ordinary recall or direct authorized saves

### Requirement: Host Compaction Text MUST Become Cited Checkpoint Evidence

When `guide_post_compact` carries host compaction text from a confirmed identity, whether or not a pre-compaction event preceded it, the service MUST sanitize and store it as `checkpoint` session evidence and MUST derive a harness session summary only from recognized section headings (goal, request, or intent as objective; done or completed as completed; in progress or pending as pending; blocked as blocker; decisions as decision; next steps as next action; modified files as changed surface), each claim citing that evidence and bounded to 300 code points; only the first objective section MUST yield an objective, the file paths of every modified-files section or block MUST merge into one changed-surface claim in first-seen order without duplicates, text without recognized headings MUST remain evidence only, and the text MUST never become a memory or observation.

#### Scenario: Host Compaction Text MUST Become Cited Checkpoint Evidence

- **GIVEN** Pi split-turn compaction text with Goal, Done, In Progress, Key Decisions, and Next Steps sections, a later Original Request section, and two modified-files blocks with overlapping paths, plus another text with no recognized headings, both arriving without a preceding pre-compaction event
- **WHEN** each arrives on `guide_post_compact`
- **THEN** the first yields a session summary with one objective from Goal, completed, pending, decision, and next-action claims, and one changed-surface claim listing each path once, all citing its evidence, and the second yields evidence only

### Requirement: Lifecycle Operations MUST Create Sessions Only on Session Activity

For a root session that has no persisted session, `enroll`, `recover`, `finalize`, and `capture_root` without sanitized content MUST create no session, lifecycle receipt, or summary for that root session in any harness or generic MCP connection, while `recover` MUST still render the project recovery selection for a verified identity, report the deterministic session identity, and keep a degraded-identity outcome degraded with no selected or derived context; root prompt capture with content, `checkpoint_pre_compact`, `guide_post_compact`, and session-attributed saves MUST create the session on first use; lifecycle operations on an existing session MUST keep their receipts and effects; and a session whose host process is killed before finalize, such as by closing an Orca terminal tab on Windows, MUST remain covered by lazy previous-session summary derivation.

#### Scenario: Lifecycle Operations MUST Create Sessions Only on Session Activity

- **GIVEN** Pi starts a session, injects recovery, and the user then resumes another session or quits without typing
- **WHEN** enroll, recover, and finalize run for the untouched session
- **THEN** no session row, lifecycle receipt, or summary exists for it, the recovery block was still rendered, and only a session that receives a typed prompt is created

### Requirement: Pi Lifecycle Keys MUST Be Unique per Extension Run

The Pi extension MUST derive enroll, recovery, post-compaction refresh, and finalize event keys from a nonce created at each `session_start`, so that keys stay stable within one run and differ across runs of the same root session; quitting a resumed session MUST therefore record a new finalize receipt and derive a summary covering its new activity, while an untouched start still writes nothing.

#### Scenario: Pi Lifecycle Keys MUST Be Unique per Extension Run

- **GIVEN** a Pi session that is quit, resumed, given a new prompt, and quit again
- **WHEN** its lifecycle hooks run
- **THEN** two finalize receipts exist and the session's current summary covers the new prompt
