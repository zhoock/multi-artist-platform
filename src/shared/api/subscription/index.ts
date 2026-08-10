/**
 * Platform Premium subscription checkout API.
 */

import type { BillingSnapshot } from '@shared/api/billing';
import { getAuthHeader } from '@shared/lib/auth';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import type { MyArchiveData } from '@shared/api/archive';

export interface CreateSubscriptionPaymentRequest {
  returnUrl?: string;
  plan?: 'explorer' | 'collector' | 'archivist';
  intent?: 'upgrade';
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

export interface CreateSubscriptionPaymentMethodRebindRequest {
  returnUrl?: string;
}

export interface CreateSubscriptionPaymentMethodRebindResponse {
  success: boolean;
  data?: {
    paymentId: string;
    confirmationUrl?: string;
    subscriptionPaymentId?: string;
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
        kind?: string;
      };
      confirmation_url?: string;
    };
    subscriptionActivated: boolean;
    paymentMethodUpdated?: boolean;
    archive?: MyArchiveData;
  };
  error?: string;
  code?: string;
}

export interface PatchSubscriptionAutoRenewResponse {
  success: boolean;
  data?: {
    archive: MyArchiveData;
  };
  error?: string;
  code?: string;
}

export interface DeleteSubscriptionPaymentMethodResponse {
  success: boolean;
  data?: {
    billing: BillingSnapshot;
  };
  error?: string;
  code?: string;
}

export interface SubscriptionScheduledPlanResponse {
  success: boolean;
  data?: {
    archive: MyArchiveData;
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

export async function createSubscriptionPaymentMethodRebind(
  data: CreateSubscriptionPaymentMethodRebindRequest = {}
): Promise<CreateSubscriptionPaymentMethodRebindResponse> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    return { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' };
  }

  try {
    const response = await fetchWithAuthSession('/api/subscription/payment-method/rebind', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify(data),
    });

    const payload = (await response
      .json()
      .catch(() => ({}))) as CreateSubscriptionPaymentMethodRebindResponse;

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

export async function deleteSubscriptionPaymentMethod(): Promise<DeleteSubscriptionPaymentMethodResponse> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    return { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' };
  }

  try {
    const response = await fetchWithAuthSession('/api/subscription/payment-method', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
    });

    const payload = (await response
      .json()
      .catch(() => ({}))) as DeleteSubscriptionPaymentMethodResponse;

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

export async function patchSubscriptionAutoRenew(
  autoRenewEnabled: boolean
): Promise<PatchSubscriptionAutoRenewResponse> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    return { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' };
  }

  try {
    const response = await fetchWithAuthSession('/api/subscription/auto-renew', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ autoRenewEnabled }),
    });

    const payload = (await response.json().catch(() => ({}))) as PatchSubscriptionAutoRenewResponse;

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

export async function scheduleSubscriptionDowngrade(
  plan: 'explorer' | 'collector' | 'archivist'
): Promise<SubscriptionScheduledPlanResponse> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    return { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' };
  }

  try {
    const response = await fetchWithAuthSession('/api/subscription/scheduled-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ plan }),
    });

    const payload = (await response.json().catch(() => ({}))) as SubscriptionScheduledPlanResponse;

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

export async function cancelScheduledSubscriptionDowngrade(): Promise<SubscriptionScheduledPlanResponse> {
  const authHeader = getAuthHeader();
  if (!('Authorization' in authHeader)) {
    return { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' };
  }

  try {
    const response = await fetchWithAuthSession('/api/subscription/scheduled-plan', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as SubscriptionScheduledPlanResponse;

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
