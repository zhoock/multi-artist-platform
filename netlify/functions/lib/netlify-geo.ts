/**
 * Parse Netlify x-nf-geo for qualified listen geography (city + country code only).
 */

import type { HandlerEvent } from '@netlify/functions';

export const LISTEN_CITY_MAX_LENGTH = 128;

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

export type ParsedListenGeo = {
  listenCity: string | null;
  listenCountryCode: string | null;
};

export function readNetlifyGeoHeader(event: HandlerEvent): string | null {
  const headers = event.headers ?? {};
  const raw =
    headers['x-nf-geo'] ??
    headers['X-Nf-Geo'] ??
    headers['X-NF-Geo'] ??
    headers['x-NF-geo'] ??
    null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizeCity(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > LISTEN_CITY_MAX_LENGTH
    ? trimmed.slice(0, LISTEN_CITY_MAX_LENGTH)
    : trimmed;
}

function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if (!upper || !COUNTRY_CODE_RE.test(upper)) return null;
  return upper;
}

/**
 * Parses x-nf-geo JSON. Invalid or missing values become null; never throws.
 */
export function parseListenGeoFromHeader(rawHeader: string | null | undefined): ParsedListenGeo {
  if (!rawHeader?.trim()) {
    return { listenCity: null, listenCountryCode: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawHeader);
  } catch {
    return { listenCity: null, listenCountryCode: null };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { listenCity: null, listenCountryCode: null };
  }

  const record = parsed as Record<string, unknown>;
  const country =
    record.country && typeof record.country === 'object'
      ? (record.country as Record<string, unknown>)
      : null;

  return {
    listenCity: normalizeCity(record.city),
    listenCountryCode: normalizeCountryCode(country?.code),
  };
}

export function parseListenGeoFromEvent(event: HandlerEvent): ParsedListenGeo {
  return parseListenGeoFromHeader(readNetlifyGeoHeader(event));
}
