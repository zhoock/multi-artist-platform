/**
 * PR-10.4 — Local development sidecar gating for scheduled-subscription-renewals.
 * Dev tooling only; production uses Netlify Scheduled Functions (netlify.toml).
 */

import crypto from 'node:crypto';

import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';
import type { RenewalCycleResult } from './subscription-renewal-engine';

export const DEFAULT_LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS = 60_000;

const SCHEDULED_RENEWALS_PATH = '/.netlify/functions/scheduled-subscription-renewals';

function isExplicitOptOut(): boolean {
  const raw = process.env.LOCAL_RENEWAL_SCHEDULER?.trim().toLowerCase();
  return raw === 'false' || raw === '0' || raw === 'no';
}

function isLocalDevMarkerSet(): boolean {
  return (
    process.env.NETLIFY_DEV === 'true' || process.env.LOCAL_RENEWAL_SCHEDULER?.trim() === 'true'
  );
}

/**
 * True when the dev sidecar may tick scheduled-subscription-renewals locally.
 * Never true on production deploys or production Node without Netlify Dev.
 */
export function isLocalRenewalSchedulerEnabled(): boolean {
  if (isExplicitOptOut()) {
    return false;
  }

  if (!isSubscriptionAutoRenewEnabled()) {
    return false;
  }

  if (process.env.CONTEXT === 'production') {
    return false;
  }

  if (process.env.NODE_ENV === 'production' && process.env.NETLIFY_DEV !== 'true') {
    return false;
  }

  return isLocalDevMarkerSet();
}

export function getLocalRenewalSchedulerIntervalMs(): number {
  const raw = process.env.LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS?.trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1_000) {
      return parsed;
    }
  }

  // 5-minute dev support periods need faster ticks than production */15 cron.
  if (process.env.DEV_PAYMENT_MODE === 'true') {
    return 15_000;
  }

  return DEFAULT_LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS;
}

export function getLocalNetlifyDevPort(): number {
  const raw = process.env.LOCAL_NETLIFY_PORT?.trim() || '8888';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65_535) {
    return 8888;
  }
  return parsed;
}

/** Local Netlify Dev URL for the production scheduled renewal handler. */
export function buildScheduledSubscriptionRenewalsUrl(port?: number): string {
  const resolvedPort = port ?? getLocalNetlifyDevPort();
  return `http://127.0.0.1:${resolvedPort}${SCHEDULED_RENEWALS_PATH}`;
}

/** Netlify Scheduled Functions invoke payload (PR-10.1 auth). */
export function buildNetlifyScheduledInvocationBody(at: Date = new Date()): string {
  return JSON.stringify({ next_run: at.toISOString() });
}

/**
 * Ensures dev sidecar process env matches Netlify Functions `[context.dev]` defaults.
 * Sidecar runs outside Netlify Dev, so netlify.toml env is not applied automatically.
 */
export function bootstrapLocalRenewalSchedulerEnv(): void {
  process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
  if (!process.env.DEV_PAYMENT_MODE?.trim()) {
    process.env.DEV_PAYMENT_MODE = 'true';
  }
  if (!process.env.CONTEXT?.trim()) {
    process.env.CONTEXT = 'dev';
  }
  if (!process.env.NODE_ENV?.trim()) {
    process.env.NODE_ENV = 'development';
  }
}

/**
 * Runs one renewal cycle in-process (same engine as scheduled-subscription-renewals).
 * Netlify Dev rejects HTTP POST to scheduled functions — dev sidecar must call this directly.
 */
export async function runLocalRenewalCycleTick(
  now: Date = new Date()
): Promise<RenewalCycleResult> {
  const { runRenewalCycle } = await import('./subscription-renewal-engine');
  const { logSubscriptionEvent, runWithSubscriptionObservability, SUBSCRIPTION_LOG_EVENTS } =
    await import('./subscription-observability');

  const correlationId = crypto.randomUUID();

  const result = await runWithSubscriptionObservability(
    { source: 'scheduler', kind: 'renewal', correlationId },
    () => runRenewalCycle(now)
  );

  logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CYCLE, {
    chargesAttempted: result.chargesAttempted,
    chargesSkipped: result.chargesSkipped,
    periodsEnded: result.periodsEnded,
    errors: result.errors,
  });

  return result;
}
