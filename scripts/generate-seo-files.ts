/**
 * Writes robots.txt using the deploy origin from env (no hardcoded domains).
 * sitemap.xml is generated dynamically by netlify/functions/sitemap.ts at request time.
 * Run before production webpack build — see package.json "build" script.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { generateRobotsTxt } from '../src/shared/lib/seo/generateSitemap';
import {
  normalizeOrigin,
  resolvePublicSiteOriginFromEnv,
} from '../src/shared/lib/publicSiteOrigin';

const root = resolve(__dirname, '..');
const origin = normalizeOrigin(resolvePublicSiteOriginFromEnv());

writeFileSync(resolve(root, 'robots.txt'), generateRobotsTxt(origin), 'utf8');

console.log(`✅ robots.txt generated for origin: ${origin}`);
console.log('ℹ️  sitemap.xml is served dynamically by /.netlify/functions/sitemap');
