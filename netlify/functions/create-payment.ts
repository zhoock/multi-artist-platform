// netlify/functions/create-payment.ts
/**
 * Netlify Serverless Function для создания платежа через ЮKassa API.
 *
 * Учётные данные продавца (shopId + secret) хранятся в БД (`user_payment_settings`), не в ENV.
 *
 * Опциональные переменные окружения:
 * - YOOKASSA_RETURN_URL — URL возврата после оплаты (иначе Referer или getPublicAppOrigin())
 * - YOOKASSA_API_URL — endpoint API (по умолчанию production v3)
 * - YOOKASSA_TEST_MODE — флаг для документации/логов (тело test в запросе может быть отключено)
 *
 * Локальная разработка:
 * - Netlify Dev читает .env из корня; нужны DATABASE_URL, ENCRYPTION_KEY и креды артиста в БД
 *
 * Диагностика:
 * - POST /api/create-payment с {"diagnose": true} — инфраструктура и доступность API (без глобального shop/secret)
 * - GET /api/yookassa-health — multi-tenant health (БД, API host, ENCRYPTION_KEY; см. функцию)
 * - См. docs/YOOKASSA-DIAGNOSTICS.md для подробной инструкции
 *
 * Пример использования:
 * POST /api/create-payment
 * Body: {
 *   amount: number,
 *   currency: string,
 *   description: string,
 *   albumId: string,
 *   customerEmail: string,
 *   returnUrl: string (опционально),
 *   diagnose: boolean (опционально, для диагностики)
 * }
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import dns from 'node:dns';
import { getUserIdFromEvent } from './lib/api-helpers';
import { query } from './lib/db';
import { buyerAlreadyOwnsAlbumForCheckout } from './lib/purchase-access';
import { resolveAlbumSellerUserId } from './lib/resolveAlbumSellerUserId';
import { resolveAlbumByKey, resolveAlbumSlug } from './lib/resolve-album-key';
import { resolveAlbumPaymentReturnUrl } from './lib/yookassa-return-url';
import {
  isDevPaymentModeEnabled,
  logDevPaymentAlbumCreate,
  extractReturnToFromReturnUrl,
} from './lib/dev-payment-mode';
import { completeDevAlbumPayment } from './lib/complete-dev-payment';

dns.setDefaultResultOrder('ipv4first');

interface CreatePaymentRequest {
  amount: number;
  currency?: string;
  description: string;
  albumId: string;
  customerEmail: string;
  returnUrl?: string;
  userId?: string; // опционально; сверяется с владельцем альбома/заказа из БД (креды только у продавца в БД)
  orderId?: string; // ID существующего заказа (для повторной оплаты)
  paymentToken?: string; // Токен от Checkout.js для оплаты на сайте
  billingData?: {
    buyerDisplayName: string;
    phone?: string;
    country?: string;
    zip?: string;
  };
}

interface CreatePaymentResponse {
  success: boolean;
  paymentId?: string;
  confirmationUrl?: string;
  orderId?: string;
  /** Dev-only: payment fulfilled server-side without YooKassa redirect */
  devPaymentCompleted?: boolean;
  error?: string;
  message?: string;
}

/**
 * Определяет продавца (владельца альбома) только из БД — не доверяем телу запроса.
 * При несовпадении optional `userId` из клиента с владельцем — 403.
 */
async function resolveSellerUserIdForPayment(
  data: CreatePaymentRequest
): Promise<
  | { ok: true; sellerUserId: string }
  | { ok: false; statusCode: number; body: CreatePaymentResponse }
> {
  if (data.orderId) {
    const r = await query<{ user_id: string | null; album_id: string }>(
      'SELECT user_id, album_id FROM orders WHERE id = $1',
      [data.orderId]
    );
    if (r.rows.length === 0) {
      return { ok: false, statusCode: 404, body: { success: false, error: 'Order not found' } };
    }
    const row = r.rows[0];
    const [orderAlbumSlug, requestAlbumSlug] = await Promise.all([
      resolveAlbumSlug(row.album_id),
      resolveAlbumSlug(data.albumId),
    ]);
    if (!orderAlbumSlug || !requestAlbumSlug || orderAlbumSlug !== requestAlbumSlug) {
      return {
        ok: false,
        statusCode: 400,
        body: { success: false, error: 'albumId does not match order' },
      };
    }
    if (!row.user_id) {
      return {
        ok: false,
        statusCode: 400,
        body: { success: false, error: 'Order has no seller' },
      };
    }
    if (data.userId && data.userId !== row.user_id) {
      return {
        ok: false,
        statusCode: 403,
        body: { success: false, error: 'Invalid seller context' },
      };
    }
    return { ok: true, sellerUserId: row.user_id };
  }

  const sellerUserId = await resolveAlbumSellerUserId(data.albumId);
  if (!sellerUserId) {
    return {
      ok: false,
      statusCode: 400,
      body: { success: false, error: 'Album has no owner' },
    };
  }
  if (data.userId && data.userId !== sellerUserId) {
    return {
      ok: false,
      statusCode: 403,
      body: { success: false, error: 'Invalid seller context' },
    };
  }
  return { ok: true, sellerUserId };
}

interface YooKassaPaymentRequest {
  amount: {
    value: string;
    currency: string;
  };
  capture: boolean;
  confirmation?: {
    type: 'redirect';
    return_url: string;
    enforce?: boolean; // Опционально, по умолчанию false
  };
  payment_token?: string; // Токен от Checkout.js (в корне запроса, не в payment_method!)
  description: string;
  test?: boolean; // true для тестового режима
  metadata?: {
    albumId: string;
    customerEmail: string;
    [key: string]: string;
  };
  receipt?: {
    customer: {
      email: string;
      full_name?: string;
      phone?: string;
    };
    items: Array<{
      description: string;
      quantity: string;
      amount: {
        value: string;
        currency: string;
      };
      vat_code?: number;
      /** https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/items */
      payment_subject?: string;
      payment_mode?: string;
    }>;
  };
}

interface YooKassaPaymentResponse {
  id: string;
  status: string;
  amount: {
    value: string;
    currency: string;
  };
  confirmation: {
    type: string;
    confirmation_url: string;
  };
  created_at: string;
  description: string;
  metadata?: {
    [key: string]: string;
  };
}

/**
 * Режим диагностики без создания платежа: окружение и доступность host API YooKassa.
 * Проверки с shopId/secret конкретного продавца здесь нет (они только в БД; полный тест — оплата или save settings).
 */
async function handleDiagnosticMode(
  headers: Record<string, string>
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  try {
    const apiUrl = process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments';

    const diagnosticInfo = {
      env: {
        nodeEnv: process.env.NODE_ENV,
        netlifyDev: process.env.NETLIFY_DEV,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
      },
      yookassa: {
        apiUrl,
        credentialsScope: 'per_seller_database' as const,
      },
    };

    let yookassaReachable: { ok: boolean; httpStatus?: number; error?: string } = {
      ok: false,
      error: 'not tested',
    };

    try {
      const testUrl = `${apiUrl}?limit=1`;
      const testResponse = await fetch(testUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      yookassaReachable = {
        ok: Number.isFinite(testResponse.status) && testResponse.status > 0,
        httpStatus: testResponse.status,
        error:
          testResponse.status === 401 || testResponse.status === 403
            ? undefined
            : `HTTP ${testResponse.status} (unauthenticated probe)`,
      };
    } catch (testError: any) {
      yookassaReachable = {
        ok: false,
        error: testError?.message || 'Unknown error',
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        diagnostic: {
          ...diagnosticInfo,
          yookassaApiReachable: yookassaReachable,
        },
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error?.message || 'Diagnostic failed',
      }),
    };
  }
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  console.log('🔍 create-payment:', {
    hasDb: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    netlifyDev: process.env.NETLIFY_DEV,
  });

  // CORS headers для работы с фронтенда
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed. Use POST.',
      } as CreatePaymentResponse),
    };
  }

  try {
    // Парсим тело запроса
    const data: CreatePaymentRequest = JSON.parse(event.body || '{}');

    // Режим диагностики: если передан {"diagnose": true}, возвращаем статус без создания платежа
    if ((data as any).diagnose === true) {
      return await handleDiagnosticMode(headers);
    }

    // Валидация полей до доступа к БД / ключам
    if (!data.amount || !data.description || !data.albumId || !data.customerEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid request data. Required: amount, description, albumId, customerEmail',
        } as CreatePaymentResponse),
      };
    }

    // Минимальная сумма для ЮKassa - 0.01 (1 копейка)
    if (data.amount < 0.01) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Amount must be at least 0.01',
        } as CreatePaymentResponse),
      };
    }

    const albumSlug = await resolveAlbumSlug(data.albumId);
    if (!albumSlug) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Album not found',
        } as CreatePaymentResponse),
      };
    }
    data.albumId = albumSlug;

    const sellerResolved = await resolveSellerUserIdForPayment(data);
    if (!sellerResolved.ok) {
      return {
        statusCode: sellerResolved.statusCode,
        headers,
        body: JSON.stringify(sellerResolved.body),
      };
    }
    const sellerUserId = sellerResolved.sellerUserId;

    const buyerUserId = getUserIdFromEvent(event);
    if (await buyerAlreadyOwnsAlbumForCheckout(buyerUserId, data.customerEmail, data.albumId)) {
      console.log('ℹ️ create-payment blocked: buyer already owns album', {
        albumId: data.albumId,
        buyerUserId: buyerUserId ? `…${buyerUserId.slice(-6)}` : null,
      });
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'ALREADY_OWNED',
          message: 'This album is already in My Purchases.',
        } as CreatePaymentResponse),
      };
    }

    // Создаем или получаем заказ
    let orderId: string;
    let orderAmount: number;
    let orderStatus: string;

    if (data.orderId) {
      // Проверяем существующий заказ
      const orderResult = await query<{
        id: string;
        amount: number;
        status: string;
        payment_id: string | null;
      }>('SELECT id, amount, status, payment_id FROM orders WHERE id = $1', [data.orderId]);

      if (orderResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Order not found',
          } as CreatePaymentResponse),
        };
      }

      const order = orderResult.rows[0];
      orderId = order.id;
      orderAmount = parseFloat(order.amount.toString());
      orderStatus = order.status;

      // Проверяем, что сумма совпадает
      if (Math.abs(orderAmount - data.amount) > 0.01) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Amount mismatch with existing order',
          } as CreatePaymentResponse),
        };
      }

      // Если заказ уже оплачен, не создаем новый платеж
      if (orderStatus === 'paid') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Order already paid',
          } as CreatePaymentResponse),
        };
      }

      // Если есть активный платеж, возвращаем его URL
      if (order.payment_id) {
        const paymentResult = await query<{
          provider_payment_id: string;
          status: string;
        }>(
          `SELECT provider_payment_id, status 
           FROM payments 
           WHERE order_id = $1 AND status IN ('pending', 'waiting_for_capture')
           ORDER BY created_at DESC 
           LIMIT 1`,
          [orderId]
        );

        if (paymentResult.rows.length > 0) {
          const payment = paymentResult.rows[0];
          // Получаем актуальный статус платежа от ЮKassa
          // Для упрощения возвращаем существующий payment_id
          // В реальности нужно проверить статус через API ЮKassa
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              paymentId: payment.provider_payment_id,
              orderId,
              confirmationUrl: '', // Нужно получить из ЮKassa API
              message: 'Payment already exists for this order',
            } as CreatePaymentResponse),
          };
        }
      }
    } else {
      // Создаем новый заказ
      console.log('📝 Creating new order in database...', {
        albumId: data.albumId,
        amount: data.amount,
        customerEmail: data.customerEmail,
        hasDbUrl: !!process.env.DATABASE_URL,
      });

      try {
        const buyerDisplayName = data.billingData?.buyerDisplayName?.trim() || null;

        const orderResult = await query<{ id: string }>(
          `INSERT INTO orders (
            user_id, album_id, amount, currency, customer_email,
            buyer_display_name, customer_phone,
            status, payment_provider
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            sellerUserId,
            data.albumId,
            data.amount,
            'RUB', // YooKassa работает только с рублями
            data.customerEmail,
            buyerDisplayName,
            data.billingData?.phone || null,
            'pending_payment',
            'yookassa',
          ]
        );

        if (orderResult.rows.length === 0) {
          throw new Error('Failed to create order');
        }

        orderId = orderResult.rows[0].id;
        orderAmount = data.amount;
        orderStatus = 'pending_payment';
        console.log('✅ Order created:', { orderId, orderAmount, orderStatus });
      } catch (dbError: any) {
        console.error('❌ Database error when creating order:', {
          message: dbError?.message,
          code: dbError?.code,
          detail: dbError?.detail,
          hint: dbError?.hint,
          hasDbUrl: !!process.env.DATABASE_URL,
        });
        throw dbError;
      }
    }

    if (isDevPaymentModeEnabled()) {
      const { paymentId } = await completeDevAlbumPayment({
        orderId,
        amount: orderAmount,
      });

      logDevPaymentAlbumCreate({
        orderId,
        paymentId,
        returnTo: extractReturnToFromReturnUrl(data.returnUrl),
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          orderId,
          paymentId,
          devPaymentCompleted: true,
        } as CreatePaymentResponse),
      };
    }

    let shopId: string;
    let secretKey: string;
    try {
      const { getDecryptedSecretKey } = await import('./payment-settings');
      const userCredentials = await getDecryptedSecretKey(sellerUserId, 'yookassa');
      if (!userCredentials?.shopId || !userCredentials?.secretKey) {
        console.warn(`⚠️ Seller ${sellerUserId} has no active YooKassa credentials`);
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'seller_payment_not_configured',
            message:
              'This artist has not connected YooKassa or payments are disabled. Purchases are unavailable.',
          } as CreatePaymentResponse),
        };
      }
      shopId = userCredentials.shopId.trim();
      secretKey = userCredentials.secretKey.trim();
    } catch (credErr) {
      console.error(`❌ Error loading YooKassa credentials for seller ${sellerUserId}:`, credErr);
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'payment_credentials_unavailable',
          message: 'Could not load payment settings for this seller.',
        } as CreatePaymentResponse),
      };
    }

    console.log('🔐 YooKassa credentials loaded (seller only, no platform fallback):', {
      shopId,
      sellerUserId,
      shopIdLength: shopId.length,
      secretKeyLength: secretKey.length,
      secretKeyPrefix: `${secretKey.substring(0, 6)}***`,
      credentialsSource: 'user_settings',
      nodeEnv: process.env.NODE_ENV,
      netlifyDev: process.env.NETLIFY_DEV,
    });

    // Нормализуем телефон для YooKassa: только цифры, без символов
    // YooKassa требует формат: только цифры, без +, пробелов, скобок и т.п.
    // Для RU обычно: 11 цифр, начинается с 7 (например: 79211234567)
    let normalizedPhone: string | undefined;
    if (data.billingData?.phone) {
      // Удаляем все нецифровые символы
      const phoneDigits = data.billingData.phone.replace(/\D/g, '');

      // Проверяем валидность: для RU номер должен начинаться с 7 и быть длиной 11 цифр
      // Для других стран может быть другая длина, но минимум 10 цифр
      if (phoneDigits.length >= 10 && phoneDigits.length <= 15) {
        normalizedPhone = phoneDigits;
        console.log('✅ Phone normalized:', {
          original: data.billingData.phone,
          normalized: normalizedPhone,
        });
      } else {
        console.warn('⚠️ Invalid phone format, skipping phone in receipt:', {
          original: data.billingData.phone,
          digits: phoneDigits,
          length: phoneDigits.length,
        });
        // Не передаём телефон, если он невалидный
      }
    }

    // Формируем return URL с orderId (platform origin — no hardcoded legacy domain)
    let refererOrigin: string | null = null;

    if (event.headers.referer) {
      try {
        refererOrigin = new URL(event.headers.referer).origin;
      } catch (error) {
        console.warn('⚠️ Invalid referer URL, using platform fallback return URL:', {
          referer: event.headers.referer,
          error,
        });
      }
    }

    const returnUrl = resolveAlbumPaymentReturnUrl({
      requestedUrl: data.returnUrl,
      refererOrigin,
      orderId,
    });

    // Формируем запрос к ЮKassa
    // ВАЖНО: YooKassa (российский платежный сервис) работает только с рублями (RUB)
    // Игнорируем валюту от клиента и принудительно используем RUB
    const yookassaCurrency = 'RUB';

    // Определяем тестовый режим
    // ВАЖНО: параметр test работает ТОЛЬКО с тестовыми shop_id и secret_key
    // Если используете production креды, test нужно отключить
    const isTestMode = process.env.YOOKASSA_TEST_MODE === 'true';

    console.log('🔧 YooKassa mode (seller shop from DB):', {
      isTestMode,
      YOOKASSA_TEST_MODE: process.env.YOOKASSA_TEST_MODE,
      NODE_ENV: process.env.NODE_ENV,
      NETLIFY_DEV: process.env.NETLIFY_DEV,
      sellerShopIdPrefix: `${shopId.slice(0, 6)}...`,
    });

    // Формируем запрос: если есть paymentToken (Checkout.js), используем payment_token в корне,
    // иначе используем только confirmation для redirect (умная оплата)
    const yookassaRequest: YooKassaPaymentRequest = {
      amount: {
        value: data.amount.toFixed(2),
        currency: yookassaCurrency, // Принудительно RUB для YooKassa
      },
      capture: true, // Деньги списываются сразу после оплаты
      ...(data.paymentToken
        ? {
            // Для Checkout.js: payment_token в корне запроса
            payment_token: data.paymentToken,
            // confirmation нужен для 3D Secure (если потребуется)
            confirmation: {
              type: 'redirect',
              return_url: returnUrl,
              enforce: false, // Не принуждаем к 3D Secure
            },
          }
        : {
            // Для умной оплаты: используем только confirmation
            confirmation: {
              type: 'redirect',
              return_url: returnUrl,
            },
          }),
      description: data.description,
      // test: isTestMode, // ВРЕМЕННО ОТКЛЮЧЕНО для диагностики
      metadata: {
        orderId: orderId,
        albumId: data.albumId,
        customerEmail: data.customerEmail,
      },
      receipt: {
        customer: {
          email: data.customerEmail,
          ...(data.billingData?.buyerDisplayName && {
            full_name: data.billingData.buyerDisplayName,
          }),
          // Передаём телефон только если он нормализован и валиден
          ...(normalizedPhone && { phone: normalizedPhone }),
        },
        items: [
          {
            description: data.description,
            quantity: '1',
            amount: {
              value: data.amount.toFixed(2),
              currency: yookassaCurrency, // Принудительно RUB для YooKassa
            },
            vat_code: 1, // НДС не облагается (для цифровых товаров в РФ часто используется код 1)
            payment_subject: 'commodity', // Обязательно для production: товар
            payment_mode: 'full_prepayment', // Обязательно для production: полная предоплата
          },
        ],
      },
    };

    // Используем production или test API
    // В тестовом режиме используйте: https://api.yookassa.ru/v3/payments
    // В production используйте: https://api.yookassa.ru/v3/payments
    const apiUrl = process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments';

    // Проверяем DNS резолюцию перед fetch
    const urlObj = new URL(apiUrl);
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

    // Создаем Basic Auth заголовок (credentials уже trimmed выше)
    const authHeader = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    // Проверяем существующие pending платежи для этого заказа
    // ВАЖНО: Избегаем создания дублей pending платежей
    if (orderId) {
      try {
        const existingPaymentResult = await query<{
          provider_payment_id: string;
          status: string;
        }>(
          `SELECT provider_payment_id, status 
           FROM payments 
           WHERE order_id = $1 
             AND provider = 'yookassa'
             AND status IN ('pending', 'waiting_for_capture')
           ORDER BY created_at DESC 
           LIMIT 1`,
          [orderId]
        );

        if (existingPaymentResult.rows.length > 0) {
          const existingPayment = existingPaymentResult.rows[0];
          console.log(`ℹ️ Found existing pending payment for order ${orderId}:`, {
            paymentId: existingPayment.provider_payment_id,
            status: existingPayment.status,
          });

          // Получаем актуальные данные платежа из YooKassa
          try {
            const apiUrl = process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments';
            const paymentUrl = `${apiUrl}/${existingPayment.provider_payment_id}`;
            const existingPaymentResponse = await fetch(paymentUrl, {
              method: 'GET',
              headers: {
                Authorization: `Basic ${authHeader}`,
                'Content-Type': 'application/json',
              },
            });

            if (existingPaymentResponse.ok) {
              const existingPaymentData: YooKassaPaymentResponse =
                await existingPaymentResponse.json();

              // Если платеж все еще pending, возвращаем его confirmation_url
              if (
                existingPaymentData.status === 'pending' ||
                existingPaymentData.status === 'waiting_for_capture'
              ) {
                console.log(`✅ Returning existing pending payment:`, {
                  paymentId: existingPaymentData.id,
                  status: existingPaymentData.status,
                  hasConfirmationUrl: !!existingPaymentData.confirmation?.confirmation_url,
                });

                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    success: true,
                    paymentId: existingPaymentData.id,
                    orderId,
                    confirmationUrl: existingPaymentData.confirmation?.confirmation_url || '',
                    message: 'Using existing pending payment',
                  } as CreatePaymentResponse),
                };
              }

              // Если платеж завершен, продолжаем создание нового
              console.log(
                `ℹ️ Existing payment is ${existingPaymentData.status}, creating new payment`
              );
            } else {
              console.warn(
                `⚠️ Could not fetch existing payment status, creating new payment:`,
                existingPaymentResponse.status
              );
            }
          } catch (fetchError) {
            console.warn('⚠️ Error fetching existing payment, creating new payment:', fetchError);
          }
        }
      } catch (dbError) {
        console.warn('⚠️ Error checking existing payments, continuing with new payment:', dbError);
      }
    }

    // Ключ идемпотентности стабильный по orderId для предотвращения дублей
    // YooKassa вернет тот же платеж при повторном запросе с тем же ключом
    const idempotenceKey = `order-${orderId}`;

    // Логируем детали запроса перед отправкой (после формирования yookassaRequest)
    console.log('📤 Sending request to YooKassa:', {
      url: apiUrl,
      method: 'POST',
      orderId,
      idempotenceKey,
      receiptCustomer: yookassaRequest.receipt
        ? {
            email: yookassaRequest.receipt.customer.email,
            phone: yookassaRequest.receipt.customer.phone || 'not provided',
            fullName: yookassaRequest.receipt.customer.full_name || 'not provided',
          }
        : 'not provided',
      amount: yookassaRequest.amount.value,
      currency: yookassaRequest.amount.currency,
      capture: yookassaRequest.capture,
      test: yookassaRequest.test, // ВАЖНО: проверяем, передаётся ли test
      hasPaymentToken: !!yookassaRequest.payment_token, // payment_token в корне запроса для Checkout.js
      hasConfirmation: !!yookassaRequest.confirmation,
      returnUrl: yookassaRequest.confirmation?.return_url,
    });

    // Логируем тело запроса для диагностики (без секретных данных)
    console.log(
      '📤 YooKassa request body:',
      JSON.stringify(
        {
          ...yookassaRequest,
          receipt: yookassaRequest.receipt
            ? {
                customer: {
                  email: yookassaRequest.receipt.customer.email,
                  phone: yookassaRequest.receipt.customer.phone ? '***' : undefined,
                  full_name: yookassaRequest.receipt.customer.full_name || undefined,
                },
                items: yookassaRequest.receipt.items,
              }
            : undefined,
        },
        null,
        2
      )
    );

    // Отправляем запрос к ЮKassa
    let yookassaResponse;
    const fetchStartTime = Date.now();

    // Retry логика для fetch запроса к YooKassa
    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Используем AbortController с увеличенным таймаутом
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn(`⚠️ Fetch timeout reached (attempt ${attempt + 1}), aborting...`);
          controller.abort();
        }, 60000); // 60 секунд таймаут

        yookassaResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${authHeader}`,
            'Idempotence-Key': idempotenceKey, // Стабильный ключ для предотвращения дублей
            Connection: 'keep-alive',
          },
          body: JSON.stringify(yookassaRequest),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const fetchDuration = Date.now() - fetchStartTime;

        console.log('✅ YooKassa response received:', {
          status: yookassaResponse.status,
          statusText: yookassaResponse.statusText,
          duration: fetchDuration,
          attempt: attempt + 1,
        });

        // Если получили ответ, выходим из цикла retry
        break;
      } catch (fetchError: any) {
        const fetchDuration = Date.now() - fetchStartTime;
        lastError = fetchError;

        const isTimeoutError =
          fetchError?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
          fetchError?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
          fetchError?.message?.includes('timeout') ||
          fetchError?.message?.includes('aborted');

        console.error(`❌ Fetch error to YooKassa (attempt ${attempt + 1}/${maxRetries + 1}):`, {
          message: fetchError?.message,
          code: fetchError?.code,
          cause: fetchError?.cause,
          duration: fetchDuration,
          isTimeoutError,
        });

        // Если это не последняя попытка и ошибка таймаута - делаем retry
        if (attempt < maxRetries && isTimeoutError) {
          const delay = 2000 * (attempt + 1); // Увеличиваем задержку: 2s, 4s
          console.warn(`⚠️ Retrying fetch in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Если это последняя попытка или не таймаут - пробрасываем ошибку
        throw fetchError;
      }
    }

    // Проверяем, что получили ответ после всех попыток
    if (!yookassaResponse) {
      const fetchDuration = Date.now() - fetchStartTime;
      console.error('❌ All fetch attempts failed:', {
        attempts: maxRetries + 1,
        duration: fetchDuration,
        lastError: lastError?.message,
      });
      throw lastError || new Error('All fetch attempts failed');
    }

    if (!yookassaResponse.ok) {
      const errorText = await yookassaResponse.text();
      console.error('❌ YooKassa API error:', {
        status: yookassaResponse.status,
        statusText: yookassaResponse.statusText,
        errorText,
        shopId: shopId?.substring(0, 10) + '...', // Первые 10 символов для диагностики
        secretKeyLength: secretKey?.length,
        authHeaderLength: authHeader.length,
      });

      // Пытаемся распарсить JSON ошибки от YooKassa
      let parsedError: any = null;
      let errorMessage = `Payment creation failed: ${yookassaResponse.statusText}`;
      let errorDetails: any = {};

      try {
        parsedError = JSON.parse(errorText);
        console.error('❌ YooKassa error details:', JSON.stringify(parsedError, null, 2));

        // YooKassa возвращает ошибки в формате:
        // { "type": "error", "id": "...", "code": "...", "description": "...", "parameter": "..." }
        if (parsedError.description) {
          errorMessage = parsedError.description;
        }

        if (parsedError.parameter) {
          errorDetails.parameter = parsedError.parameter;
          errorMessage += ` (parameter: ${parsedError.parameter})`;
        }

        if (parsedError.code) {
          errorDetails.code = parsedError.code;
        }

        // Специальная обработка для 401 ошибки (invalid_credentials)
        if (yookassaResponse.status === 401) {
          console.error('🔐 Authentication failed! Check seller YooKassa credentials:', {
            sellerUserId,
            shopIdPrefix: shopId?.substring(0, 6),
            secretKeyPrefix: secretKey?.substring(0, 6) + '***',
            secretKeyLength: secretKey?.length,
            credentialsSource: 'user_settings',
            errorCode: parsedError.code,
            errorDescription: parsedError.description,
            nodeEnv: process.env.NODE_ENV,
            netlifyDev: process.env.NETLIFY_DEV,
          });
          errorMessage = `Payment credentials rejected by YooKassa for this seller.`;
        }
      } catch (parseError) {
        // Если не удалось распарсить, используем текст как есть
        console.warn('⚠️ Could not parse YooKassa error JSON:', parseError);
      }

      // Преобразуем 401 в 500 для клиента, чтобы не раскрывать детали авторизации
      const clientStatusCode = yookassaResponse.status === 401 ? 500 : yookassaResponse.status;

      return {
        statusCode: clientStatusCode,
        headers,
        body: JSON.stringify({
          success: false,
          error: errorMessage,
          message: errorText, // Полный текст ошибки для диагностики
          ...errorDetails, // Детали ошибки (parameter, code)
        } as CreatePaymentResponse),
      };
    }

    const paymentData: YooKassaPaymentResponse = await yookassaResponse.json();

    console.log('✅ Payment created:', {
      paymentId: paymentData.id,
      status: paymentData.status,
      amount: paymentData.amount.value,
      orderId,
      albumId: data.albumId,
    });

    // Сохраняем платеж в БД
    try {
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
          paymentData.id,
          paymentData.status,
          paymentData.amount.value,
          paymentData.amount.currency,
        ]
      );

      // Обновляем заказ с payment_id
      await query(
        `UPDATE orders 
         SET payment_id = $1, status = 'pending_payment', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [paymentData.id, orderId]
      );

      console.log('✅ Payment saved to database:', {
        orderId,
        paymentId: paymentData.id,
      });
    } catch (dbError) {
      console.error('❌ Error saving payment to database:', dbError);
      // Не прерываем процесс, платеж уже создан в ЮKassa
    }

    // Возвращаем URL для подтверждения платежа
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        paymentId: paymentData.id,
        orderId,
        confirmationUrl: paymentData.confirmation?.confirmation_url || '',
      } as CreatePaymentResponse),
    };
  } catch (error: any) {
    console.error('❌ Error creating payment:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      code: error?.code,
      cause: error?.cause,
      stack: error?.stack,
    });

    // Детальная информация об ошибке для диагностики
    const errorDetails: any = {
      success: false,
      error: error?.message || 'Unknown error occurred',
    };

    // Добавляем детали для dev режима
    if (error?.cause) {
      errorDetails.code = error.cause.code;
      errorDetails.cause = error.cause.message || error.cause.toString();
    }

    // Добавляем код ошибки, если есть
    if (error?.code) {
      errorDetails.errorCode = error.code;
    }

    // В dev режиме возвращаем больше информации
    const isDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV !== 'production';
    if (isDev) {
      errorDetails.stack = error?.stack;
      errorDetails.fullError = error?.toString();
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(errorDetails as CreatePaymentResponse),
    };
  }
};
