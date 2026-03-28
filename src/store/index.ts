import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { PRAGMAS, SCHEMA_SQL } from './schema.js';
import { runMigrations } from './migrations.js';
import { ThothConfig } from '../config.js';
import type {
  ContextInput,
  ExportData,
  ImportResult,
  MigrateProjectResult,
  Observation,
  ObservationVersion,
  SaveObservationInput,
  SaveResult,
  SearchInput,
  SearchResult,
  Session,
  SyncChunkV2,
  SyncChunkRecord,
  SyncChunkStatus,
  SyncEntityType,
  SyncMutation,
  SyncOperation,
  StatsResult,
  TimelineInput,
  TimelineResult,
  UpdateObservationInput,
  UserPrompt,
} from './types.js';
import { stripPrivateTags } from '../utils/privacy.js';
import { sanitizeFTS } from '../utils/sanitize.js';
import { checkDuplicate, computeHash, incrementDuplicate } from '../utils/dedup.js';
import { formatObservationMarkdown, formatSearchResults, truncateForPreview, validateContentLength } from '../utils/content.js';

type ObservationRow = Observation;

type SearchRow = ObservationRow & { rank: number };

const DEFAULT_CONFIG: ThothConfig = {
  dataDir: '',
  dbPath: ':memory:',
  maxContentLength: 100_000,
  maxContextResults: 20,
  maxSearchResults: 20,
  dedupeWindowMinutes: 15,
  previewLength: 300,
  httpPort: 7438,
  httpDisabled: false,
};

export class Store {
  private db: Database.Database;
  public readonly config: ThothConfig;

  constructor(dbPath: string, config?: Partial<ThothConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config, dbPath };
    this.db = new Database(dbPath);

    for (const pragma of PRAGMAS) {
      this.db.exec(pragma);
    }

    this.db.exec(SCHEMA_SQL);
    runMigrations(this.db);
  }

  private mapObservationRow(row: ObservationRow | undefined): Observation | null {
    if (!row) {
      return null;
    }

    return row;
  }

  private mapObservationRows(rows: ObservationRow[]): Observation[] {
    return rows
      .map((row) => this.mapObservationRow(row))
      .filter((row): row is Observation => row !== null);
  }

  private recordMutation(operation: SyncOperation, entityType: SyncEntityType, entityId: number, syncId: string | null): void {
    try {
      this.db.prepare(
        'INSERT INTO sync_mutations (operation, entity_type, entity_id, sync_id) VALUES (?, ?, ?, ?)'
      ).run(operation, entityType, entityId, syncId);
    } catch (error) {
      process.stderr.write(
        `[store] Failed to record sync mutation (${operation} ${entityType}#${entityId}): ${error instanceof Error ? error.message : String(error)}\n`
      );
    }
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Ensure a session exists. Idempotent — creates if new, enriches missing fields if existing.
   * Replaces empty/unknown project and null/empty directory with provided values.
   */
  ensureSession(sessionId: string, project: string, directory?: string): void {
    // Check if session already exists
    const existing = this.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId);
    const isNew = !existing;

    this.db
      .prepare(
        `INSERT INTO sessions (id, project, directory) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project   = CASE WHEN sessions.project = '' OR sessions.project = 'unknown' THEN excluded.project ELSE sessions.project END,
           directory = CASE WHEN sessions.directory IS NULL OR sessions.directory = '' THEN excluded.directory ELSE sessions.directory END`
      )
      .run(sessionId, project, directory ?? null);

    // Record mutation only for new sessions
    if (isNew) {
      this.recordMutation('create', 'session', 0, sessionId);
    }
  }

  startSession(id: string, project: string, directory?: string): Session {
    const existing = this.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id);
    const isNew = !existing;

    const result = this.db
      .prepare(
        `INSERT INTO sessions (id, project, directory) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            project   = CASE WHEN sessions.project = '' OR sessions.project = 'unknown' THEN excluded.project ELSE sessions.project END,
            directory = CASE WHEN sessions.directory IS NULL OR sessions.directory = '' THEN excluded.directory ELSE sessions.directory END`
      )
      .run(id, project, directory ?? null);

    // Record mutation only for newly created sessions.
    if (isNew && result.changes > 0) {
      this.recordMutation('create', 'session', 0, id);
    }

    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
  }

  endSession(id: string, summary?: string): Session | null {
    const result = this.db
      .prepare("UPDATE sessions SET ended_at = datetime('now'), summary = ? WHERE id = ? AND ended_at IS NULL")
      .run(summary ?? null, id);

    if (result.changes === 0) {
      return null;
    }

    // Record mutation for session update
    this.recordMutation('update', 'session', 0, id);

    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
  }

  getSession(id: string): Session | null {
    return (this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined) ?? null;
  }

  recentSessions(limit: number = 5, sessionId?: string): Session[] {
    const sql = [
      'SELECT s.*',
      'FROM sessions s',
      'WHERE EXISTS (',
      '  SELECT 1',
      '  FROM observations o',
      '  WHERE o.session_id = s.id AND o.deleted_at IS NULL',
      ')',
    ];
    const params: Array<string | number> = [];

    if (sessionId) {
      sql.push('AND s.id = ?');
      params.push(sessionId);
    }

    sql.push('ORDER BY s.started_at DESC LIMIT ?');
    params.push(limit);

    return this.db.prepare(sql.join(' ')).all(...params) as Session[];
  }

  allSessions(): Session[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY started_at DESC').all() as Session[];
  }

  getContext(input: ContextInput): string {
    const recentSessions = this.recentSessions(5, input.session_id);
    const recentPrompts = this.recentPrompts(10, input.project, input.session_id);
    const limit = input.limit || this.config.maxContextResults;

    const observationsSql = [
      'SELECT * FROM observations WHERE deleted_at IS NULL',
    ];
    const params: Array<string | number> = [];

    if (input.project) {
      observationsSql.push('AND project = ?');
      params.push(input.project);
    }

    if (input.scope) {
      observationsSql.push('AND scope = ?');
      params.push(input.scope);
    }

    if (input.session_id) {
      observationsSql.push('AND session_id = ?');
      params.push(input.session_id);
    }

    observationsSql.push('ORDER BY created_at DESC LIMIT ?');
    params.push(limit);

    const observationRows = this.db.prepare(observationsSql.join(' ')).all(...params) as ObservationRow[];
    const observations = this.mapObservationRows(observationRows);

    const sessionLines = recentSessions.map((session) => {
      const count = this.db.prepare(
        'SELECT COUNT(*) as count FROM observations WHERE session_id = ? AND deleted_at IS NULL'
      ).get(session.id) as { count: number };

      return `- **${session.project}** (${session.started_at})${session.ended_at ? ' [ended]' : ''} [${count.count} observations]`;
    }).join('\n');

    const promptLines = recentPrompts
      .map((prompt) => `- ${prompt.created_at}: ${truncateForPreview(prompt.content, 100)}`)
      .join('\n');

    const observationBlocks = observations.map((obs) => formatObservationMarkdown(obs)).join('\n\n');

    const totalSessions = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    const totalObs = this.db.prepare('SELECT COUNT(*) as count FROM observations WHERE deleted_at IS NULL').get() as { count: number };
    const projects = this.db.prepare(
      `SELECT DISTINCT project
       FROM (
         SELECT project FROM sessions WHERE project IS NOT NULL
         UNION
         SELECT project FROM observations WHERE project IS NOT NULL AND deleted_at IS NULL
       )
       WHERE project IS NOT NULL
       ORDER BY project`
    ).all() as Array<{ project: string }>;

    return [
      '## Memory from Previous Sessions',
      '',
      '### Recent Sessions',
      sessionLines || '- None',
      '',
      '### Recent Prompts',
      promptLines || '- None',
      '',
      '### Recent Observations',
      observationBlocks || 'No recent observations.',
      '',
      '---',
      `Memory stats: ${totalSessions.count} sessions, ${totalObs.count} observations across projects: ${projects.map((p) => p.project).join(', ')}`,
    ].join('\n');
  }

  getTimeline(input: TimelineInput): TimelineResult {
    const focusRow = this.db
      .prepare('SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL')
      .get(input.observation_id) as ObservationRow | undefined;
    const focus = this.mapObservationRow(focusRow);

    if (!focus) {
      return { before: [], focus: null, after: [] };
    }

    const beforeLimit = input.before ?? 5;
    const afterLimit = input.after ?? 5;

    const beforeRows = (this.db.prepare(
      'SELECT * FROM observations WHERE session_id = ? AND id < ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?'
    ).all(focus.session_id, focus.id, beforeLimit) as ObservationRow[]).reverse();

    const afterRows = this.db.prepare(
      'SELECT * FROM observations WHERE session_id = ? AND id > ? AND deleted_at IS NULL ORDER BY id ASC LIMIT ?'
    ).all(focus.session_id, focus.id, afterLimit) as ObservationRow[];

    const before = this.mapObservationRows(beforeRows);
    const after = this.mapObservationRows(afterRows);

    return { before, focus, after };
  }

  savePrompt(sessionId: string, content: string, project?: string): UserPrompt {
    this.ensureSession(sessionId, project || 'unknown');

    const contentHash = computeHash(content);
    const recentPrompts = this.db.prepare(
      `SELECT *
       FROM user_prompts
       WHERE session_id = ?
         AND created_at > datetime('now', '-30 seconds')
       ORDER BY created_at DESC`
    ).all(sessionId) as UserPrompt[];

    const duplicatePrompt = recentPrompts.find((prompt) => computeHash(prompt.content) === contentHash);

    if (duplicatePrompt) {
      return duplicatePrompt;
    }

    const syncId = randomUUID();
    const result = this.db.prepare(
      'INSERT INTO user_prompts (session_id, content, project, sync_id) VALUES (?, ?, ?, ?)'
    ).run(sessionId, content, project ?? null, syncId);

    const prompt = this.db.prepare('SELECT * FROM user_prompts WHERE id = ?').get(Number(result.lastInsertRowid)) as UserPrompt | undefined;

    if (!prompt) {
      throw new Error('Failed to load created prompt');
    }

    this.recordMutation('create', 'prompt', prompt.id, prompt.sync_id);

    return prompt;
  }

  recentPrompts(limit: number = 10, project?: string, sessionId?: string): UserPrompt[] {
    const sql = ['SELECT * FROM user_prompts'];
    const params: Array<string | number> = [];

    if (project) {
      sql.push('WHERE project = ?');
      params.push(project);
    }

    if (sessionId) {
      sql.push(project ? 'AND session_id = ?' : 'WHERE session_id = ?');
      params.push(sessionId);
    }

    sql.push('ORDER BY created_at DESC LIMIT ?');
    params.push(limit);

    return this.db.prepare(sql.join(' ')).all(...params) as UserPrompt[];
  }

  getStats(): StatsResult {
    const totalSessions = (this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any).count;
    const totalObservations = (this.db.prepare('SELECT COUNT(*) as count FROM observations WHERE deleted_at IS NULL').get() as any).count;
    const totalPrompts = (this.db.prepare('SELECT COUNT(*) as count FROM user_prompts').get() as any).count;
    const projectRows = this.db.prepare('SELECT DISTINCT project FROM observations WHERE project IS NOT NULL AND deleted_at IS NULL ORDER BY project').all() as { project: string }[];
    return {
      total_sessions: totalSessions,
      total_observations: totalObservations,
      total_prompts: totalPrompts,
      projects: projectRows.map(r => r.project),
    };
  }

  saveObservation(input: SaveObservationInput): SaveResult {
    const strippedTitle = stripPrivateTags(input.title);
    const strippedContent = stripPrivateTags(input.content);
    const validation = validateContentLength(strippedContent, this.config.maxContentLength);

    if (validation.warning) {
      process.stderr.write(`${validation.warning}\n`);
    }

    const sessionId = input.session_id || `manual-save-${input.project || 'unknown'}`;
    const project = input.project || 'unknown';
    const type = input.type || 'manual';
    const scope = input.scope || 'project';
    const hash = computeHash(strippedContent);

    this.ensureSession(sessionId, project);

    const duplicate = checkDuplicate(
      this.db,
      hash,
      input.project ?? null,
      scope,
      type,
      strippedTitle,
      this.config.dedupeWindowMinutes
    );

    if (duplicate.isDuplicate && duplicate.existingId !== undefined) {
      incrementDuplicate(this.db, duplicate.existingId);
      const observation = this.getObservation(duplicate.existingId);

      if (!observation) {
        throw new Error(`Failed to load deduplicated observation ${duplicate.existingId}`);
      }

      this.recordMutation('update', 'observation', observation.id, observation.sync_id);

      return { observation, action: 'deduplicated' };
    }

    if (input.topic_key) {
      const existingRow = this.db.prepare(
        `SELECT *
         FROM observations
         WHERE topic_key = ?
           AND (project IS ? OR (project IS NULL AND ? IS NULL))
           AND scope = ?
           AND deleted_at IS NULL
         ORDER BY updated_at DESC
          LIMIT 1`
      ).get(input.topic_key, input.project ?? null, input.project ?? null, scope) as ObservationRow | undefined;

      const existing = this.mapObservationRow(existingRow);

      if (existing) {
        this.db.prepare(
          'INSERT INTO observation_versions (observation_id, title, content, type, version_number) VALUES (?, ?, ?, ?, ?)'
        ).run(existing.id, existing.title, existing.content, existing.type, existing.revision_count);

        this.db.prepare(
          "UPDATE observations SET title = ?, content = ?, type = ?, normalized_hash = ?, revision_count = revision_count + 1, updated_at = datetime('now') WHERE id = ?"
        ).run(strippedTitle, strippedContent, type, hash, existing.id);

        const observation = this.getObservation(existing.id);

        if (!observation) {
          throw new Error(`Failed to load upserted observation ${existing.id}`);
        }

        this.recordMutation('update', 'observation', observation.id, observation.sync_id);

        return { observation, action: 'upserted' };
      }
    }

    const syncId = randomUUID();
    const result = this.db.prepare(
      `INSERT INTO observations (session_id, type, title, content, project, scope, topic_key, normalized_hash, sync_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionId,
      type,
      strippedTitle,
      strippedContent,
      input.project ?? null,
      scope,
      input.topic_key ?? null,
      hash,
      syncId
    );

    const observation = this.getObservation(Number(result.lastInsertRowid));

    if (!observation) {
      throw new Error('Failed to load created observation');
    }

    this.recordMutation('create', 'observation', observation.id, observation.sync_id);

    return { observation, action: 'created' };
  }

  getObservation(id: number): Observation | null {
    const row = this.db.prepare('SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL').get(id) as ObservationRow | undefined;
    return this.mapObservationRow(row);
  }

  deleteObservation(id: number, hardDelete: boolean = false): boolean {
    if (hardDelete) {
      const existing = this.db.prepare(
        'SELECT sync_id FROM observations WHERE id = ?'
      ).get(id) as { sync_id: string | null } | undefined;

      this.db.prepare('DELETE FROM observation_versions WHERE observation_id = ?').run(id);
      const result = this.db.prepare('DELETE FROM observations WHERE id = ?').run(id);

      if (result.changes > 0) {
        this.recordMutation('delete', 'observation', id, existing?.sync_id ?? null);
      }

      return result.changes > 0;
    }

    const existing = this.db.prepare(
      'SELECT sync_id FROM observations WHERE id = ? AND deleted_at IS NULL'
    ).get(id) as { sync_id: string | null } | undefined;

    const result = this.db.prepare("UPDATE observations SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id);

    if (result.changes > 0) {
      this.recordMutation('delete', 'observation', id, existing?.sync_id ?? null);
    }

    return result.changes > 0;
  }

  updateObservation(input: UpdateObservationInput): Observation | null {
    const current = this.getObservation(input.id);

    if (!current) {
      return null;
    }

    this.db.prepare(
      'INSERT INTO observation_versions (observation_id, title, content, type, version_number) VALUES (?, ?, ?, ?, ?)'
    ).run(current.id, current.title, current.content, current.type, current.revision_count);

    const setClauses = ['revision_count = revision_count + 1', "updated_at = datetime('now')"];
    const params: Array<string | number | null> = [];

    if (input.title !== undefined) {
      setClauses.push('title = ?');
      params.push(input.title);
    }

    if (input.content !== undefined) {
      setClauses.push('content = ?');
      params.push(input.content);
      setClauses.push('normalized_hash = ?');
      params.push(computeHash(input.content));
    }

    if (input.type !== undefined) {
      setClauses.push('type = ?');
      params.push(input.type);
    }

    if (input.project !== undefined) {
      setClauses.push('project = ?');
      params.push(input.project);
    }

    if (input.scope !== undefined) {
      setClauses.push('scope = ?');
      params.push(input.scope);
    }

    if (input.topic_key !== undefined) {
      setClauses.push('topic_key = ?');
      params.push(input.topic_key);
    }

    params.push(input.id);

    this.db.prepare(`UPDATE observations SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

    const updated = this.getObservation(input.id);

    if (updated) {
      this.recordMutation('update', 'observation', updated.id, updated.sync_id);
    }

    return updated;
  }

  searchObservations(input: SearchInput): SearchResult[] {
    const limit = Math.min(input.limit ?? this.config.maxSearchResults, 20);
    let rows: SearchRow[];

    if (input.topic_key_exact !== undefined) {
      const sql = [
        'SELECT o.*, 0 as rank',
        'FROM observations o',
        'WHERE o.topic_key = ?',
        'AND o.deleted_at IS NULL',
      ];
      const params: Array<string | number> = [input.topic_key_exact];

      if (input.type) {
        sql.push('AND o.type = ?');
        params.push(input.type);
      }

      if (input.project) {
        sql.push('AND o.project = ?');
        params.push(input.project);
      }

      if (input.session_id) {
        sql.push('AND o.session_id = ?');
        params.push(input.session_id);
      }

      if (input.scope) {
        sql.push('AND o.scope = ?');
        params.push(input.scope);
      }

      sql.push('ORDER BY o.updated_at DESC, o.id DESC');
      sql.push('LIMIT ?');
      params.push(limit);

      rows = this.db.prepare(sql.join(' ')).all(...params) as SearchRow[];
    } else {
      const sanitizedQuery = sanitizeFTS(input.query);

      if (sanitizedQuery === '') {
        return [];
      }

      const sql = [
        'SELECT o.*, fts.rank',
        'FROM observations_fts fts',
        'JOIN observations o ON o.id = fts.rowid',
        'WHERE observations_fts MATCH ?',
        'AND o.deleted_at IS NULL',
      ];
      const params: Array<string | number> = [sanitizedQuery];

      if (input.type) {
        sql.push('AND o.type = ?');
        params.push(input.type);
      }

      if (input.project) {
        sql.push('AND o.project = ?');
        params.push(input.project);
      }

      if (input.session_id) {
        sql.push('AND o.session_id = ?');
        params.push(input.session_id);
      }

      if (input.scope) {
        sql.push('AND o.scope = ?');
        params.push(input.scope);
      }

      sql.push('ORDER BY fts.rank');
      sql.push('LIMIT ?');
      params.push(limit);

      rows = this.db.prepare(sql.join(' ')).all(...params) as SearchRow[];
    }

    return rows.map((row) => {
      const observation = this.mapObservationRow(row);

      if (!observation) {
        throw new Error('Failed to map search result observation');
      }

      return {
        ...observation,
        rank: row.rank,
        preview: truncateForPreview(observation.content, this.config.previewLength),
      };
    });
  }

  searchObservationsFormatted(input: SearchInput): string {
    const observations = this.searchObservations(input);
    return formatSearchResults(observations, input.mode ?? 'compact', this.config.previewLength);
  }

  getObservationVersions(observationId: number): ObservationVersion[] {
    return this.db
      .prepare('SELECT * FROM observation_versions WHERE observation_id = ? ORDER BY version_number DESC')
      .all(observationId) as ObservationVersion[];
  }

  // ── Project Migration ──

  migrateProject(oldProject: string, newProject: string): MigrateProjectResult {
    const migrate = this.db.transaction(() => {
      const sessions = this.db.prepare(
        'UPDATE sessions SET project = ? WHERE project = ?'
      ).run(newProject, oldProject);

      const observations = this.db.prepare(
        "UPDATE observations SET project = ?, updated_at = datetime('now') WHERE project = ?"
      ).run(newProject, oldProject);

      const prompts = this.db.prepare(
        'UPDATE user_prompts SET project = ? WHERE project = ?'
      ).run(newProject, oldProject);

      return {
        old_project: oldProject,
        new_project: newProject,
        sessions_updated: sessions.changes,
        observations_updated: observations.changes,
        prompts_updated: prompts.changes,
      };
    });

    return migrate();
  }

  // ── JSON Export/Import ──

  exportData(project?: string): ExportData {
    let sessions: Session[];
    let observationRows: ObservationRow[];
    let prompts: UserPrompt[];

    if (project) {
      sessions = this.db.prepare(
        'SELECT * FROM sessions WHERE project = ? ORDER BY started_at'
      ).all(project) as Session[];
      observationRows = this.db.prepare(
        'SELECT * FROM observations WHERE project = ? AND deleted_at IS NULL ORDER BY id'
      ).all(project) as ObservationRow[];
      prompts = this.db.prepare(
        'SELECT * FROM user_prompts WHERE project = ? ORDER BY id'
      ).all(project) as UserPrompt[];
    } else {
      sessions = this.db.prepare(
        'SELECT * FROM sessions ORDER BY started_at'
      ).all() as Session[];
      observationRows = this.db.prepare(
        'SELECT * FROM observations WHERE deleted_at IS NULL ORDER BY id'
      ).all() as ObservationRow[];
      prompts = this.db.prepare(
        'SELECT * FROM user_prompts ORDER BY id'
      ).all() as UserPrompt[];
    }

    const observations = this.mapObservationRows(observationRows);

    return {
      version: 1,
      exported_at: new Date().toISOString(),
      project,
      sessions,
      observations,
      prompts,
    };
  }

  importData(data: ExportData): ImportResult {
    let sessionsImported = 0;
    let observationsImported = 0;
    let promptsImported = 0;
    let skipped = 0;

    const doImport = this.db.transaction(() => {
      // Import sessions (skip if already exists)
      for (const session of data.sessions) {
        const result = this.db.prepare(
          `INSERT INTO sessions (id, project, directory, started_at, ended_at, summary)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`
        ).run(session.id, session.project, session.directory, session.started_at, session.ended_at, session.summary);
        if (result.changes > 0) sessionsImported++;
      }

      // Import observations (skip if sync_id already exists)
      for (const obs of data.observations) {
        if (obs.sync_id) {
          const existing = this.db.prepare(
            'SELECT id FROM observations WHERE sync_id = ?'
          ).get(obs.sync_id);
          if (existing) {
            skipped++;
            continue;
          }
        }

        this.ensureSession(obs.session_id, obs.project || 'unknown');

        this.db.prepare(
          `INSERT INTO observations (session_id, type, title, content, tool_name, project, scope, topic_key, normalized_hash, sync_id, revision_count, duplicate_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          obs.session_id, obs.type, obs.title, obs.content, obs.tool_name,
          obs.project, obs.scope, obs.topic_key, obs.normalized_hash,
          obs.sync_id || randomUUID(),
          obs.revision_count, obs.duplicate_count,
          obs.created_at, obs.updated_at
        );
        observationsImported++;
      }

      // Import prompts (skip if sync_id already exists)
      for (const prompt of data.prompts) {
        if (prompt.sync_id) {
          const existing = this.db.prepare(
            'SELECT id FROM user_prompts WHERE sync_id = ?'
          ).get(prompt.sync_id);
          if (existing) {
            skipped++;
            continue;
          }
        }

        this.ensureSession(prompt.session_id, prompt.project || 'unknown');

        this.db.prepare(
          `INSERT INTO user_prompts (session_id, content, project, sync_id, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(
          prompt.session_id, prompt.content, prompt.project,
          prompt.sync_id || randomUUID(),
          prompt.created_at
        );
        promptsImported++;
      }
    });

    doImport();

    return { sessions_imported: sessionsImported, observations_imported: observationsImported, prompts_imported: promptsImported, skipped };
  }

  applyV2Chunk(chunk: SyncChunkV2): { applied: number; skipped: number; deleted: number } {
    let applied = 0;
    let skipped = 0;
    let deleted = 0;

    const isRecord = (value: unknown): value is Record<string, unknown> => {
      return typeof value === 'object' && value !== null;
    };

    const asNullableString = (value: unknown): string | null => {
      if (value === null || value === undefined) {
        return null;
      }

      return typeof value === 'string' ? value : null;
    };

    const asPositiveInteger = (value: unknown, fallback: number): number => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        return fallback;
      }

      return value;
    };

    const isObservationType = (value: unknown): value is Observation['type'] => {
      return value === 'decision'
        || value === 'architecture'
        || value === 'bugfix'
        || value === 'pattern'
        || value === 'config'
        || value === 'discovery'
        || value === 'learning'
        || value === 'session_summary'
        || value === 'manual';
    };

    const isObservationScope = (value: unknown): value is Observation['scope'] => {
      return value === 'project' || value === 'personal';
    };

    const applyChunk = this.db.transaction((mutations: SyncChunkV2['mutations']) => {
      for (const mutation of mutations) {
        const syncId = mutation.sync_id;

        if (!syncId) {
          skipped++;
          continue;
        }

        if (mutation.operation === 'delete') {
          if (mutation.entity_type !== 'observation') {
            skipped++;
            continue;
          }

          const result = this.db.prepare(
            "UPDATE observations SET deleted_at = datetime('now') WHERE sync_id = ? AND deleted_at IS NULL"
          ).run(syncId);

          if (result.changes > 0) {
            applied++;
            deleted++;
          } else {
            skipped++;
          }

          continue;
        }

        if (!isRecord(mutation.data)) {
          skipped++;
          continue;
        }

        const data = mutation.data;

        if (mutation.operation === 'create') {
          if (mutation.entity_type === 'observation') {
            const existingObservation = this.db.prepare(
              'SELECT id FROM observations WHERE sync_id = ? LIMIT 1'
            ).get(syncId) as { id: number } | undefined;

            if (existingObservation) {
              skipped++;
              continue;
            }

            const sessionId = asNullableString(data.session_id);
            const typeValue = data.type;
            const title = asNullableString(data.title);
            const content = asNullableString(data.content);

            if (!sessionId || !title || !content || !isObservationType(typeValue)) {
              skipped++;
              continue;
            }

            const project = asNullableString(data.project);
            const scopeValue = data.scope;
            const scope = isObservationScope(scopeValue) ? scopeValue : 'project';
            const normalizedHash = asNullableString(data.normalized_hash) ?? computeHash(content);

            this.ensureSession(sessionId, project || 'unknown');

            this.db.prepare(
              `INSERT INTO observations (
                 session_id,
                 type,
                 title,
                 content,
                 tool_name,
                 project,
                 scope,
                 topic_key,
                 normalized_hash,
                 sync_id,
                 revision_count,
                 duplicate_count,
                 last_seen_at,
                 created_at,
                 updated_at,
                 deleted_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, datetime('now')), ?)`
            ).run(
              sessionId,
              typeValue,
              title,
              content,
              asNullableString(data.tool_name),
              project,
              scope,
              asNullableString(data.topic_key),
              normalizedHash,
              syncId,
              asPositiveInteger(data.revision_count, 1),
              asPositiveInteger(data.duplicate_count, 1),
              asNullableString(data.last_seen_at),
              asNullableString(data.created_at),
              asNullableString(data.updated_at),
              asNullableString(data.deleted_at)
            );

            applied++;
            continue;
          }

          if (mutation.entity_type === 'prompt') {
            const existingPrompt = this.db.prepare(
              'SELECT id FROM user_prompts WHERE sync_id = ? LIMIT 1'
            ).get(syncId) as { id: number } | undefined;

            if (existingPrompt) {
              skipped++;
              continue;
            }

            const sessionId = asNullableString(data.session_id);
            const content = asNullableString(data.content);

            if (!sessionId || !content) {
              skipped++;
              continue;
            }

            const project = asNullableString(data.project);
            this.ensureSession(sessionId, project || 'unknown');

            this.db.prepare(
              `INSERT INTO user_prompts (session_id, content, project, sync_id, created_at)
               VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))`
            ).run(
              sessionId,
              content,
              project,
              syncId,
              asNullableString(data.created_at)
            );

            applied++;
            continue;
          }

          if (mutation.entity_type === 'session') {
            const existingSession = this.db.prepare(
              'SELECT id FROM sessions WHERE id = ? LIMIT 1'
            ).get(syncId) as { id: string } | undefined;

            if (existingSession) {
              skipped++;
              continue;
            }

            const project = asNullableString(data.project) ?? 'unknown';

            this.db.prepare(
              `INSERT INTO sessions (id, project, directory, started_at, ended_at, summary)
               VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?)`
            ).run(
              syncId,
              project,
              asNullableString(data.directory),
              asNullableString(data.started_at),
              asNullableString(data.ended_at),
              asNullableString(data.summary)
            );

            applied++;
            continue;
          }

          skipped++;
          continue;
        }

        if (mutation.operation === 'update') {
          if (mutation.entity_type === 'observation') {
            const existingObservation = this.db.prepare(
              'SELECT id FROM observations WHERE sync_id = ? AND deleted_at IS NULL LIMIT 1'
            ).get(syncId) as { id: number } | undefined;

            if (!existingObservation) {
              skipped++;
              continue;
            }

            const setClauses: string[] = [];
            const params: Array<string | number | null> = [];
            const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(data, key);

            if (has('session_id')) {
              const sessionId = asNullableString(data.session_id);
              if (!sessionId) {
                skipped++;
                continue;
              }

              const projectForSession = has('project') ? asNullableString(data.project) : null;
              this.ensureSession(sessionId, projectForSession || 'unknown');

              setClauses.push('session_id = ?');
              params.push(sessionId);
            }

            if (has('type')) {
              const typeValue = data.type;
              if (!isObservationType(typeValue)) {
                skipped++;
                continue;
              }
              setClauses.push('type = ?');
              params.push(typeValue);
            }

            if (has('title')) {
              const title = asNullableString(data.title);
              if (!title) {
                skipped++;
                continue;
              }
              setClauses.push('title = ?');
              params.push(title);
            }

            if (has('content')) {
              const content = asNullableString(data.content);
              if (!content) {
                skipped++;
                continue;
              }
              setClauses.push('content = ?');
              params.push(content);

              if (!has('normalized_hash')) {
                setClauses.push('normalized_hash = ?');
                params.push(computeHash(content));
              }
            }

            if (has('tool_name')) {
              setClauses.push('tool_name = ?');
              params.push(asNullableString(data.tool_name));
            }

            if (has('project')) {
              setClauses.push('project = ?');
              params.push(asNullableString(data.project));
            }

            if (has('scope')) {
              const scopeValue = data.scope;
              if (!isObservationScope(scopeValue)) {
                skipped++;
                continue;
              }
              setClauses.push('scope = ?');
              params.push(scopeValue);
            }

            if (has('topic_key')) {
              setClauses.push('topic_key = ?');
              params.push(asNullableString(data.topic_key));
            }

            if (has('normalized_hash')) {
              setClauses.push('normalized_hash = ?');
              params.push(asNullableString(data.normalized_hash));
            }

            if (has('revision_count')) {
              setClauses.push('revision_count = ?');
              params.push(asPositiveInteger(data.revision_count, 1));
            }

            if (has('duplicate_count')) {
              setClauses.push('duplicate_count = ?');
              params.push(asPositiveInteger(data.duplicate_count, 1));
            }

            if (has('last_seen_at')) {
              setClauses.push('last_seen_at = ?');
              params.push(asNullableString(data.last_seen_at));
            }

            if (has('created_at')) {
              const createdAt = asNullableString(data.created_at);
              if (!createdAt) {
                skipped++;
                continue;
              }
              setClauses.push('created_at = ?');
              params.push(createdAt);
            }

            if (has('updated_at')) {
              const updatedAt = asNullableString(data.updated_at);
              if (!updatedAt) {
                skipped++;
                continue;
              }
              setClauses.push('updated_at = ?');
              params.push(updatedAt);
            } else {
              setClauses.push("updated_at = datetime('now')");
            }

            if (setClauses.length === 0) {
              skipped++;
              continue;
            }

            params.push(existingObservation.id);
            const result = this.db.prepare(
              `UPDATE observations SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`
            ).run(...params);

            if (result.changes > 0) {
              applied++;
            } else {
              skipped++;
            }

            continue;
          }

          if (mutation.entity_type === 'prompt') {
            const existingPrompt = this.db.prepare(
              'SELECT id FROM user_prompts WHERE sync_id = ? LIMIT 1'
            ).get(syncId) as { id: number } | undefined;

            if (!existingPrompt) {
              skipped++;
              continue;
            }

            const setClauses: string[] = [];
            const params: Array<string | null> = [];
            const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(data, key);

            if (has('session_id')) {
              const sessionId = asNullableString(data.session_id);
              if (!sessionId) {
                skipped++;
                continue;
              }

              const projectForSession = has('project') ? asNullableString(data.project) : null;
              this.ensureSession(sessionId, projectForSession || 'unknown');

              setClauses.push('session_id = ?');
              params.push(sessionId);
            }

            if (has('content')) {
              const content = asNullableString(data.content);
              if (!content) {
                skipped++;
                continue;
              }
              setClauses.push('content = ?');
              params.push(content);
            }

            if (has('project')) {
              setClauses.push('project = ?');
              params.push(asNullableString(data.project));
            }

            if (has('created_at')) {
              const createdAt = asNullableString(data.created_at);
              if (!createdAt) {
                skipped++;
                continue;
              }
              setClauses.push('created_at = ?');
              params.push(createdAt);
            }

            if (setClauses.length === 0) {
              skipped++;
              continue;
            }

            params.push(String(existingPrompt.id));
            const result = this.db.prepare(`UPDATE user_prompts SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

            if (result.changes > 0) {
              applied++;
            } else {
              skipped++;
            }

            continue;
          }

          if (mutation.entity_type === 'session') {
            const existingSession = this.db.prepare(
              'SELECT id FROM sessions WHERE id = ? LIMIT 1'
            ).get(syncId) as { id: string } | undefined;

            if (!existingSession) {
              skipped++;
              continue;
            }

            const setClauses: string[] = [];
            const params: Array<string | null> = [];
            const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(data, key);

            if (has('project')) {
              const project = asNullableString(data.project);
              if (!project) {
                skipped++;
                continue;
              }
              setClauses.push('project = ?');
              params.push(project);
            }

            if (has('directory')) {
              setClauses.push('directory = ?');
              params.push(asNullableString(data.directory));
            }

            if (has('started_at')) {
              const startedAt = asNullableString(data.started_at);
              if (!startedAt) {
                skipped++;
                continue;
              }
              setClauses.push('started_at = ?');
              params.push(startedAt);
            }

            if (has('ended_at')) {
              setClauses.push('ended_at = ?');
              params.push(asNullableString(data.ended_at));
            }

            if (has('summary')) {
              setClauses.push('summary = ?');
              params.push(asNullableString(data.summary));
            }

            if (setClauses.length === 0) {
              skipped++;
              continue;
            }

            params.push(syncId);
            const result = this.db.prepare(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

            if (result.changes > 0) {
              applied++;
            } else {
              skipped++;
            }

            continue;
          }

          skipped++;
          continue;
        }

        skipped++;
      }
    });

    applyChunk(chunk.mutations);

    return { applied, skipped, deleted };
  }

  isChunkImported(chunkId: string): boolean {
    const row = this.db.prepare(
      "SELECT 1 as imported FROM sync_chunks WHERE chunk_id = ? AND status = 'applied' LIMIT 1"
    ).get(chunkId) as { imported: number } | undefined;

    return row !== undefined;
  }

  recordSyncChunk(record: {
    chunk_id: string;
    payload_hash?: string;
    status: SyncChunkStatus;
    from_mutation_id?: number;
    to_mutation_id?: number;
    chunk_version?: number;
  }): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO sync_chunks (
         chunk_id,
         payload_hash,
         status,
         from_mutation_id,
         to_mutation_id,
         chunk_version
       ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      record.chunk_id,
      record.payload_hash ?? null,
      record.status,
      record.from_mutation_id ?? null,
      record.to_mutation_id ?? null,
      record.chunk_version ?? 1
    );
  }

  getExportWatermark(): number {
    const row = this.db.prepare(
      "SELECT MAX(to_mutation_id) as watermark FROM sync_chunks WHERE status = 'applied' AND chunk_version = 2"
    ).get() as { watermark: number | null };

    return row.watermark ?? 0;
  }

  getMutationsSince(fromId: number): SyncMutation[] {
    return this.db.prepare(
      'SELECT * FROM sync_mutations WHERE id > ? ORDER BY id ASC'
    ).all(fromId) as SyncMutation[];
  }

  getSyncChunks(): SyncChunkRecord[] {
    return this.db.prepare(
      'SELECT * FROM sync_chunks ORDER BY created_at ASC'
    ).all() as SyncChunkRecord[];
  }

  /**
   * Expose the raw database for use by utility functions (e.g., dedup checks).
   * This is the single owner of the DB connection,
   * but utility functions may need direct access for specific queries.
   */
  getDb(): Database.Database {
    return this.db;
  }
}
