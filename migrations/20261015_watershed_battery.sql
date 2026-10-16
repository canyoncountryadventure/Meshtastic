-- Add device telemetry for watershed battery alerts. No measurements or rules are removed.
ALTER TABLE creek_observations DROP CONSTRAINT IF EXISTS creek_observations_telemetry_type_check;
ALTER TABLE creek_observations ADD CONSTRAINT creek_observations_telemetry_type_check CHECK(telemetry_type IN ('water_distance','mx2001','environment','device'));
