import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { PRAGMAS, SCHEMA_SQL, MIGRATIONS_SQL } from './schema.js';
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
  StatsResult,
  TimelineInput,
  TimelineResult,
  UpdateObservationInput,
  UserPrompt,
} from './types.js';
import { stripPrivateTags } from '../utils/privacy.js';
import { sanitizeFTS } from '../utils/sanitize.js';
import { checkDuplicate, computeHash, incrementDuplicate } from '../utils/dedup.js';
import { formatObservationMarkdown, truncateForPreview, validateContentLength } from '../utils/content.js';

const DEFAULT_CONFIG: ThothConfig = {
  dataDir: '',
  dbPath: ':memory:',
  maxContentLength: 100_000,
  maxContextResults: 20,
  maxSearchResults: 20,
  dedupeWindowMinutes: 15,
  previewLength: 300,
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
    this.runMigrations();
  }

  /**
   * Run idempotent schema migrations for existing databases.
   * Each migration is wrapped in try/catch — already-applied migrations are silently skipped.
   */
  private runMigrations(): void {
    for (const sql of MIGRATIONS_SQL) {
      try {
        this.db.exec(sql);
      } catch {
        // Already applied — safe to ignore (e.g., "duplicate column name")
      }
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
    this.db
      .prepare(
        `INSERT INTO sessions (id, project, directory) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project   = CASE WHEN sessions.project = '' OR sessions.project = 'unknown' THEN excluded.project ELSE sessions.project END,
           directory = CASE WHEN sessions.directory IS NULL OR sessions.directory = '' THEN excluded.directory ELSE sessions.directory END`
      )
      .run(sessionId, project, directory ?? null);
  }

  startSession(id: string, project: string, directory?: string): Session {
    this.db
      .prepare(
        `INSERT INTO sessions (id, project, directory) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           project   = CASE WHEN sessions.project = '' OR sessions.project = 'unknown' THEN excluded.project ELSE sessions.project END,
           directory = CASE WHEN sessions.directory IS NULL OR sessions.directory = '' THEN excluded.directory ELSE sessions.directory END`
      )
      .run(id, project, directory ?? null);

    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
  }

  endSession(id: string, summary?: string): Session | null {
    const result = this.db
      .prepare("UPDATE sessions SET ended_at = datetime('now'), summary = ? WHERE id = ? AND ended_at IS NULL")
      .run(summary ?? null, id);

    if (result.changes === 0) {
      return null;
    }

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

    const observations = this.db.prepare(observationsSql.join(' ')).all(...params) as Observation[];

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
    const focus = (this.db.prepare('SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL').get(input.observation_id) as Observation | undefined) ?? null;

    if (!focus) {
      return { before: [], focus: null, after: [] };
    }

    const beforeLimit = input.before ?? 5;
    const afterLimit = input.after ?? 5;

    const before = (this.db.prepare(
      'SELECT * FROM observations WHERE session_id = ? AND id < ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?'
    ).all(focus.session_id, focus.id, beforeLimit) as Observation[]).reverse();

    const after = this.db.prepare(
      'SELECT * FROM observations WHERE session_id = ? AND id > ? AND deleted_at IS NULL ORDER BY id ASC LIMIT ?'
    ).all(focus.session_id, focus.id, afterLimit) as Observation[];

    return { before, focus, after };
  }

  savePrompt(sessionId: string, content: string, project?: string): UserPrompt {
    this.ensureSession(sessionId, project || 'unknown');

    const syncId = randomUUID();
    const result = this.db.prepare(
      'INSERT INTO user_prompts (session_id, content, project, sync_id) VALUES (?, ?, ?, ?)'
    ).run(sessionId, content, project ?? null, syncId);

    const prompt = this.db.prepare('SELECT * FROM user_prompts WHERE id = ?').get(Number(result.lastInsertRowid)) as UserPrompt | undefined;

    if (!prompt) {
      throw new Error('Failed to load created prompt');
    }

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

      return { observation, action: 'deduplicated' };
    }

    if (input.topic_key) {
      const existing = this.db.prepare(
        `SELECT *
         FROM observations
         WHERE topic_key = ?
           AND (project IS ? OR (project IS NULL AND ? IS NULL))
           AND scope = ?
           AND deleted_at IS NULL
         ORDER BY updated_at DESC
         LIMIT 1`
      ).get(input.topic_key, input.project ?? null, input.project ?? null, scope) as Observation | undefined;

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

    return { observation, action: 'created' };
  }

  getObservation(id: number): Observation | null {
    return (this.db.prepare('SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL').get(id) as Observation | undefined) ?? null;
  }

  deleteObservation(id: number, hardDelete: boolean = false): boolean {
    if (hardDelete) {
      this.db.prepare('DELETE FROM observation_versions WHERE observation_id = ?').run(id);
      const result = this.db.prepare('DELETE FROM observations WHERE id = ?').run(id);
      return result.changes > 0;
    }

    const result = this.db.prepare("UPDATE observations SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(id);
    return result.changes > 0;
  }

  updateObservation(input: UpdateObservationInput): Observation | null {
    const current = (this.db.prepare('SELECT * FROM observations WHERE id = ? AND deleted_at IS NULL').get(input.id) as Observation | undefined) ?? null;

    if (!current) {
      return null;
    }

    this.db.prepare(
      'INSERT INTO observation_versions (observation_id, title, content, type, version_number) VALUES (?, ?, ?, ?, ?)'
    ).run(current.id, current.title, current.content, current.type, current.revision_count);

    const setClauses = ['revision_count = revision_count + 1', "updated_at = datetime('now')"];
    const params: Array<string | number> = [];

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

    return this.getObservation(input.id);
  }

  searchObservations(input: SearchInput): SearchResult[] {
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

    const limit = Math.min(input.limit ?? this.config.maxSearchResults, 20);
    sql.push('ORDER BY fts.rank');
    sql.push('LIMIT ?');
    params.push(limit);

    const rows = this.db.prepare(sql.join(' ')).all(...params) as Array<Observation & { rank: number }>;

    return rows.map((row) => ({
      ...row,
      preview: truncateForPreview(row.content, this.config.previewLength),
    }));
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
    let observations: Observation[];
    let prompts: UserPrompt[];

    if (project) {
      sessions = this.db.prepare(
        'SELECT * FROM sessions WHERE project = ? ORDER BY started_at'
      ).all(project) as Session[];
      observations = this.db.prepare(
        'SELECT * FROM observations WHERE project = ? AND deleted_at IS NULL ORDER BY id'
      ).all(project) as Observation[];
      prompts = this.db.prepare(
        'SELECT * FROM user_prompts WHERE project = ? ORDER BY id'
      ).all(project) as UserPrompt[];
    } else {
      sessions = this.db.prepare(
        'SELECT * FROM sessions ORDER BY started_at'
      ).all() as Session[];
      observations = this.db.prepare(
        'SELECT * FROM observations WHERE deleted_at IS NULL ORDER BY id'
      ).all() as Observation[];
      prompts = this.db.prepare(
        'SELECT * FROM user_prompts ORDER BY id'
      ).all() as UserPrompt[];
    }

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

  /**
   * Expose the raw database for use by utility functions (e.g., dedup checks).
   * This is the single owner of the DB connection,
   * but utility functions may need direct access for specific queries.
   */
  getDb(): Database.Database {
    return this.db;
  }
}
