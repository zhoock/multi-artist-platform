import { describe, expect, test, jest, beforeEach } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

import { query } from '../db';
import {
  resolveAlbumPurchasePricing,
  resolveValidatedAlbumCheckoutPricing,
  validateAlbumCheckoutPricing,
  parseAlbumRegularPrice,
} from '../resolve-album-purchase';

const mockedQuery = query as jest.MockedFunction<typeof query>;

function mockAlbumRow(overrides: Partial<Record<string, unknown>> = {}) {
  mockedQuery.mockResolvedValueOnce({
    rows: [
      {
        album_slug: 'sample-album',
        title: 'Sample Album',
        release: {
          allowDownloadSale: 'yes',
          regularPrice: '4.99',
          currency: 'RUB',
        },
        is_published: true,
        artist_display_name: 'Test Artist',
        ...overrides,
      },
    ],
    rowCount: 1,
    command: '',
    oid: 0,
    fields: [],
  });
}

describe('resolveAlbumPurchasePricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loads amount and description from album release JSON', async () => {
    mockAlbumRow();

    const result = await resolveAlbumPurchasePricing('sample-album');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.pricing.amount).toBe(4.99);
    expect(result.pricing.priceMissing).toBe(false);
    expect(result.pricing.currency).toBe('RUB');
    expect(result.pricing.albumSlug).toBe('sample-album');
    expect(result.pricing.description).toBe('Sample Album - Test Artist (download)');
  });

  test('returns 404 when album is missing', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await resolveAlbumPurchasePricing('missing-album');
    expect(result).toEqual({ ok: false, statusCode: 404, error: 'Album not found' });
  });
});

describe('parseAlbumRegularPrice', () => {
  test('accepts valid numeric strings and numbers', () => {
    expect(parseAlbumRegularPrice('4.99')).toBe(4.99);
    expect(parseAlbumRegularPrice(10)).toBe(10);
    expect(parseAlbumRegularPrice('0.01')).toBe(0.01);
  });

  test('rejects missing, empty, NaN, and sub-minimum values', () => {
    expect(parseAlbumRegularPrice(null)).toBeNull();
    expect(parseAlbumRegularPrice(undefined)).toBeNull();
    expect(parseAlbumRegularPrice('')).toBeNull();
    expect(parseAlbumRegularPrice('   ')).toBeNull();
    expect(parseAlbumRegularPrice('abc')).toBeNull();
    expect(parseAlbumRegularPrice('-1')).toBeNull();
    expect(parseAlbumRegularPrice('0')).toBeNull();
    expect(parseAlbumRegularPrice('0.001')).toBeNull();
  });
});

describe('validateAlbumCheckoutPricing', () => {
  const basePricing = {
    albumSlug: 'a',
    albumTitle: 'A',
    artistDisplayName: 'Artist',
    amount: 4.99,
    priceMissing: false,
    currency: 'RUB',
    allowDownloadSale: 'yes',
    isPublished: true,
    description: 'A - Artist (download)',
  };

  test('rejects unpublished albums', () => {
    const error = validateAlbumCheckoutPricing({
      ...basePricing,
      isPublished: false,
    });

    expect(error).toEqual({ statusCode: 400, error: 'Album is not available for purchase' });
  });

  test('rejects albums without paid sale enabled', () => {
    const error = validateAlbumCheckoutPricing({
      ...basePricing,
      allowDownloadSale: 'no',
    });

    expect(error).toEqual({ statusCode: 400, error: 'Album is not available for purchase' });
  });

  test('rejects missing configured price', () => {
    const error = validateAlbumCheckoutPricing({
      ...basePricing,
      priceMissing: true,
      amount: 0,
    });

    expect(error).toEqual({ statusCode: 400, error: 'Album price is not configured' });
  });

  test('rejects invalid or free prices', () => {
    const error = validateAlbumCheckoutPricing({
      ...basePricing,
      amount: 0,
    });

    expect(error).toEqual({ statusCode: 400, error: 'Album price is invalid' });
  });
});

describe('resolveValidatedAlbumCheckoutPricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts purchasable album', async () => {
    mockAlbumRow();

    const result = await resolveValidatedAlbumCheckoutPricing('sample-album');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pricing.amount).toBe(4.99);
  });

  test('rejects free-sale albums', async () => {
    mockAlbumRow({
      release: { allowDownloadSale: 'no', regularPrice: '4.99', currency: 'RUB' },
    });

    const result = await resolveValidatedAlbumCheckoutPricing('sample-album');
    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'Album is not available for purchase',
    });
  });

  test('rejects sellable album without configured price', async () => {
    mockAlbumRow({
      release: { allowDownloadSale: 'yes', currency: 'RUB' },
    });

    const result = await resolveValidatedAlbumCheckoutPricing('sample-album');
    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'Album price is not configured',
    });
  });

  test('rejects sellable album with invalid numeric price', async () => {
    mockAlbumRow({
      release: { allowDownloadSale: 'yes', regularPrice: '-5', currency: 'RUB' },
    });

    const result = await resolveValidatedAlbumCheckoutPricing('sample-album');
    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      error: 'Album price is invalid',
    });
  });
});
