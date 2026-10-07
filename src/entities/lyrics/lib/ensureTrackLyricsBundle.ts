import type { AppDispatch, RootState } from '@shared/model/appStore/types';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';

import { artistPlayTrace } from '@features/universe/lib/artistPlayTrace';
import { TrackLyricsUnavailableError } from '../api/trackLyricsApi';
import { fetchTrackLyricsBundle } from '../api/trackLyricsApi';
import { dispatchTrackLyricsBundle } from './dispatchTrackLyricsBundle';
import { hasNonEmptyTrackLyricsEntity, resolveTrackLyricsBundle } from './selectors';

const inflight = new Map<string, Promise<void>>();

export function trackLyricsInflightKey(
  artistSlug: string | null | undefined,
  albumId: string,
  trackId: string | number,
  lang: string
): string {
  const id = normalizeTrackIdString(String(trackId)) || String(trackId);
  return `${artistSlug ?? ''}|${albumId}|${id}|${lang}`;
}

export function resetTrackLyricsInflightForTests(): void {
  inflight.clear();
}

export type EnsureTrackLyricsInput = {
  albumId: string;
  trackId: string | number;
  lang: string;
  artistSlug?: string | null;
  /** When false, 404/empty bundles are not written (background prefetch). */
  persistEmpty?: boolean;
};

/**
 * Idempotent track-lyrics load into `trackLyricsSlice` (shared by Full Player and background prefetch).
 */
export async function ensureTrackLyricsBundle(
  dispatch: AppDispatch,
  getState: () => RootState,
  input: EnsureTrackLyricsInput
): Promise<void> {
  const albumId = input.albumId.trim();
  const trackId = normalizeTrackIdString(String(input.trackId)) || String(input.trackId);
  if (!albumId || !trackId) {
    return;
  }

  if (hasNonEmptyTrackLyricsEntity(getState(), albumId, trackId)) {
    artistPlayTrace('lyrics.ensure.skip', {
      reason: 'non-empty-stored',
      albumId,
      trackId,
      lang: input.lang,
    });
    return;
  }

  const artistSlug =
    input.artistSlug?.trim() || getState().player.albumMeta?.publicSlug?.trim() || null;
  const lang = input.lang;
  const key = trackLyricsInflightKey(artistSlug, albumId, trackId, lang);

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        artistPlayTrace('lyrics.request.start', { albumId, trackId, lang, artistSlug });
        const t0 = performance.now();
        const bundle = await fetchTrackLyricsBundle(albumId, trackId, lang, {
          artistSlug,
          tolerateMissing: true,
        });
        artistPlayTrace('lyrics.request.done', {
          albumId,
          trackId,
          ms: Math.round(performance.now() - t0),
          httpStatus: 200,
          hasData: true,
          state: bundle.state,
          contentLength: bundle.content?.length ?? 0,
          bundleAlbumId: bundle.albumId,
          bundleTrackId: bundle.trackId,
          bundleLang: bundle.lang,
          requestLang: lang,
        });

        if (bundle.state === 'empty' && input.persistEmpty === false) {
          artistPlayTrace('lyrics.store.skip', {
            reason: 'empty-not-persisted-background',
            albumId,
            trackId,
          });
          return;
        }

        const existing = resolveTrackLyricsBundle(getState(), albumId, trackId, null);
        if (existing.state !== 'empty' && bundle.state === 'empty') {
          artistPlayTrace('lyrics.store.skip', {
            reason: 'keep-existing-non-empty',
            albumId,
            trackId,
          });
          return;
        }

        artistPlayTrace('lyrics.bundle.received', {
          albumId: bundle.albumId,
          trackId: bundle.trackId,
          lang: bundle.lang,
          state: bundle.state,
          contentLength: bundle.content?.length ?? 0,
        });
        const writtenKeys = dispatchTrackLyricsBundle(dispatch, bundle, lang);
        artistPlayTrace('lyrics.store.updated', {
          writtenKeys,
          readLookupAlbumId: albumId,
          readLookupTrackId: trackId,
        });
      } catch (error) {
        artistPlayTrace('lyrics.request.error', {
          albumId,
          trackId,
          lang,
          artistSlug,
          name: error instanceof Error ? error.name : 'unknown',
          message: error instanceof Error ? error.message : String(error),
          withheld: error instanceof TrackLyricsUnavailableError,
        });
      }
    })().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, pending);
  }

  await pending;
}
