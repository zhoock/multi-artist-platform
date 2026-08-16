/**
 * Browser network verification for album cover CDN migration.
 * Run: node scripts/verify-album-cover-cdn.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.ALBUM_COVER_VERIFY_BASE_URL ?? 'http://127.0.0.1:8888';
const SUPABASE_HOST = /supabase\.co\/storage\/v1\/object\/public\/user-media\//;
const PROXY_PATH = /\/api\/proxy-image|\/\.netlify\/functions\/proxy-image/;

/** @typedef {{ name: string; ok: boolean; detail: string }} Result */

/** @type {Result[]} */
const results = [];

/**
 * @param {import('playwright').Page} page
 * @param {() => Promise<void>} action
 */
async function collectCoverRequests(page, action) {
  /** @type {import('playwright').Response[]} */
  const responses = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('user-media') || PROXY_PATH.test(url)) {
      responses.push(response);
    }
  });
  await action();
  await page.waitForTimeout(1500);
  return responses;
}

/**
 * @param {string} name
 * @param {import('playwright').Response[]} responses
 * @param {{ allowProxy?: boolean }} [opts]
 */
function recordNetworkResult(name, responses, opts = {}) {
  const direct = responses.filter((r) => SUPABASE_HOST.test(r.url()) && r.url().includes('/albums/'));
  const proxyAlbum = responses.filter(
    (r) => PROXY_PATH.test(r.url()) && r.url().includes('/albums/')
  );

  if (opts.allowProxy) {
    const ok = proxyAlbum.length > 0;
    results.push({
      name,
      ok,
      detail: ok
        ? `proxy album requests=${proxyAlbum.length}`
        : `expected proxy album cover requests, got direct=${direct.length}`,
    });
    return;
  }

  const ok = direct.length > 0 && proxyAlbum.length === 0 && direct.every((r) => r.status() === 200);
  results.push({
    name,
    ok,
    detail: ok
      ? `direct=${direct.length}, proxyAlbum=${proxyAlbum.length}`
      : `direct=${direct.length}, proxyAlbum=${proxyAlbum.length}, statuses=${direct.map((r) => r.status()).join(',')}`,
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.setViewportSize({ width: 1280, height: 900 });
  recordNetworkResult(
    'Catalog desktop',
    await collectCoverRequests(page, async () => {
      await page.goto(`${BASE}/ru/?artist=smolyanoe-chuchelko`, { waitUntil: 'networkidle' });
    })
  );

  await page.setViewportSize({ width: 390, height: 844 });
  recordNetworkResult(
    'Catalog mobile',
    await collectCoverRequests(page, async () => {
      await page.goto(`${BASE}/ru/?artist=smolyanoe-chuchelko`, { waitUntil: 'networkidle' });
    })
  );

  recordNetworkResult(
    'Album page',
    await collectCoverRequests(page, async () => {
      await page.goto(`${BASE}/ru/albums/23-remastered?artist=smolyanoe-chuchelko`, {
        waitUntil: 'networkidle',
      });
    })
  );

  await page.goto(`${BASE}/ru/albums/23-remastered?artist=smolyanoe-chuchelko`, {
    waitUntil: 'networkidle',
  });
  await page.locator('.album-play').first().click({ timeout: 10000 }).catch(() => undefined);
  await page.waitForSelector('.mini-player .album-cover__image', { timeout: 15000 }).catch(() => undefined);
  const miniImg = page.locator('.mini-player .album-cover__image').first();
  if (await miniImg.count()) {
    const src = (await miniImg.getAttribute('src')) ?? '';
    results.push({
      name: 'MiniPlayer',
      ok: SUPABASE_HOST.test(src) && !PROXY_PATH.test(src),
      detail: src.slice(0, 140),
    });
  } else {
    results.push({ name: 'MiniPlayer', ok: false, detail: 'mini-player cover not visible' });
  }

  await page.evaluate(() => {
    window.location.hash = 'player';
  });
  await page.waitForTimeout(2000);
  await page.waitForSelector('.player__cover .album-cover__image', { timeout: 15000 }).catch(() => undefined);
  const playerImg = page.locator('.player__cover .album-cover__image').first();
  if (await playerImg.count()) {
    const src = (await playerImg.getAttribute('src')) ?? '';
    results.push({
      name: 'AudioPlayer',
      ok: PROXY_PATH.test(src) && !SUPABASE_HOST.test(src),
      detail: src.slice(0, 140),
    });
  } else {
    results.push({ name: 'AudioPlayer', ok: false, detail: 'player cover not visible' });
  }
} finally {
  await browser.close();
}

console.log('\nAlbum cover CDN verification\n');
for (const result of results) {
  console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}: ${result.detail}`);
}
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
