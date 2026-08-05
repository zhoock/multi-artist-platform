/**
 * PR-10.1 — Authorization for scheduled renewal invocations (C-2).
 */

import { timingSafeEqual } from 'crypto';

import type { HandlerEvent } from '@netlify/functions';

const MAX_NEXT_RUN_SKEW_MS = 24 * 60 * 60 * 1000;

function readHeader(event: HandlerEvent, name: string): string | undefined {
  const headers = event.headers ?? {};
  const direct = headers[name];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const lower = headers[name.toLowerCase()];
  if (typeof lower === 'string' && lower.trim()) return lower.trim();
  return undefined;
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True when body matches Netlify scheduled function payload ({ next_run: ISO-8601 }). */
export function isNetlifyScheduledInvocation(body: string | null | undefined): boolean {
  if (!body?.trim()) return false;

  try {
    const parsed = JSON.parse(body) as { next_run?: unknown };
    if (typeof parsed.next_run !== 'string' || !parsed.next_run.trim()) return false;

    const timestamp = Date.parse(parsed.next_run);
    if (Number.isNaN(timestamp)) return false;

    return Math.abs(timestamp - Date.now()) <= MAX_NEXT_RUN_SKEW_MS;
  } catch {
    return false;
  }
}

function hasValidCronSecret(event: HandlerEvent): boolean {
  const expected = process.env.SUBSCRIPTION_CRON_SECRET?.trim();
  if (!expected) return false;

  const authorization = readHeader(event, 'authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token && secretsEqual(token, expected)) return true;
  }

  const headerSecret = readHeader(event, 'x-subscription-cron-secret');
  if (headerSecret && secretsEqual(headerSecret, expected)) return true;

  return false;
}

/** Fail closed unless Netlify scheduled payload or valid SUBSCRIPTION_CRON_SECRET. */
export function authorizeScheduledRenewalInvocation(event: HandlerEvent): boolean {
  if (isNetlifyScheduledInvocation(event.body)) return true;
  return hasValidCronSecret(event);
}
