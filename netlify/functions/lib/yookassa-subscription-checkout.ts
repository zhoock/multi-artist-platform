/**
 * YooKassa subscription checkout helpers: error parsing and user-facing codes.
 */

export type YooKassaApiError = {
  type?: string;
  id?: string;
  code?: string;
  description?: string;
  parameter?: string;
};

export function parseYooKassaApiErrorBody(text: string): YooKassaApiError | null {
  try {
    return JSON.parse(text) as YooKassaApiError;
  } catch {
    return null;
  }
}

export type YooKassaCheckoutFailure = {
  httpStatus: number;
  message: string;
  code: string;
  providerCode?: string;
  providerDescription?: string;
};

export function mapYooKassaSubscriptionCheckoutFailure(
  httpStatus: number,
  errorBody: YooKassaApiError | null
): YooKassaCheckoutFailure {
  const providerCode = errorBody?.code?.trim() || undefined;
  const providerDescription = errorBody?.description?.trim() || undefined;
  const descriptionLower = providerDescription?.toLowerCase() ?? '';

  if (
    providerCode === 'forbidden' &&
    (descriptionLower.includes('save_payment_method') ||
      descriptionLower.includes('payment_method') ||
      descriptionLower.includes('recurring') ||
      descriptionLower.includes('autopay'))
  ) {
    return {
      httpStatus: 502,
      code: 'YOOKASSA_AUTOPAYMENTS_NOT_ENABLED',
      message:
        'YooKassa autopayments are not enabled for this shop. Enable recurring payments in the merchant dashboard.',
      providerCode,
      providerDescription,
    };
  }

  if (providerCode === 'invalid_request' && descriptionLower.includes('receipt')) {
    return {
      httpStatus: 502,
      code: 'YOOKASSA_RECEIPT_REJECTED',
      message:
        'Payment receipt was rejected by YooKassa. Check fiscal settings for the platform shop.',
      providerCode,
      providerDescription,
    };
  }

  return {
    httpStatus: 502,
    code: 'YOOKASSA_CHECKOUT_FAILED',
    message: 'Failed to create subscription payment',
    providerCode,
    providerDescription,
  };
}
