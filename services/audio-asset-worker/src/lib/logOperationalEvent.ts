/**
 * Always-on structured operational logs for the audio-asset-worker.
 * Not gated by AUDIO_PIPELINE_TRACE — use for production alerts.
 */

export type OperationalLogLevel = 'warn' | 'error';

export type OperationalEventPayload = {
  /** Stable event name for log queries and alerts (snake_case). */
  event: string;
  level?: OperationalLogLevel;
  timestamp?: string;
  [key: string]: unknown;
};

export function logOperationalEvent(payload: OperationalEventPayload): void {
  const { level = 'error', event, timestamp, ...fields } = payload;
  const line = JSON.stringify({
    event,
    timestamp: timestamp ?? new Date().toISOString(),
    ...fields,
  });

  if (level === 'warn') {
    console.warn(line);
  } else {
    console.error(line);
  }
}

/** Event name when advisory-lock retries are exhausted without running the job. */
export const OPERATIONAL_EVENT_LOCK_RETRIES_EXHAUSTED = 'audio_asset_job_lock_retries_exhausted';
