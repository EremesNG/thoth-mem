span

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

- **13 MCP tools** — always registered, no profiles to configure
- **HTTP REST API** with OpenAPI 3.0 docs and interactive `/docs` interface
- **CLI + MCP dual mode** — use as a server or directly from the terminal
- **SQLite + FTS5** full-text search (fast, zero external dependencies)
- **Git-friendly sync** — export memory as gzipped chunks for version control
- **JSON export/import** — portable memory backup and transfer
- **Project migration** — rename projects across all entities in one operation
- **MCP Server Instructions** — built-in protocol guidance for connected agents
- **Observation versioning** — full history preserved on topic_key upserts
- **Session enrichment** — sessions auto-fill missing project/directory on reconnect
- **Normalized deduplication** — whitespace/formatting-insensitive duplicate detection
- **Strict type taxonomy** — observation types enforced at the database level
- **Paginated retrieval** — large observations served in chunks via offset/max_length
- **Privacy defense** — `<private>` tags stripped before storage
- **Token-efficient search** — compact results by default, preview mode optional, 3-layer recall protocol
- **Admin tools via CLI & HTTP** — export, import, sync, and migration available without cluttering the MCP tool surface

## Quick Start

```bash
# Run directly (no install needed)
npx thoth-mem@latest

# Or install globally
npm install -g thoth-mem
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
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "thoth-mem@latest"]
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
thoth-mem migrate-project <old> <new>  # Rename a project across all entities
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

Thoth-Mem runs an HTTP REST API bridge alongside the MCP server by default. The bridge listens on port `7438` and provides full access to memory operations via standard HTTP.

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
curl http://localhost:7438/search?query=auth+pattern
```

**Example: Get memory statistics**

```bash
curl http://localhost:7438/stats
```

The HTTP API supports all memory operations: sessions, observations, prompts, search, export/import, and sync. See the interactive `/docs` interface for the full API reference.

## MCP Tools (13)


| Tool                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `mem_save`              | Save structured observations (decisions, bugs, patterns, configs) |
| `mem_search`            | Full-text search with compact (default) or preview mode           |
| `mem_context`           | Get recent context — sessions, prompts, observations, stats      |
| `mem_get_observation`   | Retrieve full observation by ID with pagination support           |
| `mem_session_start`     | Register a new coding session (idempotent)                        |
| `mem_session_summary`   | Save session summary AND close session in one call                |
| `mem_suggest_topic_key` | Suggest a stable topic_key for upsert workflows                   |
| `mem_capture_passive`   | Extract learnings from`## Key Learnings:` sections                |
| `mem_save_prompt`       | Save user prompts for future recall                               |
| `mem_update`            | Update an existing observation (preserves version history)        |
| `mem_delete`            | Delete observation (soft by default, hard optional)               |
| `mem_stats`             | Memory statistics — sessions, observations, prompts, projects    |
| `mem_timeline`          | Chronological context around a specific observation               |

> **Admin operations** (export, import, sync, migrate-project) are available via the [CLI](#cli-commands) and [HTTP REST API](#http-rest-api) — they are not registered as MCP tools to keep the agent's tool surface lean.

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

Append-only gzipped chunks designed for version control — no merge conflicts:

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
thoth-mem import --sync-dir=.thoth-sync
```

Each observation and prompt carries a `sync_id` (UUID) that prevents duplicates on re-import.

### Project Migration

Rename a project across every entity in one transaction:

```bash
thoth-mem migrate-project old-name new-name
```

Updates sessions, observations, and prompts atomically.

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
