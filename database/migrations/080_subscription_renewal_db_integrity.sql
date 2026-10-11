-- PR-5: DB integrity for renewal attempts (subscription_payments).
-- Does NOT mutate payment rows. If this migration fails, run the pre-check queries below,
-- resolve duplicates manually, then re-apply.
--
-- Pre-check: duplicate open renewal attempts per subscription
--   SELECT subscription_id, COUNT(*) AS n
--   FROM subscription_payments
--   WHERE kind = 'renewal'
--     AND subscription_id IS NOT NULL
--     AND status IN ('pending', 'waiting_for_capture')
--   GROUP BY subscription_id
--   HAVING COUNT(*) > 1;
--
-- Pre-check: duplicate idempotence_key
--   SELECT idempotence_key, COUNT(*) AS n
--   FROM subscription_payments
--   WHERE idempotence_key IS NOT NULL
--   GROUP BY idempotence_key
--   HAVING COUNT(*) > 1;
--
-- Pre-check: invalid dispatch_phase
--   SELECT id, dispatch_phase FROM subscription_payments
--   WHERE dispatch_phase IS NOT NULL
--     AND dispatch_phase NOT IN ('created', 'leased', 'provider_linked', 'needs_review');
--
-- Pre-check: lease token/until mismatch
--   SELECT id FROM subscription_payments
--   WHERE (dispatch_lease_token IS NULL) <> (dispatch_lease_until IS NULL);
--
-- Pre-check: renewal idempotence_key shape
--   SELECT id, idempotence_key FROM subscription_payments
--   WHERE kind = 'renewal'
--     AND idempotence_key IS NOT NULL
--     AND (idempotence_key NOT LIKE 'renewal-%' OR char_length(idempotence_key) > 64);

ALTER TABLE subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_dispatch_phase_check;

ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_dispatch_phase_check
  CHECK (
    dispatch_phase IS NULL
    OR dispatch_phase IN ('created', 'leased', 'provider_linked', 'needs_review')
  );

ALTER TABLE subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_dispatch_lease_pair_check;

ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_dispatch_lease_pair_check
  CHECK (
    (dispatch_lease_token IS NULL AND dispatch_lease_until IS NULL)
    OR (dispatch_lease_token IS NOT NULL AND dispatch_lease_until IS NOT NULL)
  );

ALTER TABLE subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_renewal_idempotence_key_shape_check;

ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_renewal_idempotence_key_shape_check
  CHECK (
    kind IS DISTINCT FROM 'renewal'
    OR idempotence_key IS NULL
    OR (
      idempotence_key LIKE 'renewal-%'
      AND char_length(idempotence_key) <= 64
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payments_idempotence_key_unique
  ON subscription_payments (idempotence_key)
  WHERE idempotence_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payments_one_open_renewal_per_subscription
  ON subscription_payments (subscription_id)
  WHERE kind = 'renewal'
    AND subscription_id IS NOT NULL
    AND status IN ('pending', 'waiting_for_capture');

COMMENT ON INDEX idx_subscription_payments_idempotence_key_unique IS
  'PR-5: one row per YooKassa Idempotence-Key (renewal-{subscription_payments.id}).';
COMMENT ON INDEX idx_subscription_payments_one_open_renewal_per_subscription IS
  'PR-5: at most one non-terminal renewal attempt per subscription (pending/waiting_for_capture).';
