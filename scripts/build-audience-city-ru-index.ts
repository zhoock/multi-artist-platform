/**
 * Builds ru city display index from GeoNames cities1000 (CC BY 4.0).
 * Run: npx tsx scripts/build-audience-city-ru-index.ts
 * Output: src/pages/UserDashboard/components/audience/geoAudienceCityRuIndex.json
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { audienceCityLookupKey } from '../src/shared/lib/i18n/audienceCityLookupKey';

const CITIES1000_URL = 'https://download.geonames.org/export/dump/cities1000.zip';
const OUT_PATH = resolve(
  process.cwd(),
  'src/pages/UserDashboard/components/audience/geoAudienceCityRuIndex.json'
);

/**
 * Manual RU labels applied after GeoNames extraction so bad or odd exonyms are not
 * reintroduced when re-running this script.
 */
const RU_CITY_DISPLAY_OVERRIDES: Record<string, string> = {
  [audienceCityLookupKey('VN', 'Ho Chi Minh City')]: 'Хошимин',
};

function isBasicCyrillic(value: string): boolean {
  return /^[\u0400-\u045F\s'-]+$/.test(value) && /[\u0400-\u045F]/.test(value);
}

function pickRussianExonym(asciiName: string, alternates: string): string | null {
  const asciiLen = asciiName.replace(/\s/g, '').length;
  const parts = alternates
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const cyrillic = parts.filter(isBasicCyrillic);
  const compact = cyrillic.filter((name) => !/\s/.test(name));
  const pool = compact.length > 0 ? compact : cyrillic;
  if (pool.length === 0) return null;

  return pool.sort((a, b) => {
    const diffA = Math.abs(a.replace(/\s/g, '').length - asciiLen);
    const diffB = Math.abs(b.replace(/\s/g, '').length - asciiLen);
    if (diffA !== diffB) return diffA - diffB;
    return b.length - a.length;
  })[0];
}

async function downloadCities1000Text(): Promise<string> {
  const response = await fetch(CITIES1000_URL);
  if (!response.ok) {
    throw new Error(`Failed to download cities1000.zip: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const tempDir = mkdtempSync(join(tmpdir(), 'geonames-cities1000-'));
  const zipPath = join(tempDir, 'cities1000.zip');
  writeFileSync(zipPath, buffer);
  execSync(`unzip -q -o "${zipPath}" -d "${tempDir}"`);
  const text = readFileSync(join(tempDir, 'cities1000.txt'), 'utf8');
  rmSync(tempDir, { recursive: true, force: true });
  return text;
}

async function main(): Promise<void> {
  const text = await downloadCities1000Text();
  const index: Record<string, string> = {};

  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('\t');
    if (columns.length < 9) continue;
    const asciiName = columns[2];
    const alternates = columns[3];
    const countryCode = columns[8];
    if (!asciiName || !countryCode) continue;

    const ruName = pickRussianExonym(asciiName, alternates);
    if (!ruName) continue;

    index[audienceCityLookupKey(countryCode, asciiName)] = ruName;
  }

  for (const [key, ruLabel] of Object.entries(RU_CITY_DISPLAY_OVERRIDES)) {
    index[key] = ruLabel;
  }

  writeFileSync(OUT_PATH, JSON.stringify(index));
  console.log(`Wrote ${Object.keys(index).length} entries to ${OUT_PATH}`);
  console.log('Sample VN|da nang ->', index[audienceCityLookupKey('VN', 'Da Nang')]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
