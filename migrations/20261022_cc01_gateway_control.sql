-- CC01 polling controls and explicit sensor diagnostics, safe additive migration (2026-10-22).
CREATE TABLE IF NOT EXISTS public.cc01_gateway_control (
 id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1),water_enabled BOOLEAN NOT NULL DEFAULT TRUE,
 hobo_enabled BOOLEAN NOT NULL DEFAULT TRUE,authorized_admin_node BIGINT NOT NULL DEFAULT 0,
 version BIGINT NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 applied_water_enabled BOOLEAN,applied_hobo_enabled BOOLEAN,applied_version BIGINT,applied_at TIMESTAMPTZ
);
INSERT INTO public.cc01_gateway_control(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.cc01_sensor_events(
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,node_num BIGINT NOT NULL DEFAULT 1695962694,
 sensor TEXT NOT NULL CHECK(sensor IN ('water','hobo')),
 status TEXT NOT NULL CHECK(status IN ('timeout','ble_unavailable','read_failed')),
 packet_id BIGINT,received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cc01_sensor_events_latest ON public.cc01_sensor_events(node_num,sensor,received_at DESC);
GRANT SELECT,INSERT,UPDATE ON public.cc01_gateway_control TO watersheds_app;
GRANT SELECT,INSERT ON public.cc01_sensor_events TO watersheds_app;
GRANT USAGE,SELECT ON SEQUENCE public.cc01_sensor_events_id_seq TO watersheds_app;

CREATE UNIQUE INDEX IF NOT EXISTS cc01_sensor_event_dedupe ON public.cc01_sensor_events(node_num,sensor,status,packet_id) WHERE packet_id IS NOT NULL;
