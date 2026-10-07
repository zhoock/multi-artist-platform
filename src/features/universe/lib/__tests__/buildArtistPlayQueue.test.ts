import { describe, expect, test } from '@jest/globals';
import type { AlbumDetails, TrackDetails } from '@entities/album/model/albumDetails';
import {
  appendAlbumsToArtistPlayQueue,
  buildArtistPlayQueue,
  listAlbumTracksForArtistPlayQueue,
} from '../buildArtistPlayQueue';

function track(partial: Partial<TrackDetails> & { id: string; title: string }): TrackDetails {
  return {
    orderIndex: 0,
    duration: 180,
    src: 'a.mp3',
    playbackLocked: false,
    visibility: 'public',
    stemsAvailability: 'public',
    audioContainer: null,
    audioCodec: null,
    audioBitrate: null,
    audioSampleRate: null,
    audioBitDepth: null,
    audioChannels: null,
    audioDuration: null,
    audioFileSize: null,
    ...partial,
  };
}

function album(
  albumId: string,
  title: string,
  tracks: TrackDetails[],
  extra?: Partial<AlbumDetails>
): AlbumDetails {
  const cover = extra?.cover ?? `cover-${albumId}.jpg`;
  return {
    albumId,
    slug: albumId,
    title,
    cover,
    userId: 'u1',
    dbAlbumId: `db-${albumId}`,
    description: '',
    details: [],
    release: { date: '2024-01-01' },
    artwork: {
      photographer: '',
      photographerURL: '',
      designer: '',
      designerURL: '',
    },
    purchase: {
      allowDownloadSale: '',
      regularPrice: '0',
      currency: 'RUB',
    },
    serviceButtons: {},
    visibility: { isPublished: true, isPublic: true },
    tracks,
    ...extra,
  };
}

describe('buildArtistPlayQueue', () => {
  test('queues tracks from all albums in catalog order', () => {
    const result = buildArtistPlayQueue([
      album('album-1', 'One', [track({ id: '1', title: 'A1' }), track({ id: '2', title: 'A2' })]),
      album('album-2', 'Two', [track({ id: '3', title: 'B1' })]),
      album('album-3', 'Three', [track({ id: '4', title: 'C1' }), track({ id: '5', title: 'C2' })]),
    ]);

    expect(result?.playlist.map((t) => t.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(result?.playlist.map((t) => t.albumId)).toEqual([
      'album-1',
      'album-1',
      'album-2',
      'album-3',
      'album-3',
    ]);
    expect(result?.firstAlbum.albumId).toBe('album-1');
    expect(result?.playlist[0]?.queueAlbumMeta?.cover).toBe('cover-album-1.jpg');
    expect(result?.playlist[2]?.queueAlbumMeta?.cover).toBe('cover-album-2.jpg');
    expect(result?.playlist[0]?.queueAlbumMeta?.album).toBe('One');
    expect(result?.playlist[2]?.queueAlbumMeta?.album).toBe('Two');
  });

  test('skips hidden tracks and albums with no playable tracks', () => {
    const result = buildArtistPlayQueue([
      album('album-1', 'One', [
        track({ id: '1', title: 'Hidden', visibility: 'hidden' }),
        track({ id: '2', title: 'Playable' }),
      ]),
      album('album-2', 'Empty', [track({ id: '3', title: 'Locked', playbackLocked: true })]),
      album('album-3', 'Three', [track({ id: '4', title: 'Ok' })]),
    ]);

    expect(result?.playlist.map((t) => t.id)).toEqual(['2', '4']);
  });

  test('dedupes the same logical track id within one album (locale merge)', () => {
    const candidates = listAlbumTracksForArtistPlayQueue([
      track({ id: 'same-id', title: 'EN' }),
      track({ id: 'same-id', title: 'RU duplicate' }),
      track({ id: 'other', title: 'Other' }),
    ]);

    expect(candidates.map((t) => t.title)).toEqual(['EN', 'Other']);

    const result = buildArtistPlayQueue([
      album('album-1', 'One', [
        track({ id: 'shared', title: 'First locale' }),
        track({ id: 'shared', title: 'Second locale' }),
        track({ id: 'unique', title: 'Unique' }),
      ]),
    ]);

    expect(result?.playlist.map((t) => t.id)).toEqual(['shared', 'unique']);
  });

  test('does not duplicate a track id that appears on a later album', () => {
    const result = buildArtistPlayQueue([
      album('album-1', 'One', [track({ id: 'dup', title: 'First' })]),
      album('album-2', 'Two', [
        track({ id: 'dup', title: 'Second copy' }),
        track({ id: 'x', title: 'X' }),
      ]),
    ]);

    expect(result?.playlist.map((t) => t.id)).toEqual(['dup', 'x']);
  });

  test('appendAlbumsToArtistPlayQueue preserves order and dedupes', () => {
    const initial = buildArtistPlayQueue([
      album('album-1', 'One', [track({ id: '1', title: 'A' })]),
    ])!.playlist;

    const extended = appendAlbumsToArtistPlayQueue(initial, [
      album('album-2', 'Two', [track({ id: '1', title: 'dup' }), track({ id: '2', title: 'B' })]),
    ]);

    expect(extended.map((t) => t.id)).toEqual(['1', '2']);
    expect(extended[1]?.queueAlbumMeta?.album).toBe('Two');
  });

  test('returns null when nothing is playable', () => {
    expect(
      buildArtistPlayQueue([
        album('album-1', 'One', [track({ id: '1', title: 'Hidden', visibility: 'hidden' })]),
      ])
    ).toBeNull();
  });
});
