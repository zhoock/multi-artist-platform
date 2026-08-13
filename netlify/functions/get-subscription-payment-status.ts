/**
 * GET /api/get-subscription-payment-status?paymentId=
 * Poll platform Premium payment; sync subscription activation or rebind on success.
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
import {
  isDevMarkedPayment,
  isDevPaymentModeEnabled,
  logDevPaymentSubscriptionStatus,
} from './lib/dev-payment-mode';
import { getYooKassaEnvCredentials } from './lib/yookassa-env';
import { fetchPaymentFromYooKassaApi, metaString } from './lib/yookassa-webhook-verify';
import { processSubscriptionProviderPaymentForRow } from './lib/subscription-payment-router';
import {
  mapDevSubscriptionPaymentToProviderPayment,
  mapYooKassaPaymentToProviderPayment,
} from './lib/subscription-provider-payment';
import {
  isRebindSubscriptionPaymentKind,
  processRebindSubscriptionProviderPaymentWithArchive,
} from './lib/subscription-rebind-fulfillment';
import {
  DEFAULT_SUBSCRIPTION_PLAN,
  getSubscriptionPaymentForUser,
  getSubscriptionPaymentByInternalId,
  PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
} from './lib/subscription-billing';
import {
  beginSubscriptionFulfillmentObservability,
  recordSubscriptionFulfillmentOutcome,
} from './lib/subscription-observability-fulfillment';
import {
  logSubscriptionEvent,
  runWithSubscriptionObservability,
  SUBSCRIPTION_LOG_EVENTS,
} from './lib/subscription-observability';

dns.setDefaultResultOrder('ipv4first');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildPaymentResponse(
  providerPayment: {
    id: string;
    status: string;
    amount: { value: string; currency: string };
    confirmationUrl?: string;
  },
  metadata: {
    productType?: string;
    userId?: string;
    plan?: string;
    kind?: string;
  }
) {
  return {
    id: providerPayment.id,
    status: providerPayment.status,
    paid: providerPayment.status === 'succeeded',
    amount: providerPayment.amount,
    metadata,
    confirmation_url:
      providerPayment.status === 'pending' || providerPayment.status === 'waiting_for_capture'
        ? providerPayment.confirmationUrl
        : undefined,
  };
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed. Use GET.');
  }

  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  const paymentIdParam = event.queryStringParameters?.paymentId?.trim();
  const subscriptionPaymentIdParam = event.queryStringParameters?.subscriptionPaymentId?.trim();

  if (!paymentIdParam && !subscriptionPaymentIdParam) {
    return createErrorResponse(400, 'paymentId or subscriptionPaymentId parameter is required');
  }
  if (paymentIdParam && subscriptionPaymentIdParam) {
    return createErrorResponse(400, 'Provide either paymentId or subscriptionPaymentId, not both');
  }

  let paymentId = paymentIdParam;
  if (!paymentId && subscriptionPaymentIdParam) {
    if (!UUID_RE.test(subscriptionPaymentIdParam)) {
      return createErrorResponse(400, 'subscriptionPaymentId must be a valid UUID');
    }
    const pending = await getSubscriptionPaymentByInternalId(subscriptionPaymentIdParam, userId);
    if (!pending) {
      return createErrorResponse(404, 'Subscription payment not found');
    }
    if (!pending.provider_payment_id) {
      return createSuccessResponse({
        payment: {
          id: null,
          status: pending.status,
          paid: false,
          amount: { value: pending.amount, currency: pending.currency },
          metadata: {
            productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
            userId,
            plan: pending.plan,
            kind: pending.kind,
          },
        },
        subscriptionActivated: false,
        paymentMethodUpdated: false,
      });
    }
    paymentId = pending.provider_payment_id;
  }

  if (!paymentId || !UUID_RE.test(paymentId)) {
    return createErrorResponse(400, 'paymentId must be a valid UUID');
  }

  const owned = await getSubscriptionPaymentForUser(paymentId, userId);
  if (!owned) {
    return createErrorResponse(404, 'Subscription payment not found');
  }

  const isRebind = isRebindSubscriptionPaymentKind(owned.kind);

  if (isDevPaymentModeEnabled()) {
    const devProviderPayment = mapDevSubscriptionPaymentToProviderPayment(owned, paymentId, {
      devMode: true,
    });
    if (devProviderPayment && isDevMarkedPayment(owned.raw_last_event)) {
      logDevPaymentSubscriptionStatus({
        subscriptionPaymentId: owned.id,
        paymentId,
      });

      try {
        if (isRebind) {
          const { paymentMethodUpdated, staleAfterUnlink, archive } =
            await processRebindSubscriptionProviderPaymentWithArchive(devProviderPayment, userId, {
              devMode: true,
            });

          return createSuccessResponse({
            payment: buildPaymentResponse(devProviderPayment, {
              productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
              userId,
              plan: owned.plan,
              kind: owned.kind,
            }),
            subscriptionActivated: false,
            paymentMethodUpdated,
            staleAfterUnlink,
            archive,
          });
        }

        const { subscriptionActivated, planSlug } = await processSubscriptionProviderPaymentForRow(
          devProviderPayment,
          userId,
          owned.kind,
          { devMode: true, observabilitySource: 'poll', subscriptionPaymentId: owned.id }
        );

        logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.POLL_PROCESSED, {
          subscriptionActivated,
          isRebind: false,
          planSlug,
        });

        return createSuccessResponse({
          payment: buildPaymentResponse(devProviderPayment, {
            productType: PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
            userId,
            plan: planSlug,
            kind: owned.kind,
          }),
          subscriptionActivated,
          paymentMethodUpdated: false,
        });
      } catch (error) {
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? Number((error as { statusCode: number }).statusCode)
            : 500;
        return createErrorResponse(
          statusCode,
          error instanceof Error ? error.message : 'Failed to process subscription payment'
        );
      }
    }
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

  const apiResult = await fetchPaymentFromYooKassaApi(
    paymentId,
    yookassaCreds.shopId,
    yookassaCreds.secretKey
  );

  if (!apiResult.ok) {
    return createErrorResponse(
      apiResult.status === 404 ? 404 : 502,
      'Failed to fetch payment status from provider'
    );
  }

  const providerPayment = mapYooKassaPaymentToProviderPayment(apiResult.payment);
  if (!providerPayment) {
    return createErrorResponse(502, 'Unsupported payment status from provider');
  }

  const productType = metaString(providerPayment.metadata, 'productType');
  const metaUserId = metaString(providerPayment.metadata, 'userId');
  const plan = metaString(providerPayment.metadata, 'plan');

  try {
    return await runWithSubscriptionObservability(
      {
        userId,
        providerPaymentId: paymentId,
        subscriptionPaymentId: owned.id,
        kind: owned.kind ?? undefined,
        source: 'poll',
        correlationId: owned.id,
      },
      async () => {
        if (isRebind) {
          beginSubscriptionFulfillmentObservability({
            userId,
            kind: 'rebind',
            source: 'poll',
            providerPaymentId: paymentId,
            subscriptionPaymentId: owned.id,
            paymentStatus: providerPayment.status,
          });

          const { paymentMethodUpdated, staleAfterUnlink, archive } =
            await processRebindSubscriptionProviderPaymentWithArchive(providerPayment, userId);

          recordSubscriptionFulfillmentOutcome('rebind', 'poll', {
            paymentMethodUpdated,
            alreadyApplied: !paymentMethodUpdated,
            staleAfterUnlink,
          });

          logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.POLL_PROCESSED, {
            paymentMethodUpdated,
            staleAfterUnlink,
            isRebind: true,
          });

          return createSuccessResponse({
            payment: buildPaymentResponse(providerPayment, {
              productType,
              userId: metaUserId,
              plan: plan ?? DEFAULT_SUBSCRIPTION_PLAN,
              kind: owned.kind,
            }),
            subscriptionActivated: false,
            paymentMethodUpdated,
            staleAfterUnlink,
            archive,
          });
        }

        const { subscriptionActivated, planSlug } = await processSubscriptionProviderPaymentForRow(
          providerPayment,
          userId,
          owned.kind,
          { observabilitySource: 'poll', subscriptionPaymentId: owned.id }
        );

        logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.POLL_PROCESSED, {
          subscriptionActivated,
          isRebind: false,
          planSlug,
        });

        return createSuccessResponse({
          payment: buildPaymentResponse(providerPayment, {
            productType,
            userId: metaUserId,
            plan: plan ?? planSlug ?? DEFAULT_SUBSCRIPTION_PLAN,
            kind: owned.kind,
          }),
          subscriptionActivated,
          paymentMethodUpdated: false,
        });
      }
    );
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;
    return createErrorResponse(
      statusCode,
      error instanceof Error ? error.message : 'Failed to process subscription payment'
    );
  }
};
