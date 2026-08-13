-- Stale rebind guard: generation counter incremented on payment-method unlink.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_method_epoch INTEGER NOT NULL DEFAULT 0;

UPDATE subscriptions
SET payment_method_epoch = 1
WHERE payment_method_id IS NULL
  AND next_charge_at IS NULL
  AND payment_method_epoch = 0;

COMMENT ON COLUMN subscriptions.payment_method_epoch IS
  'Incremented on payment-method unlink, rebind checkout captures epoch at POST';
