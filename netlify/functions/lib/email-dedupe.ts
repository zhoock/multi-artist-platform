/**
 * Atomic idempotency layer for transactional emails that can be triggered from more
 * than one code path.
 *
 * The purchase confirmation email has three potential firing sites:
 *   1. YooKassa webhook `payment.succeeded` → `tryPurchaseSideEffects`
 *   2. `/api/get-payment-status` polling fallback (frontend success page)
 *   3. Manual `/.netlify/functions/test-email` (dev only)
 *
 * Until now (1) and (2) both checked `webhook_events` for the *event* row before
 * sending, but the check was read-only — concurrent webhook + polling, page reloads
 * after `succeeded`, and webhook retries each opened a new TOCTOU window. The result
 * was up to N duplicate emails per purchase.
 *
 * This module reuses the existing `webhook_events` table (UNIQUE on `provider, event_id`)
 * as a per-order single-shot lock for email delivery. INSERT…ON CONFLICT DO NOTHING
 * RETURNING id is atomic at the row level in PostgreSQL, so only the first concurrent
 * caller observes a non-empty result and is allowed to actually call Resend.
 *
 * If the send subsequently fails we release the reservation so a future retry can
 * acquire it again (matches the existing `releaseWebhookEvent` pattern in the webhook
 * handler).
 */

import { query } from './db';

/** `webhook_events.provider` value reserved for internal (non-PSP) idempotency rows. */
const INTERNAL_PROVIDER = 'internal';

/** Event-id namespace for "purchase confirmation email sent". */
function buildPurchaseEmailEventId(orderId: string): string {
  return `purchase-email:${orderId}`;
}

/**
 * Atomically reserves the right to send a purchase confirmation email for the given
 * `orderId`. Returns `true` if this caller won the race, `false` if a previous call
 * already reserved (and therefore presumably sent) the email.
 *
 * @param orderId Internal order UUID — uniqueness key for the email.
 * @param paymentId Provider payment id used as `webhook_events.payment_id` (NOT NULL
 *   in the existing schema). Used only for traceability; idempotency is on `event_id`.
 */
export async function reservePurchaseEmail(orderId: string, paymentId: string): Promise<boolean> {
  const eventId = buildPurchaseEmailEventId(orderId);
  const result = await query<{ id: string }>(
    `INSERT INTO webhook_events (provider, event_id, event_type, payment_id)
     VALUES ($1, $2, 'purchase.email.sent', $3)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [INTERNAL_PROVIDER, eventId, paymentId]
  );
  return result.rows.length > 0;
}

/**
 * Releases a reservation previously taken by {@link reservePurchaseEmail}. Call this
 * when the Resend API fails — otherwise the next retry would silently no-op.
 *
 * Errors are swallowed by the caller (best-effort cleanup); even if the row sticks
 * around, the worst case is one missing email which a user can re-request manually.
 */
export async function releasePurchaseEmailReservation(orderId: string): Promise<void> {
  await query(`DELETE FROM webhook_events WHERE provider = $1 AND event_id = $2`, [
    INTERNAL_PROVIDER,
    buildPurchaseEmailEventId(orderId),
  ]);
}
