/**
 * Pre-flight for scripts/prod-autorenew-e2e-proof.ts, which registers a user, creates a YooKassa
 * checkout and writes to the production DB. It never invokes the remote Netlify scheduler.
 *
 * Opt-in alone is not enough: the operator must confirm the HTTP target (PRODUCTION_AUTORENEW_E2E_BASE_URL)
 * and DB host. Every check runs before the first network call, file write or SQL statement.
 *
 * ALLOW_PRODUCTION_AUTORENEW_E2E=true authorizes running the proof — it does NOT authorize real
 * money movement: local YooKassa keys must be test keys (test_…). Whether the deployed site uses a
 * test shop must be inferred from the payment object's `test` field when present.
 */

import { isLocalDatabaseHost, resolveDatabaseUrlHost } from './local-database-guard';

export const PRODUCTION_AUTORENEW_E2E_OPT_IN = 'ALLOW_PRODUCTION_AUTORENEW_E2E';
export const PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR = 'PRODUCTION_AUTORENEW_E2E_BASE_URL';
export const PRODUCTION_AUTORENEW_E2E_DB_HOST_VAR = 'PRODUCTION_AUTORENEW_E2E_DATABASE_HOST';

const ALLOWED_FLAGS = new Set(['--skip-payment', '--simulate-period-end']);

export type ProductionAutorenewE2eConfig = {
  baseUrl: string;
  databaseHost: string;
  skipPayment: boolean;
  simulatePeriodEnd: boolean;
};

export type ProductionAutorenewE2eCheck =
  | { ok: true; config: ProductionAutorenewE2eConfig }
  | { ok: false; reasons: string[] };

function isIpAddressHost(host: string): boolean {
  if (host.startsWith('[') && host.endsWith(']')) return true;
  if (host.includes(':')) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function validateProductionAutorenewE2eBaseUrl(
  raw: string | undefined
): { ok: true; origin: string } | { ok: false; reason: string } {
  if (!raw?.trim()) {
    return { ok: false, reason: `${PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR} is not set` };
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: `${PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR} is not a valid URL` };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: `${PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR} must use https` };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      reason: `${PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR} must not include credentials`,
    };
  }
  if (url.search || url.hash) {
    return {
      ok: false,
      reason: `${PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR} must not include query or hash`,
    };
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    return {
      ok: false,
      reason: `${PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR} must not include a path`,
    };
  }

  const host = url.hostname.toLowerCase();
  if (isLocalDatabaseHost(host) || isIpAddressHost(host)) {
    return {
      ok: false,
      reason: `${PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR} must not point at localhost, a local domain, or an IP address`,
    };
  }

  return { ok: true, origin: url.origin };
}

export function checkProductionAutorenewE2eEnvironment(params: {
  argv: string[];
  env?: Record<string, string | undefined>;
}): ProductionAutorenewE2eCheck {
  const env = params.env ?? process.env;
  const reasons: string[] = [];

  if (env[PRODUCTION_AUTORENEW_E2E_OPT_IN] !== 'true') {
    reasons.push(`${PRODUCTION_AUTORENEW_E2E_OPT_IN} must be exactly "true"`);
  }

  const unknownFlags = params.argv.filter((arg) => !ALLOWED_FLAGS.has(arg));
  if (unknownFlags.length > 0) {
    reasons.push(
      `unknown arguments (${unknownFlags.length}); allowed: ${[...ALLOWED_FLAGS].join(', ')}`
    );
  }
  const skipPayment = params.argv.includes('--skip-payment');
  const simulatePeriodEnd = params.argv.includes('--simulate-period-end');
  if (skipPayment && simulatePeriodEnd) {
    reasons.push('--simulate-period-end cannot be combined with --skip-payment');
  }

  const baseUrlCheck = validateProductionAutorenewE2eBaseUrl(
    env[PRODUCTION_AUTORENEW_E2E_BASE_URL_VAR]
  );
  let baseUrl: string | null = null;
  if (!baseUrlCheck.ok) {
    reasons.push(baseUrlCheck.reason);
  } else {
    baseUrl = baseUrlCheck.origin;
  }

  let databaseHost: string | null = null;
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    reasons.push('DATABASE_URL is not set');
  } else {
    const resolved = resolveDatabaseUrlHost(databaseUrl);
    if (resolved.host === null) {
      reasons.push(`cannot verify DATABASE_URL host: ${resolved.reason}`);
    } else if (isLocalDatabaseHost(resolved.host)) {
      reasons.push('DATABASE_URL points at a local database, not the production target');
    } else {
      databaseHost = resolved.host;
      const confirmedHost = env[PRODUCTION_AUTORENEW_E2E_DB_HOST_VAR]?.trim().toLowerCase();
      if (!confirmedHost) {
        reasons.push(`${PRODUCTION_AUTORENEW_E2E_DB_HOST_VAR} is not set`);
      } else if (confirmedHost !== databaseHost) {
        reasons.push(
          `${PRODUCTION_AUTORENEW_E2E_DB_HOST_VAR} does not match the DATABASE_URL host`
        );
      }
    }
  }

  const devPaymentMode = env.DEV_PAYMENT_MODE;
  if (devPaymentMode !== undefined && devPaymentMode !== '' && devPaymentMode !== 'false') {
    reasons.push('DEV_PAYMENT_MODE must be unset or "false" (dev billing_origin filter)');
  }

  const shopId = env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) {
    reasons.push('YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY are not set');
  } else if (!secretKey.startsWith('test_')) {
    reasons.push('YOOKASSA_SECRET_KEY is not a test key — real money movement is not allowed');
  }

  if (reasons.length > 0 || databaseHost === null || baseUrl === null) {
    return { ok: false, reasons };
  }
  return {
    ok: true,
    config: { baseUrl, databaseHost, skipPayment, simulatePeriodEnd },
  };
}

export function assertProductionAutorenewE2eEnvironment(params: {
  argv: string[];
}): ProductionAutorenewE2eConfig {
  const check = checkProductionAutorenewE2eEnvironment(params);
  if (!check.ok) {
    throw new Error(`prod-autorenew-e2e-proof refuses to run:\n- ${check.reasons.join('\n- ')}`);
  }
  return check.config;
}

/** Keys that must never appear in E2E logs or JSON artifacts. */
export const PRODUCTION_AUTORENEW_E2E_FORBIDDEN_OUTPUT_KEYS = new Set([
  'email',
  'password',
  'token',
  'confirmationUrl',
  'confirmation_url',
  'paymentId',
  'payment_id',
  'provider_payment_id',
  'payment_method_id',
  'jwt',
  'authorization',
  'secret',
  'SUBSCRIPTION_CRON_SECRET',
  'raw',
]);

export function assertYooKassaPaymentTestMode(payment: { test?: unknown }): void {
  if (!('test' in payment)) {
    throw new Error(
      'YooKassa payment object has no "test" field — cannot verify the shop is in test mode from this response'
    );
  }
  if (payment.test !== true) {
    throw new Error('YooKassa payment.test is not true — refusing further payment actions');
  }
}
