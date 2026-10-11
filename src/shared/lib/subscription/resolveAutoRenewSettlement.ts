import type { BillingSnapshot } from '@shared/api/billing';

import {
  deriveAutoRenewSettlementState,
  type AutoRenewSettlementState,
} from './deriveAutoRenewSettlement';

/** Prefer server-provided settlement flags; fall back to client derivation for older snapshots. */
export function resolveAutoRenewSettlement(
  billing: BillingSnapshot,
  now: Date = new Date(),
  options: { hasUnresolvedRenewal?: boolean } = {}
): AutoRenewSettlementState {
  if (typeof billing.autoRenewSettlementPending === 'boolean') {
    return {
      pending: billing.autoRenewSettlementPending,
      chargeDueAt:
        billing.renewalChargeDueAt ??
        deriveAutoRenewSettlementState(billing, { now, ...options }).chargeDueAt,
    };
  }

  return deriveAutoRenewSettlementState(billing, { now, ...options });
}
