<div align="center">

# Thoth-Mem

**Persistent memory for AI coding agents**

[![npm version](https://img.shields.io/npm/v/thoth-mem)](https://www.npmjs.com/package/thoth-mem)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Give your AI coding agent a brain that survives across sessions, compactions, and context resets.

</div>

---

Thoth-Mem is an MCP server that stores what your agent learns — architecture decisions, bug fixes, patterns, preferences — in a local SQLite database with full-text search. When a new session starts, the agent picks up right where it left off.

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

- **18 MCP tools** across agent and admin profiles
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
- **Tool profiles** — `--tools=agent` for coding sessions, `--tools=admin` for curation

## Quick Start

```bash
# Run directly (no install needed)
npx thoth-mem

# Or install globally
npm install -g thoth-mem
```

Requires Node.js >= 18.

## MCP Configuration

### Claude Code

```bash
claude mcp add thoth-mem -- npx -y thoth-mem
```

### OpenCode

Add to `~/.config/opencode/config.json`:

```json
{
  "mcp": {
    "thoth": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "thoth-mem"]
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
      "args": ["-y", "thoth-mem"]
    }
  }
}
```

### With tool profile filtering

Only expose agent tools (hides admin/curation tools):

```json
{
  "args": ["-y", "thoth-mem", "--tools=agent"]
}
```

## CLI Commands

Thoth-Mem also works as a standalone CLI. When no subcommand is given, it starts the MCP server.

```bash
thoth-mem                              # Start MCP server (default)
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
```

## MCP Tools

### Agent Profile (10 tools)

| Tool | Purpose |
|------|---------|
| `mem_save` | Save structured observations (decisions, bugs, patterns, configs) |
| `mem_search` | Full-text search across all observations |
| `mem_context` | Get recent session context — sessions, prompts, observations, stats |
| `mem_get_observation` | Retrieve full observation by ID with pagination support |
| `mem_session_start` | Register a new coding session (idempotent) |
| `mem_session_summary` | Save session summary AND close session in one call |
| `mem_suggest_topic_key` | Suggest a stable topic_key for upsert workflows |
| `mem_capture_passive` | Extract learnings from `## Key Learnings:` sections |
| `mem_save_prompt` | Save user prompts for future recall |
| `mem_update` | Update an existing observation (preserves version history) |

### Admin Profile (8 tools)

| Tool | Purpose |
|------|---------|
| `mem_delete` | Delete observation (soft by default, hard optional) |
| `mem_stats` | Memory statistics — sessions, observations, prompts, projects |
| `mem_timeline` | Chronological context around a specific observation |
| `mem_migrate_project` | Rename a project across sessions, observations, and prompts |
| `mem_export` | Export all memory (or by project) as JSON |
| `mem_import` | Import memory from JSON with sync_id deduplication |
| `mem_sync_export` | Export to git-friendly gzipped chunks with manifest |
| `mem_sync_import` | Import from a sync directory |

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

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `THOTH_DATA_DIR` | `~/.thoth` | Data directory for SQLite database |
| `THOTH_MAX_CONTENT_LENGTH` | `100000` | Max content length (warns, never truncates) |
| `THOTH_MAX_CONTEXT_RESULTS` | `20` | Max observations in context response |
| `THOTH_MAX_SEARCH_RESULTS` | `20` | Max search results returned |
| `THOTH_DEDUPE_WINDOW_MINUTES` | `15` | Rolling deduplication window |
| `THOTH_PREVIEW_LENGTH` | `300` | Search result preview length |

## Storage

All data lives in a single SQLite database at `~/.thoth/thoth.db` (configurable via `THOTH_DATA_DIR` or `--data-dir`).

- **WAL journal mode** for concurrent read performance
- **FTS5** full-text search over observations and prompts
- **Foreign keys + CHECK constraints** for data integrity
- **Automatic schema migrations** for seamless upgrades

## Observation Types

Observations are categorized with an enforced taxonomy:

| Type | Use for |
|------|---------|
| `decision` | Architecture or design choices |
| `architecture` | System structure and patterns |
| `bugfix` | Bug fixes and root causes |
| `pattern` | Established conventions |
| `config` | Configuration and environment setup |
| `discovery` | Non-obvious findings about the codebase |
| `learning` | General learnings and gotchas |
| `session_summary` | End-of-session summaries |
| `manual` | Anything that doesn't fit above |

## License

MIT
