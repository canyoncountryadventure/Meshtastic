-- Register the private Whitepine battery-only relay in moab_watersheds.
-- Run on the moab_watersheds database only.
INSERT INTO public.creek_stations (node_num, station_name, waterbody, station_type, enabled)
VALUES (3943979587, 'Whitepine', 'Whitepine', 'relay', TRUE)
ON CONFLICT (node_num) DO UPDATE
  SET station_name = EXCLUDED.station_name,
      waterbody = EXCLUDED.waterbody,
      station_type = EXCLUDED.station_type,
      enabled = EXCLUDED.enabled;
