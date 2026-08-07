/**
 * Captures UI proof screenshots after autorenew (run after seed-autorenew-ui-proof.ts).
 * See docs/autorenew-verification.md
 *
 * Usage: npx tsx scripts/capture-autorenew-ui-proof.ts <email> [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'path';

const PROOF_PASSWORD = 'AutorenewProof1!';
const email = process.argv[2];
const baseUrl = process.argv[3] ?? 'http://localhost:8080';

if (!email) {
  console.error('Usage: npx tsx scripts/capture-autorenew-ui-proof.ts <email> [baseUrl]');
  process.exit(1);
}

async function login(base: string): Promise<{ token: string; user: Record<string, unknown> }> {
  const apiBase = base.includes('8080')
    ? 'http://localhost:8888/.netlify/functions/auth'
    : `${base.replace(/\/$/, '')}/.netlify/functions/auth`;

  const response = await fetch(`${apiBase}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PROOF_PASSWORD, preferredLanguage: 'ru' }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    success?: boolean;
    data?: { token?: string; user?: Record<string, unknown> };
    token?: string;
    user?: Record<string, unknown>;
  };

  const token = payload.data?.token ?? payload.token;
  const user = payload.data?.user ?? payload.user;

  if (!token || !user) {
    throw new Error('Login response missing token or user');
  }

  return { token, user };
}

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), 'tmp/autorenew-ui-proof');
  mkdirSync(outDir, { recursive: true });

  const { token, user } = await login(baseUrl);
  const collectionUrl = `${baseUrl.replace(/\/$/, '')}/dashboard/collection`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
  });
  await context.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));
    },
    { token, user }
  );
  const page = await context.newPage();

  await page.goto(collectionUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try {
    await page.waitForSelector('.collection-billing--active, .collection-billing', {
      timeout: 60000,
    });
  } catch {
    const debugPath = resolve(outDir, '00-debug-before-billing.png');
    await page.screenshot({ path: debugPath, fullPage: true });
    const snippet = (await page.locator('body').innerText()).slice(0, 1200);
    throw new Error(
      `Billing block not found at ${page.url()}. Debug screenshot: ${debugPath}\n${snippet}`
    );
  }
  await page.waitForTimeout(2000);

  const bodyText = await page.locator('body').innerText();
  const nextChargeLabelVisible = /Следующее списание|Next charge/i.test(bodyText);
  const showsSupportEndedBanner = /Поддержка завершена|Support ended/i.test(bodyText);
  const activePlanVisible = /Archivist|Архивариус|Текущий план/i.test(bodyText);

  const beforeRefreshPath = resolve(outDir, '01-after-autorenew.png');
  await page.screenshot({ path: beforeRefreshPath, fullPage: true });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.collection-billing--active, .collection-billing', {
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  const bodyAfterRefresh = await page.locator('body').innerText();
  const nextChargeLabelVisibleAfterRefresh = /Следующее списание|Next charge/i.test(
    bodyAfterRefresh
  );
  const showsSupportEndedBannerAfterRefresh = /Поддержка завершена|Support ended/i.test(
    bodyAfterRefresh
  );

  const afterRefreshPath = resolve(outDir, '02-after-page-refresh.png');
  await page.screenshot({ path: afterRefreshPath, fullPage: true });

  await browser.close();

  const checks = {
    nextChargeLabelVisible,
    supportEndedBannerAbsent: !showsSupportEndedBanner,
    activePlanVisible,
    nextChargeLabelVisibleAfterRefresh,
    supportEndedBannerAbsentAfterRefresh: !showsSupportEndedBannerAfterRefresh,
    beforeRefreshPath,
    afterRefreshPath,
  };

  console.log(JSON.stringify(checks, null, 2));

  if (
    !nextChargeLabelVisible ||
    showsSupportEndedBanner ||
    !nextChargeLabelVisibleAfterRefresh ||
    showsSupportEndedBannerAfterRefresh
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('capture-autorenew-ui-proof failed:', error);
  process.exit(1);
});
