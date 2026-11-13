/**
 * Artist in-app notification after successful album purchase fulfillment.
 */

import { resolveAlbumByKey } from './resolve-album-key';
import { resolveUserIdForCustomerEmail } from './purchases';
import { query } from './db';
import { insertAlbumPurchaseUserNotification } from './user-notifications-db';

type OrderNotifyRow = {
  id: string;
  album_id: string;
  customer_email: string;
  status: string;
};

export async function notifyArtistAlbumPurchaseOnFulfillment(orderId: string): Promise<void> {
  if (!orderId?.trim()) return;

  try {
    const orderResult = await query<OrderNotifyRow>(
      `SELECT id, album_id, customer_email, status
       FROM orders
       WHERE id = $1::uuid
       LIMIT 1`,
      [orderId],
      0
    );
    const order = orderResult.rows[0];
    if (!order || order.status !== 'paid') return;

    const album = await resolveAlbumByKey(order.album_id);
    if (!album?.userId?.trim()) return;

    const buyerUserId = await resolveUserIdForCustomerEmail(order.customer_email);
    if (buyerUserId && buyerUserId === album.userId) return;

    await insertAlbumPurchaseUserNotification({
      orderId: order.id,
      artistUserId: album.userId,
      albumSlug: album.albumSlug,
      artistSlug: album.artistPublicSlug ?? '',
      albumTitle: album.album,
      albumCoverPath: album.cover ?? '',
    });
  } catch (error) {
    console.error('[album-purchase-notification] insert failed', {
      orderIdSuffix: `…${orderId.slice(-6)}`,
      error,
    });
  }
}
