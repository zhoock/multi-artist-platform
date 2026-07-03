import { describe, expect, test } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { useMixerNavigation } from '../useMixerNavigation';
import type { MixerAlbum } from '../types';

const albums: MixerAlbum[] = [
  {
    albumId: 'a1',
    title: 'Album 1',
    year: '2022',
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

  test('does not open mixer for locked tracks', () => {
    const albumsWithLocked: MixerAlbum[] = [
      {
        albumId: 'a1',
        title: 'Album 1',
        year: '2022',
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
