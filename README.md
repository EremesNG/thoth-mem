<div align="center">

<img src="img/thoth-mem.png" alt="Thoth-Mem" width="400" />

# Thoth-Mem

**Persistent memory for AI coding agents**

[![npm version](https://img.shields.io/npm/v/thoth-mem)](https://www.npmjs.com/package/thoth-mem)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Give coding agents durable project memory across sessions, compactions, and context resets.

</div>

Thoth-Mem is a local-first MCP server backed by SQLite and FTS5. It preserves useful decisions, bug fixes, conventions, and session continuity, then retrieves only the evidence an agent needs. The same installation also provides a CLI, an optional HTTP API, and native lifecycle integrations for supported coding harnesses.

Global scope manages the current user's harness configuration; project scope is explicit and confined to the selected project and its receipt tree. Engram, thoth-agents, or another memory integration may overlap; treat this as a warning only: thoth-mem does not edit, disable, remove, or write to external repositories.

## First use

Requires Node.js 18 or newer.

```bash
npx -y thoth-mem@latest mcp
```

This starts the MCP server and its local HTTP bridge. For a persistent command that native integrations can invoke, install the CLI globally:

```bash
pnpm add -g thoth-mem
thoth-mem mcp
```

New client configurations should use the explicit `mcp` subcommand. Add `--no-http` when only the MCP transport is wanted.

## The memory loop

A useful agent workflow is small and repeatable:

1. **Save the durable lesson.** Use `mem_save` for a decision, root cause, convention, or other non-obvious fact that should survive the current context.
2. **Recall narrowly.** Start with `mem_recall(mode="compact")`, expand strong candidates with `mode="context"`, and fetch a complete selected record with `mem_get`.
3. **Resume with identity.** Keep the same stable `session_id` and `project`; use `mem_context` for recent continuity and `mem_session` for root-owned lifecycle events.

Example observation:

```json
{
  "kind": "observation",
  "title": "Retry SQLite writes in a new transaction",
  "type": "bugfix",
  "project": "my-project",
  "topic_key": "sqlite/busy-retry",
  "content": "**What**: Roll back after SQLITE_BUSY and retry in a new transaction.\n**Why**: Retrying inside the failed transaction repeats the failure.\n**Where**: write transaction helper.\n**Learned**: Use bounded backoff before opening the new transaction."
}
```

Remove content inside `<private>...</private>` before persistence. Do not store credentials, complete transcripts, generated agent prompts as user intent, or raw logs without a reusable lesson.

## Six MCP tools

| Tool | Use it for |
| --- | --- |
| `mem_save` | Persist an observation, real user prompt, root-owned summary, or passive learning. |
| `mem_recall` | Run bounded fused recall; use compact results before expanding context. |
| `mem_context` | Read recent sessions, prompts, observations, and optional recalled continuity. |
| `mem_get` | Fetch one observation or prompt by ID, with bounded pagination or timeline context. |
| `mem_project` | Navigate projects, topics, graph views, and operational health. |
| `mem_session` | Start, checkpoint, or summarize a root-owned memory session. |

Setup, sync, migration, rebuild, and maintenance commands are CLI/HTTP administration, not additional MCP tools.

## Inspect graph communities

Communities are bounded summaries derived from a project's knowledge graph. An operator builds or refreshes the committed summaries through the CLI:

```bash
thoth-mem rebuild-communities --project my-project
```

An agent then obtains them through `mem_project`:

```json
{
  "action": "graph",
  "project": "my-project",
  "navigation": "community",
  "limit": 5,
  "max_chars": 2000
}
```

The response reports community state and freshness, then entries such as `community=<id>`, graph coverage, confidence, degradation state, a bounded summary, and `sources=obs:<id>`. Community inspection requires a project but no focus node or observation ID. If no committed summaries exist, it says so instead of synthesizing a global answer.

To inspect evidence behind a community, take an `obs:<id>` from its `sources` field and call `mem_get(kind="observation", id=<id>)`. Observation IDs also appear in recall results. For a bounded graph neighborhood, reuse one as `focus_node_id="obs:<id>"` with `navigation="neighborhood"`.

## Native harness integrations

Native setup installs the packaged MCP declaration, memory skill, and lifecycle hooks where the harness supports them. Inspect the zero-write plan first, then rerun without `--plan` to apply it:

| Harness | Plan | Apply |
| --- | --- | --- |
| OpenCode | `thoth-mem setup opencode --scope global --plan --json` | `thoth-mem setup opencode --scope global --json` |
| Codex | `thoth-mem setup codex --scope global --plan --json` | `thoth-mem setup codex --scope global --json` |
| Claude Code | `thoth-mem setup claude --scope global --plan --json` | `thoth-mem setup claude --scope global --json` |

The default OpenCode setup command is `thoth-mem setup opencode`; add
`thoth-mem setup opencode --scope project --project /path/to/project --force`
when explicitly targeting a project, or use
`thoth-mem setup codex --rollback /path/to/receipt.json` for a receipt-scoped
rollback.

Setup status and process exit codes are stable:

| Status | Exit code |
| --- | --- |
| `complete` | `0` |
| `failed` | `1` |
| `partial` | `2` |
| `requires_user_action` | `3` |

Project-local setup is explicit:

```bash
thoth-mem setup opencode --scope project --project /path/to/project --plan --json
```

Review detected conflicts before applying. Use `--force` only for conflicting locations whose thoth-mem ownership is already proven; it does not grant authority over unrelated configuration.

Claude Code also supports its native marketplace flow:

```bash
claude plugin marketplace add EremesNG/thoth-mem
claude plugin install thoth-mem
```

Native integration is optional. Existing memories and the six-tool MCP server continue to work with a manual connection.

### Manual MCP fallback

Native hooks are optional. Keep a plain six-tool MCP connection when you do not
want managed setup or a native plugin; existing memories remain available.

## Transitioning to native harness integration

Native setup is opt-in: inspect the zero-write plan, review conflicts, then apply the matching harness command. For Codex, open `/plugins`, install thoth-mem from `EremesNG/thoth-mem`, and verify the marketplace and plugin state. External Codex registration is not atomically reversible, so confirm external state before retrying or rolling back local setup.

Managed setup contract: Plan mode performs zero writes and only mutation at
thoth-mem-managed locations. Backups are created before the first mutation;
OpenCode accepts `opencode.json` or `opencode.jsonc`. Each mutating attempt
writes an HMAC-protected receipt with status `in_progress` before changes:

- global receipts: `<thoth-data-dir>/setup/receipts/<receipt-id>/receipt.json`
- project receipts: `<project>/.thoth/setup/receipts/<receipt-id>/receipt.json`

Missing or tampered receipts fail closed. A verified rollback preserves unrelated settings,
while drift or unavailable capabilities return `requires_user_action`.
Repeated setup and repeated completed rollback are no-ops when verified state
already matches.

### Gemini CLI: manual MCP

Gemini CLI is a manual MCP client path, not a managed native thoth-mem integration. Add this entry to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "thoth": {
      "command": "npx",
      "args": ["-y", "thoth-mem@latest", "mcp"]
    }
  }
}
```

## Evaluate retrieval and graph quality

The repository includes deterministic evaluation commands:

```bash
pnpm run eval:retrieval
pnpm run eval:kg
pnpm run eval:embedding-models -- --help
```

`eval:retrieval` seeds signal observations plus distractors and measures whether the expected memory ranks near the top. Read its report as a collection of signals:

- **Recall and rank** show whether the right evidence was found and how early.
- **Noise and case mix** show robustness across direct, rephrased, and repository-derived examples.
- **Compression** shows how much evidence was removed before context delivery; it is an efficiency signal, not proof that the remaining text is correct.
- **Lane and fallback evidence** shows lexical, semantic raw/HyDE, and KG participation, including pending or degraded semantic behavior.
- **Lineage and provenance** show whether returned evidence remains attributable to its source.

`eval:kg` measures expected subject-relation-object recall, forbidden-triple leakage, deterministic extraction behavior, and validated optional LLM enrichment. Missing expected facts indicate coverage gaps; forbidden hits indicate unsafe graph invention.

These evals are deterministic development gates over curated and synthetic fixtures. They do not predict every production corpus, replace human review, prove a native harness integration, or by themselves justify enabling optional community read paths. Compare the individual cases and failure messages instead of treating one aggregate number as universal quality.

### Embedding profiles and model comparison

Semantic embedding inputs are formatted by a versioned model profile. `auto` recognizes Nomic, EmbeddingGemma, and Qwen3-Embedding model-family aliases; unknown models use `raw` and receive no inferred asymmetric formatting. The public configuration intentionally has no global `task` field: retrieval intent and query/document role are assigned internally for each input, including document-role HyDE answers.

```json
{
  "embedding": {
    "provider": "lmstudio",
    "model": "text-embedding-embeddinggemma-300m",
    "baseUrl": "http://127.0.0.1:1234",
    "dimensions": 768,
    "profile": "auto",
    "normalize": true
  }
}
```

Supported profile values are `auto`, `nomic`, `embeddinggemma`, `qwen3`, and `raw`. `THOTH_EMBEDDING_PROFILE` and `THOTH_EMBEDDING_NORMALIZE` override persisted values. The resolved profile version and normalization flag are part of semantic index lineage, so changing them marks prior vectors stale and uses the existing idempotent rebuild queue.

Provider model examples:

| Profile | LM Studio model ID | Transformers.js model ID | Native dimensions |
| --- | --- | --- | ---: |
| Nomic | use the exact ID from `/v1/models`, for example `text-embedding-nomic-embed-text-v1.5@q8_0` | `nomic-ai/nomic-embed-text-v1.5` | 768 |
| EmbeddingGemma | `text-embedding-embeddinggemma-300m` for the verified GGUF installation | `onnx-community/embeddinggemma-300m-ONNX` | 768 |
| Qwen3-Embedding-0.6B | `text-embedding-qwen3-embedding-0.6b` for the verified GGUF installation | `onnx-community/Qwen3-Embedding-0.6B-ONNX` | 1024 |

EmbeddingGemma local execution consumes `sentence_embedding`. Qwen local execution applies the retrieval instruction only to queries and uses the last attended hidden-state token for pooling. All providers reject incomplete, non-finite, zero, or dimensionally inconsistent batches. LM Studio response indexes are validated and valid out-of-order rows are restored to input order; missing, duplicate, or invalid indexes are rejected. During recall these errors explicitly degrade semantic retrieval while lexical and KG retrieval continue.

Run the three-model quality gate with explicit model IDs and a durable output path:

```bash
pnpm run eval:embedding-models -- --provider lmstudio --base-url http://127.0.0.1:1234 --nomic-model <nomic-id> --embeddinggemma-model <gemma-id> --qwen3-model <qwen-id> --output <result.json>
```

The gate requires all three executions to complete and at least one candidate to meet the Recall@1/Recall@5/MRR thresholds without regressing any Nomic metric. Nomic is the relative comparator, not a candidate subject to the absolute thresholds. If both candidates qualify, an explicit quality score and stable tie-break order select the winner. A missing model, invalid vector, no eligible candidate, or report-write failure exits non-zero and preserves the current default.

The recorded 2026-08-08 LM Studio run selected EmbeddingGemma as the shipped local default. EmbeddingGemma and Qwen3 both completed with Recall@1 `1.00`, Recall@5 `1.00`, and MRR `1.00`, versus Nomic `0.50`, `1.00`, and `0.7167`; both candidates were eligible, and EmbeddingGemma won their exact quality tie by the stable lexical profile-ID rule. Median latency in the persisted decision run was 190.5 ms for Nomic, 195 ms for EmbeddingGemma, and 320.5 ms for Qwen3.

Qwen3 file sizes depend on the runtime artifact:

| Qwen3 artifact | Quantization | Bytes | MiB |
| --- | --- | ---: | ---: |
| Original Transformers `model.safetensors` | BF16 | 1,191,586,416 | 1,136.39 |
| Transformers.js `onnx/model_quantized.onnx` | Q8 | 613,527,631 | 585.11 |
| LM Studio `Qwen3-Embedding-0.6B-Q8_0.gguf` | Q8_0 | 639,150,592 | 609.54 |

The Qwen3 Q8 model is 304,069,133 bytes larger than EmbeddingGemma Q8 in Transformers.js and 305,559,648 bytes larger in LM Studio. It also uses native 1024-dimensional vectors instead of EmbeddingGemma's 768 dimensions. The runner does not install or discover provider models on the operator's behalf.

Scale retrieval noise when you want a tougher local run:

```powershell
$env:THOTH_RETRIEVAL_EVAL_NOISE='250'
pnpm run eval:retrieval
```

## Advanced operations

- Run `thoth-mem help` for the complete CLI command and option list.
- Open the local dashboard at `http://localhost:7438/` and OpenAPI documentation at `http://localhost:7438/docs`.
- Use `thoth-mem sync --dir=.thoth-sync` and `thoth-mem sync-import --dir=.thoth-sync` for Git-friendly portability.
- Review [`config.schema.json`](config.schema.json) for persisted configuration and environment-backed settings.
- Data lives in `~/.thoth/thoth.db` by default; override the data directory with `THOTH_DATA_DIR` or `--data-dir`.

Semantic indexing is non-blocking. If embeddings or `sqlite-vec` are unavailable, recall remains usable through supported lexical and graph evidence and reports the degraded lane instead of silently claiming semantic success.

## Development

```bash
pnpm install
pnpm run integration:verify
pnpm run build
pnpm test
```

## License

[MIT](LICENSE)
