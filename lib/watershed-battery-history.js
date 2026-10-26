// Owner-only battery history for the watershed notification administration.
// No scheduled work, writes, or cross-database joins. Query only on explicit request.
// Mesh nodes here are the active station roster; retired and repurposed IDs excluded.
export const MESH_BATTERY_STATIONS = Object.freeze([
 {node_num:3044869407,name:'Hidden Valley'},
 {node_num:1577197109,name:'Fishlake Hightop'},
 {node_num:2740603892,name:'Moab (Heltec)'},
 {node_num:4241345683,name:'SMLA'},
 {node_num:2650172798,name:'Thousand Lake Mountain'}
]);
export const WATERSHED_BATTERY_STATIONS = Object.freeze([
 {node_num:1949224949,name:'Pack Creek'},
 {node_num:1695962694,name:'South Cottonwood'},
 {node_num:2425602407,name:'Cottonwood Relay'},
 {node_num:2004386937,name:'Matheson Groundwater'}
]);
export const BATTERY_HISTORY_DAYS = Object.freeze([7,30,60]);
const getPct = r=> {
 const n=Number(r.battery_percent);
 return Number.isFinite(n)&&n>=0&&n<=100?n:null;
};
function makeSeries(station,source,rows){
 const pts=rows.filter(r=>Number(r.node_num)===station.node_num).map(r=>({
  at:new Date(r.observed_at).toISOString(),percent:getPct(r)
 })).filter(p=>p.percent!==null).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 return {node_num:station.node_num,name:station.name,source,points:pts};
}
export async function readOwnerBatteryHistory(meshSql,creekSql,days=7){
 if(!BATTERY_HISTORY_DAYS.includes(days))throw new RangeError('Choose 7, 30, or 60 days');
 const start=new Date(Date.now()-days*86400000).toISOString();
 const bucketSeconds=days===7?7200:days===30?21600:43200;
 // Select the latest genuine device battery reading per station/time bucket.
 // Indexed node+timestamp filtering is performed before bucketing.
 const [meshRows,creekRows]=await Promise.all([
 meshSql`SELECT node_num,observed_at,battery_percent FROM (
   SELECT DISTINCT ON (node_num,FLOOR(EXTRACT(EPOCH FROM observed_at)/${bucketSeconds}::numeric))
     node_num,observed_at,battery::numeric AS battery_percent
   FROM (
    SELECT node_num,observed_at,
      COALESCE(metrics->>'battery_level',metrics->>'battery_percent',metrics->>'battery_pct') AS battery
    FROM telemetry_readings
    WHERE node_num IN (3044869407,1577197109,2740603892,4241345683,2650172798)
      AND telemetry_type='device' AND observed_at>=${start}::timestamptz
   ) r
   WHERE battery ~ '^[0-9]{1,3}([.][0-9]+)?$' AND battery::numeric BETWEEN 0 AND 100
   ORDER BY node_num,FLOOR(EXTRACT(EPOCH FROM observed_at)/${bucketSeconds}::numeric),observed_at DESC
  ) b ORDER BY node_num,observed_at ASC`,
 creekSql`SELECT node_num,observed_at,battery_percent FROM (
   SELECT DISTINCT ON (node_num,FLOOR(EXTRACT(EPOCH FROM observed_at)/${bucketSeconds}::numeric))
     node_num,observed_at,battery::numeric AS battery_percent
   FROM (
    SELECT o.node_num,o.observed_at,
      COALESCE(o.metrics->>'battery_level',o.metrics->>'battery_percent',o.metrics->>'battery_pct') AS battery
    FROM creek_observations o JOIN creek_stations s ON s.node_num=o.node_num AND s.enabled
    WHERE o.telemetry_type='device' AND o.observed_at>=${start}::timestamptz
   ) r
   WHERE battery ~ '^[0-9]{1,3}([.][0-9]+)?$' AND battery::numeric BETWEEN 0 AND 100
   ORDER BY node_num,FLOOR(EXTRACT(EPOCH FROM observed_at)/${bucketSeconds}::numeric),observed_at DESC
  ) b ORDER BY node_num,observed_at ASC`
 ]);
 // For newly registered watershed relays, include discovered stations without
 // rewriting the frontend; known names remain stable.
 const known=new Set(WATERSHED_BATTERY_STATIONS.map(s=>s.node_num));
 const extra=[...new Set(creekRows.map(r=>Number(r.node_num)))].filter(id=>!known.has(id)).map(id=>({node_num:id,name:'Watershed node '+id}));
 const series=[
  ...WATERSHED_BATTERY_STATIONS.concat(extra).map(s=>makeSeries(s,'watersheds',creekRows)),
  ...MESH_BATTERY_STATIONS.map(s=>makeSeries(s,'mesh',meshRows))
 ];
 return {days,sampled_hours:bucketSeconds/3600,generated_at:new Date().toISOString(),series};
}
