-- 2026-10-29: unify approved Meshtastic telemetry in moab_watersheds.
-- Run on the moab_watersheds database ONLY. This is non-destructive.
-- Backfill of 5,604 historical neondb records was separately verified; do not
-- repeat legacy inserts without the source-id idempotency keys.
BEGIN;
ALTER TABLE public.creek_observations ADD COLUMN IF NOT EXISTS station_name text;
ALTER TABLE public.creek_observations ADD COLUMN IF NOT EXISTS packet_id text;
CREATE UNIQUE INDEX IF NOT EXISTS creek_observations_packet_id_uq
  ON public.creek_observations(packet_id) WHERE packet_id IS NOT NULL;
INSERT INTO public.creek_stations (node_num,station_name,waterbody,station_type,enabled)
VALUES
(647393146,'Seed Relay 1','Regional telemetry','relay',true),
(1252758033,'Hidden Valley (retired)','Regional telemetry','archive',false),
(1436900584,'Hidden Valley (historic)','Regional telemetry','archive',false),
(1577197109,'Fishlake Hightop','Fishlake Plateau','relay',true),
(1683604927,'Mill Creek','Power Dam','creek',true),
(2224121796,'Infra_i04 (historic)','Regional telemetry','archive',false),
(2650172798,'Thousand Lake Mountain','Thousand Lake Mountain','relay',true),
(2740603892,'Moab','Moab','sensor',true),
(3044869407,'Hidden Valley','La Sal Mountains','relay',true),
(4241345683,'Cottonwood Relay 2','Regional telemetry','relay',true)
ON CONFLICT (node_num) DO UPDATE
  SET station_name=EXCLUDED.station_name,waterbody=EXCLUDED.waterbody,
      station_type=EXCLUDED.station_type,enabled=EXCLUDED.enabled;
UPDATE public.creek_observations SET station_name='Cottonwood Relay 2'
 WHERE node_num=4241345683 AND station_name='SMLA';
CREATE OR REPLACE VIEW public.telemetry_readings AS
 SELECT o.source_id AS id,o.observed_at,o.received_at,o.node_num,
 COALESCE(o.station_name,s.station_name) AS station_name,o.telemetry_type,
 o.temperature_c,o.metrics,o.radio,o.raw
 FROM public.creek_observations o JOIN public.creek_stations s
 ON s.node_num=o.node_num;
COMMIT;
