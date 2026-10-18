-- Monthly grab-sample data belongs in the existing moab_watersheds database.
-- It is intentionally separate from automated creek telemetry.
CREATE TABLE IF NOT EXISTS water_quality_sites (
  site_id BIGSERIAL PRIMARY KEY,
  site_code TEXT NOT NULL UNIQUE,
  drainage TEXT NOT NULL,
  site_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS water_quality_samples (
  sample_id BIGSERIAL PRIMARY KEY,
  site_id BIGINT NOT NULL REFERENCES water_quality_sites(site_id),
  sampled_at TIMESTAMPTZ NOT NULL,
  e_coli_mpn_100ml NUMERIC CHECK (e_coli_mpn_100ml IS NULL OR e_coli_mpn_100ml >= 0),
  e_coli_qualifier TEXT,
  water_temperature_c NUMERIC CHECK (water_temperature_c IS NULL OR water_temperature_c BETWEEN -5 AND 50),
  specific_conductivity_us_cm NUMERIC CHECK (specific_conductivity_us_cm IS NULL OR specific_conductivity_us_cm >= 0),
  ph NUMERIC CHECK (ph IS NULL OR ph BETWEEN 0 AND 14),
  dissolved_oxygen_mg_l NUMERIC CHECK (dissolved_oxygen_mg_l IS NULL OR dissolved_oxygen_mg_l >= 0),
  collected_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, sampled_at)
);

CREATE INDEX IF NOT EXISTS water_quality_samples_site_time
  ON water_quality_samples(site_id, sampled_at DESC);

INSERT INTO water_quality_sites(site_code, drainage, site_name, sort_order) VALUES
  ('PC-ABOVE-MC', 'Pack Creek', 'Pack Creek above confluence with Mill Creek', 10),
  ('PC-SPANISH-TRAIL', 'Pack Creek', 'Pack Creek at Spanish Trail Drive', 20),
  ('MC-HWY-191', 'Mill Creek', 'Mill Creek at Highway 191', 30),
  ('MC-500-W', 'Mill Creek', 'Mill Creek at 500 West', 40),
  ('MC-POWER-DAM', 'Mill Creek', 'Mill Creek at Power Dam', 50),
  ('MC-ROTARY-PARK', 'Mill Creek', 'Mill Creek at Rotary Park', 60),
  ('KENS-LAKE', 'Mill Creek', 'Ken''s Lake', 70),
  ('CC-USFS', 'Castle Creek', 'Castle Creek at USFS boundary', 80),
  ('CC-HEADWATERS-TRIB', 'Castle Creek', 'Castle Creek headwaters side tributary', 90),
  ('CC-CASTLETON', 'Castle Creek', 'Castle Creek at Castleton', 100),
  ('CC-DIVERSION', 'Castle Creek', 'Castle Creek at diversion', 110),
  ('CC-HWY-128', 'Castle Creek', 'Castle Creek at Highway 128', 120),
  ('CR-TAKEOUT-BEACH', 'Colorado River', 'Colorado River at Takeout Beach', 130),
  ('CR-HWY-191', 'Colorado River', 'Colorado River at Highway 191', 140),
  ('CWC-HWY-95', 'Cottonwood Creek', 'Cottonwood Creek at Highway 95', 150),
  ('NCWC-BEEF-BASIN', 'Cottonwood Creek', 'North Cottonwood Creek at Beef Basin Road', 160),
  ('SJR-SAND-ISLAND', 'San Juan River', 'San Juan River at Sand Island', 170),
  ('SJR-MEXICAN-HAT', 'San Juan River', 'San Juan River at Mexican Hat', 180)
ON CONFLICT(site_code) DO UPDATE SET
  drainage=EXCLUDED.drainage,
  site_name=EXCLUDED.site_name,
  sort_order=EXCLUDED.sort_order,
  active=TRUE;
