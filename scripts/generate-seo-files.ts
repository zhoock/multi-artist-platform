/**
 * Writes sitemap.xml and robots.txt using the deploy origin from env (no hardcoded domains).
 * Run before production webpack build — see package.json "build" script.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { generateRobotsTxt, generateSitemapXml } from '../src/shared/lib/seo/generateSitemap';
import {
  normalizeOrigin,
  resolvePublicSiteOriginFromEnv,
} from '../src/shared/lib/publicSiteOrigin';

const root = resolve(__dirname, '..');
const origin = normalizeOrigin(resolvePublicSiteOriginFromEnv());

writeFileSync(resolve(root, 'sitemap.xml'), generateSitemapXml(origin), 'utf8');
writeFileSync(resolve(root, 'robots.txt'), generateRobotsTxt(origin), 'utf8');

console.log(`✅ SEO files generated for origin: ${origin}`);
