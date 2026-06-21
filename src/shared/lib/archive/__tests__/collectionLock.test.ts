import { describe, expect, test } from '@jest/globals';

import {
  canRemoveCollectionArtist,
  isCollectionArtistLocked,
  normalizeCollectionArchive,
  normalizeCollectionArtist,
} from '@shared/lib/archive/collectionLock';

const LOCKED_UNTIL = '2026-07-20T12:00:00.000Z';
const NOW = new Date('2026-06-20T12:00:00.000Z');

function artist(overrides: Partial<Parameters<typeof normalizeCollectionArtist>[0]> = {}) {
  return {
    id: '1',
    artistUserId: 'a1',
    slug: 'artist',
    name: 'Artist',
    genreCode: 'rock',
    genreLabel: { en: 'Rock', ru: 'Рок' },
    cover: null,
    addedAt: '2026-01-01',
    isActive: true,
    lockedUntil: LOCKED_UNTIL,
    isLocked: true,
    ...overrides,
  };
}

describe('isCollectionArtistLocked', () => {
  test('returns false for inactive artists even with future lockedUntil', () => {
    expect(
      isCollectionArtistLocked(
        artist({ isActive: false, lockedUntil: LOCKED_UNTIL, isLocked: true }),
        NOW
      )
    ).toBe(false);
  });

  test('returns true for active artists with future lockedUntil', () => {
    expect(isCollectionArtistLocked(artist(), NOW)).toBe(true);
  });
});

describe('canRemoveCollectionArtist', () => {
  test('allows removing inactive artists regardless of lock', () => {
    expect(
      canRemoveCollectionArtist(
        artist({ isActive: false, lockedUntil: LOCKED_UNTIL, isLocked: true }),
        true,
        NOW
      )
    ).toBe(true);
  });

  test('blocks removing locked active artists', () => {
    expect(canRemoveCollectionArtist(artist(), true, NOW)).toBe(false);
  });
});

describe('normalizeCollectionArtist', () => {
  test('clears lock fields for inactive artists', () => {
    const normalized = normalizeCollectionArtist(
      artist({ isActive: false, lockedUntil: LOCKED_UNTIL, isLocked: true })
    );

    expect(normalized.isActive).toBe(false);
    expect(normalized.lockedUntil).toBeNull();
    expect(normalized.isLocked).toBe(false);
  });
});

describe('normalizeCollectionArchive', () => {
  test('recomputes slot counts from normalized artists', () => {
    const normalized = normalizeCollectionArchive({
      isPremium: true,
      slotsUsed: 2,
      slotsLimit: 3,
      inactiveCount: 0,
      artists: [
        artist(),
        artist({ id: '2', artistUserId: 'a2', isActive: false, lockedUntil: LOCKED_UNTIL }),
      ],
    });

    expect(normalized.slotsUsed).toBe(1);
    expect(normalized.inactiveCount).toBe(1);
    expect(normalized.artists[1]?.lockedUntil).toBeNull();
    expect(normalized.artists[1]?.isLocked).toBe(false);
  });
});
