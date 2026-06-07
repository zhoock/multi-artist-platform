// netlify/functions/get-payment-status.ts
/**
 * Netlify Serverless Function для проверки статуса платежа через YooKassa API.
 *
 * ВАЖНО: Эта функция всегда проверяет статус через YooKassa API, а не доверяет БД.
 * Используется после возврата с YooMoney для проверки реального статуса платежа.
 *
 * GET /api/get-payment-status?paymentId=xxx
 * GET /api/get-payment-status?orderId=xxx
 *
 * Возвращает:
 * {
 *   success: boolean,
 *   payment: {
 *     id: string,
 *     status: 'pending' | 'succeeded' | 'canceled',
 *     paid: boolean,
 *     amount: { value: string, currency: string },
 *     cancellation_details?: { ... },
 *     metadata?: { orderId?: string, ... }
 *   },
 *   orderUpdated: boolean
 * }
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { query } from './lib/db';
import { upsertPurchaseRecord, upsertPurchaseRecordSilent } from './lib/purchases';
import { resolveAlbumByKey } from './lib/resolve-album-key';
import dns from 'node:dns';

// Форсируем IPv4 для избежания проблем с fetch в некоторых сетях
dns.setDefaultResultOrder('ipv4first');

/**
 * Валидирует UUID формат
 */
function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Валидирует query параметр (UUID должен быть валидным, без угловых скобок и пробелов)
 */
function validateUUIDParameter(value: string | null | undefined, paramName: string): string | null {
  if (!value) {
    return null;
  }

  // Проверяем на угловые скобки и пробелы
  if (value.includes('<') || value.includes('>') || value.includes(' ') || value.trim() !== value) {
    return `${paramName} contains invalid characters (angle brackets or spaces are not allowed)`;
  }

  // Проверяем формат UUID
  if (!isValidUUID(value)) {
    return `${paramName} must be a valid UUID`;
  }

  return null;
}

interface YooKassaPaymentStatus {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  cancellation_details?: {
    party: string;
    reason: string;
  };
  metadata?: {
    orderId?: string;
    albumId?: string;
    customerEmail?: string;
    [key: string]: string | undefined;
  };
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  created_at: string;
  captured_at?: string;
}

interface PaymentStatusResponse {
  success: boolean;
  message?: string;
  payment?: {
    id: string;
    status: string;
    paid: boolean;
    amount: {
      value: string;
      currency: string;
    };
    cancellation_details?: {
      party: string;
      reason: string;
    };
    metadata?: {
      orderId?: string;
      [key: string]: string | undefined;
    };
    confirmation_url?: string; // URL для продолжения оплаты для pending статусов
  };
  orderUpdated?: boolean;
  error?: string;
}

/**
 * Только учётные данные продавца из БД (активная ЮKassa). Без fallback на env платформы.
 */
async function getYooKassaCredentialsForOrder(orderId: string): Promise<{
  shopId: string;
  secretKey: string;
} | null> {
  const orderResult = await query<{ user_id: string | null }>(
    'SELECT user_id FROM orders WHERE id = $1',
    [orderId]
  );

  if (orderResult.rows.length === 0 || !orderResult.rows[0].user_id) {
    console.warn(`⚠️ Order ${orderId} missing or has no seller user_id`);
    return null;
  }

  const userId = orderResult.rows[0].user_id;
  const { getDecryptedSecretKey } = await import('./payment-settings');
  const userCredentials = await getDecryptedSecretKey(userId, 'yookassa');

  if (!userCredentials?.shopId || !userCredentials.secretKey) {
    console.warn(`⚠️ No active YooKassa credentials for seller ${userId} (order ${orderId})`);
    return null;
  }

  console.log(`✅ Using seller ${userId} YooKassa credentials for order ${orderId}`);

  return {
    shopId: userCredentials.shopId.trim(),
    secretKey: userCredentials.secretKey.trim(),
  };
}

/**
 * Обновляет статус заказа и платежа в БД на основе данных от YooKassa
 */
async function updateOrderAndPaymentStatus(paymentStatus: YooKassaPaymentStatus): Promise<boolean> {
  const orderId = paymentStatus.metadata?.orderId;
  if (!orderId) {
    console.warn('⚠️ No orderId in payment metadata, skipping DB update');
    return false;
  }

  try {
    // Маппинг статусов YooKassa в наши статусы
    let orderStatus: string;
    if (paymentStatus.status === 'succeeded' || paymentStatus.paid) {
      orderStatus = 'paid';
    } else if (paymentStatus.status === 'canceled') {
      orderStatus = 'canceled';
    } else {
      orderStatus = 'pending_payment';
    }

    // Обновляем заказ
    await query(
      `UPDATE orders 
       SET status = $1::text, 
           payment_id = $2,
           paid_at = CASE WHEN $1::text = 'paid' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [orderStatus, paymentStatus.id, orderId]
    );

    // Обновляем или создаём запись в payments
    await query(
      `INSERT INTO payments (
        order_id, provider, provider_payment_id, status, amount, currency
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (provider, provider_payment_id) 
      DO UPDATE SET 
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP`,
      [
        orderId,
        'yookassa',
        paymentStatus.id,
        paymentStatus.status,
        paymentStatus.amount.value,
        paymentStatus.amount.currency,
      ]
    );

    // Если платеж успешен, создаем или обновляем запись в purchases
    if (orderStatus === 'paid' && (paymentStatus.status === 'succeeded' || paymentStatus.paid)) {
      try {
        // Получаем информацию о заказе для создания покупки
        const orderResult = await query<{
          album_id: string;
          customer_email: string;
          updated_at: Date;
        }>(
          `SELECT album_id, customer_email, updated_at 
           FROM orders 
           WHERE id = $1`,
          [orderId]
        );

        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          const albumKey = order.album_id || paymentStatus.metadata?.albumId;
          const customerEmail = order.customer_email || paymentStatus.metadata?.customerEmail;

          if (albumKey && customerEmail) {
            // ВАЖНО: Проверяем, не было ли уже отправлено письмо через webhook
            // Проверяем наличие записи в webhook_events для payment.succeeded
            const webhookEventId = `notification-payment.succeeded-${paymentStatus.id}`;
            const webhookCheck = await query<{ id: string }>(
              'SELECT id FROM webhook_events WHERE provider = $1 AND event_id = $2',
              ['yookassa', webhookEventId]
            );

            if (webhookCheck.rows.length > 0) {
              console.log(
                'ℹ️ [get-payment-status] Skipping email send - webhook already processed payment:',
                {
                  orderId,
                  paymentId: paymentStatus.id,
                  webhookEventId,
                }
              );
              // Все равно создаем/обновляем purchase, но не отправляем email
              await upsertPurchaseRecordSilent(orderId, customerEmail, albumKey);
            } else {
              const purchase = await upsertPurchaseRecord(orderId, customerEmail, albumKey);

              if (purchase) {
                console.log('✅ Purchase created/updated:', {
                  purchaseId: purchase.id,
                  purchaseToken: purchase.purchase_token,
                  orderId,
                  albumKey,
                  customerEmail,
                });

                // Отправляем email (не блокируем основной поток)
                // Это резервный механизм на случай, если webhook не сработал
                import('./lib/email')
                  .then(({ sendPurchaseEmail }) =>
                    resolveAlbumByKey(albumKey).then(async (album) => {
                      if (!album) {
                        return { success: false, error: 'Album not found' };
                      }

                      const orderMetaResult = await query<{
                        buyer_display_name: string | null;
                      }>(
                        `SELECT buyer_display_name
                         FROM orders
                         WHERE id = $1
                         LIMIT 1`,
                        [orderId]
                      );
                      const orderMeta = orderMetaResult.rows[0];

                      const customerName = orderMeta?.buyer_display_name?.trim() || undefined;

                      const { resolveEmailLocaleForAddress } = await import(
                        './lib/user-preferred-language'
                      );
                      const locale = await resolveEmailLocaleForAddress(customerEmail, album.lang);

                      return sendPurchaseEmail({
                        to: customerEmail,
                        customerName,
                        albumName: album.album,
                        artistName: album.artist,
                        orderId,
                        albumSlug: album.albumSlug,
                        albumCover: album.cover,
                        albumUserId: album.userId,
                        albumLang: album.lang,
                        paymentId: paymentStatus.id,
                        locale,
                      });
                    })
                  )
                  .then((result) => {
                    if (result?.alreadySent) {
                      console.log(
                        'ℹ️ [get-payment-status] Purchase email already sent (idempotency hit):',
                        { to: customerEmail, orderId }
                      );
                    } else if (result?.success) {
                      console.log('✅ [get-payment-status] Purchase email sent successfully:', {
                        to: customerEmail,
                        orderId,
                      });
                    } else {
                      console.error('❌ [get-payment-status] Failed to send purchase email:', {
                        to: customerEmail,
                        orderId,
                        error: result?.error,
                      });
                    }
                  })
                  .catch((emailError) => {
                    console.error('❌ [get-payment-status] Error sending purchase email:', {
                      to: customerEmail,
                      orderId,
                      error: emailError instanceof Error ? emailError.message : String(emailError),
                      stack: emailError instanceof Error ? emailError.stack : undefined,
                    });
                    // Не выбрасываем ошибку, чтобы не блокировать основной поток
                  });
              }
            }
          } else {
            console.warn('⚠️ Cannot create purchase: missing albumId or customerEmail', {
              albumKey,
              customerEmail,
              orderId,
            });
          }
        }
      } catch (purchaseError) {
        // Не блокируем основной поток, если не удалось создать покупку
        console.error('❌ Error creating purchase:', purchaseError);
      }
    }

    console.log(
      `✅ Updated order ${orderId} and payment ${paymentStatus.id} to status: ${orderStatus}`
    );
    return true;
  } catch (error) {
    console.error('❌ Error updating order and payment status:', error);
    return false;
  }
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
      } as PaymentStatusResponse),
    };
  }

  try {
    const paymentId = event.queryStringParameters?.paymentId;
    const orderId = event.queryStringParameters?.orderId;

    if (!paymentId && !orderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'paymentId or orderId parameter is required',
        } as PaymentStatusResponse),
      };
    }

    // Запрещаем одновременную передачу paymentId и orderId
    if (paymentId && orderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Provide either paymentId or orderId, not both',
        } as PaymentStatusResponse),
      };
    }

    // Валидация параметров (до обращения к БД)
    if (paymentId) {
      const validationError = validateUUIDParameter(paymentId, 'paymentId');
      if (validationError) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: validationError,
          } as PaymentStatusResponse),
        };
      }
    }

    if (orderId) {
      const validationError = validateUUIDParameter(orderId, 'orderId');
      if (validationError) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: validationError,
          } as PaymentStatusResponse),
        };
      }
    }

    // Резолвим заказ и YooKassa payment id (без env-платформы — только продавец из orders)
    let actualPaymentId: string | undefined = paymentId;
    let resolvedOrderId: string | undefined;

    if (orderId) {
      const orderResult = await query<{ payment_id: string | null }>(
        'SELECT payment_id FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Order not found',
          } as PaymentStatusResponse),
        };
      }

      actualPaymentId = orderResult.rows[0].payment_id || undefined;
      if (!actualPaymentId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Order has no payment_id',
          } as PaymentStatusResponse),
        };
      }
      resolvedOrderId = orderId;
    } else if (paymentId) {
      const byPayment = await query<{ id: string }>('SELECT id FROM orders WHERE payment_id = $1', [
        paymentId,
      ]);
      if (byPayment.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'No order found for this payment',
          } as PaymentStatusResponse),
        };
      }
      resolvedOrderId = byPayment.rows[0].id;
    }

    if (!actualPaymentId || !resolvedOrderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Could not resolve order for payment status',
        } as PaymentStatusResponse),
      };
    }

    const credentials = await getYooKassaCredentialsForOrder(resolvedOrderId);
    if (!credentials) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'seller_payment_not_configured',
          message:
            'This artist has not connected YooKassa or payments are disabled. Payment status is unavailable.',
        } as PaymentStatusResponse),
      };
    }

    // Делаем запрос к YooKassa API
    const apiUrl = process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments';
    const paymentUrl = `${apiUrl}/${actualPaymentId}`;
    const authHeader = Buffer.from(`${credentials.shopId}:${credentials.secretKey}`).toString(
      'base64'
    );

    console.log(`🔍 Checking payment status via YooKassa API: ${actualPaymentId}`);

    // Проверяем DNS резолюцию перед fetch (опционально, не фатально)
    const urlObj = new URL(paymentUrl);
    const dnsStartTime = Date.now();

    try {
      const addresses = await dns.promises.lookup(urlObj.hostname, { family: 4 }); // Форсируем IPv4
      const dnsDuration = Date.now() - dnsStartTime;

      console.log('✅ DNS resolved:', {
        hostname: urlObj.hostname,
        address: addresses.address,
        family: addresses.family,
        duration: dnsDuration,
      });
    } catch (dnsError: any) {
      const dnsDuration = Date.now() - dnsStartTime;

      console.warn('⚠️ DNS lookup failed:', {
        hostname: urlObj.hostname,
        error: dnsError?.message,
        code: dnsError?.code,
        duration: dnsDuration,
      });
      // Продолжаем выполнение, возможно DNS резолвится при fetch
    }

    // Отправляем запрос к YooKassa с таймаутом
    let yookassaResponse;
    const fetchStartTime = Date.now();

    try {
      // Используем AbortController с таймаутом
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Fetch timeout reached, aborting...');
        controller.abort();
      }, 60000); // 60 секунд таймаут

      yookassaResponse = await fetch(paymentUrl, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
          Connection: 'keep-alive',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const fetchDuration = Date.now() - fetchStartTime;

      console.log('✅ YooKassa response received:', {
        status: yookassaResponse.status,
        statusText: yookassaResponse.statusText,
        duration: fetchDuration,
      });
    } catch (fetchError: any) {
      const fetchDuration = Date.now() - fetchStartTime;
      const isTimeoutError =
        fetchError?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        fetchError?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        fetchError?.message?.includes('timeout') ||
        fetchError?.message?.includes('aborted');

      console.error('❌ Fetch error to YooKassa:', {
        message: fetchError?.message,
        code: fetchError?.code,
        cause: fetchError?.cause,
        causeCode: fetchError?.cause?.code,
        causeMessage: fetchError?.cause?.message,
        stack: fetchError?.stack,
        duration: fetchDuration,
        isTimeoutError,
        paymentUrlHost: urlObj.hostname,
      });

      // В dev режиме возвращаем детали ошибки
      const isDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV !== 'production';

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: isDev
            ? `Fetch failed: ${fetchError?.message || 'Unknown error'}`
            : 'Failed to fetch payment status from payment service',
          ...(isDev && {
            details: {
              code: fetchError?.code,
              cause: fetchError?.cause
                ? {
                    code: fetchError.cause.code,
                    message: fetchError.cause.message,
                  }
                : undefined,
              isTimeoutError,
              durationMs: fetchDuration,
              paymentUrlHost: urlObj.hostname,
            },
          }),
        } as PaymentStatusResponse),
      };
    }

    if (!yookassaResponse.ok) {
      const errorText = await yookassaResponse.text();
      console.error('❌ YooKassa API error:', {
        status: yookassaResponse.status,
        statusText: yookassaResponse.statusText,
        errorText,
      });

      return {
        statusCode: yookassaResponse.status === 404 ? 404 : 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: `YooKassa API error: ${yookassaResponse.statusText}`,
        } as PaymentStatusResponse),
      };
    }

    const paymentStatus: YooKassaPaymentStatus = await yookassaResponse.json();

    console.log(`✅ Payment status from YooKassa:`, {
      paymentId: paymentStatus.id,
      status: paymentStatus.status,
      paid: paymentStatus.paid,
    });

    // Обновляем БД на основе реального статуса от YooKassa
    const orderUpdated = await updateOrderAndPaymentStatus(paymentStatus);

    // Возвращаем статус платежа
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        payment: {
          id: paymentStatus.id,
          status: paymentStatus.status,
          paid: paymentStatus.paid,
          amount: paymentStatus.amount,
          cancellation_details: paymentStatus.cancellation_details,
          metadata: paymentStatus.metadata,
          // Возвращаем confirmation_url для pending статусов
          confirmation_url:
            (paymentStatus.status === 'pending' ||
              paymentStatus.status === 'waiting_for_capture') &&
            paymentStatus.confirmation?.confirmation_url
              ? paymentStatus.confirmation.confirmation_url
              : undefined,
        },
        orderUpdated,
      } as PaymentStatusResponse),
    };
  } catch (error: any) {
    console.error('❌ Error getting payment status:', {
      message: error?.message,
      code: error?.code,
      cause: error?.cause,
      causeCode: error?.cause?.code,
      causeMessage: error?.cause?.message,
      stack: error?.stack,
    });

    // В dev режиме возвращаем детали ошибки для диагностики
    const isDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV !== 'production';

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: isDev ? error?.message || 'Unknown error occurred' : 'Failed to get payment status',
        ...(isDev && {
          details: {
            code: error?.code,
            cause: error?.cause
              ? {
                  code: error.cause.code,
                  message: error.cause.message,
                }
              : undefined,
          },
        }),
      } as PaymentStatusResponse),
    };
  }
};
