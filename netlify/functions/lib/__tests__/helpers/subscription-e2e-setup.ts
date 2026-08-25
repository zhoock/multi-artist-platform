/**
 * PR-10 tier1/tier3 common setup & teardown.
 */

import { afterEach, beforeEach } from '@jest/globals';

import { closePool } from '../../db';
import { dumpActiveContextOnFailure, setActiveE2eContext } from './subscription-e2e-diagnostics';
import { truncateSubscriptionE2eTables, seedDefaultE2eUsers } from './subscription-e2e-seed';

let e2eDbAvailable = false;

export function isE2eDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL_TEST?.trim());
}

async function bindIntegrationDatabaseUrl(): Promise<void> {
  const testUrl = process.env.DATABASE_URL_TEST?.trim();
  if (!testUrl) return;

  if (process.env.DATABASE_URL !== testUrl) {
    await closePool();
    process.env.DATABASE_URL = testUrl;
  }
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
    await bindIntegrationDatabaseUrl();
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
      'PR-10 integration tests require DATABASE_URL_TEST (dedicated Postgres). See .env.example.'
    );
  }
}
