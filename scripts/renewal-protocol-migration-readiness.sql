-- =============================================================================
-- Renewal PR-4+ — migration & data READINESS (080 / 081 + cleanup cohorts)
-- =============================================================================
-- Read-only: SELECT + psql \echo / \set. No TEMP tables, DDL, DML.
--
-- Migration tracking in this repo (scripts/migrate-database.ts):
--   • Table public.schema_migrations (filename, executed_at) when using npm run migrate.
--   • Manual psql -f does NOT auto-record — use pg_catalog artifacts below as source of truth.
--
-- Run (staging / local copy only — NOT production without explicit approval):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/renewal-protocol-migration-readiness.sql
-- =============================================================================

\echo '=== A) schema_migrations rows (npm run migrate only; skip if relation missing) ==='
\set ON_ERROR_STOP off
SELECT filename, executed_at
FROM public.schema_migrations
WHERE filename IN (
  '080_subscription_renewal_db_integrity.sql',
  '081_subscription_renewal_pr4_protocol.sql'
)
ORDER BY filename;
\set ON_ERROR_STOP on

\echo '=== B) Catalog: migration 080 artifacts on subscription_payments ==='
SELECT artifact, present
FROM (
  SELECT 'constraint:subscription_payments_dispatch_phase_check' AS artifact,
         EXISTS (
           SELECT 1 FROM pg_constraint c
           WHERE c.conrelid = 'public.subscription_payments'::regclass
             AND c.conname = 'subscription_payments_dispatch_phase_check'
         ) AS present
  UNION ALL
  SELECT 'constraint:subscription_payments_dispatch_lease_pair_check',
         EXISTS (
           SELECT 1 FROM pg_constraint c
           WHERE c.conrelid = 'public.subscription_payments'::regclass
             AND c.conname = 'subscription_payments_dispatch_lease_pair_check'
         )
  UNION ALL
  SELECT 'constraint:subscription_payments_renewal_idempotence_key_shape_check',
         EXISTS (
           SELECT 1 FROM pg_constraint c
           WHERE c.conrelid = 'public.subscription_payments'::regclass
             AND c.conname = 'subscription_payments_renewal_idempotence_key_shape_check'
         )
  UNION ALL
  SELECT 'index:idx_subscription_payments_idempotence_key_unique',
         EXISTS (
           SELECT 1 FROM pg_class i
           JOIN pg_namespace n ON n.oid = i.relnamespace
           WHERE n.nspname = 'public'
             AND i.relname = 'idx_subscription_payments_idempotence_key_unique'
             AND i.relkind = 'i'
         )
  UNION ALL
  SELECT 'index:idx_subscription_payments_one_open_renewal_per_subscription',
         EXISTS (
           SELECT 1 FROM pg_class i
           JOIN pg_namespace n ON n.oid = i.relnamespace
           WHERE n.nspname = 'public'
             AND i.relname = 'idx_subscription_payments_one_open_renewal_per_subscription'
             AND i.relkind = 'i'
         )
) q
ORDER BY artifact;

\echo '=== C) Catalog: migration 081 artifacts on subscription_payments ==='
SELECT artifact, present
FROM (
  SELECT 'constraint:subscription_payments_renewal_subscription_id_not_null' AS artifact,
         EXISTS (
           SELECT 1 FROM pg_constraint c
           WHERE c.conrelid = 'public.subscription_payments'::regclass
             AND c.conname = 'subscription_payments_renewal_subscription_id_not_null'
         ) AS present
  UNION ALL
  SELECT 'constraint:subscription_payments_renewal_identity_not_null',
         EXISTS (
           SELECT 1 FROM pg_constraint c
           WHERE c.conrelid = 'public.subscription_payments'::regclass
             AND c.conname = 'subscription_payments_renewal_identity_not_null'
         )
  UNION ALL
  SELECT 'constraint:subscription_payments_renewal_frozen_metadata_matches_row',
         EXISTS (
           SELECT 1 FROM pg_constraint c
           WHERE c.conrelid = 'public.subscription_payments'::regclass
             AND c.conname = 'subscription_payments_renewal_frozen_metadata_matches_row'
         )
) q
ORDER BY artifact;

\echo '=== 080 data pre-check: summary (all counts must be 0 before first apply of 080) ==='
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

\echo '=== 080 violation detail: duplicate open renewal per subscription_id ==='
SELECT subscription_id, COUNT(*) AS open_renewal_count
FROM subscription_payments
WHERE kind = 'renewal'
  AND subscription_id IS NOT NULL
  AND status IN ('pending', 'waiting_for_capture')
GROUP BY subscription_id
HAVING COUNT(*) > 1
ORDER BY open_renewal_count DESC, subscription_id;

\echo '=== 080 violation detail: rows in duplicate open renewal groups ==='
WITH dup AS (
  SELECT subscription_id
  FROM subscription_payments
  WHERE kind = 'renewal'
    AND subscription_id IS NOT NULL
    AND status IN ('pending', 'waiting_for_capture')
  GROUP BY subscription_id
  HAVING COUNT(*) > 1
)
SELECT sp.id, sp.status, sp.subscription_id, sp.idempotence_key, sp.first_post_at, sp.created_at
FROM subscription_payments sp
INNER JOIN dup d ON d.subscription_id = sp.subscription_id
WHERE sp.kind = 'renewal'
  AND sp.status IN ('pending', 'waiting_for_capture')
ORDER BY sp.subscription_id, sp.created_at, sp.id;

\echo '=== 080 violation detail: duplicate idempotence_key ==='
SELECT idempotence_key, COUNT(*) AS row_count
FROM subscription_payments
WHERE idempotence_key IS NOT NULL
GROUP BY idempotence_key
HAVING COUNT(*) > 1
ORDER BY row_count DESC, idempotence_key;

\echo '=== 080 violation detail: invalid dispatch_phase ==='
SELECT id, kind, status, dispatch_phase
FROM subscription_payments
WHERE dispatch_phase IS NOT NULL
  AND dispatch_phase NOT IN ('created', 'leased', 'provider_linked', 'needs_review')
ORDER BY id;

\echo '=== 080 violation detail: dispatch lease token/until mismatch ==='
SELECT id, kind, status, dispatch_lease_token, dispatch_lease_until
FROM subscription_payments
WHERE (dispatch_lease_token IS NULL) <> (dispatch_lease_until IS NULL)
ORDER BY id;

\echo '=== 080 violation detail: renewal idempotence_key shape ==='
SELECT id, kind, status, idempotence_key
FROM subscription_payments
WHERE kind = 'renewal'
  AND idempotence_key IS NOT NULL
  AND (
    idempotence_key NOT LIKE 'renewal-%'
    OR char_length(idempotence_key) > 64
  )
ORDER BY id;

\echo '=== 081 data pre-check: violation count (must be 0 before apply of 081) ==='
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

\echo '=== 081 violation detail: all renewal rows blocking 081 (id, status, tags) ==='
SELECT sp.id,
       sp.status,
       sp.user_id,
       sp.subscription_id,
       sp.idempotence_key,
       sp.dispatch_phase,
       sp.created_at,
       ARRAY_REMOVE(ARRAY[
         CASE WHEN sp.subscription_id IS NULL THEN 'subscription_id_null' END,
         CASE WHEN sp.idempotence_key IS NULL THEN 'idempotence_key_null' END,
         CASE WHEN sp.request_payload_hash IS NULL THEN 'request_payload_hash_null' END,
         CASE WHEN sp.dispatch_phase IS NULL THEN 'dispatch_phase_null' END,
         CASE WHEN NOT (sp.raw_last_event ? 'renewalYookassaCreatePayload')
           THEN 'missing_frozen_payload' END,
         CASE WHEN sp.raw_last_event ? 'renewalYookassaCreatePayload'
           AND sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId' IS NULL
           THEN 'metadata_subscription_payment_id_null' END,
         CASE WHEN sp.raw_last_event->'renewalYookassaCreatePayload'->'metadata'->>'subscriptionPaymentId'
                IS DISTINCT FROM sp.id::text
           THEN 'metadata_subscription_payment_id_mismatch' END
       ]::text[], NULL) AS violation_tags
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

\echo '=== Cleanup cohort counts A1 / A2 / A3 ==='
SELECT
  (SELECT COUNT(*) FROM subscription_payments sp
   WHERE COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') = 'true') AS a1_dev_marker_count,
  (SELECT COUNT(*) FROM subscription_payments sp
   WHERE EXISTS (
     SELECT 1 FROM users u
     WHERE u.id = sp.user_id AND u.email ILIKE '%@pr10-e2e.test'
   )) AS a2_pr10_payment_count,
  (SELECT COUNT(*) FROM subscription_payments sp
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
     )) AS a3_junk_non_terminal_count;

\echo '=== Cleanup union A1|A2|A3 — distinct payment id count ==='
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

\echo '=== Gate: cleanup intersects stop-check (must be 0 before DELETE) ==='
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
      AND (s.billing_origin = 'production' OR s.id IS NULL)
  ),
  stop_post AS (
    SELECT sp.id
    FROM subscription_payments sp
    LEFT JOIN subscriptions s ON s.user_id = sp.user_id
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'waiting_for_capture')
      AND sp.first_post_at IS NOT NULL
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND (s.billing_origin = 'production' OR s.id IS NULL)
  )
SELECT
  (SELECT COUNT(*) FROM cleanup_ids c INNER JOIN stop_prod p ON p.id = c.id) AS cleanup_intersect_stop_prod,
  (SELECT COUNT(*) FROM cleanup_ids c INNER JOIN stop_post p ON p.id = c.id) AS cleanup_intersect_stop_post;

\echo '=== Gate detail: cleanup ids in stop_prod ==='
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
      AND (s.billing_origin = 'production' OR s.id IS NULL)
  )
SELECT sp.id, sp.kind, sp.status, sp.provider_payment_id, sp.created_at
FROM subscription_payments sp
INNER JOIN cleanup_ids c ON c.id = sp.id
INNER JOIN stop_prod p ON p.id = sp.id
ORDER BY sp.created_at, sp.id;

\echo '=== Gate detail: cleanup ids in stop_post ==='
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
  stop_post AS (
    SELECT sp.id
    FROM subscription_payments sp
    LEFT JOIN subscriptions s ON s.user_id = sp.user_id
    WHERE sp.kind = 'renewal'
      AND sp.status IN ('pending', 'waiting_for_capture')
      AND sp.first_post_at IS NOT NULL
      AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
      AND (s.billing_origin = 'production' OR s.id IS NULL)
  )
SELECT sp.id, sp.status, sp.first_post_at, sp.provider_payment_id, sp.created_at
FROM subscription_payments sp
INNER JOIN cleanup_ids c ON c.id = sp.id
INNER JOIN stop_post p ON p.id = sp.id
ORDER BY sp.first_post_at, sp.id;

\echo '=== B1: ambiguous — production terminal, not in cleanup ==='
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
SELECT sp.id, sp.kind, sp.status, sp.provider_payment_id, sp.created_at,
       CASE WHEN s.id IS NULL THEN 'no_subscription_row' ELSE s.billing_origin END AS billing_context
FROM subscription_payments sp
LEFT JOIN subscriptions s ON s.user_id = sp.user_id
WHERE sp.status IN ('succeeded', 'waiting_for_capture')
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND (s.billing_origin = 'production' OR s.id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.id = sp.id)
ORDER BY sp.created_at, sp.id;

\echo '=== B2: ambiguous — renewal junk succeeded, not in cleanup ==='
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
SELECT sp.id, sp.status, sp.provider_payment_id, sp.created_at
FROM subscription_payments sp
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

\echo '=== B3: ambiguous — open renewal with first_post_at, not in cleanup ==='
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
SELECT sp.id, sp.status, sp.first_post_at, sp.provider_payment_id, sp.created_at,
       CASE WHEN s.id IS NULL THEN 'no_subscription_row' ELSE s.billing_origin END AS billing_context
FROM subscription_payments sp
LEFT JOIN subscriptions s ON s.user_id = sp.user_id
WHERE sp.kind = 'renewal'
  AND sp.status IN ('pending', 'waiting_for_capture')
  AND sp.first_post_at IS NOT NULL
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND (s.billing_origin = 'production' OR s.id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.id = sp.id)
ORDER BY sp.first_post_at, sp.id;

\echo '=== B4: ambiguous — billing_origin=dev, payment without dev marker, not in cleanup ==='
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
SELECT sp.id, sp.kind, sp.status, sp.created_at, s.billing_origin
FROM subscription_payments sp
INNER JOIN subscriptions s ON s.user_id = sp.user_id
WHERE s.billing_origin = 'dev'
  AND COALESCE(sp.raw_last_event->>'devPaymentMode', 'false') <> 'true'
  AND NOT EXISTS (SELECT 1 FROM cleanup_ids c WHERE c.id = sp.id)
ORDER BY sp.created_at, sp.id;

\echo '=== Readiness complete ==='
