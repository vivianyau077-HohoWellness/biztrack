-- Migration 033: Add Lark sync columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lark_record_id TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS postcode TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS brand TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_lark_record_id ON orders(lark_record_id) WHERE lark_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_brand ON orders(brand) WHERE brand IS NOT NULL;

NOTIFY pgrst, 'reload schema';
