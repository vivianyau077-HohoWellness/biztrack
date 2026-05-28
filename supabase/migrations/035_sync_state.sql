CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  last_sync_count INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default rows for each brand
INSERT INTO sync_state (id, last_synced_at) VALUES
  ('lark_DD', NULL),
  ('lark_FIOR', NULL),
  ('lark_Juji', NULL),
  ('lark_KHH', NULL),
  ('lark_NE', NULL)
ON CONFLICT (id) DO NOTHING;
