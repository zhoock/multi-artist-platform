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
import { attachDevSucceededSubscriptionCheckout } from './lib/complete-dev-payment';
import {
  buildInitialSubscriptionPaymentPayload,
  buildUpgradeSubscriptionPaymentPayload,
} from './lib/subscription-yookassa';
import {
  isDevPaymentModeEnabled,
  logDevPaymentSubscriptionCreate,
  extractReturnToFromReturnUrl,
} from './lib/dev-payment-mode';
import {
  attachProviderPaymentId,
  createPendingSubscriptionPayment,
  DEFAULT_SUBSCRIPTION_PLAN,
  findOpenSubscriptionPayment,
  getPlanAmountRub,
  getPlanDefinition,
  normalizeSubscriptionPlanSlug,
} from './lib/subscription-billing';
import { isSubscriptionAutoRenewEnabled } from './lib/subscription-feature-flag';
import {
  assertUpgradeCheckoutAllowed,
  assertUpgradeIntentRequiredForMidCycleUpgrade,
  SubscriptionPlanScheduleError,
} from './lib/subscription-plan-schedule';
import { getViewerSubscription } from './lib/subscriptions';

dns.setDefaultResultOrder('ipv4first');

interface CreateSubscriptionPaymentBody {
  returnUrl?: string;
  plan?: string;
  intent?: string;
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

  const openPayment = await findOpenSubscriptionPayment(userId);
  if (openPayment) {
    return createErrorResponse(
      409,
      'A subscription checkout is already in progress. Complete or wait for it to expire.',
      undefined,
      { code: 'CHECKOUT_IN_PROGRESS' }
    );
  }

  const isUpgradeIntent = body.intent?.trim() === 'upgrade';

  if (isSubscriptionAutoRenewEnabled()) {
    const subscription = await getViewerSubscription(userId);

    if (isUpgradeIntent) {
      if (!subscription) {
        return createErrorResponse(404, 'Subscription not found', undefined, {
          code: 'NO_SUBSCRIPTION',
        });
      }

      try {
        assertUpgradeCheckoutAllowed(subscription, planSlug);
      } catch (error) {
        if (error instanceof SubscriptionPlanScheduleError) {
          return createErrorResponse(error.httpStatus, error.message, undefined, {
            code: error.code,
          });
        }
        throw error;
      }
    } else if (subscription) {
      try {
        assertUpgradeIntentRequiredForMidCycleUpgrade(subscription, planSlug);
      } catch (error) {
        if (error instanceof SubscriptionPlanScheduleError) {
          return createErrorResponse(error.httpStatus, error.message, undefined, {
            code: error.code,
          });
        }
        throw error;
      }
    }
  } else if (isUpgradeIntent) {
    return createErrorResponse(503, 'Upgrade checkout is not enabled', undefined, {
      code: 'FEATURE_DISABLED',
    });
  }

  const planDefinition = getPlanDefinition(planSlug);
  const paymentKind = isUpgradeIntent && isSubscriptionAutoRenewEnabled() ? 'upgrade' : 'initial';

  let subscriptionPaymentId: string;
  try {
    subscriptionPaymentId = await createPendingSubscriptionPayment(userId, planSlug, paymentKind);
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

  if (isDevPaymentModeEnabled()) {
    const { paymentId } = await attachDevSucceededSubscriptionCheckout({ subscriptionPaymentId });

    logDevPaymentSubscriptionCreate({
      subscriptionPaymentId,
      paymentId,
      returnTo: extractReturnToFromReturnUrl(body.returnUrl),
    });

    return createSuccessResponse({
      paymentId,
      subscriptionPaymentId,
      devPaymentCompleted: true,
    });
  }

  const returnUrl = resolveSubscriptionPaymentReturnUrl({
    requestedUrl: body.returnUrl,
    refererOrigin,
    subscriptionPaymentId,
  });

  const yookassaCreds = getYooKassaEnvCredentials();
  if (!yookassaCreds) {
    return createErrorResponse(
      503,
      'YooKassa is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.',
      undefined,
      { code: 'YOOKASSA_NOT_CONFIGURED' }
    );
  }

  const amountValue = getPlanAmountRub(planSlug).toFixed(2);
  const description = planDefinition.description;

  const yookassaPayload =
    paymentKind === 'upgrade'
      ? buildUpgradeSubscriptionPaymentPayload({
          amountValue,
          description,
          returnUrl,
          userId,
          planSlug,
          customerEmail,
        })
      : buildInitialSubscriptionPaymentPayload({
          amountValue,
          description,
          returnUrl,
          userId,
          planSlug,
          customerEmail,
        });

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
