import { Pool, type QueryResult } from "pg";

const globalForDb = globalThis as unknown as {
  decisionLabPool?: Pool;
  decisionLabReady?: Promise<void>;
};

export type Queryable = {
  get<T>(text: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(text: string, params?: unknown[]): Promise<T[]>;
  run(text: string, params?: unknown[]): Promise<{ changes: number }>;
};

function connectionString(): string {
  const value = process.env.PRIMARY_DB_CONNECTION_STRING;
  if (!value) {
    throw new Error(
      "PRIMARY_DB_CONNECTION_STRING is not set. Run stripe projects env --pull so Neon credentials are available.",
    );
  }
  return value;
}

function pool(): Pool {
  if (!globalForDb.decisionLabPool) {
    const connection = connectionString();
    globalForDb.decisionLabPool = new Pool({
      connectionString: connection,
      max: 5,
      ...(connection.includes("sslmode=") ? {} : { ssl: { rejectUnauthorized: true } }),
    });
  }
  return globalForDb.decisionLabPool;
}

function bind(text: string): string {
  let index = 0;
  return text.replace(/\?/g, () => `$${++index}`);
}

function clientApi(query: (text: string, params: unknown[]) => Promise<QueryResult>): Queryable {
  return {
    async get<T>(text: string, params: unknown[] = []) {
      const result = await query(bind(text), params);
      return result.rows[0] as T | undefined;
    },
    async all<T>(text: string, params: unknown[] = []) {
      const result = await query(bind(text), params);
      return result.rows as T[];
    },
    async run(text: string, params: unknown[] = []) {
      const result = await query(bind(text), params);
      return { changes: result.rowCount ?? 0 };
    },
  };
}

export function db(): Queryable {
  return clientApi(async (text, params) => {
    await ensureSchema();
    return pool().query(text, params);
  });
}

export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(clientApi((text, params) => client.query(text, params)));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function ensureSchema(): Promise<void> {
  if (!globalForDb.decisionLabReady) {
    globalForDb.decisionLabReady = migrate().catch((error: unknown) => {
      globalForDb.decisionLabReady = undefined;
      throw error;
    });
  }
  return globalForDb.decisionLabReady;
}

async function migrate() {
  await pool().query(`
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL,
      data_sources TEXT NOT NULL,
      input_schema TEXT NOT NULL,
      input_schema_hash TEXT NOT NULL,
      dependencies TEXT NOT NULL,
      success_metrics TEXT NOT NULL,
      constraints_json TEXT NOT NULL,
      assumptions TEXT NOT NULL,
      cadence TEXT NOT NULL,
      interval_hours INTEGER,
      hour_utc INTEGER,
      weekday INTEGER,
      trigger_conditions TEXT NOT NULL,
      output_schema TEXT NOT NULL,
      current_version_id TEXT,
      code_stale INTEGER NOT NULL DEFAULT 0,
      stale_reason TEXT,
      notification_prefs TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_run_at TEXT,
      next_run_at TEXT,
      lease_token TEXT,
      lease_until TEXT,
      failure_count INTEGER NOT NULL DEFAULT 0,
      latest_insight TEXT,
      run_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS experiment_versions (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      python_source TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      dependencies TEXT NOT NULL,
      input_schema_hash TEXT NOT NULL,
      objective TEXT NOT NULL,
      validated_execution_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (experiment_id, version),
      FOREIGN KEY (experiment_id) REFERENCES experiments(id)
    );

    CREATE TABLE IF NOT EXISTS experiment_runs (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      version_id TEXT,
      status TEXT NOT NULL,
      trigger TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      exit_code INTEGER,
      stdout TEXT NOT NULL DEFAULT '',
      stderr TEXT NOT NULL DEFAULT '',
      sandbox_id TEXT,
      results_json TEXT,
      error TEXT,
      attempt INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (experiment_id) REFERENCES experiments(id)
    );

    CREATE TABLE IF NOT EXISTS experiment_insights (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      run_id TEXT,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (experiment_id) REFERENCES experiments(id)
    );

    CREATE TABLE IF NOT EXISTS sandbox_executions (
      id TEXT PRIMARY KEY,
      source_hash TEXT NOT NULL,
      source TEXT NOT NULL,
      dependencies TEXT NOT NULL,
      tables_json TEXT NOT NULL,
      ok INTEGER NOT NULL,
      sandbox_id TEXT,
      exit_code INTEGER,
      stdout TEXT NOT NULL,
      stderr TEXT NOT NULL,
      duration_ms INTEGER,
      results_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      conversation_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      message_json TEXT NOT NULL,
      PRIMARY KEY (conversation_id, position),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE INDEX IF NOT EXISTS experiments_status_next ON experiments (status, next_run_at);
    CREATE INDEX IF NOT EXISTS runs_experiment ON experiment_runs (experiment_id, started_at);
    CREATE INDEX IF NOT EXISTS executions_source ON sandbox_executions (source_hash, created_at);
  `);
}
