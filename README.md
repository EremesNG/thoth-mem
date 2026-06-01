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
- **Knowledge Graph Ledger rebuild** — backfill derived KG/ledger facts for existing memories; legacy graph endpoint compatibility is preserved
- **MCP Server Instructions** — built-in protocol guidance for connected agents
- **Observation versioning** — full history preserved on topic_key upserts
- **Session enrichment** — sessions auto-fill missing project/directory on reconnect
- **Normalized deduplication** — whitespace/formatting-insensitive duplicate detection
- **Strict type taxonomy** — observation types enforced at the database level
- **Paginated retrieval** — large observations served in chunks via offset/max_length
- **Privacy defense** — `<private>` tags stripped before storage
- **Token-efficient recall** — compact fused evidence first, context expansion only when needed
- **Retrieval and KG eval baselines** — deterministic hybrid retrieval and graph-quality benchmarks (lexical, semantic raw/HyDE, KG, compression, lineage, forbidden triples, optional LLM KG acceptance)
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
pnpm run eval:kg
```

`pnpm run eval:retrieval` runs a deterministic in-memory hybrid retrieval eval against seeded observations, curated non-synthetic project-documentation examples, and synthetic distractors. It reports hybrid recall under noise, corpus size, direct vs rephrased vs non-synthetic case mix, measured surgical compression, HyDE lift, pending/degraded fallback, lexical prefix behavior, semantic raw vs HyDE contribution, sentence-first small-to-big promotion, KG enrichment, KG-as-primary lane rate, and evidence lineage coverage without requiring model downloads or remote APIs. The default gate now requires every eval case to land at rank 1.

Scale the retrieval eval with `THOTH_RETRIEVAL_EVAL_NOISE` when you want hundreds or thousands of synthetic distractors. In PowerShell:

```powershell
$env:THOTH_RETRIEVAL_EVAL_NOISE='250'; pnpm run eval:retrieval
```

`pnpm run eval:kg` runs a deterministic KG quality eval for subject-relation-object extraction. It reports expected triple recall, forbidden triple rate, long-conversation cases where deterministic extraction should be paired with optional LLM enrichment, and acceptance of validated LLM triples while rejecting unknown relations.

## MCP Tools (6)


| Tool                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `mem_save`              | Save observations, prompts, session summaries, or passive learnings |
| `mem_recall`            | Primary fused hybrid recall across semantic, KG, and lexical lanes |
| `mem_context`           | Get recent context — sessions, prompts, observations, stats      |
| `mem_get`               | Retrieve full memory by ID, optionally with session timeline      |
| `mem_project`           | List projects, summarize one project, inspect graph facts/topics |
| `mem_session`           | Start, checkpoint, or summarize a memory session                  |

> **Admin operations** (export, import, sync, migrate-project, rebuild-graph, rebuild-index) are available via the [CLI](#cli-commands). Export, import, sync, and migration are also available through the [HTTP REST API](#http-rest-api). They are not registered as MCP tools to keep the agent's tool surface lean.

## Retrieval and Embeddings

- `mem_recall` is the primary retrieval tool. Use `mode=compact` first, then `mode=context` for the strongest hits, and `mem_get` only when full content is needed.
- `mem_recall` accepts precision filters for `project`, `session_id`, `scope`, `topic_key`, `type`, `time_from`, and `time_to`; these pass through to all retrieval lanes.
- Hybrid retrieval defaults use tuned core lane fusion: sentence top-k 100, chunk top-k 20, lexical limit 20, min semantic score 0.3, and lane order `sentence > kg > chunk > lexical`. Knowledge-graph facts now participate as a first-class ranking lane and also enrich returned hits with supporting graph evidence.
- Lexical ranking filters low-signal query stopwords and scores prefix matches by content-term coverage, so a broad one-word overlap cannot outrank stronger semantic/KG evidence under noisy corpora.
- Surgical trimming is explicit in `mem_recall mode=context`: sentence hits return a `primary_sentence` and, when the score clears the small-to-big threshold, a labeled `surrounding_parent_chunk`. Lexical hits return matching sentences instead of whole observations. Each context hit includes `retrieval_contract`, `compression_ratio`, `evidence_chars`, and `full_chars` so noise reduction is measured rather than claimed.
- Semantic indexing is eventual and non-blocking. Save/update operations can return while indexing stays pending in the background. Terminal job failures keep `last_error` and `finished_at`, and later queued jobs continue processing instead of being starved by failed work.
- `/viz/health` and `/observatory/health` include product telemetry for semantic lanes, job totals, vector coverage ratios, and recent indexing/KG warnings. Optional KG LLM failures are recorded as job telemetry while deterministic KG extraction still completes.
- Automatic rebuild is triggered when embedding configuration hash changes; manual rebuild is available through `thoth-mem rebuild-index --project <name>` and `thoth-mem rebuild-index --all`. Use `thoth-mem rebuild-index --status` to inspect queue progress, lane state, recent errors, and vector coverage.
- When semantic lanes are pending or unavailable, retrieval degrades safely to lexical recall with graph enrichment where matching facts exist, and reports fallback metadata (`pending`, `degraded_fallback`) instead of failing.
- `sqlite-vec` is optional at runtime: if unavailable, Thoth-Mem marks semantic lanes degraded and continues serving lexical retrieval with KG enrichment.
- Local embeddings default to provider `transformers_local` and model `nomic-ai/nomic-embed-text-v1.5` unless overridden.
- HyDE is enabled by default. The local fallback uses Transformers.js text generation with `onnx-community/Qwen2.5-Coder-0.5B-Instruct`; remote HyDE can use Ollama or an OpenAI-compatible LM Studio server.
- KG extraction is deterministic-first. Optional LLM enrichment can be enabled for long conversations with Ollama or LM Studio; generated triples are filtered through the same relation taxonomy and merged with deterministic triples. If the remote extractor is disabled or unavailable, deterministic KG extraction still completes.

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

### Recommended HyDE Models

HyDE needs a generative/instruct model, not an embedding model. It writes a short hypothetical answer to the recall query; Thoth-Mem embeds both the raw query and the HyDE answer as separate semantic inputs.

| Use case | Provider/model | Notes |
| --- | --- | --- |
| Default local fallback | [`onnx-community/Qwen2.5-Coder-0.5B-Instruct`](https://huggingface.co/onnx-community/Qwen2.5-Coder-0.5B-Instruct) via Transformers.js | Small ONNX model for local text generation. Good enough for short retrieval hints and code-heavy memories; loaded with `dtype: "q4"`. |
| Ollama code-heavy memory | [`qwen2.5-coder:7b`](https://ollama.com/library/qwen2.5-coder) | Recommended 7B-class local model for coding-agent memory and technical HyDE prompts. |
| Ollama general/multilingual | [`qwen2.5:7b-instruct`](https://ollama.com/library/qwen2.5) | Better general-purpose choice when memory is not mostly code. |
| LM Studio code-heavy memory | [`Qwen/Qwen2.5-Coder-7B-Instruct`](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct) GGUF | In LM Studio, use the exact model id shown in the Developer panel, often from an `lmstudio-community/...-GGUF` download. |
| LM Studio general fallback | [`meta-llama/Meta-Llama-3.1-8B-Instruct`](https://huggingface.co/meta-llama/Meta-Llama-3.1-8B-Instruct) GGUF | Strong general 8B-class option if you already have Llama available locally. |

Example with LM Studio embeddings and LM Studio HyDE:

```json
{
  "embedding": {
    "provider": "lmstudio",
    "model": "text-embedding-nomic-embed-text-v1.5@q8_0",
    "baseUrl": "http://127.0.0.1:1234",
    "dimensions": 768
  },
  "hyde": {
    "enabled": true,
    "provider": "lmstudio",
    "model": "loaded_model",
    "baseUrl": "http://127.0.0.1:1234/v1",
    "timeoutMs": 4000
  }
}
```

### Optional KG LLM Enrichment

KG extraction defaults to the deterministic extractor. To enrich long observations, enable a remote local model provider and set the minimum content length that should trigger the LLM pass:

```bash
THOTH_KG_LLM_ENABLED=true \
THOTH_KG_LLM_PROVIDER=ollama \
THOTH_KG_LLM_BASE_URL=http://127.0.0.1:11434 \
THOTH_KG_LLM_MODEL=qwen2.5:7b-instruct \
THOTH_KG_LLM_MIN_CONTENT_CHARS=12000 \
thoth-mem
```

LM Studio uses the OpenAI-compatible chat completions endpoint:

```bash
THOTH_KG_LLM_ENABLED=true \
THOTH_KG_LLM_PROVIDER=lmstudio \
THOTH_KG_LLM_BASE_URL=http://127.0.0.1:1234/v1 \
THOTH_KG_LLM_MODEL=loaded_model \
thoth-mem
```

The LLM pass is an enrichment step, not the source of truth: invalid relation names are discarded, duplicate triples are deduped, and KG jobs continue with deterministic triples if the remote request fails.


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

On startup, Thoth-Mem creates `~/.thoth/config.json` if it does not exist and backfills missing keys when the file is partial. Environment variables override config file values at runtime, but they are not written back to the file.

Default editable config:

```json
{
  "version": 1,
  "maxContentLength": 100000,
  "maxContextResults": 20,
  "maxSearchResults": 20,
  "dedupeWindowMinutes": 15,
  "previewLength": 300,
  "http": {
    "port": 7438,
    "disabled": false
  },
  "retrievalDefaults": {
    "sentenceTopK": 100,
    "chunkTopK": 20,
    "lexicalLimit": 20,
    "minSemanticScore": 0.3,
    "l2DistanceScale": 20
  },
  "embedding": {
    "provider": "transformers_local",
    "model": "nomic-ai/nomic-embed-text-v1.5",
    "baseUrl": null,
    "dimensions": 768
  },
  "hyde": {
    "enabled": true,
    "provider": "transformers_local",
    "model": "onnx-community/Qwen2.5-Coder-0.5B-Instruct",
    "baseUrl": null,
    "timeoutMs": 4000
  },
  "kgLlm": {
    "enabled": false,
    "provider": "ollama",
    "model": "qwen2.5:7b-instruct",
    "baseUrl": "http://127.0.0.1:11434",
    "timeoutMs": 8000,
    "minContentChars": 12000
  }
}
```

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
| `THOTH_HYDE_ENABLED`          | `true`     | Enable HyDE dual-input semantic query expansion |
| `THOTH_HYDE_PROVIDER`         | `transformers_local` | HyDE generation provider (`transformers_local`, `ollama`, `lmstudio`) |
| `THOTH_HYDE_MODEL`            | `onnx-community/Qwen2.5-Coder-0.5B-Instruct` | HyDE generation model id |
| `THOTH_HYDE_BASE_URL`         | unset      | Optional HyDE provider base URL |
| `THOTH_HYDE_TIMEOUT_MS`       | `4000`     | HyDE timeout before raw-query-only fallback |
| `THOTH_KG_LLM_ENABLED`        | `false`    | Enable optional LLM KG enrichment for long observations |
| `THOTH_KG_LLM_PROVIDER`       | `ollama`   | KG LLM provider (`ollama`, `lmstudio`) |
| `THOTH_KG_LLM_MODEL`          | `qwen2.5:7b-instruct` | KG LLM model id |
| `THOTH_KG_LLM_BASE_URL`       | `http://127.0.0.1:11434` | KG LLM provider base URL |
| `THOTH_KG_LLM_TIMEOUT_MS`     | `8000`     | KG LLM timeout before deterministic-only fallback |
| `THOTH_KG_LLM_MIN_CONTENT_CHARS` | `12000` | Minimum observation size that triggers LLM enrichment |

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
