/**
 * Server-side artist monetization gate.
 * Connected payment provider (active YooKassa + shopId) enables premium features.
 */

import { query } from './db';
import {
  isPremiumContentVisibility,
  resolveEffectiveContentVisibility,
} from '../../../src/shared/lib/payment/artistMonetization';

export { isPremiumContentVisibility, resolveEffectiveContentVisibility };

export async function artistHasMonetizationEnabled(
  artistUserId: string | null | undefined
): Promise<boolean> {
  const id = artistUserId?.trim();
  if (!id) return false;

  const result = await query<{ shop_id: string | null }>(
    `SELECT shop_id FROM user_payment_settings
     WHERE user_id = $1
       AND provider = 'yookassa'
       AND is_active = true
     LIMIT 1`,
    [id]
  );

  return Boolean(result.rows[0]?.shop_id?.trim());
}

/** Reject setting subscribers_only when payments are not connected. */
export async function assertPremiumVisibilityAllowed(
  artistUserId: string,
  visibility: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isPremiumContentVisibility(visibility)) {
    return { ok: true };
  }
  const enabled = await artistHasMonetizationEnabled(artistUserId);
  if (enabled) return { ok: true };
  return {
    ok: false,
    message:
      'Connect a payment system before setting content to subscribers only. Monetization is required for exclusive content.',
  };
}
