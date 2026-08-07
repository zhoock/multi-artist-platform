/**
 * POST / DELETE /api/subscription/scheduled-plan
 * Single entry point so production _redirects (no method conditions) routes all verbs correctly.
 */

import type { Handler } from '@netlify/functions';

import { createErrorResponse, createOptionsResponse } from './lib/api-helpers';
import { handler as deleteHandler } from './delete-subscription-scheduled-plan';
import { handler as postHandler } from './post-subscription-scheduled-plan';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  if (event.httpMethod === 'POST') {
    return postHandler(event, context);
  }

  if (event.httpMethod === 'DELETE') {
    return deleteHandler(event, context);
  }

  return createErrorResponse(405, 'Method not allowed. Use POST or DELETE.');
};
