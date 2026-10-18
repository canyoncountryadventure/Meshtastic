-- Preserve radio metadata for the separate moab_watersheds Stream Flow dashboard.
-- Additive and safe for existing observations, alert rules, and rating curves.
ALTER TABLE creek_observations ADD COLUMN IF NOT EXISTS radio jsonb NOT NULL DEFAULT '{}'::jsonb;
