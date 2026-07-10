import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';

import {
  isDashboardAccordionOnboardingConsumed,
  resetDashboardAccordionOnboardingForTests,
  useDashboardAccordionOnboarding,
} from '../dashboardAccordionOnboarding';

const albums = [
  {
    id: 'album-1',
    tracks: [{ id: 'track-1' }, { id: 'track-2' }],
  },
];

const buildTrackKey = (albumId: string, trackId: string) => `${albumId}:${trackId}`;

describe('useDashboardAccordionOnboarding', () => {
  beforeEach(() => {
    resetDashboardAccordionOnboardingForTests();
  });

  it('auto-expands first album and track once when tab opens with data', () => {
    const onExpandAlbum = jest.fn();
    const onExpandTrack = jest.fn();

    const { rerender } = renderHook(
      (props: { expandedAlbumId: string | null; expandedTrackId: string | null }) =>
        useDashboardAccordionOnboarding({
          scope: 'albums',
          enabled: true,
          dataReady: true,
          albums,
          expandedAlbumId: props.expandedAlbumId,
          expandedTrackId: props.expandedTrackId,
          onExpandAlbum,
          onExpandTrack,
          buildTrackKey,
        }),
      {
        initialProps: {
          expandedAlbumId: null as string | null,
          expandedTrackId: null as string | null,
        },
      }
    );

    expect(onExpandAlbum).toHaveBeenCalledWith('album-1');

    act(() => {
      rerender({ expandedAlbumId: 'album-1', expandedTrackId: null });
    });

    expect(onExpandTrack).toHaveBeenCalledWith('album-1:track-1');

    act(() => {
      rerender({ expandedAlbumId: 'album-1', expandedTrackId: 'album-1:track-1' });
    });

    expect(isDashboardAccordionOnboardingConsumed('albums')).toBe(true);
  });

  it('does not auto-expand when there are no tracks', () => {
    const onExpandAlbum = jest.fn();
    const onExpandTrack = jest.fn();

    renderHook(() =>
      useDashboardAccordionOnboarding({
        scope: 'mixer',
        enabled: true,
        dataReady: true,
        albums: [{ id: 'album-1', tracks: [] }],
        expandedAlbumId: null,
        expandedTrackId: null,
        onExpandAlbum,
        onExpandTrack,
        buildTrackKey,
      })
    );

    expect(onExpandAlbum).not.toHaveBeenCalled();
    expect(onExpandTrack).not.toHaveBeenCalled();
    expect(isDashboardAccordionOnboardingConsumed('mixer')).toBe(true);
  });

  it('skips onboarding when expansion is already set', () => {
    const onExpandAlbum = jest.fn();

    renderHook(() =>
      useDashboardAccordionOnboarding({
        scope: 'albums',
        enabled: true,
        dataReady: true,
        albums,
        expandedAlbumId: 'album-2',
        expandedTrackId: null,
        onExpandAlbum,
        onExpandTrack: jest.fn(),
        buildTrackKey,
      })
    );

    expect(onExpandAlbum).not.toHaveBeenCalled();
    expect(isDashboardAccordionOnboardingConsumed('albums')).toBe(true);
  });
});
