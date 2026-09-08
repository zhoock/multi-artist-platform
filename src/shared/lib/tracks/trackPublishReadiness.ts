/**
 * Publish readiness for catalog-visible tracks — shared by dashboard and Netlify publish gate.
 */

import { selectAssetPath, type TrackAssetRecord } from '../audio/assetResolver';
import type { ProcessingStatus } from '../audio/audioAssetPipelineConfig';
import { normalizeStemsVisibility } from '../stems/stemsVisibility';
import { normalizeTrackVisibility } from './trackVisibility';

export type TrackPublishReadinessInput = {
  trackId: string;
  visibility?: string | null;
  stemsVisibility?: string | null;
  processingStatus?: ProcessingStatus | null;
  src?: string | null;
};

/** Same rule as public catalog / album details: hide only when track and stems are both hidden. */
export function isCatalogVisibleTrack(visibility: unknown, stemsVisibility: unknown): boolean {
  const trackVis = normalizeTrackVisibility(visibility);
  if (trackVis !== 'hidden') return true;
  return normalizeStemsVisibility(stemsVisibility) !== 'hidden';
}

export function dedupeTracksByTrackId<T extends TrackPublishReadinessInput>(tracks: T[]): T[] {
  const byId = new Map<string, T>();
  for (const track of tracks) {
    const id = String(track.trackId);
    if (!byId.has(id)) {
      byId.set(id, track);
    }
  }
  return [...byId.values()];
}

/**
 * Legacy albums (pre pipeline): playable when src is set.
 * Pipeline albums: processing_status ready + resolver finds playback stream asset.
 * Client mode: when assets are unavailable, resolved src + ready status is sufficient (dashboard store).
 */
export function isTrackPlayableForPublish(
  track: TrackPublishReadinessInput,
  assets: TrackAssetRecord[] | undefined,
  pipelineAvailable: boolean,
  mode: 'server' | 'client' = 'server'
): boolean {
  if (!pipelineAvailable) {
    return Boolean(String(track.src ?? '').trim());
  }

  const processingStatus = (track.processingStatus ?? 'ready') as ProcessingStatus;
  if (processingStatus !== 'ready') {
    return false;
  }

  const selected = selectAssetPath(assets ?? [], {
    purpose: 'playback',
    processingStatus: 'ready',
    hasPremiumAccess: true,
  });

  if (selected.url?.trim()) {
    return true;
  }

  if (mode === 'client' && Boolean(String(track.src ?? '').trim())) {
    return true;
  }

  return false;
}

export type AlbumTracksPublishEvaluation = {
  /** At least one catalog-visible track and every visible track is playable. */
  ready: boolean;
  visibleTrackCount: number;
  unplayableVisibleTrackCount: number;
};

export function evaluateAlbumTracksPublishReadiness(
  tracks: TrackPublishReadinessInput[],
  assetsByTrackId: Map<string, TrackAssetRecord[]> | undefined,
  pipelineAvailable: boolean,
  mode: 'server' | 'client' = 'server'
): AlbumTracksPublishEvaluation {
  const deduped = dedupeTracksByTrackId(tracks);
  const visible = deduped.filter((track) =>
    isCatalogVisibleTrack(track.visibility, track.stemsVisibility)
  );

  let unplayableVisibleTrackCount = 0;
  for (const track of visible) {
    const assets = assetsByTrackId?.get(String(track.trackId));
    if (!isTrackPlayableForPublish(track, assets, pipelineAvailable, mode)) {
      unplayableVisibleTrackCount += 1;
    }
  }

  return {
    ready: visible.length >= 1 && unplayableVisibleTrackCount === 0,
    visibleTrackCount: visible.length,
    unplayableVisibleTrackCount,
  };
}

export type AlbumPublishTrackBlockKind = 'processing' | 'processingFailed';

/** Classifies why visible tracks block publish (for dashboard hints). */
export function getAlbumTracksPublishBlockKind(
  tracks: TrackPublishReadinessInput[],
  assetsByTrackId: Map<string, TrackAssetRecord[]> | undefined,
  pipelineAvailable: boolean,
  mode: 'server' | 'client' = 'server'
): AlbumPublishTrackBlockKind | null {
  const deduped = dedupeTracksByTrackId(tracks);
  const visible = deduped.filter((track) =>
    isCatalogVisibleTrack(track.visibility, track.stemsVisibility)
  );

  if (visible.length === 0) {
    return null;
  }

  let hasFailed = false;
  let hasInProgress = false;

  for (const track of visible) {
    const assets = assetsByTrackId?.get(String(track.trackId));
    if (isTrackPlayableForPublish(track, assets, pipelineAvailable, mode)) {
      continue;
    }

    if (!pipelineAvailable) {
      hasInProgress = true;
      continue;
    }

    const status = track.processingStatus ?? 'ready';
    if (status === 'failed') {
      hasFailed = true;
    } else {
      hasInProgress = true;
    }
  }

  if (hasFailed) return 'processingFailed';
  if (hasInProgress) return 'processing';
  return null;
}

/** Client-side: pipeline fields present on any track in store payload. */
export function inferPipelineAvailableFromClientTracks(
  tracks: TrackPublishReadinessInput[]
): boolean {
  return tracks.some((track) => track.processingStatus != null);
}
