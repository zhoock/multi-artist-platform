/**
 * PR-10.4 — Dev sidecar: periodically POSTs to scheduled-subscription-renewals
 * with the Netlify Scheduled Functions payload. No renewal business logic here.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

import {
  buildNetlifyScheduledInvocationBody,
  buildScheduledSubscriptionRenewalsUrl,
  getLocalRenewalSchedulerIntervalMs,
  isLocalRenewalSchedulerEnabled,
} from '../netlify/functions/lib/local-renewal-scheduler';

config({ path: resolve(process.cwd(), '.env') });

/** npm run dev — always on; wins over .env.example default false */
process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';

const BANNER = '🔄 LOCAL RENEWAL SCHEDULER';

const NETLIFY_DEV_WAIT_MS = 2_000;
const NETLIFY_DEV_MAX_ATTEMPTS = 90;
const TICK_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function isTransientFetchFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; code?: string; cause?: { code?: string } };
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  const code = err.code ?? err.cause?.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    code === 'EAI_AGAIN'
  );
}

async function postScheduledRenewals(url: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildNetlifyScheduledInvocationBody(),
      signal: AbortSignal.timeout(TICK_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTransientFetchFailure(error)) {
      return null;
    }
    throw error;
  }
}

async function waitForNetlifyDev(url: string): Promise<boolean> {
  for (let attempt = 1; attempt <= NETLIFY_DEV_MAX_ATTEMPTS; attempt += 1) {
    const response = await postScheduledRenewals(url);
    if (response) {
      return true;
    }
    if (attempt < NETLIFY_DEV_MAX_ATTEMPTS) {
      await sleep(NETLIFY_DEV_WAIT_MS);
    }
  }
  return false;
}

async function invokeScheduledRenewals(url: string): Promise<void> {
  try {
    const response = await postScheduledRenewals(url);
    if (!response) {
      console.warn(`${BANNER} tick skipped — Netlify Dev unreachable at ${url}`);
      return;
    }

    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text.slice(0, 200) };
    }

    if (!response.ok) {
      console.warn(`${BANNER} tick failed HTTP ${response.status}:`, body);
      return;
    }

    const summary = {
      chargesAttempted: body.chargesAttempted,
      chargesSkipped: body.chargesSkipped,
      periodsEnded: body.periodsEnded,
      errors: body.errors,
    };

    const hasActivity = Object.values(summary).some(
      (value) => typeof value === 'number' && value > 0
    );
    if (hasActivity) {
      console.log(`${BANNER} tick:`, summary);
    }
  } catch (error) {
    console.warn(`${BANNER} tick skipped — request failed:`, error);
  }
}

async function main(): Promise<void> {
  if (!isLocalRenewalSchedulerEnabled()) {
    const reasons: string[] = [];
    if (process.env.LOCAL_RENEWAL_SCHEDULER?.trim().toLowerCase() === 'false') {
      reasons.push('LOCAL_RENEWAL_SCHEDULER=false');
    }
    if (process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED?.trim().toLowerCase() !== 'true') {
      reasons.push('SUBSCRIPTION_AUTO_RENEW_ENABLED is not true');
    }
    if (process.env.NETLIFY_DEV !== 'true') {
      reasons.push('NETLIFY_DEV is not true (sidecar must run via npm run dev:scheduler)');
    }

    console.log(
      `${BANNER} disabled${reasons.length ? ` (${reasons.join('; ')})` : ''}.`,
      'Production renewal uses Netlify Scheduled Functions only.'
    );
    return;
  }

  const url = buildScheduledSubscriptionRenewalsUrl();
  const intervalMs = getLocalRenewalSchedulerIntervalMs();

  console.log(`${BANNER} enabled — POST ${url} every ${intervalMs / 1000}s`);
  console.log(
    `${BANNER} production uses Netlify Scheduled Functions (*/15); this sidecar is dev-only.\n`
  );

  const ready = await waitForNetlifyDev(url);
  if (!ready) {
    console.error(`${BANNER} Netlify Dev did not become ready at ${url}`);
    process.exit(1);
  }

  console.log(`${BANNER} Netlify Dev ready — ticking.\n`);

  let running = true;
  const shutdown = (): void => {
    running = false;
    console.log(`\n${BANNER} stopped.`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await invokeScheduledRenewals(url);

  while (running) {
    await sleep(intervalMs);
    if (!running) break;
    await invokeScheduledRenewals(url);
  }
}

main().catch((error) => {
  console.error(`${BANNER} fatal:`, error);
  process.exit(1);
});
