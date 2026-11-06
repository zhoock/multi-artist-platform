/**
 * Builds ru city display index from GeoNames (CC BY 4.0).
 * - cities1000.zip: city list (geonameId, UTF-8 name, asciiname, country)
 * - alternateNamesV2.zip: language-tagged names; use isolanguage = ru
 *
 * Run: npx tsx scripts/build-audience-city-ru-index.ts
 * Output: src/pages/UserDashboard/components/audience/geoAudienceCityRuIndex.json
 */
import { execSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';

import { audienceCityLookupKey } from '../src/shared/lib/i18n/audienceCityLookupKey';

const CITIES1000_URL = 'https://download.geonames.org/export/dump/cities1000.zip';
const ALTERNATE_NAMES_V2_URL = 'https://download.geonames.org/export/dump/alternateNamesV2.zip';

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

type CityRow = {
  geonameId: number;
  asciiName: string;
  countryCode: string;
};

/** Russian alternate row from alternateNamesV2 (isolanguage = ru, base code before hyphen). */
type RuAlternateRow = {
  alternateNameId: number;
  name: string;
  isPreferredName: boolean;
  isShortName: boolean;
  isColloquial: boolean;
  isHistoric: boolean;
};

function parseBoolFlag(value: string | undefined): boolean {
  return value?.trim() === '1';
}

function extractBaseLangCode(iso: string): string | null {
  const t = iso?.trim();
  if (!t) return null;
  const base = t.split('-')[0]?.toLowerCase();
  return base || null;
}

/** Letters typical of Ukrainian/Belarusian orthography; deprioritize for Russian UI. */
function hasNonRuCyrillicArtifact(name: string): boolean {
  return /[іїєґІЇЄҐўЎ]/.test(name);
}

function compareRuAlternates(a: RuAlternateRow, b: RuAlternateRow): number {
  const key = (r: RuAlternateRow) => [
    r.isPreferredName ? 0 : 1,
    r.isHistoric ? 1 : 0,
    r.isColloquial ? 1 : 0,
    /** City picker: prefer full official name over abbreviations (e.g. СПб). */
    r.isShortName ? 1 : 0,
    hasNonRuCyrillicArtifact(r.name) ? 1 : 0,
    r.name.length,
    r.alternateNameId,
  ];
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

function loadCities1000Rows(text: string): Map<number, CityRow> {
  const map = new Map<number, CityRow>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('\t');
    if (cols.length < 9) continue;
    const geonameId = Number(cols[0]);
    if (!Number.isFinite(geonameId)) continue;
    const asciiName = cols[2]?.trim() ?? '';
    const countryCode = cols[8]?.trim() ?? '';
    if (!asciiName || !countryCode) continue;
    map.set(geonameId, { geonameId, asciiName, countryCode });
  }
  return map;
}

async function pickBestRuNamesForCityIdsStream(
  filePath: string,
  cityIds: Set<number>
): Promise<Map<number, string>> {
  const bestByGeo = new Map<number, RuAlternateRow>();

  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    const cols = line.split('\t');
    if (cols.length < 4) continue;
    const geonameId = Number(cols[1]);
    if (!Number.isFinite(geonameId) || !cityIds.has(geonameId)) continue;

    const lang = extractBaseLangCode(cols[2] ?? '');
    if (lang !== 'ru') continue;

    const name = cols[3]?.trim() ?? '';
    if (!name) continue;

    const row: RuAlternateRow = {
      alternateNameId: Number(cols[0]) || 0,
      name,
      isPreferredName: parseBoolFlag(cols[4]),
      isShortName: parseBoolFlag(cols[5]),
      isColloquial: parseBoolFlag(cols[6]),
      isHistoric: parseBoolFlag(cols[7]),
    };

    const prev = bestByGeo.get(geonameId);
    if (!prev || compareRuAlternates(row, prev) < 0) {
      bestByGeo.set(geonameId, row);
    }
  }

  const result = new Map<number, string>();
  for (const [id, row] of bestByGeo) {
    result.set(id, row.name);
  }
  return result;
}

async function downloadUnzipToWorkdir(
  url: string,
  innerFileName: string,
  workDir: string,
  zipLocalName: string
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const zipPath = join(workDir, zipLocalName);
  writeFileSync(zipPath, buffer);
  execSync(`unzip -q -o "${zipPath}" -d "${workDir}"`);
  return join(workDir, innerFileName);
}

/**
 * GeoNames `ru` sometimes uses hyphenation (e.g. Da Nang → «Да-Нанг»). For lookup keys
 * without spaces we match common compact Russian UI forms (e.g. «Дананг»).
 */
function normalizeRuCityLabel(countryCode: string, asciiName: string, ru: string): string {
  const cc = countryCode.trim().toUpperCase();
  const ascii = asciiName.trim();
  const normalizedAscii = ascii.toLowerCase().replace(/\s+/g, ' ');

  if (cc === 'VN' && /^da[\s-]?nang$/i.test(normalizedAscii) && /^да[-\s]?нанг$/iu.test(ru)) {
    return 'Дананг';
  }

  void cc;
  void ascii;
  return ru;
}

async function main(): Promise<void> {
  const workDir = mkdtempSync(join(tmpdir(), 'geonames-audience-ru-'));
  try {
    const [citiesPath, altPath] = await Promise.all([
      downloadUnzipToWorkdir(CITIES1000_URL, 'cities1000.txt', workDir, 'cities1000.zip'),
      downloadUnzipToWorkdir(
        ALTERNATE_NAMES_V2_URL,
        'alternateNamesV2.txt',
        workDir,
        'alternateNamesV2.zip'
      ),
    ]);

    const citiesText = readFileSync(citiesPath, 'utf8');
    const cityById = loadCities1000Rows(citiesText);
    const cityIds = new Set(cityById.keys());

    const ruById = await pickBestRuNamesForCityIdsStream(altPath, cityIds);

    const index: Record<string, string> = {};
    let citiesWithRuAlternate = 0;
    let duplicateKeySkips = 0;

    for (const city of cityById.values()) {
      const ru = ruById.get(city.geonameId);
      if (!ru) continue;
      citiesWithRuAlternate += 1;
      const display = normalizeRuCityLabel(city.countryCode, city.asciiName, ru);
      const key = audienceCityLookupKey(city.countryCode, city.asciiName);
      if (Object.prototype.hasOwnProperty.call(index, key)) {
        duplicateKeySkips += 1;
      }
      index[key] = display;
    }

    for (const [key, ruLabel] of Object.entries(RU_CITY_DISPLAY_OVERRIDES)) {
      index[key] = ruLabel;
    }

    const citiesTotal = cityById.size;
    const indexEntries = Object.keys(index).length;
    const citiesWithoutRu = citiesTotal - citiesWithRuAlternate;

    writeFileSync(OUT_PATH, JSON.stringify(index));
    console.log(
      `Wrote ${indexEntries} index entries to ${OUT_PATH} (${citiesWithRuAlternate} cities with ru in alternateNamesV2; ${duplicateKeySkips} duplicate lookup keys merged; ${citiesWithoutRu} cities without ru → listen_city fallback in UI)`
    );
    console.log('Sample checks:');
    const checks: readonly [string, string, string][] = [
      ['AT', 'Vienna', 'Вена'],
      ['RU', 'Moscow', 'Москва'],
      ['GB', 'London', 'Лондон'],
      ['CN', 'Beijing', 'Пекин'],
      ['VN', 'Ho Chi Minh City', 'Хошимин'],
      ['VN', 'Da Nang', 'Дананг'],
      ['VN', 'Hoi An', 'Хойан'],
      ['FR', 'Paris', 'Париж'],
    ];
    for (const [cc, ascii, expected] of checks) {
      const got = index[audienceCityLookupKey(cc, ascii)];
      console.log(
        `  ${cc}|${ascii.toLowerCase()} -> ${got}${got === expected ? '' : ` (expected ${expected})`}`
      );
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
