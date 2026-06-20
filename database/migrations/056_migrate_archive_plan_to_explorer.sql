-- Migrate legacy single-tier archive plan to Explorer tier (dev catalog: 1 slot).
-- Idempotent: safe to run on databases already on explorer.

UPDATE subscriptions
SET plan = 'explorer',
    slots_limit = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'archive';

UPDATE subscription_payments
SET plan = 'explorer',
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'archive';
