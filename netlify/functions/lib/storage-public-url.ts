/**
 * Собирает публичный URL объекта в Supabase Storage по пути в bucket.
 * Использует SUPABASE_URL / VITE_SUPABASE_URL из окружения функции (на Netlify всегда есть SUPABASE_URL).
 */
import { coverImgFromStorageField } from '../../../src/shared/lib/albumCoverStorage';

const STORAGE_BUCKET = 'user-media';

const IMAGE_EXT_PATTERN = /\.(jpg|jpeg|png|webp|gif|avif)$/i;
const COVER_SIZE_SUFFIX_PATTERN = /-(64|128|448|896|1344)$/;
/**
 * Email cover variant. Email clients render at small sizes (≤ ~480 CSS px), and 448 px
 * is the smallest variant that's not too small for retina displays. Webp is supported by
 * all major modern email clients (Gmail web/iOS/Android, Apple Mail macOS/iOS, Outlook 365 web,
 * recent Outlook desktop, Yandex Mail, Mail.ru). For uploads that produced only legacy `.jpg`
 * variants the same `-448.jpg` path is also emitted by `commit-cover.ts` (see COVER_SIZE_SUFFIXES).
 */
const EMAIL_COVER_VARIANT = '-448';
const EMAIL_COVER_EXTENSION = 'webp';

function getSupabaseStorageBase(): string | null {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(
    /\/$/,
    ''
  );
  if (!supabaseUrl) {
    return null;
  }
  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}`;
}

function normalizeAlbumCoverStoragePath(cover: string, albumUserId?: string | null): string | null {
  const raw = cover.trim();
  if (!raw) return null;

  if (raw.startsWith('users/')) {
    return raw.replace(/^\/+/, '');
  }

  if (raw.startsWith('/images/')) {
    return null;
  }

  if (!albumUserId) {
    return null;
  }

  const fileName = IMAGE_EXT_PATTERN.test(raw) ? raw : `${raw}.jpg`;
  return `users/${albumUserId}/albums/${fileName.replace(/^\/+/, '')}`;
}

/**
 * Maps a stored `albums.cover` base name to the email-optimized variant filename.
 *
 * `albums.cover` is canonically a base name without extension or size suffix (e.g.
 * `Beatles-Rubber-Soul`). The cover upload pipeline (commit-cover.ts) produces five
 * size variants — `-64`, `-128`, `-448`, `-896`, `-1344` — for both `.webp` and `.jpg`.
 *
 * For emails we want a single, **directly fetchable** URL: a 448-px webp (~30–80 kB).
 * That is large enough for retina display at ~240 CSS px and small enough to be cached
 * quickly by mail provider image proxies (Gmail, Apple Mail), without the cold-start
 * latency of the in-app `/api/proxy-image` Lambda.
 *
 * If `cover` already contains a size suffix or an extension we leave it alone (legacy /
 * manual overrides keep working).
 */
function withEmailCoverVariant(cover: string): string {
  const raw = cover.trim();
  if (!raw) return raw;
  if (IMAGE_EXT_PATTERN.test(raw)) {
    return raw;
  }
  if (COVER_SIZE_SUFFIX_PATTERN.test(raw)) {
    return `${raw}.${EMAIL_COVER_EXTENSION}`;
  }
  return `${raw}${EMAIL_COVER_VARIANT}.${EMAIL_COVER_EXTENSION}`;
}

/**
 * Resolves an album cover field (as stored in `albums.cover`) to a fully-qualified
 * URL suitable for `<img src>` in an email body.
 *
 * Supports:
 * - absolute URLs (returned as-is)
 * - bucket-relative paths like `users/<uuid>/albums/<file>.jpg`
 * - bare filenames like `album_cover` (with optional extension) — combined with `albumUserId`
 *
 * Returns `null` when nothing usable can be produced (caller should render a fallback).
 */
export function resolveAlbumCoverPublicUrl(
  cover: string | null | undefined,
  albumUserId?: string | null
): string | null {
  if (cover == null) {
    return null;
  }
  const raw = String(cover).trim();
  if (!raw) {
    return null;
  }

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }

  const storagePath = normalizeAlbumCoverStoragePath(raw, albumUserId);
  if (!storagePath) {
    return null;
  }

  const base = getSupabaseStorageBase();
  if (!base) {
    return null;
  }

  return encodeURI(`${base}/${storagePath}`);
}

/**
 * Builds an `<img src>` URL for an album cover that mail clients can fetch
 * directly from Supabase Storage's public CDN.
 *
 * Why **not** the `/api/proxy-image` route the dashboard uses:
 *   - The proxy is a Netlify serverless function. Cold starts (200–800ms) plus the
 *     6 MB Lambda response cap caused Gmail's image proxy and Apple Mail to give up
 *     and show a broken-image placeholder in real inboxes.
 *   - The `user-media` bucket is already configured as **public**, so Supabase's
 *     `storage/v1/object/public/…` endpoint serves the bytes with proper cache
 *     headers, no auth, no cold start.
 *
 * What this returns:
 *   - absolute URLs → returned unchanged (legacy data)
 *   - `users/<uuid>/albums/<file>` → encoded direct Supabase URL
 *   - bare base name + `albumUserId` → `users/<uuid>/albums/<base>-448.webp`
 *
 * Returns `null` only when nothing usable can be built; the caller must then render
 * a placeholder graphic instead of a broken `<img>`. There is no longer a fallback
 * to a relative URL — the email is read off-site so absolute is mandatory.
 */
export function buildAlbumCoverEmailUrl(
  cover: unknown,
  albumUserId: string | null | undefined
): string | null {
  if (cover == null) {
    return null;
  }

  let raw: string;
  if (typeof cover === 'string') {
    const trimmed = cover.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('users/') ||
      trimmed.startsWith('/images/')
    ) {
      raw = trimmed;
    } else if (trimmed.startsWith('{')) {
      raw = coverImgFromStorageField(trimmed).trim();
    } else if (IMAGE_EXT_PATTERN.test(trimmed) || COVER_SIZE_SUFFIX_PATTERN.test(trimmed)) {
      raw = trimmed;
    } else {
      raw = (coverImgFromStorageField(trimmed) || trimmed).trim();
    }
  } else {
    raw = coverImgFromStorageField(cover).trim();
  }
  if (!raw) {
    return null;
  }

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:')
  ) {
    return raw;
  }

  const base = getSupabaseStorageBase();
  if (!base) {
    return null;
  }

  // Bucket-relative paths: resize-suffix already encoded in path → use as-is.
  if (raw.startsWith('users/')) {
    return encodeURI(`${base}/${raw.replace(/^\/+/, '')}`);
  }

  // Legacy local-only paths from before the Supabase migration: not reachable from
  // an email client, so we deliberately do not synthesise a URL.
  if (raw.startsWith('/images/')) {
    return null;
  }

  if (!albumUserId) {
    return null;
  }

  const fileName = withEmailCoverVariant(raw).replace(/^\/+/, '');
  return encodeURI(`${base}/users/${albumUserId}/albums/${fileName}`);
}

export function resolveTrackSrcToSupabasePublicUrl(
  src: string | null | undefined,
  albumUserId?: string | null
): string | undefined {
  if (src == null || String(src).trim() === '') {
    return undefined;
  }

  const raw = String(src).trim();

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('blob:') ||
    raw.startsWith('data:')
  ) {
    return raw;
  }

  const base = getSupabaseStorageBase();
  if (!base) {
    return raw;
  }

  if (raw.startsWith('users/')) {
    const cleanPath = raw.replace(/^\/+/, '');
    return encodeURI(`${base}/${cleanPath}`);
  }

  if (raw.startsWith('/audio/') && albumUserId) {
    const relative = raw.slice('/audio/'.length).replace(/^\/+/, '');
    const cleanPath = `users/${albumUserId}/audio/${relative}`;
    return encodeURI(`${base}/${cleanPath}`);
  }

  // Относительный путь без ведущего слэша (как в старых данных): albumId/file.ext
  if (!raw.startsWith('/') && albumUserId && !raw.includes('://')) {
    const cleanPath = `users/${albumUserId}/audio/${raw.replace(/^\/+/, '')}`;
    return encodeURI(`${base}/${cleanPath}`);
  }

  return raw;
}
