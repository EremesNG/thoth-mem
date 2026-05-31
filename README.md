<div align="center">

<img src="img/thoth-mem.png" alt="Thoth-Mem" width="400" />

# Thoth-Mem

**Persistent memory for AI coding agents**

[![npm version](https://img.shields.io/npm/v/thoth-mem)](https://www.npmjs.com/package/thoth-mem)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Give your AI coding agent a brain that survives across sessions, compactions, and context resets.

</div>

---

Thoth-Mem is an MCP server with an optional HTTP REST API that stores what your agent learns — architecture decisions, bug fixes, patterns, preferences — in a local SQLite database with full-text search. When a new session starts, the agent picks up right where it left off.

```
Agent Session 1                    Agent Session 2
┌─────────────────┐               ┌─────────────────┐
│ discovers auth   │──── save ───▶│ recalls auth     │
│ uses JWT+refresh │               │ pattern instantly │
│ fixes edge case  │──── save ───▶│ avoids same bug  │
└─────────────────┘               └─────────────────┘
         │                                 ▲
         └──── thoth.db (SQLite) ──────────┘
```

## Features

- **6 compact MCP tools** — workflow-level tools instead of one tool per internal view
- **Local read-only dashboard** served by the HTTP bridge at `/`, with OpenAPI docs preserved at `/docs`
- **CLI + MCP dual mode** — use as a server or directly from the terminal
- **SQLite + FTS5** full-text search (fast, zero external dependencies)
- **Git-friendly sync** — export memory as gzipped chunks for version control
- **JSON export/import** — portable memory backup and transfer
- **Project migration** — rename projects across all entities in one operation
- **Graph fact rebuild** — backfill derived graph-lite facts for existing memories
- **MCP Server Instructions** — built-in protocol guidance for connected agents
- **Observation versioning** — full history preserved on topic_key upserts
- **Session enrichment** — sessions auto-fill missing project/directory on reconnect
- **Normalized deduplication** — whitespace/formatting-insensitive duplicate detection
- **Strict type taxonomy** — observation types enforced at the database level
- **Paginated retrieval** — large observations served in chunks via offset/max_length
- **Privacy defense** — `<private>` tags stripped before storage
- **Token-efficient recall** — compact fused evidence first, context expansion only when needed
- **Retrieval eval baseline** — deterministic hybrid retrieval benchmark (lexical, semantic raw/HyDE, KG, compression, lineage)
- **Agent-first MCP tools** — recall, save, context, project navigation, session lifecycle, and full-content fetch
- **Admin tools via CLI & HTTP** — export, import, sync, and migration available without cluttering the MCP tool surface

## Quick Start

```bash
# Run directly (no install needed)
npx -y thoth-mem@latest

# Or install globally
pnpm add -g thoth-mem
```

Requires Node.js >= 18.

## MCP Configuration

### Claude Code

```bash
claude mcp add thoth-mem -- npx -y thoth-mem@latest
```

### OpenCode

Add to `~/.config/opencode/config.json`:

```json
{
  "mcp": {
    "thoth": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "thoth-mem@latest"
      ]
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "thoth": {
      "command": "npx",
      "args": ["-y", "thoth-mem@latest"]
    }
  }
}
```

## CLI Commands

Thoth-Mem also works as a standalone CLI. When no subcommand is given, it starts the MCP server (and HTTP bridge by default).

```bash
thoth-mem                              # Start MCP server + HTTP bridge (default)
thoth-mem mcp                          # Start MCP server (explicit)
thoth-mem search <query>               # Search memories
thoth-mem save <title> <content>       # Save a memory
thoth-mem timeline <observation_id>    # Chronological context around an observation
thoth-mem context                      # Recent session context
thoth-mem stats                        # Memory statistics
thoth-mem export [file]                # Export to JSON (stdout if no file)
thoth-mem import <file>                # Import from JSON
thoth-mem sync [--sync-dir=<path>]     # Git sync export
thoth-mem sync-import [--sync-dir=<path>]  # Git sync import from another instance
thoth-mem migrate-project <old> <new>  # Rename a project across all entities
thoth-mem delete-project <project>     # Delete a project and its related data
thoth-mem rebuild-graph --project <name> # Rebuild graph facts for one project
thoth-mem rebuild-graph --all          # Rebuild graph facts for every project
thoth-mem rebuild-index --project <name> # Queue semantic index rebuild for one project
thoth-mem rebuild-index --all          # Queue semantic index rebuild for all projects
thoth-mem rebuild-index --status       # Show semantic index queue/coverage progress
thoth-mem version                      # Show version
thoth-mem help                         # Show help
```

Global flags work with any command:

```bash
thoth-mem stats --data-dir=/custom/path
thoth-mem search "auth pattern" -p my-project
thoth-mem --no-http                    # Disable HTTP bridge
```

## HTTP REST API

Thoth-Mem runs an HTTP REST API bridge alongside the MCP server by default. The bridge listens on port `7438`, serves a local read-only dashboard at `/` when dashboard assets are built, and provides full access to memory operations via standard HTTP.

**Local dashboard:**

- Dashboard: `http://localhost:7438/`
- Build assets locally with `pnpm run dashboard:build` during development or release packaging.
- If `dist/dashboard/index.html` is missing, `/` returns a clear local build message while `/docs`, `/openapi.json`, and REST APIs remain available.
- The dashboard is read-only and local-first: it uses existing GET endpoints only, adds no auth/multi-user mode, and does not create, update, delete, sync, migrate, or vector-search memories.

**Interactive Documentation:**

- OpenAPI spec: `http://localhost:7438/openapi.json`
- Interactive docs: `http://localhost:7438/docs`

**Disable the HTTP bridge:**

```bash
thoth-mem --no-http
# or
THOTH_HTTP_DISABLED=true thoth-mem
```

**Example: Search memories via HTTP**

```bash
curl http://localhost:7438/observations/search?query=auth+pattern
```

**Example: Get memory statistics**

```bash
curl http://localhost:7438/stats
```

The HTTP API supports all memory operations: sessions, observations, prompts, search, export/import, and sync. See the interactive `/docs` interface for the full API reference.

## Development Checks

```bash
pnpm run build
pnpm run dashboard:typecheck
pnpm run dashboard:build
pnpm test
pnpm run eval:retrieval
```

`pnpm run eval:retrieval` runs a deterministic in-memory hybrid retrieval eval against seeded observations. It reports baseline lexical recall plus hybrid status metrics (pending/degraded fallback, lexical prefix behavior, semantic raw vs HyDE contribution, sentence-first small-to-big promotion, KG contribution, and evidence lineage coverage) without requiring model downloads or remote APIs.

## MCP Tools (6)


| Tool                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `mem_save`              | Save observations, prompts, session summaries, or passive learnings |
| `mem_recall`            | Primary fused hybrid recall across semantic, lexical, and KG lanes |
| `mem_context`           | Get recent context — sessions, prompts, observations, stats      |
| `mem_get`               | Retrieve full memory by ID, optionally with session timeline      |
| `mem_project`           | List projects, summarize one project, inspect graph facts/topics |
| `mem_session`           | Start, checkpoint, or summarize a memory session                  |

> **Admin operations** (export, import, sync, migrate-project, rebuild-graph, rebuild-index) are available via the [CLI](#cli-commands). Export, import, sync, and migration are also available through the [HTTP REST API](#http-rest-api). They are not registered as MCP tools to keep the agent's tool surface lean.

## Retrieval and Embeddings

- `mem_recall` is the primary retrieval tool. Use `mode=compact` first, then `mode=context` for the strongest hits, and `mem_get` only when full content is needed.
- Hybrid retrieval defaults use tuned lane fusion: sentence top-k 100, chunk top-k 20, lexical limit 20, min semantic score 0.3, and lane order `sentence > chunk > lexical > kg`.
- Semantic indexing is eventual and non-blocking. Save/update operations can return while indexing stays pending in the background.
- Automatic rebuild is triggered when embedding configuration hash changes; manual rebuild is available through `thoth-mem rebuild-index --project <name>` and `thoth-mem rebuild-index --all`. Use `thoth-mem rebuild-index --status` to inspect queue progress, lane state, recent errors, and vector coverage.
- When semantic lanes are pending or unavailable, retrieval degrades safely to lexical + KG lanes and reports fallback metadata (`pending`, `degraded_fallback`) instead of failing.
- `sqlite-vec` is optional at runtime: if unavailable, Thoth-Mem marks semantic lanes degraded and continues serving lexical/KG retrieval.
- Local embeddings default to provider `transformers_local` and model `nomic-ai/nomic-embed-text-v1.5` unless overridden.

### Recommended Embedding Models

Model choice affects vector dimensions, quality, memory use, and index compatibility. Keep the same provider/model/dimensions for an existing semantic index; changing them marks embeddings stale and queues a rebuild.

| Use case | Ollama model | LM Studio model to look for | Notes |
| --- | --- | --- | --- |
| Lightweight local default | [`nomic-embed-text`](https://ollama.com/library/nomic-embed-text) | [`nomic-ai/nomic-embed-text-v1.5`](https://lmstudio.ai/docs/typescript/embedding) | Good first choice for local RAG. Small download, mature support, 768-dimensional embeddings in the upstream model card. |
| Strong general retrieval | [`mxbai-embed-large`](https://ollama.com/library/mxbai-embed-large) | [`mixedbread-ai/mxbai-embed-large-v1`](https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1) | Good quality/performance balance for English and technical notes. Use the exact loaded model id shown by LM Studio. |
| Multilingual / Spanish-heavy memory | [`bge-m3`](https://ollama.com/library/bge-m3) | [`BAAI/bge-m3`](https://huggingface.co/BAAI/bge-m3) | Strong multilingual option. The upstream model card highlights 100+ languages and inputs up to 8192 tokens. |
| Higher-quality modern option | [`qwen3-embedding:0.6b`](https://ollama.com/library/qwen3-embedding) | [`Qwen/Qwen3-Embedding-0.6B`](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) | Better multilingual/code retrieval when you can spend more RAM/CPU than `nomic-embed-text`. Upstream lists 0.6B parameters, 32K context, and up to 1024 dimensions. |

Ollama example:

```bash
ollama pull bge-m3
THOTH_EMBEDDING_PROVIDER=ollama \
THOTH_EMBEDDING_BASE_URL=http://127.0.0.1:11434 \
THOTH_EMBEDDING_MODEL=bge-m3 \
thoth-mem
```

LM Studio example:

```bash
# In LM Studio, load an embedding-capable model and start the local server.
# Use the exact model id shown by LM Studio for THOTH_EMBEDDING_MODEL.
THOTH_EMBEDDING_PROVIDER=lmstudio \
THOTH_EMBEDDING_BASE_URL=http://127.0.0.1:1234 \
THOTH_EMBEDDING_MODEL=nomic-embed-text-v1.5 \
thoth-mem
```

`THOTH_EMBEDDING_DIMENSIONS` is inferred for known models such as `nomic-ai/nomic-embed-text-v1.5` and `nomic-embed-text`. Set it explicitly when using a custom model or when the selected runtime supports a stable dimension override and you want to force a specific sqlite-vec table shape.


## Sync & Portability

### JSON Export/Import

Full memory backup in a single JSON file:

```bash
# Export everything
thoth-mem export backup.json

# Export one project
thoth-mem export --project=my-app backup.json

# Import (duplicates are skipped via sync_id)
thoth-mem import backup.json
```

### Git Sync

Incremental, append-only gzipped chunks designed for version control — no merge conflicts:

```bash
# Export a chunk to the sync directory
thoth-mem sync --sync-dir=.thoth-sync

# Structure created:
# .thoth-sync/
#   manifest.json        ← ordered chunk list
#   chunks/
#     <timestamp>.json.gz ← compressed memory chunk
```

Import on another machine:

```bash
thoth-mem sync-import --sync-dir=.thoth-sync
```

Each observation and prompt carries a `sync_id` (UUID) that prevents duplicates on re-import.

**Incremental exports:** Only changes since the last sync are exported, tracked via mutation journal for efficiency.

**Tombstones:** Deleted observations propagate correctly across synced instances, ensuring consistency.

**Replay safety:** Re-importing the same data is safe; duplicates are detected and skipped automatically via `sync_id`.

### Project Migration

Rename a project across every entity in one transaction:

```bash
thoth-mem migrate-project old-name new-name
```

Updates sessions, observations, and prompts atomically.

### Project Deletion

Delete a project and its related data safely:

```bash
thoth-mem delete-project project-name
```

This runs as a transaction, blocks deletion if shared sessions or data are detected in another project, and keeps sync tombstones consistent.

## Configuration


| Environment Variable          | Default    | Description                                 |
| ----------------------------- | ---------- | ------------------------------------------- |
| `THOTH_DATA_DIR`              | `~/.thoth` | Data directory for SQLite database          |
| `THOTH_MAX_CONTENT_LENGTH`    | `100000`   | Max content length (warns, never truncates) |
| `THOTH_MAX_CONTEXT_RESULTS`   | `20`       | Max observations in context response        |
| `THOTH_MAX_SEARCH_RESULTS`    | `20`       | Max search results returned                 |
| `THOTH_DEDUPE_WINDOW_MINUTES` | `15`       | Rolling deduplication window                |
| `THOTH_PREVIEW_LENGTH`        | `300`      | Search result preview length                |
| `THOTH_HTTP_PORT`             | `7438`     | HTTP REST API port                          |
| `THOTH_HTTP_DISABLED`         | `false`    | Disable HTTP REST API bridge                |
| `THOTH_EMBEDDING_PROVIDER`    | `transformers_local` | Embedding provider (`transformers_local`, `ollama`, `lmstudio`) |
| `THOTH_EMBEDDING_MODEL`       | `nomic-ai/nomic-embed-text-v1.5` (local) | Embedding model id |
| `THOTH_EMBEDDING_BASE_URL`    | provider-specific | Base URL for remote/local API providers |
| `THOTH_EMBEDDING_DIMENSIONS`  | inferred for known models | Optional embedding dimensions override |
| `THOTH_HYDE_ENABLED`          | `false`    | Enable HyDE dual-input semantic query expansion |
| `THOTH_HYDE_MODEL`            | unset      | Optional HyDE generation model id |
| `THOTH_HYDE_BASE_URL`         | unset      | Optional HyDE provider base URL |
| `THOTH_HYDE_TIMEOUT_MS`       | `4000`     | HyDE timeout before raw-query-only fallback |

## Storage

All data lives in a single SQLite database at `~/.thoth/thoth.db` (configurable via `THOTH_DATA_DIR` or `--data-dir`).

- **WAL journal mode** for concurrent read performance
- **FTS5** full-text search over observations and prompts
- **Foreign keys + CHECK constraints** for data integrity
- **Automatic schema migrations** for seamless upgrades

## Observation Types

Observations are categorized with an enforced taxonomy:


| Type              | Use for                                 |
| ----------------- | --------------------------------------- |
| `decision`        | Architecture or design choices          |
| `architecture`    | System structure and patterns           |
| `bugfix`          | Bug fixes and root causes               |
| `pattern`         | Established conventions                 |
| `config`          | Configuration and environment setup     |
| `discovery`       | Non-obvious findings about the codebase |
| `learning`        | General learnings and gotchas           |
| `session_summary` | End-of-session summaries                |
| `manual`          | Anything that doesn't fit above         |

## License

MIT
