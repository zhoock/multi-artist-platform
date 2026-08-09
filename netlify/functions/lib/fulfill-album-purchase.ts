/**
 * Shared idempotent album purchase fulfillment after a succeeded provider payment.
 * Used by get-payment-status (poll), YooKassa webhook, and checkout recovery.
 */

import type { PoolClient } from 'pg';

import { query, withTransaction } from './db';
import { sendPurchaseEmail } from './email';
import { resolveAlbumByKey, resolveAlbumSlug } from './resolve-album-key';
import { resolveUserIdForCustomerEmail } from './purchases';

export class AlbumFulfillmentError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = 'AlbumFulfillmentError';
  }
}

export type FulfillAlbumPurchaseResult = {
  purchaseId: string;
  purchaseToken: string;
  paymentId: string;
};

type OrderFulfillmentRow = {
  id: string;
  album_id: string;
  customer_email: string;
  buyer_display_name: string | null;
  status: string;
};

async function loadOrderForFulfillment(
  client: PoolClient,
  orderId: string
): Promise<OrderFulfillmentRow> {
  const result = await client.query<OrderFulfillmentRow>(
    `SELECT id, album_id, customer_email, buyer_display_name, status
     FROM orders
     WHERE id = $1
     FOR UPDATE`,
    [orderId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AlbumFulfillmentError('order_not_found_for_fulfillment', 'ORDER_NOT_FOUND');
  }

  return row;
}

export async function findSucceededPaymentForOrder(
  client: PoolClient,
  orderId: string
): Promise<{ provider_payment_id: string }> {
  const result = await client.query<{ provider_payment_id: string }>(
    `SELECT provider_payment_id
     FROM payments
     WHERE order_id = $1
       AND provider = 'yookassa'
       AND status = 'succeeded'
     ORDER BY created_at DESC
     LIMIT 1`,
    [orderId]
  );

  const row = result.rows[0];
  if (!row?.provider_payment_id) {
    throw new AlbumFulfillmentError('succeeded_payment_missing', 'PAYMENT_NOT_SUCCEEDED');
  }

  return row;
}

async function upsertPurchaseRecordWithClient(
  client: PoolClient,
  orderId: string,
  customerEmail: string,
  albumId: string
): Promise<{ id: string; purchase_token: string }> {
  const albumSlug = await resolveAlbumSlug(albumId);
  if (!albumSlug) {
    throw new AlbumFulfillmentError('album_not_found_for_purchase', 'ALBUM_NOT_FOUND');
  }

  const userId = await resolveUserIdForCustomerEmail(customerEmail);
  const purchaseResult = await client.query<{ id: string; purchase_token: string }>(
    `INSERT INTO purchases (order_id, customer_email, album_id, user_id)
     VALUES ($1, $2, $3, $4::uuid)
     ON CONFLICT (customer_email, album_id)
     DO UPDATE SET
       order_id = EXCLUDED.order_id,
       user_id = COALESCE(purchases.user_id, EXCLUDED.user_id),
       revoked_at = NULL,
       revoked_by_user = NULL,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, purchase_token`,
    [orderId, customerEmail, albumSlug, userId]
  );

  const purchase = purchaseResult.rows[0];
  if (!purchase) {
    throw new AlbumFulfillmentError('purchase_record_not_created', 'PURCHASE_NOT_CREATED');
  }

  return purchase;
}

/**
 * Idempotent purchase upsert for an order that already has a succeeded payment row.
 * Must run inside a transaction where the order row is locked (FOR UPDATE).
 */
export async function fulfillPaidOrderPurchaseInTransaction(
  client: PoolClient,
  orderId: string,
  options?: {
    albumKey?: string;
    customerEmail?: string;
  }
): Promise<FulfillAlbumPurchaseResult> {
  const order = await loadOrderForFulfillment(client, orderId);
  const payment = await findSucceededPaymentForOrder(client, orderId);

  const albumKey = options?.albumKey ?? order.album_id;
  const customerEmail = options?.customerEmail ?? order.customer_email;

  if (!albumKey?.trim() || !customerEmail?.trim()) {
    throw new AlbumFulfillmentError(
      'missing_album_or_customer_for_fulfillment',
      'MISSING_ALBUM_OR_CUSTOMER'
    );
  }

  const purchase = await upsertPurchaseRecordWithClient(client, orderId, customerEmail, albumKey);

  return {
    purchaseId: purchase.id,
    purchaseToken: purchase.purchase_token,
    paymentId: payment.provider_payment_id,
  };
}

export async function sendAlbumPurchaseConfirmationEmail(
  orderId: string,
  paymentId: string,
  customerEmail: string,
  albumKey: string,
  buyerDisplayName?: string | null
): Promise<void> {
  const album = await resolveAlbumByKey(albumKey);
  if (!album) {
    console.error('[fulfill-album-purchase] album_missing_for_email', {
      orderIdSuffix: `…${orderId.slice(-6)}`,
      albumKeySuffix: albumKey.length > 8 ? `…${albumKey.slice(-8)}` : albumKey,
    });
    return;
  }

  const { resolveEmailLocaleForAddress } = await import('./user-preferred-language');
  const locale = await resolveEmailLocaleForAddress(customerEmail, album.lang);
  const customerName = buyerDisplayName?.trim() || undefined;

  const emailResult = await sendPurchaseEmail({
    to: customerEmail,
    customerName,
    albumName: album.album,
    artistName: album.artistDisplayName,
    orderId,
    albumSlug: album.albumSlug,
    artistPublicSlug: album.artistPublicSlug,
    albumCover: album.cover,
    albumUserId: album.userId,
    albumLang: album.lang,
    paymentId,
    locale,
  });

  if (emailResult.alreadySent) {
    console.log('[fulfill-album-purchase] purchase_email_already_sent', {
      orderIdSuffix: `…${orderId.slice(-6)}`,
      paymentIdSuffix: `…${paymentId.slice(-6)}`,
    });
  } else if (!emailResult.success) {
    console.error('[fulfill-album-purchase] purchase_email_failed', {
      orderIdSuffix: `…${orderId.slice(-6)}`,
      error: emailResult.error,
    });
  }
}

export type ApplyAlbumPaymentSucceededInput = {
  orderId: string;
  providerPaymentId: string;
  paymentStatus: string;
  amountValue: string;
  currency: string;
  capturedAt?: string | null;
  rawLastEvent?: string | null;
  albumKey?: string;
  customerEmail?: string;
  buyerDisplayName?: string | null;
};

/**
 * Transactionally marks the order paid, upserts the payment row, and creates/restores
 * the purchase. Email is sent after commit via reservePurchaseEmail idempotency.
 */
export async function applyAlbumPaymentSucceededFulfillment(
  input: ApplyAlbumPaymentSucceededInput
): Promise<FulfillAlbumPurchaseResult> {
  const fulfillment = await withTransaction(async (client) => {
    await client.query(`SELECT id FROM orders WHERE id = $1 FOR UPDATE`, [input.orderId]);

    await client.query(
      `UPDATE orders
       SET status = 'paid',
           payment_id = $2,
           paid_at = COALESCE(paid_at, COALESCE($3::timestamp, CURRENT_TIMESTAMP)),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [input.orderId, input.providerPaymentId, input.capturedAt ?? null]
    );

    await client.query(
      `INSERT INTO payments (
         order_id, provider, provider_payment_id, status, amount, currency, raw_last_event
       ) VALUES ($1, 'yookassa', $2, 'succeeded', $3, $4, $5::jsonb)
       ON CONFLICT (provider, provider_payment_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         raw_last_event = COALESCE(EXCLUDED.raw_last_event, payments.raw_last_event),
         updated_at = CURRENT_TIMESTAMP`,
      [
        input.orderId,
        input.providerPaymentId,
        input.amountValue,
        input.currency,
        input.rawLastEvent ?? null,
      ]
    );

    return fulfillPaidOrderPurchaseInTransaction(client, input.orderId, {
      albumKey: input.albumKey,
      customerEmail: input.customerEmail,
    });
  });

  const orderMeta = await query<{
    album_id: string;
    customer_email: string;
    buyer_display_name: string | null;
  }>(
    `SELECT album_id, customer_email, buyer_display_name
     FROM orders
     WHERE id = $1`,
    [input.orderId]
  );
  const order = orderMeta.rows[0];
  const albumKey = input.albumKey ?? order?.album_id;
  const customerEmail = input.customerEmail ?? order?.customer_email;

  if (albumKey && customerEmail) {
    await sendAlbumPurchaseConfirmationEmail(
      input.orderId,
      fulfillment.paymentId,
      customerEmail,
      albumKey,
      input.buyerDisplayName ?? order?.buyer_display_name
    );
  }

  return fulfillment;
}

/**
 * Recovery path for a paid order that never received a purchase row.
 * Runs purchase upsert in a transaction; email after commit.
 */
export async function recoverAlbumPurchaseForPaidOrder(
  orderId: string
): Promise<FulfillAlbumPurchaseResult> {
  const fulfillment = await withTransaction(async (client) => {
    return fulfillPaidOrderPurchaseInTransaction(client, orderId);
  });

  const orderMeta = await query<{
    album_id: string;
    customer_email: string;
    buyer_display_name: string | null;
  }>(
    `SELECT album_id, customer_email, buyer_display_name
     FROM orders
     WHERE id = $1`,
    [orderId]
  );
  const order = orderMeta.rows[0];

  if (order?.album_id && order.customer_email) {
    await sendAlbumPurchaseConfirmationEmail(
      orderId,
      fulfillment.paymentId,
      order.customer_email,
      order.album_id,
      order.buyer_display_name
    );
  }

  return fulfillment;
}
