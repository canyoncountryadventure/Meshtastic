-- Apply to the separate moab_watersheds database only.
CREATE TABLE IF NOT EXISTS creek_stations (
 node_num bigint PRIMARY KEY, station_name text NOT NULL,
 waterbody text NOT NULL, rating_curve jsonb,
 enabled boolean NOT NULL DEFAULT true
);
INSERT INTO creek_stations(node_num,station_name,waterbody)
VALUES (1949224949,'Pack Creek','Pack Creek') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS creek_observations (
 source_id bigint PRIMARY KEY, node_num bigint NOT NULL REFERENCES creek_stations(node_num),
 observed_at timestamptz NOT NULL, received_at timestamptz NOT NULL,
 telemetry_type text NOT NULL CHECK (telemetry_type IN ('water_distance','mx2001')),
 temperature_c double precision, metrics jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS creek_observations_station_time ON creek_observations(node_num,observed_at DESC);
CREATE TABLE IF NOT EXISTS creek_sync_state (
 name text PRIMARY KEY, last_source_id bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO creek_sync_state(name) VALUES ('mesh') ON CONFLICT DO NOTHING;
