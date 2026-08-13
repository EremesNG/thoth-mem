const previousSqliteUseUri = process.env.SQLITE_USE_URI;
process.env.SQLITE_USE_URI = '1';

export interface SqliteUriRuntimeState {
  enabled: true;
  previous_value: string | null;
}

export const SQLITE_URI_RUNTIME_STATE: SqliteUriRuntimeState = Object.freeze({
  enabled: true,
  previous_value: previousSqliteUseUri ?? null,
});

