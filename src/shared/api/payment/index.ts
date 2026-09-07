/**
 * API для работы с платежами через ЮKassa.
 */

import { fetchWithAuthSession } from '@shared/lib/authFetch';

export interface CreatePaymentRequest {
  albumId: string;
  customerEmail: string;
  returnUrl?: string;
  /** Опционально: проверка совпадения с владельцем альбома; продавец берётся из альбома на сервере */
  userId?: string;
  paymentToken?: string; // Токен от Checkout.js для оплаты на сайте
  billingData?: {
    buyerDisplayName: string;
    phone?: string;
    country?: string;
    zip?: string;
  };
}

export interface CreatePaymentResponse {
  success: boolean;
  paymentId?: string;
  confirmationUrl?: string;
  orderId?: string;
  /** Dev-only: payment fulfilled server-side without YooKassa redirect */
  devPaymentCompleted?: boolean;
  /** Purchase restored from an already-paid order (no new YooKassa payment). */
  fulfillmentRecovered?: boolean;
  /** Signed token for polling order/payment status. */
  statusToken?: string;
  statusTokenExpiresAt?: number;
  error?: string;
  message?: string;
}

/** Server error code when buyer already owns the album (HTTP 409). */
export const CREATE_PAYMENT_ALREADY_OWNED = 'ALREADY_OWNED';

// Экспорт типов и утилит
export type { PaymentProvider, UserPaymentSettings, PaymentSettingsResponse } from './types';
export { getPaymentSettings, savePaymentSettings, disconnectPaymentProvider } from './settings';

/** Только дедупликация параллельных запросов; после завершения запись снимается, чтобы после подключения ЮKassa повторный запрос увидел актуальные данные в БД. */
const yookassaShopIdInflight = new Map<string, Promise<{ shopId?: string; error?: string }>>();

/**
 * Shop ID YooKassa продавца альбома для Checkout.js (требуется активная ЮKassa у артиста).
 * `albumId` — UUID `albums.id` или строка `albums.album_id` (как в URL магазина).
 */
export async function getYooKassaShopId(
  albumId: string
): Promise<{ shopId?: string; error?: string }> {
  let pending = yookassaShopIdInflight.get(albumId);
  if (!pending) {
    pending = (async (): Promise<{ shopId?: string; error?: string }> => {
      try {
        const qs = new URLSearchParams({ albumId });
        const response = await fetchWithAuthSession(`/api/yookassa-shop-id?${qs.toString()}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP ${response.status}: ${response.statusText}`,
          }));
          return { error: errorData.error || `HTTP ${response.status}` };
        }

        const data = await response.json();
        if (data.success && data.shopId) {
          return { shopId: data.shopId };
        }

        return { error: data.error || 'Shop ID not found' };
      } catch (error) {
        console.error('Error getting YooKassa Shop ID:', error);
        return {
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    })().finally(() => {
      yookassaShopIdInflight.delete(albumId);
    });
    yookassaShopIdInflight.set(albumId, pending);
  }
  return pending;
}

/**
 * Создает платеж через ЮKassa API.
 * @param data - Данные для создания платежа
 * @returns Promise с результатом создания платежа
 */
export async function createPayment(data: CreatePaymentRequest): Promise<CreatePaymentResponse> {
  try {
    const response = await fetchWithAuthSession('/api/create-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
        message: errorData.message,
      };
    }

    const result: CreatePaymentResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error creating payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
