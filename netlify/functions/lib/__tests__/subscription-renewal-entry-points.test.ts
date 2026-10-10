/**
 * Registry of every non-test code path that can start a real renewal charge.
 * Adding a new caller fails this test until it is reviewed and listed with its guards.
 * The fail-closed SUBSCRIPTION_SCHEDULER_LIVE gate applies only to the Netlify handler.
 */

import { describe, expect, test } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../../../..');
const SCAN_DIRS = ['netlify/functions', 'scripts', 'src'];
const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'dist', '.netlify']);

const ENTRY_POINTS: Record<string, { calls: string[]; guards: string }> = {
  'netlify/functions/scheduled-subscription-renewals.ts': {
    calls: ['runRenewalCycle'],
    guards:
      'SUBSCRIPTION_CRON_SECRET auth + fail-closed SUBSCRIPTION_SCHEDULER_LIVE/DRY_RUN mode (production path)',
  },
  'netlify/functions/lib/local-renewal-scheduler.ts': {
    calls: ['runRenewalCycle'],
    guards:
      'dev sidecar only: refuses any non-local DATABASE_URL (no override), CONTEXT!=production, NETLIFY_DEV/LOCAL_RENEWAL_SCHEDULER marker; not gated by SCHEDULER_LIVE',
  },
  'scripts/dev-subscription-scheduler-tick.ts': {
    calls: ['runLocalRenewalCycleTick'],
    guards:
      'npm run dev:scheduler: exits on remote DATABASE_URL (getLocalSchedulerDatabaseBlockReason) and isLocalRenewalSchedulerEnabled(); bootstraps DEV_PAYMENT_MODE=true only if unset',
  },
  'netlify/functions/lib/subscription-renewal-engine.ts': {
    calls: ['attemptRenewalChargeForSubscription'],
    guards: 'internal: called from runRenewalCycle',
  },
  'scripts/seed-autorenew-ui-proof.ts': {
    calls: ['attemptRenewalChargeForSubscription'],
    guards:
      'assertLocalDatabaseForScript() first in main() — no override flag; forces DEV_PAYMENT_MODE=true (synthetic, no YooKassa)',
  },
  'scripts/verify-autorenew-cycle.ts': {
    calls: ['attemptRenewalChargeForSubscription'],
    guards:
      'assertLocalDatabaseForScript() first in main() — no override flag; forces DEV_PAYMENT_MODE=true (synthetic, no YooKassa)',
  },
};

/** Matched against code with comments and string literals removed. */
const CALL_PATTERNS: Record<string, RegExp> = {
  runRenewalCycle: /\brunRenewalCycle\s*\(/,
  attemptRenewalChargeForSubscription: /\battemptRenewalChargeForSubscription\s*\(/,
  runLocalRenewalCycleTick: /\brunLocalRenewalCycleTick\s*\(/,
};

/** Matched against raw source (URLs live inside string literals). */
const URL_PATTERNS: Record<string, RegExp> = {
  'scheduled-subscription-renewals URL': /\/\.netlify\/functions\/scheduled-subscription-renewals/,
};

const DEFINITIONS = [
  /export async function runRenewalCycle\s*\(/,
  /export async function attemptRenewalChargeForSubscription\s*\(/,
  /export async function runLocalRenewalCycleTick\s*\(/,
];

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function discoverEntryPoints(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const scanDir of SCAN_DIRS) {
    for (const file of listSourceFiles(join(ROOT, scanDir))) {
      const rel = relative(ROOT, file);
      const raw = readFileSync(file, 'utf8');
      const code = DEFINITIONS.reduce(
        (acc, def) => acc.replace(def, ''),
        stripCommentsAndStrings(raw)
      );
      const calls = [
        ...Object.entries(CALL_PATTERNS)
          .filter(([, pattern]) => pattern.test(code))
          .map(([name]) => name),
        ...Object.entries(URL_PATTERNS)
          .filter(([, pattern]) => pattern.test(raw))
          .map(([name]) => name),
      ];
      // The local scheduler only builds the URL for diagnostics; its real path is in-process.
      const filtered =
        rel === 'netlify/functions/lib/local-renewal-scheduler.ts'
          ? calls.filter((name) => name !== 'scheduled-subscription-renewals URL')
          : calls;
      if (filtered.length > 0) found[rel] = filtered.sort();
    }
  }
  return found;
}

describe('renewal entry points', () => {
  test('every caller of the real renewal cycle is registered with its guards', () => {
    const expected = Object.fromEntries(
      Object.entries(ENTRY_POINTS).map(([file, { calls }]) => [file, [...calls].sort()])
    );
    expect(discoverEntryPoints()).toEqual(expected);
  });

  test('handler resolves the fail-closed run mode before calling runRenewalCycle', () => {
    const source = readFileSync(
      join(ROOT, 'netlify/functions/scheduled-subscription-renewals.ts'),
      'utf8'
    );
    const authAt = source.indexOf('authorizeScheduledRenewalInvocation(event)');
    const modeAt = source.indexOf('resolveSchedulerRunMode()');
    const cycleAt = source.indexOf('runRenewalCycle(new Date())');

    expect(authAt).toBeGreaterThan(-1);
    expect(modeAt).toBeGreaterThan(authAt);
    expect(cycleAt).toBeGreaterThan(modeAt);
  });
});
