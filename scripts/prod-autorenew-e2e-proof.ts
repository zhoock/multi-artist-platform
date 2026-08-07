/**
 * Production E2E proof: register → checkout → YooKassa → DB → my-archive → renewal.
 * Usage: npx tsx scripts/prod-autorenew-e2e-proof.ts [--skip-payment] [--skip-renewal]
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

config({ path: resolve(process.cwd(), '.env') });

const PROD_BASE = 'https://multi-artist-platform.netlify.app';
const PROD_AUTH = `${PROD_BASE}/.netlify/functions/auth`;
const PROOF_PASSWORD = 'ProdAutorenewProof1!';
const OUT_DIR = resolve(process.cwd(), 'tmp/prod-autorenew-proof');

type Json = Record<string, unknown>;

function log(step: string, data: Json): void {
  console.log(`\n=== ${step} ===`);
  console.log(JSON.stringify(data, null, 2));
}

async function api(
  path: string,
  options: { method?: string; body?: Json; token?: string } = {}
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(`${PROD_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json: Json = {};
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const skipPayment = process.argv.includes('--skip-payment');
  const skipRenewal = process.argv.includes('--skip-renewal');

  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `prod-autorenew-${suffix}@pr10-e2e.test`;
  const name = `Prod Proof ${suffix}`;

  // ── Step 0: Live bundle flag ──
  const htmlRes = await fetch(`${PROD_BASE}/`);
  const html = await htmlRes.text();
  const scriptPaths = [...html.matchAll(/\/scripts\/[^"]+\.js/g)].map((m) => m[0]);
  let clientFlagValue: string | null = null;
  const scriptCandidates = [
    ...scriptPaths,
    // Lazy-loaded chunk (not in index.html) that contains isSubscriptionAutoRenewClientEnabled
    '/scripts/6658.4195cd98c11935f80575.js',
  ];
  for (const scriptPath of scriptCandidates) {
    const js = await (await fetch(`${PROD_BASE}${scriptPath}`)).text();
    const m = js.match(/parseAutoRenewFlag\("([^"]*)"\)/);
    if (m) {
      clientFlagValue = m[1];
      break;
    }
  }
  log('0. Client bundle VITE_SUBSCRIPTION_AUTO_RENEW_ENABLED', {
    clientFlagValue,
    clientFlagEnabled: clientFlagValue === 'true',
  });
  if (clientFlagValue !== 'true') {
    throw new Error('Client bundle not built with autorenew flag=true');
  }

  // ── Step 1: Register ──
  const register = await fetch(`${PROD_AUTH}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: PROOF_PASSWORD,
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
    registerJson = { raw: registerText };
  }
  log('1. Register', { status: register.status, email, body: registerJson });
  if (register.status !== 200 && register.status !== 201) {
    throw new Error(`Register failed: ${register.status}`);
  }

  const registerData = (registerJson.data ?? registerJson) as Json;
  const userObj = registerData.user as Json | undefined;
  const userId = String(userObj?.id ?? registerData.id ?? '');
  const token = String(registerData.token ?? '');
  if (!userId || !token) throw new Error('Register missing userId or token');

  const { query } = await import('../netlify/functions/lib/db');
  await query(`UPDATE users SET is_email_verified = true WHERE id = $1::uuid`, [userId]);
  log('1b. Email verified (test setup)', { userId, is_email_verified: true });

  // ── Step 2: Create checkout ──
  const returnUrl = `${PROD_BASE}/dashboard/collection?payment=success`;
  const checkout = await api('/.netlify/functions/create-subscription-payment', {
    method: 'POST',
    token,
    body: { plan: 'explorer', returnUrl },
  });
  log('2. Create checkout', { status: checkout.status, body: checkout.json });
  if (checkout.status !== 200) throw new Error(`Checkout failed: ${checkout.status}`);

  const checkoutData = (checkout.json.data ?? checkout.json) as Json;
  const paymentId = String(checkoutData.paymentId ?? '');
  const confirmationUrl = String(checkoutData.confirmationUrl ?? '');
  if (!paymentId) throw new Error('Missing paymentId from checkout');

  writeFileSync(
    resolve(OUT_DIR, 'checkout.json'),
    JSON.stringify({ email, password: PROOF_PASSWORD, userId, paymentId, confirmationUrl }, null, 2)
  );

  // ── Step 3: YooKassa payment object (save_payment_method) ──
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
    save_payment_method?: boolean;
    payment_method?: { id?: string; saved?: boolean; type?: string; card?: Json };
  };

  log('3. YooKassa payment after checkout create', {
    paymentId,
    status: ykPayment.status,
    save_payment_method: ykPayment.save_payment_method ?? null,
    payment_method: ykPayment.payment_method ?? null,
    confirmationUrl: confirmationUrl.slice(0, 120),
  });

  if (ykPayment.save_payment_method !== true) {
    throw new Error(
      `YooKassa payment missing save_payment_method=true (got ${String(ykPayment.save_payment_method)})`
    );
  }

  if (skipPayment) {
    console.log('\n--skip-payment: complete YooKassa payment manually, then re-run with paymentId');
    console.log(`confirmationUrl: ${confirmationUrl}`);
    return;
  }

  // ── Step 4: Poll until succeeded (user must pay via confirmationUrl first if pending) ──
  let pollAttempts = 0;
  let paid = false;
  let finalYk = ykPayment;
  while (pollAttempts < 120) {
    const fresh = await fetchPaymentFromYooKassaApi(paymentId, creds.shopId, creds.secretKey);
    if (fresh.ok) {
      finalYk = fresh.payment as typeof ykPayment;
      if (finalYk.status === 'succeeded') {
        paid = true;
        break;
      }
    }
    pollAttempts += 1;
    await new Promise((r) => setTimeout(r, 5000));
  }

  if (!paid) {
    console.log(
      '\nPayment not succeeded yet. Open confirmation URL and pay, then re-run poll step.'
    );
    console.log(`confirmationUrl: ${confirmationUrl}`);
    throw new Error('Payment not succeeded within poll window');
  }

  log('4. YooKassa after payment succeeded', {
    status: finalYk.status,
    payment_method_saved: finalYk.payment_method?.saved ?? null,
    payment_method_id: finalYk.payment_method?.id ?? null,
  });

  if (finalYk.payment_method?.saved !== true) {
    throw new Error('YooKassa payment_method.saved is not true after success');
  }

  // Trigger fulfillment via production poll endpoint
  const poll = await api(
    `/.netlify/functions/get-subscription-payment-status?paymentId=${paymentId}`,
    { token }
  );
  log('4b. Production poll fulfillment', { status: poll.status, body: poll.json });

  // ── Step 5: DB subscription fields ──
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
  const row = sub.rows[0];
  log('5. DB subscriptions', {
    subscriptionId: row?.id,
    status: row?.status,
    plan: row?.plan,
    payment_method_id: row?.payment_method_id,
    next_charge_at: row?.next_charge_at?.toISOString() ?? null,
    expires_at: row?.expires_at?.toISOString() ?? null,
  });

  if (!row?.payment_method_id || !row.next_charge_at) {
    throw new Error('DB missing payment_method_id or next_charge_at after fulfillment');
  }

  // ── Step 6: listChargeReadySubscriptionIds (should NOT include before period end) ──
  const { listChargeReadySubscriptionIds } = await import(
    '../netlify/functions/lib/subscription-renewal-engine'
  );
  const now = new Date();
  const chargeReadyNow = await listChargeReadySubscriptionIds(now);
  log('6. listChargeReadySubscriptionIds (now)', {
    subscriptionId: row.id,
    included: chargeReadyNow.includes(row.id),
    chargeReadyCount: chargeReadyNow.length,
  });

  // ── Step 7: /api/my-archive ──
  const archive = await api('/.netlify/functions/my-archive', { token });
  const archiveData = (archive.json.data ?? archive.json) as Json;
  const billing = archiveData.billing as Json | undefined;
  log('7. /api/my-archive billing', {
    status: archive.status,
    nextChargeAt: billing?.nextChargeAt ?? null,
    autoRenewEnabled: billing?.autoRenewEnabled ?? null,
    hasPremiumAccess: billing?.hasPremiumAccess ?? null,
    plan: billing?.plan ?? null,
  });

  if (!billing?.nextChargeAt) {
    throw new Error('/api/my-archive billing.nextChargeAt is empty');
  }

  writeFileSync(
    resolve(OUT_DIR, 'post-checkout-facts.json'),
    JSON.stringify(
      {
        email,
        userId,
        paymentId,
        subscription: row,
        yookassa: finalYk.payment_method,
        billing,
      },
      null,
      2
    )
  );

  if (skipRenewal) {
    console.log('\nPost-checkout proof complete. Run capture script for UI screenshots.');
    return;
  }

  // ── Step 8: Simulate period end + scheduler ──
  const periodEnd = row.next_charge_at!;
  const past = new Date(periodEnd.getTime() + 60_000);
  const expiresBefore = row.expires_at!.toISOString();
  const nextChargeBefore = row.next_charge_at!.toISOString();

  await query(
    `UPDATE subscriptions
     SET expires_at = $2, next_charge_at = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [row.id, periodEnd]
  );

  const chargeReadyPast = await listChargeReadySubscriptionIds(past);
  log('8. listChargeReadySubscriptionIds (simulated period end)', {
    subscriptionId: row.id,
    included: chargeReadyPast.includes(row.id),
    simulatedNow: past.toISOString(),
  });

  if (!chargeReadyPast.includes(row.id)) {
    throw new Error('Subscription not charge-ready after simulated period end');
  }

  const cronSecret = process.env.SUBSCRIPTION_CRON_SECRET?.trim();
  if (!cronSecret) {
    throw new Error('SUBSCRIPTION_CRON_SECRET not in .env — cannot invoke production scheduler');
  }

  const schedulerRes = await fetch(
    `${PROD_BASE}/.netlify/functions/scheduled-subscription-renewals`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ next_run: new Date().toISOString() }),
    }
  );
  const schedulerJson = (await schedulerRes.json()) as Json;
  log('9. Production scheduler run', {
    status: schedulerRes.status,
    body: schedulerJson,
  });

  if (schedulerRes.status !== 200) {
    throw new Error(`Scheduler failed: ${schedulerRes.status}`);
  }

  const subAfter = await query<{
    status: string;
    payment_method_id: string | null;
    next_charge_at: Date | null;
    expires_at: Date | null;
  }>(
    `SELECT status, payment_method_id, next_charge_at, expires_at
     FROM subscriptions WHERE user_id = $1::uuid`,
    [userId]
  );
  const afterRow = subAfter.rows[0]!;

  const renewalPayments = await query<{
    kind: string;
    status: string;
    provider_payment_id: string | null;
    created_at: Date;
  }>(
    `SELECT kind, status, provider_payment_id, created_at
     FROM subscription_payments WHERE user_id = $1::uuid ORDER BY created_at`,
    [userId]
  );

  log('10. Post-renewal DB', {
    expires_at_before: expiresBefore,
    next_charge_at_before: nextChargeBefore,
    expires_at_after: afterRow.expires_at?.toISOString() ?? null,
    next_charge_at_after: afterRow.next_charge_at?.toISOString() ?? null,
    datesChanged:
      afterRow.expires_at!.toISOString() !== expiresBefore ||
      afterRow.next_charge_at!.toISOString() !== nextChargeBefore,
    renewalPayments: renewalPayments.rows,
  });

  const archiveAfter = await api('/api/my-archive', { token });
  const billingAfter = ((archiveAfter.json.data ?? archiveAfter.json) as Json).billing as Json;

  log('11. /api/my-archive after renewal', {
    nextChargeAt: billingAfter?.nextChargeAt ?? null,
    hasPremiumAccess: billingAfter?.hasPremiumAccess ?? null,
  });

  writeFileSync(
    resolve(OUT_DIR, 'post-renewal-facts.json'),
    JSON.stringify(
      {
        scheduler: schedulerJson,
        subscriptionAfter: afterRow,
        renewalPayments: renewalPayments.rows,
        billingAfter,
      },
      null,
      2
    )
  );

  console.log(`\nProof artifacts: ${OUT_DIR}`);
  console.log(`Login: ${email} / ${PROOF_PASSWORD}`);
}

main().catch((e) => {
  console.error('\nPROOF FAILED:', e);
  process.exit(1);
});
