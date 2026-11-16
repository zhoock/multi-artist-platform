const TELEGRAM_USERNAME_PATTERN = /^[a-zA-Z0-9_]{5,32}$/;

function tryParseHttpUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isTelegramPersonalDomainHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower.endsWith('.t.me') && lower !== 't.me';
}

function normalizeHttpsTelegramUrl(trimmed: string): string | null {
  const parsed = tryParseHttpUrl(trimmed);
  if (!parsed || !/^https?:$/i.test(parsed.protocol)) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  if (host === 't.me') {
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `https://t.me${path === '/' ? '' : path}${parsed.search}${parsed.hash}`;
  }

  if (isTelegramPersonalDomainHost(host)) {
    const path = parsed.pathname.replace(/\/+$/, '');
    return `https://${host}${path}${parsed.search}${parsed.hash}`;
  }

  return null;
}

/**
 * Canonical `social_links.telegram` value for storage and public API (always an https URL when valid).
 */
export function normalizeManagerTelegramForStorage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeHttpsTelegramUrl(trimmed);
  }

  if (/^t\.me\//i.test(trimmed)) {
    return normalizeHttpsTelegramUrl(`https://${trimmed}`);
  }

  const handle = trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed;
  if (TELEGRAM_USERNAME_PATTERN.test(handle)) {
    return `https://t.me/${handle}`;
  }

  return null;
}

/**
 * Settings UI: show @username for plain t.me profile links; keep invite / personal-domain URLs intact.
 */
export function formatManagerTelegramForSettingsDisplay(stored: string): string {
  const trimmed = stored.trim();
  if (!trimmed) return '';

  const canonical = normalizeManagerTelegramForStorage(trimmed) ?? trimmed;
  const parsed = tryParseHttpUrl(canonical);
  if (!parsed || parsed.hostname.toLowerCase() !== 't.me') {
    return trimmed;
  }

  const segment = parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  if (!segment || segment.startsWith('+') || !TELEGRAM_USERNAME_PATTERN.test(segment)) {
    return trimmed;
  }

  return `@${segment}`;
}

/**
 * Reads an optional `telegram` URL from artist `social_links` JSONB without treating it as a footer social icon.
 */
export function parseTelegramFromSocialLinks(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>).telegram;
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  return normalizeManagerTelegramForStorage(trimmed);
}

/** Resolves a stored or legacy value to an https href for opening Telegram. */
export function normalizeTelegramContactHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  return normalizeManagerTelegramForStorage(trimmed);
}
