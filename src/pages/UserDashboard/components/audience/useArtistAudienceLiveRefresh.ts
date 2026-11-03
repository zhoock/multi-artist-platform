import { useCallback, useEffect, useRef } from 'react';

/** Background refresh while the Audience tab is open (30–60s band). */
export const ARTIST_AUDIENCE_POLL_INTERVAL_MS = 45_000;

/** Coalesce burst triggers (visibility + poll + same-tab archive events). */
export const ARTIST_AUDIENCE_REFRESH_DEBOUNCE_MS = 1_500;

type UseArtistAudienceLiveRefreshOptions = {
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
  pollIntervalMs?: number;
  debounceMs?: number;
};

/**
 * Keeps artist audience stats fresh without full-page reload.
 *
 * Supabase Realtime is not used: auth is app JWT (not Supabase Auth `auth.uid()`),
 * and `qualified_track_plays` denies client SELECT. Polling + visibility refetch is the safe fallback.
 */
export function useArtistAudienceLiveRefresh({
  enabled,
  onRefresh,
  pollIntervalMs = ARTIST_AUDIENCE_POLL_INTERVAL_MS,
  debounceMs = ARTIST_AUDIENCE_REFRESH_DEBOUNCE_MS,
}: UseArtistAudienceLiveRefreshOptions): void {
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
