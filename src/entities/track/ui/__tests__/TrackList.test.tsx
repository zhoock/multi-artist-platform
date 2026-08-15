/** @jest-environment jsdom */

import { describe, expect, jest, test } from '@jest/globals';
import { render } from '@testing-library/react';
import type { TrackDetails } from '@entities/album/model/albumDetails';
import type { AppStore, RootState } from '@shared/model/appStore/types';
import { TrackList } from '../TrackList';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'ru' }),
}));

jest.mock('@shared/lib/hooks/useAppSelector', () => ({
  useAppSelector: () => null,
}));

function createMockStore(): AppStore {
  const state = {
    player: {
      currentTrackIndex: 0,
      isPlaying: false,
      shuffle: false,
      albumId: null,
      playlist: [],
      progress: 0,
    },
  } as RootState;

  return {
    getState: () => state,
    subscribe: () => () => {},
    dispatch: jest.fn(),
  } as unknown as AppStore;
}

const baseTrack = (overrides: Partial<TrackDetails>): TrackDetails => ({
  id: '1',
  title: 'Track',
  duration: 120,
  src: 'track.mp3',
  visibility: 'public',
  playbackLocked: false,
  ...overrides,
});

describe('TrackList locked track row', () => {
  test('locked track keeps row layout with index and lock before duration', () => {
    const { container } = render(
      <TrackList
        tracks={[
          baseTrack({ id: '1', title: 'Open track', duration: 120 }),
          baseTrack({
            id: '2',
            title: 'Locked track',
            duration: 212,
            visibility: 'subscribers_only',
            src: '',
            playbackLocked: true,
          }),
        ]}
        album={{ albumId: 'album-1', title: 'Album' }}
        store={createMockStore()}
        onSelectTrack={jest.fn()}
      />
    );

    const rows = container.querySelectorAll('.tracks__btn');
    expect(rows).toHaveLength(2);

    const openRow = rows[0];
    const lockedRow = rows[1];

    expect(openRow.querySelector('.tracks__symbol-index')?.textContent).toBe('1');
    expect(openRow.querySelector('.tracks__duration-lock')).toBeNull();
    expect(openRow.querySelector('.tracks__title-text')?.textContent).toBe('Open track');
    expect(openRow.querySelector('.tracks__duration')?.textContent).toBe('2:00');

    expect(lockedRow.classList.contains('tracks__btn--locked')).toBe(true);
    expect(lockedRow.querySelector('.tracks__symbol-index')?.textContent).toBe('2');
    expect(lockedRow.querySelector('.tracks__duration-lock')).toBeTruthy();
    expect(lockedRow.querySelector('.tracks__title-text')?.textContent).toBe('Locked track');
    expect(lockedRow.querySelector('.tracks__duration')?.textContent).toBe('3:32');
  });

  test('open track does not render lock icon', () => {
    const { container } = render(
      <TrackList
        tracks={[baseTrack({ id: '1', title: 'Only open track' })]}
        album={{ albumId: 'album-1', title: 'Album' }}
        store={createMockStore()}
        onSelectTrack={jest.fn()}
      />
    );

    expect(container.querySelector('.tracks__title-text')?.textContent).toBe('Only open track');
    expect(container.querySelector('.tracks__duration-lock')).toBeNull();
    expect(container.querySelector('.tracks__btn--locked')).toBeNull();
  });
});
