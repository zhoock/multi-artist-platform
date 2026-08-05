-- PR-3: subscription payment kind for checkout audit (initial checkout only in this PR).

ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'initial';

ALTER TABLE subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_kind_check;

ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_kind_check
  CHECK (kind IN ('initial', 'renewal', 'upgrade', 'rebind', 'plan_change'));

COMMENT ON COLUMN subscription_payments.kind IS
  'initial | renewal | upgrade | rebind | plan_change — only initial used until PR-7+';
