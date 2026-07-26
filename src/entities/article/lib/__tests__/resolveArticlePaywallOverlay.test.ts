import { describe, expect, test } from '@jest/globals';

import { isArticlePaywallOverlayPending } from '../resolveArticlePaywallOverlay';

describe('isArticlePaywallOverlayPending', () => {
  test('returns false for unlocked articles', () => {
    expect(
      isArticlePaywallOverlayPending({
        showLocked: false,
        paywallKind: 'none',
        premiumLoading: false,
        archiveLoading: false,
      })
    ).toBe(false);
  });

  test('returns false when paywall kind is resolved', () => {
    expect(
      isArticlePaywallOverlayPending({
        showLocked: true,
        paywallKind: 'archive',
        premiumLoading: false,
        archiveLoading: false,
      })
    ).toBe(false);
  });

  test('returns true while premium status is loading', () => {
    expect(
      isArticlePaywallOverlayPending({
        showLocked: true,
        paywallKind: 'subscription',
        premiumLoading: true,
        archiveLoading: false,
      })
    ).toBe(true);
  });

  test('returns true while archive status is loading', () => {
    expect(
      isArticlePaywallOverlayPending({
        showLocked: true,
        paywallKind: 'subscription',
        premiumLoading: false,
        archiveLoading: true,
      })
    ).toBe(true);
  });

  test('returns true for pending paywall kind', () => {
    expect(
      isArticlePaywallOverlayPending({
        showLocked: true,
        paywallKind: 'pending',
        premiumLoading: false,
        archiveLoading: false,
      })
    ).toBe(true);
  });
});
