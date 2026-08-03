/**
 * API для работы с настройками платежей пользователей.
 * Владелец определяется по JWT (`Authorization: Bearer`), не по userId в URL/body.
 */

import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

import type { PaymentSettingsResponse, UserPaymentSettings, PaymentProvider } from './types';

export interface GetPaymentSettingsRequest {
  /** @deprecated игнорируется сервером; оставлено для совместимости вызовов */
  userId?: string;
  provider?: PaymentProvider;
}

export interface SavePaymentSettingsRequest {
  /** @deprecated игнорируется сервером; оставлено для совместимости */
  userId?: string;
  provider: PaymentProvider;
  shopId?: string;
  secretKey?: string;
  isActive?: boolean;
}

function authFetch(path: string, init: RequestInit): Promise<Response> {
  const auth = getAuthHeader();
  return fetchWithAuthSession(path, {
    ...init,
    headers: {
      ...init.headers,
      ...auth,
    },
  });
}

/**
 * Получить настройки платежей текущего пользователя (JWT).
 */
export async function getPaymentSettings(
  request: GetPaymentSettingsRequest = {}
): Promise<PaymentSettingsResponse> {
  try {
    const params = new URLSearchParams({
      ...(request.provider && { provider: request.provider }),
    });

    const response = await authFetch(`/api/payment-settings?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      } else {
        return {
          success: false,
          error:
            'Сервер вернул неверный формат данных. Убедитесь, что Netlify Functions запущены (netlify dev).',
        };
      }
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error:
          'Сервер вернул неверный формат данных. Убедитесь, что Netlify Functions запущены (netlify dev).',
      };
    }

    const result: PaymentSettingsResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error getting payment settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Сохранить настройки платежей текущего пользователя (JWT).
 */
export async function savePaymentSettings(
  data: SavePaymentSettingsRequest
): Promise<PaymentSettingsResponse> {
  try {
    const { provider, shopId, secretKey, isActive } = data;
    const response = await authFetch('/api/payment-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider, shopId, secretKey, isActive }),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
        console.error('❌ Payment settings save error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          message: errorData.message,
          fullResponse: errorData,
        });
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
          message: errorData.message || errorData.error,
        };
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('❌ Payment settings save error (non-JSON):', {
          status: response.status,
          statusText: response.statusText,
          text: errorText,
        });
        return {
          success: false,
          error:
            'Сервер вернул неверный формат данных. Убедитесь, что Netlify Functions запущены (netlify dev).',
        };
      }
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error:
          'Сервер вернул неверный формат данных. Убедитесь, что Netlify Functions запущены (netlify dev).',
      };
    }

    const result: PaymentSettingsResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error saving payment settings:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Отключить платежную систему для текущего пользователя (JWT).
 */
export async function disconnectPaymentProvider(
  provider: PaymentProvider
): Promise<PaymentSettingsResponse> {
  try {
    const params = new URLSearchParams({
      provider,
    });

    const response = await authFetch(`/api/payment-settings?${params.toString()}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
          message: errorData.message,
        };
      } else {
        return {
          success: false,
          error:
            'Сервер вернул неверный формат данных. Убедитесь, что Netlify Functions запущены (netlify dev).',
        };
      }
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return {
        success: false,
        error:
          'Сервер вернул неверный формат данных. Убедитесь, что Netlify Functions запущены (netlify dev).',
      };
    }

    const result: PaymentSettingsResponse = await response.json();
    return result;
  } catch (error) {
    console.error('Error disconnecting payment provider:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
