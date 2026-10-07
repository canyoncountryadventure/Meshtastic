CREATE TABLE IF NOT EXISTS telemetry_readings (
  id BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_at TIMESTAMPTZ NOT NULL,
  node_num BIGINT,
  station_name TEXT NOT NULL,
  telemetry_type TEXT NOT NULL DEFAULT 'environment',
  temperature_c DOUBLE PRECISION,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  radio JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS telemetry_readings_station_time_idx
  ON telemetry_readings (station_name, observed_at DESC);

CREATE INDEX IF NOT EXISTS telemetry_readings_node_time_idx
  ON telemetry_readings (node_num, observed_at DESC);

CREATE TABLE IF NOT EXISTS app_migrations (
  migration_key TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS rating_curves (
  node_num BIGINT NOT NULL,
  station_name TEXT NOT NULL,
  curve_version INTEGER NOT NULL,
  equation_type TEXT NOT NULL,
  coefficient_a DOUBLE PRECISION NOT NULL,
  stage_offset_ft DOUBLE PRECISION NOT NULL,
  exponent_b DOUBLE PRECISION NOT NULL,
  valid_stage_min_ft DOUBLE PRECISION NOT NULL,
  valid_stage_max_ft DOUBLE PRECISION NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (node_num, curve_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS rating_curves_one_active_per_node_idx
  ON rating_curves (node_num)
  WHERE active;

CREATE TABLE IF NOT EXISTS rating_curve_points (
  node_num BIGINT NOT NULL,
  curve_version INTEGER NOT NULL,
  measurement_date DATE NOT NULL,
  measurement_time_local TEXT,
  stage_ft DOUBLE PRECISION NOT NULL,
  observed_discharge_cfs DOUBLE PRECISION,
  final_discharge_cfs DOUBLE PRECISION NOT NULL,
  point_type TEXT NOT NULL,
  included BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  PRIMARY KEY (node_num, curve_version, stage_ft),
  FOREIGN KEY (node_num, curve_version)
    REFERENCES rating_curves (node_num, curve_version)
    ON DELETE CASCADE
);
