-- Migration: Remove obsolete purchase_token (downloads use session auth + albumId)
-- Date: 2026

DROP INDEX IF EXISTS idx_purchases_purchase_token;

ALTER TABLE purchases
  DROP COLUMN IF EXISTS purchase_token;
