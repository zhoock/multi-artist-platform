-- Premium autoprenewal schema (PR-1): additive columns + extended status enum.
-- Behavior unchanged until SUBSCRIPTION_AUTO_RENEW_ENABLED=true and later PRs wire scheduler/UI.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS next_charge_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewal_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_plan TEXT,
  ADD COLUMN IF NOT EXISTS first_failed_at TIMESTAMPTZ;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (
    status IN (
      'active',
      'cancel_at_period_end',
      'past_due',
      'canceled',
      'expired',
      'trial',
      'paused'
    )
  );

COMMENT ON COLUMN subscriptions.payment_method_id IS 'YooKassa payment_method.id for autopayments';
COMMENT ON COLUMN subscriptions.next_charge_at IS 'When scheduler may create the next charge attempt';
COMMENT ON COLUMN subscriptions.renewal_attempt_count IS 'Failed renewal attempts in the current billing cycle';
COMMENT ON COLUMN subscriptions.scheduled_plan IS 'Downgrade target plan slug effective at next renewal';
COMMENT ON COLUMN subscriptions.first_failed_at IS 'Start of grace/dunning window after first failed renewal';

COMMENT ON COLUMN subscriptions.status IS
  'active | cancel_at_period_end | past_due | canceled (legacy) | expired | trial | paused';
