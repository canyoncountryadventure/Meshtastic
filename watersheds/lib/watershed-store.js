import { neon } from '@neondatabase/serverless';
import { rateReadings } from './watershed-rating.js';
export function watershedSql(){
 if(!process.env.WATERSHED_DATABASE_URL)throw new Error('Watershed database is not configured');
 return neon(process.env.WATERSHED_DATABASE_URL, { fetchOptions: { signal: AbortSignal.timeout(8000) } });
}
export async function mirrorCreekReadings(readings){
 if(!process.env.WATERSHED_DATABASE_URL)return;
 const rows=readings.filter(r=>['water_distance','mx2001'].includes(r.telemetry_type));
 if(!rows.length)return;
 const sql = neon(process.env.WATERSHED_DATABASE_URL, { fetchOptions: { signal: AbortSignal.timeout(3500) } });
 await writeCreekRows(sql,rows);
}
export function writeCreekRows(sql,rows){
 return sql`INSERT INTO creek_observations(source_id,node_num,observed_at,received_at,telemetry_type,temperature_c,metrics)
 SELECT r.id,r.node_num,r.observed_at,r.received_at,r.telemetry_type,r.temperature_c,r.metrics
 FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(id bigint,node_num bigint,observed_at timestamptz,received_at timestamptz,telemetry_type text,temperature_c double precision,metrics jsonb)
 JOIN creek_stations s ON s.node_num=r.node_num AND s.enabled
 WHERE r.telemetry_type IN ('water_distance','mx2001')
 ON CONFLICT(source_id) DO UPDATE SET metrics=EXCLUDED.metrics, temperature_c=EXCLUDED.temperature_c`;
}
// Independent cursor: direct ingest mirrors never advance it, so a failed mirror
// is repaired on a later watershed request through the Meshtastic host.
export async function reconcileCreekReadings(sourceSql,targetSql){
 const stations=await targetSql`SELECT node_num FROM creek_stations WHERE enabled`;
 const nodes=stations.map(s=>Number(s.node_num));if(!nodes.length)return;
 const cursor=await targetSql`SELECT last_source_id FROM creek_sync_state WHERE name='mesh'`;
 let last=Number(cursor[0]?.last_source_id||0);
 for(let batch=0;batch<5;batch++){
  const rows=await sourceSql`SELECT id,node_num,observed_at,received_at,telemetry_type,temperature_c,metrics FROM telemetry_readings WHERE id>${last} AND node_num=ANY(${nodes}) AND telemetry_type IN ('water_distance','mx2001') ORDER BY id LIMIT 2000`;
  if(!rows.length)break;
  const end=Number(rows.at(-1).id);
  await targetSql.transaction([writeCreekRows(targetSql,rows),targetSql`UPDATE creek_sync_state SET last_source_id=GREATEST(last_source_id,${end}),updated_at=now() WHERE name='mesh'`]);
  last=end;if(rows.length<2000)break;
 }
 const curves=await sourceSql`SELECT * FROM rating_curves WHERE active AND node_num=ANY(${nodes})`;
 for(const curve of curves)await targetSql`UPDATE creek_stations SET rating_curve=${JSON.stringify(curve)}::jsonb WHERE node_num=${curve.node_num}`;
}
export async function readCreekData(sql,hours){
 const stations=await sql`SELECT node_num,station_name,waterbody,rating_curve FROM creek_stations WHERE enabled ORDER BY station_name`;
 const readings=await sql`SELECT o.source_id AS id,o.node_num,s.station_name,o.observed_at,o.received_at,o.telemetry_type,o.temperature_c,o.metrics FROM creek_observations o JOIN creek_stations s USING(node_num) WHERE s.enabled AND o.observed_at>=NOW()-(${hours}*INTERVAL '1 hour') ORDER BY o.observed_at DESC LIMIT 10000`;
 const latest=await sql`SELECT DISTINCT ON(o.node_num,o.telemetry_type) o.source_id AS id,o.node_num,s.station_name,o.observed_at,o.received_at,o.telemetry_type,o.temperature_c,o.metrics FROM creek_observations o JOIN creek_stations s USING(node_num) WHERE s.enabled ORDER BY o.node_num,o.telemetry_type,o.observed_at DESC`;
 const curves=stations.map(s=>s.rating_curve).filter(Boolean);
 return {stations:stations.map(({rating_curve,...s})=>s),readings:rateReadings(readings,curves),latest:rateReadings(latest,curves)};
}
