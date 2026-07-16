import { describe, expect, test } from '@jest/globals';

import { resolveArticlePaywallKind } from '../resolveArticlePaywallKind';

describe('resolveArticlePaywallKind', () => {
  test('returns none when article is unlocked', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: false,
        isPremium: false,
        premiumLoading: false,
      })
    ).toBe('none');
  });

  test('returns pending while premium status is loading', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: true,
        isPremium: false,
        premiumLoading: true,
      })
    ).toBe('pending');
  });

  test('returns subscription when locked without premium and not in collection', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: true,
        isPremium: false,
        artistInArchive: false,
        premiumLoading: false,
      })
    ).toBe('subscription');
  });

  test('returns renew when locked without premium but artist is in collection', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: true,
        isPremium: false,
        artistInArchive: true,
        premiumLoading: false,
      })
    ).toBe('renew');
  });

  test('returns archive when locked with premium and artist not in collection', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: true,
        isPremium: true,
        artistInArchive: false,
        premiumLoading: false,
      })
    ).toBe('archive');
  });

  test('returns none when locked but user has premium and artist in collection', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: true,
        isPremium: true,
        artistInArchive: true,
        premiumLoading: false,
      })
    ).toBe('none');
  });

  test('returns pending while archive membership is loading', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: true,
        isPremium: true,
        artistInArchive: false,
        premiumLoading: false,
        archiveLoading: true,
      })
    ).toBe('pending');
  });
});
