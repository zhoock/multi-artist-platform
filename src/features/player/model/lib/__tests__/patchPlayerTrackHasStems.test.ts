import { describe, test, expect } from '@jest/globals';
import {
  applyHasStemsToPlayerTrack,
  patchPlayerTrackListHasStems,
  playerTrackMatchesStemScope,
} from '../patchPlayerTrackHasStems';
import type { PlayerTrack } from '@features/player/model/types/playerSchema';

function row(partial: Partial<PlayerTrack> & Pick<PlayerTrack, 'id'>): PlayerTrack {
  return {
    title: 'T',
    duration: 1,
    src: 'a.mp3',
    albumId: 'album-a',
    ...partial,
  };
}

describe('patchPlayerTrackHasStems', () => {
  test('matches track by albumId and track id', () => {
    expect(playerTrackMatchesStemScope(row({ id: '1' }), 'album-a', '1')).toBe(true);
    expect(playerTrackMatchesStemScope(row({ id: '1' }), 'album-b', '1')).toBe(false);
    expect(playerTrackMatchesStemScope(row({ id: '2' }), 'album-a', '1')).toBe(false);
  });

  test('clears hasStems on matching rows only', () => {
    const list = [
      row({ id: '1', hasStems: true }),
      row({ id: '2', hasStems: true, albumId: 'album-b' }),
    ];
    const { next, changed } = patchPlayerTrackListHasStems(list, 'album-a', '1', false);
    expect(changed).toBe(true);
    expect(next[0].hasStems).toBeUndefined();
    expect(next[1].hasStems).toBe(true);
  });

  test('sets hasStems when manifest gains stems', () => {
    const list = [row({ id: '1' })];
    const { next, changed } = patchPlayerTrackListHasStems(list, 'album-a', '1', true);
    expect(changed).toBe(true);
    expect(next[0].hasStems).toBe(true);
  });

  test('applyHasStemsToPlayerTrack is idempotent', () => {
    const withStems = row({ id: '1', hasStems: true });
    expect(applyHasStemsToPlayerTrack(withStems, true)).toBe(withStems);
    const without = row({ id: '1' });
    expect(applyHasStemsToPlayerTrack(without, false)).toBe(without);
  });
});
