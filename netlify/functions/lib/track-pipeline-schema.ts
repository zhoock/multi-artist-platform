/**
 * Graceful detection of Audio Asset Pipeline schema (migration 064).
 */

import { query } from './db';

let cachedHasPipeline: boolean | null = null;
let cachedHasTrackAssetsTable: boolean | null = null;

export async function tracksTableHasPipelineColumns(): Promise<boolean> {
  if (cachedHasPipeline !== null) return cachedHasPipeline;
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tracks'
          AND column_name = 'master_path'
      ) AS exists`
    );
    cachedHasPipeline = Boolean(r.rows[0]?.exists);
  } catch {
    cachedHasPipeline = false;
  }
  return cachedHasPipeline;
}

export async function trackAssetsTableExists(): Promise<boolean> {
  if (cachedHasTrackAssetsTable !== null) return cachedHasTrackAssetsTable;
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'track_assets'
      ) AS exists`
    );
    cachedHasTrackAssetsTable = Boolean(r.rows[0]?.exists);
  } catch {
    cachedHasTrackAssetsTable = false;
  }
  return cachedHasTrackAssetsTable;
}
