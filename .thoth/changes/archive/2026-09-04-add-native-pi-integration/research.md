# Research: Native Pi Integration

## Evidence baseline

- The locally installed host is `@earendil-works/pi-coding-agent@0.84.4`, exposed
  as `pi` from `C:\nvm4w\nodejs\pi.cmd`.
- Its installed authoritative documentation is under
  `C:\nvm4w\nodejs\node_modules\@earendil-works\pi-coding-agent\docs` and its
  published types are under `dist/core/extensions/types.d.ts` and
  `dist/core/session-manager.d.ts`.
- The upstream source is
  [earendil-works/pi](https://github.com/earendil-works/pi), package
  `packages/coding-agent`.

## Package and setup contract

Pi packages declare resources in `package.json#pi`. The manifest supports
`extensions` and `skills`, and the `pi-package` keyword marks package discovery.
Public sources use `npm:<package>@<version>`; local directory sources remain at
their absolute path. `pi install` and `pi remove` operate on global user state by
default, while `-l` is explicitly project-local. `pi list` reports both the
configured source and installed path. `PI_CODING_AGENT_DIR` redirects the global
agent directory, so setup and real-host smoke can remain disposable.

Decision: `thoth-mem setup pi` will remain global, install the exact public source
`npm:thoth-mem@<package-version>` or one verified absolute local package root, and
use only `pi --version`, `pi <command> --help`, `pi list --no-approve`,
`pi install <source> --no-approve`, and `pi remove <source> --no-approve`.
The initially supported family is `0.84.x` after capability inspection; another
version requires the existing explicit force override and must still expose every
required capability.

Prepublication public-source verification cannot query the default npm registry:
the candidate version may not exist there, or an older published artifact may
share the requested version. The candidate also has unbundled runtime
dependencies, so a registry containing only thoth-mem is not installable. The
packed verifier will therefore materialize the complete runtime transitive graph
from the repository's frozen lockfile and already installed dependency tree,
fail if names/versions do not match that graph, pack each exact dependency into
a scratch artifact, and create an integrity ledger for candidate plus closure.
It will then start a loopback-only npm-compatible registry whose packuments and
tarball endpoints serve exactly those versions and bytes. Pi's npm subprocess
will receive only disposable registry/cache configuration and keep the requested
source `npm:thoth-mem@<candidate-version>`; any missing closure entry,
name/version/hash disagreement, or non-loopback package request fails the smoke.
Verification must match the Pi list record, installed manifest/assets, resolved
dependency versions, and ledger hashes to the staged candidate closure. The
server, artifacts, cache, Pi home, runtime data, and sessions are removed after
the smoke; no real registry publication or user configuration is required.

## Extension contract

The default extension factory may be async. `ExtensionAPI.registerTool()` accepts
one TypeBox-compatible JSON Schema and an async execution function. Pi provides
the core extension packages to installed packages through peer resolution.

Decision: the Pi entry will register exactly the six names from thoth-mem's
authoritative tool catalog. The catalog will expose the descriptions and JSON
Schemas derived from the existing Zod definitions used by MCP. A parity test will
compare the Pi registrations to MCP `tools/list`, preventing a copied schema from
drifting.

One package-relative `node dist/index.js mcp --no-http` child will be owned by the
extension through the MCP SDK stdio client. Native tool execution and lifecycle
`mem_session` calls will share this client. Calls will be time- and size-bounded;
transport failure will close the stale client, return or throw a bounded Pi-shaped
error, and allow a later lazy reconnect. No Pi-loaded module imports
`better-sqlite3` or instantiates `MemoryService`.

## Identity and lifecycle mapping

Pi's `ExtensionContext` supplies `cwd` and a read-only session manager with
`getSessionId()` and `getLeafId()`. Pi has no built-in parent/subagent identity in
this contract. The native session is therefore the verified root only when these
fields and local project identity validate; no community child convention is
inferred.

| Pi event | Stable native fields | thoth-mem behavior |
| --- | --- | --- |
| `session_start` | session ID, cwd, reason | Resolve project identity; enroll idempotently; recover and cache only a validated bounded block. |
| `input` | session ID, current leaf ID, source, streaming behavior, sanitized text | Capture only `interactive` and `rpc` root inputs. Hash all stable fields plus sanitized text; exclude `extension`. |
| `context` | current messages | Remove only prior `customType=thoth-mem-recovery` entries and append the cached verified block as one non-displayed custom message. No I/O. |
| `session_before_compact` | session ID, `firstKeptEntryId`, reason, retry flag | Confirm `checkpoint_pre_compact` without copying branch/model/tool content into evidence. |
| `session_compact` | compaction entry ID, reason, retry flag | Call `guide_post_compact`; cache its session-summary-only verified block. Pi's free-form generated summary is not submitted as a supported thoth-mem summary. |
| `session_compact_failed` | reason, aborted, retry/from-extension flags | Preserve the prior cache, emit at most one bounded diagnostic, and do not finalize. |
| `agent_settled` | none | No finalization and no automatic memory promotion. |
| `session_shutdown` | session ID, reason, target session file | Finalize for quit or session replacement, not hot reload; close the owned MCP transport in every case. |

The shared continuation validator will be extracted from the OpenCode plugin so
both hosts enforce exact local project/session identity, owned delimiters, record
IDs, source omission, taxonomy, and the 1,000-code-point cap. Invalid recovery
falls back to the locally rendered identity-only block or no block.

## Persistence impact

`HARNESS_VALUES` must add `pi`. Although `lifecycle_receipts.harness` is
unconstrained text, `sessions.harness` has a SQL `CHECK` generated from the
revision-9 harness allowlist. Existing databases therefore reject a new Pi
session until that table constraint is widened.

Decision: advance to schema revision 10. Before mutation, create and verify a
retained `.pre-v10.bak` revision-9 backup. A write-excluding immediate migration
transaction must then compare the exact live logical state with that backup
before the first mutation; a structurally valid backup from another or older
revision-9 state, or drift after backup creation, fails closed. Rebuild only
`sessions` with the current `HARNESS_VALUES`, preserve every column and row
exactly, and protect all dependent foreign keys by executing the table swap
under an explicitly bounded foreign-key-disabled window followed immediately by
restored enforcement, `foreign_key_check`, integrity, row/relationship counts,
session hashes, and dependent-row equivalence. An injected failure must roll
back the transaction; reopening revision 10 is a no-op. Historical schema
fixtures retain an explicit frozen pre-Pi harness allowlist. No Pi-specific
table or compatibility shim is introduced.

## Rejected alternatives

- A community MCP adapter: adds an external runtime contract and cannot provide
  the native lifecycle or managed package behavior.
- Direct `MemoryService` use in the Pi extension: loads SQLite into the host and
  duplicates the established process boundary.
- Separate MCP and lifecycle child processes: reintroduces concurrent cold-start
  schema risk and unnecessary process overhead.
- Copying files into `~/.pi/agent/extensions`: bypasses Pi package provenance,
  Skill discovery, update semantics, and manager-owned state.
- Persisting Pi's compaction summary as a thoth-mem session summary: the text is
  not the structured, per-claim, support-bound summary required by the core.
