import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';

import { playerReducer, playerActions } from '@features/player';
import { clearPlayerState } from '@features/player/model/lib/playerPersist';
import { teardownPlaybackAfterAuthEnd } from '../teardownPlaybackAfterAuthEnd';

jest.mock('@features/player/model/lib/playerPersist', () => ({
  clearPlayerState: jest.fn(),
}));

describe('teardownPlaybackAfterAuthEnd', () => {
  beforeEach(() => {
    jest.mocked(clearPlayerState).mockClear();
  });

  test('pauses playback, clears playlist/album, and clears persisted player state', () => {
    const store = configureStore({
      reducer: { player: playerReducer },
    });

    store.dispatch(
      playerActions.setPlaylist([
        {
          id: '1',
          title: 'Premium track',
          src: 'https://example.com/premium.mp3',
          duration: 120,
        },
      ])
    );
    store.dispatch(playerActions.setAlbumInfo({ albumId: 'alb-1', albumTitle: 'Album' }));
    store.dispatch(playerActions.play());

    teardownPlaybackAfterAuthEnd(store.dispatch);

    const player = store.getState().player;
    expect(player.isPlaying).toBe(false);
    expect(player.playlist).toEqual([]);
    expect(player.albumId).toBeNull();
    expect(player.albumTitle).toBeNull();
    expect(clearPlayerState).toHaveBeenCalledTimes(1);
  });
});
