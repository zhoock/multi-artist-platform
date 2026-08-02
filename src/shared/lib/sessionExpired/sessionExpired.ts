/**
 * Session expiry signal + banner reason storage.
 * Fetch layer emits events; React controllers perform navigation.
 */

export const AUTH_EXPIRED_BANNER_SESSION_KEY = 'sc-auth-session-expired-msg';

export const SESSION_EXPIRED_REQUEST_EVENT = 'session-expired-request';

export type SessionExpiredBannerReason = 'SESSION_EXPIRED' | 'INVALID_SESSION';

export type SessionExpiredRequestDetail = {
  reason: SessionExpiredBannerReason;
  /** When true, credentials were cleared but router must not navigate (already on /auth). */
  skipNavigation?: boolean;
};

let sessionExpiredHandlingScheduled = false;

export function tryScheduleSessionExpiredHandling(): boolean {
  if (sessionExpiredHandlingScheduled) return false;
  sessionExpiredHandlingScheduled = true;
  return true;
}

export function resetSessionExpiredHandlingState(): void {
  sessionExpiredHandlingScheduled = false;
}

/** User dismissed re-auth without signing in — clear in-flight expiry handling. */
export function abandonSessionExpiredReauth(): void {
  resetSessionExpiredHandlingState();
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(AUTH_EXPIRED_BANNER_SESSION_KEY);
  } catch {
    /* ignore quota */
  }
}

export function mapApiCodeToBannerReason(code: string | undefined): SessionExpiredBannerReason {
  return code === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : 'INVALID_SESSION';
}

export function normalizeSessionExpiredBannerReason(
  raw: string | null | undefined
): SessionExpiredBannerReason | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === 'SESSION_EXPIRED' || trimmed === 'INVALID_SESSION') {
    return trimmed;
  }
  return null;
}

export function setSessionExpiredBannerReason(reason: SessionExpiredBannerReason): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AUTH_EXPIRED_BANNER_SESSION_KEY, reason);
  } catch {
    /* ignore quota */
  }
}

export function consumeSessionExpiredBannerReason(): SessionExpiredBannerReason | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_EXPIRED_BANNER_SESSION_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(AUTH_EXPIRED_BANNER_SESSION_KEY);
    return normalizeSessionExpiredBannerReason(raw);
  } catch {
    return null;
  }
}

export function peekSessionExpiredBannerReason(): SessionExpiredBannerReason | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeSessionExpiredBannerReason(
      sessionStorage.getItem(AUTH_EXPIRED_BANNER_SESSION_KEY)
    );
  } catch {
    return null;
  }
}

/** True while session-expired handling is in flight (before auth overlay opens). */
export function isSessionExpiredHandlingPending(): boolean {
  return sessionExpiredHandlingScheduled || peekSessionExpiredBannerReason() != null;
}

export function dispatchSessionExpiredRequest(detail: SessionExpiredRequestDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SessionExpiredRequestDetail>(SESSION_EXPIRED_REQUEST_EVENT, {
      detail,
    })
  );
}
