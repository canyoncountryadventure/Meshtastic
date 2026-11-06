import { neon } from '@neondatabase/serverless';
import { rateReadings, stationRatingCurves } from './watershed-rating.js';
import { evaluateReadings,dispatchEmails,emailConfig } from './alerts.js';
import { evaluateOfflineRules } from './watershed-offline.js';

const MILL_CREEK_NODE=1683604927;
const MILL_CREEK_RATING=Object.freeze({
 active:true,coefficient_a:1.0653659355880896,stage_offset_ft:0,
 exponent_b:4.0453542619202745,curve_version:2,
 valid_stage_min_ft:1.5,valid_stage_max_ft:2.55,
 provisional:true,method:'power_law_three_point',calibration_points:3
});
const MILL_CREEK_RATING_POINTS=Object.freeze([
 {point_id:'mill-v2-150',node_num:MILL_CREEK_NODE,stage_ft:1.5,discharge_cfs:5.4935152149373705,observed_discharge_cfs:5.4935152149373705,measured_at:null,measurement_date:null,measurement_time_local:null,point_quality:'confirmed',included_in_rating:true,rating_curve_version:2,notes:'Included Mill Creek calibration point: 1.50 ft = 5.49 cfs.'},
 {point_id:'mill-v2-162',node_num:MILL_CREEK_NODE,stage_ft:1.62,discharge_cfs:7.5,observed_discharge_cfs:7.5,measured_at:'2026-11-06T19:40:00.000Z',measurement_date:'2026-11-06',measurement_time_local:'12:40 MST',point_quality:'confirmed',included_in_rating:true,rating_curve_version:2,notes:'Confirmed Mill Creek discharge measurement: 1.62 ft = 7.5 cfs.'},
 {point_id:'mill-v2-255',node_num:MILL_CREEK_NODE,stage_ft:2.55,discharge_cfs:47,observed_discharge_cfs:47,measured_at:null,measurement_date:null,measurement_time_local:null,point_quality:'confirmed',included_in_rating:true,rating_curve_version:2,notes:'Confirmed Mill Creek discharge measurement: 2.55 ft = 47 cfs.'}
]);
async function ensureMillCreekRating(sql){
 await sql`UPDATE creek_stations SET rating_curve=${JSON.stringify(MILL_CREEK_RATING)}::jsonb
   WHERE node_num=${MILL_CREEK_NODE}
     AND COALESCE((rating_curve->>'curve_version')::integer,0)<${MILL_CREEK_RATING.curve_version}`;
}
function currentRatingMeasurements(points){
 return [...points.filter(point=>Number(point.node_num)!==MILL_CREEK_NODE),...MILL_CREEK_RATING_POINTS]
   .sort((a,b)=>Number(a.node_num)-Number(b.node_num)||Number(a.stage_ft)-Number(b.stage_ft));
}
export function watershedSql(){
 if(!process.env.WATERSHED_DATABASE_URL)throw new Error('Watershed database is not configured');
 return neon(process.env.WATERSHED_DATABASE_URL, { fetchOptions: { signal: AbortSignal.timeout(8000) } });
}
let creekPacketSchema;
export function ensureCreekPacketSchema(sql) {
 if (!creekPacketSchema) creekPacketSchema=(async()=>{
  await sql`ALTER TABLE creek_observations ADD COLUMN IF NOT EXISTS packet_id TEXT`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS creek_observations_packet_id_uq ON creek_observations(packet_id) WHERE packet_id IS NOT NULL`;
 })().catch(error=>{creekPacketSchema=null;throw error;});
 return creekPacketSchema;
}
// Direct source of truth for watershed telemetry: no MeshtasticDB insert or mirror.
export async function insertDirectCreekReading(sql, reading) {
 const rows=await sql`WITH inserted AS (INSERT INTO creek_observations
   (node_num,observed_at,received_at,telemetry_type,temperature_c,metrics,radio,raw,packet_id)
   SELECT ${reading.node_num},${reading.observed_at}::timestamptz,NOW(),${reading.telemetry_type},
     ${reading.temperature_c},${JSON.stringify(reading.metrics)}::jsonb,
     ${JSON.stringify(reading.radio)}::jsonb,${JSON.stringify(reading.raw)}::jsonb,${reading.packet_id}
   FROM creek_stations WHERE node_num=${reading.node_num} AND enabled
   ON CONFLICT (packet_id) WHERE packet_id IS NOT NULL DO NOTHING
   RETURNING source_id AS id,node_num,observed_at,received_at,telemetry_type,temperature_c,metrics,radio,FALSE AS duplicate)
   SELECT * FROM inserted
   UNION ALL
   SELECT source_id AS id,node_num,observed_at,received_at,telemetry_type,temperature_c,metrics,radio,TRUE AS duplicate
   FROM creek_observations WHERE packet_id=${reading.packet_id} AND NOT EXISTS (SELECT 1 FROM inserted) LIMIT 1`;
 if(rows.length!==1)throw new Error('Watershed station not registered or disabled');
 return {...rows[0],station_name:reading.station_name};
}
export async function processWatershedAlerts(sql, readings, mainSql) {
 await ensureMillCreekRating(sql);
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
 await ensureMillCreekRating(sql);
 const stations=await sql`SELECT node_num,station_name,waterbody,station_type,rating_curve FROM creek_stations WHERE enabled ORDER BY station_name`;
 const bucketSeconds=hours>=8760?86400:hours>=2160?21600:hours>=1440?7200:0;
 // Long views select real samples from time buckets, never synthetic values.
 const readings=bucketSeconds
  ? await sql`WITH bucketed AS (
    SELECT o.source_id AS id,o.node_num,s.station_name,o.observed_at,o.received_at,o.telemetry_type,o.temperature_c,o.metrics,o.radio,
      ROW_NUMBER() OVER (PARTITION BY o.node_num,o.telemetry_type,FLOOR(EXTRACT(EPOCH FROM o.observed_at)/${bucketSeconds}::numeric)
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
 // Field calibration records are not a fitted discharge equation.
 const ratingMeasurements=await sql`SELECT p.point_id,p.node_num,p.stage_ft,p.discharge_cfs,p.observed_discharge_cfs,
    p.measured_at,p.measurement_date,p.measurement_time_local,p.point_quality,
    p.included_in_rating,p.rating_curve_version,p.notes
   FROM creek_rating_measurements p JOIN creek_stations s USING(node_num)
   WHERE s.enabled AND NOT (p.node_num=1949224949 AND p.entry_key LIKE 'pack-v6-%') ORDER BY p.node_num,p.stage_ft,p.point_id`;
 const curves=stationRatingCurves(stations);
 const publicStations=stations.map(({rating_curve,...station})=>({
   ...station,rating_curve:rating_curve?.active===true?{
     coefficient_a:rating_curve.coefficient_a,stage_offset_ft:rating_curve.stage_offset_ft,
     exponent_b:rating_curve.exponent_b,curve_version:rating_curve.curve_version,
     valid_stage_min_ft:rating_curve.valid_stage_min_ft,valid_stage_max_ft:rating_curve.valid_stage_max_ft,
     provisional:rating_curve.provisional===true,method:rating_curve.method??null,calibration_points:rating_curve.calibration_points??null
   }:null
 }));
 // This node ID was previously Hidden Valley. Retain old rows in Neon, but
 // do not attribute them to the reassigned Spare RAK station.
 const currentAssignment=r=>Number(r.node_num)!==1252758033||Date.parse(r.observed_at)>=Date.parse('2026-10-29T00:00:00Z');
 return {stations:publicStations,readings:rateReadings(readings.filter(currentAssignment),curves),latest:rateReadings(latest.filter(currentAssignment),curves),
   recent:rateReadings(recent.filter(currentAssignment),curves),rating_measurements:currentRatingMeasurements(ratingMeasurements),sensor_events:sensorEvents,
   cc01_polling:controls[0]||null,sample_interval_hours:bucketSeconds?bucketSeconds/3600:null};
}
