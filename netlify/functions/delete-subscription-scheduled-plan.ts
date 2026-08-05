/**
 * DELETE /api/subscription/scheduled-plan
 * Cancel a scheduled downgrade (ADR-006).
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getMyArchiveForUser } from './lib/archive';
import {
  cancelScheduledSubscriptionDowngrade,
  SubscriptionPlanScheduleError,
} from './lib/subscription-plan-schedule';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';

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

  try {
    await cancelScheduledSubscriptionDowngrade(userId);
    const archive = await getMyArchiveForUser(userId);
    return createSuccessResponse({ archive });
  } catch (error) {
    if (error instanceof SubscriptionPlanScheduleError) {
      return createErrorResponse(error.httpStatus, error.message, undefined, { code: error.code });
    }
    console.error('❌ [delete-subscription-scheduled-plan]', error);
    return createErrorResponse(500, 'Failed to cancel scheduled plan change');
  }
};
