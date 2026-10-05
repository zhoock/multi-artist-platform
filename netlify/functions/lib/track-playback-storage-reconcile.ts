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
import {
  extractStoragePathFromTrackRef,
  normalizeStoragePath,
} from '../../../src/shared/lib/tracks/storagePathReference';
import { query } from './db';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './supabase';

declare global {
  // eslint-disable-next-line no-var
  var __playbackStorageVerifyInflight: Map<string, Promise<boolean | null>> | undefined;
}

function inflightMap(): Map<string, Promise<boolean | null>> {
  if (!globalThis.__playbackStorageVerifyInflight) {
    globalThis.__playbackStorageVerifyInflight = new Map();
  }
  return globalThis.__playbackStorageVerifyInflight;
}

export function isSupabaseStorageObjectMissingMessage(message: string | undefined | null): boolean {
  const lower = message?.toLowerCase() ?? '';
  return lower.includes('not found') || lower.includes('object not found');
}

function storageErrorHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const rec = error as Record<string, unknown>;
  if (typeof rec.statusCode === 'number') return rec.statusCode;
  const original = rec.originalError;
  if (original && typeof original === 'object' && 'status' in original) {
    const status = (original as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

/** Matches real Supabase Storage responses for absent objects (download + signed URL). */
export function isStorageErrorIndicatingMissing(error: unknown): boolean {
  if (!error) return false;
  if (typeof error !== 'object') return false;
  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string' && isSupabaseStorageObjectMissingMessage(message)) {
    return true;
  }
  const status = storageErrorHttpStatus(error);
  return status === 400 || status === 404;
}

function buildPublicStorageObjectUrl(bucketRelativePath: string): string | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(
    /\/$/,
    ''
  );
  if (!supabaseUrl) return null;
  const path = normalizeStoragePath(bucketRelativePath);
  if (!path) return null;
  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET_NAME}/${path}`;
}

function resolveBucketPathForVerify(storagePath: string, userId?: string): string {
  const trimmed = storagePath.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const extracted = extractStoragePathFromTrackRef(trimmed, userId ?? '');
    if (extracted) return normalizeStoragePath(extracted);
  }
  return normalizeStoragePath(trimmed);
}

async function verifyViaPublicHead(bucketRelativePath: string): Promise<boolean | null> {
  const url = buildPublicStorageObjectUrl(bucketRelativePath);
  if (!url) return null;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) return true;
    if (response.status === 400 || response.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

async function verifyViaAdminDownload(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  bucketRelativePath: string
): Promise<boolean | null> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .download(bucketRelativePath);

  if (!error && data) {
    return true;
  }
  if (error && isStorageErrorIndicatingMissing(error)) {
    return false;
  }
  return null;
}

export function resetPlaybackStorageVerifyCacheForTests(): void {
  globalThis.__playbackStorageVerifyInflight = new Map();
}

export async function verifyPlaybackStoragePathExists(
  storagePath: string,
  options?: { userId?: string }
): Promise<boolean | null> {
  const normalized = resolveBucketPathForVerify(storagePath, options?.userId);
  if (!normalized) return null;

  const inflight = inflightMap();
  const existing = inflight.get(normalized);
  if (existing) return existing;

  const promise = (async () => {
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      const adminResult = await verifyViaAdminDownload(supabase, normalized);
      if (adminResult === true) {
        return true;
      }
      if (adminResult === false) {
        return false;
      }
    }

    const publicResult = await verifyViaPublicHead(normalized);
    if (publicResult === true) {
      return true;
    }
    if (publicResult === false) {
      return false;
    }

    if (!supabase) {
      console.warn(
        '[track-playback-storage-reconcile] Storage verify skipped: no admin client and public HEAD inconclusive'
      );
    } else {
      console.warn('[track-playback-storage-reconcile] Storage verify inconclusive for path');
    }
    return null;
  })().finally(() => {
    inflight.delete(normalized);
  });

  inflight.set(normalized, promise);
  return promise;
}

export type MarkPlaybackStorageMissingResult = {
  assetsFailed: number;
  tracksFailed: number;
};

/**
 * Single statement: the stream asset and its track rows fail together, so
 * `track_assets = failed` + `tracks = ready` cannot be left behind.
 * Tracks are only failed through primary stream rows whose path is still `storagePath`
 * (re-checked under row lock), so a stale reconcile for path A cannot fail a track
 * whose current playback asset is path B.
 * Also heals rows already split as failed asset (same path) + ready track.
 * Scoped to all locale rows for (userId, albumSlug, trackId).
 */
export async function markPlaybackStorageMissingForAlbumTrack(
  userId: string,
  albumSlug: string,
  logicalTrackId: string,
  storagePath: string
): Promise<MarkPlaybackStorageMissingResult> {
  const path = normalizeStoragePath(storagePath);
  const errorMessage = PLAYBACK_STORAGE_MISSING_ERROR.slice(0, 4000);

  const result = await query<{ assets_failed: number; tracks_failed: number }>(
    `WITH target_tracks AS (
       SELECT t.id
       FROM tracks t
       INNER JOIN albums a ON a.id = t.album_id
       WHERE a.user_id = $1::uuid
         AND a.album_id = $2
         AND t.track_id = $3
     ),
     failed_assets AS (
       UPDATE track_assets ta
       SET status = 'failed',
           error = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE ta.track_id IN (SELECT id FROM target_tracks)
         AND ta.type = 'stream'
         AND ta.format = 'opus'
         AND ta.variant = '128k'
         AND ta.status = 'ready'
         AND ta.path IS NOT DISTINCT FROM $5
       RETURNING ta.track_id
     ),
     already_failed_assets AS (
       SELECT ta.track_id
       FROM track_assets ta
       WHERE ta.track_id IN (SELECT id FROM target_tracks)
         AND ta.type = 'stream'
         AND ta.format = 'opus'
         AND ta.variant = '128k'
         AND ta.status = 'failed'
         AND ta.path IS NOT DISTINCT FROM $5
       FOR UPDATE
     ),
     failed_tracks AS (
       UPDATE tracks t
       SET processing_status = 'failed',
           processing_error = $4,
           src = '',
           updated_at = CURRENT_TIMESTAMP
       WHERE t.processing_status = 'ready'
         AND t.id IN (
           SELECT track_id FROM failed_assets
           UNION
           SELECT track_id FROM already_failed_assets
         )
       RETURNING t.id
     )
     SELECT
       (SELECT COUNT(*) FROM failed_assets)::int AS assets_failed,
       (SELECT COUNT(*) FROM failed_tracks)::int AS tracks_failed`,
    [userId, albumSlug, logicalTrackId, errorMessage, path]
  );

  const row = result.rows[0];
  return {
    assetsFailed: Number(row?.assets_failed ?? 0),
    tracksFailed: Number(row?.tracks_failed ?? 0),
  };
}

function findPrimaryStreamAsset(assets: TrackAssetRecord[]): TrackAssetRecord | undefined {
  return assets.find((a) => a.type === 'stream' && a.format === 'opus' && a.variant === '128k');
}

/**
 * Playback path to verify for a `ready` track: the selected ready stream, or — when the
 * primary stream is already `failed` while the track still says `ready` — that asset's path.
 */
function resolvePlaybackPathToVerify(assets: TrackAssetRecord[]): string | null {
  const selected = selectAssetPath(assets, {
    purpose: 'playback',
    processingStatus: 'ready',
    hasPremiumAccess: true,
  });
  const selectedPath = selected.url?.trim();
  if (selectedPath) return selectedPath;

  const primary = findPrimaryStreamAsset(assets);
  const failedPath = primary?.status === 'failed' ? primary.path?.trim() : '';
  return failedPath || null;
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

  const storagePath = resolvePlaybackPathToVerify(input.assets);
  if (!storagePath) {
    return { processingStatus: input.processingStatus, assets: input.assets, reconciled: false };
  }

  const exists = await verifyPlaybackStoragePathExists(storagePath, { userId: input.userId });
  if (exists === null || exists === true) {
    return { processingStatus: input.processingStatus, assets: input.assets, reconciled: false };
  }

  const marked = await markPlaybackStorageMissingForAlbumTrack(
    input.userId,
    input.albumSlug,
    input.logicalTrackId,
    storagePath
  );
  if (marked.tracksFailed === 0) {
    return { processingStatus: input.processingStatus, assets: input.assets, reconciled: false };
  }

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
