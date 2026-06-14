import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';

export const DASHBOARD_ROW_STATE_FLASH_CLASS = 'user-dashboard__row-state-flash';
export const DASHBOARD_ROW_STATE_FLASH_DURATION_MS = 4200;
export const DASHBOARD_ROW_FLASH_RGB_VAR = '--dashboard-row-flash-rgb';

export type DashboardRowFlash = {
  visibility: TrackVisibility;
  token: number;
};

/** Space-separated RGB tuples — aligned with dashboard palette / status icon colors. */
const VISIBILITY_FLASH_RGB: Record<TrackVisibility, string> = {
  public: '125 206 160', // --soft-green-rgb
  subscribers_only: '250 171 31', // --honeydew-melon / amber accent
  hidden: '207 128 125', // --pink-terracotta-rgb (--error-color), same as hidden icon
};

export function getDashboardRowStateFlashRgb(visibility: TrackVisibility): string {
  return VISIBILITY_FLASH_RGB[visibility];
}

export function getDashboardRowFlashProps(
  rowId: string,
  flashes: Record<string, DashboardRowFlash>
): {
  className?: string;
  style?: CSSProperties;
  'data-visibility-flash'?: TrackVisibility;
} {
  const flash = flashes[rowId];
  if (!flash) return {};

  return {
    className: DASHBOARD_ROW_STATE_FLASH_CLASS,
    style: {
      [DASHBOARD_ROW_FLASH_RGB_VAR]: getDashboardRowStateFlashRgb(flash.visibility),
    } as CSSProperties,
    'data-visibility-flash': flash.visibility,
  };
}

/**
 * React-driven row flash state. Survives re-renders; clears class after animation duration.
 * Briefly removes then re-applies flash so repeated changes restart the animation.
 */
export function useDashboardRowFlash() {
  const [flashes, setFlashes] = useState<Record<string, DashboardRowFlash>>({});
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    },
    []
  );

  const flashRow = useCallback((rowId: string, visibility: TrackVisibility) => {
    const token = Date.now();
    const existingTimer = timersRef.current.get(rowId);
    if (existingTimer != null) {
      window.clearTimeout(existingTimer);
    }

    setFlashes((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });

    window.setTimeout(() => {
      setFlashes((prev) => ({ ...prev, [rowId]: { visibility, token } }));
    }, 0);

    const timer = window.setTimeout(() => {
      setFlashes((prev) => {
        if (prev[rowId]?.token !== token) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      timersRef.current.delete(rowId);
    }, DASHBOARD_ROW_STATE_FLASH_DURATION_MS);

    timersRef.current.set(rowId, timer);
  }, []);

  return { flashes, flashRow };
}
