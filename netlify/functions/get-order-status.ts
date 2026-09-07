// netlify/functions/get-order-status.ts
/**
 * Netlify Serverless Function для получения статуса заказа.
 *
 * Пример использования:
 * GET /api/get-order-status?orderId=xxx
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { query } from './lib/db';
import { verifyOrderStatusAccess } from './lib/order-status-access';

interface OrderStatusResponse {
  success: boolean;
  order?: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    customerEmail: string;
    paidAt: string | null;
    paymentId: string | null;
  };
  error?: string;
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Обработка preflight запроса
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Проверяем метод запроса
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed. Use GET.',
      } as OrderStatusResponse),
    };
  }

  try {
    const orderId = event.queryStringParameters?.orderId;

    if (!orderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'orderId parameter is required',
        } as OrderStatusResponse),
      };
    }

    const access = verifyOrderStatusAccess(orderId, event, headers);
    if (!access.ok) {
      return access.response;
    }

    // Получаем заказ из БД
    const orderResult = await query<{
      id: string;
      status: string;
      amount: number;
      currency: string;
      customer_email: string;
      paid_at: string | null;
      payment_id: string | null;
    }>(
      `SELECT id, status, amount, currency, customer_email, paid_at, payment_id
       FROM orders
       WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Order not found',
        } as OrderStatusResponse),
      };
    }

    const order = orderResult.rows[0];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order: {
          id: order.id,
          status: order.status,
          amount: parseFloat(order.amount.toString()),
          currency: order.currency,
          customerEmail: order.customer_email,
          paidAt: order.paid_at,
          paymentId: order.payment_id,
        },
      } as OrderStatusResponse),
    };
  } catch (error) {
    console.error('❌ Error getting order status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as OrderStatusResponse),
    };
  }
};
