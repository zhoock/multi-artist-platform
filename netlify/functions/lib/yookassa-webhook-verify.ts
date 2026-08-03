/**
 * Верификация HTTP-уведомлений YooKassa (см. «Notification authentication» в документации):
 * - опционально: IP отправителя из списка YooMoney;
 * - обязательно: GET платежа API с shopId:secretKey продавца и сопоставление статуса/суммы с телом уведомления.
 */

import type { HandlerEvent } from '@netlify/functions';
import { getErrorMessage } from './error-utils';

/** Диапазоны и одиночные IP из https://yookassa.ru/developers/using-api/webhooks */
const YOOKASSA_IPV4_RULES: Array<{ cidr?: string; host?: string }> = [
  { cidr: '185.71.76.0/27' },
  { cidr: '185.71.77.0/27' },
  { cidr: '77.75.153.0/25' },
  { cidr: '77.75.154.128/25' },
  { host: '77.75.156.11' },
  { host: '77.75.156.35' },
];

/** IPv6: 2a02:5180::/32 */
const YOOKASSA_IPV6_32_PREFIX = '2a02:5180';

export function getClientIpFromEvent(event: HandlerEvent): string | null {
  const xf = (event.headers['x-forwarded-for'] || event.headers['X-Forwarded-For']) as
    | string
    | undefined;
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    (event.headers['x-nf-client-connection-ip'] as string | undefined) ||
    (event.headers['true-client-ip'] as string | undefined) ||
    (event.headers['client-ip'] as string | undefined) ||
    null
  );
}

function ipv4ToUint(ip: string): number | null {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [network, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToUint(ip);
  const netInt = ipv4ToUint(network);
  if (ipInt === null || netInt === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function ipv6InYookassaRange32(ip: string): boolean {
  const n = ip.toLowerCase().trim();
  if (!n.includes(':')) return false;
  // Упрощённая проверка /32: первые два hexteta 2a02 и 5180
  const head = n.split('::')[0];
  if (!head) return n.startsWith(`${YOOKASSA_IPV6_32_PREFIX}:`) || n === YOOKASSA_IPV6_32_PREFIX;
  const parts = head.split(':').filter(Boolean);
  if (parts.length >= 2) {
    return parts[0] === '2a02' && parts[1] === '5180';
  }
  return n.startsWith(`${YOOKASSA_IPV6_32_PREFIX}:`);
}

/**
 * Проверка IP источника уведомления (см. YooKassa «Notification authentication»).
 * По умолчанию отсутствие IP считается невалидным (нет «тихого» пропуска).
 * SKIP_YOOKASSA_WEBHOOK_IP_CHECK или allowUnknownIp (только локальная разработка) — ослабления.
 */
export function isNotificationIpAllowed(
  clientIp: string | null,
  options: { skip: boolean; allowUnknownIp?: boolean }
): boolean {
  if (options.skip) return true;
  const trimmed = clientIp?.trim();
  if (!trimmed) {
    return options.allowUnknownIp === true;
  }
  const ip = trimmed;

  if (ip.includes(':')) {
    return ipv6InYookassaRange32(ip);
  }

  for (const rule of YOOKASSA_IPV4_RULES) {
    if (rule.host && ip === rule.host) return true;
    if (rule.cidr && ipv4InCidr(ip, rule.cidr)) return true;
  }
  return false;
}

export interface YooKassaPaymentApiShape {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  metadata?: Record<string, unknown>;
  paid?: boolean;
  cancelled_at?: string;
  captured_at?: string;
}

export async function fetchPaymentFromYooKassaApi(
  paymentId: string,
  shopId: string,
  secretKey: string
): Promise<
  { ok: true; payment: YooKassaPaymentApiShape } | { ok: false; status: number; error: string }
> {
  const base = (process.env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3/payments').replace(
    /\/$/,
    ''
  );
  const url = `${base}/${paymentId}`;
  const auth = Buffer.from(`${shopId.trim()}:${secretKey.trim()}`).toString('base64');

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        status: res.status,
        error: text.slice(0, 200) || `HTTP ${res.status}`,
      };
    }

    const payment = (await res.json()) as YooKassaPaymentApiShape;
    if (!payment?.id || !payment?.status) {
      return { ok: false, status: 502, error: 'Invalid payment JSON from YooKassa' };
    }
    return { ok: true, payment };
  } catch (e: unknown) {
    return { ok: false, status: 0, error: getErrorMessage(e) || 'fetch failed' };
  }
}

/** Ожидаемый статус объекта платежа для данного event (см. документацию). */
export function expectedStatusForEvent(eventName: string): string | null {
  if (eventName === 'payment.succeeded') return 'succeeded';
  if (eventName === 'payment.canceled') return 'canceled';
  if (eventName === 'payment.waiting_for_capture') return 'waiting_for_capture';
  return null;
}

export function amountsEqual(a: string, b: string): boolean {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.trim() === b.trim();
  return Math.abs(na - nb) < 0.001;
}

export function metaString(
  meta: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const v = meta?.[key];
  if (v === undefined || v === null) return undefined;
  return String(v);
}
