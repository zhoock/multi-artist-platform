-- Pre-rollout backfill for autoprenew scheduler (Pre-PR-10 / B-3).
-- Safe to apply while SUBSCRIPTION_AUTO_RENEW_ENABLED=false — no runtime behavior change until flag on.
--
-- Populates next_charge_at for eligible active subscriptions so the renewal scheduler
-- can pick them up immediately after enablement without a manual data fix.
--
-- Rollback: see docs/adr/subscription-autorenew-backfill.md

UPDATE subscriptions
SET
  next_charge_at = expires_at,
  updated_at = CURRENT_TIMESTAMP
WHERE status IN ('active', 'cancel_at_period_end')
  AND expires_at IS NOT NULL
  AND expires_at > NOW()
  AND payment_method_id IS NOT NULL
  AND TRIM(payment_method_id) <> ''
  AND next_charge_at IS NULL;
