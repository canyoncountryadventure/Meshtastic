-- moab_watersheds: replace the withdrawn peak measurement with an estimate.
ALTER TABLE creek_rating_points ALTER COLUMN observed_discharge_cfs DROP NOT NULL;
ALTER TABLE creek_rating_points ADD COLUMN IF NOT EXISTS estimated_discharge_cfs double precision;
ALTER TABLE creek_rating_points ADD COLUMN IF NOT EXISTS measurement_quality text;
UPDATE creek_rating_points SET observed_discharge_cfs=NULL,estimated_discharge_cfs=68.6,measurement_quality='approximate_field_check',notes='Model-derived peak estimate 68.6 cfs, approximately corroborated by user field check at 13:25 MDT. Not an independent precise discharge measurement and excluded from the rating fit.' WHERE node_num=1949224949 AND measurement_time='2026-10-14T19:25:00Z';
