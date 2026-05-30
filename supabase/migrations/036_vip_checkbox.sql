-- Migration 036: Add is_vip column to orders for Lark checkbox sync
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_orders_is_vip ON orders(is_vip) WHERE is_vip = TRUE;
