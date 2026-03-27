/**
 * Strict observation type taxonomy — matches CHECK constraint in SQL schema.
 */
export const OBSERVATION_TYPES = [
  'decision', 'architecture', 'bugfix', 'pattern',
  'config', 'discovery', 'learning', 'session_summary', 'manual'
] as const;

export type ObservationType = typeof OBSERVATION_TYPES[number];

export type ObservationScope = 'project' | 'personal';
export type SearchMode = 'compact' | 'preview';

// ── Database Entities ──

export interface Session {
  id: string;
  project: string;
  directory: string | null;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
}

export interface Observation {
  id: number;
  sync_id: string | null;
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

export interface ObservationVersion {
  id: number;
  observation_id: number;
  title: string;
  content: string;
  type: ObservationType;
  version_number: number;
  created_at: string;
}

export interface UserPrompt {
  id: number;
  sync_id: string | null;
  session_id: string;
  content: string;
  project: string | null;
  created_at: string;
}

export interface SearchResult extends Observation {
  rank: number;
  preview: string;
}

// ── Operation Inputs ──

export interface SaveObservationInput {
  title: string;
  content: string;
  type?: ObservationType;
  session_id?: string;
  project?: string;
  scope?: ObservationScope;
  topic_key?: string;
}

export interface SearchInput {
  query: string;
  type?: ObservationType;
  project?: string;
  session_id?: string;
  scope?: ObservationScope;
  limit?: number;
  mode?: SearchMode;
}

export interface ContextInput {
  project?: string;
  session_id?: string;
  scope?: ObservationScope;
  limit?: number;
}

export interface TimelineInput {
  observation_id: number;
  before?: number;
  after?: number;
}

export interface UpdateObservationInput {
  id: number;
  title?: string;
  content?: string;
  type?: ObservationType;
  project?: string;
  scope?: ObservationScope;
  topic_key?: string;
}

// ── Operation Results ──

export interface SaveResult {
  observation: Observation;
  action: 'created' | 'deduplicated' | 'upserted';
}

export interface PaginatedContent {
  content: string;
  total_length: number;
  returned_from: number;
  returned_to: number;
  has_more: boolean;
}

export interface StatsResult {
  total_sessions: number;
  total_observations: number;
  total_prompts: number;
  projects: string[];
}

export interface CaptureResult {
  extracted: number;
  saved: number;
  duplicates: number;
}

export interface TimelineResult {
  before: Observation[];
  focus: Observation | null;
  after: Observation[];
}

// ── Export/Import/Migration Results ──

export interface ExportData {
  version: number;
  exported_at: string;
  project?: string;
  sessions: Session[];
  observations: Observation[];
  prompts: UserPrompt[];
}

export interface ImportResult {
  sessions_imported: number;
  observations_imported: number;
  prompts_imported: number;
  skipped: number;
}

export interface MigrateProjectResult {
  old_project: string;
  new_project: string;
  sessions_updated: number;
  observations_updated: number;
  prompts_updated: number;
}
