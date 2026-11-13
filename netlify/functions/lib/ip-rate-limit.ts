/**
 * Lightweight IP rate limiting for auth verification endpoints.
 * Uses PostgreSQL hourly buckets — no Redis required.
 */

import type { HandlerEvent } from '@netlify/functions';
import { CORS_HEADERS } from './api-helpers';
import { query } from './db';
import { getClientIpFromEvent } from './yookassa-webhook-verify';

export const AUTH_VERIFICATION_IP_LIMIT = 10;
export const AUTH_VERIFICATION_IP_WINDOW_SECONDS = 3600;

const AUTH_VERIFICATION_BUCKET = 'auth_verification';

/** Public copyright claim submissions per IP per hour. */
export const COPYRIGHT_CLAIM_SUBMIT_IP_LIMIT = 10;

/** Password-reset request endpoint: small limit to thwart enumeration / spam. */
export const PASSWORD_RESET_REQUEST_IP_LIMIT = 5;
/** Password-reset consume endpoint: higher because legitimate users may retype mistypes. */
export const PASSWORD_RESET_CONSUME_IP_LIMIT = 20;

type IpRateLimitCheckResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

interface IpRateLimitOptions {
  bucketKey: string;
  limit: number;
  /** Defaults to AUTH_VERIFICATION_IP_WINDOW_SECONDS (1 hour). */
  windowSeconds?: number;
}

function retryAfterFromWindowHour(windowHour: Date, windowSeconds: number): number {
  const windowEnd = new Date(windowHour.getTime() + windowSeconds * 1000);
  return Math.max(1, Math.ceil((windowEnd.getTime() - Date.now()) / 1000));
}

/**
 * Generic per-IP / per-hour limiter backed by `auth_ip_rate_limits`. Different
 * endpoints pass different `bucketKey` values so their counters don't bleed
 * into each other (e.g. forgot-password vs. resend-verification).
 */
export async function checkIpRateLimit(
  event: HandlerEvent,
  options: IpRateLimitOptions
): Promise<IpRateLimitCheckResult> {
  const ip = getClientIpFromEvent(event) ?? 'unknown';
  const windowSeconds = options.windowSeconds ?? AUTH_VERIFICATION_IP_WINDOW_SECONDS;

  const upsert = await query<{ request_count: number; window_hour: Date }>(
    `INSERT INTO auth_ip_rate_limits (ip_address, bucket_key, window_hour, request_count)
     VALUES ($1, $2, date_trunc('hour', NOW()), 1)
     ON CONFLICT (ip_address, bucket_key, window_hour)
     DO UPDATE SET request_count = auth_ip_rate_limits.request_count + 1
     WHERE auth_ip_rate_limits.request_count < $3
     RETURNING request_count, window_hour`,
    [ip, options.bucketKey, options.limit],
    0
  );

  if (upsert.rows.length > 0) {
    return { allowed: true };
  }

  const current = await query<{ window_hour: Date }>(
    `SELECT window_hour
     FROM auth_ip_rate_limits
     WHERE ip_address = $1
       AND bucket_key = $2
       AND window_hour = date_trunc('hour', NOW())`,
    [ip, options.bucketKey],
    0
  );

  const windowHour = current.rows[0]?.window_hour;
  return {
    allowed: false,
    retryAfterSeconds: windowHour
      ? retryAfterFromWindowHour(windowHour, windowSeconds)
      : windowSeconds,
  };
}

export function ipRateLimitResponse(retryAfterSeconds: number): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  return {
    statusCode: 429,
    headers: {
      ...CORS_HEADERS,
      'Retry-After': String(retryAfterSeconds),
    },
    body: JSON.stringify({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too many requests. Please try again later.',
      retryAfterSeconds,
    }),
  };
}

export async function enforceIpRateLimit(
  event: HandlerEvent,
  options: IpRateLimitOptions
): Promise<{ statusCode: number; headers: Record<string, string>; body: string } | null> {
  const result = await checkIpRateLimit(event, options);
  if (result.allowed) {
    return null;
  }
  return ipRateLimitResponse(result.retryAfterSeconds);
}

export async function checkAuthVerificationIpRateLimit(
  event: HandlerEvent
): Promise<IpRateLimitCheckResult> {
  return checkIpRateLimit(event, {
    bucketKey: AUTH_VERIFICATION_BUCKET,
    limit: AUTH_VERIFICATION_IP_LIMIT,
  });
}

export function authVerificationIpRateLimitResponse(retryAfterSeconds: number): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  return ipRateLimitResponse(retryAfterSeconds);
}

export async function enforceAuthVerificationIpRateLimit(
  event: HandlerEvent
): Promise<{ statusCode: number; headers: Record<string, string>; body: string } | null> {
  return enforceIpRateLimit(event, {
    bucketKey: AUTH_VERIFICATION_BUCKET,
    limit: AUTH_VERIFICATION_IP_LIMIT,
  });
}
