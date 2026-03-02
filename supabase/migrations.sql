-- ============================================================
-- RGB Admin — Location Master Tables
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- updated_at auto-update trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------
-- states
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS states (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS states_name_lower_idx ON states (LOWER(name));

CREATE OR REPLACE TRIGGER states_updated_at
  BEFORE UPDATE ON states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE states ENABLE ROW LEVEL SECURITY;

CREATE POLICY states_allow_all ON states FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- districts
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS districts (
  id         SERIAL PRIMARY KEY,
  state_id   INTEGER NOT NULL REFERENCES states(id) ON DELETE RESTRICT,
  name       TEXT    NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER districts_updated_at
  BEFORE UPDATE ON districts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY districts_allow_all ON districts FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- talukas
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS talukas (
  id          SERIAL PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  name        TEXT    NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER talukas_updated_at
  BEFORE UPDATE ON talukas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE talukas ENABLE ROW LEVEL SECURITY;

CREATE POLICY talukas_allow_all ON talukas FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- villages
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS villages (
  id         SERIAL PRIMARY KEY,
  taluka_id  INTEGER NOT NULL REFERENCES talukas(id) ON DELETE RESTRICT,
  name       TEXT    NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER villages_updated_at
  BEFORE UPDATE ON villages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE villages ENABLE ROW LEVEL SECURITY;

CREATE POLICY villages_allow_all ON villages FOR ALL USING (true) WITH CHECK (true);
