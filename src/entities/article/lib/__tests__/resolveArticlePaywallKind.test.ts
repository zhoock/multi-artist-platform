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

  test('returns subscription when locked without premium', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: true,
        isPremium: false,
        premiumLoading: false,
      })
    ).toBe('subscription');
  });

  test('returns archive when locked with premium', () => {
    expect(
      resolveArticlePaywallKind({
        articleLocked: true,
        isPremium: true,
        premiumLoading: false,
      })
    ).toBe('archive');
  });
});
