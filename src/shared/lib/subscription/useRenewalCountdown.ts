import { useEffect, useRef, useSyncExternalStore } from 'react';

import { resolveRenewalCountdownDisplay, type RenewalCountdownDisplay } from './renewalCountdown';
import {
  getRenewalCountdownNow,
  registerRenewalCountdownTarget,
  subscribeRenewalCountdownClock,
  unregisterRenewalCountdownTarget,
  updateRenewalCountdownTarget,
} from './renewalCountdownClock';

type RenewalLang = 'en' | 'ru';

export type RenewalCountdownState = RenewalCountdownDisplay;

export type UseRenewalCountdownParams = {
  nextChargeAt?: string | null;
  expiresAt?: string | null;
  lang: RenewalLang;
};

function subscribe(listener: () => void): () => void {
  return subscribeRenewalCountdownClock(listener);
}

function getSnapshot(): number {
  return getRenewalCountdownNow().getTime();
}

function getServerSnapshot(): number {
  return Date.now();
}

/**
 * Shared wall clock for renewal countdowns — one timer for the whole app.
 */
export function useRenewalCountdownClock(): Date {
  const nowMs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return new Date(nowMs);
}

/**
 * Live countdown for billing.nextChargeAt with safe fallback to billing.expiresAt.
 */
export function useRenewalCountdown(
  nextChargeAt: string | null | undefined,
  expiresAt: string | null | undefined,
  lang: RenewalLang
): RenewalCountdownState {
  const now = useRenewalCountdownClock();
  const targetIdRef = useRef<symbol | null>(null);
  const countdownTarget = nextChargeAt ?? expiresAt ?? null;

  useEffect(() => {
    if (!countdownTarget) {
      if (targetIdRef.current) {
        unregisterRenewalCountdownTarget(targetIdRef.current);
        targetIdRef.current = null;
      }
      return undefined;
    }

    const targetMs = new Date(countdownTarget).getTime();
    if (Number.isNaN(targetMs)) {
      if (targetIdRef.current) {
        unregisterRenewalCountdownTarget(targetIdRef.current);
        targetIdRef.current = null;
      }
      return undefined;
    }

    if (!targetIdRef.current) {
      targetIdRef.current = registerRenewalCountdownTarget(countdownTarget);
    } else {
      updateRenewalCountdownTarget(targetIdRef.current, countdownTarget);
    }

    return () => {
      if (targetIdRef.current) {
        unregisterRenewalCountdownTarget(targetIdRef.current);
        targetIdRef.current = null;
      }
    };
  }, [countdownTarget]);

  return resolveRenewalCountdownDisplay({
    nextChargeAt,
    expiresAt,
    lang,
    now,
  });
}
