// Owner-only battery history from the unified watershed database.
// One query, no duplicate station series, no neondb fallback reads.
export const WATERSHED_BATTERY_STATIONS = Object.freeze([
 {node_num:1949224949,name:'Pack Creek'},
 {node_num:1695962694,name:'South Cottonwood'},
 {node_num:2425602407,name:'Cottonwood Relay'},
 {node_num:4241345683,name:'Mini Me'},
 {node_num:1222051909,name:'Cottonwood Relay 2'},
 {node_num:2004386937,name:'Matheson Groundwater'},
 {node_num:1683604927,name:'Mill Creek'},
 {node_num:3044869407,name:'Hidden Valley'},
 {node_num:1252758033,name:'Spare RAK'},
 {node_num:1577197109,name:'Fishlake Hightop'},
 {node_num:2740603892,name:'Moab'},
 {node_num:647393146,name:'Seed Relay 1'},
 {node_num:2650172798,name:'Thousand Lake Mountain'}
]);
const SPARE_RAK_CUTOVER_MS=Date.parse('2026-10-29T00:00:00Z');
export const BATTERY_HISTORY_DAYS=Object.freeze([7,30,60]);
export async function readOwnerBatteryHistory(_unused,creekSql,days=7){
 if(!BATTERY_HISTORY_DAYS.includes(days))throw new RangeError('Choose 7, 30, or 60 days');
 const start=new Date(Date.now()-days*86400000).toISOString();
 const bucketSeconds=days===7?7200:days===30?21600:43200;
 const rows=await creekSql`SELECT node_num,observed_at,battery_percent FROM (
   SELECT ROW_NUMBER() OVER (PARTITION BY node_num,FLOOR(EXTRACT(EPOCH FROM observed_at)/${bucketSeconds}::numeric) ORDER BY observed_at DESC) AS bucket_rank,
      node_num,observed_at,battery::numeric AS battery_percent
   FROM (
     SELECT o.node_num,o.observed_at,
       COALESCE(o.metrics->>'battery_level',o.metrics->>'battery_percent',o.metrics->>'battery_pct') AS battery
     FROM creek_observations o JOIN creek_stations s ON s.node_num=o.node_num AND s.enabled
     WHERE o.telemetry_type='device' AND o.observed_at>=${start}::timestamptz
   ) r
   WHERE battery ~ '^[0-9]{1,3}([.][0-9]+)?$' AND battery::numeric BETWEEN 0 AND 100

 ) b WHERE bucket_rank=1 ORDER BY node_num,observed_at ASC`;
 const series=WATERSHED_BATTERY_STATIONS.map(station=>({
   node_num:station.node_num,name:station.name,source:'watersheds',
   points:rows.filter(r=>Number(r.node_num)===station.node_num&&(station.node_num!==1252758033||Date.parse(r.observed_at)>=SPARE_RAK_CUTOVER_MS)).map(r=>({
     at:new Date(r.observed_at).toISOString(),percent:Number(r.battery_percent)
   })).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))
 }));
 return {days,sampled_hours:bucketSeconds/3600,generated_at:new Date().toISOString(),series};
}

// Notifications admin uses an owner-authenticated battery series, not the public
// watershed-readings API (which must withhold private stations).
export const BATTERY_HISTORY_HOURS=Object.freeze([24,168,720,2160]);
export async function readOwnerBatteryWindow(creekSql,hours=168){
 if(!BATTERY_HISTORY_HOURS.includes(hours))throw new RangeError('Unsupported battery range');
 const start=new Date(Date.now()-hours*3600000).toISOString();
 const bucketSeconds=hours===24?1800:hours===168?7200:hours===720?21600:43200;
 const rows=await creekSql`SELECT node_num,observed_at,battery_percent FROM (
   SELECT ROW_NUMBER() OVER (PARTITION BY node_num,FLOOR(EXTRACT(EPOCH FROM observed_at)/${bucketSeconds}::numeric) ORDER BY observed_at DESC) AS bucket_rank,
     node_num,observed_at,battery::numeric AS battery_percent
   FROM (
     SELECT o.node_num,o.observed_at,
       COALESCE(o.metrics->>'battery_level',o.metrics->>'battery_percent',o.metrics->>'battery_pct') AS battery
     FROM creek_observations o
     JOIN creek_stations s ON s.node_num=o.node_num AND s.enabled
     WHERE o.telemetry_type='device' AND o.observed_at>=${start}::timestamptz
       AND (o.node_num<>1252758033 OR o.observed_at>=${new Date(SPARE_RAK_CUTOVER_MS).toISOString()}::timestamptz)
   ) r
   WHERE battery ~ '^[0-9]{1,3}([.][0-9]+)?$'
     AND battery::numeric BETWEEN 0 AND 100

 ) b WHERE bucket_rank=1 ORDER BY node_num,observed_at ASC`;
 const series=WATERSHED_BATTERY_STATIONS.map(station=>({
   node_num:station.node_num,name:station.name,
   points:rows.filter(r=>Number(r.node_num)===station.node_num).map(r=>({
     at:new Date(r.observed_at).toISOString(),percent:Number(r.battery_percent)
   }))
 }));
 return {hours,sampled_hours:bucketSeconds/3600,generated_at:new Date().toISOString(),series};
}
