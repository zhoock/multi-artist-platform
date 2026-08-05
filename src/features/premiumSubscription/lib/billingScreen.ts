export const BILLING_SCREENS = [
  'NONE',
  'ACTIVE',
  'CANCELLED',
  'PAYMENT_FAILED',
  'EXPIRED',
] as const;

export type BillingScreen = (typeof BILLING_SCREENS)[number];
