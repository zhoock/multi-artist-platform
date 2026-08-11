import { useCallback, useMemo } from 'react';

import { usePremiumSubscription } from '@features/premiumSubscription';
import {
  shouldEnableRenewalBillingSync,
  useRenewalBillingSync,
  shouldEnableScheduledPlanBillingSync,
  useScheduledPlanBillingSync,
} from '@shared/lib/subscription/useRenewalBillingRefresh';

/**
 * Dashboard-level billing polling — independent of active dashboard tab.
 * Mounted once while UserDashboard is open so renewal/scheduled-plan snapshots
 * stay fresh on /dashboard/collection and /dashboard/subscription alike.
 */
export function useDashboardBillingSync(): void {
  const { billing, refetch } = usePremiumSubscription();

  const refreshBilling = useCallback(async () => {
    try {
      await refetch();
    } catch (err) {
      console.error('[DashboardBillingSync] billing refresh failed', err);
    }
  }, [refetch]);

  const cancelledPeriodEndAt = billing.status === 'cancel_at_period_end' ? billing.expiresAt : null;
  const billingSyncTarget = billing.nextChargeAt ?? cancelledPeriodEndAt;

  const shouldSyncRenewalBilling = useMemo(
    () =>
      shouldEnableRenewalBillingSync({
        active: true,
        autoRenewEnabled: billing.autoRenewEnabled,
        nextChargeAt: billing.nextChargeAt,
        cancelledPeriodEndAt,
      }),
    [billing.autoRenewEnabled, billing.nextChargeAt, cancelledPeriodEndAt]
  );

  const shouldSyncScheduledPlanBilling = useMemo(
    () =>
      shouldEnableScheduledPlanBillingSync({
        active: true,
        scheduledPlan: billing.scheduledPlan,
      }),
    [billing.scheduledPlan]
  );

  useRenewalBillingSync({
    enabled: shouldSyncRenewalBilling,
    nextChargeAt: billingSyncTarget,
    expiresAt: billing.expiresAt,
    onRefresh: refreshBilling,
  });

  useScheduledPlanBillingSync({
    enabled: shouldSyncScheduledPlanBilling,
    onRefresh: refreshBilling,
  });
}
