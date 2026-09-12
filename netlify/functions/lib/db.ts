/**
 * Утилиты для работы с PostgreSQL базой данных.
 *
 * Netlify dev bundles each function separately — module-level `let pool` would
 * create one Pool per bundle in the same Node process. Use globalThis so all
 * functions share a single pool (Supabase session pooler limit is small).
 */

import { Pool, PoolClient, QueryResult } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __appPgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __appPgPoolFingerprint: string | undefined;
  // eslint-disable-next-line no-var
  var __appPgPoolShutdownRegistered: boolean | undefined;
}

const DEFAULT_POOL_MAX = 2;

/**
 * Reconnecting to the Supabase pooler costs ~2s (TCP + TLS + SCRAM), so on Netlify Functions an
 * idle connection must outlive the gap between two warm invocations — the container is frozen,
 * not torn down, so the 10s idle timer would otherwise fire on thaw and close every connection.
 *
 * CLI scripts import this module as well and none of them call closePool(): they keep the short
 * timeout and the unref'd-idle behaviour that lets a one-shot process exit on its own.
 */
const SERVERLESS_IDLE_TIMEOUT_MS = 300_000;
const CLI_IDLE_TIMEOUT_MS = 10_000;

/** True inside the AWS Lambda runtime that hosts Netlify Functions (both vars are reserved). */
function isServerlessRuntime(): boolean {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
}

function poolFingerprint(connectionString: string): string {
  return connectionString.trim();
}

function readSharedPool(): Pool | undefined {
  return globalThis.__appPgPool;
}

function writeSharedPool(next: Pool | undefined, fingerprint?: string): void {
  globalThis.__appPgPool = next;
  globalThis.__appPgPoolFingerprint = fingerprint;
}

function resolvePoolMax(): number {
  const raw = process.env.PG_POOL_MAX?.trim();
  if (!raw) return DEFAULT_POOL_MAX;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX;
}

function registerPoolShutdownOnce(): void {
  if (globalThis.__appPgPoolShutdownRegistered) return;
  globalThis.__appPgPoolShutdownRegistered = true;

  const shutdown = () => {
    void closePool().catch(() => {
      /* ignore */
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  process.once('beforeExit', shutdown);
}

function createPoolInstance(connectionString: string): Pool {
  const connectionUrl = connectionString.toLowerCase();
  const isSupabase = connectionUrl.includes('supabase.com');
  const useSSL = isSupabase || process.env.NODE_ENV === 'production';

  if (process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV !== 'production') {
    try {
      const url = new URL(connectionString);
      console.log('🔌 Creating shared PostgreSQL pool:', {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.replace('/', ''),
        max: resolvePoolMax(),
        isPooler: url.hostname.includes('.pooler.'),
      });
    } catch {
      console.log('🔌 Creating shared PostgreSQL pool (unparsed DATABASE_URL)');
    }
  }

  const serverless = isServerlessRuntime();

  const instance = new Pool({
    connectionString,
    max: resolvePoolMax(),
    idleTimeoutMillis: serverless ? SERVERLESS_IDLE_TIMEOUT_MS : CLI_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: 30_000,
    allowExitOnIdle: !serverless,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });

  instance.on('error', (err) => {
    console.error('❌ Unexpected error on idle PostgreSQL client', err);
  });

  return instance;
}

/**
 * Shared singleton pool for the current Node process (all Netlify function bundles).
 */
function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set!');
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const fingerprint = poolFingerprint(connectionString);
  const existing = readSharedPool();

  if (existing && globalThis.__appPgPoolFingerprint === fingerprint) {
    return existing;
  }

  if (existing) {
    void existing.end().catch(() => {
      /* ignore */
    });
    writeSharedPool(undefined);
  }

  const pool = createPoolInstance(connectionString);
  writeSharedPool(pool, fingerprint);
  registerPoolShutdownOnce();
  return pool;
}

function isMaxClientsError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as { code?: string; name?: string })?.code || '';
  const errorString = String(error);
  return (
    errorMessage.includes('MaxClientsInSessionMode') ||
    errorMessage.includes('max clients reached') ||
    errorMessage.includes('EMAXCONNSESSION') ||
    errorCode.includes('MaxClients') ||
    errorString.includes('MaxClientsInSessionMode') ||
    errorString.includes('max clients reached') ||
    errorString.includes('EMAXCONNSESSION')
  );
}

/**
 * Выполняет SQL запрос с retry логикой.
 */
export async function query<T extends Record<string, any> = any>(
  text: string,
  params?: any[],
  retries = 2
): Promise<QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pool.query<T>(text, params);
    } catch (error) {
      const duration = Date.now() - start;
      const isLastAttempt = attempt === retries;

      if (isMaxClientsError(error)) {
        console.error('❌ PostgreSQL session pool exhausted (no retry)', {
          text: text.substring(0, 100),
          duration,
          hint: 'Use a shared pool; avoid creating Pool per request. Check PG_POOL_MAX and Supabase pooler mode.',
        });
        throw error;
      }

      const isConnectionError =
        error instanceof Error &&
        (error.message.includes('timeout') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('Connection terminated') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('getaddrinfo ENOTFOUND'));

      if (isConnectionError && !isLastAttempt) {
        const isConnectionTimeout =
          error instanceof Error &&
          (error.message.includes('connection timeout') ||
            error.message.includes('timeout exceeded when trying to connect') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.toLowerCase().includes('read etimedout'));

        const delay = isConnectionTimeout ? 1000 * (attempt + 1) : 500;
        console.warn(
          `⚠️ Connection error, retrying in ${delay}ms (attempt ${attempt + 1}/${retries + 1})`,
          {
            error: error instanceof Error ? error.message : error,
            duration,
          }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      console.error('❌ Query error', {
        text: text.substring(0, 100),
        duration,
        error: error instanceof Error ? error.message : error,
        attempt,
      });
      throw error;
    }
  }

  throw new Error('Query failed after all retries');
}

/**
 * Borrow a pooled client; always release via {@link withClient} when possible.
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Run a transaction callback with guaranteed client.release().
 */
export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` inside BEGIN/COMMIT (ROLLBACK on error) on a single pooled client.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await commitTransaction(client);
      return result;
    } catch (error) {
      await rollbackTransaction(client);
      throw error;
    }
  });
}

async function commitTransaction(client: PoolClient): Promise<void> {
  await client.query('COMMIT');
}

async function rollbackTransaction(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* connection may already be broken */
  }
}

/**
 * Закрывает shared connection pool.
 */
export async function closePool(): Promise<void> {
  const existing = readSharedPool();
  if (!existing) return;
  writeSharedPool(undefined);
  await existing.end();
}

/** PostgreSQL: relation/table does not exist (migration not applied yet). */
export function isMissingRelationError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === '42P01';
}

/**
 * Минимальный ping БД для health-check (без verbose-логики {@link query}).
 */
export async function pingDatabase(): Promise<{
  ok: boolean;
  error?: string;
  skippedReason?: 'DATABASE_URL_not_set';
}> {
  if (!process.env.DATABASE_URL?.trim()) {
    return { ok: false, skippedReason: 'DATABASE_URL_not_set', error: 'DATABASE_URL is not set' };
  }
  try {
    await getPool().query('SELECT 1');
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database ping failed';
    return { ok: false, error: message };
  }
}

/**
 * Типы для настроек платежей в БД
 */
export interface PaymentSettingsRow {
  id: string;
  user_id: string;
  provider: string;
  shop_id: string | null;
  secret_key_encrypted: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_used_at: Date | null;
}
