-- Dev payment mode marker (mirrors payments.raw_last_event for album checkout).

ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS raw_last_event JSONB;

COMMENT ON COLUMN subscription_payments.raw_last_event IS 'Last provider event JSON — devPaymentMode marker for local checkout without YooKassa';
