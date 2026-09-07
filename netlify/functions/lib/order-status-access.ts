/**
 * Authorization gate for album order/payment status endpoints.
 */

import type { HandlerEvent } from '@netlify/functions';

import {
  parseCheckoutStatusTokenFromQuery,
  verifyCheckoutStatusToken,
} from './checkout-status-token';

export const ORDER_STATUS_ACCESS_DENIED_ERROR = 'Access denied';

export function createOrderStatusAccessDeniedResponse(headers: Record<string, string>): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  return {
    statusCode: 403,
    headers,
    body: JSON.stringify({
      success: false,
      error: ORDER_STATUS_ACCESS_DENIED_ERROR,
    }),
  };
}

/**
 * Verifies checkout status token for a known order id.
 * Call before returning order/payment metadata or running fulfillment.
 */
export function verifyOrderStatusAccess(
  orderId: string,
  event: HandlerEvent,
  headers: Record<string, string>
):
  | { ok: true }
  | { ok: false; response: ReturnType<typeof createOrderStatusAccessDeniedResponse> } {
  const credentials = parseCheckoutStatusTokenFromQuery(event.queryStringParameters);
  if (!credentials) {
    return { ok: false, response: createOrderStatusAccessDeniedResponse(headers) };
  }

  if (!verifyCheckoutStatusToken(credentials.token, orderId, credentials.expiresAt)) {
    return { ok: false, response: createOrderStatusAccessDeniedResponse(headers) };
  }

  return { ok: true };
}
