/**
 * Platform Premium subscription checkout API.
 */

import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';

export interface CreateSubscriptionPaymentRequest {
  returnUrl?: string;
  plan?: 'explorer' | 'collector' | 'archivist';
}

export interface CreateSubscriptionPaymentResponse {
  success: boolean;
  data?: {
    paymentId: string;
    confirmationUrl?: string;
    subscriptionPaymentId?: string;
    /** Dev-only: payment persisted without YooKassa redirect */
    devPaymentCompleted?: boolean;
  };
  error?: string;
  code?: string;
}

export interface SubscriptionPaymentStatusResponse {
  success: boolean;
  data?: {
    payment: {
      id: string | null;
      status: string;
      paid: boolean;
      amount: { value: string; currency: string };
      metadata?: {
        productType?: string;
        userId?: string;
        plan?: string;
      };
      confirmation_url?: string;
    };
    subscriptionActivated: boolean;
  };
  error?: string;
  code?: string;
}

export async function createSubscriptionPayment(
  data: CreateSubscriptionPaymentRequest = {}
): Promise<CreateSubscriptionPaymentResponse> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    return { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' };
  }

  try {
    const response = await fetchWithAuthSession('/api/create-subscription-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify(data),
    });

    const payload = (await response.json().catch(() => ({}))) as CreateSubscriptionPaymentResponse;

    if (!response.ok) {
      return {
        success: false,
        error: payload.error || `HTTP ${response.status}`,
        code: payload.code,
      };
    }

    return payload;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getSubscriptionPaymentStatus(params: {
  paymentId?: string;
  subscriptionPaymentId?: string;
}): Promise<SubscriptionPaymentStatusResponse> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    return { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' };
  }

  const qs = new URLSearchParams();
  if (params.paymentId) qs.set('paymentId', params.paymentId);
  if (params.subscriptionPaymentId) qs.set('subscriptionPaymentId', params.subscriptionPaymentId);

  try {
    const response = await fetchWithAuthSession(
      `/api/get-subscription-payment-status?${qs.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
      }
    );

    const payload = (await response.json().catch(() => ({}))) as SubscriptionPaymentStatusResponse;

    if (!response.ok) {
      return {
        success: false,
        error: payload.error || `HTTP ${response.status}`,
        code: payload.code,
      };
    }

    return payload;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
