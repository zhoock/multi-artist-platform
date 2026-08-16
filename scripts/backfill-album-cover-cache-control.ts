#!/usr/bin/env tsx
/**
 * One-time backfill: set long-lived Cache-Control on committed album cover variants.
 *
 * Scope (strict):
 *   users/{userId}/albums/{base}-{64|128|448|896|1344}.{webp|jpg}
 *
 * Does NOT touch drafts, articles, profile, audio, or non-variant files in albums/.
 * Bytes and object paths are unchanged (download → re-upload same path with upsert).
 *
 * Usage:
 *   npx tsx scripts/backfill-album-cover-cache-control.ts --dry-run
 *   npx tsx scripts/backfill-album-cover-cache-control.ts
 *
 * Requires: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const STORAGE_BUCKET = 'user-media';
/** Supabase prepends `max-age=` — pass numeric value + directives only (see Storage FileOptions). */
const TARGET_CACHE_CONTROL = '31536000, immutable';
const VARIANT_RE = /-(64|128|448|896|1344)\.(webp|jpg)$/i;

/** Metadata values that should be updated (legacy commit / older upload paths). */
const LEGACY_CACHE_VALUES = new Set(['0', 'max-age=0', 'no-cache', '3600', 'max-age=3600']);

function loadEnvFile(relativePath: string) {
  const envPath = join(__dirname, '..', relativePath);
  if (!existsSync(envPath)) return;
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

loadEnvFile('.env');
loadEnvFile('.env.local');

type StorageListItem = {
  name: string;
  id: string | null;
  metadata?: { cacheControl?: string; size?: number } | null;
};

function isCommittedCoverVariant(objectName: string): boolean {
  return VARIANT_RE.test(objectName);
}

function hasTargetCachePolicy(cacheControl: string | null | undefined): boolean {
  if (cacheControl == null) return false;
  const value = String(cacheControl);
  return value.includes('31536000') && value.includes('immutable');
}

function needsBackfill(cacheControl: string | null | undefined): boolean {
  if (hasTargetCachePolicy(cacheControl)) return false;
  if (cacheControl == null) return true;
  if (LEGACY_CACHE_VALUES.has(String(cacheControl))) return true;
  // e.g. max-age=31536000 without immutable (first backfill pass)
  return true;
}

async function listUserIds(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list('users', {
      limit: 1000,
      offset,
    });
    if (error) throw new Error(`list users/: ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      ids.push(item.name);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return ids;
}

async function listAlbumObjects(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<StorageListItem[]> {
  const prefix = `users/${userId}/albums`;
  const objects: StorageListItem[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, {
      limit: 1000,
      offset,
    });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      if (item.id) {
        objects.push(item as StorageListItem);
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return objects;
}

async function backfillOne(
  supabase: ReturnType<typeof createClient>,
  storagePath: string,
  dryRun: boolean
): Promise<'updated' | 'skipped' | 'dry-run'> {
  const { data, error: downloadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(storagePath);

  if (downloadError || !data) {
    throw new Error(`download ${storagePath}: ${downloadError?.message || 'empty body'}`);
  }

  if (dryRun) return 'dry-run';

  const buffer = Buffer.from(await data.arrayBuffer());
  const contentType = storagePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
      cacheControl: TARGET_CACHE_CONTROL,
    });

  if (uploadError) {
    throw new Error(`upload ${storagePath}: ${uploadError.message}`);
  }

  return 'updated';
}

function publicObjectUrl(supabaseUrl: string, storagePath: string): string {
  const base = supabaseUrl.replace(/\/$/, '');
  const encoded = storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${encoded}`;
}

/**
 * Supabase `/object/public` ignores stored cache on HEAD and on Range GETs.
 * Full GET returns the stored Cache-Control (see supabase/storage#1290).
 */
async function verifyCdnCacheControl(
  url: string
): Promise<{ status: number; cacheControl: string | null }> {
  const response = await fetch(url, { method: 'GET' });
  // Discard body — we only need response headers.
  await response.arrayBuffer().catch(() => undefined);
  return {
    status: response.status,
    cacheControl: response.headers.get('cache-control'),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(dryRun ? '🔍 DRY-RUN (no writes)\n' : '🚀 Backfill album cover Cache-Control\n');
  console.log(`   bucket: ${STORAGE_BUCKET}`);
  console.log(`   target cacheControl: ${TARGET_CACHE_CONTROL}\n`);

  const userIds = await listUserIds(supabase);
  const candidates: Array<{
    path: string;
    fromCache: string | null;
    size: number | undefined;
  }> = [];
  let skippedNonVariant = 0;

  for (const userId of userIds) {
    const objects = await listAlbumObjects(supabase, userId);
    for (const obj of objects) {
      const path = `users/${userId}/albums/${obj.name}`;
      if (!isCommittedCoverVariant(obj.name)) {
        skippedNonVariant++;
        if (verbose) console.log(`   skip (non-variant): ${path}`);
        continue;
      }
      const fromCache = obj.metadata?.cacheControl ?? null;
      if (!needsBackfill(fromCache)) {
        if (verbose) console.log(`   skip (already ok): ${path} (${fromCache})`);
        continue;
      }
      candidates.push({ path, fromCache, size: obj.metadata?.size });
    }
  }

  console.log(`Users scanned:           ${userIds.length}`);
  console.log(`Skipped non-variant:     ${skippedNonVariant}`);
  console.log(`Candidates to update:    ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log('✅ Nothing to update.');
    return;
  }

  const byLegacy = new Map<string, number>();
  for (const c of candidates) {
    const key = c.fromCache ?? '(null)';
    byLegacy.set(key, (byLegacy.get(key) || 0) + 1);
  }
  console.log('By current cacheControl metadata:');
  for (const [key, count] of [...byLegacy.entries()].sort()) {
    console.log(`   ${key}: ${count}`);
  }
  console.log('');

  const sampleCount = Math.min(8, candidates.length);
  console.log(`Sample paths (${sampleCount}):`);
  for (const c of candidates.slice(0, sampleCount)) {
    console.log(`   ${c.path}`);
    console.log(`      ${c.fromCache ?? '(null)'} → ${TARGET_CACHE_CONTROL}`);
  }
  if (candidates.length > sampleCount) {
    console.log(`   … and ${candidates.length - sampleCount} more`);
  }
  console.log('');

  if (dryRun) {
    console.log(`✅ Dry-run complete. Would update ${candidates.length} file(s).`);
    console.log('   Run without --dry-run to apply.');
    return;
  }

  let updated = 0;
  let failed = 0;
  for (const c of candidates) {
    try {
      const result = await backfillOne(supabase, c.path, false);
      if (result === 'updated') {
        updated++;
        if (verbose) console.log(`   ✓ ${c.path}`);
      }
    } catch (err) {
      failed++;
      console.error(`   ✗ ${c.path}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n✅ Updated: ${updated}`);
  if (failed > 0) console.log(`❌ Failed:  ${failed}`);

  const verifyPaths = candidates.slice(0, 3).map((c) => c.path);
  console.log('\n🔎 HTTP verify (GET full object, public CDN):\n');
  for (const path of verifyPaths) {
    const url = publicObjectUrl(supabaseUrl, path);
    const { status, cacheControl } = await verifyCdnCacheControl(url);
    const ok =
      status === 200 &&
      cacheControl != null &&
      cacheControl.includes('31536000') &&
      cacheControl.includes('immutable');
    console.log(`   ${ok ? '✓' : '✗'} ${path}`);
    console.log(`      status: ${status}`);
    console.log(`      cache-control: ${cacheControl ?? '(missing)'}`);
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
