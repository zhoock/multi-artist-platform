import type { Location } from 'react-router-dom';

import { sanitizeReturnPath } from '@shared/lib/authReturnUrl';

export type SessionExpiredAuthTarget = {
  returnTo: string;
  backgroundLocation: Location;
};

/**
 * Builds auth-overlay navigation targets for session expiry.
 * Uses the current router location as backgroundLocation so underlying surfaces
 * (including UserDashboard on /dashboard-new/*) stay mounted under the auth overlay.
 */
export function buildSessionExpiredAuthTarget(current: Location): SessionExpiredAuthTarget {
  const returnTo =
    sanitizeReturnPath(`${current.pathname}${current.search}${current.hash ?? ''}`) ?? '/';

  return {
    returnTo,
    backgroundLocation: current,
  };
}
