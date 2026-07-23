/**
 * dist/_redirects is for production deploy only (Netlify reads it before netlify.toml).
 * Netlify Dev must use netlify.toml redirects; a leftover dist/_redirects breaks /api/* locally.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const redirectsPath = resolve(__dirname, '../dist/_redirects');

if (existsSync(redirectsPath)) {
  unlinkSync(redirectsPath);
  console.log('Removed dist/_redirects for local dev (production-only file).');
}
