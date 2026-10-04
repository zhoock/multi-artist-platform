/**
 * Detect missing required playback Storage objects and persist failed state on tracks / track_assets.
 * Uses createSupabaseAdminClient from lib/supabase (no duplicate Storage client).
 */

import {
  selectAssetPath,
  type TrackAssetRecord,
} from '../../../src/shared/lib/audio/assetResolver';
import type { ProcessingStatus } from '../../../src/shared/lib/audio/audioAssetPipelineConfig';
import { PLAYBACK_STORAGE_MISSING_ERROR } from '../../../src/shared/lib/tracks/playbackStorageMissing';
import { normalizeStoragePath } from '../../../src/shared/lib/tracks/storagePathReference';
import { query } from './db';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './supabase';

const VERIFY_OK_TTL_MS = 5 * 60 * 1000;

type VerifyCacheEntry = { present: boolean; checkedAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __playbackStorageVerifyCache: Map<string, VerifyCacheEntry> | undefined;
  // eslint-disable-next-line no-var
  var __playbackStorageVerifyInflight: Map<string, Promise<boolean>> | undefined;
}

function verifyCache(): Map<string, VerifyCacheEntry> {
  if (!globalThis.__playbackStorageVerifyCache) {
    globalThis.__playbackStorageVerifyCache = new Map();
  }
  return globalThis.__playbackStorageVerifyCache;
}

function inflightMap(): Map<string, Promise<boolean>> {
  if (!globalThis.__playbackStorageVerifyInflight) {
    globalThis.__playbackStorageVerifyInflight = new Map();
  }
  return globalThis.__playbackStorageVerifyInflight;
}

export function isSupabaseStorageObjectMissingMessage(message: string | undefined | null): boolean {
  const lower = message?.toLowerCase() ?? '';
  return lower.includes('not found') || lower.includes('object not found');
}

export function resetPlaybackStorageVerifyCacheForTests(): void {
  globalThis.__playbackStorageVerifyCache = new Map();
  globalThis.__playbackStorageVerifyInflight = new Map();
}

export async function verifyPlaybackStoragePathExists(
  storagePath: string
): Promise<boolean | null> {
  const normalized = normalizeStoragePath(storagePath);
  if (!normalized) return null;

  const cache = verifyCache();
  const cached = cache.get(normalized);
  if (cached?.present === true && Date.now() - cached.checkedAt < VERIFY_OK_TTL_MS) {
    return true;
  }

  const inflight = inflightMap();
  const existing = inflight.get(normalized);
  if (existing) return existing;

  const promise = (async () => {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      return null;
    }

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .createSignedUrl(normalized, 60);

    if (!error) {
      cache.set(normalized, { present: true, checkedAt: Date.now() });
      return true;
    }

    if (isSupabaseStorageObjectMissingMessage(error.message)) {
      return false;
    }

    console.warn('[track-playback-storage-reconcile] Storage verify inconclusive:', error.message);
    return null;
  })().finally(() => {
    inflight.delete(normalized);
  });

  inflight.set(normalized, promise);
  return promise;
}

/**
 * Idempotent: only updates rows still `ready` with matching playback path.
 * Scoped to all locale rows for (userId, albumSlug, trackId).
 */
export async function markPlaybackStorageMissingForAlbumTrack(
  userId: string,
  albumSlug: string,
  logicalTrackId: string,
  storagePath: string
): Promise<boolean> {
  const path = normalizeStoragePath(storagePath);
  const errorMessage = PLAYBACK_STORAGE_MISSING_ERROR.slice(0, 4000);

  const assetResult = await query(
    `UPDATE track_assets ta
     SET status = 'failed',
         error = $4,
         updated_at = CURRENT_TIMESTAMP
     FROM tracks t
     INNER JOIN albums a ON a.id = t.album_id
     WHERE ta.track_id = t.id
       AND a.user_id = $1::uuid
       AND a.album_id = $2
       AND t.track_id = $3
       AND ta.type = 'stream'
       AND ta.format = 'opus'
       AND ta.variant = '128k'
       AND ta.status = 'ready'
       AND ta.path IS NOT DISTINCT FROM $5`,
    [userId, albumSlug, logicalTrackId, errorMessage, path]
  );

  const trackResult = await query(
    `UPDATE tracks t
     SET processing_status = 'failed',
         processing_error = $4,
         src = '',
         updated_at = CURRENT_TIMESTAMP
     FROM albums a
     WHERE t.album_id = a.id
       AND a.user_id = $1::uuid
       AND a.album_id = $2
       AND t.track_id = $3
       AND t.processing_status = 'ready'
       AND EXISTS (
         SELECT 1
         FROM track_assets ta
         WHERE ta.track_id = t.id
           AND ta.type = 'stream'
           AND ta.format = 'opus'
           AND ta.variant = '128k'
           AND ta.status = 'ready'
           AND ta.path IS NOT DISTINCT FROM $5
       )`,
    [userId, albumSlug, logicalTrackId, errorMessage, path]
  );

  return (assetResult.rowCount ?? 0) > 0 || (trackResult.rowCount ?? 0) > 0;
}

export type ReconcilePlaybackTrackInput = {
  userId: string;
  albumSlug: string;
  logicalTrackId: string;
  processingStatus: ProcessingStatus | null | undefined;
  assets: TrackAssetRecord[];
};

export type ReconcilePlaybackTrackResult = {
  processingStatus: ProcessingStatus | null | undefined;
  assets: TrackAssetRecord[];
  reconciled: boolean;
};

export async function reconcileReadyPlaybackStorageIfMissing(
  input: ReconcilePlaybackTrackInput
): Promise<ReconcilePlaybackTrackResult> {
  const status = (input.processingStatus ?? 'ready') as ProcessingStatus;
  if (status !== 'ready') {
    return { processingStatus: input.processingStatus, assets: input.assets, reconciled: false };
  }

  const selected = selectAssetPath(input.assets, {
    purpose: 'playback',
    processingStatus: 'ready',
    hasPremiumAccess: true,
  });
  const storagePath = selected.url?.trim();
  if (!storagePath) {
    return { processingStatus: input.processingStatus, assets: input.assets, reconciled: false };
  }

  const exists = await verifyPlaybackStoragePathExists(storagePath);
  if (exists === null || exists === true) {
    return { processingStatus: input.processingStatus, assets: input.assets, reconciled: false };
  }

  await markPlaybackStorageMissingForAlbumTrack(
    input.userId,
    input.albumSlug,
    input.logicalTrackId,
    storagePath
  );

  const errorMessage = PLAYBACK_STORAGE_MISSING_ERROR;
  const assets = input.assets.map((asset) => {
    if (
      asset.type === 'stream' &&
      asset.format === 'opus' &&
      asset.variant === '128k' &&
      normalizeStoragePath(asset.path ?? '') === normalizeStoragePath(storagePath)
    ) {
      return { ...asset, status: 'failed', path: asset.path };
    }
    return asset;
  });

  return {
    processingStatus: 'failed',
    assets,
    reconciled: true,
  };
}

export async function reconcileAlbumPlaybackStorageBatch(
  userId: string,
  albumSlug: string,
  tracks: Array<{
    logicalTrackId: string;
    processingStatus: ProcessingStatus | null | undefined;
  }>,
  assetsByTrackId: Map<string, TrackAssetRecord[]>
): Promise<{ assetsByTrackId: Map<string, TrackAssetRecord[]>; failedTrackIds: Set<string> }> {
  const next = new Map(assetsByTrackId);
  const failedTrackIds = new Set<string>();
  const seen = new Set<string>();

  for (const track of tracks) {
    const logicalTrackId = track.logicalTrackId;
    if (seen.has(logicalTrackId)) continue;
    seen.add(logicalTrackId);

    const assets = next.get(logicalTrackId) ?? [];
    const result = await reconcileReadyPlaybackStorageIfMissing({
      userId,
      albumSlug,
      logicalTrackId,
      processingStatus: track.processingStatus,
      assets,
    });

    if (result.reconciled) {
      next.set(logicalTrackId, result.assets);
      failedTrackIds.add(logicalTrackId);
    }
  }

  return { assetsByTrackId: next, failedTrackIds };
}
