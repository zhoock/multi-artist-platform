import { useCallback, useState } from 'react';

import type { BillingSnapshot } from '@shared/api/billing';
import type { MyArchiveData } from '@shared/api/archive';
import {
  cancelScheduledSubscriptionDowngrade,
  deleteSubscriptionPaymentMethod,
  patchSubscriptionAutoRenew,
  scheduleSubscriptionDowngrade,
} from '@shared/api/subscription';
import type { SubscriptionPlanSlug } from '@shared/lib/payment/subscriptionPlans';

export type PatchAutoRenewResult =
  | { ok: true; archive: MyArchiveData }
  | { ok: false; error: string; code?: string };

export type ScheduleDowngradeResult = PatchAutoRenewResult;

export type UnlinkPaymentMethodResult =
  | { ok: true; billing: BillingSnapshot }
  | { ok: false; error: string; code?: string };

export function useSubscriptionBilling() {
  const [loading, setLoading] = useState(false);

  const patchAutoRenew = useCallback(
    async (autoRenewEnabled: boolean): Promise<PatchAutoRenewResult> => {
      setLoading(true);
      try {
        const response = await patchSubscriptionAutoRenew(autoRenewEnabled);

        if (!response.success || !response.data?.archive) {
          return {
            ok: false,
            error: response.error ?? 'Failed to update auto-renew',
            code: response.code,
          };
        }

        return { ok: true, archive: response.data.archive };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const scheduleDowngrade = useCallback(
    async (planSlug: SubscriptionPlanSlug): Promise<ScheduleDowngradeResult> => {
      setLoading(true);
      try {
        const response = await scheduleSubscriptionDowngrade(planSlug);

        if (!response.success || !response.data?.archive) {
          return {
            ok: false,
            error: response.error ?? 'Failed to schedule downgrade',
            code: response.code,
          };
        }

        return { ok: true, archive: response.data.archive };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const cancelScheduledDowngrade = useCallback(async (): Promise<ScheduleDowngradeResult> => {
    setLoading(true);
    try {
      const response = await cancelScheduledSubscriptionDowngrade();

      if (!response.success || !response.data?.archive) {
        return {
          ok: false,
          error: response.error ?? 'Failed to cancel scheduled downgrade',
          code: response.code,
        };
      }

      return { ok: true, archive: response.data.archive };
    } finally {
      setLoading(false);
    }
  }, []);

  const unlinkPaymentMethod = useCallback(async (): Promise<UnlinkPaymentMethodResult> => {
    setLoading(true);
    try {
      const response = await deleteSubscriptionPaymentMethod();

      if (!response.success || !response.data?.billing) {
        return {
          ok: false,
          error: response.error ?? 'Failed to unlink payment method',
          code: response.code,
        };
      }

      return { ok: true, billing: response.data.billing };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    patchAutoRenew,
    scheduleDowngrade,
    cancelScheduledDowngrade,
    unlinkPaymentMethod,
    loading,
  };
}
