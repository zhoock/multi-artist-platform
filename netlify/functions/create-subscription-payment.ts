/**
 * POST /api/create-subscription-payment
 * Platform Premium subscription checkout (Explorer / Collector / Archivist).
 * Requires JWT. Does not touch album orders or artist credentials.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import dns from 'node:dns';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import { query } from './lib/db';
import { getYooKassaEnvCredentials } from './lib/yookassa-env';
import { resolveSubscriptionPaymentReturnUrl } from './lib/yookassa-return-url';
import {
  attachProviderPaymentId,
  createPendingSubscriptionPayment,
  DEFAULT_SUBSCRIPTION_PLAN,
  getPlanAmountRub,
  getPlanDefinition,
  normalizeSubscriptionPlanSlug,
  PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
} from './lib/subscription-billing';

dns.setDefaultResultOrder('ipv4first');

interface CreateSubscriptionPaymentBody {
  returnUrl?: string;
  plan?: string;
}

interface YooKassaCreateResponse {
  id: string;
  status: string;
  confirmation?: {
    confirmation_url?: string;
  };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed. Use POST.');
  }

  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const { isUserEmailVerified } = await import('./lib/email-verification');
  if (!(await isUserEmailVerified(userId))) {
    return createErrorResponse(403, 'Email verification required', undefined, {
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  const yookassaCreds = getYooKassaEnvCredentials();
  if (!yookassaCreds) {
    return createErrorResponse(
      503,
      'YooKassa is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.',
      undefined,
      { code: 'YOOKASSA_NOT_CONFIGURED' }
    );
  }

  let body: CreateSubscriptionPaymentBody = {};
  try {
    body = JSON.parse(event.body || '{}') as CreateSubscriptionPaymentBody;
  } catch {
    return createErrorResponse(400, 'Invalid JSON body');
  }

  const userResult = await query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1::uuid LIMIT 1`,
    [userId]
  );
  const customerEmail = userResult.rows[0]?.email?.trim();
  if (!customerEmail) {
    return createErrorResponse(400, 'User email is required for subscription checkout');
  }

  const planSlug = normalizeSubscriptionPlanSlug(body.plan) ?? DEFAULT_SUBSCRIPTION_PLAN;
  if (body.plan?.trim() && !normalizeSubscriptionPlanSlug(body.plan)) {
    return createErrorResponse(400, 'Invalid subscription plan');
  }

  const planDefinition = getPlanDefinition(planSlug);

  let subscriptionPaymentId: string;
  try {
    subscriptionPaymentId = await createPendingSubscriptionPayment(userId, planSlug);
  } catch (error) {
    console.error('[create-subscription-payment] failed to create pending row', error);
    return createErrorResponse(500, 'Could not start subscription checkout');
  }

  let refererOrigin: string | null = null;
  if (event.headers.referer) {
    try {
      refererOrigin = new URL(event.headers.referer).origin;
    } catch {
      refererOrigin = null;
    }
  }

  const returnUrl = resolveSubscriptionPaymentReturnUrl({
    requestedUrl: body.returnUrl,
    refererOrigin,
    subscriptionPaymentId,
  });

  const amountValue = getPlanAmountRub(planSlug).toFixed(2);
  const description = planDefinition.description;

  const yookassaPayload = {
    amount: { value: amountValue, currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect' as const,
      return_url: returnUrl,
    },
    description,
    metadata: {
      productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
      userId,
      plan: planSlug,
    },
    receipt: {
      customer: { email: customerEmail },
      items: [
        {
          description,
          quantity: '1',
          amount: { value: amountValue, currency: 'RUB' },
          vat_code: 1,
          payment_subject: 'service',
          payment_mode: 'full_payment',
        },
      ],
    },
  };

  const apiUrl = process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments';
  const authHeader = Buffer.from(`${yookassaCreds.shopId}:${yookassaCreds.secretKey}`).toString(
    'base64'
  );
  const idempotenceKey = `subscription-${subscriptionPaymentId}`;

  let yookassaResponse: Response;
  try {
    yookassaResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${authHeader}`,
        'Idempotence-Key': idempotenceKey,
      },
      body: JSON.stringify(yookassaPayload),
    });
  } catch (error) {
    console.error('[create-subscription-payment] YooKassa fetch failed', error);
    return createErrorResponse(502, 'Payment provider unavailable');
  }

  if (!yookassaResponse.ok) {
    const errorText = await yookassaResponse.text();
    console.error('[create-subscription-payment] YooKassa error', {
      status: yookassaResponse.status,
      errorText: errorText.slice(0, 500),
    });
    return createErrorResponse(502, 'Failed to create subscription payment');
  }

  const paymentData = (await yookassaResponse.json()) as YooKassaCreateResponse;
  if (!paymentData.id) {
    return createErrorResponse(502, 'Invalid response from payment provider');
  }

  try {
    await attachProviderPaymentId(subscriptionPaymentId, paymentData.id);
  } catch (error) {
    console.error('[create-subscription-payment] failed to attach provider payment id', error);
  }

  console.log('[create-subscription-payment] created', {
    userIdSuffix: `…${userId.slice(-6)}`,
    paymentIdSuffix: `…${paymentData.id.slice(-6)}`,
    subscriptionPaymentIdSuffix: `…${subscriptionPaymentId.slice(-6)}`,
  });

  return createSuccessResponse({
    paymentId: paymentData.id,
    confirmationUrl: paymentData.confirmation?.confirmation_url || '',
  });
};
