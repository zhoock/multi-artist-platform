/**
 * PR-10.1 — Authorization for scheduled renewal invocations (C-2).
 * P0-1 — Fail-closed: next_run payload alone is never authentication.
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

/** True when body matches Netlify scheduled function payload ({ next_run: ISO-8601 }). Detection only — not authentication. */
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

/**
 * Netlify platform schedule signal. External HTTP clients cannot forge X-Nf-* headers in production
 * (Netlify strips them at the edge); only the internal Clockwork scheduler sets this value.
 */
export function isTrustedNetlifyPlatformSchedule(event: HandlerEvent): boolean {
  const nfEvent = readHeader(event, 'x-nf-event') ?? readHeader(event, 'x-netlify-event');
  return nfEvent?.toLowerCase() === 'schedule';
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

/**
 * Platform cron invocations carry no client secret. When SUBSCRIPTION_CRON_SECRET is configured
 * server-side and the request is a trusted Netlify schedule event, inject Bearer auth from env.
 */
function resolveSchedulerAuthEvent(event: HandlerEvent): HandlerEvent {
  if (hasValidCronSecret(event)) return event;
  if (!isTrustedNetlifyPlatformSchedule(event)) return event;

  const secret = process.env.SUBSCRIPTION_CRON_SECRET?.trim();
  if (!secret) return event;

  return {
    ...event,
    headers: {
      ...event.headers,
      authorization: `Bearer ${secret}`,
    },
  };
}

/** Fail closed unless valid SUBSCRIPTION_CRON_SECRET (header or platform schedule bootstrap). */
export function authorizeScheduledRenewalInvocation(event: HandlerEvent): boolean {
  return hasValidCronSecret(resolveSchedulerAuthEvent(event));
}
