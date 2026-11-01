/**
 * Artist revenue for the Audience dashboard (read-only aggregates).
 *
 * Album sales: paid orders for the artist's albums with a succeeded YooKassa payment row.
 * Subscriber support: equal share of succeeded platform subscription payments among artists
 * that were in the subscriber's active collection at payment time (see SQL heuristic).
 */

import { query } from './db';

export type AudienceRevenueCurrency = 'RUB';

export interface AudienceRevenue {
  currency: AudienceRevenueCurrency;
  albumSales: number;
  subscriberSupport: number;
  total: number;
}

function parseMoneySum(raw: string | null | undefined): number {
  if (raw == null || raw === '') return 0;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export async function getArtistAlbumSalesRevenue(
  artistUserId: string,
  periodStart: Date
): Promise<number> {
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(sub.amount), 0)::text AS total
     FROM (
       SELECT DISTINCT o.id, o.amount
       FROM orders o
       WHERE o.status = 'paid'
         AND o.paid_at IS NOT NULL
         AND o.paid_at >= $2
         AND EXISTS (
           SELECT 1
           FROM albums a
           WHERE a.album_id = o.album_id
             AND a.user_id = $1::uuid
           LIMIT 1
         )
         AND EXISTS (
           SELECT 1
           FROM payments p
           WHERE p.order_id = o.id
             AND p.status = 'succeeded'
         )
     ) sub`,
    [artistUserId, periodStart]
  );
  return parseMoneySum(result.rows[0]?.total);
}

export async function getArtistSubscriberSupportRevenue(
  artistUserId: string,
  periodStart: Date
): Promise<number> {
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(sp.amount / slot_count.c), 0)::text AS total
     FROM subscription_payments sp
     INNER JOIN LATERAL (
       SELECT COUNT(*)::numeric AS c
       FROM user_archive ua
       WHERE ua.user_id = sp.user_id
         AND ua.created_at <= sp.updated_at
         AND (ua.is_active = true OR ua.updated_at > sp.updated_at)
     ) slot_count ON slot_count.c > 0
     INNER JOIN user_archive ua_artist
       ON ua_artist.user_id = sp.user_id
      AND ua_artist.artist_user_id = $1::uuid
      AND ua_artist.created_at <= sp.updated_at
      AND (ua_artist.is_active = true OR ua_artist.updated_at > sp.updated_at)
     WHERE sp.status = 'succeeded'
       AND sp.updated_at >= $2
       AND COALESCE(sp.kind, 'initial') <> 'rebind'`,
    [artistUserId, periodStart]
  );
  return parseMoneySum(result.rows[0]?.total);
}

export async function getArtistAudienceRevenue(
  artistUserId: string,
  periodStart: Date
): Promise<AudienceRevenue> {
  const [albumSales, subscriberSupport] = await Promise.all([
    getArtistAlbumSalesRevenue(artistUserId, periodStart),
    getArtistSubscriberSupportRevenue(artistUserId, periodStart),
  ]);
  const total = Math.round((albumSales + subscriberSupport) * 100) / 100;
  return {
    currency: 'RUB',
    albumSales,
    subscriberSupport,
    total,
  };
}
