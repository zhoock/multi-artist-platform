/** Named overlay variants for Collection billing (PR-8). */
export const BILLING_OVERLAY = {
  PRE_BILLING: 'pre_billing',
  DOWNGRADE_SLOTS: 'downgrade_slots',
} as const;

export type BillingOverlay = (typeof BILLING_OVERLAY)[keyof typeof BILLING_OVERLAY];

export const BILLING_OVERLAYS = Object.values(BILLING_OVERLAY);
