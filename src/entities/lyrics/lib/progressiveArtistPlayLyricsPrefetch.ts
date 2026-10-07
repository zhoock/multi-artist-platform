import type { AppDispatch, RootState } from '@shared/model/appStore/types';
import type { SupportedLang } from '@shared/model/lang';
import type { AlbumDetails } from '@entities/album/model/albumDetails';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';

import { artistPlayTrace } from '@features/universe/lib/artistPlayTrace';

import { ensureTrackLyricsBundle } from './ensureTrackLyricsBundle';

export type ScheduleProgressiveLyricsInput = {
  dispatch: AppDispatch;
  getState: () => RootState;
  lang: SupportedLang;
  artistSlug: string;
  firstAlbum: AlbumDetails;
  currentTrackId: string;
};

/**
 * After artist Play starts: hydrate lyrics in background (current track first, then rest of album).
 * Does not block `requestPlay`.
 */
export function scheduleProgressiveLyricsAfterArtistPlayStart(
  input: ScheduleProgressiveLyricsInput
): void {
  artistPlayTrace('lyrics.prefetch.start', {
    albumId: input.firstAlbum.albumId,
    currentTrackId: input.currentTrackId,
    artistSlug: input.artistSlug,
    lang: input.lang,
  });

  const run = () => {
    void prefetchFirstAlbumLyricsProgressive(input);
  };

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run);
  } else {
    setTimeout(run, 0);
  }
}

async function prefetchFirstAlbumLyricsProgressive(
  input: ScheduleProgressiveLyricsInput
): Promise<void> {
  const albumId = input.firstAlbum.albumId?.trim();
  if (!albumId) {
    return;
  }

  const artistSlug = input.artistSlug.trim();
  const currentId =
    normalizeTrackIdString(input.currentTrackId) || String(input.currentTrackId).trim();

  await ensureTrackLyricsBundle(input.dispatch, input.getState, {
    albumId,
    trackId: currentId,
    lang: input.lang,
    artistSlug,
    persistEmpty: false,
  });

  for (const track of input.firstAlbum.tracks) {
    const logicalId = normalizeTrackIdString(String(track.id)) || String(track.id);
    if (logicalId === currentId) {
      continue;
    }
    void ensureTrackLyricsBundle(input.dispatch, input.getState, {
      albumId,
      trackId: logicalId,
      lang: input.lang,
      artistSlug,
      persistEmpty: false,
    });
  }
}
