-- Unified buyer display name for orders (listener username or artist band name).
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS buyer_display_name VARCHAR(255);

COMMENT ON COLUMN orders.buyer_display_name IS 'Read-only buyer identity at checkout: listener name or artist band name';
