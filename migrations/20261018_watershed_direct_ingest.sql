-- Run in moab_watersheds (not neondb) before switching ingest.
-- Legacy mirrored source IDs are small positive IDs from MeshtasticDB.
CREATE SEQUENCE IF NOT EXISTS public.creek_direct_source_id_seq AS bigint
  START WITH 1000000000000 INCREMENT BY 1;
ALTER TABLE public.creek_observations
  ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.creek_observations
  ALTER COLUMN source_id SET DEFAULT nextval('public.creek_direct_source_id_seq'::regclass);
ALTER TABLE public.creek_observations DROP CONSTRAINT IF EXISTS creek_observations_telemetry_type_check;
ALTER TABLE public.creek_observations
  ADD CONSTRAINT creek_observations_telemetry_type_check
  CHECK (telemetry_type IN ('water_distance','mx2001','environment','device','soil','rock_test'));
CREATE OR REPLACE VIEW public.telemetry_readings AS
  SELECT o.source_id AS id,o.observed_at,o.received_at,o.node_num,s.station_name,
    o.telemetry_type,o.temperature_c,o.metrics,o.radio,o.raw
  FROM public.creek_observations o
  JOIN public.creek_stations s ON s.node_num=o.node_num;
GRANT USAGE, SELECT ON SEQUENCE public.creek_direct_source_id_seq TO watersheds_app;
GRANT SELECT, INSERT, UPDATE ON public.creek_observations TO watersheds_app;
GRANT SELECT ON public.telemetry_readings TO watersheds_app;
