-- Migration 037: VIP membership number
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vip_member_number TEXT UNIQUE;
CREATE SEQUENCE IF NOT EXISTS vip_member_seq START 1;

CREATE OR REPLACE FUNCTION next_vip_member_number()
RETURNS INTEGER AS $$
  SELECT nextval('vip_member_seq')::INTEGER;
$$ LANGUAGE SQL;
