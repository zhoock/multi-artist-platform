import type { SyncedLyricsLine } from '@models';
import { createEmptyTrackLyricsBundle } from '../lib/selectors';
import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import {
  resolvePublicArtistSlugForApi,
  shouldSkipUnauthenticatedPublicArtistApi,
} from '@shared/lib/publicArtistContext';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';

type ApiResult = {
  success: boolean;
  data?: TrackLyricsBundle;
  message?: string;
  error?: string;
};

async function parseBundleResponse(response: Response): Promise<TrackLyricsBundle> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as ApiResult;
      message = err.message || err.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const result = (await response.json()) as ApiResult;
  if (!result.success || !result.data) {
    throw new Error(result.message || result.error || 'Invalid track lyrics response');
  }
  return result.data;
}

export class TrackLyricsUnavailableError extends Error {
  constructor() {
    super('Track lyrics are not available for this viewer');
    this.name = 'TrackLyricsUnavailableError';
  }
}

export type FetchTrackLyricsOptions = {
  artistSlug?: string | null;
  /**
   * Player read path: 404 → empty bundle (lyrics confirmed absent).
   * `{ success: true }` without `data` is access withheld — throws, does not invent empty.
   */
  tolerateMissing?: boolean;
};

export async function fetchTrackLyricsBundle(
  albumId: string,
  trackId: string | number,
  lang: string,
  options?: FetchTrackLyricsOptions
): Promise<TrackLyricsBundle> {
  const artistSlug = await resolvePublicArtistSlugForApi(options?.artistSlug);
  if (await shouldSkipUnauthenticatedPublicArtistApi(artistSlug)) {
    throw new Error('Missing public artist context for track lyrics');
  }

  const params = new URLSearchParams({
    albumId,
    trackId: String(trackId),
    lang,
    _ts: String(Date.now()),
  });
  if (artistSlug) {
    params.set('artist', artistSlug);
  }

  const response = await fetchWithAuthSession(`/api/track-lyrics?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      Pragma: 'no-cache',
      ...getAuthHeader(),
    },
  });

  if (options?.tolerateMissing) {
    if (response.status === 404) {
      return createEmptyTrackLyricsBundle(albumId, trackId, lang);
    }
    if (response.ok) {
      const result = (await response.json()) as ApiResult;
      if (result.success && result.data) {
        return result.data;
      }
      if (result.success && !result.data) {
        throw new TrackLyricsUnavailableError();
      }
    }
  }

  return parseBundleResponse(response);
}

export async function saveTrackLyricsContentApi(input: {
  albumId: string;
  trackId: string | number;
  lang: 'en' | 'ru';
  content: string;
  authorship?: string;
  trackTitle?: string;
}): Promise<TrackLyricsBundle> {
  const params = new URLSearchParams({
    type: 'content',
    albumId: input.albumId,
    trackId: String(input.trackId),
    lang: input.lang,
    _ts: String(Date.now()),
  });
  const response = await fetchWithAuthSession(`/api/track-lyrics?${params.toString()}`, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...getAuthHeader(),
    },
    body: JSON.stringify({
      albumId: input.albumId,
      trackId: input.trackId,
      lang: input.lang,
      translations: { [input.lang]: { content: input.content, authorship: input.authorship } },
      trackTitle: input.trackTitle,
    }),
  });
  return parseBundleResponse(response);
}

export async function saveTrackLyricsSyncApi(input: {
  albumId: string;
  trackId: string | number;
  lang: string;
  syncedLyrics: SyncedLyricsLine[];
  authorship?: string;
}): Promise<TrackLyricsBundle> {
  const params = new URLSearchParams({
    type: 'sync',
    albumId: input.albumId,
    trackId: String(input.trackId),
    lang: input.lang,
    _ts: String(Date.now()),
  });
  const response = await fetchWithAuthSession(`/api/track-lyrics?${params.toString()}`, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...getAuthHeader(),
    },
    body: JSON.stringify({
      albumId: input.albumId,
      trackId: input.trackId,
      lang: input.lang,
      syncedLyrics: input.syncedLyrics,
      authorship: input.authorship,
    }),
  });
  return parseBundleResponse(response);
}

export async function deleteTrackLyricsSyncApi(
  albumId: string,
  trackId: string | number
): Promise<TrackLyricsBundle> {
  const params = new URLSearchParams({
    albumId,
    trackId: String(trackId),
    _ts: String(Date.now()),
  });
  const response = await fetchWithAuthSession(`/api/track-lyrics?${params.toString()}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-store',
      ...getAuthHeader(),
    },
  });
  return parseBundleResponse(response);
}
