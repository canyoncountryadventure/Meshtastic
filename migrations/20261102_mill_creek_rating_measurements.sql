-- Production target: MeshtasticDB / moab_watersheds
-- Separate point observation table from fitted rating models.
CREATE TABLE IF NOT EXISTS public.creek_rating_measurements (
  point_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  node_num BIGINT NOT NULL REFERENCES public.creek_stations(node_num),
  stage_ft DOUBLE PRECISION NOT NULL CHECK (stage_ft >= 0 AND stage_ft < 1000000),
  discharge_cfs DOUBLE PRECISION NOT NULL CHECK (discharge_cfs >= 0 AND discharge_cfs < 1000000000),
  measured_at TIMESTAMPTZ,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  point_quality TEXT NOT NULL DEFAULT 'user_reported',
  notes TEXT NOT NULL DEFAULT '',
  entry_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS creek_rating_measurements_node_idx ON public.creek_rating_measurements(node_num,stage_ft);
INSERT INTO public.creek_rating_measurements
  (node_num,stage_ft,discharge_cfs,measured_at,point_quality,notes,entry_key)
SELECT 1683604927,2.55,47,NULL,'user_reported',
  'First Mill Creek (Power Dam) stage-discharge rating point supplied by user: 2.55 ft = 47 cfs. Measurement date/time, stage datum, and discharge measurement method not supplied. Do not treat as a fitted rating curve or interpolate/extrapolate from this single point.',
  'mill-creek-initial-rating-point-20261102'
WHERE EXISTS (SELECT 1 FROM public.creek_stations WHERE node_num=1683604927)
ON CONFLICT (entry_key) DO NOTHING;
