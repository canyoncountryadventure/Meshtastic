-- Apply to the dedicated moab_watersheds database.
-- Manual discharge is observed; paired stage is the nearest recorded stage.
CREATE TABLE IF NOT EXISTS creek_rating_points (
 node_num bigint NOT NULL REFERENCES creek_stations(node_num),
 measurement_time timestamptz NOT NULL,
 stage_ft double precision NOT NULL,
 observed_discharge_cfs double precision NOT NULL,
 stage_observed_at timestamptz NOT NULL,
 stage_source_id bigint NOT NULL,
 notes text NOT NULL,
 PRIMARY KEY(node_num,measurement_time)
);
INSERT INTO creek_rating_points(node_num,measurement_time,stage_ft,observed_discharge_cfs,stage_observed_at,stage_source_id,notes)
VALUES(1949224949,'2026-10-14T21:00:00Z',2.894,40,'2026-10-14T20:57:29Z',7521,
 'Manual discharge 40 cfs reported by user at 15:00 MDT. Stage paired from nearest calibrated SEN0313 record, 151 seconds earlier; stage was not manually measured.')
ON CONFLICT(node_num,measurement_time) DO UPDATE SET stage_ft=EXCLUDED.stage_ft,observed_discharge_cfs=EXCLUDED.observed_discharge_cfs,stage_observed_at=EXCLUDED.stage_observed_at,stage_source_id=EXCLUDED.stage_source_id,notes=EXCLUDED.notes;
GRANT SELECT ON creek_rating_points TO watersheds_app;
