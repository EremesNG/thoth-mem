# Harness Integration

## Requirements

### Requirement: Every Native Plugin MUST Bundle Hooks, MCP, and Skills

Every supported host bundle, including Pi, MUST package its supported lifecycle hooks, one registration path for the shared exact six-tool memory surface, and the same canonical memory Skill without stale copied contracts. Pi MUST expose the tools through its native extension API while delegating execution to the existing MCP server rather than requiring a community MCP adapter or importing the SQLite runtime into the Pi process.

#### Scenario: US2 - Use the existing memory tools from Pi 1

- **GIVEN** the native Pi package is loaded
- **WHEN** Pi enumerates extension tools
- **THEN** it sees exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` with the shared schemas and bounded structured results

#### Scenario: US2 - Use the existing memory tools from Pi 2

- **GIVEN** a valid tool call
- **WHEN** Pi executes it
- **THEN** the request crosses the package-relative Node boundary to the existing MCP server and uses the same storage, identity, privacy, validation, and error semantics as direct MCP use

#### Scenario: US2 - Use the existing memory tools from Pi 3

- **GIVEN** the packaged Pi Skill
- **WHEN** an agent reads its memory guidance
- **THEN** it retains the canonical recall, timeline, explicit save, handoff, privacy, confirmation, and verified-identity practices

### Requirement: Runtime Lifecycle MUST Preserve the Core Contract

OpenCode, Codex, Claude Code, and Pi lifecycle adapters MUST normalize only fields their supported native contracts actually provide and MUST apply shared privacy sanitation before content-derived identity. Pi MUST map documented session start, admitted root input, context preparation, pre-compaction, successful compaction, failed compaction, settled-agent, and shutdown events onto enroll, recover, capture-root, checkpoint-pre-compact, guide-post-compact, non-finalizing degradation or flush, and finalize semantics without automatically promoting prompt, model, tool, summary, or lifecycle content.

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 1

- **GIVEN** a root Pi session with a verified working directory and session ID
- **WHEN** the session starts and prepares model context
- **THEN** thoth-mem enrolls and recovers once and injects only a bounded, source-attributed, identity-validated recovery block

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 2

- **GIVEN** two different interactive or RPC root inputs during one active agent cycle
- **WHEN** Pi admits them
- **THEN** both sanitized prompts receive distinct deterministic capture keys and each appends one ordered root-prompt evidence event; an exact retry remains a duplicate

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 3

- **GIVEN** Pi is about to compact and later reports successful compaction
- **WHEN** the lifecycle hooks execute
- **THEN** thoth-mem checkpoints before compaction, guides after compaction, and refreshes the next bounded recovery block without treating Pi's generated compaction text as an automatic memory or supported session summary

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 4

- **GIVEN** the root Pi session shuts down
- **WHEN** the shutdown event fires
- **THEN** thoth-mem finalizes once; agent-settled or failed-compaction events do not falsely finalize the root session

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 5

- **GIVEN** a valid revision-9 database containing existing sessions and their dependent evidence, events, summaries, and receipts
- **WHEN** the Pi-capable runtime opens it
- **THEN** one verified revision-10 migration locks and rechecks the live source against its retained backup before mutation, preserves every authoritative row and relation, and allows a new `pi` session; a structurally valid but logically different backup is rejected

### Requirement: Root Session Identity MUST Be Verified and Host-Specific Only at the Adapter

Native adapters, including Pi, MUST resolve the Git common-directory UUID or explicit non-Git path identity from the host working directory, pass an initial display-name hint only for adoption, and preserve the exact canonical project key with a stable root session identity. Pi MUST use its documented session identity and working directory, while delegated, ambiguous, incomplete, or child-key-mismatched identity MUST NOT receive root authority.

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 1

- **GIVEN** a root Pi session with a verified working directory and session ID
- **WHEN** the session starts and prepares model context
- **THEN** thoth-mem enrolls and recovers once and injects only a bounded, source-attributed, identity-validated recovery block

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 2

- **GIVEN** two different interactive or RPC root inputs during one active agent cycle
- **WHEN** Pi admits them
- **THEN** both sanitized prompts receive distinct deterministic capture keys and each appends one ordered root-prompt evidence event; an exact retry remains a duplicate

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 3

- **GIVEN** Pi is about to compact and later reports successful compaction
- **WHEN** the lifecycle hooks execute
- **THEN** thoth-mem checkpoints before compaction, guides after compaction, and refreshes the next bounded recovery block without treating Pi's generated compaction text as an automatic memory or supported session summary

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 4

- **GIVEN** the root Pi session shuts down
- **WHEN** the shutdown event fires
- **THEN** thoth-mem finalizes once; agent-settled or failed-compaction events do not falsely finalize the root session

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 5

- **GIVEN** a valid revision-9 database containing existing sessions and their dependent evidence, events, summaries, and receipts
- **WHEN** the Pi-capable runtime opens it
- **THEN** one verified revision-10 migration locks and rechecks the live source against its retained backup before mutation, preserves every authoritative row and relation, and allows a new `pi` session; a structurally valid but logically different backup is rejected

#### Scenario: US4 - Fail safely without blocking Pi 1

- **GIVEN** the thoth-mem child cannot start, times out, exits nonzero, or returns an invalid or oversized envelope
- **WHEN** a Pi prompt or lifecycle hook continues
- **THEN** no unverified memory is injected, the prompt is not rejected, and only a bounded diagnostic is emitted

#### Scenario: US4 - Fail safely without blocking Pi 2

- **GIVEN** the MCP child and lifecycle child reach a fresh shared data directory concurrently
- **WHEN** both initialize
- **THEN** schema bootstrap converges safely or one path degrades truthfully without corrupting the database or blocking Pi

#### Scenario: US4 - Fail safely without blocking Pi 3

- **GIVEN** a delegated, ambiguous, incomplete, or child-key-mismatched Pi identity
- **WHEN** lifecycle attempts root-only capture or recovery
- **THEN** it receives no root authority and injects no unverified context

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

Stable capture keys MUST identify distinct sanitized root-user submissions rather than only their enclosing turn. A native immutable message ID MUST be used when available; otherwise, including for Pi root input, a deterministic key MUST bind documented stable session or turn fields with the sanitized prompt fingerprint so different prompts remain distinct and exact retries remain idempotent.

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 1

- **GIVEN** a root Pi session with a verified working directory and session ID
- **WHEN** the session starts and prepares model context
- **THEN** thoth-mem enrolls and recovers once and injects only a bounded, source-attributed, identity-validated recovery block

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 2

- **GIVEN** two different interactive or RPC root inputs during one active agent cycle
- **WHEN** Pi admits them
- **THEN** both sanitized prompts receive distinct deterministic capture keys and each appends one ordered root-prompt evidence event; an exact retry remains a duplicate

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 3

- **GIVEN** Pi is about to compact and later reports successful compaction
- **WHEN** the lifecycle hooks execute
- **THEN** thoth-mem checkpoints before compaction, guides after compaction, and refreshes the next bounded recovery block without treating Pi's generated compaction text as an automatic memory or supported session summary

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 4

- **GIVEN** the root Pi session shuts down
- **WHEN** the shutdown event fires
- **THEN** thoth-mem finalizes once; agent-settled or failed-compaction events do not falsely finalize the root session

#### Scenario: US3 - Preserve memory across the Pi session lifecycle 5

- **GIVEN** a valid revision-9 database containing existing sessions and their dependent evidence, events, summaries, and receipts
- **WHEN** the Pi-capable runtime opens it
- **THEN** one verified revision-10 migration locks and rechecks the live source against its retained backup before mutation, preserves every authoritative row and relation, and allows a new `pi` session; a structurally valid but logically different backup is rejected

### Requirement: Native Failures MUST Degrade Without Blocking the Host Prompt

Child launch, timeout, nonzero exit, protocol failure, oversized output, invalid envelope, tool bridge failure, or unverifiable identity in any native adapter, including Pi, MUST produce bounded safe diagnostics, inject no unverified memory, and MUST NOT reject an otherwise valid host prompt. The Pi extension MUST NOT open SQLite directly, and concurrent MCP/lifecycle cold start MUST preserve the database bootstrap safety contract.

#### Scenario: US2 - Use the existing memory tools from Pi 1

- **GIVEN** the native Pi package is loaded
- **WHEN** Pi enumerates extension tools
- **THEN** it sees exactly `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session` with the shared schemas and bounded structured results

#### Scenario: US2 - Use the existing memory tools from Pi 2

- **GIVEN** a valid tool call
- **WHEN** Pi executes it
- **THEN** the request crosses the package-relative Node boundary to the existing MCP server and uses the same storage, identity, privacy, validation, and error semantics as direct MCP use

#### Scenario: US2 - Use the existing memory tools from Pi 3

- **GIVEN** the packaged Pi Skill
- **WHEN** an agent reads its memory guidance
- **THEN** it retains the canonical recall, timeline, explicit save, handoff, privacy, confirmation, and verified-identity practices

#### Scenario: US4 - Fail safely without blocking Pi 1

- **GIVEN** the thoth-mem child cannot start, times out, exits nonzero, or returns an invalid or oversized envelope
- **WHEN** a Pi prompt or lifecycle hook continues
- **THEN** no unverified memory is injected, the prompt is not rejected, and only a bounded diagnostic is emitted

#### Scenario: US4 - Fail safely without blocking Pi 2

- **GIVEN** the MCP child and lifecycle child reach a fresh shared data directory concurrently
- **WHEN** both initialize
- **THEN** schema bootstrap converges safely or one path degrades truthfully without corrupting the database or blocking Pi

#### Scenario: US4 - Fail safely without blocking Pi 3

- **GIVEN** a delegated, ambiguous, incomplete, or child-key-mismatched Pi identity
- **WHEN** lifecycle attempts root-only capture or recovery
- **THEN** it receives no root authority and injects no unverified context

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
