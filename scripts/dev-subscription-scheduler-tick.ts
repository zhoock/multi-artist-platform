/**
 * PR-10.4 — Dev sidecar: periodically runs runRenewalCycle() in-process.
 * Netlify Dev blocks HTTP POST to scheduled functions; direct invocation uses the same engine.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

import {
  bootstrapLocalRenewalSchedulerEnv,
  getLocalRenewalSchedulerIntervalMs,
  isLocalRenewalSchedulerEnabled,
  runLocalRenewalCycleTick,
} from '../netlify/functions/lib/local-renewal-scheduler';

config({ path: resolve(process.cwd(), '.env') });
bootstrapLocalRenewalSchedulerEnv();

const BANNER = '🔄 LOCAL RENEWAL SCHEDULER';

const DB_WAIT_MS = 2_000;
const DB_MAX_ATTEMPTS = 45;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function waitForDatabase(): Promise<boolean> {
  const { query } = await import('../netlify/functions/lib/db');

  for (let attempt = 1; attempt <= DB_MAX_ATTEMPTS; attempt += 1) {
    try {
      await query('SELECT 1');
      return true;
    } catch {
      if (attempt < DB_MAX_ATTEMPTS) {
        await sleep(DB_WAIT_MS);
      }
    }
  }

  return false;
}

async function invokeRenewalCycle(): Promise<void> {
  try {
    const result = await runLocalRenewalCycleTick();

    const summary = {
      chargesAttempted: result.chargesAttempted,
      chargesSkipped: result.chargesSkipped,
      periodsEnded: result.periodsEnded,
      errors: result.errors,
    };

    const hasActivity = Object.values(summary).some(
      (value) => typeof value === 'number' && value > 0
    );
    if (hasActivity) {
      console.log(`${BANNER} tick:`, summary);
    }
  } catch (error) {
    console.warn(`${BANNER} tick failed:`, error);
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

  const intervalMs = getLocalRenewalSchedulerIntervalMs();

  console.log(`${BANNER} enabled — runRenewalCycle() every ${intervalMs / 1000}s (in-process)`);
  console.log(
    `${BANNER} production uses Netlify Scheduled Functions (*/15); this sidecar is dev-only.\n`
  );

  const ready = await waitForDatabase();
  if (!ready) {
    console.error(`${BANNER} database did not become ready (check DATABASE_URL in .env)`);
    process.exit(1);
  }

  console.log(`${BANNER} database ready — ticking.\n`);

  let running = true;
  const shutdown = (): void => {
    running = false;
    console.log(`\n${BANNER} stopped.`);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await invokeRenewalCycle();

  while (running) {
    await sleep(intervalMs);
    if (!running) break;
    await invokeRenewalCycle();
  }
}

main().catch((error) => {
  console.error(`${BANNER} fatal:`, error);
  process.exit(1);
});
