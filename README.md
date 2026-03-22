# Thoth-Mem

Persistent memory MCP server for AI coding agents, built for durable cross-session context and fast retrieval.

Thoth gives your AI coding agent a brain that persists across sessions. When a session ends (or context is compacted), Thoth remembers what was learned - architecture decisions, bug fixes, discovered patterns, user preferences - and makes them retrievable in future sessions via full-text search.

## Features

- **13 MCP tools** across agent and admin profiles
- **SQLite + FTS5** full-text search (fast, zero external dependencies)
- **Strict type taxonomy** - observation types enforced at the database level
- **Observation versioning** - full history preserved when updating via topic_key
- **Unified session management** - `mem_session_summary` closes session AND saves summary in one call
- **Paginated retrieval** - large observations served in chunks via offset/max_length
- **Normalized deduplication** - whitespace/formatting-insensitive duplicate detection
- **No silent truncation** - warns instead of silently cutting content at 50k chars
- **Privacy defense** - `<private>` tags stripped before storage
- **Tool profiles** - `--tools=agent` for coding sessions, `--tools=admin` for curation
- **Published on NPM** - `npx thoth-mem` just works

## Installation

```bash
# Run directly (no install needed)
 npx thoth-mem

# Or install globally
npm install -g thoth-mem
```

Requires Node.js >= 18.

## MCP Configuration

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

### Claude Code

```bash
claude mcp add thoth-mem -- npx -y thoth-mem
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

```json
{
  "mcp": {
    "thoth": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "thoth-mem", "--tools=agent"]
    }
  }
}
```

## Tools Reference

### Agent Profile (10 tools)

| Tool | Description |
|------|-------------|
| `mem_save` | Save structured observations (decisions, bugs, patterns) to persistent memory |
| `mem_search` | Full-text search across all observations |
| `mem_context` | Get recent session context (sessions, prompts, observations, stats) |
| `mem_get_observation` | Get full observation by ID with paginated retrieval for large content |
| `mem_session_start` | Register the start of a coding session |
| `mem_session_summary` | Save end-of-session summary AND close session in one call |
| `mem_suggest_topic_key` | Suggest a stable topic_key for upsert operations |
| `mem_capture_passive` | Extract learnings from `## Key Learnings:` sections |
| `mem_save_prompt` | Save user prompts for future context |
| `mem_update` | Update an existing observation (creates version history) |

### Admin Profile (3 tools)

| Tool | Description |
|------|-------------|
| `mem_delete` | Delete observation (soft-delete by default, hard-delete optional) |
| `mem_stats` | Get memory statistics (sessions, observations, prompts, projects) |
| `mem_timeline` | Show chronological context around a specific observation |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `THOTH_DATA_DIR` | `~/.thoth` | Data directory for SQLite database |
| `THOTH_MAX_CONTENT_LENGTH` | `100000` | Max recommended content length (warns, doesn't truncate) |
| `THOTH_MAX_CONTEXT_RESULTS` | `20` | Max observations in context response |
| `THOTH_MAX_SEARCH_RESULTS` | `20` | Max search results |
| `THOTH_DEDUPE_WINDOW_MINUTES` | `15` | Deduplication rolling window |
| `THOTH_PREVIEW_LENGTH` | `300` | Search result preview length |

## CLI Arguments

```bash
thoth-mem [--tools=agent,admin] [--data-dir=/path/to/.thoth]
```

- `--tools`: Comma-separated tool profiles to enable (default: all)
- `--data-dir`: Override data directory (default: `~/.thoth`)

## Storage

Data is stored in a SQLite database at `~/.thoth/thoth.db` (configurable via `THOTH_DATA_DIR`).

Database uses:
- WAL journal mode for concurrent reads
- FTS5 for full-text search
- Foreign key constraints
- CHECK constraints for type taxonomy

## License

MIT
