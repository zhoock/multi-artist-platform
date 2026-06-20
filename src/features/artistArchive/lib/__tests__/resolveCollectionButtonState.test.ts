import { describe, expect, test } from '@jest/globals';

import type { ArchiveStatus } from '@shared/api/archive';
import { resolveCollectionButtonState } from '../resolveCollectionButtonState';

const ARTIST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function status(
  partial: Partial<ArchiveStatus> & Pick<ArchiveStatus, 'artistInArchive' | 'isPremium'>
): ArchiveStatus {
  return {
    slotsUsed: 1,
    slotsLimit: 3,
    ...partial,
  };
}

describe('resolveCollectionButtonState', () => {
  test('artist in collection with active subscription', () => {
    expect(
      resolveCollectionButtonState({
        artistUserId: ARTIST_ID,
        isOwner: false,
        status: status({ artistInArchive: true, isPremium: true }),
        loading: false,
        adding: false,
        hasToken: true,
      })
    ).toBe('in_collection_active');
  });

  test('artist in collection with inactive subscription', () => {
    expect(
      resolveCollectionButtonState({
        artistUserId: ARTIST_ID,
        isOwner: false,
        status: status({ artistInArchive: true, isPremium: false }),
        loading: false,
        adding: false,
        hasToken: true,
      })
    ).toBe('in_collection_inactive');
  });

  test('not in collection without subscription', () => {
    expect(
      resolveCollectionButtonState({
        artistUserId: ARTIST_ID,
        isOwner: false,
        status: status({ artistInArchive: false, isPremium: false }),
        loading: false,
        adding: false,
        hasToken: true,
      })
    ).toBe('not_premium');
  });

  test('not in collection with subscription and free slot', () => {
    expect(
      resolveCollectionButtonState({
        artistUserId: ARTIST_ID,
        isOwner: false,
        status: status({ artistInArchive: false, isPremium: true, slotsUsed: 1, slotsLimit: 3 }),
        loading: false,
        adding: false,
        hasToken: true,
      })
    ).toBe('can_add');
  });
});
