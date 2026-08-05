/**
 * POST /api/subscription/scheduled-plan
 * Schedule downgrade for next billing period (ADR-006).
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { getMyArchiveForUser } from './lib/archive';
import { normalizeSubscriptionPlanSlug } from './lib/subscription-billing';
import {
  scheduleSubscriptionDowngrade,
  SubscriptionPlanScheduleError,
} from './lib/subscription-plan-schedule';
import {
  createErrorResponse,
  createOptionsResponse,
  createSuccessResponse,
  getUserIdFromEvent,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';

type PostBody = {
  plan?: unknown;
};

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

  let body: PostBody = {};
  try {
    body = JSON.parse(event.body || '{}') as PostBody;
  } catch {
    return createErrorResponse(400, 'Invalid JSON body');
  }

  if (typeof body.plan !== 'string' || !body.plan.trim()) {
    return createErrorResponse(400, 'plan is required', undefined, { code: 'INVALID_BODY' });
  }

  const planSlug = normalizeSubscriptionPlanSlug(body.plan);
  if (!planSlug) {
    return createErrorResponse(400, 'Invalid subscription plan', undefined, {
      code: 'INVALID_PLAN',
    });
  }

  try {
    await scheduleSubscriptionDowngrade(userId, planSlug);
    const archive = await getMyArchiveForUser(userId);
    return createSuccessResponse({ archive });
  } catch (error) {
    if (error instanceof SubscriptionPlanScheduleError) {
      return createErrorResponse(error.httpStatus, error.message, undefined, { code: error.code });
    }
    console.error('❌ [post-subscription-scheduled-plan]', error);
    return createErrorResponse(500, 'Failed to schedule plan change');
  }
};
