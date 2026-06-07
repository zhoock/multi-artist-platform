-- Remove legacy split-name columns; buyer identity is buyer_display_name only.
ALTER TABLE orders
DROP COLUMN IF EXISTS customer_first_name,
DROP COLUMN IF EXISTS customer_last_name;
