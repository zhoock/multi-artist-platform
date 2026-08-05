-- PR-9: masked payment method label for BillingSnapshot.paymentMethodTitle

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_method_title TEXT;

COMMENT ON COLUMN subscriptions.payment_method_title IS
  'Display-only masked card label (e.g. Visa •••• 4242). Never store full PAN.';
