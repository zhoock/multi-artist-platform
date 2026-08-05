# Subscription autoprenew backfill (B-3)

Migration: `database/migrations/069_subscription_autorenew_backfill.sql`

## Purpose

Before enabling `SUBSCRIPTION_AUTO_RENEW_ENABLED` in production, existing subscriptions with a saved payment method need `next_charge_at` populated so the renewal scheduler (PR-7) can enqueue charges at period end.

This backfill **does not change runtime behavior** while the feature flag is off. It only prepares data.

## What it does

For rows where:

- `status` is `active` or `cancel_at_period_end`
- `expires_at` is in the future
- `payment_method_id` is present (non-empty)
- `next_charge_at` is currently `NULL`

Sets `next_charge_at = expires_at`.

Rows **without** a payment method are left unchanged (scheduler skips them until PM is saved via initial checkout or rebind).

## What it does not do

- Does not modify `scheduled_plan`, `renewal_attempt_count`, or `first_failed_at`
- Does not change subscription status or entitlement
- Does not enable the scheduler (flag remains off until PR-11 rollout)

## Apply

```bash
psql "$DATABASE_URL" -f database/migrations/069_subscription_autorenew_backfill.sql
```

Apply after migrations 066–068 and **before** staging enablement of `SUBSCRIPTION_AUTO_RENEW_ENABLED`.

## Verification queries

**Count rows backfilled (run after migration):**

```sql
SELECT COUNT(*) AS backfilled
FROM subscriptions
WHERE status IN ('active', 'cancel_at_period_end')
  AND expires_at > NOW()
  AND payment_method_id IS NOT NULL
  AND TRIM(payment_method_id) <> ''
  AND next_charge_at = expires_at;
```

**Eligible but still missing `next_charge_at` (should be 0 after backfill):**

```sql
SELECT id, user_id, status, expires_at, payment_method_id, next_charge_at
FROM subscriptions
WHERE status IN ('active', 'cancel_at_period_end')
  AND expires_at > NOW()
  AND payment_method_id IS NOT NULL
  AND TRIM(payment_method_id) <> ''
  AND next_charge_at IS NULL;
```

**Active subs without PM (expected — scheduler skips until rebind/checkout):**

```sql
SELECT id, user_id, status, expires_at, next_charge_at
FROM subscriptions
WHERE status IN ('active', 'cancel_at_period_end')
  AND expires_at > NOW()
  AND (payment_method_id IS NULL OR TRIM(payment_method_id) = '');
```

## Rollback

The migration only sets `next_charge_at` where it was `NULL`. Rollback clears those values:

```sql
-- Revert next_charge_at for rows that were backfilled (next_charge_at equals expires_at)
UPDATE subscriptions
SET
  next_charge_at = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE status IN ('active', 'cancel_at_period_end')
  AND next_charge_at IS NOT NULL
  AND expires_at IS NOT NULL
  AND next_charge_at = expires_at
  AND payment_method_id IS NOT NULL;
```

> **Note:** If legitimate renewals or fulfillment set `next_charge_at = expires_at` after backfill, the rollback above may also clear those. Prefer point-in-time restore if rollback is needed post-enablement.

## Related

- Migration 066 — autoprenew schema columns
- PR-7 renewal scheduler — consumes `next_charge_at`
- Pre-PR-10 hardening B-4 — resubscribe clears stale dunning fields on new checkout
