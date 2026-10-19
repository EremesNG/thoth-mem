# Feature Specification: OpenCode root identity tool

**Change ID**: `opencode-root-identity-tool`<br>
**Route**: Accelerated<br>
**Status**: Draft

## Intent and scope

**Why**: OpenCode agents need a model-callable, CLI-free way to obtain the active root session ID and memory project without guessing from historical sessions or undocumented environment state.<br>
**Impact**: The packaged OpenCode plugin will expose one identity-only native tool, `thoth_mem_root_identity`, whose versioned JSON distinguishes the invoking session from the resolved root and makes delegated lifecycle authority explicit. It will not add an MCP tool or persist memory.<br>
**Affected capabilities**: `harness-integration`

## User stories

### US1 - Resolve identity from a root session (Priority: P1)

As a root OpenCode agent, I can invoke one native plugin tool so that I receive the active root session ID and project without shell or CLI discovery.

**Independent test**: Load the public OpenCode plugin factory, execute `thoth_mem_root_identity` with a root tool context, and compare the parsed JSON output with a fixed expected contract.

**Covers**: FR-001, FR-002, FR-005, FR-006, SC-001, SC-002, SC-005, SC-006

**Acceptance scenarios**:

1. **Given** a tool invocation whose session record has no `parentID`, **When** `thoth_mem_root_identity` executes, **Then** it returns schema `thoth-mem.opencode.identity.v1`, `status: "verified"`, matching root and caller IDs, `caller_role: "root"`, the current project name, and `authorization: "root_lifecycle"`.
2. **Given** a verified root identity, **When** the tool returns, **Then** it has performed no enrollment, prompt capture, memory dispatch, or filesystem mutation.

### US2 - Resolve the root for a delegated caller (Priority: P1)

As an OpenCode subagent, I can identify the root session that owns shared continuity while remaining explicitly unauthorized to own its lifecycle.

**Independent test**: Execute the tool from a nested delegated session whose parent chain ends at a root and assert the exact root/caller/role/authorization fields.

**Covers**: FR-002, FR-003, FR-004, FR-005, SC-002, SC-003

**Acceptance scenarios**:

1. **Given** a delegated caller with one or more valid `parentID` links, **When** the tool executes, **Then** it walks the bounded chain to the root and returns the root ID plus the original caller ID, `caller_role: "delegated"`, and `authorization: "none"`.
2. **Given** a delegated caller, **When** the tool returns the root ID, **Then** the result does not claim that the caller may start, checkpoint, summarize, or finalize the root lifecycle.

### US3 - Fail closed when root identity is not provable (Priority: P1)

As an agent in a malformed or unavailable OpenCode session graph, I receive bounded degraded identity output so that I never use an invented root.

**Independent test**: Drive missing lookup, malformed records, broken parent links, cycles, and excessive-depth chains through the public tool and assert that no `root_session_id` is returned.

**Covers**: FR-003, FR-005, FR-006, SC-003, SC-004

**Acceptance scenarios**:

1. **Given** session lookup is unavailable, throws, or returns a record whose ID does not match the requested link, **When** the tool executes, **Then** it returns versioned `status: "degraded"`, a bounded reason code, and `authorization: "none"` without a root ID.
2. **Given** the parent chain cycles or exceeds its fixed maximum depth, **When** the tool executes, **Then** it fails closed without unbounded lookup or partial root output.
3. **Given** the project name cannot be derived safely, **When** the tool executes, **Then** it returns degraded output rather than fabricating a project.

## Edge cases

- The invoking `sessionID` is empty, malformed, or longer than the existing identifier bound.
- `client.session.get` is absent, rejects, returns no data, or returns a mismatched ID.
- A parent link is malformed, self-referential, cyclic, missing, or deeper than the fixed traversal bound.
- A delegated chain reaches a valid root but the project context is missing or unbounded.
- Root and delegated invocations occur repeatedly; the tool remains identity-only and deterministic.
- Another plugin uses a similar tool name; the thoth-owned ID remains namespaced and stable.

## Functional requirements

- **FR-001 — Native OpenCode identity tool**: `[ADDED harness-integration]` The OpenCode plugin MUST register exactly one model-callable tool named `thoth_mem_root_identity` with no user-supplied arguments.
- **FR-002 — Versioned identity result**: `[ADDED harness-integration]` A verified result MUST be JSON using schema `thoth-mem.opencode.identity.v1` and MUST contain `status`, `root_session_id`, `caller_session_id`, `caller_role`, `project`, and `authorization` with deterministic field semantics.
- **FR-003 — Bounded parent-chain resolution**: `[ADDED harness-integration]` The tool MUST resolve the invoking session through validated `parentID` links to a root using a fixed traversal bound and cycle detection, and MUST reject missing, malformed, mismatched, cyclic, or over-depth chains.
- **FR-004 — Delegated authority remains denied**: `[ADDED harness-integration]` A delegated verified result MUST identify the root and original caller, MUST set `caller_role` to `delegated` and `authorization` to `none`, and MUST NOT imply root lifecycle ownership.
- **FR-005 — Identity-only execution**: `[ADDED harness-integration]` Tool execution MUST NOT enroll a session, capture a prompt, call the memory dispatcher, mutate lifecycle state, write files, or add any MCP tool.
- **FR-006 — Fail-closed bounded output**: `[ADDED harness-integration]` When root identity or project cannot be proven, the tool MUST return versioned degraded JSON with a bounded reason and `authorization: "none"`, MUST omit `root_session_id`, and MUST NOT throw host-internal details into model-visible output.

## Success criteria

- **SC-001** `[buildable]`: The public OpenCode plugin factory exposes exactly 1 `thoth_mem_root_identity` definition accepted by the current OpenCode plugin tool contract.
- **SC-002** `[buildable]`: Focused runtime tests assert exact JSON for a root caller and for at least a 2-level delegated chain, including authorization semantics.
- **SC-003** `[buildable]`: All focused failure tests cover unavailable lookup, malformed or mismatched records, missing parent, cycle, and depth overflow; every case returns degraded JSON without `root_session_id`.
- **SC-004** `[buildable]`: Focused tests prove identity calls produce zero dispatch requests and do not alter existing enrollment, prompt, recovery, or compaction behavior.
- **SC-005** `[buildable]`: Relevant integration tests, package verification, TypeScript/build checks, and the full test suite pass without changing the six-tool MCP surface.
- **SC-006** `[outcome]`: After a separately authorized reinstall and OpenCode restart, the real host lists exactly 1 `thoth_mem_root_identity` tool and returns the versioned contract for the active session.

## Assumptions

- OpenCode 1.18.x accepts plugin-returned raw tool definitions shaped as `{ description, args, execute }` and supplies `sessionID`, `directory`, and `worktree` in the execution context.
- `client.session.get` can retrieve each session in the invoking session's parent chain when the chain is valid and accessible.
- The existing OpenCode plugin context remains the trusted source for deriving the memory project name.
- Returning a root ID to a delegated caller conveys identity only; separate dispatch instructions still govern any memory permissions.

## Dependencies

- Existing `integrations/opencode/plugin.mjs` session lookup and project-name helpers.
- Existing OpenCode runtime integration tests and packaged plugin inventory.
- Current OpenCode native plugin tool-registration contract.

## Out of scope

- Updating `skills/thoth-mem/references/opencode.md` or its packaged copy; that follows only after the tool implementation is verified.
- Installing, publishing, restarting, or real-host smoke-testing the plugin in this change.
- Adding or changing any MCP tool, memory schema, lifecycle adapter event, or HTTP/CLI surface.
- Granting delegated agents permission to write observations or own root lifecycle solely because they know the root ID.
- Automatically enrolling sessions, saving prompts, or changing existing lifecycle side effects.
