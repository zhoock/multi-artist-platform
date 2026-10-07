/**
 * Progressive Play Artist: bootstrap playback, then append tail albums in background.
 */

import type { AppDispatch } from '@shared/model/appStore/types';
import { getStore } from '@shared/model/appStore';
import type { SupportedLang } from '@shared/model/lang';
import { playerActions } from '@features/player';
import { fallbackAlbumClientId } from '@shared/lib/albumClientId';
import {
  fetchPublicProfileForDisplay,
  formatAlbumDisplayFullName,
  readStoredProfileDisplayName,
  siteArtistUiLabel,
} from '@shared/lib/profileDisplayName';
import { getPublicArtistDisplayName } from '@shared/lib/publicArtistsCache';
import { resolveFirstPlayableIndex } from '@shared/lib/tracks/trackPlayback';
import {
  fetchUniverseArtistPlayQueueBootstrap,
  fetchUniverseArtistPlayQueueTail,
} from './fetchUniverseArtistPlayQueue';
import {
  artistPlayTrace,
  artistPlayTraceStart,
  installArtistPlayTraceReport,
} from './artistPlayTrace';
/** Defer tail append so remaining album-detail fetches do not compete with first-track audio. */
const ARTIST_PLAY_TAIL_DEFER_MS = 1200;

export type StartUniverseArtistPlaybackInput = {
  artistSlug: string;
  lang: SupportedLang;
  dispatch: AppDispatch;
  sourceLocation: { pathname: string; search?: string };
  signal?: AbortSignal;
};

export type StartUniverseArtistPlaybackResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'no-playable' };

function seedArtistLabel(artistSlug: string): string {
  return (
    readStoredProfileDisplayName().trim() ||
    getPublicArtistDisplayName(artistSlug).trim() ||
    siteArtistUiLabel('', '—')
  );
}

/**
 * Starts playback from the first playable album, then extends the queue asynchronously.
 */
export async function startUniverseArtistPlayback(
  input: StartUniverseArtistPlaybackInput
): Promise<StartUniverseArtistPlaybackResult> {
  const slug = input.artistSlug.trim();
  if (!slug) return { ok: false, reason: 'empty' };

  installArtistPlayTraceReport();
  artistPlayTrace('startUniverseArtistPlayback.begin');

  const bootstrapStarted = performance.now();
  const bootstrap = await fetchUniverseArtistPlayQueueBootstrap(slug, input.lang, {
    signal: input.signal,
  });
  artistPlayTrace('startUniverseArtistPlayback.bootstrap', {
    ms: Math.round(performance.now() - bootstrapStarted),
    ok: Boolean(bootstrap),
  });
  if (!bootstrap) return { ok: false, reason: 'empty' };

  const { playlist, firstAlbum: resolvedAlbum } = bootstrap;
  const albumId = fallbackAlbumClientId(resolvedAlbum);
  const startIdx = resolveFirstPlayableIndex(playlist, 0);
  if (startIdx === -1) return { ok: false, reason: 'no-playable' };

  const seedArtist = seedArtistLabel(slug);

  const reduxStarted = performance.now();
  input.dispatch(playerActions.setPlaylist(playlist));
  artistPlayTrace('redux.setPlaylist', { tracks: playlist.length });
  input.dispatch(playerActions.setCurrentTrackIndex(startIdx));
  artistPlayTrace('redux.setCurrentTrackIndex', { startIdx });
  input.dispatch(
    playerActions.setAlbumInfo({
      albumId,
      albumTitle: resolvedAlbum.title,
    })
  );
  input.dispatch(
    playerActions.setAlbumMeta({
      albumId,
      userId: resolvedAlbum.userId ?? null,
      publicSlug: slug,
      album: resolvedAlbum.title,
      artist: seedArtist,
      fullName: formatAlbumDisplayFullName(seedArtist, resolvedAlbum.title) || resolvedAlbum.title,
      cover: resolvedAlbum.cover ?? null,
    })
  );
  input.dispatch(playerActions.setSourceLocation(input.sourceLocation));
  artistPlayTrace('redux.beforeRequestPlay', {
    msSinceRedux: Math.round(performance.now() - reduxStarted),
  });
  input.dispatch(playerActions.requestPlay());
  artistPlayTrace('redux.requestPlay.dispatched');

  void fetchPublicProfileForDisplay(input.lang, slug)
    .then((profileRow) => {
      artistPlayTrace('profile.display.done', { ok: true });
      const resolvedForTitle =
        profileRow.displayName.trim() || readStoredProfileDisplayName().trim();
      const displayArtist = siteArtistUiLabel(profileRow.displayName);
      const currentMeta = getStore().getState().player.albumMeta;
      if (currentMeta?.publicSlug?.trim() === slug) {
        const albumTitle = currentMeta.album ?? resolvedAlbum.title;
        input.dispatch(
          playerActions.setAlbumMeta({
            ...currentMeta,
            artist: displayArtist,
            fullName: formatAlbumDisplayFullName(resolvedForTitle, albumTitle) || albumTitle,
          })
        );
      }
    })
    .catch(() => {
      artistPlayTrace('profile.display.error');
    });

  void (async () => {
    try {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ARTIST_PLAY_TAIL_DEFER_MS);
      });
      artistPlayTrace('tail.fetch.start');
      const tailStarted = performance.now();
      const fullPlaylist = await fetchUniverseArtistPlayQueueTail(
        slug,
        input.lang,
        bootstrap,
        playlist,
        {
          signal: input.signal,
        }
      );
      artistPlayTrace('tail.fetch.done', { ms: Math.round(performance.now() - tailStarted) });

      const tailOnly = fullPlaylist.slice(playlist.length);
      if (tailOnly.length) {
        input.dispatch(playerActions.appendArtistQueueTracks(tailOnly));
        artistPlayTrace('redux.appendArtistQueueTracks', { added: tailOnly.length });
      }
    } catch {
      artistPlayTrace('tail.fetch.error');
    }
  })();

  return { ok: true };
}
