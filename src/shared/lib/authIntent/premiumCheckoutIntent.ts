/**
 * Temporary auth intent: re-evaluate protected content access after guest login/register.
 * Only set when user explicitly opened paywall or clicked locked content while logged out.
 */

import { sanitizeReturnPath, readReturnPathFromWindow } from '@shared/lib/authReturnUrl';

export const PREMIUM_CHECKOUT_AUTH_INTENT_STORAGE_KEY = 'sc_premium_checkout_auth_intent';
export const PREMIUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG = 'sc_premium_checkout_resume_after_auth';

const INTENT_TTL_MS = 30 * 60 * 1000;

export type PremiumCheckoutAuthIntent = {
  type: 'premium_checkout';
  artistSlug: string;
  artistUserId: string;
  returnTo: string;
  createdAt: number;
};

export type PremiumCheckoutIntentContext = {
  artistSlug?: string | null;
  artistUserId?: string | null;
  returnTo?: string | null;
};

function readArtistSlugFromLocation(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('artist')?.trim() ?? '';
}

function readReturnToFromLocation(): string {
  return readReturnPathFromWindow();
}

export function buildPremiumCheckoutIntentContext(
  overrides: PremiumCheckoutIntentContext = {}
): PremiumCheckoutAuthIntent {
  const artistSlug = overrides.artistSlug?.trim() || readArtistSlugFromLocation();
  const artistUserId = overrides.artistUserId?.trim() ?? '';
  const returnTo =
    sanitizeReturnPath(overrides.returnTo?.trim() || readReturnToFromLocation()) ?? '/';

  return {
    type: 'premium_checkout',
    artistSlug,
    artistUserId,
    returnTo,
    createdAt: Date.now(),
  };
}

export function savePremiumCheckoutAuthIntent(
  overrides: PremiumCheckoutIntentContext = {}
): PremiumCheckoutAuthIntent {
  const intent = buildPremiumCheckoutIntentContext(overrides);
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(PREMIUM_CHECKOUT_AUTH_INTENT_STORAGE_KEY, JSON.stringify(intent));
    } catch {
      /* ignore quota */
    }
  }
  return intent;
}

export function markPremiumCheckoutResumeAfterAuth(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PREMIUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function shouldResumePremiumCheckoutAfterAuth(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PREMIUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG) === '1';
  } catch {
    return false;
  }
}

export function readPremiumCheckoutAuthIntent(): PremiumCheckoutAuthIntent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PREMIUM_CHECKOUT_AUTH_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PremiumCheckoutAuthIntent>;
    if (parsed.type !== 'premium_checkout' || typeof parsed.createdAt !== 'number') {
      clearPremiumCheckoutAuthIntent();
      return null;
    }
    if (Date.now() - parsed.createdAt > INTENT_TTL_MS) {
      clearPremiumCheckoutAuthIntent();
      return null;
    }
    const returnTo = sanitizeReturnPath(parsed.returnTo ?? null) ?? '/';
    return {
      type: 'premium_checkout',
      artistSlug: typeof parsed.artistSlug === 'string' ? parsed.artistSlug.trim() : '',
      artistUserId: typeof parsed.artistUserId === 'string' ? parsed.artistUserId.trim() : '',
      returnTo,
      createdAt: parsed.createdAt,
    };
  } catch {
    clearPremiumCheckoutAuthIntent();
    return null;
  }
}

export function clearPremiumCheckoutResumeAfterAuthFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PREMIUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG);
  } catch {
    /* ignore */
  }
}

export function readArtistSlugFromPremiumCheckoutReturnTo(returnTo: string): string {
  const trimmed = returnTo?.trim();
  if (!trimmed) return '';
  try {
    const query = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : '';
    return new URLSearchParams(query).get('artist')?.trim() ?? '';
  } catch {
    return '';
  }
}

export function resolvePremiumCheckoutArtistContext(intent: PremiumCheckoutAuthIntent): {
  artistSlug: string;
  artistUserId: string;
} {
  const artistSlug =
    intent.artistSlug.trim() || readArtistSlugFromPremiumCheckoutReturnTo(intent.returnTo);
  return {
    artistSlug,
    artistUserId: intent.artistUserId.trim(),
  };
}

export function clearPremiumCheckoutAuthIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PREMIUM_CHECKOUT_AUTH_INTENT_STORAGE_KEY);
    sessionStorage.removeItem(PREMIUM_CHECKOUT_RESUME_AFTER_AUTH_FLAG);
  } catch {
    /* ignore */
  }
}

/** Guest explicitly started Premium (locked CTA or Start Premium → auth). */
export function beginPremiumCheckoutAuthIntent(
  overrides: PremiumCheckoutIntentContext = {}
): PremiumCheckoutAuthIntent {
  const intent = savePremiumCheckoutAuthIntent(overrides);
  markPremiumCheckoutResumeAfterAuth();
  return intent;
}
