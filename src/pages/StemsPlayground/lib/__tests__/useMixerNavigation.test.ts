import { describe, expect, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useMixerNavigation } from '../useMixerNavigation';
import type { MixerAlbum } from '../types';

const albums: MixerAlbum[] = [
  {
    albumId: 'a1',
    title: 'Album 1',
    year: '2022',
    listedTrackCount: 2,
    tracksStatus: 'loaded',
    tracks: [
      {
        id: 't1',
        title: 'Track 1',
        duration: 120,
        stems: [{ id: 's1', name: 'Drums', category: 'drums', url: 'u1' }],
      },
      {
        id: 't2',
        title: 'Track 2',
        duration: 90,
        stems: [{ id: 's2', name: 'Bass', category: 'bass', url: 'u2' }],
      },
    ],
  },
  {
    albumId: 'a2',
    title: 'Album 2',
    year: '2025',
    listedTrackCount: 1,
    tracksStatus: 'loaded',
    tracks: [
      {
        id: 't3',
        title: 'Track 3',
        duration: 60,
        stems: [{ id: 's3', name: 'Vocal', category: 'vocal', url: 'u3' }],
      },
    ],
  },
];

describe('useMixerNavigation', () => {
  test('starts on albums view without selection', () => {
    const { result } = renderHook(() => useMixerNavigation(albums));
    expect(result.current.view).toBe('albums');
    expect(result.current.selectedAlbum).toBeNull();
    expect(result.current.selectedTrack).toBeNull();
  });

  test('starts on mixer view when track deep link is provided', () => {
    const { result } = renderHook(() =>
      useMixerNavigation(albums, {
        trackDeepLink: { albumId: 'missing-album', trackId: 't1' },
      })
    );
    expect(result.current.view).toBe('mixer');
    expect(result.current.selectedTrack).toBeNull();
  });

  test('drills down albums → tracks → mixer and back', () => {
    const { result } = renderHook(() => useMixerNavigation(albums));

    act(() => result.current.selectAlbum('a1'));
    expect(result.current.view).toBe('tracks');
    expect(result.current.selectedAlbum?.albumId).toBe('a1');

    act(() => result.current.selectTrack('t2'));
    expect(result.current.view).toBe('mixer');
    expect(result.current.selectedTrack?.id).toBe('t2');

    act(() => result.current.backToTracks());
    expect(result.current.view).toBe('tracks');
    expect(result.current.selectedTrack).toBeNull();
    expect(result.current.selectedAlbum?.albumId).toBe('a1');

    act(() => result.current.backToAlbums());
    expect(result.current.view).toBe('albums');
    expect(result.current.selectedAlbum).toBeNull();
  });

  test('openAlbumTrack jumps to mixer for album and track', () => {
    const { result } = renderHook(() => useMixerNavigation(albums));

    act(() => result.current.openAlbumTrack('a2', 't3'));
    expect(result.current.view).toBe('mixer');
    expect(result.current.selectedAlbum?.albumId).toBe('a2');
    expect(result.current.selectedTrack?.id).toBe('t3');
  });

  test('openAlbumTrack uses hydrated album when catalog ref has no tracks yet', () => {
    const shellsOnly: MixerAlbum[] = [
      {
        albumId: 'a1',
        title: 'Album 1',
        year: '2022',
        listedTrackCount: 1,
        tracksStatus: 'idle',
        tracks: [],
      },
    ];
    const loaded: MixerAlbum = {
      albumId: 'a1',
      title: 'Album 1',
      year: '2022',
      listedTrackCount: 1,
      tracksStatus: 'loaded',
      tracks: [
        {
          id: 't1',
          title: 'Track 1',
          duration: 120,
          stems: [{ id: 's1', name: 'Drums', category: 'drums', url: 'u1' }],
        },
      ],
    };
    const { result, rerender } = renderHook(
      ({ data, deepLink }) =>
        useMixerNavigation(data, {
          trackDeepLink: deepLink,
        }),
      {
        initialProps: {
          data: shellsOnly,
          deepLink: { albumId: 'a1', trackId: 't1' } as const,
        },
      }
    );

    let opened = false;
    act(() => {
      opened = result.current.openAlbumTrack('a1', 't1', loaded);
    });
    expect(opened).toBe(true);
    expect(result.current.view).toBe('mixer');

    rerender({
      data: [{ ...shellsOnly[0], ...loaded, tracksStatus: 'loaded' as const }],
      deepLink: { albumId: 'a1', trackId: 't1' },
    });
    expect(result.current.selectedTrack?.id).toBe('t1');
  });

  test('openAlbumTrack returns false when track id is not on the album', () => {
    const { result } = renderHook(() => useMixerNavigation(albums));

    expect(result.current.openAlbumTrack('a1', 'missing-track')).toBe(false);
    expect(result.current.view).toBe('albums');
    expect(result.current.selectedTrack).toBeNull();
  });

  test('resets to albums when the selected album disappears from the catalog', () => {
    const { result, rerender } = renderHook(({ data }) => useMixerNavigation(data), {
      initialProps: { data: albums },
    });

    act(() => result.current.selectAlbum('a1'));
    expect(result.current.view).toBe('tracks');

    rerender({ data: albums.filter((a) => a.albumId !== 'a1') });
    expect(result.current.view).toBe('albums');
    expect(result.current.selectedAlbum).toBeNull();
  });

  test('falls back to tracks when the selected track disappears but the album remains', () => {
    const { result, rerender } = renderHook(({ data }) => useMixerNavigation(data), {
      initialProps: { data: albums },
    });

    act(() => result.current.selectAlbum('a1'));
    act(() => result.current.selectTrack('t1'));
    expect(result.current.view).toBe('mixer');

    const trimmed = albums.map((a) =>
      a.albumId === 'a1' ? { ...a, tracks: a.tracks.filter((t) => t.id !== 't1') } : a
    );
    rerender({ data: trimmed });
    expect(result.current.view).toBe('tracks');
    expect(result.current.selectedTrack).toBeNull();
    expect(result.current.selectedAlbum?.albumId).toBe('a1');
  });

  test('backToTracks from deep-link mixer shows track list state', () => {
    const { result, rerender } = renderHook(
      ({ data, deepLink, browseFallback }) =>
        useMixerNavigation(data, {
          trackDeepLink: browseFallback ? null : deepLink,
        }),
      {
        initialProps: {
          data: albums,
          deepLink: { albumId: 'a1', trackId: 't1' } as const,
          browseFallback: false,
        },
      }
    );

    expect(result.current.view).toBe('mixer');

    act(() => {
      rerender({ data: albums, deepLink: { albumId: 'a1', trackId: 't1' }, browseFallback: true });
    });
    act(() => result.current.backToTracks());

    expect(result.current.view).toBe('tracks');
    expect(result.current.selectedTrack).toBeNull();
    expect(result.current.selectedAlbum?.albumId).toBe('a1');
  });

  test('does not open mixer for locked tracks', () => {
    const albumsWithLocked: MixerAlbum[] = [
      {
        albumId: 'a1',
        title: 'Album 1',
        year: '2022',
        listedTrackCount: 1,
        tracksStatus: 'loaded',
        tracks: [
          {
            id: 't1',
            title: 'Locked track',
            duration: 120,
            locked: true,
            stems: [],
          },
        ],
      },
    ];
    const { result } = renderHook(() => useMixerNavigation(albumsWithLocked));

    act(() => result.current.selectAlbum('a1'));
    act(() => result.current.selectTrack('t1'));
    expect(result.current.view).toBe('tracks');
    expect(result.current.selectedTrack).toBeNull();
  });
});
