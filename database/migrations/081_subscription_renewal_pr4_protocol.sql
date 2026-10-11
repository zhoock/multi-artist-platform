-- PR-4+ — strict renewal protocol on subscription_payments (schema enforcement).
--
-- Prerequisites:
--   1. Migration 080 applied (dispatch_phase / lease / idempotence uniqueness).
--   2. Stage-1 inventory clean: no renewal rows violating PR-4+ protocol
--      (scripts/renewal-protocol-cleanup-stage1-inventory.sql — § Proposed 081 pre-check).
--   3. Runtime already rejects legacy protocol (no legacy_recoverable / provider-only renewal webhook).
--
-- This migration does NOT UPDATE or DELETE rows. Pre-check fails with a clear error if violations exist.

DO $$
DECLARE
  v_total integer;
  v_null_subscription_id integer;
  v_null_identity integer;
  v_frozen_metadata integer;
BEGIN
  SELECT COUNT(*) INTO v_null_subscription_id
  FROM subscription_payments sp
  WHERE sp.kind = 'renewal'
    AND sp.subscription_id IS NULL;

  SELECT COUNT(*) INTO v_null_identity
  FROM subscription_payments sp
  WHERE sp.kind = 'renewal'
    AND (
      sp.idempotence_key IS NULL
      OR sp.request_payload_hash IS NULL
      OR sp.dispatch_phase IS NULL
    );

  SELECT COUNT(*) INTO v_frozen_metadata
  FROM subscription_payments sp
  WHERE sp.kind = 'renewal'
    AND (
      NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
      OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
      OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
         IS DISTINCT FROM sp.id::text
    );

  SELECT COUNT(*) INTO v_total
  FROM subscription_payments sp
  WHERE sp.kind = 'renewal'
    AND (
      sp.subscription_id IS NULL
      OR sp.idempotence_key IS NULL
      OR sp.request_payload_hash IS NULL
      OR sp.dispatch_phase IS NULL
      OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
      OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
      OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
         IS DISTINCT FROM sp.id::text
    );

  IF v_total > 0 THEN
    RAISE EXCEPTION
      '081_subscription_renewal_pr4_protocol pre-check failed: % distinct renewal row(s) violate PR-4+ '
      '(breakdown counts overlap: subscription_id NULL=%, identity NULL=%, frozen metadata=%). '
      'Run scripts/renewal-protocol-cleanup-stage1-inventory.sql (081 pre-check), clean data, re-apply.',
      v_total, v_null_subscription_id, v_null_identity, v_frozen_metadata;
  END IF;
END $$;

ALTER TABLE subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_renewal_subscription_id_not_null;

ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_renewal_subscription_id_not_null
  CHECK (kind IS DISTINCT FROM 'renewal' OR subscription_id IS NOT NULL);

ALTER TABLE subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_renewal_identity_not_null;

ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_renewal_identity_not_null
  CHECK (
    kind IS DISTINCT FROM 'renewal'
    OR (
      idempotence_key IS NOT NULL
      AND request_payload_hash IS NOT NULL
      AND dispatch_phase IS NOT NULL
    )
  );

ALTER TABLE subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_renewal_frozen_metadata_matches_row;

ALTER TABLE subscription_payments
  ADD CONSTRAINT subscription_payments_renewal_frozen_metadata_matches_row
  CHECK (
    kind IS DISTINCT FROM 'renewal'
    OR (
      raw_last_event ? 'renewalYookassaCreatePayload'
      AND raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' = id::text
    )
  );

COMMENT ON CONSTRAINT subscription_payments_renewal_subscription_id_not_null ON subscription_payments IS
  'PR-4+: renewal attempts must reference subscriptions.id';

COMMENT ON CONSTRAINT subscription_payments_renewal_identity_not_null ON subscription_payments IS
  'PR-4+: renewal attempts require idempotence_key, request_payload_hash, dispatch_phase';

COMMENT ON CONSTRAINT subscription_payments_renewal_frozen_metadata_matches_row ON subscription_payments IS
  'PR-4+: frozen YooKassa POST metadata.subscriptionPaymentId must equal subscription_payments.id';
