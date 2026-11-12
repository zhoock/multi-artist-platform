import { useCallback, useEffect, useRef } from 'react';

/** Fast poll while the notifications panel or full page is open. */
export const USER_NOTIFICATIONS_LIVE_POLL_MS = 4_000;

/** Slower poll for the header bell unread dot while the dropdown is closed. */
export const USER_NOTIFICATIONS_UNREAD_POLL_MS = 20_000;

export const USER_NOTIFICATIONS_LIVE_REFRESH_DEBOUNCE_MS = 400;

type UseUserNotificationsLiveRefreshOptions = {
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
  pollIntervalMs?: number;
  debounceMs?: number;
};

/**
 * Keeps in-app notifications fresh without reload.
 *
 * Supabase Realtime is not used: auth is app JWT (not Supabase Auth `auth.uid()`),
 * and `user_notifications` denies client SELECT. Polling + visibility refetch matches
 * the audience dashboard live-refresh pattern.
 */
export function useUserNotificationsLiveRefresh({
  enabled,
  onRefresh,
  pollIntervalMs = USER_NOTIFICATIONS_LIVE_POLL_MS,
  debounceMs = USER_NOTIFICATIONS_LIVE_REFRESH_DEBOUNCE_MS,
}: UseUserNotificationsLiveRefreshOptions): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const debounceTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pendingAfterFlightRef = useRef(false);

  const runRefresh = useCallback(async () => {
    if (inFlightRef.current) {
      pendingAfterFlightRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      await onRefreshRef.current();
    } finally {
      inFlightRef.current = false;
      if (pendingAfterFlightRef.current) {
        pendingAfterFlightRef.current = false;
        void runRefresh();
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void runRefresh();
    }, debounceMs);
  }, [debounceMs, runRefresh]);

  useEffect(() => {
    if (!enabled) {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }

    const pollId = window.setInterval(scheduleRefresh, pollIntervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisible);
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [enabled, pollIntervalMs, scheduleRefresh]);
}
