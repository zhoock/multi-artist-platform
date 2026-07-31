/**
 * Server-side album purchase pricing — single source of truth for checkout amount.
 * Never trust amount/currency/price from the client.
 */

import { query } from './db';
import { ALBUMS_USER_JOIN_SQL, ARTIST_DISPLAY_NAME_SQL, isAlbumUuid } from './resolve-album-key';

export type AlbumPurchasePricing = {
  albumSlug: string;
  albumTitle: string;
  artistDisplayName: string;
  amount: number;
  /** True when release.regularPrice is null, undefined, or blank. */
  priceMissing: boolean;
  /** Display currency from release JSON; YooKassa checkout always uses RUB. */
  currency: string;
  allowDownloadSale: string;
  isPublished: boolean;
  description: string;
};

export type ResolveAlbumPurchaseError = {
  statusCode: number;
  error: string;
};

type AlbumPurchaseRow = {
  album_slug: string;
  title: string | null;
  release: unknown;
  is_published: boolean | null;
  artist_display_name: string | null;
};

const ALBUM_ROW_PRIORITY = `
  ORDER BY (
    SELECT COUNT(*)::int FROM tracks t WHERE t.album_id = a.id
  ) DESC,
  a.updated_at DESC NULLS LAST
`;

const ALBUM_PURCHASE_SELECT = `
  SELECT a.album_id AS album_slug,
         a.album AS title,
         a.release,
         a.is_published,
         ${ARTIST_DISPLAY_NAME_SQL} AS artist_display_name
  FROM albums a
  ${ALBUMS_USER_JOIN_SQL}
`;

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function parseReleaseColumn(release: unknown): Record<string, unknown> {
  if (release == null) return {};
  if (typeof release === 'object' && !Array.isArray(release)) {
    return release as Record<string, unknown>;
  }
  if (typeof release === 'string') {
    try {
      const parsed = JSON.parse(release) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function parseAlbumRegularPrice(value: unknown): number | null {
  let raw: string | null = null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    raw = trimmed.length > 0 ? trimmed : null;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    raw = String(value);
  }
  if (!raw) return null;

  const num = parseFloat(raw);
  if (!Number.isFinite(num) || num < 0.01) return null;
  return Math.round(num * 100) / 100;
}

function isPaidSaleEnabled(allowDownloadSale: string): boolean {
  return allowDownloadSale === 'yes' || allowDownloadSale === 'preorder';
}

function buildPaymentDescription(albumTitle: string, artistDisplayName: string): string {
  const title = albumTitle.trim() || 'Album';
  const artist = artistDisplayName.trim();
  return artist ? `${title} - ${artist} (download)` : `${title} (download)`;
}

function mapRowToPricing(row: AlbumPurchaseRow): AlbumPurchasePricing {
  const release = parseReleaseColumn(row.release);
  const allowDownloadSale = asString(release.allowDownloadSale);
  const priceMissing =
    release.regularPrice == null ||
    (typeof release.regularPrice === 'string' && release.regularPrice.trim().length === 0);
  const parsedAmount = parseAlbumRegularPrice(release.regularPrice);
  const currency = asString(release.currency, 'RUB');
  const albumTitle = row.title?.trim() || '';
  const artistDisplayName = row.artist_display_name?.trim() || '';
  const amount = parsedAmount ?? 0;

  return {
    albumSlug: row.album_slug,
    albumTitle,
    artistDisplayName,
    amount,
    priceMissing,
    currency,
    allowDownloadSale,
    isPublished: row.is_published === true,
    description: buildPaymentDescription(albumTitle, artistDisplayName),
  };
}

export function validateAlbumCheckoutPricing(
  pricing: AlbumPurchasePricing
): ResolveAlbumPurchaseError | null {
  if (!pricing.isPublished) {
    return { statusCode: 400, error: 'Album is not available for purchase' };
  }

  if (!isPaidSaleEnabled(pricing.allowDownloadSale)) {
    return { statusCode: 400, error: 'Album is not available for purchase' };
  }

  if (pricing.priceMissing) {
    return { statusCode: 400, error: 'Album price is not configured' };
  }

  if (pricing.amount < 0.01) {
    return { statusCode: 400, error: 'Album price is invalid' };
  }

  return null;
}

async function fetchAlbumPurchaseRow(albumKey: string): Promise<AlbumPurchaseRow | null> {
  const trimmed = albumKey.trim();
  if (!trimmed) return null;

  if (isAlbumUuid(trimmed)) {
    const byPk = await query<AlbumPurchaseRow>(
      `${ALBUM_PURCHASE_SELECT} WHERE a.id = $1::uuid ${ALBUM_ROW_PRIORITY} LIMIT 1`,
      [trimmed]
    );
    if (byPk.rows[0]) return byPk.rows[0];
  }

  const bySlug = await query<AlbumPurchaseRow>(
    `${ALBUM_PURCHASE_SELECT} WHERE a.album_id = $1 ${ALBUM_ROW_PRIORITY} LIMIT 1`,
    [trimmed]
  );
  return bySlug.rows[0] ?? null;
}

/** Load album pricing from DB (no client monetary fields). */
export async function resolveAlbumPurchasePricing(
  albumKey: string
): Promise<
  { ok: true; pricing: AlbumPurchasePricing } | { ok: false; statusCode: number; error: string }
> {
  const row = await fetchAlbumPurchaseRow(albumKey);
  if (!row) {
    return { ok: false, statusCode: 404, error: 'Album not found' };
  }

  return { ok: true, pricing: mapRowToPricing(row) };
}

/** Load and validate that album can enter the paid checkout flow. */
export async function resolveValidatedAlbumCheckoutPricing(
  albumKey: string
): Promise<
  { ok: true; pricing: AlbumPurchasePricing } | { ok: false; statusCode: number; error: string }
> {
  const resolved = await resolveAlbumPurchasePricing(albumKey);
  if (!resolved.ok) return resolved;

  const validationError = validateAlbumCheckoutPricing(resolved.pricing);
  if (validationError) {
    return { ok: false, ...validationError };
  }

  return resolved;
}
