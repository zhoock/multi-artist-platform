/**
 * PR-10 tier1/tier3 — bind Jest to DATABASE_URL_TEST only.
 * Never allow integration tests to fall back to shared Supabase DATABASE_URL from .env.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
loadEnv({ path: envPath });

const testUrl = process.env.DATABASE_URL_TEST?.trim();
const devDatabaseUrl = process.env.DATABASE_URL?.trim();

if (testUrl) {
  if (devDatabaseUrl && testUrl === devDatabaseUrl) {
    throw new Error(
      'DATABASE_URL_TEST must not equal DATABASE_URL. Integration tests require a dedicated Postgres database.'
    );
  }
  process.env.DATABASE_URL = testUrl;
} else {
  delete process.env.DATABASE_URL;
}
