import { describe, expect, test } from '@jest/globals';

import { playerActions } from '@features/player';
import { getStore } from '@shared/model/appStore';

import { buildArtistCardPlayPlayerSnapshot } from '../buildArtistCardPlayPlayerSnapshot';

describe('buildArtistCardPlayPlayerSnapshot', () => {
  test('reads isPlaying and active artist from Redux at call time', () => {
    const store = getStore();
    store.dispatch(
      playerActions.setAlbumMeta({
        albumId: 'album-1',
        album: 'Album',
        artist: 'Artist',
        fullName: 'Artist — Album',
        publicSlug: 'beatles',
        cover: null,
      })
    );
    store.dispatch(playerActions.setPlaylist([{ id: '1', title: 'Track', src: 'a.mp3' }]));
    store.dispatch(playerActions.play());

    expect(buildArtistCardPlayPlayerSnapshot(null)).toEqual({
      startingArtistSlug: null,
      activeArtistSlug: 'beatles',
      isPlaying: true,
      hasActiveQueue: true,
    });

    store.dispatch(playerActions.pause());

    expect(buildArtistCardPlayPlayerSnapshot(null)).toEqual({
      startingArtistSlug: null,
      activeArtistSlug: 'beatles',
      isPlaying: false,
      hasActiveQueue: true,
    });
  });

  test('includes local starting slug without reading it from Redux', () => {
    expect(buildArtistCardPlayPlayerSnapshot('artist-a')).toMatchObject({
      startingArtistSlug: 'artist-a',
    });
  });
});
