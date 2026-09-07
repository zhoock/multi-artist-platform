/** Query param names for signed album checkout status access (must match backend). */
export const CHECKOUT_STATUS_TOKEN_PARAM = 'statusToken';
export const CHECKOUT_STATUS_EXPIRES_PARAM = 'statusTokenExpiresAt';

export type CheckoutStatusTokenParams = {
  statusToken: string;
  statusTokenExpiresAt: number;
};

export function appendCheckoutStatusTokenParams(
  params: URLSearchParams,
  token: CheckoutStatusTokenParams
): void {
  params.set(CHECKOUT_STATUS_TOKEN_PARAM, token.statusToken);
  params.set(CHECKOUT_STATUS_EXPIRES_PARAM, String(token.statusTokenExpiresAt));
}

export function readCheckoutStatusTokenParams(
  searchParams: URLSearchParams
): CheckoutStatusTokenParams | null {
  const statusToken = searchParams.get(CHECKOUT_STATUS_TOKEN_PARAM)?.trim();
  const expiresRaw = searchParams.get(CHECKOUT_STATUS_EXPIRES_PARAM)?.trim();
  if (!statusToken || !expiresRaw) {
    return null;
  }
  const statusTokenExpiresAt = Number(expiresRaw);
  if (!Number.isFinite(statusTokenExpiresAt)) {
    return null;
  }
  return { statusToken, statusTokenExpiresAt };
}

export function appendCheckoutStatusTokenQuery(
  query: URLSearchParams,
  token: CheckoutStatusTokenParams | null | undefined
): void {
  if (!token?.statusToken || token.statusTokenExpiresAt == null) {
    return;
  }
  appendCheckoutStatusTokenParams(query, token);
}
