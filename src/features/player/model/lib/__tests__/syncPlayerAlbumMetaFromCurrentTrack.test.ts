import { describe, expect, test } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import { playerReducer, playerActions } from '@features/player/model/slice/playerSlice';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';
import { syncPlayerAlbumMetaFromCurrentTrack } from '../syncPlayerAlbumMetaFromCurrentTrack';
import { initialPlayerState } from '@features/player/model/types/playerSchema';

function trackWithAlbum(id: string, meta: NonNullable<PlayerTrack['queueAlbumMeta']>): PlayerTrack {
  return {
    id,
    title: id,
    duration: 100,
    src: `${id}.mp3`,
    albumId: meta.albumId ?? undefined,
    queueAlbumMeta: meta,
  };
}

describe('syncPlayerAlbumMetaFromCurrentTrack', () => {
  test('updates cover and album title when track index changes', () => {
    const store = configureStore({ reducer: { player: playerReducer } });
    const playlist: PlayerTrack[] = [
      trackWithAlbum('t1', {
        albumId: 'album-1',
        album: 'First',
        cover: 'cover-1.jpg',
        userId: 'u1',
        fullName: null,
      }),
      trackWithAlbum('t2', {
        albumId: 'album-2',
        album: 'Second',
        cover: 'cover-2.jpg',
        userId: 'u1',
        fullName: null,
      }),
    ];

    store.dispatch(
      playerActions.setAlbumMeta({
        albumId: 'album-1',
        album: 'First',
        artist: 'Artist',
        fullName: 'Artist — First',
        cover: 'cover-1.jpg',
        publicSlug: 'artist-slug',
        userId: 'u1',
      })
    );
    store.dispatch(playerActions.setPlaylist(playlist));
    store.dispatch(playerActions.setCurrentTrackIndex(0));

    expect(store.getState().player.albumMeta?.cover).toBe('cover-1.jpg');
    expect(store.getState().player.albumMeta?.artist).toBe('Artist');
    expect(store.getState().player.albumMeta?.publicSlug).toBe('artist-slug');

    store.dispatch(playerActions.nextTrack(playlist.length));

    expect(store.getState().player.albumMeta?.cover).toBe('cover-2.jpg');
    expect(store.getState().player.albumMeta?.album).toBe('Second');
    expect(store.getState().player.albumMeta?.artist).toBe('Artist');
    expect(store.getState().player.albumMeta?.fullName).toBe('Artist — Second');

    store.dispatch(playerActions.prevTrack(playlist.length));

    expect(store.getState().player.albumMeta?.cover).toBe('cover-1.jpg');
    expect(store.getState().player.albumMeta?.album).toBe('First');
  });

  test('no-op when current track has no queueAlbumMeta', () => {
    const state = {
      ...initialPlayerState,
      albumMeta: {
        albumId: 'a1',
        album: 'Album',
        artist: 'Artist',
        fullName: 'Artist — Album',
        cover: 'keep.jpg',
        publicSlug: null,
        userId: null,
      },
      playlist: [{ id: '1', title: 'T', duration: 1, src: 'x.mp3' }],
      currentTrackIndex: 0,
    };

    syncPlayerAlbumMetaFromCurrentTrack(state);

    expect(state.albumMeta?.cover).toBe('keep.jpg');
  });
});
