/**
 * PR-10 tier1/tier3 common setup & teardown.
 */

import { afterEach, beforeEach } from '@jest/globals';

import { dumpActiveContextOnFailure, setActiveE2eContext } from './subscription-e2e-diagnostics';
import { truncateSubscriptionE2eTables, seedDefaultE2eUsers } from './subscription-e2e-seed';

let e2eDbAvailable = false;

export function isE2eDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL_TEST?.trim() || process.env.DATABASE_URL?.trim());
}

/** Call once at top of tier1/tier3 describe root. */
export function registerTier1BackendHooks(): void {
  beforeEach(async () => {
    setActiveE2eContext(null);
    if (!isE2eDatabaseConfigured()) {
      e2eDbAvailable = false;
      return;
    }
    e2eDbAvailable = true;
    if (process.env.DATABASE_URL_TEST?.trim()) {
      process.env.DATABASE_URL = process.env.DATABASE_URL_TEST.trim();
    }
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NODE_ENV = 'test';
    process.env.YOOKASSA_TEST_MODE = 'true';
    await truncateSubscriptionE2eTables();
    await seedDefaultE2eUsers();
  });

  afterEach(async () => {
    if (e2eDbAvailable) {
      await dumpActiveContextOnFailure();
    }
    setActiveE2eContext(null);
  });
}

export function registerTier3SmokeHooks(): void {
  registerTier1BackendHooks();
}

export function requireE2eDatabase(): void {
  if (!isE2eDatabaseConfigured()) {
    throw new Error(
      'Skipping DB integration: set DATABASE_URL_TEST. Scaffold runs without DB until scenarios are implemented.'
    );
  }
}
