// netlify/functions/payment-settings.ts
/**
 * Netlify Serverless Function: настройки платежей **только** для аутентифицированного пользователя.
 *
 * Идентификатор аккаунта берётся из JWT (`Authorization: Bearer`), не из query/body.
 * Лишний `userId` в теле POST, если не совпадает с JWT, → 403.
 *
 * GET /api/payment-settings?provider=yookassa
 * POST /api/payment-settings
 * DELETE /api/payment-settings?provider=yookassa
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { query, type PaymentSettingsRow } from './lib/db';
import { encrypt, decrypt } from './lib/crypto';
import { validateYooKassaCredentials } from './lib/yookassa-validator';
import { getUserIdFromEvent } from './lib/api-helpers';

interface PaymentSettingsRequest {
  userId: string;
  provider: 'yookassa' | 'stripe' | 'paypal';
  shopId?: string;
  secretKey?: string;
  isActive?: boolean;
}

interface PaymentSettingsResponse {
  success: boolean;
  settings?: {
    userId: string;
    provider: string;
    shopId?: string;
    isActive: boolean;
    connectedAt?: string;
    lastUsedAt?: string;
  };
  error?: string;
  message?: string;
}

/**
 * Получить настройки платежей из БД
 */
async function getPaymentSettings(
  userId: string,
  provider: string
): Promise<PaymentSettingsResponse['settings'] | null> {
  try {
    const result = await query<PaymentSettingsRow>(
      'SELECT * FROM user_payment_settings WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      userId: row.user_id,
      provider: row.provider,
      shopId: row.shop_id || undefined,
      isActive: row.is_active,
      /** Дата последнего сохранения настроек (не только первого подключения). */
      connectedAt: row.updated_at.toISOString(),
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : undefined,
    };
  } catch (error) {
    console.error('❌ Error getting payment settings from DB:', error);
    throw error;
  }
}

/**
 * Сохранить настройки платежей в БД
 */
async function savePaymentSettings(
  data: PaymentSettingsRequest
): Promise<PaymentSettingsResponse['settings']> {
  if (!data.secretKey) {
    throw new Error('secretKey is required for saving payment settings');
  }

  try {
    // Шифруем секретный ключ перед сохранением
    const encryptedSecretKey = encrypt(data.secretKey);

    // Сначала проверяем, существует ли запись
    const existing = await query<PaymentSettingsRow>(
      'SELECT * FROM user_payment_settings WHERE user_id = $1 AND provider = $2',
      [data.userId, data.provider]
    );

    let result;
    if (existing.rows.length > 0) {
      // Обновляем существующую запись
      result = await query<PaymentSettingsRow>(
        `UPDATE user_payment_settings
         SET shop_id = $3,
             secret_key_encrypted = $4,
             is_active = $5,
             updated_at = NOW()
         WHERE user_id = $1 AND provider = $2
         RETURNING *`,
        [data.userId, data.provider, data.shopId || null, encryptedSecretKey, data.isActive ?? true]
      );
    } else {
      // Создаём новую запись
      result = await query<PaymentSettingsRow>(
        `INSERT INTO user_payment_settings (user_id, provider, shop_id, secret_key_encrypted, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [data.userId, data.provider, data.shopId || null, encryptedSecretKey, data.isActive ?? true]
      );
    }

    const row = result.rows[0];

    return {
      userId: row.user_id,
      provider: row.provider,
      shopId: row.shop_id || undefined,
      isActive: row.is_active,
      connectedAt: row.updated_at.toISOString(),
      lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : undefined,
    };
  } catch (error) {
    console.error('❌ Error saving payment settings to DB:', error);
    throw error;
  }
}

/**
 * Отключить платежную систему
 */
async function disconnectPaymentProvider(userId: string, provider: string): Promise<boolean> {
  try {
    await query(
      'UPDATE user_payment_settings SET is_active = false, updated_at = NOW() WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );
    return true;
  } catch (error) {
    console.error('❌ Error disconnecting payment provider:', error);
    throw error;
  }
}

/**
 * Получить расшифрованный secretKey из БД (для использования в create-payment)
 * Обновляет last_used_at при использовании
 */
export async function getDecryptedSecretKey(
  userId: string,
  provider: string
): Promise<{ shopId: string; secretKey: string } | null> {
  try {
    const result = await query<PaymentSettingsRow>(
      'SELECT shop_id, secret_key_encrypted FROM user_payment_settings WHERE user_id = $1 AND provider = $2 AND is_active = true',
      [userId, provider]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    if (!row.shop_id || !row.secret_key_encrypted) {
      return null;
    }

    // Обновляем last_used_at
    await query(
      'UPDATE user_payment_settings SET last_used_at = NOW() WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );

    // Расшифровываем секретный ключ
    const decryptedSecretKey = decrypt(row.secret_key_encrypted);

    return {
      shopId: row.shop_id,
      secretKey: decryptedSecretKey,
    };
  } catch (error) {
    console.error('❌ Error getting decrypted secret key:', error);
    throw error;
  }
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  const json = (statusCode: number, body: PaymentSettingsResponse) => ({
    statusCode,
    headers,
    body: JSON.stringify(body),
  });

  // Обработка preflight запроса
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const authenticatedUserId = getUserIdFromEvent(event);
    if (!authenticatedUserId) {
      return json(401, { success: false, error: 'Unauthorized' });
    }

    const { isUserEmailVerified } = await import('./lib/email-verification');
    if (!(await isUserEmailVerified(authenticatedUserId))) {
      return json(403, {
        success: false,
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    /** Любой явный чужой userId в запросе — 403 */
    const rejectForeignUserId = (claimed?: string | null): boolean => {
      if (claimed === undefined || claimed === null) return false;
      const t = String(claimed).trim();
      if (!t) return false;
      return t !== authenticatedUserId;
    };

    // GET - получить настройки платежей
    if (event.httpMethod === 'GET') {
      const queryUserId = event.queryStringParameters?.userId;
      if (rejectForeignUserId(queryUserId)) {
        return json(403, { success: false, error: 'Forbidden' });
      }
      const provider = event.queryStringParameters?.provider || 'yookassa';

      const settings = await getPaymentSettings(authenticatedUserId, provider);

      if (!settings) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            settings: undefined,
          } as PaymentSettingsResponse),
        };
      }

      // НЕ возвращаем secretKey в ответе (безопасность)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          settings: {
            ...settings,
            secretKey: undefined, // Не возвращаем секретный ключ
          },
        } as PaymentSettingsResponse),
      };
    }

    // POST - сохранить настройки платежей
    if (event.httpMethod === 'POST') {
      let data: PaymentSettingsRequest;
      try {
        data = JSON.parse(event.body || '{}') as PaymentSettingsRequest;
      } catch {
        return json(400, { success: false, error: 'Invalid JSON body' });
      }

      if (rejectForeignUserId(data.userId)) {
        return json(403, { success: false, error: 'Forbidden' });
      }

      if (!data.provider) {
        return json(400, {
          success: false,
          error: 'provider is required',
        });
      }

      // Для ЮKassa требуются shopId и secretKey
      if (data.provider === 'yookassa' && (!data.shopId || !data.secretKey)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'shopId and secretKey are required for YooKassa',
          } as PaymentSettingsResponse),
        };
      }

      // Валидация shopId (должен быть непустой строкой)
      if (data.shopId && data.shopId.trim().length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'shopId cannot be empty',
          } as PaymentSettingsResponse),
        };
      }

      // Валидация secretKey (должен быть непустой строкой)
      if (data.secretKey && data.secretKey.trim().length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'secretKey cannot be empty',
          } as PaymentSettingsResponse),
        };
      }

      // Валидация shopId и secretKey через тестовый запрос к ЮKassa API
      // ВАЖНО: Валидация может быть отключена через переменную окружения для упрощения отладки
      const skipValidation = process.env.SKIP_YOOKASSA_VALIDATION === 'true';

      if (!skipValidation && data.provider === 'yookassa' && data.shopId && data.secretKey) {
        try {
          const validation = await validateYooKassaCredentials(data.shopId, data.secretKey);

          if (!validation.valid) {
            console.error('❌ YooKassa validation failed:', validation.error);
            // Не блокируем сохранение, только предупреждаем
            console.warn(
              '⚠️ YooKassa validation failed, but saving credentials anyway. Error:',
              validation.error
            );
            // Можно раскомментировать для строгой валидации:
            // return {
            //   statusCode: 400,
            //   headers,
            //   body: JSON.stringify({
            //     success: false,
            //     error: `Неверные данные ЮKassa: ${validation.error || 'Проверка не пройдена'}`,
            //     message: validation.error || 'Проверьте правильность Shop ID и Secret Key',
            //   } as PaymentSettingsResponse),
            // };
          }
        } catch (validationError) {
          console.error('❌ YooKassa validation error:', validationError);
          // Не блокируем сохранение при ошибке валидации, только логируем
          console.warn(
            '⚠️ YooKassa validation error, but saving credentials anyway. Error:',
            validationError
          );
        }
      } else if (skipValidation) {
        // Validation skipped via SKIP_YOOKASSA_VALIDATION
      }

      const settings = await savePaymentSettings({
        ...data,
        userId: authenticatedUserId,
        isActive: data.isActive ?? true,
      });

      // НЕ возвращаем secretKey в ответе
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          settings: {
            ...settings,
            secretKey: undefined,
          },
          message: 'Payment settings saved successfully',
        } as PaymentSettingsResponse),
      };
    }

    // DELETE - отключить платежную систему
    if (event.httpMethod === 'DELETE') {
      const queryUserId = event.queryStringParameters?.userId;
      if (rejectForeignUserId(queryUserId)) {
        return json(403, { success: false, error: 'Forbidden' });
      }
      const provider = event.queryStringParameters?.provider || 'yookassa';

      await disconnectPaymentProvider(authenticatedUserId, provider);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Payment provider disconnected successfully',
        } as PaymentSettingsResponse),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed',
      } as PaymentSettingsResponse),
    };
  } catch (error) {
    console.error('❌ Error processing payment settings:', error);

    // Обрабатываем ошибки дубликатов и других constraint violations
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();
      if (errorMsg.includes('duplicate key') || errorMsg.includes('unique constraint')) {
        errorMessage =
          'This payment provider is already configured for your account. Please use the update option instead.';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
      } as PaymentSettingsResponse),
    };
  }
};
