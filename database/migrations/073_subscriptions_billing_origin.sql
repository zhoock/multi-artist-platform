-- Isolate dev/test subscriptions from production YooKassa fulfillment (shared DB).
-- billing_origin is set on first subscription INSERT and never changed on renewal/resubscribe.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_origin TEXT NOT NULL DEFAULT 'production'
  CONSTRAINT subscriptions_billing_origin_check CHECK (billing_origin IN ('production', 'dev'));

-- Backfill from earliest succeeded payment per user (includes dev-marked initial checkouts).
WITH first_succeeded AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    COALESCE(raw_last_event->>'devPaymentMode', 'false') = 'true' AS is_dev
  FROM subscription_payments
  WHERE status = 'succeeded'
  ORDER BY user_id, created_at ASC
)
UPDATE subscriptions s
SET
  billing_origin = CASE WHEN fs.is_dev THEN 'dev' ELSE 'production' END,
  updated_at = CURRENT_TIMESTAMP
FROM first_succeeded fs
WHERE s.user_id = fs.user_id;

CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_origin_scheduler
  ON subscriptions (billing_origin, status, next_charge_at)
  WHERE payment_method_id IS NOT NULL;
