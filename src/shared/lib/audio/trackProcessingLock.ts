/**
 * Cross-instance mutex for one track's audio processing.
 *
 * Production connects through the Supabase transaction pooler (port 6543).
 * That mode does not keep a PostgreSQL session between statements, so
 * pg_try_advisory_lock is released as soon as the statement ends — before
 * ffmpeg runs. The claim below is one UPDATE. Under READ COMMITTED the second
 * updater waits on the row lock, then rechecks WHERE against the committed
 * token. The token stays in the row after the connection returns to the pool.
 */

export const TRACK_PROCESSING_LOCK_LEASE_MS = 15 * 60 * 1000;

/** Matches Netlify's background function limit. A live invocation cannot be stolen. */
export const TRACK_PROCESSING_LOCK_LEASE_INTERVAL = '15 minutes';

export type TrackProcessingLockRow = {
  token: string | null;
  lockedAtMs: number | null;
};

export function claimTrackProcessingLockSql(): string {
  return `UPDATE tracks
     SET processing_lock_token = $2,
         processing_locked_at = NOW()
     WHERE id = $1
       AND (
         processing_lock_token IS NULL
         OR processing_locked_at IS NULL
         OR processing_locked_at < NOW() - INTERVAL '${TRACK_PROCESSING_LOCK_LEASE_INTERVAL}'
       )
     RETURNING id`;
}

export function releaseTrackProcessingLockSql(): string {
  return `UPDATE tracks
     SET processing_lock_token = NULL,
         processing_locked_at = NULL
     WHERE id = $1
       AND processing_lock_token = $2`;
}

/** Same predicate as claimTrackProcessingLockSql. Null means nobody holds the claim. */
export function canClaimTrackProcessingLock(row: TrackProcessingLockRow, nowMs: number): boolean {
  if (row.token == null || row.lockedAtMs == null) return true;
  return row.lockedAtMs < nowMs - TRACK_PROCESSING_LOCK_LEASE_MS;
}

/**
 * A regenerate call must not start another job while this track is still
 * pending or processing, unless the previous claim is older than the
 * background-function limit (the holder is already dead).
 */
export function shouldRefuseInFlightTrackReprocess(input: {
  processingStatus: string | null | undefined;
  lockStale: boolean;
}): boolean {
  if (input.processingStatus !== 'pending' && input.processingStatus !== 'processing') {
    return false;
  }
  return !input.lockStale;
}
