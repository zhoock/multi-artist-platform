import type { SyncedLyricsLine } from '@models';
import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
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

export async function fetchTrackLyricsBundle(
  albumId: string,
  trackId: string | number,
  lang: string
): Promise<TrackLyricsBundle> {
  const params = new URLSearchParams({
    albumId,
    trackId: String(trackId),
    lang,
    _ts: String(Date.now()),
  });
  const response = await fetchWithAuthSession(`/api/track-lyrics?${params.toString()}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-store, no-cache, max-age=0, must-revalidate',
      Pragma: 'no-cache',
      ...getAuthHeader(),
    },
  });
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
