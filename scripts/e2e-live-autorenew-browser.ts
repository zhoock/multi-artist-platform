/**
 * Live browser E2E: register → checkout → wait for autorenew without F5.
 * Usage: npx tsx scripts/e2e-live-autorenew-browser.ts
 */
import { config } from 'dotenv';
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const API_BASE = BASE_URL.includes('8080') ? 'http://localhost:8888' : BASE_URL.replace(/\/$/, '');

const PASSWORD = 'E2eLiveAutorenew1!';
const RUN_ID = Date.now();
const EMAIL = `e2e.live.${RUN_ID}@autorenew.test`;

type ArchiveRequest = { ts: number; phase: string };
type UiSample = {
  ts: number;
  statusLine: string | null;
  expiredBanner: boolean;
  disableAutoRenew: boolean;
  billingClass: string | null;
};

async function apiRegister(): Promise<{ userId: string }> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      name: 'E2E Live',
      accountType: 'listener',
      preferredLanguage: 'ru',
    }),
  });
  if (!res.ok) {
    throw new Error(`register failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const payload = (await res.json()) as { data?: { user?: { id?: string } } };
  const userId = payload.data?.user?.id;
  if (!userId) throw new Error('register missing user id');
  return { userId };
}

async function verifyEmailInDb(userId: string): Promise<void> {
  const { query } = await import('../netlify/functions/lib/db');
  await query(`UPDATE users SET is_email_verified = true WHERE id = $1::uuid`, [userId]);
}

async function apiLogin(): Promise<{ token: string; user: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, preferredLanguage: 'ru' }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const payload = (await res.json()) as {
    data?: { token?: string; user?: Record<string, unknown> };
  };
  const token = payload.data?.token;
  const user = payload.data?.user;
  if (!token || !user) throw new Error('login missing token/user');
  return { token, user };
}

async function apiFetchBilling(token: string): Promise<{
  nextChargeAt: string | null;
  hasPremiumAccess: boolean;
  screen: string;
}> {
  const res = await fetch(`${API_BASE}/api/my-archive`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`my-archive ${res.status}`);
  const payload = (await res.json()) as {
    data?: {
      billing?: { nextChargeAt?: string | null; hasPremiumAccess?: boolean; status?: string };
    };
  };
  const billing = payload.data?.billing;
  const { resolveCollectionBillingScreen } = await import(
    '../src/features/premiumSubscription/lib/resolveCollectionBillingScreen'
  );
  const { EMPTY_BILLING_SNAPSHOT } = await import('../src/shared/api/billing/billingSnapshot');
  const snapshot = billing ? { ...EMPTY_BILLING_SNAPSHOT, ...billing } : EMPTY_BILLING_SNAPSHOT;
  return {
    nextChargeAt: billing?.nextChargeAt ?? null,
    hasPremiumAccess: billing?.hasPremiumAccess ?? false,
    hasSavedPaymentMethod: snapshot.hasSavedPaymentMethod,
    screen: resolveCollectionBillingScreen(snapshot),
  };
}

async function apiCheckout(token: string): Promise<void> {
  const createRes = await fetch(`${API_BASE}/api/create-subscription-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      plan: 'explorer',
      returnUrl: `${BASE_URL}/ru/dashboard/collection`,
    }),
  });
  if (!createRes.ok)
    throw new Error(`checkout failed ${createRes.status}: ${await createRes.text()}`);
  const createBody = (await createRes.json()) as {
    data?: { subscriptionPaymentId?: string };
  };
  const spid = createBody.data?.subscriptionPaymentId;
  if (!spid) throw new Error('missing subscriptionPaymentId');

  for (let i = 0; i < 30; i += 1) {
    const statusRes = await fetch(
      `${API_BASE}/api/get-subscription-payment-status?subscriptionPaymentId=${spid}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const statusBody = (await statusRes.json()) as {
      data?: { subscriptionActivated?: boolean };
    };
    if (statusBody.data?.subscriptionActivated) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('checkout fulfillment timeout');
}

async function sampleUi(page: Page): Promise<UiSample> {
  return page.evaluate(() => {
    const billing = document.querySelector('.collection-billing');
    const statusLine =
      billing?.querySelector('.collection-billing__status-line')?.textContent?.trim() ?? null;
    const bodyText = document.body.innerText;
    return {
      ts: Date.now(),
      statusLine,
      expiredBanner: /Поддержка завершена|Support ended/i.test(bodyText),
      disableAutoRenew: /Отключить автопродление|Disable auto-renew/i.test(bodyText),
      billingClass: billing?.className ?? null,
    };
  });
}

function analyzeRenewalPollRequests(
  requests: ArchiveRequest[],
  chargeAtMs: number,
  windowEndMs: number
): { pollCount: number; minIntervalMs: number | null; burstPairs: number } {
  const inWindow = requests.filter((r) => r.ts >= chargeAtMs && r.ts <= windowEndMs);
  const intervals: number[] = [];
  for (let i = 1; i < inWindow.length; i += 1) {
    intervals.push(inWindow[i].ts - inWindow[i - 1].ts);
  }
  const burstPairs = intervals.filter((ms) => ms >= 0 && ms < 10_000).length;
  const minIntervalMs = intervals.length > 0 ? Math.min(...intervals) : null;
  return { pollCount: inWindow.length, minIntervalMs, burstPairs };
}

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), 'tmp/e2e-live-autorenew');
  mkdirSync(outDir, { recursive: true });

  console.log(`[e2e] register ${EMAIL}`);
  const { userId } = await apiRegister();
  await verifyEmailInDb(userId);
  const { token, user } = await apiLogin();

  console.log('[e2e] checkout explorer (dev mode)');
  await apiCheckout(token);

  const billingAfterCheckout = await apiFetchBilling(token);
  const initialNextChargeAt = billingAfterCheckout.nextChargeAt;
  if (!initialNextChargeAt) throw new Error('nextChargeAt missing after checkout');
  const chargeAtMs = new Date(initialNextChargeAt).getTime();
  console.log('[e2e] initial nextChargeAt', initialNextChargeAt);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
  });
  await context.addInitScript(
    ({ token: t, user: u }) => {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('auth_user', JSON.stringify(u));
    },
    { token, user }
  );
  const page = await context.newPage();

  const archiveRequests: ArchiveRequest[] = [];
  let monitorPhase = 'collection-open';

  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes('/api/my-archive')) {
      archiveRequests.push({ ts: Date.now(), phase: monitorPhase });
    }
  });

  const collectionUrl = `${BASE_URL.replace(/\/$/, '')}/ru/dashboard/collection`;
  console.log('[e2e] open collection — no F5 from here');
  await page.goto(collectionUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector('.collection-billing--active', { timeout: 120_000 });
  await page.waitForTimeout(1500);

  const initialUi = await sampleUi(page);
  const initialStatusLine = initialUi.statusLine;
  console.log('[e2e] initial UI status:', initialStatusLine);

  const expiredFlashAt: number[] = [];
  const uiTimeline: UiSample[] = [initialUi];
  let monitoringExpired = false;

  const pollUi = setInterval(async () => {
    try {
      const sample = await sampleUi(page);
      uiTimeline.push(sample);
      if (!monitoringExpired) return;
      if (sample.expiredBanner || sample.billingClass?.includes('collection-billing--expired')) {
        expiredFlashAt.push(sample.ts);
      }
    } catch {
      /* navigating */
    }
  }, 200);

  // Start EXPIRED monitoring only once billing is stable and until renewal completes.
  monitoringExpired = true;

  const maxWaitMs = 8 * 60 * 1000;
  const startedAt = Date.now();
  let renewedNextChargeAt: string | null = null;
  let renewedUi: UiSample | null = null;

  while (Date.now() - startedAt < maxWaitMs) {
    const apiBilling = await apiFetchBilling(token);
    if (apiBilling.nextChargeAt && apiBilling.nextChargeAt !== initialNextChargeAt) {
      renewedNextChargeAt = apiBilling.nextChargeAt;
      // Wait for UI to catch up via existing polling (no F5)
      for (let i = 0; i < 20; i += 1) {
        renewedUi = await sampleUi(page);
        if (
          renewedUi.billingClass?.includes('collection-billing--active') &&
          !renewedUi.expiredBanner &&
          renewedUi.disableAutoRenew
        ) {
          break;
        }
        await page.waitForTimeout(1000);
      }
      monitoringExpired = false;
      console.log('[e2e] renewal confirmed via API', renewedNextChargeAt);
      console.log('[e2e] UI after renewal:', renewedUi?.statusLine, renewedUi?.billingClass);
      break;
    }

    const sample = await sampleUi(page);
    if (sample.expiredBanner || sample.billingClass?.includes('collection-billing--expired')) {
      expiredFlashAt.push(Date.now());
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (elapsed % 30 === 0) {
      console.log(
        `[e2e] waiting… ${elapsed}s UI="${sample.statusLine}" api.premium=${apiBilling.hasPremiumAccess}`
      );
    }

    await page.waitForTimeout(2000);
  }

  clearInterval(pollUi);

  if (!renewedNextChargeAt || !renewedUi) {
    await page.screenshot({ path: resolve(outDir, 'timeout.png'), fullPage: true });
    throw new Error('renewal not detected within 8 minutes');
  }

  await page.waitForTimeout(5000);
  const afterRenewUi = await sampleUi(page);

  // Leave collection tab
  monitorPhase = 'after-leave-grace';
  console.log('[e2e] leave collection → settings');
  await page.goto(`${BASE_URL.replace(/\/$/, '')}/ru/dashboard/settings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(10_000);

  monitorPhase = 'after-leave-monitor';
  const monitorStart = Date.now();
  await page.waitForTimeout(35_000);
  const renewalPollAfterLeave = archiveRequests.filter(
    (r) => r.phase === 'after-leave-monitor' && r.ts >= monitorStart
  );

  const pollWindowEndMs = chargeAtMs + 3 * 60 * 1000;
  const pollAnalysis = analyzeRenewalPollRequests(
    archiveRequests.filter((r) => r.phase === 'collection-open'),
    chargeAtMs,
    pollWindowEndMs
  );

  const report = {
    email: EMAIL,
    initialNextChargeAt,
    renewedNextChargeAt,
    initialStatusLine,
    renewedStatusLine: renewedUi.statusLine,
    afterRenewUi,
    expiredFlashSamples: expiredFlashAt.length,
    expiredFlashAt: [...new Set(expiredFlashAt)].map((t) => new Date(t).toISOString()),
    uiTimeline: uiTimeline.slice(-20),
    archiveRequestsTotal: archiveRequests.length,
    renewalPollWindowAnalysis: pollAnalysis,
    myArchiveAfterLeaveMonitor35s: renewalPollAfterLeave.length,
    checks: {
      nextChargeAtAdvanced: renewedNextChargeAt !== initialNextChargeAt,
      uiStatusChangedAfterRenewal:
        Boolean(renewedUi.statusLine) && renewedUi.statusLine !== initialStatusLine,
      noExpiredFlash: expiredFlashAt.length === 0,
      disableButtonAfterRenew: afterRenewUi.disableAutoRenew,
      activeAfterRenew: afterRenewUi.billingClass?.includes('collection-billing--active') ?? false,
      noExpiredBannerAfterRenew: !afterRenewUi.expiredBanner,
      renewalSyncStoppedAfterLeave: renewalPollAfterLeave.length === 0,
      noBurstPollingInRenewalWindow: pollAnalysis.burstPairs <= 1,
    },
  };

  writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: resolve(outDir, 'after-renew.png'), fullPage: true });
  await browser.close();

  console.log(JSON.stringify(report, null, 2));

  const failed = Object.entries(report.checks).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error('[e2e] FAILED:', failed.map(([k]) => k).join(', '));
    process.exit(1);
  }
  console.log('[e2e] ALL CHECKS PASSED');
}

main().catch((err) => {
  console.error('[e2e] fatal:', err);
  process.exit(1);
});
