import { useEffect, useRef } from 'react';

import { RENEWAL_OVERDUE_IN_PROGRESS_MS } from './renewalCountdown';

/** Poll interval inside the post-charge renewal window. */
export const RENEWAL_BILLING_REFRESH_INTERVAL_MS = 15_000;

/** Slower poll while charge is overdue but the paid period has not ended yet. */
export const RENEWAL_BILLING_OVERDUE_POLL_INTERVAL_MS = 60_000;

/** How long after nextChargeAt we keep polling for an updated billing snapshot. */
export const RENEWAL_BILLING_POLL_WINDOW_MS = RENEWAL_OVERDUE_IN_PROGRESS_MS;

export type UseRenewalBillingSyncParams = {
  /** Active auto-renew subscription with a known next charge time. */
  enabled: boolean;
  nextChargeAt: string | null | undefined;
  /** Paid period end — keeps slow polling alive while renewal/upgrade may still apply. */
  expiresAt?: string | null | undefined;
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

function canPollOverdueRenewal(params: {
  targetMs: number;
  expiresMs: number | null;
  nowMs: number;
}): boolean {
  if (params.nowMs < params.targetMs) return false;
  if (params.expiresMs === null) return false;
  return params.nowMs < params.expiresMs;
}

/**
 * Polls /api/my-archive around billing.nextChargeAt:
 * - fast interval in [nextChargeAt, nextChargeAt + RENEWAL_BILLING_POLL_WINDOW_MS)
 * - slow interval while charge is overdue but expiresAt is still in the future
 * Stops early when nextChargeAt/expiresAt updates (renewal or plan change succeeded).
 */
export function useRenewalBillingSync({
  enabled,
  nextChargeAt,
  expiresAt,
  onRefresh,
}: UseRenewalBillingSyncParams): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return undefined;

    const targetMs = parseChargeTargetMs(nextChargeAt);
    if (targetMs === null) return undefined;

    const expiresMs = parseChargeTargetMs(expiresAt);
    const windowEndMs = targetMs + RENEWAL_BILLING_POLL_WINDOW_MS;
    let pollIntervalId: ReturnType<typeof setInterval> | undefined;
    let stopPollTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let startPollTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let switchToOverduePollTimeoutId: ReturnType<typeof setTimeout> | undefined;

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
      if (switchToOverduePollTimeoutId !== undefined) {
        clearTimeout(switchToOverduePollTimeoutId);
        switchToOverduePollTimeoutId = undefined;
      }
    };

    const shouldContinuePolling = (nowMs: number): boolean => {
      if (nowMs < targetMs) return true;
      if (nowMs < windowEndMs) return true;
      return canPollOverdueRenewal({ targetMs, expiresMs, nowMs });
    };

    const startOverduePolling = () => {
      switchToOverduePollTimeoutId = undefined;
      if (pollIntervalId !== undefined) {
        clearInterval(pollIntervalId);
        pollIntervalId = undefined;
      }
      if (stopPollTimeoutId !== undefined) {
        clearTimeout(stopPollTimeoutId);
        stopPollTimeoutId = undefined;
      }

      const nowMs = Date.now();
      if (!canPollOverdueRenewal({ targetMs, expiresMs, nowMs })) {
        return;
      }

      const refresh = () => {
        const currentNowMs = Date.now();
        if (!canPollOverdueRenewal({ targetMs, expiresMs, nowMs: currentNowMs })) {
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
      pollIntervalId = setInterval(refresh, RENEWAL_BILLING_OVERDUE_POLL_INTERVAL_MS);
      if (expiresMs !== null) {
        stopPollTimeoutId = setTimeout(() => {
          if (pollIntervalId !== undefined) {
            clearInterval(pollIntervalId);
            pollIntervalId = undefined;
          }
          stopPollTimeoutId = undefined;
        }, expiresMs - nowMs);
      }
    };

    const startFastPolling = () => {
      startPollTimeoutId = undefined;
      if (pollIntervalId !== undefined) {
        clearInterval(pollIntervalId);
        pollIntervalId = undefined;
      }
      if (stopPollTimeoutId !== undefined) {
        clearTimeout(stopPollTimeoutId);
        stopPollTimeoutId = undefined;
      }
      if (switchToOverduePollTimeoutId !== undefined) {
        clearTimeout(switchToOverduePollTimeoutId);
        switchToOverduePollTimeoutId = undefined;
      }

      const nowMs = Date.now();
      if (!shouldContinuePolling(nowMs)) {
        return;
      }

      const refresh = () => {
        const currentNowMs = Date.now();
        if (!shouldContinuePolling(currentNowMs)) {
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

      if (nowMs >= windowEndMs) {
        startOverduePolling();
        return;
      }

      stopPollTimeoutId = setTimeout(() => {
        if (pollIntervalId !== undefined) {
          clearInterval(pollIntervalId);
          pollIntervalId = undefined;
        }
        stopPollTimeoutId = undefined;
        startOverduePolling();
      }, windowEndMs - nowMs);
    };

    const nowMs = Date.now();

    if (!shouldContinuePolling(nowMs)) {
      return undefined;
    }

    if (nowMs >= targetMs) {
      if (nowMs >= windowEndMs) {
        startOverduePolling();
      } else {
        startFastPolling();
      }
    } else {
      startPollTimeoutId = setTimeout(startFastPolling, targetMs - nowMs);
    }

    return clearAllTimers;
  }, [enabled, expiresAt, nextChargeAt]);
}

/** @deprecated Use useRenewalBillingSync */
export const useRenewalBillingRefresh = useRenewalBillingSync;

export type UseRenewalBillingRefreshParams = UseRenewalBillingSyncParams;

export function shouldEnableScheduledPlanBillingSync(params: {
  active: boolean;
  scheduledPlan: string | null | undefined;
}): boolean {
  return params.active && Boolean(params.scheduledPlan?.trim());
}

export type UseScheduledPlanBillingSyncParams = {
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
};

/** Polls while a scheduled downgrade is pending until the server applies it. */
export function useScheduledPlanBillingSync({
  enabled,
  onRefresh,
}: UseScheduledPlanBillingSyncParams): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return undefined;

    void onRefreshRef.current();
    const pollIntervalId = setInterval(
      () => void onRefreshRef.current(),
      RENEWAL_BILLING_REFRESH_INTERVAL_MS
    );

    return () => clearInterval(pollIntervalId);
  }, [enabled]);
}
