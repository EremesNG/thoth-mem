# Thoth — Persistent Memory MCP Server

> **For agentic workers:** Use Architect agent to execute this plan. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Create a TypeScript MCP stdio server that provides persistent memory for AI coding agents — an improved alternative to engram. Published on NPM, runnable via `npx thoth`.

**Architecture:** MCP stdio server built with `@modelcontextprotocol/sdk` (v1). SQLite + FTS5 via `better-sqlite3` for storage. 13 tools across agent/admin profiles (engram's 14 minus `mem_session_end`, which is unified into `mem_session_summary`). All data stored at `~/.thoth/thoth.db` (configurable via `THOTH_DATA_DIR`). Improvements over engram: strict type taxonomy (CHECK constraint), observation versioning (full history), unified session close+summary, paginated large-content retrieval, normalized dedup.

**Tech Stack:** TypeScript (ESM, Node16 modules), Node.js ≥18, `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, `vitest`

---

## File Structure

```
thoth/
├── src/
│   ├── index.ts                          # Entry point — parse args, start MCP server
│   ├── server.ts                         # McpServer setup, tool registration, lifecycle
│   ├── config.ts                         # Env vars → config object, data dir resolution
│   ├── store/
│   │   ├── index.ts                      # Store class — all SQLite data operations
│   │   ├── schema.ts                     # SQL schema string (DDL), pragmas, migrations
│   │   └── types.ts                      # TS types for DB entities, inputs, outputs
│   ├── tools/
│   │   ├── index.ts                      # Tool registry, profile filtering
│   │   ├── mem-save.ts                   # mem_save tool
│   │   ├── mem-search.ts                 # mem_search tool
│   │   ├── mem-context.ts                # mem_context tool
│   │   ├── mem-get-observation.ts        # mem_get_observation tool (with pagination)
│   │   ├── mem-session-start.ts          # mem_session_start tool
│   │   ├── mem-session-summary.ts        # mem_session_summary tool (unified end+summary)
│   │   ├── mem-suggest-topic-key.ts      # mem_suggest_topic_key tool
│   │   ├── mem-capture-passive.ts        # mem_capture_passive tool
│   │   ├── mem-save-prompt.ts            # mem_save_prompt tool
│   │   ├── mem-update.ts                 # mem_update tool
│   │   ├── mem-delete.ts                 # mem_delete tool (admin)
│   │   ├── mem-stats.ts                  # mem_stats tool (admin)
│   │   └── mem-timeline.ts              # mem_timeline tool (admin)
│   └── utils/
│       ├── sanitize.ts                   # FTS5 query sanitization + content normalization
│       ├── privacy.ts                    # <private> tag stripping
│       ├── dedup.ts                      # SHA256 hashing + dedup check
│       ├── content.ts                    # Preview truncation, content validation, Markdown formatting
│       └── topic-key.ts                  # Topic key suggestion with family heuristics
├── tests/
│   ├── config.test.ts
│   ├── store/
│   │   ├── schema.test.ts
│   │   ├── sessions.test.ts
│   │   ├── observations.test.ts
│   │   ├── context.test.ts
│   │   └── admin.test.ts
│   ├── tools/
│   │   ├── mem-save.test.ts
│   │   ├── mem-search.test.ts
│   │   ├── mem-context.test.ts
│   │   ├── mem-get-observation.test.ts
│   │   ├── mem-session-start.test.ts
│   │   ├── mem-session-summary.test.ts
│   │   ├── mem-suggest-topic-key.test.ts
│   │   ├── mem-capture-passive.test.ts
│   │   ├── mem-save-prompt.test.ts
│   │   ├── mem-update.test.ts
│   │   ├── mem-delete.test.ts
│   │   ├── mem-stats.test.ts
│   │   ├── mem-timeline.test.ts
│   │   └── registry.test.ts
│   ├── utils/
│   │   ├── sanitize.test.ts
│   │   ├── privacy.test.ts
│   │   ├── dedup.test.ts
│   │   ├── content.test.ts
│   │   └── topic-key.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .gitignore
```

---

## Phase 1: Project Scaffold + Core Infrastructure

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

**Description:**
Initialize the TypeScript project.

**package.json:**
```json
{
  "name": "thoth",
  "version": "0.1.0",
  "type": "module",
  "description": "Persistent memory MCP server for AI coding agents",
  "main": "dist/index.js",
  "bin": { "thoth": "dist/index.js" },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build && npm test"
  },
  "engines": { "node": ">=18" },
  "keywords": ["mcp", "memory", "ai", "coding-agent", "sqlite", "persistent-memory"],
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "better-sqlite3": "^11.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**vitest.config.ts:** Standard config — test files in `tests/`, ts transform, 10s timeout.

**.gitignore:** `node_modules/`, `dist/`, `*.db`, `.thoth/`, `*.tsbuildinfo`

Also create a minimal placeholder `src/index.ts` with just `// Entry point — implemented in Task 15` so that TypeScript compilation has at least one source file.

**Verification:**
- Run: `npm install`
- Expected: Clean install, no errors
- Run: `npx tsc --noEmit`
- Expected: No TypeScript errors (placeholder compiles clean)

- [x] Task 1

---

### Task 2: Configuration Module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Description:**
Configuration module reading environment variables with sensible defaults.

**Config values:**
| Env Var | Type | Default | Description |
|---------|------|---------|-------------|
| `THOTH_DATA_DIR` | string | `~/.thoth` | Data directory (must resolve to absolute path) |
| `THOTH_MAX_CONTENT_LENGTH` | number | `100_000` | Max observation content chars (warn, don't truncate silently) |
| `THOTH_MAX_CONTEXT_RESULTS` | number | `20` | Max observations in context response |
| `THOTH_MAX_SEARCH_RESULTS` | number | `20` | Max search results |
| `THOTH_DEDUPE_WINDOW_MINUTES` | number | `15` | Dedup rolling window |
| `THOTH_PREVIEW_LENGTH` | number | `300` | Search result preview length |

**Exports:**
```typescript
interface ThothConfig {
  dataDir: string;
  dbPath: string;            // resolved: {dataDir}/thoth.db
  maxContentLength: number;
  maxContextResults: number;
  maxSearchResults: number;
  dedupeWindowMinutes: number;
  previewLength: number;
}

function getConfig(): ThothConfig
function resolveDataDir(config: ThothConfig): void  // mkdir -p if needed
```

**Windows robustness:** `resolveHome()` helper must try `os.homedir()`, then fallback to `USERPROFILE`, `HOME`, `LOCALAPPDATA` environment variables (MCP subprocesses on Windows often lack proper HOME). This matches engram's `resolveHomeFallback()` pattern.

**Verification:**
- Run: `npx vitest run tests/config.test.ts`
- Expected: Default values correct, env var overrides work, Windows home fallback tested

- [x] Task 2

---

### Task 3: TypeScript Types

**Files:**
- Create: `src/store/types.ts`

**Description:**
Define all TypeScript types for database entities and operation inputs/outputs.

**Core types:**
```typescript
// Strict enum — matches CHECK constraint in SQL
type ObservationType = 'decision' | 'architecture' | 'bugfix' | 'pattern'
  | 'config' | 'discovery' | 'learning' | 'session_summary' | 'manual';

type ObservationScope = 'project' | 'personal';

interface Session {
  id: string;
  project: string;
  directory: string | null;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

interface Observation {
  id: number;
  session_id: string;
  type: ObservationType;
  title: string;
  content: string;
  tool_name: string | null;
  project: string | null;
  scope: ObservationScope;
  topic_key: string | null;
  normalized_hash: string | null;
  revision_count: number;
  duplicate_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ObservationVersion {
  id: number;
  observation_id: number;
  title: string;
  content: string;
  type: ObservationType;
  version_number: number;
  created_at: string;
}

interface UserPrompt {
  id: number;
  session_id: string;
  content: string;
  project: string | null;
  created_at: string;
}

interface SearchResult extends Observation {
  rank: number;
  preview: string;
}
```

**Input types:**
```typescript
interface SaveObservationInput {
  title: string;
  content: string;
  type?: ObservationType;
  session_id?: string;
  project?: string;
  scope?: ObservationScope;
  topic_key?: string;
}

interface SearchInput {
  query: string;
  type?: ObservationType;
  project?: string;
  scope?: ObservationScope;
  limit?: number;
}

interface ContextInput {
  project?: string;
  scope?: ObservationScope;
  limit?: number;
}

interface TimelineInput {
  observation_id: number;
  before?: number;
  after?: number;
}

interface UpdateObservationInput {
  id: number;
  title?: string;
  content?: string;
  type?: ObservationType;
  project?: string;
  scope?: ObservationScope;
  topic_key?: string;
}
```

**Result types:**
```typescript
interface SaveResult {
  observation: Observation;
  action: 'created' | 'deduplicated' | 'upserted';
}

interface PaginatedContent {
  content: string;
  total_length: number;
  returned_from: number;
  returned_to: number;
  has_more: boolean;
}

interface StatsResult {
  total_sessions: number;
  total_observations: number;
  total_prompts: number;
  projects: string[];
}

interface CaptureResult {
  extracted: number;
  saved: number;
  duplicates: number;
}
```

Also export the `OBSERVATION_TYPES` array constant for validation reuse:
```typescript
const OBSERVATION_TYPES = ['decision', 'architecture', 'bugfix', 'pattern',
  'config', 'discovery', 'learning', 'session_summary', 'manual'] as const;
```

**Verification:**
- Run: `npx tsc --noEmit`
- Expected: Types compile without errors

- [x] Task 3

---

### Task 4: Database Schema

**Files:**
- Create: `src/store/schema.ts`
- Create: `tests/store/schema.test.ts`

**Description:**
Define the complete SQLite schema as SQL string constants.

**Export `PRAGMAS_SQL`:**
```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
```

**Export `SCHEMA_SQL`** — all tables, indexes, triggers. Uses `CREATE TABLE IF NOT EXISTS` for idempotent setup:

**Table 1: `sessions`**
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  project    TEXT NOT NULL,
  directory  TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at   TEXT,
  summary    TEXT
);
```

**Table 2: `observations`** (with strict type CHECK)
```sql
CREATE TABLE IF NOT EXISTS observations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('decision','architecture','bugfix','pattern','config','discovery','learning','session_summary','manual')),
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,
  tool_name       TEXT,
  project         TEXT,
  scope           TEXT NOT NULL DEFAULT 'project' CHECK(scope IN ('project','personal')),
  topic_key       TEXT,
  normalized_hash TEXT,
  revision_count  INTEGER NOT NULL DEFAULT 1,
  duplicate_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

**Table 3: `observation_versions`** (NEW — stores previous versions on update)
```sql
CREATE TABLE IF NOT EXISTS observation_versions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id   INTEGER NOT NULL,
  title            TEXT NOT NULL,
  content          TEXT NOT NULL,
  type             TEXT NOT NULL,
  version_number   INTEGER NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
);
```

**Table 4: `observations_fts`** (FTS5 virtual table)
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  title, content, tool_name, type, project,
  content='observations',
  content_rowid='id'
);
```

**Table 5: `user_prompts`**
```sql
CREATE TABLE IF NOT EXISTS user_prompts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  content    TEXT NOT NULL,
  project    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Table 6: `prompts_fts`**
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
  content, project,
  content='user_prompts',
  content_rowid='id'
);
```

**Triggers** (FTS5 sync — same pattern as engram):
```sql
-- observations_fts sync
CREATE TRIGGER IF NOT EXISTS obs_fts_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, content, tool_name, type, project)
  VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project);
END;

CREATE TRIGGER IF NOT EXISTS obs_fts_delete AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project)
  VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project);
END;

CREATE TRIGGER IF NOT EXISTS obs_fts_update AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, content, tool_name, type, project)
  VALUES ('delete', old.id, old.title, old.content, old.tool_name, old.type, old.project);
  INSERT INTO observations_fts(rowid, title, content, tool_name, type, project)
  VALUES (new.id, new.title, new.content, new.tool_name, new.type, new.project);
END;

-- prompts_fts sync (same pattern)
CREATE TRIGGER IF NOT EXISTS prompt_fts_insert AFTER INSERT ON user_prompts BEGIN
  INSERT INTO prompts_fts(rowid, content, project)
  VALUES (new.id, new.content, new.project);
END;

CREATE TRIGGER IF NOT EXISTS prompt_fts_delete AFTER DELETE ON user_prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, content, project)
  VALUES ('delete', old.id, old.content, old.project);
END;
```

**Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id);
CREATE INDEX IF NOT EXISTS idx_obs_type ON observations(type);
CREATE INDEX IF NOT EXISTS idx_obs_project ON observations(project);
CREATE INDEX IF NOT EXISTS idx_obs_created ON observations(created_at);
CREATE INDEX IF NOT EXISTS idx_obs_scope ON observations(scope);
CREATE INDEX IF NOT EXISTS idx_obs_topic ON observations(topic_key);
CREATE INDEX IF NOT EXISTS idx_obs_deleted ON observations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_obs_dedupe ON observations(normalized_hash, project, scope, type, title, created_at);
CREATE INDEX IF NOT EXISTS idx_obs_versions_obs ON observation_versions(observation_id);
CREATE INDEX IF NOT EXISTS idx_prompts_session ON user_prompts(session_id);
CREATE INDEX IF NOT EXISTS idx_prompts_project ON user_prompts(project);
```

**Test:** The schema test should open an in-memory SQLite database, execute PRAGMAS_SQL then SCHEMA_SQL, and verify all tables/triggers/indexes exist via `sqlite_master` queries.

**Verification:**
- Run: `npx vitest run tests/store/schema.test.ts`
- Expected: Schema executes without SQL errors, all 6 tables exist, all triggers exist, all indexes exist

- [x] Task 4

---

### Task 5: Store Foundation

**Files:**
- Create: `src/store/index.ts`
- Create: `tests/store/index.test.ts`

**Description:**
Create the `Store` class — the core data access layer wrapping `better-sqlite3`.

**This task covers ONLY the foundation — constructor, init, close, and `ensureSession` helper. Data operations are added in later tasks.**

```typescript
class Store {
  private db: Database;
  private config: ThothConfig;

  constructor(dbPath: string, config?: Partial<ThothConfig>)
  // 1. Open SQLite database at dbPath
  // 2. Execute PRAGMAS_SQL (each pragma separately via db.pragma())
  // 3. Execute SCHEMA_SQL via db.exec()
  // 4. Store config with defaults

  close(): void
  // Closes the database connection

  ensureSession(sessionId: string, project: string, directory?: string): void
  // INSERT OR IGNORE INTO sessions (id, project, directory) VALUES (?, ?, ?)
  // Idempotent — if session exists, does nothing
}
```

The constructor should use `better-sqlite3` synchronous API. No async needed — better-sqlite3 is synchronous by design.

**Verification:**
- Run: `npx vitest run tests/store/index.test.ts`
- Expected: Store opens in-memory DB, creates tables, closes cleanly. Can open same file DB twice (idempotent schema). ensureSession is idempotent.

- [x] Task 5

---

## Phase 2: Utilities + Store Operations

### Task 6: Privacy Stripping Utility

**Files:**
- Create: `src/utils/privacy.ts`
- Create: `tests/utils/privacy.test.ts`

**Description:**
Implement `stripPrivateTags(text: string): string` — removes `<private>...</private>` tags and their content.

**Requirements:**
- Handle multi-line content between tags
- Handle multiple occurrences in the same text
- Case-insensitive matching (`<PRIVATE>`, `<Private>`, etc.)
- Handle unclosed tags gracefully (leave as-is)
- Use regex: `/<private>[\s\S]*?<\/private>/gi`
- Trim resulting whitespace artifacts (collapse multiple newlines to max 2)

**Verification:**
- Run: `npx vitest run tests/utils/privacy.test.ts`
- Expected: Strips tags correctly, handles edge cases (empty content, nested tags, no tags, unclosed tags)

- [x] Task 6

---

### Task 7: FTS5 Query Sanitization

**Files:**
- Create: `src/utils/sanitize.ts`
- Create: `tests/utils/sanitize.test.ts`

**Description:**
Two exports:

**1. `sanitizeFTS(query: string): string`** — Makes user input safe for SQLite FTS5 MATCH.
- Split on whitespace
- Remove empty tokens
- Escape internal double quotes (replace `"` with `""`)
- Wrap each token in double quotes
- Join with spaces
- Example: `fix auth bug` → `"fix" "auth" "bug"`
- Example: `user's "email"` → `"user's" """email"""`

**2. `normalizeForHash(content: string): string`** — Normalize content before SHA256 hashing for dedup.
- Trim leading/trailing whitespace
- Collapse multiple whitespace chars (spaces, tabs, newlines) to single space
- Lowercase
- This catches near-duplicates that differ only in formatting

**Verification:**
- Run: `npx vitest run tests/utils/sanitize.test.ts`
- Expected: FTS5 operators are safely quoted, empty query returns empty string, unicode preserved, normalization is deterministic

- [x] Task 7

---

### Task 8: Deduplication Utility

**Files:**
- Create: `src/utils/dedup.ts`
- Create: `tests/utils/dedup.test.ts`

**Description:**
**1. `computeHash(content: string): string`**
- Normalize content via `normalizeForHash()`
- SHA256 hash using Node.js `crypto.createHash('sha256')`
- Return hex digest

**2. `checkDuplicate(db: Database, hash: string, project: string | null, scope: string, type: string, title: string, windowMinutes: number): { isDuplicate: boolean; existingId?: number }`**
- Query: `SELECT id FROM observations WHERE normalized_hash = ? AND project IS ? AND scope = ? AND type = ? AND title = ? AND deleted_at IS NULL AND created_at > datetime('now', '-{windowMinutes} minutes') ORDER BY created_at DESC LIMIT 1`
- If found: return `{ isDuplicate: true, existingId: row.id }`
- If not found: return `{ isDuplicate: false }`

**3. `incrementDuplicate(db: Database, observationId: number): void`**
- `UPDATE observations SET duplicate_count = duplicate_count + 1, last_seen_at = datetime('now') WHERE id = ?`

**Verification:**
- Run: `npx vitest run tests/utils/dedup.test.ts`
- Expected: Same content produces same hash, formatting-only differences produce same hash, different content produces different hash, dedup check within window works, outside window allows new insert

- [x] Task 8

---

### Task 9: Content Utilities

**Files:**
- Create: `src/utils/content.ts`
- Create: `tests/utils/content.test.ts`

**Description:**
**1. `truncateForPreview(content: string, maxLength: number = 300): string`**
- If content ≤ maxLength, return as-is
- Truncate at last word boundary before maxLength
- Append `...`

**2. `validateContentLength(content: string, maxLength: number): { valid: boolean; length: number; warning?: string }`**
- If content.length ≤ maxLength: `{ valid: true, length: content.length }`
- If exceeded: `{ valid: true, length: content.length, warning: "Content is {length} characters (max recommended: {maxLength}). Consider breaking into smaller observations." }`
- Note: we do NOT truncate — we warn. This is an improvement over engram which silently truncated at 50k.

**3. `formatObservationMarkdown(obs: Observation): string`**
- Format as Markdown:
```
### [{type}] {title} (ID: {id})
**Project:** {project} | **Scope:** {scope} | **Created:** {created_at}
{topic_key ? "**Topic:** {topic_key} | " : ""}**Revisions:** {revision_count} | **Duplicates:** {duplicate_count}

{content}
```

**4. `formatSearchResultMarkdown(results: SearchResult[]): string`**
- Format multiple results with previews, include instruction to call `mem_get_observation` for full content.

**Verification:**
- Run: `npx vitest run tests/utils/content.test.ts`
- Expected: Preview truncates at word boundary, content validation warns but doesn't truncate, Markdown formatting correct

- [x] Task 9

---

### Task 10: Topic Key Utility

**Files:**
- Create: `src/utils/topic-key.ts`
- Create: `tests/utils/topic-key.test.ts`

**Description:**
`suggestTopicKey(title: string, type?: string, content?: string): string`

**Algorithm:**
1. Determine input: use title if non-empty, else first line of content (up to 100 chars)
2. Apply family prefix based on type:
   - `architecture` → `architecture/`
   - `bugfix` → `bug/`
   - `decision` → `decision/`
   - `pattern` → `pattern/`
   - `config` → `config/`
   - `discovery` → `discovery/`
   - `learning` → `learning/`
   - `session_summary` → `session/`
   - `manual` or undefined → no prefix
3. Normalize slug: lowercase, replace `[^a-z0-9]+` with hyphens, collapse multiple hyphens, trim hyphens from edges
4. Cap total key at 100 chars

**Examples:**
- `suggestTopicKey("JWT auth middleware", "architecture")` → `"architecture/jwt-auth-middleware"`
- `suggestTopicKey("Fixed N+1 in user list", "bugfix")` → `"bug/fixed-n-1-in-user-list"`
- `suggestTopicKey("", undefined, "Some content here\nMore lines")` → `"some-content-here"`

**Verification:**
- Run: `npx vitest run tests/utils/topic-key.test.ts`
- Expected: Family prefixes correct, normalization handles special chars/unicode, empty title falls back to content, cap at 100 chars

- [x] Task 10

---

### Task 11: Store — Session Operations

**Files:**
- Modify: `src/store/index.ts` (add session methods)
- Create: `tests/store/sessions.test.ts`

**Description:**
Add session management methods to the Store class:

```typescript
startSession(id: string, project: string, directory?: string): Session
// INSERT OR IGNORE INTO sessions (id, project, directory) VALUES (?, ?, ?)
// Return the session (SELECT after insert)

endSession(id: string, summary?: string): Session | null
// UPDATE sessions SET ended_at = datetime('now'), summary = ? WHERE id = ? AND ended_at IS NULL
// Return updated session or null if not found / already ended

getSession(id: string): Session | null
// SELECT * FROM sessions WHERE id = ?

recentSessions(limit: number = 5): Session[]
// Sessions that have at least one observation, ordered by started_at DESC
// JOIN with observations to filter out empty sessions
// LIMIT param

allSessions(): Session[]
// All sessions, ordered by started_at DESC
```

**Verification:**
- Run: `npx vitest run tests/store/sessions.test.ts`
- Expected: Start is idempotent, end sets timestamp, recentSessions excludes empty sessions, getSession returns null for unknown ID

- [x] Task 11

---

### Task 12: Store — Observation CRUD

**Files:**
- Modify: `src/store/index.ts` (add observation methods)
- Create: `tests/store/observations.test.ts`

**Description:**
Add observation CRUD to the Store class. This is the most critical task — handles save with dedup, topic_key upsert, versioning, and search.

```typescript
saveObservation(input: SaveObservationInput): SaveResult
// Full pipeline:
// 1. Strip private tags from title AND content (stripPrivateTags)
// 2. Validate content length (warn, don't truncate)
// 3. Ensure session exists (ensureSession with session_id, defaulting to "manual-save-{project || 'unknown'}")
// 4. Compute normalized hash (computeHash on content)
// 5. Check dedup (checkDuplicate with configured window)
//    → If duplicate: incrementDuplicate(), return { observation: existing, action: 'deduplicated' }
// 6. If topic_key provided:
//    → Find latest matching: SELECT * FROM observations WHERE topic_key = ? AND project IS ? AND scope = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1
//    → If found:
//       a. Save current version to observation_versions (version_number = revision_count)
//       b. UPDATE observations SET title=?, content=?, type=?, revision_count=revision_count+1, normalized_hash=?, updated_at=datetime('now') WHERE id=?
//       c. Return { observation: updated, action: 'upserted' }
// 7. INSERT new observation with all fields
// 8. Return { observation: new, action: 'created' }

getObservation(id: number): Observation | null
// SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL

searchObservations(input: SearchInput): SearchResult[]
// 1. Sanitize query via sanitizeFTS()
// 2. If sanitized query is empty, return []
// 3. Query: SELECT o.*, rank FROM observations o
//    JOIN observations_fts fts ON o.id = fts.rowid
//    WHERE observations_fts MATCH ?
//    AND o.deleted_at IS NULL
//    [AND o.type = ?]        -- if type filter
//    [AND o.project = ?]     -- if project filter
//    [AND o.scope = ?]       -- if scope filter
//    ORDER BY rank
//    LIMIT ?
// 4. Add preview (truncateForPreview) to each result
// 5. Return results

getObservationVersions(observationId: number): ObservationVersion[]
// SELECT * FROM observation_versions WHERE observation_id = ? ORDER BY version_number DESC
```

**Verification:**
- Run: `npx vitest run tests/store/observations.test.ts`
- Expected: Save creates observation, FTS5 search finds it, dedup within window returns existing, topic_key upsert saves version and updates in-place, private tags stripped, content warning emitted for large content, getObservation returns null for deleted

- [x] Task 12

---

### Task 13: Store — Context, Timeline, Prompts

**Files:**
- Modify: `src/store/index.ts` (add context, timeline, prompt methods)
- Create: `tests/store/context.test.ts`

**Description:**
Add context retrieval, timeline, and prompt methods:

```typescript
getContext(input: ContextInput): string
// Returns formatted Markdown combining:
// 1. "## Recent Sessions" — last 5 sessions with activity (recentSessions)
// 2. "## Recent Prompts" — last 10 prompts (recentPrompts, filtered by project if provided)
// 3. "## Recent Observations" — last N observations (default 20, configurable)
//    SELECT * FROM observations WHERE deleted_at IS NULL
//    [AND project = ?] [AND scope = ?]
//    ORDER BY created_at DESC LIMIT ?
//    Format each with formatObservationMarkdown
// 4. "## Stats" — total sessions, observations, projects
// Filter by project and scope if provided in input

getTimeline(input: TimelineInput): { before: Observation[]; focus: Observation | null; after: Observation[] }
// 1. Get focus observation: SELECT * FROM observations WHERE id = ?
// 2. Get `before` in same session:
//    SELECT * FROM observations WHERE session_id = ? AND id < ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?
//    Then reverse to chronological order
// 3. Get `after` in same session:
//    SELECT * FROM observations WHERE session_id = ? AND id > ? AND deleted_at IS NULL ORDER BY id ASC LIMIT ?

savePrompt(sessionId: string, content: string, project?: string): UserPrompt
// Ensure session exists, INSERT into user_prompts

recentPrompts(limit: number = 10, project?: string): UserPrompt[]
// SELECT * FROM user_prompts [WHERE project = ?] ORDER BY created_at DESC LIMIT ?
```

**Verification:**
- Run: `npx vitest run tests/store/context.test.ts`
- Expected: Context returns all sections as Markdown, timeline returns correct neighborhood, prompts save and retrieve, project filtering works

- [x] Task 13

---

### Task 14: Store — Stats, Delete, Update

**Files:**
- Modify: `src/store/index.ts` (add stats, delete, update methods)
- Create: `tests/store/admin.test.ts`

**Description:**
```typescript
getStats(): StatsResult
// SELECT COUNT(*) FROM sessions
// SELECT COUNT(*) FROM observations WHERE deleted_at IS NULL
// SELECT COUNT(*) FROM user_prompts
// SELECT DISTINCT project FROM observations WHERE project IS NOT NULL AND deleted_at IS NULL

deleteObservation(id: number, hardDelete: boolean = false): boolean
// Soft delete: UPDATE observations SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL
// Hard delete: DELETE FROM observations WHERE id = ?
// Note: FTS5 triggers handle index sync automatically
// Return true if a row was affected

updateObservation(input: UpdateObservationInput): Observation | null
// 1. Get current observation (return null if not found or deleted)
// 2. Save current state to observation_versions:
//    INSERT INTO observation_versions (observation_id, title, content, type, version_number)
//    VALUES (?, current.title, current.content, current.type, current.revision_count)
// 3. Build SET clause from provided fields only
// 4. Always SET: revision_count = revision_count + 1, updated_at = datetime('now')
// 5. If content changed: recompute normalized_hash
// 6. UPDATE observations SET ... WHERE id = ?
// 7. Return updated observation
```

**Verification:**
- Run: `npx vitest run tests/store/admin.test.ts`
- Expected: Soft delete hides from search but exists in DB, hard delete removes permanently, stats accurate, update creates version and increments revision_count, update with only title doesn't affect content hash

- [x] Task 14

---

## Phase 3: MCP Server + Core Agent Tools

### Task 15: MCP Server Setup

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`

**Description:**
**`src/server.ts`** — Server factory:
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface ServerOptions {
  profiles: string[];   // ['agent'], ['admin'], ['agent','admin']
  dataDir?: string;     // override THOTH_DATA_DIR
}

function createServer(options: ServerOptions): { server: McpServer; store: Store }
// 1. Resolve config (merge options.dataDir into env-based config)
// 2. Ensure data directory exists
// 3. Open Store at config.dbPath
// 4. Create McpServer with name="thoth", version from package.json
// 5. Register tools from registry, filtered by options.profiles
// 6. Return { server, store }
```

**`src/index.ts`** — Entry point with shebang:
```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// 1. Parse process.argv:
//    --tools=agent,admin (default: all)
//    --data-dir=/path    (override THOTH_DATA_DIR)
// 2. Create server via createServer()
// 3. Create StdioServerTransport
// 4. Connect: await server.connect(transport)
// 5. Handle SIGINT/SIGTERM: close store, exit
// 6. Log to stderr: "Thoth MCP server started (tools: {profiles})"
```

**Important:** ALL logging must go to `stderr` — stdout is the MCP transport channel.

**Verification:**
- Run: `npm run build`
- Expected: Compiles without errors, dist/index.js has shebang
- Run: `echo "" | node dist/index.js 2>&1` (pipes empty stdin so the process doesn't hang)
- Expected: Exits with a transport/parse error (not an unhandled crash). Confirms the server attempts to start.

- [x] Task 15

---

### Task 16: Tool Registry

**Files:**
- Create: `src/tools/index.ts`

**Description:**
Tool registry that maps tools to their definitions and filters by profile.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Store } from "../store/index.js";

type ToolProfile = 'agent' | 'admin';

interface ToolRegistration {
  name: string;
  profile: ToolProfile;
  register: (server: McpServer, store: Store) => void;
  // Each tool's register function calls server.registerTool() with full definition
}

const ALL_TOOLS: ToolRegistration[] = [
  // Agent profile (10 tools)
  { name: 'mem_save', profile: 'agent', register: registerMemSave },
  { name: 'mem_search', profile: 'agent', register: registerMemSearch },
  { name: 'mem_context', profile: 'agent', register: registerMemContext },
  { name: 'mem_get_observation', profile: 'agent', register: registerMemGetObservation },
  { name: 'mem_session_start', profile: 'agent', register: registerMemSessionStart },
  { name: 'mem_session_summary', profile: 'agent', register: registerMemSessionSummary },
  { name: 'mem_suggest_topic_key', profile: 'agent', register: registerMemSuggestTopicKey },
  { name: 'mem_capture_passive', profile: 'agent', register: registerMemCapturePassive },
  { name: 'mem_save_prompt', profile: 'agent', register: registerMemSavePrompt },
  { name: 'mem_update', profile: 'agent', register: registerMemUpdate },
  // Admin profile (3 tools)
  { name: 'mem_delete', profile: 'admin', register: registerMemDelete },
  { name: 'mem_stats', profile: 'admin', register: registerMemStats },
  { name: 'mem_timeline', profile: 'admin', register: registerMemTimeline },
];

function registerTools(server: McpServer, store: Store, profiles: string[]): void
// Filter ALL_TOOLS by profiles, call each register function
```

Each tool file (Tasks 17-29) exports a `register*` function that calls `server.registerTool()` following the MCP SDK v1 pattern with `title`, `description`, `inputSchema` (Zod `.strict()`), `annotations`, and `execute` handler.

**Important:** Since the individual tool files don't exist yet at this point, create **stub files** for each tool module (e.g. `src/tools/mem-save.ts`, `src/tools/mem-search.ts`, etc.) that export a no-op `register*` function with the correct signature. This ensures the registry compiles and tests pass. Each stub will be replaced with the full implementation in Tasks 17-29.

**Verification:**
- Run: `npx tsc --noEmit`
- Expected: Compiles with stub tool modules

- [x] Task 16

---

### Task 17: mem_save Tool

**Files:**
- Create: `src/tools/mem-save.ts`
- Create: `tests/tools/mem-save.test.ts`

**Description:**
Register the `mem_save` tool via `server.registerTool()`.

**Registration:**
```typescript
server.registerTool("mem_save", {
  title: "Save Memory Observation",
  description: `Save an important observation to persistent memory. Call this PROACTIVELY after:
- Architectural decisions or tradeoffs
- Bug fixes (what was wrong, why, how fixed)
- New patterns or conventions established
- Configuration changes or environment setup
- Important discoveries or gotchas

FORMAT for content — use structured format:
  **What**: [concise description]
  **Why**: [reasoning or problem that drove it]
  **Where**: [files/paths affected]
  **Learned**: [gotchas, edge cases — omit if none]

TITLE: Short and searchable (e.g. "JWT auth middleware", "Fixed N+1 in user list")

TYPE options: decision, architecture, bugfix, pattern, config, discovery, learning, manual

TOPIC_KEY: Use for evolving topics that should update in-place (e.g. "architecture/auth-model").
Call mem_suggest_topic_key first if unsure.

Returns: Observation ID and action taken (created/deduplicated/upserted).`,
  inputSchema: {
    title: z.string().describe("Short, searchable title"),
    content: z.string().describe("Structured content with What/Why/Where/Learned format"),
    type: z.enum(OBSERVATION_TYPES).optional().describe("Category: decision, architecture, bugfix, pattern, config, discovery, learning, manual"),
    session_id: z.string().optional().describe("Session ID (default: manual-save-{project})"),
    project: z.string().optional().describe("Project name"),
    scope: z.enum(['project', 'personal']).optional().describe("Scope: project (default) or personal"),
    topic_key: z.string().optional().describe("Stable key for upserts (e.g. architecture/auth-model)")
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  },
  execute: async ({ title, content, type, session_id, project, scope, topic_key }) => {
    // 1. Call store.saveObservation({ title, content, type, session_id, project, scope, topic_key })
    // 2. Return success with observation ID and action
    // 3. Include content length warning if applicable
    // 4. On error: return { isError: true, content: [{ type: "text", text: error.message }] }
  }
});
```

**Verification:**
- Run: `npx vitest run tests/tools/mem-save.test.ts`
- Expected: Tool handler saves observation, returns ID and action, handles validation errors

- [x] Task 17

---

### Task 18: mem_search Tool

**Files:**
- Create: `src/tools/mem-search.ts`
- Create: `tests/tools/mem-search.test.ts`

**Description:**
Register the `mem_search` tool.

**Key details:**
- Input: `query` (required), `type`, `project`, `scope`, `limit` (default 10, max 20)
- Annotations: `readOnlyHint: true`, `idempotentHint: true`
- Handler calls `store.searchObservations()`
- Format results via `formatSearchResultMarkdown()`
- If no results: return "No observations found matching '{query}'. Try different keywords or broader search terms."
- If results found: format as Markdown list with previews, ending with: "Use `mem_get_observation` with an ID for full content."

**Verification:**
- Run: `npx vitest run tests/tools/mem-search.test.ts`
- Expected: Returns formatted results, respects filters, handles empty results, FTS5 special chars don't crash

- [x] Task 18

---

### Task 19: mem_context Tool

**Files:**
- Create: `src/tools/mem-context.ts`
- Create: `tests/tools/mem-context.test.ts`

**Description:**
Register the `mem_context` tool.

**Key details:**
- Input: `project` (optional), `scope` (optional), `limit` (optional, default 20)
- Annotations: `readOnlyHint: true`, `idempotentHint: true`
- Handler calls `store.getContext()`
- Returns the formatted Markdown string directly

**Verification:**
- Run: `npx vitest run tests/tools/mem-context.test.ts`
- Expected: Returns Markdown with sessions, prompts, observations, stats sections

- [x] Task 19

---

### Task 20: mem_get_observation Tool (with Pagination)

**Files:**
- Create: `src/tools/mem-get-observation.ts`
- Create: `tests/tools/mem-get-observation.test.ts`

**Description:**
Register the `mem_get_observation` tool with **paginated retrieval** for large content (improvement over engram).

**Input schema:**
- `id`: z.number() (required)
- `offset`: z.number().min(0).optional() — character offset for large content (default 0)
- `max_length`: z.number().min(100).optional() — max chars to return (default 50000)

**Annotations:** `readOnlyHint: true`, `idempotentHint: true`

**Handler logic:**
1. Get observation via `store.getObservation(id)`
2. If not found: error response "Observation with ID {id} not found"
3. If `content.length <= max_length` AND `offset === 0`: return full observation formatted as Markdown
4. If content needs pagination:
   - Slice: `content.substring(offset, offset + max_length)`
   - Include metadata in response:
     ```
     **Content pagination:** Showing characters {offset}-{offset+slice.length} of {total_length}
     {has_more ? "Call mem_get_observation with offset={next_offset} to get more." : ""}
     ```
5. Always include: type, title, project, scope, topic_key, revision_count, duplicate_count, created_at, updated_at

**Verification:**
- Run: `npx vitest run tests/tools/mem-get-observation.test.ts`
- Expected: Small content returned in full, large content paginated with correct metadata, offset parameter works, not-found returns error

- [x] Task 20

---

### Task 21: mem_session_start Tool

**Files:**
- Create: `src/tools/mem-session-start.ts`
- Create: `tests/tools/mem-session-start.test.ts`

**Description:**
Register the `mem_session_start` tool.

**Key details:**
- Input: `id` (required), `project` (required), `directory` (optional)
- Annotations: `readOnlyHint: false`, `idempotentHint: true`
- Handler calls `store.startSession()`
- Returns: "Session '{id}' started for project '{project}'"

**Verification:**
- Run: `npx vitest run tests/tools/mem-session-start.test.ts`
- Expected: Creates session, idempotent on repeat, returns confirmation

- [x] Task 21

---

### Task 22: mem_session_summary Tool (Unified)

**Files:**
- Create: `src/tools/mem-session-summary.ts`
- Create: `tests/tools/mem-session-summary.test.ts`

**Description:**
**This tool unifies engram's separate `mem_session_end` + `mem_session_summary` into one call.** This is a key improvement — agents make one tool call instead of two.

**Input schema:**
- `content`: z.string() (required) — structured summary
- `project`: z.string() (required)
- `session_id`: z.string().optional() (default: `manual-save-{project}`)

**Description text should include the expected format:**
```
## Goal
[One sentence]

## Instructions
[User preferences/constraints — skip if none]

## Discoveries
- [Technical findings, gotchas]

## Accomplished
- ✅ [Completed items]
- 🔲 [Identified but not done]

## Relevant Files
- path/to/file — [what changed]
```

**Handler:**
1. Save summary as observation: `store.saveObservation({ title: "Session summary: {project}", content, type: 'session_summary', session_id, project, scope: 'project' })`
2. Close session: `store.endSession(session_id, extractFirstLine(content))` — extract the first non-empty, non-header line as the brief summary
3. Return confirmation with observation ID

**Verification:**
- Run: `npx vitest run tests/tools/mem-session-summary.test.ts`
- Expected: Saves observation AND closes session in one call, default session_id works, summary extracted correctly

- [x] Task 22

---

## Phase 4: Extended Agent Tools

### Task 23: mem_suggest_topic_key Tool

**Files:**
- Create: `src/tools/mem-suggest-topic-key.ts`
- Create: `tests/tools/mem-suggest-topic-key.test.ts`

**Description:**
- Input: `title` (optional), `type` (optional), `content` (optional fallback)
- Annotations: `readOnlyHint: true`, `idempotentHint: true`
- Handler calls `suggestTopicKey()` utility
- Returns: "Suggested topic key: `{key}`\n\nUse this in `mem_save` with `topic_key` parameter to enable upsert behavior."

**Verification:**
- Run: `npx vitest run tests/tools/mem-suggest-topic-key.test.ts`
- Expected: Returns valid key, handles empty inputs

- [x] Task 23

---

### Task 24: mem_capture_passive Tool

**Files:**
- Create: `src/tools/mem-capture-passive.ts`
- Create: `tests/tools/mem-capture-passive.test.ts`

**Description:**
- Input: `content` (required), `session_id` (optional), `project` (optional), `source` (optional)
- Annotations: `readOnlyHint: false`, `idempotentHint: true` (dedup prevents re-saving)

**Handler:**
1. Search for header: `## Key Learnings:` or `## Aprendizajes Clave:` (case-insensitive)
2. If header not found: return error "No '## Key Learnings:' section found in content"
3. Extract lines after header until next `##` header or end of content
4. Parse numbered items (`1. ...`, `2. ...`) and bulleted items (`- ...`, `* ...`)
5. For each extracted item:
   - Call `store.saveObservation({ title: first30Chars, content: item, type: 'learning', session_id, project, scope: 'project' })`
   - Track: extracted, saved (action === 'created'), duplicates (action === 'deduplicated')
6. Return: "Extracted {extracted} learnings: {saved} saved, {duplicates} duplicates skipped"

**Verification:**
- Run: `npx vitest run tests/tools/mem-capture-passive.test.ts`
- Expected: Parses English and Spanish headers, numbered and bulleted lists, dedup works on re-call, no-header returns error

- [x] Task 24

---

### Task 25: mem_save_prompt Tool

**Files:**
- Create: `src/tools/mem-save-prompt.ts`
- Create: `tests/tools/mem-save-prompt.test.ts`

**Description:**
- Input: `content` (required), `session_id` (optional), `project` (optional)
- Annotations: `readOnlyHint: false`, `idempotentHint: false`
- Handler calls `store.savePrompt()`
- Returns: "Prompt saved (ID: {id})"

**Verification:**
- Run: `npx vitest run tests/tools/mem-save-prompt.test.ts`
- Expected: Saves prompt, returns ID

- [x] Task 25

---

### Task 26: mem_update Tool

**Files:**
- Create: `src/tools/mem-update.ts`
- Create: `tests/tools/mem-update.test.ts`

**Description:**
- Input: `id` (required), `title`, `content`, `type`, `project`, `scope`, `topic_key` (all optional, at least one required besides id)
- Annotations: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`

**Handler:**
1. Validate at least one update field is provided
2. Call `store.updateObservation(input)`
3. If null returned: error "Observation with ID {id} not found"
4. Return: "Observation {id} updated (revision {revision_count}). Previous version saved to history."

**Verification:**
- Run: `npx vitest run tests/tools/mem-update.test.ts`
- Expected: Partial update works, version created, error on missing observation, error on no update fields

- [x] Task 26

---

## Phase 5: Admin Tools + Profile Wiring

### Task 27: mem_delete Tool

**Files:**
- Create: `src/tools/mem-delete.ts`
- Create: `tests/tools/mem-delete.test.ts`

**Description:**
- Input: `id` (required), `hard_delete` (optional boolean, default false)
- Annotations: `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`
- Handler calls `store.deleteObservation()`
- Returns: "Observation {id} {soft deleted / permanently deleted}" or error if not found

**Verification:**
- Run: `npx vitest run tests/tools/mem-delete.test.ts`
- Expected: Soft delete hides from search, hard delete removes, not-found returns error

- [x] Task 27

---

### Task 28: mem_stats Tool

**Files:**
- Create: `src/tools/mem-stats.ts`
- Create: `tests/tools/mem-stats.test.ts`

**Description:**
- Input: none (empty schema)
- Annotations: `readOnlyHint: true`, `idempotentHint: true`
- Handler calls `store.getStats()`
- Returns formatted stats:
  ```
  ## Thoth Memory Statistics
  - **Sessions:** {total_sessions}
  - **Observations:** {total_observations}
  - **User Prompts:** {total_prompts}
  - **Projects:** {projects.join(', ') || 'none'}
  ```

**Verification:**
- Run: `npx vitest run tests/tools/mem-stats.test.ts`
- Expected: Accurate counts, formatted correctly

- [x] Task 28

---

### Task 29: mem_timeline Tool

**Files:**
- Create: `src/tools/mem-timeline.ts`
- Create: `tests/tools/mem-timeline.test.ts`

**Description:**
- Input: `observation_id` (required), `before` (optional, default 5), `after` (optional, default 5)
- Annotations: `readOnlyHint: true`, `idempotentHint: true`
- Handler calls `store.getTimeline()`
- Format output as Markdown timeline:
  ```
  ## Timeline around observation {id}

  ### Before
  {before observations formatted}

  ### ► Focus: [{type}] {title} (ID: {id})
  {focus content}

  ### After
  {after observations formatted}
  ```

**Verification:**
- Run: `npx vitest run tests/tools/mem-timeline.test.ts`
- Expected: Correct chronological neighborhood, handles edge cases (first/last observation in session)

- [x] Task 29

---

### Task 30: Tool Profile Filtering + Server Wiring

**Files:**
- Modify: `src/tools/index.ts` (finalize profile filtering)
- Modify: `src/server.ts` (wire --tools to registry)
- Create: `tests/tools/registry.test.ts`

**Description:**
Ensure the complete tool pipeline works:

1. `src/tools/index.ts` — Verify `registerTools()` correctly filters:
   - `['agent']` → 10 tools
   - `['admin']` → 3 tools
   - `['agent', 'admin']` → 13 tools

2. `src/server.ts` — Verify `createServer()` passes profiles to `registerTools()` and the MCP server advertises only the registered tools in its `tools/list` response.

3. `src/index.ts` — Verify CLI arg parsing: `--tools=agent` parses to `['agent']`, `--tools=agent,admin` parses to `['agent', 'admin']`, no flag defaults to `['agent', 'admin']`.

**Verification:**
- Run: `npx vitest run tests/tools/registry.test.ts`
- Expected: Correct tool counts per profile, no tools leak across profiles
- Run: `npm run build`
- Expected: Full build succeeds

- [x] Task 30

---

## Phase 6: Integration Testing

### Task 31: End-to-End Integration Test

**Files:**
- Create: `tests/integration.test.ts`

**Description:**
Comprehensive integration test exercising the full flow through the Store (not through MCP transport — that's too complex for unit tests).

**Test scenarios:**

1. **Full session lifecycle:**
   - Start session → save 3 observations → search → get observation → session summary (closes session)
   - Verify session is ended, summary observation exists, search finds all 3 observations

2. **Dedup:**
   - Save same observation twice within window → verify duplicate_count=2, only 1 row
   - Save same observation after window expires → verify 2 rows

3. **Topic key upsert with versioning:**
   - Save observation with topic_key
   - Update via save with same topic_key → verify version saved, revision_count=2
   - Call getObservationVersions → verify version 1 exists with original content

4. **Privacy:**
   - Save observation with `<private>secret</private>` in content
   - Get observation → verify tag stripped

5. **Type taxonomy:**
   - Save with valid type → succeeds
   - Save with invalid type directly to DB → SQL CHECK constraint rejects

6. **Paginated retrieval:**
   - Save observation with 60k chars content
   - Get with default max_length → returns first 50k with `has_more: true`
   - Get with offset → returns next chunk

7. **Context:**
   - Populate DB with multiple sessions and observations
   - Get context → verify all sections present

8. **Stats:**
   - Verify counts after all operations above

**Verification:**
- Run: `npx vitest run tests/integration.test.ts`
- Expected: All 8 scenarios pass

- [x] Task 31

---

## Phase 7: NPM Publishing Preparation

### Task 32: NPM Package Finalization

**Files:**
- Modify: `package.json` (finalize metadata)
- Create: `README.md` (usage docs, MCP config examples, tool reference)
- Verify: `dist/index.js` has shebang after build
- Verify: `npm pack --dry-run` output is clean

**Description:**
Final checks before the package is publishable:

1. **package.json metadata:**
   - `name`: verify `thoth` is available on npm. If taken, use `@thoth-memory/mcp` or `thoth-mcp`
   - `repository`: set to GitHub URL
   - `homepage`: set
   - `bugs`: set
   - Verify `files` only includes `dist/` and `README.md`
   - Verify `bin.thoth` points to `dist/index.js`

2. **Build verification:**
   - `npm run build` succeeds
   - `dist/index.js` starts with `#!/usr/bin/env node`
   - `npm test` passes (all tests green)

3. **Dry run:**
   - `npm pack --dry-run` shows only expected files
   - Package size is reasonable (<1MB excluding better-sqlite3 prebuild)

4. **README.md** — Create with: project description, installation (`npm install -g thoth` or `npx thoth`), MCP configuration examples for OpenCode/Claude Code/Gemini CLI, tool reference table (name, profile, description), environment variables table, and improvement highlights over engram.

5. **MCP config example** (include in README):
   ```json
   {
     "mcp": {
       "thoth": {
         "type": "stdio",
         "command": "npx",
         "args": ["-y", "thoth"]
       }
     }
   }
   ```

**Verification:**
- Run: `npm run build && npm test && npm pack --dry-run`
- Expected: Build clean, all tests pass, pack shows only dist/ and README.md
- Run: `node dist/index.js --help` (or just start — should show usage or start MCP)
- Expected: No crash

- [x] Task 32

---

## Summary

| Phase | Tasks | What's Functional After |
|-------|-------|------------------------|
| **1: Scaffold** | 1-5 | Project compiles, config loads, DB opens |
| **2: Utilities + Store** | 6-14 | Full data layer — CRUD, FTS5 search, dedup, versioning |
| **3: MCP Core** | 15-22 | Functional MCP server with 6 essential tools |
| **4: Extended Tools** | 23-26 | All 10 agent tools working |
| **5: Admin + Profiles** | 27-30 | All 13 tools, profile filtering |
| **6: Integration** | 31 | E2E test suite validates everything together |
| **7: NPM Publish** | 32 | Package ready for `npm publish` |

**Parallelizable tasks:** Within Phase 2, Tasks 6-10 (utilities) are independent of each other. Within Phase 4, Tasks 23-26 are independent. Within Phase 5, Tasks 27-29 are independent.

**Key improvements over engram:**
1. ✅ Strict type taxonomy (SQL CHECK constraint)
2. ✅ Observation versioning (full history in `observation_versions` table)
3. ✅ Unified `mem_session_summary` (closes session + saves summary in one call)
4. ✅ Paginated large-content retrieval (offset + max_length on `mem_get_observation`)
5. ✅ Normalized dedup (whitespace/formatting-insensitive hash comparison)
6. ✅ No silent truncation (warn instead of truncate at 50k)
7. ✅ Published on NPM (not a compiled binary — `npx thoth` just works)
