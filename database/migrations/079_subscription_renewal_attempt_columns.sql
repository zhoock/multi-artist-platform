-- PR-1: additive renewal attempt columns on subscription_payments (no behavior change).
-- No indexes, UNIQUE, CHECK, backfill, or triggers until later PRs.

ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_no INTEGER,
  ADD COLUMN IF NOT EXISTS idempotence_key VARCHAR(64),
  ADD COLUMN IF NOT EXISTS request_payload_hash TEXT,
  ADD COLUMN IF NOT EXISTS first_post_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_phase TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_lease_token UUID,
  ADD COLUMN IF NOT EXISTS dispatch_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_generation INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN subscription_payments.subscription_id IS
  'FK to subscriptions, populated for renewal attempts (PR-2+).';
COMMENT ON COLUMN subscription_payments.period_end IS
  'Paid period end at attempt creation (typically subscriptions.expires_at).';
COMMENT ON COLUMN subscription_payments.attempt_no IS
  'Per-period attempt index, past_due uses renewal_attempt_count+1.';
COMMENT ON COLUMN subscription_payments.idempotence_key IS
  'YooKassa Idempotence-Key (<=64 chars), immutable after first POST intent.';
COMMENT ON COLUMN subscription_payments.request_payload_hash IS
  'Stable hash of POST body, must match on every retry.';
COMMENT ON COLUMN subscription_payments.first_post_at IS
  'First POST to YooKassa for this row, starts 24h idempotence window.';
COMMENT ON COLUMN subscription_payments.dispatch_phase IS
  'Renewal dispatch FSM phase, does not replace status.';
COMMENT ON COLUMN subscription_payments.dispatch_lease_token IS
  'Worker run id holding dispatch lease (PR-3+).';
COMMENT ON COLUMN subscription_payments.dispatch_lease_until IS
  'Lease expiry, only holder should POST until TTL.';
COMMENT ON COLUMN subscription_payments.dispatch_generation IS
  'Incremented on lease acquire, fences provider_payment_id updates.';
