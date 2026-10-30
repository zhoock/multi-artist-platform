import { describe, expect, test, jest } from '@jest/globals';
import { resolveMixerTrackDeepLinkOutcome } from '../applyMixerTrackDeepLink';
import type { MixerAlbum } from '../types';

const loadedAlbum = (tracks: MixerAlbum['tracks']): MixerAlbum => ({
  albumId: 'rubber-soul',
  title: 'Rubber Soul',
  year: '1965',
  listedTrackCount: tracks.length,
  tracksStatus: 'loaded',
  tracks,
});

describe('resolveMixerTrackDeepLinkOutcome', () => {
  test('returns pending while album tracks are still loading', () => {
    const outcome = resolveMixerTrackDeepLinkOutcome(
      'rubber-soul',
      't1',
      { ...loadedAlbum([]), tracksStatus: 'loading' },
      () => true
    );
    expect(outcome).toEqual({ kind: 'pending' });
  });

  test('opens mixer for matching unlocked track with stems', () => {
    const album = loadedAlbum([
      {
        id: 't2',
        title: 'Norwegian Wood',
        duration: 125,
        stems: [{ id: 's1', name: 'Drums', category: 'drums', url: 'u1' }],
      },
    ]);
    const openSpy = jest.fn(() => true);
    const outcome = resolveMixerTrackDeepLinkOutcome('rubber-soul', 't2', album, openSpy);
    expect(outcome.kind).toBe('open_mixer');
    expect(openSpy).toHaveBeenCalledWith('rubber-soul', 't2', album);
  });

  test('stays on track list when requested track has no mixer row', () => {
    const outcome = resolveMixerTrackDeepLinkOutcome(
      'rubber-soul',
      'missing',
      loadedAlbum([{ id: 't1', title: 'A', duration: 1, stems: [] }]),
      () => true
    );
    expect(outcome).toEqual({ kind: 'tracks_list', albumId: 'rubber-soul' });
  });

  test('does not open mixer for locked track and signals requestAccess', () => {
    const openSpy = jest.fn(() => true);
    const outcome = resolveMixerTrackDeepLinkOutcome(
      'rubber-soul',
      't1',
      loadedAlbum([{ id: 't1', title: 'Locked', duration: 1, locked: true, stems: [] }]),
      openSpy
    );
    expect(outcome).toEqual({
      kind: 'tracks_list',
      albumId: 'rubber-soul',
      requestAccess: true,
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  test('does not substitute first available track when openAlbumTrack fails', () => {
    const outcome = resolveMixerTrackDeepLinkOutcome(
      'rubber-soul',
      't2',
      loadedAlbum([
        {
          id: 't1',
          title: 'A',
          duration: 1,
          stems: [{ id: 's', name: 'S', category: 'drums', url: 'u' }],
        },
        {
          id: 't2',
          title: 'B',
          duration: 1,
          stems: [{ id: 's2', name: 'S2', category: 'bass', url: 'u2' }],
        },
      ]),
      () => false
    );
    expect(outcome).toEqual({ kind: 'tracks_list', albumId: 'rubber-soul' });
  });
});
