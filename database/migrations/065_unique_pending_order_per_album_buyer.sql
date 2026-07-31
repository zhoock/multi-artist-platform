-- One in-flight checkout (pending_payment) per album + buyer email.
-- Supports server-side idempotency in create-payment; advisory lock is primary,
-- this index is a safety net under concurrent inserts.

-- Legacy data may contain duplicate pending_payment rows (pre-idempotency).
-- Keep one canonical order per (album_id, buyer email); cancel the rest.
WITH ranked AS (
  SELECT
    o.id,
    ROW_NUMBER() OVER (
      PARTITION BY o.album_id, LOWER(TRIM(o.customer_email))
      ORDER BY
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM payments p
            WHERE p.order_id = o.id
              AND p.provider = 'yookassa'
              AND p.status IN ('pending', 'waiting_for_capture')
          ) THEN 0
          ELSE 1
        END,
        o.created_at DESC,
        o.id DESC
    ) AS rn
  FROM orders o
  WHERE o.status = 'pending_payment'
),
duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE orders
SET status = 'canceled',
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM duplicates);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_pending_album_customer_email
  ON orders (album_id, LOWER(TRIM(customer_email)))
  WHERE status = 'pending_payment';

COMMENT ON INDEX idx_orders_pending_album_customer_email IS
  'At most one pending_payment order per album and buyer email (checkout idempotency)';
