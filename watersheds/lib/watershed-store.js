import { neon } from '@neondatabase/serverless';
import { rateReadings } from './watershed-rating.js';
import { evaluateReadings,dispatchEmails,emailConfig } from './alerts.js';
import { evaluateOfflineRules } from './watershed-offline.js';
export function watershedSql(){
 if(!process.env.WATERSHED_DATABASE_URL)throw new Error('Watershed database is not configured');
 return neon(process.env.WATERSHED_DATABASE_URL, { fetchOptions: { signal: AbortSignal.timeout(8000) } });
}
// Direct source of truth for watershed telemetry: no MeshtasticDB insert or mirror.
export async function insertDirectCreekReading(sql, reading) {
 const rows=await sql`INSERT INTO creek_observations
   (node_num,observed_at,received_at,telemetry_type,temperature_c,metrics,radio,raw)
   SELECT ${reading.node_num},${reading.observed_at}::timestamptz,NOW(),${reading.telemetry_type},
     ${reading.temperature_c},${JSON.stringify(reading.metrics)}::jsonb,
     ${JSON.stringify(reading.radio)}::jsonb,${JSON.stringify(reading.raw)}::jsonb
   FROM creek_stations WHERE node_num=${reading.node_num} AND enabled
   RETURNING source_id AS id,node_num,observed_at,received_at,telemetry_type,temperature_c,metrics,radio`;
 if(rows.length!==1)throw new Error('Watershed station not registered or disabled');
 return {...rows[0],station_name:reading.station_name};
}
export async function processWatershedAlerts(sql, readings, mainSql) {
 if(!readings.length)return;
 const curves=await sql`SELECT rating_curve FROM creek_stations WHERE enabled AND rating_curve IS NOT NULL`;
 await evaluateReadings(sql,readings,{curves:curves.map(c=>c.rating_curve),
   dashboardUrl:'https://seutahwatersheds.vercel.app/',subjectPrefix:'Moab Watersheds: '});
 // Every arriving packet can detect another silent station. The scheduled check also catches whole-network outages.
 await evaluateOfflineRules(sql);
 // Email service configuration remains managed centrally; only watershed alerts
 // and readings are stored in moab_watersheds.
 if(mainSql){
   const config=await emailConfig(mainSql);
   if(config)await dispatchEmails(sql,1,{config,idempotencyPrefix:'watershed-alert'});
 }
}
export async function readCreekData(sql,hours){
 const stations=await sql`SELECT node_num,station_name,waterbody,station_type,rating_curve FROM creek_stations WHERE enabled ORDER BY station_name`;
 const bucketSeconds=hours>=8760?86400:hours>=2160?21600:hours>=1440?7200:0;
 // Preserve two real groundwater-sensor observations per day for Matheson in
 // annual and since-inception views; other stations retain daily sampling.
 const mathesonBucketSeconds=hours>=8760?43200:bucketSeconds;
 // Long views select real samples from time buckets, never synthetic values.
 const readings=bucketSeconds
  ? await sql`WITH bucketed AS (
    SELECT o.source_id AS id,o.node_num,s.station_name,o.observed_at,o.received_at,o.telemetry_type,o.temperature_c,o.metrics,o.radio,
      ROW_NUMBER() OVER (PARTITION BY o.node_num,o.telemetry_type,FLOOR(EXTRACT(EPOCH FROM o.observed_at)/
        CASE WHEN o.node_num=2004386937 AND o.telemetry_type IN ('rugged_troll','mx2001')
          THEN ${mathesonBucketSeconds}::numeric ELSE ${bucketSeconds}::numeric END)
        ORDER BY o.observed_at DESC,o.source_id DESC) AS bucket_rank
    FROM creek_observations o JOIN creek_stations s USING(node_num)
    WHERE s.enabled AND o.observed_at >= NOW()-(${hours}*INTERVAL '1 hour'))
    SELECT id,node_num,station_name,observed_at,received_at,telemetry_type,temperature_c,metrics,radio
    FROM bucketed WHERE bucket_rank=1 ORDER BY observed_at DESC LIMIT 12000`
  : await sql`SELECT o.source_id AS id,o.node_num,s.station_name,o.observed_at,o.received_at,
       o.telemetry_type,o.temperature_c,o.metrics,o.radio
     FROM creek_observations o JOIN creek_stations s USING(node_num)
     WHERE s.enabled AND o.observed_at>=NOW()-(${hours}*INTERVAL '1 hour')
     ORDER BY o.observed_at DESC LIMIT 25000`;
 const latest=await sql`SELECT DISTINCT ON(o.node_num,o.telemetry_type)
       o.source_id AS id,o.node_num,s.station_name,o.observed_at,o.received_at,
       o.telemetry_type,o.temperature_c,o.metrics,o.radio
     FROM creek_observations o JOIN creek_stations s USING(node_num)
     WHERE s.enabled ORDER BY o.node_num,o.telemetry_type,o.observed_at DESC`;
 // Raw 24-hour observations keep trend calculations and relay history precise
 // even when the long-range graph is sampled daily.
 const recent=await sql`SELECT o.source_id AS id,o.node_num,s.station_name,o.observed_at,o.received_at,
       o.telemetry_type,o.temperature_c,o.metrics,o.radio
     FROM creek_observations o JOIN creek_stations s USING(node_num)
     WHERE s.enabled AND o.observed_at>=NOW()-INTERVAL '24 hours'
     ORDER BY o.observed_at DESC LIMIT 1500`;
 const sensorEvents=await sql`SELECT DISTINCT ON (sensor) id,node_num,sensor,status,received_at
    FROM cc01_sensor_events WHERE node_num=1695962694 ORDER BY sensor,received_at DESC,id DESC`;
 const controls=await sql`SELECT water_enabled,hobo_enabled,applied_water_enabled,applied_hobo_enabled,applied_at FROM cc01_gateway_control WHERE id=1`;
 const curves=stations.map(s=>s.rating_curve).filter(Boolean);
 const publicStations=stations.map(({rating_curve,...station})=>({
   ...station,rating_curve:rating_curve?.active===true?{
     coefficient_a:rating_curve.coefficient_a,stage_offset_ft:rating_curve.stage_offset_ft,
     exponent_b:rating_curve.exponent_b,curve_version:rating_curve.curve_version,
     valid_stage_min_ft:rating_curve.valid_stage_min_ft,valid_stage_max_ft:rating_curve.valid_stage_max_ft
   }:null
 }));
 const sampleIntervals=bucketSeconds?Object.fromEntries(stations.map(s=>[
   String(s.node_num),Number(s.node_num)===2004386937?mathesonBucketSeconds/3600:bucketSeconds/3600
 ])):{};
 return {stations:publicStations,readings:rateReadings(readings,curves),latest:rateReadings(latest,curves),
   recent:rateReadings(recent,curves),sensor_events:sensorEvents,
   cc01_polling:controls[0]||null,sample_interval_hours:bucketSeconds?bucketSeconds/3600:null,
   sample_interval_hours_by_node:sampleIntervals};
}
