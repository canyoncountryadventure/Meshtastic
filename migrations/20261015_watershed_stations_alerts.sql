-- Dedicated moab_watersheds database only.
ALTER TABLE creek_stations ADD COLUMN IF NOT EXISTS station_type text NOT NULL DEFAULT 'creek';
INSERT INTO creek_stations(node_num,station_name,waterbody,station_type) VALUES
(1695962694,'Cottonwood Creek','Cottonwood Creek','creek'),
(2425602407,'Cottonwood Relay','Cottonwood Creek','relay')
ON CONFLICT(node_num) DO UPDATE SET station_name=EXCLUDED.station_name,waterbody=EXCLUDED.waterbody,station_type=EXCLUDED.station_type,enabled=true;
ALTER TABLE creek_observations DROP CONSTRAINT IF EXISTS creek_observations_telemetry_type_check;
ALTER TABLE creek_observations ADD CONSTRAINT creek_observations_telemetry_type_check CHECK(telemetry_type IN ('water_distance','mx2001','environment'));
CREATE TABLE IF NOT EXISTS alert_rules (
 id BIGSERIAL PRIMARY KEY,node_num BIGINT NOT NULL REFERENCES creek_stations(node_num),station_name TEXT NOT NULL,
 parameter TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN ('above','below')),
 threshold DOUBLE PRECISION NOT NULL,reset_value DOUBLE PRECISION NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,active BOOLEAN NOT NULL DEFAULT FALSE,
 recipients JSONB NOT NULL DEFAULT '[]',last_observed_at TIMESTAMPTZ,revision BIGINT NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((direction='above' AND reset_value<threshold) OR(direction='below' AND reset_value>threshold))
);
CREATE TABLE IF NOT EXISTS alert_deliveries (
 id BIGSERIAL PRIMARY KEY,rule_id BIGINT REFERENCES alert_rules(id) ON DELETE SET NULL,reading_id BIGINT,
 recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,provider_id TEXT,error TEXT,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),sent_at TIMESTAMPTZ,UNIQUE(rule_id,reading_id,recipient)
);
CREATE INDEX IF NOT EXISTS watershed_alert_deliveries_pending_idx ON alert_deliveries(next_attempt_at) WHERE status IN ('pending','sending');
INSERT INTO alert_rules(node_num,station_name,parameter,direction,threshold,reset_value)
SELECT 1949224949,'Pack Creek','discharge_cfs','above',10,9
WHERE NOT EXISTS(SELECT 1 FROM alert_rules WHERE node_num=1949224949 AND parameter='discharge_cfs');
GRANT SELECT,INSERT,UPDATE,DELETE ON alert_rules,alert_deliveries TO watersheds_app;
GRANT USAGE,SELECT ON SEQUENCE alert_rules_id_seq,alert_deliveries_id_seq TO watersheds_app;
