-- Migration 029: Add remark column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remark text;
