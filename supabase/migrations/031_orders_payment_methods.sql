-- Migration 031: Add payment_method_1 and payment_method_2 to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_1 text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_2 text;
