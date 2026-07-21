/**
 * Server-side checkout ownership gate (create-payment).
 */

import { describe, expect, test, jest, beforeEach } from '@jest/globals';

jest.mock('../db', () => ({
  query: jest.fn(),
  isMissingRelationError: jest.fn(() => false),
}));

jest.mock('../purchase-schema', () => ({
  activePurchaseFilter: jest.fn(async () => ''),
  purchasesHasUserIdColumn: jest.fn(async () => true),
  purchasesHasRevokedColumns: jest.fn(async () => true),
}));

jest.mock('../entitlements', () => ({
  getViewerEmailLower: jest.fn(),
  viewerPurchasedAlbum: jest.fn(),
}));

import { query } from '../db';
import { getViewerEmailLower, viewerPurchasedAlbum } from '../entitlements';
import { buyerAlreadyOwnsAlbumForCheckout } from '../purchase-access';

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetViewerEmailLower = getViewerEmailLower as jest.MockedFunction<
  typeof getViewerEmailLower
>;
const mockedViewerPurchasedAlbum = viewerPurchasedAlbum as jest.MockedFunction<
  typeof viewerPurchasedAlbum
>;

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ALBUM_SLUG = 'sample-album';

function purchaseExists(exists: boolean) {
  mockedQuery.mockResolvedValueOnce({
    rows: exists ? [{ one: 1 }] : [],
    rowCount: exists ? 1 : 0,
    command: '',
    oid: 0,
    fields: [],
  });
}

describe('buyerAlreadyOwnsAlbumForCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns true when authenticated user owns album via account', async () => {
    mockedGetViewerEmailLower.mockResolvedValueOnce('buyer@example.com');
    purchaseExists(true);

    const owned = await buyerAlreadyOwnsAlbumForCheckout(USER_ID, 'buyer@example.com', ALBUM_SLUG);

    expect(owned).toBe(true);
    expect(mockedViewerPurchasedAlbum).not.toHaveBeenCalled();
  });

  test('returns true when checkout email already has an active purchase', async () => {
    mockedGetViewerEmailLower.mockResolvedValueOnce('buyer@example.com');
    purchaseExists(false);
    mockedViewerPurchasedAlbum.mockResolvedValueOnce(true);

    const owned = await buyerAlreadyOwnsAlbumForCheckout(USER_ID, 'legacy@example.com', ALBUM_SLUG);

    expect(owned).toBe(true);
    expect(mockedViewerPurchasedAlbum).toHaveBeenCalledWith(ALBUM_SLUG, 'legacy@example.com');
  });

  test('returns true for guest checkout when email already purchased', async () => {
    mockedViewerPurchasedAlbum.mockResolvedValueOnce(true);

    const owned = await buyerAlreadyOwnsAlbumForCheckout(null, 'Guest@Example.com', ALBUM_SLUG);

    expect(owned).toBe(true);
    expect(mockedGetViewerEmailLower).not.toHaveBeenCalled();
    expect(mockedViewerPurchasedAlbum).toHaveBeenCalledWith(ALBUM_SLUG, 'guest@example.com');
  });

  test('returns false when neither account nor checkout email owns the album', async () => {
    mockedGetViewerEmailLower.mockResolvedValueOnce('buyer@example.com');
    purchaseExists(false);
    mockedViewerPurchasedAlbum.mockResolvedValueOnce(false);

    const owned = await buyerAlreadyOwnsAlbumForCheckout(USER_ID, 'buyer@example.com', ALBUM_SLUG);

    expect(owned).toBe(false);
  });
});
