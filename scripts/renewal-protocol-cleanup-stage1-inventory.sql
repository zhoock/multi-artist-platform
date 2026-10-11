-- =============================================================================
-- Renewal protocol cleanup — Stage 1 INVENTORY (read-only)
-- =============================================================================
-- Purpose: classify test / junk subscription_payments before PR-4+ cleanup.
-- Safe to re-run: SELECT only; no DDL/DML; no TEMP tables.
-- subscriptions.user_id: UNIQUE INDEX idx_subscriptions_user_id_unique (070), not PK — at most one row per user.
-- Stop-checks (S-PROD/S-POST) include payments with NO subscriptions row (billing_context = no_subscription_row).
--
-- Run (local or staging only — NOT production without explicit approval):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/renewal-protocol-cleanup-stage1-inventory.sql
--
-- Or:
--   export DATABASE_URL='postgresql://…'
--   npm run psql -- -f scripts/renewal-protocol-cleanup-stage1-inventory.sql
--   (adjust to your project's psql wrapper if any)
-- =============================================================================

\echo '=== Payments with no subscriptions row (join ambiguity — review separately) ==='
SELECT sp.id,
       sp.user_id,
       sp.kind,
       sp.status,
       sp.provider_payment_id,
       sp.created_at
FROM subscription_payments sp
WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = sp.user_id)
ORDER BY sp.created_at, sp.id;

\echo '=== STOP-CHECK: production-like terminal payments (review before any cleanup) ==='
SELECT sp.id,
       sp.user_id,
       sp.kind,
       sp.status,
       sp.provider_payment_id,
       sp.created_at,
       s.id AS subscription_row_id,
       CASE
         WHEN s.id IS NULL THEN 'no_subscription_row'
         ELSE s.billing_origin
       END AS billing_context,
       s.provider_subscription_id
FROM subscription_payments sp
LEFT JOIN subscriptions s ON s.user_id = sp.user_id
WHERE sp.status IN ('succeeded', 'waiting_for_capture')
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND (
    s.billing_origin = 'production'
    OR s.id IS NULL
  )
ORDER BY sp.created_at, sp.id;

\echo '=== STOP-CHECK: renewal with first_post_at (POST may have reached YooKassa) ==='
SELECT sp.id,
       sp.user_id,
       sp.subscription_id,
       sp.first_post_at,
       sp.provider_payment_id,
       sp.status,
       sp.dispatch_phase,
       sp.created_at,
       CASE
         WHEN s.id IS NULL THEN 'no_subscription_row'
         ELSE s.billing_origin
       END AS billing_context,
       CASE
         WHEN s.id IS NULL THEN 'no_subscription_row'
         WHEN sp.subscription_id IS NOT NULL AND sp.subscription_id IS DISTINCT FROM s.id
         THEN 'subscription_id_mismatch'
         ELSE 'ok'
       END AS subscription_link
FROM subscription_payments sp
LEFT JOIN subscriptions s ON s.user_id = sp.user_id
WHERE sp.kind = 'renewal'
  AND sp.status IN ('pending', 'waiting_for_capture')
  AND sp.first_post_at IS NOT NULL
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND (
    s.billing_origin = 'production'
    OR s.id IS NULL
  )
ORDER BY sp.first_post_at, sp.id;

\echo '=== A1: dev-marked subscription_payments (count) ==='
SELECT COUNT(*) AS a1_dev_marker_count
FROM subscription_payments sp
WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true';

\echo '=== A1: dev-marked subscription_payments (rows) ==='
SELECT sp.id,
       sp.user_id,
       sp.kind,
       sp.status,
       sp.provider_payment_id,
       sp.subscription_id,
       sp.idempotence_key,
       sp.created_at
FROM subscription_payments sp
WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
ORDER BY sp.created_at, sp.id;

\echo '=== A2: PR-10 integration users (@pr10-e2e.test) — payment count ==='
SELECT COUNT(*) AS a2_pr10_payment_count
FROM subscription_payments sp
WHERE EXISTS (
  SELECT 1
  FROM users u
  WHERE u.id = sp.user_id
    AND u.email ILIKE '%@pr10-e2e.test'
);

\echo '=== A2: PR-10 users (rows) ==='
SELECT u.id AS user_id,
       u.email,
       s.billing_origin,
       s.status AS subscription_status
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id
WHERE u.email ILIKE '%@pr10-e2e.test'
ORDER BY u.email, u.id;

\echo '=== A2: PR-10 — all subscription_payments for those users ==='
SELECT sp.id,
       sp.user_id,
       u.email,
       sp.kind,
       sp.status,
       sp.provider_payment_id,
       sp.created_at,
       COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') AS dev_marker
FROM subscription_payments sp
INNER JOIN users u ON u.id = sp.user_id
WHERE u.email ILIKE '%@pr10-e2e.test'
ORDER BY sp.created_at, sp.id;

\echo '=== A3: renewal junk (protocol), non-terminal status — count ==='
SELECT COUNT(*) AS a3_junk_non_terminal_count
FROM subscription_payments sp
WHERE sp.kind = 'renewal'
  AND sp.status IN ('pending', 'canceled', 'failed')
  AND (
    sp.subscription_id IS NULL
    OR sp.idempotence_key IS NULL
    OR sp.request_payload_hash IS NULL
    OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
    OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
    OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
       IS DISTINCT FROM sp.id::text
  )
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
  );

\echo '=== A3: renewal junk (protocol), non-terminal — rows ==='
SELECT sp.id,
       sp.user_id,
       sp.status,
       sp.subscription_id,
       sp.idempotence_key,
       sp.request_payload_hash IS NULL AS missing_hash,
       sp.first_post_at,
       sp.provider_payment_id,
       sp.dispatch_phase,
       sp.created_at,
       s.billing_origin
FROM subscription_payments sp
LEFT JOIN subscriptions s ON s.user_id = sp.user_id
WHERE sp.kind = 'renewal'
  AND sp.status IN ('pending', 'canceled', 'failed')
  AND (
    sp.subscription_id IS NULL
    OR sp.idempotence_key IS NULL
    OR sp.request_payload_hash IS NULL
    OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
    OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
    OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
       IS DISTINCT FROM sp.id::text
  )
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
  )
ORDER BY sp.created_at, sp.id;

\echo '=== CLEANUP UNION A1|A2|A3 — summary counts by kind/status ==='
WITH
  a1 AS (
    SELECT sp.id
    FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id
    FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id
    FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1
    UNION
    SELECT id FROM a2
    UNION
    SELECT id FROM a3
  ),
  bucket AS (
    SELECT sp.id,
           sp.kind,
           sp.status,
           (sp.id IN (SELECT id FROM a1)) AS in_a1,
           (sp.id IN (SELECT id FROM a2)) AS in_a2,
           (sp.id IN (SELECT id FROM a3)) AS in_a3
    FROM subscription_payments sp
    INNER JOIN cleanup_ids c ON c.id = sp.id
  )
SELECT kind, status, COUNT(*) AS row_count
FROM bucket
GROUP BY kind, status
ORDER BY kind, status;

\echo '=== CLEANUP UNION — total distinct payment ids ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  )
SELECT COUNT(*) AS cleanup_distinct_payment_ids FROM cleanup_ids;

\echo '=== CLEANUP UNION — bucket overlap sanity (A3 must not overlap A1/A2 by definition) ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  )
SELECT
  (SELECT COUNT(*) FROM a3 x INNER JOIN a1 y ON y.id = x.id) AS a3_intersect_a1_must_be_0,
  (SELECT COUNT(*) FROM a3 x INNER JOIN a2 y ON y.id = x.id) AS a3_intersect_a2_must_be_0,
  (SELECT COUNT(*) FROM cleanup_ids c WHERE NOT EXISTS (
     SELECT 1 FROM subscription_payments sp WHERE sp.id = c.id
   )) AS cleanup_ids_missing_payment_row_must_be_0;

\echo '=== CLEANUP UNION — full id list (for delete proposal appendix) ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  )
SELECT sp.id,
       sp.user_id,
       sp.kind,
       sp.status,
       sp.provider_payment_id,
       sp.subscription_id,
       sp.created_at
FROM subscription_payments sp
INNER JOIN cleanup_ids c ON c.id = sp.id
ORDER BY sp.created_at, sp.id;

\echo '=== Webhooks linked to cleanup candidate provider_payment_id (count) ==='
WITH
  a1 AS (
    SELECT sp.id, sp.provider_payment_id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id, sp.provider_payment_id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id, sp.provider_payment_id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  ),
  provider_ids AS (
    SELECT DISTINCT sp.provider_payment_id AS payment_id
    FROM subscription_payments sp
    INNER JOIN cleanup_ids c ON c.id = sp.id
    WHERE sp.provider_payment_id IS NOT NULL
      AND btrim(sp.provider_payment_id) <> ''
  )
SELECT COUNT(*) AS webhook_events_to_review_for_delete
FROM webhook_events we
INNER JOIN provider_ids p ON p.payment_id = we.payment_id
WHERE we.provider = 'yookassa';

\echo '=== Webhooks linked to cleanup candidates (rows) ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  ),
  provider_ids AS (
    SELECT DISTINCT sp.provider_payment_id AS payment_id
    FROM subscription_payments sp
    INNER JOIN cleanup_ids c ON c.id = sp.id
    WHERE sp.provider_payment_id IS NOT NULL
      AND btrim(sp.provider_payment_id) <> ''
  )
SELECT we.id,
       we.event_id,
       we.event_type,
       we.payment_id,
       we.processed_at
FROM webhook_events we
INNER JOIN provider_ids p ON p.payment_id = we.payment_id
WHERE we.provider = 'yookassa'
ORDER BY we.processed_at, we.id;

\echo '=== Subscriptions whose provider_subscription_id points at cleanup provider ids ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  ),
  provider_ids AS (
    SELECT DISTINCT sp.provider_payment_id AS payment_id
    FROM subscription_payments sp
    INNER JOIN cleanup_ids c ON c.id = sp.id
    WHERE sp.provider_payment_id IS NOT NULL
      AND btrim(sp.provider_payment_id) <> ''
  )
SELECT s.id AS subscription_id,
       s.user_id,
       s.billing_origin,
       s.status,
       s.provider_subscription_id,
       s.expires_at
FROM subscriptions s
INNER JOIN provider_ids p ON p.payment_id = s.provider_subscription_id
ORDER BY s.user_id;

\echo '=== Gate: cleanup union intersects stop-check rows (must be 0 before DELETE) ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  ),
  stop_prod AS (
    SELECT sp.id
    FROM subscription_payments sp
    LEFT JOIN subscriptions s ON s.user_id = sp.user_id
    WHERE sp.status IN ('succeeded', 'waiting_for_capture')
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND (
        s.billing_origin = 'production'
        OR s.id IS NULL
      )
  ),
  stop_post AS (
    SELECT sp.id
    FROM subscription_payments sp
    LEFT JOIN subscriptions s ON s.user_id = sp.user_id
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'waiting_for_capture')
      AND sp.first_post_at IS NOT NULL
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND (
        s.billing_origin = 'production'
        OR s.id IS NULL
      )
  )
SELECT
  (SELECT COUNT(*) FROM cleanup_ids c INNER JOIN stop_prod p ON p.id = c.id) AS cleanup_intersect_stop_prod,
  (SELECT COUNT(*) FROM cleanup_ids c INNER JOIN stop_post p ON p.id = c.id) AS cleanup_intersect_stop_post;

\echo '=== B1: ambiguous — production terminal payments NOT in cleanup union ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  )
SELECT sp.id,
       sp.user_id,
       sp.kind,
       sp.status,
       sp.provider_payment_id,
       sp.created_at,
       CASE
         WHEN s.id IS NULL THEN 'no_subscription_row'
         ELSE s.billing_origin
       END AS billing_context
FROM subscription_payments sp
LEFT JOIN subscriptions s ON s.user_id = sp.user_id
WHERE sp.status IN ('succeeded', 'waiting_for_capture')
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND (
    s.billing_origin = 'production'
    OR s.id IS NULL
  )
  AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.id = sp.id)
ORDER BY sp.created_at, sp.id;

\echo '=== B2: ambiguous — renewal junk with status succeeded (NOT in cleanup) ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  )
SELECT sp.id,
       sp.user_id,
       sp.status,
       sp.provider_payment_id,
       sp.subscription_id,
       sp.idempotence_key,
       sp.created_at,
       s.billing_origin
FROM subscription_payments sp
LEFT JOIN subscriptions s ON s.user_id = sp.user_id
WHERE sp.kind = 'renewal'
  AND sp.status = 'succeeded'
  AND (
    sp.subscription_id IS NULL
    OR sp.idempotence_key IS NULL
    OR sp.request_payload_hash IS NULL
    OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
    OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
    OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
       IS DISTINCT FROM sp.id::text
  )
  AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.id = sp.id)
ORDER BY sp.created_at, sp.id;

\echo '=== B3: ambiguous — open renewal, first_post_at set, production, NOT cleanup ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  )
SELECT sp.id,
       sp.user_id,
       sp.first_post_at,
       sp.provider_payment_id,
       sp.status,
       sp.dispatch_phase,
       CASE
         WHEN s.id IS NULL THEN 'no_subscription_row'
         ELSE s.billing_origin
       END AS billing_context,
       CASE
         WHEN s.id IS NULL THEN 'no_subscription_row'
         WHEN sp.subscription_id IS NOT NULL AND sp.subscription_id IS DISTINCT FROM s.id
         THEN 'subscription_id_mismatch'
         ELSE 'ok'
       END AS subscription_link
FROM subscription_payments sp
LEFT JOIN subscriptions s ON s.user_id = sp.user_id
WHERE sp.kind = 'renewal'
  AND sp.status IN ('pending', 'waiting_for_capture')
  AND sp.first_post_at IS NOT NULL
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND (
    s.billing_origin = 'production'
    OR s.id IS NULL
  )
  AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.id = sp.id)
ORDER BY sp.first_post_at, sp.id;

\echo '=== B4: ambiguous — billing_origin=dev but payment lacks dev marker, NOT cleanup ==='
WITH
  a1 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true'
  ),
  a2 AS (
    SELECT sp.id FROM subscription_payments sp
    INNER JOIN users u ON u.id = sp.user_id
    WHERE u.email ILIKE '%@pr10-e2e.test'
  ),
  a3 AS (
    SELECT sp.id FROM subscription_payments sp
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'canceled', 'failed')
      AND (
        sp.subscription_id IS NULL
        OR sp.idempotence_key IS NULL
        OR sp.request_payload_hash IS NULL
        OR NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
        OR sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
           IS DISTINCT FROM sp.id::text
      )
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
      )
  ),
  cleanup_ids AS (
    SELECT id FROM a1 UNION SELECT id FROM a2 UNION SELECT id FROM a3
  )
SELECT sp.id,
       sp.user_id,
       sp.kind,
       sp.status,
       sp.provider_payment_id,
       sp.created_at,
       s.billing_origin
FROM subscription_payments sp
INNER JOIN subscriptions s ON s.user_id = sp.user_id
WHERE s.billing_origin = 'dev'
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.id = sp.id)
ORDER BY sp.created_at, sp.id;

\echo '=== Migration 080 pre-check: duplicate open renewal per subscription_id ==='
SELECT subscription_id, COUNT(*) AS open_renewal_count
FROM subscription_payments
WHERE kind = 'renewal'
  AND subscription_id IS NOT NULL
  AND status IN ('pending', 'waiting_for_capture')
GROUP BY subscription_id
HAVING COUNT(*) > 1
ORDER BY open_renewal_count DESC, subscription_id;

\echo '=== Migration 080 pre-check: duplicate idempotence_key ==='
SELECT idempotence_key, COUNT(*) AS row_count
FROM subscription_payments
WHERE idempotence_key IS NOT NULL
GROUP BY idempotence_key
HAVING COUNT(*) > 1
ORDER BY row_count DESC, idempotence_key;

\echo '=== Migration 080 pre-check: invalid dispatch_phase ==='
SELECT id, kind, status, dispatch_phase
FROM subscription_payments
WHERE dispatch_phase IS NOT NULL
  AND dispatch_phase NOT IN ('created', 'leased', 'provider_linked', 'needs_review')
ORDER BY id;

\echo '=== Migration 080 pre-check: dispatch lease token/until mismatch ==='
SELECT id,
       kind,
       status,
       dispatch_lease_token,
       dispatch_lease_until
FROM subscription_payments
WHERE (dispatch_lease_token IS NULL) <> (dispatch_lease_until IS NULL)
ORDER BY id;

\echo '=== Migration 080 pre-check: renewal idempotence_key shape ==='
SELECT id, idempotence_key, kind, status
FROM subscription_payments
WHERE kind = 'renewal'
  AND idempotence_key IS NOT NULL
  AND (
    idempotence_key NOT LIKE 'renewal-%'
    OR char_length(idempotence_key) > 64
  )
ORDER BY id;

\echo '=== Migration 080 pre-check: summary (must be 0 blocking rows for apply) ==='
SELECT
  (SELECT COUNT(*) FROM (
      SELECT subscription_id FROM subscription_payments
      WHERE kind = 'renewal' AND subscription_id IS NOT NULL
        AND status IN ('pending', 'waiting_for_capture')
      GROUP BY subscription_id HAVING COUNT(*) > 1
    ) d) AS duplicate_open_renewal_groups,
  (SELECT COUNT(*) FROM (
      SELECT idempotence_key FROM subscription_payments
      WHERE idempotence_key IS NOT NULL
      GROUP BY idempotence_key HAVING COUNT(*) > 1
    ) d) AS duplicate_idempotence_key_groups,
  (SELECT COUNT(*) FROM subscription_payments
   WHERE dispatch_phase IS NOT NULL
     AND dispatch_phase NOT IN ('created', 'leased', 'provider_linked', 'needs_review')
  ) AS invalid_dispatch_phase_rows,
  (SELECT COUNT(*) FROM subscription_payments
   WHERE (dispatch_lease_token IS NULL) <> (dispatch_lease_until IS NULL)
  ) AS lease_pair_mismatch_rows,
  (SELECT COUNT(*) FROM subscription_payments
   WHERE kind = 'renewal' AND idempotence_key IS NOT NULL
     AND (idempotence_key NOT LIKE 'renewal-%' OR char_length(idempotence_key) > 64)
  ) AS renewal_idempotence_shape_violations;

\echo '=== Proposed 081 pre-check: renewal rows violating PR-4+ protocol ==='
SELECT sp.id,
       sp.user_id,
       sp.status,
       sp.subscription_id,
       sp.idempotence_key,
       sp.request_payload_hash IS NULL AS missing_hash,
       sp.dispatch_phase,
       sp.raw_last_event ? 'renewalYookassaCreatePayload' AS has_frozen_payload,
       sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
         AS metadata_subscription_payment_id
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
  )
ORDER BY sp.created_at, sp.id;

\echo '=== Proposed 081 pre-check: summary count (target 0 before 081 apply) ==='
SELECT COUNT(*) AS renewal_pr4_violation_count
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

\echo '=== Optional: open renewal with NULL subscription_id (080 index gap) ==='
SELECT id, user_id, status, dispatch_phase, first_post_at, provider_payment_id, created_at
FROM subscription_payments
WHERE kind = 'renewal'
  AND subscription_id IS NULL
  AND status IN ('pending', 'waiting_for_capture')
ORDER BY created_at, id;

\echo '=== Inventory complete ==='
