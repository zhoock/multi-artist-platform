import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function shouldUseSsl(connectionString: string): boolean {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return true;
  const lower = connectionString.toLowerCase();
  if (lower.includes('supabase.com') || lower.includes('supabase.co')) return true;
  if (process.env.NODE_ENV !== 'production') return false;
  try {
    const host = new URL(connectionString).hostname;
    return host !== 'localhost' && host !== '127.0.0.1';
  } catch {
    return true;
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    const serverless = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
    pool = new Pool({
      connectionString,
      max: serverless ? 1 : undefined,
      idleTimeoutMillis: serverless ? 1_000 : undefined,
      allowExitOnIdle: serverless,
      ssl:
        connectionString && shouldUseSsl(connectionString)
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }
  return pool;
}
