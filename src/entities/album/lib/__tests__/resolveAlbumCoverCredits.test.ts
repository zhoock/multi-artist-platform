import { describe, expect, it } from '@jest/globals';
import type { IAlbums } from '@models';

import {
  resolveAlbumCoverCreditFieldForEdit,
  resolveAlbumCoverReleaseFieldsForDisplay,
} from '../resolveAlbumDisplay';

function albumWithCoverCredits(partial: {
  en?: Partial<NonNullable<IAlbums['translations']>['en']>;
  ru?: Partial<NonNullable<IAlbums['translations']>['ru']>;
  release?: Record<string, string>;
}): IAlbums {
  return {
    albumId: 'a1',
    artist: 'Artist',
    album: 'Album',
    release: partial.release,
    translations: {
      ...(partial.en
        ? {
            en: {
              fullName: 'Artist — Album',
              description: '',
              details: [],
              ...partial.en,
            },
          }
        : {}),
      ...(partial.ru
        ? {
            ru: {
              fullName: 'Artist — Album',
              description: '',
              details: [],
              ...partial.ru,
            },
          }
        : {}),
    },
  } as IAlbums;
}

describe('resolveAlbumCoverCreditFieldForEdit', () => {
  it('keeps empty RU designerURL instead of falling back to EN', () => {
    const album = albumWithCoverCredits({
      en: { designerURL: 'https://en.example/designer' },
      ru: { designerURL: '' },
    });

    const resolved = resolveAlbumCoverCreditFieldForEdit(album, 'designerURL', 'ru');

    expect(resolved.value).toBe('');
    expect(resolved.isFallback).toBe(false);
    expect(resolved.source).toBe('ru');
  });

  it('reads current-locale value when present', () => {
    const album = albumWithCoverCredits({
      en: { designerURL: 'https://en.example/designer' },
      ru: { designerURL: 'https://ru.example/designer' },
    });

    expect(resolveAlbumCoverCreditFieldForEdit(album, 'designerURL', 'ru').value).toBe(
      'https://ru.example/designer'
    );
  });

  it('does not pull EN designerURL into RU when RU key is missing', () => {
    const album = albumWithCoverCredits({
      en: { designerURL: 'https://en.example/designer' },
      ru: { photographer: 'Фото' },
    });

    const resolved = resolveAlbumCoverCreditFieldForEdit(album, 'designerURL', 'ru');

    expect(resolved.value).toBe('');
    expect(resolved.isFallback).toBe(false);
  });
});

describe('resolveAlbumCoverReleaseFieldsForDisplay', () => {
  it('does not show EN designer URL on RU page after RU field was cleared', () => {
    const album = albumWithCoverCredits({
      en: { designerURL: 'https://en.example/designer', designer: 'EN Designer' },
      ru: { designerURL: '', designer: '' },
    });

    const fields = resolveAlbumCoverReleaseFieldsForDisplay(album, 'ru');

    expect(fields.designerURL).toBe('');
    expect(fields.designer).toBe('');
  });
});
