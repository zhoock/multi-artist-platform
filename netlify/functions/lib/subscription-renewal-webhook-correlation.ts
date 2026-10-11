/**
 * PR-4 — Resolve subscription_payments row for verified YooKassa premium webhooks (renewal correlation).
 */

import {
  getSubscriptionPaymentByInternalId,
  getSubscriptionPaymentByProviderId,
  linkProviderPaymentIdToSubscriptionPaymentRow,
  type SubscriptionPaymentRow,
} from './subscription-billing';
import { SUBSCRIPTION_PAYMENT_KIND_RENEWAL } from './subscription-yookassa';
import { logSubscriptionEvent, SUBSCRIPTION_LOG_EVENTS } from './subscription-observability';

const UUID_V4ISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResolveSubscriptionPaymentRowForWebhookResult =
  | {
      ok: true;
      row: SubscriptionPaymentRow;
      correlation: 'renewal_metadata' | 'provider_payment_id';
      providerIdLinked: boolean;
    }
  | { ok: false; reason: string };

function isUuid(value: string): boolean {
  return UUID_V4ISH.test(value.trim());
}

function logRenewalCorrelationSkipped(
  reason: string,
  fields: Record<string, string | undefined> = {}
) {
  logSubscriptionEvent(
    SUBSCRIPTION_LOG_EVENTS.WEBHOOK_SKIPPED,
    { reason, correlation: 'renewal', ...fields },
    'warn'
  );
}

/**
 * After YooKassa GET verification, locate the internal payment row.
 * Renewal: subscriptionPaymentId from verified API metadata only (no provider-only fallback).
 * Other kinds: provider_payment_id index.
 */
export async function resolveSubscriptionPaymentRowForVerifiedWebhook(params: {
  providerPaymentId: string;
  userId: string;
  metadataKind: string | null | undefined;
  metadataSubscriptionPaymentId: string | null | undefined;
}): Promise<ResolveSubscriptionPaymentRowForWebhookResult> {
  const providerPaymentId = params.providerPaymentId.trim();
  const userId = params.userId.trim();
  const kind = params.metadataKind?.trim() ?? null;
  const metadataPaymentId = params.metadataSubscriptionPaymentId?.trim() ?? null;

  const isRenewal = kind === SUBSCRIPTION_PAYMENT_KIND_RENEWAL;
  const metadataIdValid = metadataPaymentId != null && isUuid(metadataPaymentId);

  if (isRenewal) {
    if (metadataPaymentId && !metadataIdValid) {
      logRenewalCorrelationSkipped('renewal_metadata_subscription_payment_id_invalid');
      return { ok: false, reason: 'invalid subscriptionPaymentId in renewal metadata' };
    }

    if (!metadataIdValid) {
      logRenewalCorrelationSkipped('renewal_metadata_subscription_payment_id_missing');
      return {
        ok: false,
        reason: 'renewal webhook requires subscriptionPaymentId in verified metadata',
      };
    }

    const row = await getSubscriptionPaymentByInternalId(metadataPaymentId!, userId);
    if (!row) {
      logRenewalCorrelationSkipped('renewal_payment_row_not_found_by_metadata', {
        subscriptionPaymentIdSuffix: `…${metadataPaymentId!.slice(-6)}`,
      });
      return {
        ok: false,
        reason: 'renewal payment row not found for metadata subscriptionPaymentId',
      };
    }

    if (row.kind?.trim() !== SUBSCRIPTION_PAYMENT_KIND_RENEWAL) {
      logRenewalCorrelationSkipped('renewal_metadata_wrong_payment_kind', {
        subscriptionPaymentId: row.id,
        rowKind: row.kind ?? undefined,
      });
      return { ok: false, reason: 'metadata subscriptionPaymentId is not a renewal payment row' };
    }

    if (row.id !== metadataPaymentId) {
      logRenewalCorrelationSkipped('renewal_metadata_row_id_mismatch');
      return { ok: false, reason: 'metadata subscriptionPaymentId mismatch' };
    }

    const linked = await linkProviderPaymentIdToSubscriptionPaymentRow({
      subscriptionPaymentId: row.id,
      userId,
      providerPaymentId,
    });

    if (linked === 'provider_id_claimed_by_other_row') {
      logRenewalCorrelationSkipped('renewal_provider_id_claimed_by_other_row', {
        subscriptionPaymentId: row.id,
        providerPaymentIdSuffix: `…${providerPaymentId.slice(-6)}`,
      });
      return {
        ok: false,
        reason: 'provider payment id already linked to another subscription payment',
      };
    }

    if (linked === 'row_provider_mismatch') {
      logRenewalCorrelationSkipped('renewal_row_provider_id_mismatch', {
        subscriptionPaymentId: row.id,
        providerPaymentIdSuffix: `…${providerPaymentId.slice(-6)}`,
      });
      return { ok: false, reason: 'subscription payment row provider_payment_id conflict' };
    }

    const refreshed = await getSubscriptionPaymentByInternalId(row.id, userId);
    if (!refreshed) {
      return { ok: false, reason: 'renewal payment row missing after provider link' };
    }

    return {
      ok: true,
      row: refreshed,
      correlation: 'renewal_metadata',
      providerIdLinked: linked === 'attached',
    };
  }

  const byProvider = await getSubscriptionPaymentByProviderId(providerPaymentId);
  if (!byProvider) {
    return { ok: false, reason: 'subscription payment row not found' };
  }

  return {
    ok: true,
    row: byProvider,
    correlation: 'provider_payment_id',
    providerIdLinked: false,
  };
}
