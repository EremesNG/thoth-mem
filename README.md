# thoth-mem

SQLite-first persistent memory for OpenCode, Codex, and Claude Code.

The product has one local SQLite/FTS5 source of truth, immutable evidence, database-ordered session events, source-supported versioned session summaries, promoted temporal memories, and exactly six MCP tools: `mem_save`, `mem_recall`, `mem_context`, `mem_get`, `mem_project`, and `mem_session`. OpenCode additionally exposes one read-only native `thoth_mem_root_identity` tool for active-session metadata; it is not an MCP memory operation. Codex and Claude obtain the same root identity from verified native lifecycle context. It requires no embedding model, vector extension, graph engine, LLM, network service, HTTP server, or dashboard.

## Use

```sh
pnpm install --frozen-lockfile
pnpm run build
node dist/index.js mcp --data-dir ./memory-data
```

Recall is progressive: `mem_recall mode=compact`, then `mode=context`, then `mem_get` only when full content is needed. `mem_context` is a separate bounded project/session recovery briefing, and `mem_project action=summaries` provides bounded summary inspection. The exact six-tool surface does not change.

Verified session saves return an ordered event sequence. At `checkpoint_pre_compact` or `finalize`, `mem_session` may accept an externally produced structured summary whose every claim cites in-range evidence from the same project and root session. The core validates and versions it but never generates it or promotes a handoff automatically. A minimal checkpoint submission uses the evidence ID and event sequence returned by an earlier session-scoped `mem_save`:

```json
{
  "operation": "checkpoint_pre_compact",
  "harness": "codex",
  "project_key": "path:/workspace/thoth-mem",
  "project_name": "thoth-mem",
  "root_session_key": "verified-root-session",
  "event_key": "checkpoint:42",
  "content": "Non-empty checkpoint evidence.",
  "summary": {
    "kind": "checkpoint",
    "coverage": { "from_sequence": 1, "to_sequence": 7 },
    "generator": { "kind": "root_agent", "name": "root-agent" },
    "claims": [
      { "kind": "objective", "content": "Preserve supported session continuity.", "support_ids": ["evidence-id-from-mem-save"] },
      { "kind": "next_action", "content": "Run the focused verification lane.", "support_ids": ["evidence-id-from-mem-save"] }
    ]
  }
}
```

On recovery, the newest eligible summary for that exact verified session is rendered first as untrusted historical data with a stable `(summary:<id>)` expansion reference. Raw supports remain withheld from model-visible context; use `mem_get` for the selected summary ID when its structured claims and support IDs are needed. If no eligible summary exists, recovery truthfully falls back to current handoff/memory selection without fabricating one.

## Public plugin installation

OpenCode loads the npm package itself as a native plugin. Setup writes one exact `thoth-mem@<executing-version>` entry and synchronizes the packaged memory Skill into OpenCode's global Skill directory:

```sh
npx --yes thoth-mem@0.4.13 setup opencode --plan --json
npx --yes thoth-mem@0.4.13 setup opencode
```

Codex users can add the repository marketplace and install the public plugin:

```sh
codex plugin marketplace add EremesNG/thoth-mem
codex plugin add thoth-mem@thoth-mem
```

Claude Code users can use the corresponding repository marketplace:

```sh
claude plugin marketplace add EremesNG/thoth-mem
claude plugin install thoth-mem@thoth-mem
```

Both public plugins load the exact published `thoth-mem` npm version declared by the repository distribution. They include native hooks, one six-tool MCP registration, and the shared memory Skill.

The same operations are available through the package CLI. Codex `0.147.x` is the supported unforced manager contract; another Codex version fails closed unless `--force-version` verifies the complete safe manager surface first. Claude setup can verify marketplace, plugin, hooks, MCP, Skill, and runtime structure without claiming paid-model use.

```sh
npx --yes thoth-mem@0.4.13 setup codex --plan --json
npx --yes thoth-mem@0.4.13 setup codex
npx --yes thoth-mem@0.4.13 setup claude --plan --json
npx --yes thoth-mem@0.4.13 setup claude
```

Setup is global/user-native only. Project scope, copied plugin bundles, direct manager-cache edits, legacy fallback, and fragment migration are intentionally unsupported.

## Local OpenCode development

Build the checkout, then select local provenance explicitly. There is no fallback from `file://` to npm and the repository marketplaces remain unchanged:

```sh
pnpm run build
node dist/index.js setup opencode --plan --json \
  --local-package-root /absolute/path/to/thoth-mem \
  --data-dir /absolute/path/to/shared-memory
node dist/index.js setup opencode \
  --local-package-root /absolute/path/to/thoth-mem \
  --data-dir /absolute/path/to/shared-memory
```

The local entry is the canonical absolute URL for `dist/opencode.js`. OpenCode loads the thin native adapter inside Bun; SQLite-backed lifecycle calls cross bounded JSON stdio to literal `node` and the package-relative `dist/index.js lifecycle` entry, while MCP starts through the same package-relative Node entry. The adapter preserves user `skills.paths`, keeps changing recovered memory in one tagged trailing prompt region, and degrades without rejecting the host prompt if the Node lifecycle process is unavailable. Setup owns only the exact thoth-mem plugin entries, global `skills/thoth-mem` tree, provider config, and its bounded receipts.

Local Codex or Claude development uses the same explicit checkout provenance. The native manager still owns plugin installation; thoth-mem records the verified built `dist/index.js` entry outside the manager cache so the bundle runner uses the checkout instead of the published npm package:

```sh
node dist/index.js setup codex --local-package-root /absolute/path/to/thoth-mem --data-dir /absolute/path/to/shared-memory
node dist/index.js setup claude --local-package-root /absolute/path/to/thoth-mem --data-dir /absolute/path/to/shared-memory
```

## Shared runtime data

All hosts resolve one data directory in this order: explicit command value, `THOTH_MEM_DATA_DIR`, strict provider config, then `~/.thoth-mem`. The provider file is `${XDG_CONFIG_HOME:-~/.config}/thoth-mem/config.json`; `setup --data-dir` atomically merges only `dataDir` and preserves other valid provider fields. Explicit local Codex/Claude setup additionally records an absolute, package-identity-checked `runtimeEntry`; public manager setup removes that local override. Malformed, unreadable, schema-invalid, missing-runtime, or non-file configuration fails closed. The runtime database is always `memory.sqlite` inside the selected data directory.

Changed setup requests a host restart. A verified repeated setup changes no files or manager state and requests no restart. `--plan` performs no writes or mutating manager commands.

## Legacy import

The current runtime never opens a legacy database during normal operation. Import is a one-way CLI operation into a distinct clean target; the source is opened read-only and verified unchanged.

```sh
node dist/index.js import-legacy --source ./legacy.sqlite --target ./memory.sqlite --report ./import-report.json
```

The runtime also does not guess, rename, copy, or dual-read a database created under the previous generation-suffixed default filename. To adopt an existing local ledger, first close every host process, create a recoverable backup, then explicitly copy or move the exact selected old database to `memory.sqlite` in the configured data directory before restarting. Repository setup and tests never perform this stateful operation in a real user home.

## Verification and benchmarks

```sh
pnpm test
pnpm run integration:verify
pnpm run integration:smoke
pnpm run benchmark:fixture
pnpm run prepublishOnly
```

The committed fixture is an offline contract check, not evidence that optional retrieval lanes should be promoted. External LongMemEval-S, LoCoMo, AMB, and SDEBench lanes remain explicitly unavailable until separately prepared equal-budget runs produce complete reports.

LongMemEval-S is the first opt-in external retrieval baseline. Preparation is the only networked step; it downloads the official cleaned S file from an immutable Hugging Face revision, verifies SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`, validates its records, and stores it under the gitignored `benchmarks/.cache/longmemeval/` directory. Evaluation re-verifies the file and runs offline:

```sh
pnpm run benchmark:prepare:longmemeval
pnpm run benchmark:longmemeval
```

The offline command writes `benchmarks/results/longmemeval-s-fts5-report.json` atomically and refuses to overwrite an existing result. It evaluates one isolated SQLite database per eligible question, one ordered full-dialogue memory per session occurrence, and the real `MemoryService` FTS5/BM25 path. Repeated official `haystack_session_id` values remain distinct Top-K positions under deterministic occurrence source IDs; empty string turn content is preserved. This product profile is deliberately named `sqlite-fts5-bm25-session-full`; it does not claim numerical parity with the official user-only, space-tokenized `rank_bm25` runner.

Only the 30 `_abs` abstention records are excluded. Every other record must have nonempty `answer_session_ids` resolving to ingested session occurrences; `answer`, `has_answer`, oracle data, and gold IDs never enter indexed text or ranking. The report keeps `recall_any`, fractional Recall, and `recall_all` distinct at K=1/5/10/20 over distinct gold session IDs, plus first-gold MRR over candidate positions and occurrence-level binary NDCG@10. Candidate quality uses Top-20 with a 20,000-UTF-16-unit measurement allowance; delivery is measured separately at 4,000 UTF-16 units, the product's current `estimated_chars_div_4` approximation for 1,000 tokens.

The report also records source/configuration hashes, per-question provenance and ranking/delivery budget evidence (requested, source, evidence, returned, truncated, full, and compression), reconciled character/token aggregates, p50/p95 retrieval, delivery, ingestion and startup latency, process RSS, SQLite bytes, exclusions, and literal zero evaluation-time network/model/LLM calls. A lexical baseline alone always remains `incomplete` for promotion: it supplies the control evidence for a later equal-budget candidate and does not justify vectors or any other optional module.

Authoritative protocol sources: [LongMemEval repository](https://github.com/xiaowu0162/LongMemEval), [official cleaned dataset](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned), and [pinned dataset revision](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/commit/98d7416c24c778c2fee6e6f3006e7a073259d48f).
