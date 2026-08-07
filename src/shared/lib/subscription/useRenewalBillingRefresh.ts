import { useEffect, useRef } from 'react';

import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from './renewalCountdown';

/** Poll interval inside the post-charge renewal window. */
export const RENEWAL_BILLING_REFRESH_INTERVAL_MS = 15_000;

/** How long after nextChargeAt we keep polling for an updated billing snapshot. */
export const RENEWAL_BILLING_POLL_WINDOW_MS = RENEWAL_OVERDUE_IN_PROGRESS_MS;

export type UseRenewalBillingSyncParams = {
  /** Active auto-renew subscription with a known next charge time. */
  enabled: boolean;
  nextChargeAt: string | null | undefined;
  onRefresh: () => void | Promise<void>;
  /** @deprecated Ignored — poll window is derived from nextChargeAt. */
  isOverdue?: boolean;
};

/**
 * Whether MyArchive should poll for a post-renewal billing snapshot.
 * Must stay true while billingScreen is EXPIRED but nextChargeAt is in the
 * renewal window — access lapses before the scheduler extends the period.
 */
export function shouldEnableRenewalBillingSync(params: {
  active: boolean;
  autoRenewEnabled: boolean;
  nextChargeAt: string | null | undefined;
  /** Poll when a cancelled subscription period ends (nextChargeAt is cleared). */
  cancelledPeriodEndAt?: string | null | undefined;
}): boolean {
  if (params.active && params.autoRenewEnabled && Boolean(params.nextChargeAt)) {
    return true;
  }

  return params.active && Boolean(params.cancelledPeriodEndAt);
}

function parseChargeTargetMs(nextChargeAt: string | null | undefined): number | null {
  if (!nextChargeAt) return null;
  const targetMs = new Date(nextChargeAt).getTime();
  return Number.isNaN(targetMs) ? null : targetMs;
}

/**
 * Polls /api/my-archive only in a short window after billing.nextChargeAt:
 * from charge time until charge time + RENEWAL_BILLING_POLL_WINDOW_MS.
 * Stops early when nextChargeAt updates (renewal succeeded).
 */
export function useRenewalBillingSync({
  enabled,
  nextChargeAt,
  onRefresh,
}: UseRenewalBillingSyncParams): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return undefined;

    const targetMs = parseChargeTargetMs(nextChargeAt);
    if (targetMs === null) return undefined;

    const windowEndMs = targetMs + RENEWAL_BILLING_POLL_WINDOW_MS;
    let pollIntervalId: ReturnType<typeof setInterval> | undefined;
    let stopPollTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let startPollTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const clearAllTimers = () => {
      if (pollIntervalId !== undefined) {
        clearInterval(pollIntervalId);
        pollIntervalId = undefined;
      }
      if (stopPollTimeoutId !== undefined) {
        clearTimeout(stopPollTimeoutId);
        stopPollTimeoutId = undefined;
      }
      if (startPollTimeoutId !== undefined) {
        clearTimeout(startPollTimeoutId);
        startPollTimeoutId = undefined;
      }
    };

    const startPolling = () => {
      startPollTimeoutId = undefined;
      if (pollIntervalId !== undefined) {
        clearInterval(pollIntervalId);
        pollIntervalId = undefined;
      }
      if (stopPollTimeoutId !== undefined) {
        clearTimeout(stopPollTimeoutId);
        stopPollTimeoutId = undefined;
      }

      const nowMs = Date.now();
      if (nowMs >= windowEndMs) return;

      const refresh = () => {
        if (Date.now() >= windowEndMs) {
          if (pollIntervalId !== undefined) {
            clearInterval(pollIntervalId);
            pollIntervalId = undefined;
          }
          if (stopPollTimeoutId !== undefined) {
            clearTimeout(stopPollTimeoutId);
            stopPollTimeoutId = undefined;
          }
          return;
        }
        void onRefreshRef.current();
      };

      refresh();
      pollIntervalId = setInterval(refresh, RENEWAL_BILLING_REFRESH_INTERVAL_MS);
      stopPollTimeoutId = setTimeout(() => {
        if (pollIntervalId !== undefined) {
          clearInterval(pollIntervalId);
          pollIntervalId = undefined;
        }
        stopPollTimeoutId = undefined;
      }, windowEndMs - nowMs);
    };

    const nowMs = Date.now();

    if (nowMs >= windowEndMs) {
      return undefined;
    }

    if (nowMs >= targetMs) {
      startPolling();
    } else {
      startPollTimeoutId = setTimeout(startPolling, targetMs - nowMs);
    }

    return clearAllTimers;
  }, [enabled, nextChargeAt]);
}

/** @deprecated Use useRenewalBillingSync */
export const useRenewalBillingRefresh = useRenewalBillingSync;

export type UseRenewalBillingRefreshParams = UseRenewalBillingSyncParams;
