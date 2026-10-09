import { EMPTY_BILLING_SNAPSHOT } from '@shared/api/billing';

import type { PremiumSubscriptionContextValue } from './PremiumSubscriptionContext';

/** Minimal `usePremiumSubscription()` return value for tests and story mocks. */
export function premiumSubscriptionTestStub(
  overrides: Partial<PremiumSubscriptionContextValue> = {}
): PremiumSubscriptionContextValue {
  return {
    isPremium: false,
    slotsLimit: 3,
    slotsUsed: 0,
    planSlug: null,
    billing: EMPTY_BILLING_SNAPSHOT,
    loading: false,
    refetch: async () => {},
    applyArchiveSnapshot: () => {},
    ...overrides,
  };
}
