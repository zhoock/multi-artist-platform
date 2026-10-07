/**
 * Regression: album page and single-track play keep building a one-album queue (AlbumTracks.openPlayer).
 */
import { describe, expect, test } from '@jest/globals';
import { toPlayerTracks } from '@features/player/model/lib/toPlayerTrack';
import {
  isTrackPlaybackBlocked,
  resolveFirstPlayableIndex,
} from '@shared/lib/tracks/trackPlayback';

describe('album page play queue contract', () => {
  const albumId = 'album-1';
  const rawTracks = [
    { id: 'track-a', title: 'A', duration: 100, src: 'a.mp3', visibility: 'public' as const },
    { id: 'track-b', title: 'B', duration: 100, src: 'b.mp3', visibility: 'public' as const },
  ];

  test('play album queues all listed tracks under one album id', () => {
    const playlist = toPlayerTracks(
      rawTracks.map((track) => (isTrackPlaybackBlocked(track) ? { ...track, src: '' } : track)),
      albumId
    );

    expect(playlist).toHaveLength(2);
    expect(playlist.every((t) => t.albumId === albumId)).toBe(true);
    expect(playlist.every((t) => t.queueAlbumMeta === undefined)).toBe(true);
  });

  test('play single track keeps full album playlist and selects requested index', () => {
    const playlist = toPlayerTracks(rawTracks, albumId);
    const requestedIndex = 1;
    const playableIndex = resolveFirstPlayableIndex(playlist, requestedIndex);

    expect(playableIndex).toBe(1);
    expect(playlist[playableIndex]?.id).toBe('track-b');
    expect(playlist).toHaveLength(2);
  });
});
