-- Execute in neondb ONLY AFTER the corresponding creek records have been
-- fully migrated and verified in moab_watersheds. This is a safety guard
-- to enforce one telemetry source of truth, not a data migration.
-- Production cutover 2026-10-18: 1,353 Pack Creek + 1 CC02 rows deleted
-- from neondb after exact raw-content digest and row-count verification.
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint WHERE conname='telemetry_readings_exclude_watershed_nodes'
 ) THEN
   ALTER TABLE public.telemetry_readings
     ADD CONSTRAINT telemetry_readings_exclude_watershed_nodes
     CHECK (node_num IS NULL OR node_num NOT IN (1949224949,1695962694,2425602407));
 END IF;
END $$;
