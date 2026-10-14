-- Apply after 20261014_pack_creek_manual_discharge.sql in moab_watersheds.
INSERT INTO creek_rating_points(node_num,measurement_time,stage_ft,observed_discharge_cfs,stage_observed_at,stage_source_id,notes)
VALUES(1949224949,'2026-10-14T19:25:00Z',3.940,64,'2026-10-14T19:19:38Z',7473,
 'User reported peak discharge exactly 64 cfs at 13:25 MDT. Stage paired from nearest calibrated SEN0313 record, 322 seconds earlier; stage was not manually measured.')
ON CONFLICT(node_num,measurement_time) DO UPDATE SET stage_ft=EXCLUDED.stage_ft,observed_discharge_cfs=EXCLUDED.observed_discharge_cfs,stage_observed_at=EXCLUDED.stage_observed_at,stage_source_id=EXCLUDED.stage_source_id,notes=EXCLUDED.notes;
