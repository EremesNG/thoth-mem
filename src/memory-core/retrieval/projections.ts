import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { ProjectionRecord } from '../contracts.js';

export interface ProjectionMapping { sourceId: string; sourceHash: string; projectedId: string; configHash: string }
export interface ProjectionRebuildResult { jobKey: string; state: 'rebuilding' | 'ready'; duplicate: boolean; checkpointWatermark: number; sourceCount: number; authoritativeHash: string; projectionHash: string }

function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }

export class ProjectionRegistry {
  constructor(private readonly database: Database.Database) {}
  private finalizeReady(jobKey: string, projectionId: string, configHash: string, sourceWatermark: number, checkpointSourceId: string | null): void {
    this.database.transaction(() => {
      this.database.prepare("UPDATE projection_jobs SET status='ready',checkpoint_source_id=?,error_code=NULL WHERE job_key=?").run(checkpointSourceId, jobKey);
      this.database.prepare(`INSERT INTO projection_state VALUES(?,?,?,?,?,NULL) ON CONFLICT(projection_id) DO UPDATE SET config_hash=excluded.config_hash,source_watermark=excluded.source_watermark,state='ready',updated_at=excluded.updated_at,last_error_code=NULL`).run(projectionId, configHash, sourceWatermark, 'ready', new Date().toISOString());
    })();
  }
  record(input: Omit<ProjectionRecord, 'updatedAt' | 'lastErrorCode'> & { lastErrorCode?: string | null }): void {
    this.database.prepare(`INSERT INTO projection_state VALUES(?,?,?,?,?,?) ON CONFLICT(projection_id) DO UPDATE SET config_hash=excluded.config_hash,source_watermark=excluded.source_watermark,state=CASE WHEN projection_state.config_hash<>excluded.config_hash AND excluded.state='ready' THEN 'stale' ELSE excluded.state END,updated_at=excluded.updated_at,last_error_code=excluded.last_error_code`).run(input.projectionId, input.configHash, input.sourceWatermark, input.state, new Date().toISOString(), input.lastErrorCode ?? null);
  }
  list(): ProjectionRecord[] {
    return (this.database.prepare('SELECT * FROM projection_state ORDER BY projection_id').all() as Array<Record<string, unknown>>).map((row) => ({ projectionId: String(row.projection_id), configHash: String(row.config_hash), sourceWatermark: Number(row.source_watermark), state: row.state as ProjectionRecord['state'], updatedAt: String(row.updated_at), lastErrorCode: row.last_error_code === null ? null : String(row.last_error_code) }));
  }
  delete(projectionId: string): boolean { return this.database.transaction(() => { this.database.prepare('DELETE FROM projection_source_mapping WHERE projection_id=?').run(projectionId); this.database.prepare('DELETE FROM projection_jobs WHERE projection_id=?').run(projectionId); return this.database.prepare('DELETE FROM projection_state WHERE projection_id=?').run(projectionId).changes === 1; })(); }
  currentWatermark(): number { return Number((this.database.prepare('SELECT coalesce(max(id),0) AS value FROM change_watermark').get() as { value: number }).value); }
  effectiveStates(): Record<string, ProjectionRecord['state']> {
    const watermark = this.currentWatermark();
    return Object.fromEntries(this.list().map((item) => [item.projectionId, item.state === 'ready' && item.sourceWatermark !== watermark ? 'stale' : item.state]));
  }

  mappings(projectionId: string): ProjectionMapping[] { return (this.database.prepare('SELECT source_id,source_hash,projected_id,config_hash FROM projection_source_mapping WHERE projection_id=? ORDER BY source_id').all(projectionId) as Array<Record<string, unknown>>).map((row) => ({ sourceId: String(row.source_id), sourceHash: String(row.source_hash), projectedId: String(row.projected_id), configHash: String(row.config_hash) })); }

  ensureConfiguration(projectionId: string, configHash: string): ProjectionRecord['state'] {
    const current = this.list().find((item) => item.projectionId === projectionId); if (!current) return 'disabled';
    if (current.configHash === configHash) return this.effectiveStates()[projectionId] ?? current.state;
    this.record({ projectionId, configHash, sourceWatermark: current.sourceWatermark, state: 'stale', lastErrorCode: 'config_mismatch' }); return 'stale';
  }

  rebuild(input: { projectionId: string; configHash: string; maxSources?: number }): ProjectionRebuildResult {
    const sources = (this.database.prepare('SELECT id,title,content,topic_key,kind,outcome,status,created_at FROM memories ORDER BY id').all() as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), hash: digest(JSON.stringify([row.id,row.title,row.content,row.topic_key,row.kind,row.outcome,row.status,row.created_at])) }));
    const watermark = this.currentWatermark(); const jobKey = digest(`${input.projectionId}\0${input.configHash}\0${watermark}`); const authoritativeHash = digest(sources.map((source) => `${source.id}:${source.hash}`).join('\n'));
    const existing = this.database.prepare('SELECT status,checkpoint_source_id FROM projection_jobs WHERE job_key=?').get(jobKey) as { status: string; checkpoint_source_id: string | null } | undefined;
    if (existing?.status === 'ready') {
      const registry = this.database.prepare('SELECT config_hash,source_watermark,state FROM projection_state WHERE projection_id=?').get(input.projectionId) as { config_hash: string; source_watermark: number; state: ProjectionRecord['state'] } | undefined;
      if (!registry || registry.config_hash !== input.configHash || registry.source_watermark !== watermark || registry.state !== 'ready') this.finalizeReady(jobKey, input.projectionId, input.configHash, watermark, existing.checkpoint_source_id);
      const mappings = this.mappings(input.projectionId); return { jobKey, state: 'ready', duplicate: true, checkpointWatermark: watermark, sourceCount: mappings.length, authoritativeHash, projectionHash: digest(mappings.map((item) => `${item.sourceId}:${item.sourceHash}`).join('\n')) };
    }
    if (!existing) this.database.transaction(() => { this.database.prepare('DELETE FROM projection_source_mapping WHERE projection_id=?').run(input.projectionId); this.database.prepare('INSERT INTO projection_jobs VALUES(?,?,?,?,?,?,NULL,NULL)').run(jobKey, input.projectionId, input.configHash, watermark, 'running', 1); })();
    else this.database.prepare("UPDATE projection_jobs SET status='running',attempts=attempts+1,error_code=NULL WHERE job_key=?").run(jobKey);
    const checkpoint = existing?.checkpoint_source_id; const remaining = sources.filter((source) => checkpoint === null || checkpoint === undefined || source.id > checkpoint); const batch = remaining.slice(0, Math.max(1, input.maxSources ?? remaining.length));
    this.database.transaction(() => { for (const source of batch) this.database.prepare('INSERT INTO projection_source_mapping VALUES(?,?,?,?,?) ON CONFLICT(projection_id,source_id) DO UPDATE SET config_hash=excluded.config_hash,source_hash=excluded.source_hash,projected_id=excluded.projected_id').run(input.projectionId, source.id, input.configHash, source.hash, digest(`${input.projectionId}:${source.id}`)); })();
    const complete = batch.length === remaining.length; const last = batch.at(-1)?.id ?? checkpoint ?? null;
    if (complete) this.finalizeReady(jobKey, input.projectionId, input.configHash, watermark, last);
    else this.database.transaction(() => { this.database.prepare("UPDATE projection_jobs SET status='running',checkpoint_source_id=? WHERE job_key=?").run(last, jobKey); this.record({ projectionId: input.projectionId, configHash: input.configHash, sourceWatermark: watermark, state: 'rebuilding' }); })();
    const mappings = this.mappings(input.projectionId); return { jobKey, state: complete ? 'ready' : 'rebuilding', duplicate: false, checkpointWatermark: watermark, sourceCount: mappings.length, authoritativeHash, projectionHash: digest(mappings.map((item) => `${item.sourceId}:${item.sourceHash}`).join('\n')) };
  }
}
