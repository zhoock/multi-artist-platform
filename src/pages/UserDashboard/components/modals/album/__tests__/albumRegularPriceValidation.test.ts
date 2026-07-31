import { describe, expect, test } from '@jest/globals';
import {
  getAlbumStep1InvalidFields,
  isAlbumRegularPriceInputValid,
  parseAlbumRegularPriceInput,
} from '../EditAlbumModal.utils';
import type { AlbumFormData } from '../EditAlbumModal.types';

function formWithPrice(
  regularPrice: string,
  allowDownloadSale: AlbumFormData['allowDownloadSale']
) {
  return {
    title: 'Album',
    releaseDate: '01/01/2024',
    upcEan: '123',
    description: 'Desc',
    regularPrice,
    allowDownloadSale,
    preorderReleaseDate: '',
  } as AlbumFormData;
}

describe('albumRegularPriceValidation', () => {
  test('parseAlbumRegularPriceInput accepts valid values', () => {
    expect(parseAlbumRegularPriceInput('4.99')).toBe(4.99);
    expect(parseAlbumRegularPriceInput('0.01')).toBe(0.01);
  });

  test('parseAlbumRegularPriceInput rejects empty and invalid values', () => {
    expect(parseAlbumRegularPriceInput('')).toBeNull();
    expect(parseAlbumRegularPriceInput('abc')).toBeNull();
    expect(parseAlbumRegularPriceInput('-1')).toBeNull();
    expect(parseAlbumRegularPriceInput('0')).toBeNull();
  });

  test('isAlbumRegularPriceInputValid mirrors parser', () => {
    expect(isAlbumRegularPriceInputValid('9.99')).toBe(true);
    expect(isAlbumRegularPriceInputValid('NaN')).toBe(false);
  });

  test('getAlbumStep1InvalidFields requires valid price when sale is enabled', () => {
    expect(
      getAlbumStep1InvalidFields(formWithPrice('', 'yes'), {
        cover: { albumArtPreview: 'cover.png', coverDraftKey: null },
      })
    ).toContain('regularPrice');

    expect(
      getAlbumStep1InvalidFields(formWithPrice('abc', 'yes'), {
        cover: { albumArtPreview: 'cover.png', coverDraftKey: null },
      })
    ).toContain('regularPrice');

    expect(
      getAlbumStep1InvalidFields(formWithPrice('4.99', 'yes'), {
        cover: { albumArtPreview: 'cover.png', coverDraftKey: null },
      })
    ).not.toContain('regularPrice');
  });

  test('getAlbumStep1InvalidFields skips price when sale is disabled', () => {
    expect(
      getAlbumStep1InvalidFields(formWithPrice('', 'no'), {
        cover: { albumArtPreview: 'cover.png', coverDraftKey: null },
      })
    ).not.toContain('regularPrice');
  });
});
