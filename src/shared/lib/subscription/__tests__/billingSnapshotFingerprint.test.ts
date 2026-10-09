import { describe, expect, test } from '@jest/globals';

import { collectionArchiveEntitlementFingerprint } from '../billingSnapshotFingerprint';

describe('collectionArchiveEntitlementFingerprint', () => {
  test('ignores billing-only differences when artist rows are unchanged', () => {
    const artists = [
      {
        id: '1',
        artistUserId: 'a1',
        name: 'A',
        slug: 'a',
        genreCode: 'rock',
        genreLabel: { en: 'Rock', ru: 'Рок' },
        cover: null,
        addedAt: '2026-01-01',
        isActive: true,
        isLocked: true,
        lockedUntil: '2026-08-01T12:00:00.000Z',
      },
    ];

    const base = {
      slotsUsed: 1,
      inactiveCount: 0,
      artists,
    };

    expect(collectionArchiveEntitlementFingerprint(base)).toBe(
      collectionArchiveEntitlementFingerprint({ ...base, artists: [...artists] })
    );
  });

  test('changes when lockedUntil updates', () => {
    const before = collectionArchiveEntitlementFingerprint({
      slotsUsed: 1,
      inactiveCount: 0,
      artists: [
        {
          id: '1',
          artistUserId: 'a1',
          name: 'A',
          slug: 'a',
          genreCode: 'rock',
          genreLabel: { en: 'Rock', ru: 'Рок' },
          cover: null,
          addedAt: '2026-01-01',
          isActive: true,
          isLocked: true,
          lockedUntil: '2026-08-01T12:00:00.000Z',
        },
      ],
    });

    const after = collectionArchiveEntitlementFingerprint({
      slotsUsed: 1,
      inactiveCount: 0,
      artists: [
        {
          id: '1',
          artistUserId: 'a1',
          name: 'A',
          slug: 'a',
          genreCode: 'rock',
          genreLabel: { en: 'Rock', ru: 'Рок' },
          cover: null,
          addedAt: '2026-01-01',
          isActive: true,
          isLocked: false,
          lockedUntil: null,
        },
      ],
    });

    expect(before).not.toBe(after);
  });
});
