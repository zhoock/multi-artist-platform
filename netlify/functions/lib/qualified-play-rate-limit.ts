/**
 * Per-user rate limit for qualified play registration (auth listeners).
 * Reuses auth_ip_rate_limits with user id as bucket identity.
 */

import { query } from './db';

const USER_BUCKET = 'qualified_play_record_user';
const USER_HOURLY_LIMIT = 60;
const WINDOW_SECONDS = 3600;

export type UserRateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function retryAfterFromWindowHour(windowHour: Date): number {
  const windowEnd = new Date(windowHour.getTime() + WINDOW_SECONDS * 1000);
  return Math.max(1, Math.ceil((windowEnd.getTime() - Date.now()) / 1000));
}

export async function checkQualifiedPlayUserRateLimit(
  userId: string
): Promise<UserRateLimitResult> {
  const id = userId.trim();
  if (!id) {
    return { allowed: false, retryAfterSeconds: WINDOW_SECONDS };
  }

  const upsert = await query<{ request_count: number; window_hour: Date }>(
    `INSERT INTO auth_ip_rate_limits (ip_address, bucket_key, window_hour, request_count)
     VALUES ($1, $2, date_trunc('hour', NOW()), 1)
     ON CONFLICT (ip_address, bucket_key, window_hour)
     DO UPDATE SET request_count = auth_ip_rate_limits.request_count + 1
     WHERE auth_ip_rate_limits.request_count < $3
     RETURNING request_count, window_hour`,
    [id, USER_BUCKET, USER_HOURLY_LIMIT],
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
    [id, USER_BUCKET],
    0
  );

  const windowHour = current.rows[0]?.window_hour;
  return {
    allowed: false,
    retryAfterSeconds: windowHour ? retryAfterFromWindowHour(windowHour) : WINDOW_SECONDS,
  };
}
