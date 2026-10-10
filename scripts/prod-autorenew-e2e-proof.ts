/**
 * Production E2E proof: register → checkout → YooKassa → DB → my-archive.
 * Does not invoke the remote Netlify scheduler (no mass renewal risk).
 *
 *   ALLOW_PRODUCTION_AUTORENEW_E2E=true \
 *   PRODUCTION_AUTORENEW_E2E_BASE_URL=https://<temporary-deploy-origin> \
 *   PRODUCTION_AUTORENEW_E2E_DATABASE_HOST=<host of DATABASE_URL> \
 *   npx tsx scripts/prod-autorenew-e2e-proof.ts [--skip-payment] [--simulate-period-end]
 *
 * Site/DB alignment before registration is not verified here (would need a dedicated read-only
 * fingerprint endpoint). After register, the script refuses SQL if the user is not visible in
 * DATABASE_URL.
 *
 * Opt-in is NOT permission to move real money: local keys must be test_…; when the payment API
 * returns a `test` field it must be true.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

import {
  assertProductionAutorenewE2eEnvironment,
  assertYooKassaPaymentTestMode,
  PRODUCTION_AUTORENEW_E2E_FORBIDDEN_OUTPUT_KEYS,
} from '../netlify/functions/lib/production-autorenew-e2e-guard';

config({ path: resolve(process.cwd(), '.env') });

const OUT_DIR = resolve(process.cwd(), 'tmp/prod-autorenew-proof');

type Json = Record<string, unknown>;

function log(step: string, data: Json): void {
  console.log(`\n=== ${step} ===`);
  console.log(JSON.stringify(sanitizeForOutput(data), null, 2));
}

function sanitizeForOutput(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeForOutput);
  if (typeof value !== 'object') return value;
  const out: Json = {};
  for (const [key, nested] of Object.entries(value as Json)) {
    if (PRODUCTION_AUTORENEW_E2E_FORBIDDEN_OUTPUT_KEYS.has(key)) continue;
    if (key === 'body' && typeof nested === 'object' && nested !== null) {
      out[key] = sanitizeForOutput(nested);
      continue;
    }
    out[key] = sanitizeForOutput(nested);
  }
  return out;
}

function createProofPassword(): string {
  return `Prf-${crypto.randomBytes(18).toString('base64url')}`;
}

async function api(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: Json; token?: string } = {}
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json: Json = {};
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = { parseError: true, length: text.length };
  }
  return { status: res.status, json };
}

function describePaymentMethod(
  method: { id?: string; saved?: boolean; type?: string } | null | undefined
): Json {
  return { type: method?.type ?? null, saved: method?.saved ?? null, hasId: Boolean(method?.id) };
}

function sanitizeBilling(billing: Json | undefined): Json | null {
  if (!billing) return null;
  return {
    nextChargeAt: billing.nextChargeAt ?? null,
    autoRenewEnabled: billing.autoRenewEnabled ?? null,
    hasPremiumAccess: billing.hasPremiumAccess ?? null,
    plan: billing.plan ?? null,
  };
}

async function readClientAutoRenewFlag(baseUrl: string): Promise<string | null> {
  const htmlRes = await fetch(`${baseUrl}/`);
  const html = await htmlRes.text();
  const scriptPaths = [...html.matchAll(/\/scripts\/[^"]+\.js/g)].map((m) => m[0]);
  for (const scriptPath of scriptPaths) {
    const js = await (await fetch(`${baseUrl}${scriptPath}`)).text();
    const m = js.match(/parseAutoRenewFlag\("([^"]*)"\)/);
    if (m) return m[1];
  }
  return null;
}

async function main(): Promise<void> {
  const { baseUrl, skipPayment, simulatePeriodEnd } = assertProductionAutorenewE2eEnvironment({
    argv: process.argv.slice(2),
  });
  mkdirSync(OUT_DIR, { recursive: true });

  const proofPassword = createProofPassword();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `prod-autorenew-${suffix}@pr10-e2e.test`;
  const name = `Prod Proof ${suffix}`;

  const clientFlagValue = await readClientAutoRenewFlag(baseUrl);
  log('0. Client bundle auto-renew flag (from SUBSCRIPTION_AUTO_RENEW_ENABLED at build)', {
    clientFlagValue,
    clientFlagEnabled: clientFlagValue === 'true',
    scriptsScanned: clientFlagValue !== null,
  });
  if (clientFlagValue !== 'true') {
    throw new Error('Client bundle not built with autorenew flag=true');
  }

  const register = await fetch(`${baseUrl}/.netlify/functions/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: proofPassword,
      name,
      accountType: 'listener',
      preferredLanguage: 'ru',
    }),
  });
  const registerText = await register.text();
  let registerJson: Json = {};
  try {
    registerJson = JSON.parse(registerText) as Json;
  } catch {
    registerJson = { parseError: true, length: registerText.length };
  }
  const registerData = (registerJson.data ?? registerJson) as Json;
  const userObj = registerData.user as Json | undefined;
  const userId = String(userObj?.id ?? registerData.id ?? '');
  const token = String(registerData.token ?? '');
  log('1. Register', {
    status: register.status,
    hasEmail: Boolean(email),
    hasUserId: Boolean(userId),
    hasToken: Boolean(token),
  });
  if (register.status !== 200 && register.status !== 201) {
    throw new Error(`Register failed: ${register.status}`);
  }
  if (!userId || !token) throw new Error('Register missing userId or token');

  const { query } = await import('../netlify/functions/lib/db');
  const visible = await query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1::uuid AND email = $2 LIMIT 1`,
    [userId, email]
  );
  if (visible.rows.length !== 1) {
    throw new Error(
      `User registered via ${baseUrl} is not visible in DATABASE_URL — refusing SQL writes to an unexpected database`
    );
  }
  await query(`UPDATE users SET is_email_verified = true WHERE id = $1::uuid`, [userId]);
  log('1b. Email verified (test setup)', { hasUserId: true, is_email_verified: true });

  const returnUrl = `${baseUrl}/dashboard/collection?payment=success`;
  const checkout = await api(baseUrl, '/.netlify/functions/create-subscription-payment', {
    method: 'POST',
    token,
    body: { plan: 'explorer', returnUrl },
  });
  log('2. Create checkout', {
    status: checkout.status,
    hasData: Boolean(checkout.json.data ?? checkout.json),
  });
  if (checkout.status !== 200) throw new Error(`Checkout failed: ${checkout.status}`);

  const checkoutData = (checkout.json.data ?? checkout.json) as Json;
  const paymentId = String(checkoutData.paymentId ?? '');
  const hasConfirmationUrl = Boolean(checkoutData.confirmationUrl);
  if (!paymentId) throw new Error('Missing paymentId from checkout');

  writeFileSync(
    resolve(OUT_DIR, 'checkout.json'),
    JSON.stringify(
      sanitizeForOutput({
        hasEmail: true,
        hasUserId: true,
        hasPaymentId: true,
        hasConfirmationUrl,
        checkoutStatus: checkout.status,
      }),
      null,
      2
    )
  );

  const { getYooKassaEnvCredentials } = await import('../netlify/functions/lib/yookassa-env');
  const { fetchPaymentFromYooKassaApi } = await import(
    '../netlify/functions/lib/yookassa-webhook-verify'
  );
  const creds = getYooKassaEnvCredentials();
  if (!creds)
    throw new Error('Local YOOKASSA credentials missing — cannot verify YooKassa payload');

  const yk = await fetchPaymentFromYooKassaApi(paymentId, creds.shopId, creds.secretKey);
  if (!yk.ok) throw new Error(`YooKassa fetch failed: ${yk.status}`);

  const ykPayment = yk.payment as Json & {
    test?: boolean;
    save_payment_method?: boolean;
    payment_method?: { id?: string; saved?: boolean; type?: string; card?: Json };
  };

  assertYooKassaPaymentTestMode(ykPayment);

  log('3. YooKassa payment after checkout create', {
    status: ykPayment.status,
    test: ykPayment.test === true,
    save_payment_method: ykPayment.save_payment_method ?? null,
    payment_method: describePaymentMethod(ykPayment.payment_method),
    hasConfirmationUrl,
  });

  if (ykPayment.save_payment_method !== true) {
    throw new Error(
      `YooKassa payment missing save_payment_method=true (got ${String(ykPayment.save_payment_method)})`
    );
  }

  if (skipPayment) {
    console.log(
      '\n--skip-payment: complete YooKassa payment manually, then re-run without the flag.'
    );
    return;
  }

  let pollAttempts = 0;
  let paid = false;
  let finalYk = ykPayment;
  while (pollAttempts < 120) {
    const fresh = await fetchPaymentFromYooKassaApi(paymentId, creds.shopId, creds.secretKey);
    if (fresh.ok) {
      finalYk = fresh.payment as typeof ykPayment;
      assertYooKassaPaymentTestMode(finalYk);
      if (finalYk.status === 'succeeded') {
        paid = true;
        break;
      }
    }
    pollAttempts += 1;
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!paid) {
    console.log('\nPayment not succeeded yet. Complete payment in YooKassa, then re-run.');
    throw new Error('Payment not succeeded within poll window');
  }

  log('4. YooKassa after payment succeeded', {
    status: finalYk.status,
    test: finalYk.test === true,
    payment_method: describePaymentMethod(finalYk.payment_method),
  });

  if (finalYk.payment_method?.saved !== true) {
    throw new Error('YooKassa payment_method.saved is not true after success');
  }

  const poll = await api(
    baseUrl,
    `/.netlify/functions/get-subscription-payment-status?paymentId=${encodeURIComponent(paymentId)}`,
    { token }
  );
  log('4b. Production poll fulfillment', {
    status: poll.status,
    success: poll.json.success ?? null,
  });

  const sub = await query<{
    id: string;
    status: string;
    payment_method_id: string | null;
    next_charge_at: Date | null;
    expires_at: Date | null;
    plan: string;
  }>(
    `SELECT id, status, payment_method_id, next_charge_at, expires_at, plan
     FROM subscriptions WHERE user_id = $1::uuid`,
    [userId]
  );
  if (sub.rows.length > 1) {
    throw new Error(
      `User has ${sub.rows.length} subscriptions in DATABASE_URL — refusing ambiguous subscription UPDATE`
    );
  }
  const row = sub.rows[0];
  log('5. DB subscriptions', {
    hasSubscription: Boolean(row),
    status: row?.status ?? null,
    plan: row?.plan ?? null,
    hasPaymentMethod: Boolean(row?.payment_method_id),
    next_charge_at: row?.next_charge_at?.toISOString() ?? null,
    expires_at: row?.expires_at?.toISOString() ?? null,
  });

  if (!row?.payment_method_id || !row.next_charge_at) {
    throw new Error('DB missing payment_method_id or next_charge_at after fulfillment');
  }

  const { listChargeReadySubscriptionIds } = await import(
    '../netlify/functions/lib/subscription-renewal-engine'
  );
  const now = new Date();
  const chargeReadyNow = await listChargeReadySubscriptionIds(now);
  log('6. listChargeReadySubscriptionIds (now)', {
    included: chargeReadyNow.includes(row.id),
    chargeReadyCount: chargeReadyNow.length,
  });

  const archive = await api(baseUrl, '/.netlify/functions/my-archive', { token });
  const archiveData = (archive.json.data ?? archive.json) as Json;
  const billing = sanitizeBilling(archiveData.billing as Json | undefined);
  log('7. /api/my-archive billing', {
    status: archive.status,
    billing,
  });

  if (!billing?.nextChargeAt) {
    throw new Error('/api/my-archive billing.nextChargeAt is empty');
  }

  writeFileSync(
    resolve(OUT_DIR, 'post-checkout-facts.json'),
    JSON.stringify(
      sanitizeForOutput({
        hasEmail: true,
        hasUserId: true,
        subscription: {
          status: row.status,
          plan: row.plan,
          hasPaymentMethod: Boolean(row.payment_method_id),
          next_charge_at: row.next_charge_at?.toISOString() ?? null,
          expires_at: row.expires_at?.toISOString() ?? null,
        },
        yookassa: describePaymentMethod(finalYk.payment_method),
        billing,
      }),
      null,
      2
    )
  );

  if (!simulatePeriodEnd) {
    console.log('\nPost-checkout proof complete (remote scheduler is never invoked).');
    console.log(`Artifacts: ${OUT_DIR}`);
    return;
  }

  const periodEnd = row.next_charge_at!;
  const past = new Date(periodEnd.getTime() + 60_000);

  await query(
    `UPDATE subscriptions
     SET expires_at = $2, next_charge_at = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [row.id, periodEnd]
  );

  const chargeReadyPast = await listChargeReadySubscriptionIds(past);
  log('8. listChargeReadySubscriptionIds (simulated period end, local only)', {
    included: chargeReadyPast.includes(row.id),
    simulatedNow: past.toISOString(),
  });

  if (!chargeReadyPast.includes(row.id)) {
    throw new Error('Subscription not charge-ready after simulated period end');
  }

  console.log('\nPeriod-end simulation complete. Remote scheduler was not invoked.');
  console.log(`Artifacts: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('\nPROOF FAILED:', e);
  process.exit(1);
});
