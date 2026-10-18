-- Add source traceability before importing public WQX/WQP records.
ALTER TABLE water_quality_samples ADD COLUMN IF NOT EXISTS source_provider TEXT;
ALTER TABLE water_quality_samples ADD COLUMN IF NOT EXISTS source_station_id TEXT;
ALTER TABLE water_quality_samples ADD COLUMN IF NOT EXISTS source_site_name TEXT;
ALTER TABLE water_quality_samples ADD COLUMN IF NOT EXISTS source_activity_ids JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE water_quality_samples ADD COLUMN IF NOT EXISTS source_latitude NUMERIC;
ALTER TABLE water_quality_samples ADD COLUMN IF NOT EXISTS source_longitude NUMERIC;
ALTER TABLE water_quality_samples ADD COLUMN IF NOT EXISTS sample_depth_m NUMERIC;
CREATE INDEX IF NOT EXISTS water_quality_samples_source_station
  ON water_quality_samples(source_station_id, sampled_at DESC);
