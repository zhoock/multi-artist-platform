import type { AlbumEditable } from '@models';

import { isAlbumDraft } from './albumPublication';
import {
  evaluateAlbumTracksPublishReadiness,
  getAlbumTracksPublishBlockKind,
  inferPipelineAvailableFromClientTracks,
  type TrackPublishReadinessInput,
} from '@shared/lib/tracks/trackPublishReadiness';

function releaseString(release: Record<string, unknown>, key: string): string {
  const value = release?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function releaseGenreCodes(release: Record<string, unknown>): string[] {
  const raw = release?.genreCodes;
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

export function resolveAlbumCoverKey(cover: AlbumEditable['cover']): string {
  if (typeof cover === 'string') return cover.trim();
  if (cover && typeof cover === 'object' && 'img' in cover) {
    return String((cover as { img?: string }).img ?? '').trim();
  }
  return '';
}

export { isAlbumDraft } from './albumPublication';

function albumTracksForPublishCheck(album: AlbumEditable): TrackPublishReadinessInput[] {
  return (album.tracks ?? []).map((track) => ({
    trackId: String(track.id),
    visibility: track.visibility,
    stemsVisibility: track.stemsVisibility,
    processingStatus: (
      track as { processingStatus?: TrackPublishReadinessInput['processingStatus'] }
    ).processingStatus,
    src: track.src,
  }));
}

function isAlbumMetadataReadyToPublish(album: AlbumEditable): boolean {
  if (!isAlbumDraft(album)) return false;
  if (!album.album?.trim()) return false;
  if (!resolveAlbumCoverKey(album.cover)) return false;
  if (!album.description?.trim()) return false;

  const release = (album.release ?? {}) as Record<string, unknown>;
  if (!releaseString(release, 'date')) return false;
  if (!releaseString(release, 'UPC')) return false;
  if (releaseGenreCodes(release).length === 0) return false;

  return true;
}

/** Черновик можно опубликовать: метаданные + все catalog-visible треки playable. */
export function isAlbumReadyToPublish(album: AlbumEditable): boolean {
  if (!isAlbumMetadataReadyToPublish(album)) return false;

  const tracks = albumTracksForPublishCheck(album);
  const pipelineAvailable = inferPipelineAvailableFromClientTracks(tracks);

  return evaluateAlbumTracksPublishReadiness(tracks, undefined, pipelineAvailable, 'client').ready;
}

export type AlbumPublishHintKey =
  | 'ready'
  | 'cover'
  | 'tracks'
  | 'fields'
  | 'processing'
  | 'processingFailed';

/** Какой hint показать у кнопки Publish в дашборде. */
export function getAlbumPublishHintKey(album: AlbumEditable): AlbumPublishHintKey {
  if (!isAlbumDraft(album)) return 'ready';
  if (!resolveAlbumCoverKey(album.cover)) return 'cover';
  if ((album.tracks?.length ?? 0) < 1) return 'tracks';

  const tracks = albumTracksForPublishCheck(album);
  const pipelineAvailable = inferPipelineAvailableFromClientTracks(tracks);
  const trackEvaluation = evaluateAlbumTracksPublishReadiness(
    tracks,
    undefined,
    pipelineAvailable,
    'client'
  );

  if (trackEvaluation.visibleTrackCount < 1) {
    return 'tracks';
  }

  if (!trackEvaluation.ready) {
    const blockKind = getAlbumTracksPublishBlockKind(
      tracks,
      undefined,
      pipelineAvailable,
      'client'
    );
    if (blockKind === 'processingFailed') return 'processingFailed';
    return 'processing';
  }

  if (!isAlbumMetadataReadyToPublish(album)) return 'fields';
  return 'ready';
}
