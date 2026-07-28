import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function loadReferencedAudioStoragePaths(): Promise<Set<string>> {
  const pool = getPool();
  const referenced = new Set<string>();

  const masters = await pool.query<{ master_path: string | null }>(
    `SELECT master_path FROM tracks WHERE master_path IS NOT NULL AND trim(master_path) <> ''`
  );
  for (const row of masters.rows) {
    if (row.master_path?.trim()) {
      referenced.add(row.master_path.replace(/^\/+/, '').trim());
    }
  }

  const assets = await pool.query<{ path: string | null }>(
    `SELECT path FROM track_assets WHERE path IS NOT NULL AND trim(path) <> ''`
  );
  for (const row of assets.rows) {
    if (row.path?.trim()) {
      referenced.add(row.path.replace(/^\/+/, '').trim());
    }
  }

  return referenced;
}
