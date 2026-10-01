import { describe, expect, it } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { normalizeAlbumDetails } from '@entities/album/model/albumDetails';
import { resolveTrackLyricsBundle } from '@entities/lyrics/lib/selectors';
import { trackLyricsReducer } from '@entities/lyrics/model/trackLyricsSlice';
import { playerActions, playerReducer } from '@features/player/model/slice/playerSlice';
import { toPlayerTracks } from '@features/player/model/lib/toPlayerTrack';
import { buildPlaylistLyricsFallback } from '@features/player/ui/AudioPlayer/hooks/useLyricsContent';
import type { RootState } from '@shared/model/appStore/types';

const syncedAlbum = {
  albumId: 'album-1',
  slug: 'album-1',
  title: 'Album',
  cover: '',
  userId: 'user-1',
  dbAlbumId: 'db-1',
  description: '',
  details: [],
  release: {},
  artwork: { photographer: '', photographerURL: '', designer: '', designerURL: '' },
  purchase: { allowDownloadSale: '', regularPrice: '0', currency: 'RUB' },
  serviceButtons: {},
  visibility: { isPublished: true, isPublic: true },
  tracks: [
    {
      id: 'track-1',
      title: 'With sync',
      duration: 120,
      src: 'a.mp3',
      orderIndex: 0,
      playbackLocked: false,
      visibility: 'public',
      stemsAvailability: 'public',
      audioContainer: null,
      audioCodec: null,
      audioBitrate: null,
      audioSampleRate: null,
      audioBitDepth: null,
      audioChannels: null,
      audioDuration: null,
      audioFileSize: null,
      lyrics: {
        albumId: 'album-1',
        trackId: 'track-1',
        lang: 'ru',
        content: 'Line',
        syncedLines: [{ text: 'Line', startTime: 1 }],
        state: 'synced',
        syncedAt: '2026-01-01T00:00:00.000Z',
      },
      content: 'Line',
    },
    {
      id: 'track-2',
      title: 'Plain only',
      duration: 90,
      src: 'b.mp3',
      orderIndex: 1,
      playbackLocked: false,
      visibility: 'public',
      stemsAvailability: 'public',
      audioContainer: null,
      audioCodec: null,
      audioBitrate: null,
      audioSampleRate: null,
      audioBitDepth: null,
      audioChannels: null,
      audioDuration: null,
      audioFileSize: null,
      lyrics: {
        albumId: 'album-1',
        trackId: 'track-2',
        lang: 'ru',
        content: 'Just text',
        syncedLines: null,
        state: 'text-only',
        syncedAt: null,
      },
      content: 'Just text',
    },
    {
      id: 'track-3',
      title: 'No lyrics',
      duration: 60,
      src: 'c.mp3',
      orderIndex: 2,
      playbackLocked: false,
      visibility: 'public',
      stemsAvailability: 'public',
      audioContainer: null,
      audioCodec: null,
      audioBitrate: null,
      audioSampleRate: null,
      audioBitDepth: null,
      audioChannels: null,
      audioDuration: null,
      audioFileSize: null,
    },
  ],
};

function queueFromAlbumDetails() {
  const details = normalizeAlbumDetails(syncedAlbum);
  const queued = toPlayerTracks(details?.tracks, details?.albumId);
  const store = configureStore({
    reducer: { player: playerReducer, trackLyrics: trackLyricsReducer },
  });
  store.dispatch(playerActions.setPlaylist(queued));
  const restored = toPlayerTracks(
    JSON.parse(JSON.stringify(store.getState().player.playlist)) as unknown[],
    details?.albumId
  );
  return { store, restored };
}

function resolveQueuedTrack(trackId: string, persisted = false) {
  const { store, restored } = queueFromAlbumDetails();
  const live = store.getState().player.playlist.find((row) => row.id === trackId)!;
  const track = persisted ? restored.find((row) => row.id === trackId)! : live;
  const fallback = buildPlaylistLyricsFallback('album-1', track, 'ru');
  const bundle = resolveTrackLyricsBundle(
    store.getState() as unknown as RootState,
    'album-1',
    track.id,
    fallback
  );
  const hasSyncedLyricsHint = bundle.state === 'synced';
  const hasPlainLyrics = Boolean(bundle.state === 'text-only' && bundle.content.trim());
  return {
    bundle,
    hasSyncedLyricsHint,
    lyricsButtonEnabled: hasSyncedLyricsHint || hasPlainLyrics,
  };
}

describe('AlbumDetails → thin PlayerTrack → Full Player synced lyrics', () => {
  it('enables the synced lyrics path after setPlaylist', () => {
    const resolved = resolveQueuedTrack('track-1');
    expect(resolved.bundle.state).toBe('synced');
    expect(resolved.bundle.syncedLines).toHaveLength(1);
    expect(resolved.hasSyncedLyricsHint).toBe(true);
    expect(resolved.lyricsButtonEnabled).toBe(true);
  });

  it('keeps the synced lyrics path after a persisted playlist reload', () => {
    const resolved = resolveQueuedTrack('track-1', true);
    expect(resolved.bundle.state).toBe('synced');
    expect(resolved.hasSyncedLyricsHint).toBe(true);
    expect(resolved.lyricsButtonEnabled).toBe(true);
  });

  it('does not treat plain lyrics as synced', () => {
    const resolved = resolveQueuedTrack('track-2');
    expect(resolved.bundle.state).toBe('text-only');
    expect(resolved.bundle.syncedLines).toBeNull();
    expect(resolved.hasSyncedLyricsHint).toBe(false);
  });

  it('leaves the lyrics button disabled when the track has no lyrics', () => {
    const resolved = resolveQueuedTrack('track-3');
    expect(resolved.bundle.state).toBe('empty');
    expect(resolved.hasSyncedLyricsHint).toBe(false);
    expect(resolved.lyricsButtonEnabled).toBe(false);
  });
});
