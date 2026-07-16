import { describe, expect, test } from '@jest/globals';
import {
  resolveArtistPageBuilderVisibility,
  resolveArtistPageSkeletonVariant,
  shouldShowArtistPageBuilderBlock,
} from '../resolveArtistPageBuilderVisibility';

const ownerReady = {
  isOwner: true,
  ownerResolved: true,
  ownerContentLoaded: true,
  ownerStillNeedsOnboarding: false,
};

describe('resolveArtistPageBuilderVisibility', () => {
  test('returns hidden for visitors', () => {
    expect(
      resolveArtistPageBuilderVisibility({
        isOwner: false,
        ownerResolved: true,
        ownerContentLoaded: true,
        ownerStillNeedsOnboarding: false,
      })
    ).toEqual({ mode: 'hidden', canShowBlocks: false });
  });

  test('returns hidden during onboarding', () => {
    expect(
      resolveArtistPageBuilderVisibility({
        ...ownerReady,
        ownerStillNeedsOnboarding: true,
      })
    ).toEqual({ mode: 'hidden', canShowBlocks: false });
  });

  test('returns active for owner after onboarding', () => {
    expect(resolveArtistPageBuilderVisibility(ownerReady)).toEqual({
      mode: 'active',
      canShowBlocks: true,
    });
  });

  test('returns hidden when hints preference is hide', () => {
    expect(
      resolveArtistPageBuilderVisibility({
        ...ownerReady,
        hintsPreference: 'hide',
      })
    ).toEqual({ mode: 'hidden', canShowBlocks: false });
  });
});

describe('shouldShowArtistPageBuilderBlock', () => {
  test('shows block only for owner with empty section', () => {
    expect(shouldShowArtistPageBuilderBlock({ canShowBlocks: true }, true)).toBe(true);
    expect(shouldShowArtistPageBuilderBlock({ canShowBlocks: true }, false)).toBe(false);
    expect(shouldShowArtistPageBuilderBlock({ canShowBlocks: false }, true)).toBe(false);
  });
});

describe('resolveArtistPageSkeletonVariant', () => {
  test('returns public for visitors', () => {
    expect(
      resolveArtistPageSkeletonVariant({
        canShowBlocks: false,
        isOwner: false,
        ownerResolved: true,
        ownerContentLoaded: true,
        ownerStillNeedsOnboarding: false,
      })
    ).toBe('public');
  });

  test('returns builder when canShowBlocks is already true', () => {
    expect(
      resolveArtistPageSkeletonVariant({
        canShowBlocks: true,
        isOwner: true,
        ownerResolved: true,
        ownerContentLoaded: true,
        ownerStillNeedsOnboarding: false,
      })
    ).toBe('builder');
  });

  test('returns builder while owner content hydrates after identity is known', () => {
    expect(
      resolveArtistPageSkeletonVariant({
        canShowBlocks: false,
        isOwner: true,
        ownerResolved: true,
        ownerContentLoaded: false,
        ownerStillNeedsOnboarding: false,
      })
    ).toBe('builder');
  });

  test('returns public while onboarding is still required', () => {
    expect(
      resolveArtistPageSkeletonVariant({
        canShowBlocks: false,
        isOwner: true,
        ownerResolved: true,
        ownerContentLoaded: false,
        ownerStillNeedsOnboarding: true,
      })
    ).toBe('public');
  });
});
