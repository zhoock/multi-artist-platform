/**
 * Canonical YooKassa renewal POST body + stable hash (PR-3a).
 * Frozen body is stored on subscription_payments.raw_last_event at attempt creation.
 */

import { createHash } from 'node:crypto';

import {
  buildRenewalSubscriptionPaymentPayload,
  RENEWAL_SUBSCRIPTION_PAYMENT_ID_METADATA_KEY,
  type BuildRenewalSubscriptionPaymentPayloadParams,
} from './subscription-yookassa';

export { RENEWAL_SUBSCRIPTION_PAYMENT_ID_METADATA_KEY };

export const RENEWAL_YOOKASSA_CREATE_PAYLOAD_RAW_KEY = 'renewalYookassaCreatePayload';

export type RenewalYookassaCreatePayload = Record<string, unknown>;

export function buildRenewalYookassaCreatePayload(
  params: BuildRenewalSubscriptionPaymentPayloadParams
): RenewalYookassaCreatePayload {
  return buildRenewalSubscriptionPaymentPayload(params) as RenewalYookassaCreatePayload;
}

function sortJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortJsonValue(record[key]);
  }
  return sorted;
}

/** Deterministic JSON for hashing — must match the object sent in POST body. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function hashRenewalRequestPayload(payload: RenewalYookassaCreatePayload): string {
  return createHash('sha256').update(canonicalJsonStringify(payload), 'utf8').digest('hex');
}

export function readRenewalYookassaCreatePayload(
  rawLastEvent: unknown
): RenewalYookassaCreatePayload | null {
  if (rawLastEvent == null || typeof rawLastEvent !== 'object') {
    return null;
  }
  const stored = (rawLastEvent as Record<string, unknown>)[RENEWAL_YOOKASSA_CREATE_PAYLOAD_RAW_KEY];
  if (stored == null || typeof stored !== 'object' || Array.isArray(stored)) {
    return null;
  }
  return stored as RenewalYookassaCreatePayload;
}

export type VerifyRenewalRequestPayloadHashResult = 'ok' | 'missing_hash' | 'mismatch';

export function verifyRenewalRequestPayloadHash(
  payload: RenewalYookassaCreatePayload,
  expectedHash: string | null | undefined
): VerifyRenewalRequestPayloadHashResult {
  const trimmed = expectedHash?.trim();
  if (!trimmed) {
    return 'missing_hash';
  }
  const actual = hashRenewalRequestPayload(payload);
  if (actual !== trimmed) {
    return 'mismatch';
  }
  return 'ok';
}

export function renewalPayloadAmountValue(payload: RenewalYookassaCreatePayload): string | null {
  const amount = payload.amount;
  if (amount == null || typeof amount !== 'object' || Array.isArray(amount)) {
    return null;
  }
  const value = (amount as Record<string, unknown>).value;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function renewalPayloadCurrency(payload: RenewalYookassaCreatePayload): string | null {
  const amount = payload.amount;
  if (amount == null || typeof amount !== 'object' || Array.isArray(amount)) {
    return null;
  }
  const currency = (amount as Record<string, unknown>).currency;
  return typeof currency === 'string' && currency.trim() ? currency.trim() : null;
}

export function renewalPayloadPlanSlug(payload: RenewalYookassaCreatePayload): string | null {
  const metadata = payload.metadata;
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const plan = (metadata as Record<string, unknown>).plan;
  return typeof plan === 'string' && plan.trim() ? plan.trim() : null;
}

/** Embeds internal row id into frozen renewal POST metadata (PR-4). */
export function embedRenewalSubscriptionPaymentIdInPayload(
  payload: RenewalYookassaCreatePayload,
  subscriptionPaymentId: string
): RenewalYookassaCreatePayload {
  const id = subscriptionPaymentId.trim();
  const metadata = payload.metadata;
  const baseMeta =
    metadata != null && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return {
    ...payload,
    metadata: {
      ...baseMeta,
      [RENEWAL_SUBSCRIPTION_PAYMENT_ID_METADATA_KEY]: id,
    },
  };
}

export function readRenewalSubscriptionPaymentIdFromPayload(
  payload: RenewalYookassaCreatePayload
): string | null {
  const metadata = payload.metadata;
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const id = (metadata as Record<string, unknown>)[RENEWAL_SUBSCRIPTION_PAYMENT_ID_METADATA_KEY];
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}
