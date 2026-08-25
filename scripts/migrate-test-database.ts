#!/usr/bin/env tsx
/**
 * Apply migrations to DATABASE_URL_TEST (never touches production DATABASE_URL from .env).
 *
 * Usage:
 *   DATABASE_URL_TEST=postgresql://localhost:5432/pr10_e2e npm run migrate:test
 */

import { spawnSync } from 'node:child_process';

const testUrl = process.env.DATABASE_URL_TEST?.trim();
if (!testUrl) {
  console.error('❌ DATABASE_URL_TEST is not set');
  console.error(
    '   Example: DATABASE_URL_TEST=postgresql://localhost:5432/pr10_e2e npm run migrate:test'
  );
  process.exit(1);
}

const devUrl = process.env.DATABASE_URL?.trim();
if (devUrl && devUrl === testUrl) {
  console.error('❌ DATABASE_URL_TEST must not equal DATABASE_URL');
  process.exit(1);
}

const result = spawnSync('npm', ['run', 'migrate'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
});

process.exit(result.status ?? 1);
