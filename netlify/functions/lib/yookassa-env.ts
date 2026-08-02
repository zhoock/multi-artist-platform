/**
 * YooKassa shop credentials from environment (YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY).
 * Used for Premium subscription checkout only.
 * Album purchases use per-artist credentials from user_payment_settings.
 */

export interface YooKassaEnvCredentials {
  shopId: string;
  secretKey: string;
}

export function getYooKassaEnvCredentials(): YooKassaEnvCredentials | null {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) {
    return null;
  }
  return { shopId, secretKey };
}

export function yookassaEnvConfigured(): boolean {
  return getYooKassaEnvCredentials() !== null;
}
