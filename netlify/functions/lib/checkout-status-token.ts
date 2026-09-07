/**
 * Signed, time-limited token proving access to a specific album checkout order.
 * Used by guest and authenticated buyers to poll order/payment status without JWT.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getJwtSecret } from './jwt';

/** Allow status polling long after YooKassa redirect (48h). */
export const CHECKOUT_STATUS_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export const CHECKOUT_STATUS_TOKEN_PARAM = 'statusToken';
export const CHECKOUT_STATUS_EXPIRES_PARAM = 'statusTokenExpiresAt';

export type CheckoutStatusToken = {
  token: string;
  expiresAt: number;
};

export function createCheckoutStatusToken(orderId: string): CheckoutStatusToken {
  const secret = getJwtSecret();
  const expiresAt = Date.now() + CHECKOUT_STATUS_TOKEN_TTL_MS;
  const payload = `${orderId}:${expiresAt}`;
  const token = createHmac('sha256', secret).update(payload).digest('base64url');
  return { token, expiresAt };
}

export function verifyCheckoutStatusToken(
  token: string,
  orderId: string,
  expiresAt: number
): boolean {
  if (!token.trim() || !orderId.trim()) {
    return false;
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    return false;
  }

  const payload = `${orderId}:${expiresAt}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');

  try {
    const a = Buffer.from(token.trim());
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function appendCheckoutStatusTokenToSearchParams(
  params: URLSearchParams,
  checkoutToken: CheckoutStatusToken
): void {
  params.set(CHECKOUT_STATUS_TOKEN_PARAM, checkoutToken.token);
  params.set(CHECKOUT_STATUS_EXPIRES_PARAM, String(checkoutToken.expiresAt));
}

export function parseCheckoutStatusTokenFromQuery(
  params: Record<string, string | undefined> | null | undefined
): { token: string; expiresAt: number } | null {
  const token = params?.[CHECKOUT_STATUS_TOKEN_PARAM]?.trim();
  const expiresRaw = params?.[CHECKOUT_STATUS_EXPIRES_PARAM]?.trim();
  if (!token || !expiresRaw) {
    return null;
  }

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt)) {
    return null;
  }

  return { token, expiresAt };
}
