/**
 * PATCH /api/subscription/auto-renew
 * Enable or disable Premium auto-renew for the current user.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getMyArchiveForUser } from './lib/archive';
import {
  patchSubscriptionAutoRenew,
  SubscriptionAutoRenewPatchError,
} from './lib/subscription-auto-renew-patch';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';

type PatchBody = {
  autoRenewEnabled?: unknown;
};

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod !== 'PATCH') {
    return createErrorResponse(405, 'Method not allowed. Use PATCH.');
  }

  const userId = getUserIdFromEvent(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  let body: PatchBody = {};
  try {
    body = JSON.parse(event.body || '{}') as PatchBody;
  } catch {
    return createErrorResponse(400, 'Invalid JSON body');
  }

  if (typeof body.autoRenewEnabled !== 'boolean') {
    return createErrorResponse(400, 'autoRenewEnabled must be a boolean', undefined, {
      code: 'INVALID_BODY',
    });
  }

  try {
    await patchSubscriptionAutoRenew(userId, body.autoRenewEnabled);
    const archive = await getMyArchiveForUser(userId);
    return createSuccessResponse({ archive });
  } catch (error) {
    if (error instanceof SubscriptionAutoRenewPatchError) {
      return createErrorResponse(error.httpStatus, error.message, undefined, {
        code: error.code,
      });
    }
    console.error('❌ [patch-subscription-auto-renew]', error);
    return createErrorResponse(500, 'Failed to update auto-renew');
  }
};
