-- Correct radio identities without rewriting historical sensor observations.
-- Mini Me was previously SMLA and was erroneously labeled Cottonwood Relay 2.
BEGIN;
UPDATE public.creek_stations
 SET station_name='Mini Me', station_type='relay', waterbody='Portable Meshtastic radio'
 WHERE node_num=4241345683;
INSERT INTO public.creek_stations (node_num,station_name,waterbody,station_type,enabled)
 VALUES (1222051909,'Cottonwood Relay 2','Cottonwood mesh network','relay',true)
 ON CONFLICT (node_num) DO UPDATE SET
 station_name=EXCLUDED.station_name, waterbody=EXCLUDED.waterbody,
 station_type=EXCLUDED.station_type, enabled=EXCLUDED.enabled;
COMMIT;
