#!/usr/bin/env tsx
/**
 * Audit `users.header_images` for non-canonical hero pointers.
 *
 * Expected stored form: `users/<uuid>/hero/<base>-1920.jpg` (or equivalent proxy URL).
 * Flags image-set(), AVIF, wrong suffixes, and non-hero paths.
 *
 * Usage:
 *   npx tsx scripts/audit-hero-header-images-canonical.ts
 *
 * Requires: DATABASE_URL
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { query, closePool } from '../netlify/functions/lib/db';

function loadEnvFile(relativePath: string) {
  const envPath = join(__dirname, '..', relativePath);
  if (!existsSync(envPath)) return;
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const CANONICAL_STORAGE_PATH = /^users\/[0-9a-f-]{36}\/hero\/[^/]+-1920\.jpe?g$/i;

type Row = {
  id: string;
  public_slug: string | null;
  header_images: unknown;
};

function auditEntry(raw: unknown, index: number): string | null {
  if (typeof raw !== 'string') {
    return `header_images[${index}]: not a string`;
  }
  const value = raw.trim();
  if (!value) {
    return `header_images[${index}]: blank`;
  }
  if (value.includes('image-set')) {
    return `header_images[${index}]: image-set() is deprecated`;
  }
  if (/\.avif/i.test(value)) {
    return `header_images[${index}]: references .avif`;
  }
  if (!value.includes('/hero/')) {
    return `header_images[${index}]: not a hero path`;
  }
  if (!CANONICAL_STORAGE_PATH.test(value)) {
    return `header_images[${index}]: expected users/<id>/hero/<base>-1920.jpg, got "${value}"`;
  }
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
  }

  const result = await query<Row>(
    `SELECT id, public_slug, header_images
     FROM users
     WHERE header_images IS NOT NULL
       AND header_images::text NOT IN ('null', '[]')`
  );

  let issueCount = 0;
  let profileCount = 0;

  for (const row of result.rows) {
    const images = Array.isArray(row.header_images)
      ? row.header_images
      : typeof row.header_images === 'string'
        ? (JSON.parse(row.header_images) as unknown[])
        : [];

    if (images.length === 0) continue;

    profileCount += 1;
    const issues: string[] = [];
    images.forEach((entry, index) => {
      const issue = auditEntry(entry, index);
      if (issue) issues.push(issue);
    });

    if (issues.length > 0) {
      issueCount += 1;
      console.log(`\n❌ user=${row.id} slug=${row.public_slug ?? '(none)'}`);
      for (const issue of issues) {
        console.log(`   ${issue}`);
      }
    }
  }

  const okCount = profileCount - issueCount;
  console.log('\n---');
  console.log(`Profiles with header_images: ${profileCount}`);
  console.log(`Canonical (no issues): ${okCount}`);
  console.log(`Need attention: ${issueCount}`);

  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
