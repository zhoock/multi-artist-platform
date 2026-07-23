/**
 * Shared album payment fulfillment after provider reports a terminal status.
 * Used by get-payment-status (YooKassa poll) and dev payment mode (local skip).
 */

import { query } from './db';
import { upsertPurchaseRecord, upsertPurchaseRecordSilent } from './purchases';
import { resolveAlbumByKey } from './resolve-album-key';

export type AlbumPaymentStatusPayload = {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  metadata?: {
    orderId?: string;
    albumId?: string;
    customerEmail?: string;
    [key: string]: string | undefined;
  };
};

/**
 * Updates order + payment rows and runs purchase/email side effects (idempotent).
 */
export async function applyAlbumPaymentSuccess(
  paymentStatus: AlbumPaymentStatusPayload
): Promise<boolean> {
  const orderId = paymentStatus.metadata?.orderId;
  if (!orderId) {
    console.warn('⚠️ No orderId in payment metadata, skipping DB update');
    return false;
  }

  try {
    let orderStatus: string;
    if (paymentStatus.status === 'succeeded' || paymentStatus.paid) {
      orderStatus = 'paid';
    } else if (paymentStatus.status === 'canceled') {
      orderStatus = 'canceled';
    } else {
      orderStatus = 'pending_payment';
    }

    await query(
      `UPDATE orders 
       SET status = $1::text, 
           payment_id = $2,
           paid_at = CASE WHEN $1::text = 'paid' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [orderStatus, paymentStatus.id, orderId]
    );

    await query(
      `INSERT INTO payments (
        order_id, provider, provider_payment_id, status, amount, currency
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (provider, provider_payment_id) 
      DO UPDATE SET 
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP`,
      [
        orderId,
        'yookassa',
        paymentStatus.id,
        paymentStatus.status,
        paymentStatus.amount.value,
        paymentStatus.amount.currency,
      ]
    );

    if (orderStatus === 'paid' && (paymentStatus.status === 'succeeded' || paymentStatus.paid)) {
      try {
        const orderResult = await query<{
          album_id: string;
          customer_email: string;
        }>(
          `SELECT album_id, customer_email
           FROM orders 
           WHERE id = $1`,
          [orderId]
        );

        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          const albumKey = order.album_id || paymentStatus.metadata?.albumId;
          const customerEmail = order.customer_email || paymentStatus.metadata?.customerEmail;

          if (albumKey && customerEmail) {
            const webhookEventId = `notification-payment.succeeded-${paymentStatus.id}`;
            const webhookCheck = await query<{ id: string }>(
              'SELECT id FROM webhook_events WHERE provider = $1 AND event_id = $2',
              ['yookassa', webhookEventId]
            );

            if (webhookCheck.rows.length > 0) {
              console.log(
                'ℹ️ [applyAlbumPaymentSuccess] Skipping email send - webhook already processed payment:',
                {
                  orderId,
                  paymentId: paymentStatus.id,
                  webhookEventId,
                }
              );
              await upsertPurchaseRecordSilent(orderId, customerEmail, albumKey);
            } else {
              const purchase = await upsertPurchaseRecord(orderId, customerEmail, albumKey);

              if (purchase) {
                console.log('✅ Purchase created/updated:', {
                  purchaseId: purchase.id,
                  purchaseToken: purchase.purchase_token,
                  orderId,
                  albumKey,
                  customerEmail,
                });

                void import('./email')
                  .then(({ sendPurchaseEmail }) =>
                    resolveAlbumByKey(albumKey).then(async (album) => {
                      if (!album) {
                        return { success: false, error: 'Album not found' };
                      }

                      const orderMetaResult = await query<{
                        buyer_display_name: string | null;
                      }>(
                        `SELECT buyer_display_name
                         FROM orders
                         WHERE id = $1
                         LIMIT 1`,
                        [orderId]
                      );
                      const orderMeta = orderMetaResult.rows[0];

                      const customerName = orderMeta?.buyer_display_name?.trim() || undefined;

                      const { resolveEmailLocaleForAddress } = await import(
                        './user-preferred-language'
                      );
                      const locale = await resolveEmailLocaleForAddress(customerEmail, album.lang);

                      return sendPurchaseEmail({
                        to: customerEmail,
                        customerName,
                        albumName: album.album,
                        artistName: album.artistDisplayName,
                        orderId,
                        albumSlug: album.albumSlug,
                        albumCover: album.cover,
                        albumUserId: album.userId,
                        albumLang: album.lang,
                        paymentId: paymentStatus.id,
                        locale,
                      });
                    })
                  )
                  .then((result) => {
                    if (result?.alreadySent) {
                      console.log(
                        'ℹ️ [applyAlbumPaymentSuccess] Purchase email already sent (idempotency hit):',
                        { to: customerEmail, orderId }
                      );
                    } else if (result?.success) {
                      console.log(
                        '✅ [applyAlbumPaymentSuccess] Purchase email sent successfully:',
                        {
                          to: customerEmail,
                          orderId,
                        }
                      );
                    } else {
                      console.error(
                        '❌ [applyAlbumPaymentSuccess] Failed to send purchase email:',
                        {
                          to: customerEmail,
                          orderId,
                          error: result?.error,
                        }
                      );
                    }
                  })
                  .catch((emailError) => {
                    console.error('❌ [applyAlbumPaymentSuccess] Error sending purchase email:', {
                      to: customerEmail,
                      orderId,
                      error: emailError instanceof Error ? emailError.message : String(emailError),
                    });
                  });
              }
            }
          } else {
            console.warn('⚠️ Cannot create purchase: missing albumId or customerEmail', {
              albumKey,
              customerEmail,
              orderId,
            });
          }
        }
      } catch (purchaseError) {
        console.error('❌ Error creating purchase:', purchaseError);
      }
    }

    console.log(
      `✅ Updated order ${orderId} and payment ${paymentStatus.id} to status: ${orderStatus}`
    );
    return true;
  } catch (error) {
    console.error('❌ Error updating order and payment status:', error);
    return false;
  }
}
