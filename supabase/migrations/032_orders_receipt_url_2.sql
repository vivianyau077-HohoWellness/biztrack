-- Migration 032: Add receipt_url_1 and receipt_url_2 columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_url_1 text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_url_2 text;
