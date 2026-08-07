import { describe, expect, test } from '@jest/globals';

import {
  comparePlanTiers,
  formatCollectionMenuSubtitle,
  formatPlanStatusLabel,
  formatPlanSupportDuration,
  getPlanAmountRub,
  isCollectionOverPlanLimit,
  PLAN_CATALOG,
  resolveCurrentPlanSlug,
  resolvePlanCardAction,
  getPlanCardBadgeLabel,
  resolvePlanSlugFromSlotsLimit,
  resolvePlanChangeAction,
  resolveRecommendedPlanSlug,
  shouldConfirmSubscriptionPlanChange,
} from '../subscriptionPlans';

describe('PLAN_CATALOG (client)', () => {
  test('uses production slot limits', () => {
    expect(PLAN_CATALOG.explorer.slotsLimit).toBe(20);
    expect(PLAN_CATALOG.collector.slotsLimit).toBe(60);
    expect(PLAN_CATALOG.archivist.slotsLimit).toBe(100);
  });

  test('uses 30-day support period label in development', () => {
    expect(formatPlanSupportDuration('explorer', 'en')).toBe('30 days support period');
  });
});

describe('resolvePlanSlugFromSlotsLimit', () => {
  test('maps production slot limits to plan slugs', () => {
    expect(resolvePlanSlugFromSlotsLimit(20)).toBe('explorer');
    expect(resolvePlanSlugFromSlotsLimit(60)).toBe('collector');
    expect(resolvePlanSlugFromSlotsLimit(100)).toBe('archivist');
    expect(resolvePlanSlugFromSlotsLimit(99)).toBeNull();
  });
});

describe('resolveCurrentPlanSlug', () => {
  test('returns plan for active subscription', () => {
    expect(resolveCurrentPlanSlug({ isPremium: true, slotsLimit: 60, slotsUsed: 1 })).toBe(
      'collector'
    );
  });

  test('returns plan for inactive subscription with collection', () => {
    expect(resolveCurrentPlanSlug({ isPremium: false, slotsLimit: 20, slotsUsed: 1 })).toBe(
      'explorer'
    );
  });

  test('returns null for new user with default fallback limit', () => {
    expect(resolveCurrentPlanSlug({ isPremium: false, slotsLimit: 100, slotsUsed: 0 })).toBeNull();
  });

  test('returns explorer for expired subscription without collection', () => {
    expect(resolveCurrentPlanSlug({ isPremium: false, slotsLimit: 20, slotsUsed: 0 })).toBe(
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

describe('resolveRecommendedPlanSlug', () => {
  test('returns the next tier after the current plan', () => {
    expect(resolveRecommendedPlanSlug('explorer')).toBe('collector');
    expect(resolveRecommendedPlanSlug('collector')).toBe('archivist');
  });

  test('returns null for the top tier or missing plan', () => {
    expect(resolveRecommendedPlanSlug('archivist')).toBeNull();
    expect(resolveRecommendedPlanSlug(null)).toBeNull();
  });
});

describe('resolvePlanChangeAction', () => {
  test('routes upgrade for higher tier on active subscription', () => {
    expect(
      resolvePlanChangeAction({
        currentPlanSlug: 'explorer',
        targetPlanSlug: 'archivist',
        billingStatus: 'active',
        hasPremiumAccess: true,
      })
    ).toBe('upgrade');
  });

  test('routes downgrade for lower tier on active subscription', () => {
    expect(
      resolvePlanChangeAction({
        currentPlanSlug: 'archivist',
        targetPlanSlug: 'explorer',
        billingStatus: 'active',
        hasPremiumAccess: true,
      })
    ).toBe('downgrade');
  });

  test('blocks downgrade during past_due', () => {
    expect(
      resolvePlanChangeAction({
        currentPlanSlug: 'archivist',
        targetPlanSlug: 'explorer',
        billingStatus: 'past_due',
        hasPremiumAccess: true,
      })
    ).toBe('blocked_downgrade');
  });

  test('routes upgrade during past_due', () => {
    expect(
      resolvePlanChangeAction({
        currentPlanSlug: 'explorer',
        targetPlanSlug: 'archivist',
        billingStatus: 'past_due',
        hasPremiumAccess: true,
      })
    ).toBe('upgrade');
  });

  test('uses checkout for expired resubscribe', () => {
    expect(
      resolvePlanChangeAction({
        currentPlanSlug: 'explorer',
        targetPlanSlug: 'archivist',
        billingStatus: 'expired',
        hasPremiumAccess: false,
      })
    ).toBe('checkout');
  });
});

describe('getPlanAmountRub', () => {
  test('returns billing QA test price for all plans', () => {
    expect(getPlanAmountRub('explorer')).toBe(1);
    expect(getPlanAmountRub('collector')).toBe(1);
    expect(getPlanAmountRub('archivist')).toBe(1);
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
