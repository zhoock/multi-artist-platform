// netlify/functions/yookassa-health.ts
/**
 * Health multi-tenant платёжного контура: без глобальных YooKassa shop/secret в ENV.
 *
 * Проверяется:
 * - Доступность host YooKassa API (неаутентифицированный HTTP-probe, без платежей и без merchant-кредов).
 * - Наличие ENCRYPTION_KEY — нужен для хранения секретов продавцов в БД.
 * - Ping PostgreSQL (DATABASE_URL).
 * - Опционально: статистика активных настроек ЮKassa продавцов (`?includeTenantStats=true`).
 *
 * Не использует: YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, реальные платежи, platform-wide merchant.
 *
 * GET /api/yookassa-health
 * GET /api/yookassa-health?includeTenantStats=true
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { getErrorMessage } from './lib/error-utils';
import { pingDatabase, query } from './lib/db';
import { isEncryptionKeyConfigured } from './lib/crypto';

type CheckResult = {
  ok: boolean;
  /** Пояснение при ok: false или нестандартном ok: true */
  detail?: string;
  httpStatus?: number;
  error?: string;
};

export interface YookassaHealthResponse {
  success: boolean;
  /** Итог для мониторинга: все обязательные проверки прошли */
  status: 'healthy' | 'degraded' | 'unhealthy';
  architecture: 'multi_tenant_per_seller';
  message: string;
  checks: {
    yookassaApiHost: CheckResult;
    database: CheckResult;
    /** Без ключа нельзя расшифровать secret_key_encrypted продавцов */
    sellerSecretsEncryption: CheckResult;
  };
  tenantStats?: {
    activeYookassaSellersWithCredentials: number;
  };
  /** Если запросили includeTenantStats, но COUNT не выполнился */
  tenantStatsError?: string;
  meta: {
    nodeEnv?: string;
    netlifyDev?: string;
    yookassaApiUrl: string;
    note: string;
  };
  error?: string;
}

function parseIncludeTenantStats(event: HandlerEvent): boolean {
  const v = event.queryStringParameters?.includeTenantStats?.toLowerCase()?.trim();
  return v === '1' || v === 'true' || v === 'yes';
}

async function probeYookassaApi(apiUrl: string): Promise<CheckResult> {
  try {
    const testUrl = `${apiUrl.replace(/\/$/, '')}?limit=1`;
    const res = await fetch(testUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const ok = Number.isFinite(res.status) && res.status > 0;
    if (!ok) {
      return { ok: false, httpStatus: res.status, error: 'invalid HTTP status' };
    }
    const expectedUnauth = res.status === 401 || res.status === 403;
    return {
      ok: true,
      httpStatus: res.status,
      detail: expectedUnauth
        ? 'reachable (401/403 without merchant auth — expected)'
        : `reachable (HTTP ${res.status})`,
    };
  } catch (e: unknown) {
    return { ok: false, error: getErrorMessage(e) || 'fetch failed' };
  }
}

export const handler: Handler = async (
  event: HandlerEvent,
  _context: HandlerContext
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed. Use GET.',
      }),
    };
  }

  try {
    const apiUrl = process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments';
    const includeTenantStats = parseIncludeTenantStats(event);

    const encryptionKeyPresent = isEncryptionKeyConfigured();
    const sellerSecretsEncryption: CheckResult = encryptionKeyPresent
      ? {
          ok: true,
          detail: 'ENCRYPTION_KEY set (decrypt seller YooKassa secrets from DB)',
        }
      : {
          ok: false,
          error: 'ENCRYPTION_KEY missing — tenant payment secrets cannot be used',
        };

    const [yookassaApiHost, dbPing] = await Promise.all([probeYookassaApi(apiUrl), pingDatabase()]);

    const database: CheckResult = dbPing.skippedReason
      ? {
          ok: false,
          error: dbPing.error,
          detail: dbPing.skippedReason,
        }
      : dbPing.ok
        ? { ok: true, detail: 'SELECT 1 ok' }
        : { ok: false, error: dbPing.error };

    let tenantStats: YookassaHealthResponse['tenantStats'];
    let tenantStatsError: string | undefined;
    if (includeTenantStats && database.ok) {
      try {
        const r = await query<{ n: string }>(
          `SELECT COUNT(*)::text AS n
           FROM user_payment_settings
           WHERE provider = 'yookassa'
             AND is_active = true
             AND shop_id IS NOT NULL
             AND btrim(shop_id) <> ''
             AND secret_key_encrypted IS NOT NULL
             AND btrim(secret_key_encrypted) <> ''`
        );
        tenantStats = {
          activeYookassaSellersWithCredentials: Number.parseInt(r.rows[0]?.n || '0', 10),
        };
      } catch (e: unknown) {
        tenantStatsError = getErrorMessage(e) || 'tenant stats query failed';
      }
    }

    let status: YookassaHealthResponse['status'] = 'healthy';
    let message =
      'Multi-tenant payment infra OK (API host, DB, encryption for seller secrets). Merchant credentials live in DB only.';

    if (!yookassaApiHost.ok || !database.ok) {
      status = 'unhealthy';
      message = 'Critical dependency failed (YooKassa API reachability or database).';
    } else if (!sellerSecretsEncryption.ok) {
      status = 'degraded';
      message =
        'API and DB reachable, but ENCRYPTION_KEY missing — cannot use stored seller YooKassa secrets.';
    }

    const payload: YookassaHealthResponse = {
      success: true,
      status,
      architecture: 'multi_tenant_per_seller',
      message,
      checks: {
        yookassaApiHost,
        database,
        sellerSecretsEncryption,
      },
      ...(tenantStats ? { tenantStats } : {}),
      ...(tenantStatsError ? { tenantStatsError } : {}),
      meta: {
        nodeEnv: process.env.NODE_ENV,
        netlifyDev: process.env.NETLIFY_DEV,
        yookassaApiUrl: apiUrl,
        note: 'No platform-wide YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY. Each seller uses user_payment_settings in PostgreSQL.',
      },
    };

    const httpStatus = status === 'unhealthy' ? 503 : 200;

    return {
      statusCode: httpStatus,
      headers,
      body: JSON.stringify(payload),
    };
  } catch (error: unknown) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        status: 'unhealthy' as const,
        error: getErrorMessage(error) || 'Health check failed',
      }),
    };
  }
};
