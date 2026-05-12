-- Migration 028: Update DD order ID prefix to 'DD260' format
--
-- Problem: generate_order_id appends year (2026) between prefix and number,
-- so with prefix='DD260' it produced 'DD260202600004133'.
-- Desired format: DD26004133 (prefix + 5-digit padded number, no year).
--
-- Fix: use year=0 as a sentinel — when year=0, skip appending year and use
-- 5-digit padding instead of 6-digit. All other brands retain existing behaviour.

-- 1. Update DD sequence: set prefix='DD260', year=0 to skip year in format
UPDATE order_sequences
SET prefix = 'DD260',
    year   = 0
WHERE project_id = (SELECT id FROM projects WHERE code = 'DD');

-- 2. Replace generate_order_id to handle year=0 (no-year) sequences
CREATE OR REPLACE FUNCTION generate_order_id(p_project_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_year   integer;
  v_number integer;
  v_current_year integer;
BEGIN
  v_current_year := EXTRACT(YEAR FROM NOW())::integer;

  -- Lock the row and increment
  UPDATE order_sequences
  SET
    current_number = CASE
      -- year=0 means "no-year format" — never reset on rollover
      WHEN year = 0 THEN current_number + 1
      WHEN year != v_current_year THEN 1
      ELSE current_number + 1
    END,
    year = CASE
      WHEN year = 0 THEN 0  -- keep sentinel
      ELSE v_current_year
    END
  WHERE project_id = p_project_id
  RETURNING prefix, year, current_number INTO v_prefix, v_year, v_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No sequence found for project_id %', p_project_id;
  END IF;

  -- year=0 → prefix + 5-digit padded number (no year component)
  IF v_year = 0 THEN
    RETURN v_prefix || LPAD(v_number::text, 5, '0');
  END IF;

  -- Default → prefix + year + 6-digit padded number
  RETURN v_prefix || v_year::text || LPAD(v_number::text, 6, '0');
END;
$$;

NOTIFY pgrst, 'reload schema';
