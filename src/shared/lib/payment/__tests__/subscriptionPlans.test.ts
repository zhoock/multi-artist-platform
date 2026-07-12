import { describe, expect, test } from '@jest/globals';

import {
  comparePlanTiers,
  formatCollectionMenuSubtitle,
  formatPlanArtistLimit,
  formatPlanStatusLabel,
  formatPlanSupportDuration,
  getPlanAmountRub,
  isCollectionOverPlanLimit,
  PLAN_CATALOG,
  resolveCurrentPlanSlug,
  resolvePlanCardAction,
  getPlanCardBadgeLabel,
  resolvePlanSlugFromSlotsLimit,
  shouldConfirmSubscriptionPlanChange,
} from '../subscriptionPlans';

describe('PLAN_CATALOG (client)', () => {
  test('uses dev slot limits', () => {
    expect(PLAN_CATALOG.explorer.slotsLimit).toBe(1);
    expect(PLAN_CATALOG.collector.slotsLimit).toBe(2);
    expect(PLAN_CATALOG.archivist.slotsLimit).toBe(3);
  });

  test('uses 1-hour support period in development', () => {
    expect(formatPlanSupportDuration('explorer', 'en')).toBe('1 hour support period');
  });
});

describe('resolvePlanSlugFromSlotsLimit', () => {
  test('maps dev slot limits to plan slugs', () => {
    expect(resolvePlanSlugFromSlotsLimit(1)).toBe('explorer');
    expect(resolvePlanSlugFromSlotsLimit(2)).toBe('collector');
    expect(resolvePlanSlugFromSlotsLimit(3)).toBe('archivist');
    expect(resolvePlanSlugFromSlotsLimit(99)).toBeNull();
  });
});

describe('resolveCurrentPlanSlug', () => {
  test('returns plan for active subscription', () => {
    expect(resolveCurrentPlanSlug({ isPremium: true, slotsLimit: 2, slotsUsed: 1 })).toBe(
      'collector'
    );
  });

  test('returns plan for inactive subscription with collection', () => {
    expect(resolveCurrentPlanSlug({ isPremium: false, slotsLimit: 1, slotsUsed: 1 })).toBe(
      'explorer'
    );
  });

  test('returns null for new user with default fallback limit', () => {
    expect(resolveCurrentPlanSlug({ isPremium: false, slotsLimit: 3, slotsUsed: 0 })).toBeNull();
  });

  test('returns explorer for expired subscription without collection', () => {
    expect(resolveCurrentPlanSlug({ isPremium: false, slotsLimit: 1, slotsUsed: 0 })).toBe(
      'explorer'
    );
  });
});

describe('resolvePlanCardAction', () => {
  test('shows choose label for first purchase', () => {
    expect(
      resolvePlanCardAction({
        planSlug: 'collector',
        currentPlanSlug: null,
        isPremium: false,
        lang: 'en',
      }).label
    ).toBe('Choose Collector');
  });

  test('shows switch label for upgrade', () => {
    expect(
      resolvePlanCardAction({
        planSlug: 'archivist',
        currentPlanSlug: 'explorer',
        isPremium: true,
        lang: 'en',
      }).label
    ).toBe('Switch to Archivist');
  });

  test('shows current plan label for active subscription', () => {
    expect(
      resolvePlanCardAction({
        planSlug: 'explorer',
        currentPlanSlug: 'explorer',
        isPremium: true,
        lang: 'en',
      })
    ).toEqual({
      label: 'Current Plan',
      variant: 'outline',
      badge: 'current',
      disabled: true,
    });
  });

  test('shows renew label for expired current plan', () => {
    expect(
      resolvePlanCardAction({
        planSlug: 'collector',
        currentPlanSlug: 'collector',
        isPremium: false,
        lang: 'en',
      })
    ).toEqual({
      label: 'Renew Collector',
      variant: 'outline',
      badge: 'expired',
      disabled: false,
    });
  });

  test('returns badge labels for current and expired states', () => {
    expect(getPlanCardBadgeLabel('current', 'en')).toBe('Current Plan');
    expect(getPlanCardBadgeLabel('expired', 'ru')).toBe('Истёк');
    expect(getPlanCardBadgeLabel(null, 'en')).toBeNull();
  });
});

describe('comparePlanTiers', () => {
  test('orders explorer < collector < archivist', () => {
    expect(comparePlanTiers('explorer', 'collector')).toBe(-1);
    expect(comparePlanTiers('archivist', 'explorer')).toBe(1);
    expect(comparePlanTiers('collector', 'collector')).toBe(0);
  });
});

describe('shouldConfirmSubscriptionPlanChange', () => {
  test('requires confirmation when switching between existing plans', () => {
    expect(shouldConfirmSubscriptionPlanChange('explorer', 'collector')).toBe(true);
    expect(shouldConfirmSubscriptionPlanChange('collector', 'archivist')).toBe(true);
    expect(shouldConfirmSubscriptionPlanChange('archivist', 'explorer')).toBe(true);
  });

  test('skips confirmation for renew and first purchase', () => {
    expect(shouldConfirmSubscriptionPlanChange('explorer', 'explorer')).toBe(false);
    expect(shouldConfirmSubscriptionPlanChange(null, 'collector')).toBe(false);
  });
});

describe('getPlanAmountRub', () => {
  test('returns dev test price', () => {
    expect(getPlanAmountRub('explorer')).toBe(1);
  });
});

describe('formatPlanStatusLabel', () => {
  test('formats active plan label', () => {
    expect(formatPlanStatusLabel('collector', true, 'en')).toBe('Collector · Active support');
  });

  test('formats inactive plan label', () => {
    expect(formatPlanStatusLabel('explorer', false, 'ru')).toBe('Explorer · поддержка неактивна');
  });
});

describe('formatCollectionMenuSubtitle', () => {
  test('formats explorer with one artist', () => {
    expect(formatCollectionMenuSubtitle('explorer', 1, 'en')).toBe('Explorer • 1 artist');
  });

  test('formats collector with two artists', () => {
    expect(formatCollectionMenuSubtitle('collector', 2, 'en')).toBe('Collector • 2 artists');
  });

  test('formats archivist with three artists', () => {
    expect(formatCollectionMenuSubtitle('archivist', 3, 'en')).toBe('Archivist • 3 artists');
  });

  test('formats no active plan when plan slug is missing', () => {
    expect(formatCollectionMenuSubtitle(null, 0, 'en')).toBe('No active plan');
    expect(formatCollectionMenuSubtitle(null, 0, 'ru')).toBe('Нет активного плана');
  });

  test('formats Russian artist plural forms', () => {
    expect(formatCollectionMenuSubtitle('explorer', 1, 'ru')).toBe('Explorer • 1 артист');
    expect(formatCollectionMenuSubtitle('collector', 2, 'ru')).toBe('Collector • 2 артиста');
    expect(formatCollectionMenuSubtitle('archivist', 5, 'ru')).toBe('Archivist • 5 артистов');
  });
});

describe('isCollectionOverPlanLimit', () => {
  test('detects overage', () => {
    expect(isCollectionOverPlanLimit(3, 2)).toBe(true);
  });

  test('returns false when within limit', () => {
    expect(isCollectionOverPlanLimit(2, 3)).toBe(false);
  });
});

describe('formatPlanArtistLimit', () => {
  test('formats singular artist copy', () => {
    expect(formatPlanArtistLimit('explorer', 'en')).toBe('Up to 1 artist');
  });

  test('formats plural artist copy', () => {
    expect(formatPlanArtistLimit('archivist', 'en')).toBe('Up to 3 artists');
  });
});
