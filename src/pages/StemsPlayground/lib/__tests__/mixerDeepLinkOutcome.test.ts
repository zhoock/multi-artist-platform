import { describe, expect, test, jest } from '@jest/globals';

/**
 * Documents StemsPlayground deep-link outcomes (see StemsPlayground.tsx useEffect).
 * Pure decision table — kept in tests to avoid duplicating production logic in prod code.
 */
type LoadedTrack = { id: string; locked?: boolean };

type DeepLinkResult = { kind: 'open_mixer' } | { kind: 'tracks_list'; requestAccess?: boolean };

function resolveMixerDeepLinkAfterLoad(
  deepLinkTrackId: string,
  loadedTracks: LoadedTrack[],
  openAlbumTrack: (albumId: string, trackId: string) => boolean
): DeepLinkResult {
  const track = loadedTracks.find((t) => t.id === deepLinkTrackId);
  if (!track) {
    return { kind: 'tracks_list' };
  }
  if (track.locked) {
    return { kind: 'tracks_list', requestAccess: true };
  }
  if (openAlbumTrack('album', deepLinkTrackId)) {
    return { kind: 'open_mixer' };
  }
  return { kind: 'tracks_list' };
}

describe('mixer deep-link decision table (StemsPlayground contract)', () => {
  test('opens mixer for matching unlocked track with stems', () => {
    const result = resolveMixerDeepLinkAfterLoad(
      't2',
      [{ id: 't1' }, { id: 't2' }],
      (_albumId, trackId) => trackId === 't2'
    );
    expect(result).toEqual({ kind: 'open_mixer' });
  });

  test('stays on track list when requested track has no mixer row', () => {
    const result = resolveMixerDeepLinkAfterLoad('missing', [{ id: 't1' }], () => true);
    expect(result).toEqual({ kind: 'tracks_list' });
  });

  test('does not open mixer for locked track and signals requestAccess', () => {
    const openSpy = jest.fn(() => true);
    const result = resolveMixerDeepLinkAfterLoad('t1', [{ id: 't1', locked: true }], openSpy);
    expect(result).toEqual({ kind: 'tracks_list', requestAccess: true });
    expect(openSpy).not.toHaveBeenCalled();
  });

  test('does not substitute first available track when openAlbumTrack fails', () => {
    const result = resolveMixerDeepLinkAfterLoad('t2', [{ id: 't1' }, { id: 't2' }], () => false);
    expect(result).toEqual({ kind: 'tracks_list' });
  });
});
