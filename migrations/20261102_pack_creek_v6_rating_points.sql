-- Pack Creek Version 6 calibration records copied from canonical neondb.rating_curve_points;
-- the source model-derived 3.94ft / 68.6cfs estimate remains excluded from fitting.
ALTER TABLE public.creek_rating_measurements ADD COLUMN IF NOT EXISTS measurement_date DATE;
ALTER TABLE public.creek_rating_measurements ADD COLUMN IF NOT EXISTS measurement_time_local TEXT;
ALTER TABLE public.creek_rating_measurements ADD COLUMN IF NOT EXISTS observed_discharge_cfs DOUBLE PRECISION;
ALTER TABLE public.creek_rating_measurements ADD COLUMN IF NOT EXISTS included_in_rating BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.creek_rating_measurements ADD COLUMN IF NOT EXISTS rating_curve_version INTEGER;
INSERT INTO public.creek_rating_measurements (node_num,stage_ft,discharge_cfs,measured_at,point_quality,
 notes,entry_key,measurement_date,measurement_time_local,observed_discharge_cfs,included_in_rating,rating_curve_version)
VALUES
 (1949224949,0.2444,0.1235,TIMESTAMP '2026-07-29 15:40' AT TIME ZONE 'America/Denver','observed','Accepted Survey123 manual discharge.','pack-creek-v6-stage-0.2444','2026-07-29'::date,'15:40 MDT',0.1235,TRUE,6),
 (1949224949,0.2623,0.1973,TIMESTAMP '2026-06-24 17:15' AT TIME ZONE 'America/Denver','observed','Accepted Survey123 manual discharge.','pack-creek-v6-stage-0.2623','2026-06-24'::date,'17:15 MDT',0.1973,TRUE,6),
 (1949224949,0.45,1.3,NULL,'observed','Initial permanent-station measurement; MX2001 stage and manual discharge.','pack-creek-v6-stage-0.45','2026-09-25'::date,NULL,1.3,TRUE,6),
 (1949224949,0.57,1.5,NULL,'observed','User supplied stage and discharge; measurement time not specified.','pack-creek-v6-stage-0.57','2026-10-11'::date,NULL,1.5,TRUE,6),
 (1949224949,0.62,2.2,TIMESTAMP '2026-10-20 15:30' AT TIME ZONE 'America/Denver','observed','User supplied stage and discharge, no telemetry-interpolated stage.','pack-creek-v6-stage-0.62','2026-10-20'::date,'15:30 MDT',2.2,TRUE,6),
 (1949224949,0.6849,2.7163,TIMESTAMP '2026-05-19 09:20' AT TIME ZONE 'America/Denver','observed','Accepted Survey123 manual discharge.','pack-creek-v6-stage-0.6849','2026-05-19'::date,'09:20 MDT',2.7163,TRUE,6),
 (1949224949,0.6904,2.75,TIMESTAMP '2026-04-27 10:59' AT TIME ZONE 'America/Denver','modeled_adjustment','Observed 2.3905 cfs retained, 2.75 cfs used for fit.','pack-creek-v6-stage-0.6904','2026-04-27'::date,'10:59 MDT',2.3905,TRUE,6),
 (1949224949,2.894,40,TIMESTAMP '2026-10-14 15:00' AT TIME ZONE 'America/Denver','observed','Manual discharge paired with nearest SEN0313 stage recorded 151 sec earlier.','pack-creek-v6-stage-2.894','2026-10-14'::date,'15:00 MDT',40,TRUE,6),
 (1949224949,3.94,68.6,TIMESTAMP '2026-10-14 13:25' AT TIME ZONE 'America/Denver','field_checked_estimate','Model-derived peak, excluded from fit. Approximate field check, not independent discharge.','pack-creek-v6-stage-3.94','2026-10-14'::date,'13:25 MDT',NULL,FALSE,6)
ON CONFLICT (entry_key) DO NOTHING;
