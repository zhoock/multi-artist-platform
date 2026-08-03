/**
 * Account-owned purchase library.
 * GET /api/my-purchases — list purchases for authenticated user.
 * DELETE /api/my-purchases?purchaseId={uuid} — soft-revoke a purchase.
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import {
  createOptionsResponse,
  createErrorResponse,
  createSuccessMessageResponse,
  CORS_HEADERS,
  requireAuth,
  unauthorizedFromAuthHeader,
} from './lib/api-helpers';
import { getViewerEmailLower } from './lib/entitlements';
import {
  fetchPurchasesForAccountUser,
  purchasesTableExists,
  revokePurchaseForUser,
} from './lib/purchases';

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  const userId = requireAuth(event);
  if (!userId) {
    return unauthorizedFromAuthHeader(event);
  }

  if (event.httpMethod === 'GET') {
    try {
      if (!(await purchasesTableExists())) {
        console.warn('⚠️ [my-purchases] Table "purchases" does not exist.');
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: true, purchases: [] }),
        };
      }

      const purchases = await fetchPurchasesForAccountUser(userId);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ success: true, purchases }),
      };
    } catch (error) {
      console.error('❌ [my-purchases] GET error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, errorMessage);
    }
  }

  if (event.httpMethod === 'DELETE') {
    const purchaseId = event.queryStringParameters?.purchaseId?.trim();
    if (!purchaseId) {
      return createErrorResponse(400, 'Missing required query parameter: purchaseId');
    }

    try {
      if (!(await purchasesTableExists())) {
        return createErrorResponse(404, 'Purchase not found');
      }

      const emailLower = await getViewerEmailLower(userId);
      const revoked = await revokePurchaseForUser(userId, emailLower, purchaseId);
      if (!revoked) {
        console.warn('⚠️ [my-purchases] Revoke failed:', {
          userId,
          purchaseId,
          emailLower: emailLower ? '[set]' : null,
        });
        return createErrorResponse(404, 'Purchase not found or already removed');
      }

      return createSuccessMessageResponse('Purchase removed from library');
    } catch (error) {
      console.error('❌ [my-purchases] DELETE error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      return createErrorResponse(500, errorMessage);
    }
  }

  return createErrorResponse(405, 'Method not allowed. Use GET or DELETE.');
};
