-- Migration 034: VIP tracking columns for customers

ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday_gift_claimed_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday_gift_claim_year INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Performance index for VIP price queries on lark_sync orders
CREATE INDEX IF NOT EXISTS idx_orders_price_lark
  ON orders(total_price DESC, order_date DESC)
  WHERE source = 'lark_sync';

-- idx_customers_phone already exists from migration 001 (IF NOT EXISTS is safe)
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

NOTIFY pgrst, 'reload schema';
