/**
 * PR-10.4 — Local development sidecar gating for scheduled-subscription-renewals.
 * Dev tooling only; production uses Netlify Scheduled Functions (netlify.toml).
 */

import { isSubscriptionAutoRenewEnabled } from './subscription-feature-flag';

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
  if (!raw) {
    return DEFAULT_LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1_000) {
    return DEFAULT_LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS;
  }

  return parsed;
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
