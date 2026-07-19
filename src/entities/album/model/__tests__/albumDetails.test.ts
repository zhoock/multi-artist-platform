import { describe, expect, test } from '@jest/globals';
import type { AlbumEditable } from '@models';
import {
  normalizeAlbumDetails,
  isAlbumDetails,
  mapAlbumEditableToAlbumDetails,
  ALBUM_DETAILS_EXCLUDED_TRACK_FIELDS,
  ALBUM_DETAILS_EXCLUDED_ALBUM_FIELDS,
} from '../albumDetails';

function buildFatAlbum(): AlbumEditable {
  return {
    albumId: '23-remastered',
    dbAlbumId: 'uuid-album-1',
    userId: 'user-1',
    artist: 'Legacy Artist',
    album: '23',
    fullName: 'Artist — 23',
    description: 'Album description',
    cover: 'cover-key',
    hasDraftChanges: true,
    isPublished: true,
    isPublic: true,
    release: {
      date: '2020-01-01',
      UPC: '123',
      allowDownloadSale: 'yes',
      regularPrice: '4.99',
      currency: 'RUB',
      photographer: 'should-strip',
    },
    buttons: { bandcamp: 'https://bandcamp.example' },
    details: [{ id: 1, title: 'Genre', content: ['Rock'] }],
    translations: {
      en: {
        fullName: 'Artist — 23',
        description: 'EN description',
        details: [{ id: 1, title: 'Genre', content: ['Rock'] }],
        photographer: 'Ann',
        photographerURL: '',
        designer: 'dee',
        designerURL: '',
      },
      ru: {
        fullName: 'Артист — 23',
        description: 'RU description',
        details: [{ id: 1, title: 'Жанр', content: ['Рок'] }],
        photographer: 'анна',
        photographerURL: '',
        designer: 'ди',
        designerURL: '',
      },
    },
    tracks: [
      {
        id: 't1',
        title: 'Track One',
        order_index: 0,
        duration: 180,
        src: 'https://cdn.example/t1.mp3',
        content: 'Huge lyrics body that must not ship in AlbumDetails',
        authorship: 'Writer',
        lyrics: {
          albumId: '23-remastered',
          trackId: 't1',
          lang: 'en',
          content: 'Huge lyrics body that must not ship in AlbumDetails',
          authorship: 'Writer',
          syncedLines: [
            { text: 'line', startTime: 0, endTime: 1 },
            { text: 'line2', startTime: 1, endTime: 2 },
          ],
          state: 'synced',
          syncedAt: '2024-01-01T00:00:00.000Z',
        },
        visibility: 'public',
        stemsVisibility: 'subscribers_only',
        playbackLocked: false,
        audioContainer: 'mp3',
        audioCodec: 'mp3',
        audioBitrate: 320000,
        audioSampleRate: 44100,
        audioBitDepth: null,
        audioChannels: 2,
        audioDuration: 180,
        audioFileSize: 5000000,
        translations: {
          en: { title: 'Track One' },
          ru: { title: 'Трек Один' },
        },
      },
    ],
  };
}

describe('AlbumDetails model', () => {
  test('normalizeAlbumDetails maps mid-weight API payload', () => {
    const album = normalizeAlbumDetails({
      albumId: '23-remastered',
      slug: '23-remastered',
      title: '23',
      cover: 'cover-key',
      userId: 'user-1',
      dbAlbumId: 'uuid-1',
      description: 'Desc',
      details: [{ id: 1, title: 'Genre', content: ['Rock'] }],
      release: { date: '2020-01-01', UPC: '1' },
      artwork: {
        photographer: 'p',
        photographerURL: '',
        designer: 'd',
        designerURL: '',
      },
      purchase: {
        allowDownloadSale: 'yes',
        regularPrice: '4.99',
        currency: 'RUB',
      },
      serviceButtons: { bandcamp: 'https://bc.example' },
      visibility: { isPublished: true, isPublic: true },
      tracks: [
        {
          id: 't1',
          title: 'One',
          duration: 120,
          src: 'a.mp3',
          orderIndex: 0,
          playbackLocked: false,
          visibility: 'public',
          stemsAvailability: 'hidden',
          audioContainer: 'mp3',
          audioCodec: null,
          audioBitrate: null,
          audioSampleRate: null,
          audioBitDepth: null,
          audioChannels: null,
          audioDuration: null,
          audioFileSize: null,
        },
      ],
    });

    expect(album).not.toBeNull();
    expect(isAlbumDetails(album)).toBe(true);
    expect(album?.title).toBe('23');
    expect(album?.purchase.regularPrice).toBe('4.99');
    expect(album?.tracks[0]?.stemsAvailability).toBe('hidden');
    expect(album?.serviceButtons.bandcamp).toBe('https://bc.example');
  });

  test('normalizeAlbumDetails rejects missing albumId', () => {
    expect(normalizeAlbumDetails({ title: 'x', tracks: [] })).toBeNull();
  });

  test('normalizeAlbumDetails accepts stemsVisibility alias', () => {
    const album = normalizeAlbumDetails({
      albumId: 'a1',
      title: 'T',
      cover: '',
      userId: 'u',
      tracks: [
        {
          id: '1',
          title: 't',
          duration: 1,
          src: '',
          stemsVisibility: 'public',
        },
      ],
    });
    expect(album?.tracks[0]?.stemsAvailability).toBe('public');
  });

  test('mapAlbumEditableToAlbumDetails strips lyrics and reshapes fields', () => {
    const fat = buildFatAlbum();
    const details = mapAlbumEditableToAlbumDetails(fat);

    expect(details.albumId).toBe('23-remastered');
    expect(details.slug).toBe('23-remastered');
    expect(details.title).toBe('23');
    expect(details.serviceButtons.bandcamp).toBe('https://bandcamp.example');
    expect(details.purchase.allowDownloadSale).toBe('yes');
    expect(details.visibility.isPublished).toBe(true);
    expect(details.release.photographer).toBeUndefined();
    expect(details.tracks).toHaveLength(1);

    const track = details.tracks[0];
    expect(track.id).toBe('t1');
    expect(track.stemsAvailability).toBe('subscribers_only');
    expect(track.audioContainer).toBe('mp3');
    expect(track.translations?.ru?.title).toBe('Трек Один');

    const trackJson = JSON.stringify(track);
    for (const field of ALBUM_DETAILS_EXCLUDED_TRACK_FIELDS) {
      expect(trackJson).not.toContain(`"${field}"`);
    }
    expect(trackJson).not.toContain('Huge lyrics body');
    expect(trackJson).not.toContain('syncedLines');

    const albumJson = JSON.stringify(details);
    expect(albumJson).not.toContain('"hasDraftChanges"');
    expect(albumJson).not.toContain('"artist"');
    for (const field of ALBUM_DETAILS_EXCLUDED_ALBUM_FIELDS) {
      if (
        field === 'album' ||
        field === 'buttons' ||
        field === 'isPublished' ||
        field === 'isPublic'
      ) {
        // reshaped — ensure old root keys are gone
        expect(Object.prototype.hasOwnProperty.call(details, field)).toBe(false);
      }
    }
  });

  test('AlbumDetails payload is smaller than fat AlbumEditable with lyrics', () => {
    const fat = buildFatAlbum();
    // Simulate a heavier synced lyrics payload like production fat responses.
    const heavyLyrics = Array.from({ length: 40 }, (_, i) => ({
      text: `Synced lyric line number ${i} with some extra padding text`,
      startTime: i,
      endTime: i + 1,
    }));
    fat.tracks[0] = {
      ...fat.tracks[0],
      lyrics: {
        ...fat.tracks[0].lyrics!,
        syncedLines: heavyLyrics,
        content: heavyLyrics.map((l) => l.text).join('\n'),
      },
      content: heavyLyrics.map((l) => l.text).join('\n'),
    };

    const details = mapAlbumEditableToAlbumDetails(fat);
    const fatBytes = Buffer.byteLength(JSON.stringify(fat), 'utf8');
    const detailsBytes = Buffer.byteLength(JSON.stringify(details), 'utf8');
    const ratio = Number((detailsBytes / fatBytes).toFixed(3));

    // Fixture with 40 synced lyric lines on one track (representative of fat /api/albums).
    // Typical result: ~7.5KB → ~2.2KB (≈30% of fat size).
    expect(detailsBytes).toBeLessThan(fatBytes);
    expect(ratio).toBeLessThan(0.7);
    expect(fatBytes).toBeGreaterThan(5000);
    expect(detailsBytes).toBeLessThan(3000);
  });
});
