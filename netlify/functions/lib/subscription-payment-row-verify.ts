/**
 * PR-10.2 — Cross-check YooKassa webhook metadata against subscription_payments row.
 */

import {
  normalizeSubscriptionPlanSlug,
  PREMIUM_SUBSCRIPTION_PRODUCT_TYPE,
  type SubscriptionPaymentRow,
} from './subscription-billing';
import { isInitialSubscriptionPaymentKind } from './subscription-fulfillment';
import { isRebindSubscriptionPaymentKind } from './subscription-rebind-fulfillment';

export type SubscriptionPaymentRowVerifyResult =
  | { ok: true; row: SubscriptionPaymentRow }
  | { ok: false; reason: string };

function normalizeKind(kind: string | null | undefined): string | null {
  const trimmed = kind?.trim();
  return trimmed || null;
}

function metadataKindMatchesRow(
  metadataKind: string | null | undefined,
  rowKind: string | null | undefined
): boolean {
  const row = normalizeKind(rowKind);
  const meta = normalizeKind(metadataKind);
  if (!row) return true;
  if (!meta) return isInitialSubscriptionPaymentKind(null);
  return row === meta;
}

/**
 * Validates that a provider payment corresponds to an existing subscription_payments row
 * and that metadata matches the row (user, kind, plan, amount). DB row is authoritative for routing.
 */
export function verifySubscriptionPaymentRowForWebhook(params: {
  row: SubscriptionPaymentRow;
  metadataUserId: string;
  metadataProductType: string | null | undefined;
  metadataKind: string | null | undefined;
  metadataPlan: string | null | undefined;
  amountValue: string;
  currency: string;
  amountsEqual: (a: string, b: string) => boolean;
}): SubscriptionPaymentRowVerifyResult {
  const {
    row,
    metadataUserId,
    metadataProductType,
    metadataKind,
    metadataPlan,
    amountValue,
    currency,
    amountsEqual,
  } = params;

  if (row.user_id !== metadataUserId) {
    return { ok: false, reason: 'userId mismatch between metadata and payment row' };
  }

  if (metadataProductType !== PREMIUM_SUBSCRIPTION_PRODUCT_TYPE) {
    return { ok: false, reason: 'productType mismatch' };
  }

  if (!metadataKindMatchesRow(metadataKind, row.kind)) {
    return { ok: false, reason: 'kind mismatch between metadata and payment row' };
  }

  const isRebind =
    isRebindSubscriptionPaymentKind(row.kind) || isRebindSubscriptionPaymentKind(metadataKind);

  if (!isRebind) {
    const rowPlan = normalizeSubscriptionPlanSlug(row.plan);
    const metaPlan = normalizeSubscriptionPlanSlug(metadataPlan);
    if (rowPlan && metaPlan && rowPlan !== metaPlan) {
      return { ok: false, reason: 'plan mismatch between metadata and payment row' };
    }
  }

  const rowAmount = Number.parseFloat(row.amount).toFixed(2);
  if (
    !amountsEqual(rowAmount, amountValue) ||
    row.currency.trim().toUpperCase() !== currency.trim().toUpperCase()
  ) {
    return { ok: false, reason: 'amount or currency mismatch between row and provider payment' };
  }

  return { ok: true, row };
}
