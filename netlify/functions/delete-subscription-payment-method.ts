/**
 * DELETE /api/subscription/payment-method
 * Remove saved YooKassa payment method from the user's Premium subscription.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';

import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import {
  SubscriptionPaymentMethodUnlinkError,
  unlinkSubscriptionPaymentMethod,
} from './lib/subscription-payment-method-unlink';

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'DELETE') {
    return createErrorResponse(405, 'Method not allowed. Use DELETE.');
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

  try {
    const { billing } = await unlinkSubscriptionPaymentMethod(userId);
    return createSuccessResponse({ billing });
  } catch (error) {
    if (error instanceof SubscriptionPaymentMethodUnlinkError) {
      return createErrorResponse(error.httpStatus, error.message, undefined, {
        code: error.code,
      });
    }
    console.error('❌ [delete-subscription-payment-method]', error);
    return createErrorResponse(500, 'Failed to unlink payment method');
  }
};
