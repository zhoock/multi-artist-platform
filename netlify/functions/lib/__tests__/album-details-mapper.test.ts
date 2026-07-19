import { describe, expect, test } from '@jest/globals';
import {
  isAlbumDetailsVisibleToPublicViewer,
  mapLocalesToAlbumDetails,
  type AlbumDetailsLocaleSource,
} from '../album-details-mapper';

function locale(
  partial: Partial<AlbumDetailsLocaleSource> & Pick<AlbumDetailsLocaleSource, 'lang'>
): AlbumDetailsLocaleSource {
  return {
    lang: partial.lang,
    dbAlbumId: partial.dbAlbumId ?? 'uuid-1',
    userId: partial.userId ?? 'user-1',
    albumId: partial.albumId ?? '23-remastered',
    title: partial.title ?? '23',
    fullName: partial.fullName ?? 'Artist — 23',
    description: partial.description ?? 'Desc',
    cover: partial.cover ?? 'cover',
    release: partial.release ?? {
      date: '2020-01-01',
      allowDownloadSale: 'yes',
      regularPrice: '4.99',
      currency: 'RUB',
      photographer: 'legacy-in-release',
    },
    buttons: partial.buttons ?? { itunes: 'https://itunes.example' },
    details: partial.details ?? [{ id: 1, title: 'Genre', content: ['Rock'] }],
    photographer: partial.photographer ?? 'Ann',
    photographerURL: partial.photographerURL ?? '',
    designer: partial.designer ?? 'Dee',
    designerURL: partial.designerURL ?? '',
    isPublic: partial.isPublic ?? true,
    isPublished: partial.isPublished ?? true,
    updatedAt: partial.updatedAt ?? '2024-01-01T00:00:00.000Z',
    tracks: partial.tracks ?? [
      {
        trackId: 't1',
        title: 'One',
        duration: 120,
        src: 'path/t1.mp3',
        orderIndex: 0,
        visibility: 'public',
        stemsVisibility: 'hidden',
        audioContainer: 'mp3',
        audioCodec: 'mp3',
        audioBitrate: 320000,
        audioSampleRate: 44100,
        audioBitDepth: null,
        audioChannels: 2,
        audioDuration: 120,
        audioFileSize: 1000,
      },
    ],
  };
}

describe('album-details-mapper', () => {
  test('merges locales and maps purchase / artwork / serviceButtons', () => {
    const dto = mapLocalesToAlbumDetails(
      [
        locale({
          lang: 'ru',
          description: 'RU',
          title: '23',
          photographer: 'Анна',
          tracks: [
            {
              trackId: 't1',
              title: 'Один',
              duration: 120,
              src: 't1.mp3',
              orderIndex: 0,
              visibility: 'public',
              stemsVisibility: 'hidden',
              audioContainer: null,
              audioCodec: null,
              audioBitrate: null,
              audioSampleRate: null,
              audioBitDepth: null,
              audioChannels: null,
              audioDuration: null,
              audioFileSize: null,
            },
          ],
        }),
        locale({
          lang: 'en',
          description: 'EN',
          title: '23',
          photographer: 'Ann',
          tracks: [
            {
              trackId: 't1',
              title: 'One',
              duration: 120,
              src: 't1.mp3',
              orderIndex: 0,
              visibility: 'public',
              stemsVisibility: 'hidden',
              audioContainer: null,
              audioCodec: null,
              audioBitrate: null,
              audioSampleRate: null,
              audioBitDepth: null,
              audioChannels: null,
              audioDuration: null,
              audioFileSize: null,
            },
          ],
        }),
      ],
      { hasPremiumAccess: true, monetizationEnabled: true }
    );

    expect(dto).not.toBeNull();
    expect(dto!.title).toBe('23');
    expect(dto!.purchase.regularPrice).toBe('4.99');
    expect(dto!.serviceButtons.itunes).toBe('https://itunes.example');
    expect(dto!.release.photographer).toBeUndefined();
    expect(dto!.artwork.photographer).toBe('Анна');
    expect(dto!.translations?.en?.description).toBe('EN');
    expect(dto!.translations?.ru?.description).toBe('RU');
    expect(dto!.tracks[0]?.translations?.en?.title).toBe('One');
    expect(dto!.tracks[0]?.translations?.ru?.title).toBe('Один');
    expect(JSON.stringify(dto!.tracks[0])).not.toContain('lyrics');
    expect(JSON.stringify(dto!.tracks[0])).not.toContain('content');
  });

  test('locks subscribers_only tracks without premium', () => {
    const dto = mapLocalesToAlbumDetails(
      [
        locale({
          lang: 'en',
          tracks: [
            {
              trackId: 'locked',
              title: 'Locked',
              duration: 60,
              src: 'secret.mp3',
              orderIndex: 0,
              visibility: 'subscribers_only',
              stemsVisibility: 'hidden',
              audioContainer: null,
              audioCodec: null,
              audioBitrate: null,
              audioSampleRate: null,
              audioBitDepth: null,
              audioChannels: null,
              audioDuration: null,
              audioFileSize: null,
            },
          ],
        }),
      ],
      { hasPremiumAccess: false, monetizationEnabled: true }
    );

    expect(dto!.tracks[0]?.playbackLocked).toBe(true);
    expect(dto!.tracks[0]?.src).toBe('');
    expect(dto!.tracks[0]?.visibility).toBe('subscribers_only');
  });

  test('filters fully hidden tracks from public album page', () => {
    const dto = mapLocalesToAlbumDetails(
      [
        locale({
          lang: 'en',
          tracks: [
            {
              trackId: 'hidden',
              title: 'Hidden',
              duration: 60,
              src: 'h.mp3',
              orderIndex: 0,
              visibility: 'hidden',
              stemsVisibility: 'hidden',
              audioContainer: null,
              audioCodec: null,
              audioBitrate: null,
              audioSampleRate: null,
              audioBitDepth: null,
              audioChannels: null,
              audioDuration: null,
              audioFileSize: null,
            },
            {
              trackId: 'mixer-only',
              title: 'Mixer',
              duration: 60,
              src: 'm.mp3',
              orderIndex: 1,
              visibility: 'hidden',
              stemsVisibility: 'public',
              audioContainer: null,
              audioCodec: null,
              audioBitrate: null,
              audioSampleRate: null,
              audioBitDepth: null,
              audioChannels: null,
              audioDuration: null,
              audioFileSize: null,
            },
          ],
        }),
      ],
      { hasPremiumAccess: true, monetizationEnabled: true }
    );

    expect(dto!.tracks.map((t) => t.id)).toEqual(['mixer-only']);
  });

  test('isAlbumDetailsVisibleToPublicViewer gates unpublished albums', () => {
    const dto = mapLocalesToAlbumDetails([locale({ lang: 'en', isPublished: false })], {
      hasPremiumAccess: true,
      monetizationEnabled: true,
    });
    expect(isAlbumDetailsVisibleToPublicViewer(dto!)).toBe(false);
  });
});
