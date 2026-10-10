/**
 * YooKassa renewal payment create error classification (scheduler).
 */

export function isYooKassaPaymentMethodNotSavedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes('YooKassa renewal create failed: 400')) {
    return false;
  }
  return message.includes('payment_method is not saved') && message.includes('payment_method_id');
}
