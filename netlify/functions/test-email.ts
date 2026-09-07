/**
 * Dev-only helper for sending a sample purchase email through Resend.
 *
 * Disabled on production deploys (see test-email-endpoint.ts).
 *
 * Local Netlify Dev:
 * GET /.netlify/functions/test-email?email=your@email.com
 * POST /.netlify/functions/test-email  Body: { email: "your@email.com" }
 */

import type { Handler, HandlerEvent } from '@netlify/functions';
import { sendPurchaseEmail } from './lib/email';
import {
  createOptionsResponse,
  createErrorResponse,
  CORS_HEADERS,
  parseJsonBody,
} from './lib/api-helpers';
import { isTestEmailEndpointEnabled } from './lib/test-email-endpoint';

interface TestEmailRequest {
  email?: string;
}

export const handler: Handler = async (
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  if (!isTestEmailEndpointEnabled()) {
    return createErrorResponse(404, 'Not found');
  }

  // Обработка preflight запроса
  if (event.httpMethod === 'OPTIONS') {
    return createOptionsResponse();
  }

  try {
    let email: string | undefined;

    // Получаем email из query параметров (GET) или body (POST)
    if (event.httpMethod === 'GET') {
      email = event.queryStringParameters?.email;
    } else if (event.httpMethod === 'POST') {
      const data = parseJsonBody<TestEmailRequest>(event.body, {});
      email = data.email;
    } else {
      return createErrorResponse(405, 'Method not allowed. Use GET or POST.');
    }

    if (!email) {
      return createErrorResponse(
        400,
        'Email parameter is required. Use ?email=your@email.com or send in POST body.'
      );
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return createErrorResponse(400, 'Invalid email format.');
    }

    // Тестовый email: namespace orderId/paymentId per request so re-clicking the test
    // endpoint doesn't trip the new idempotency lock (each call gets a fresh row).
    const testStamp = Date.now().toString(36).toUpperCase();
    const result = await sendPurchaseEmail({
      to: email,
      customerName: 'Тестовый Покупатель',
      albumName: 'Тестовый альбом',
      artistName: 'Тестовый артист',
      orderId: `TEST-${testStamp}`,
      albumSlug: 'test-album',
      albumCover: null,
      albumUserId: null,
      paymentId: `test-${testStamp}`,
    });

    if (!result.success) {
      console.error('❌ [test-email] Failed to send email:', result.error);
      return createErrorResponse(500, result.error || 'Failed to send email');
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        message: 'Test email sent successfully',
        email,
      }),
    };
  } catch (error) {
    console.error('❌ [test-email] Error:', error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
};
