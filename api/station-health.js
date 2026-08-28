import { getSql } from './db.js';

const STATIONS = [
  { node: 1436900584, name: 'Hidden Valley Repeater', battery: true },
  { node: 2740603892, name: 'Heltec Home', battery: false },
];
const EXPECTED_INTERVAL_MINUTES = 60;
const ALERT_AFTER_MINUTES = 195;
function metric(row, ...keys) { for (const key of keys) { const value = row?.metrics?.[key]; if (value !== null && value !== undefined) return value; } return null; }
function resultFor(station, latest) {
  if (!latest) return { station: station.name, node_num: station.node, healthy: false, alert: true, reason: 'no_temperature_reading', expected_interval_minutes: EXPECTED_INTERVAL_MINUTES, alert_after_minutes: ALERT_AFTER_MINUTES, latest: null };
  const ageMinutes=Math.max(0,(Date.now()-new Date(latest.observed_at).getTime())/60000),alert=ageMinutes>=ALERT_AFTER_MINUTES;
  const out={station:station.name,node_num:station.node,healthy:!alert,alert,reason:alert?'three_hourly_readings_missed':'reporting_normally',expected_interval_minutes:EXPECTED_INTERVAL_MINUTES,alert_after_minutes:ALERT_AFTER_MINUTES,age_minutes:Number(ageMinutes.toFixed(1)),consecutive_expected_readings_missed:Math.floor(ageMinutes/EXPECTED_INTERVAL_MINUTES),latest:{id:latest.id,observed_at:latest.observed_at,received_at:latest.received_at,temperature_f:latest.temperature_c===null?null:Number((latest.temperature_c*9/5+32).toFixed(1))}};
  if(station.battery){out.latest.battery_percent=metric(latest,'battery_level','battery_percent','battery_pct');out.latest.voltage=metric(latest,'voltage','battery_voltage','battery_voltage_v');out.latest.device_observed_at=metric(latest,'device_observed_at');out.latest.rssi=latest.radio?.rssi??null;out.latest.snr=latest.radio?.snr??null;out.latest.hops_away=latest.radio?.hops_away??null;}
  return out;
}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GET required'});}
  try{const sql=getSql();const wanted=req.query.node?Number(req.query.node):null;const configs=Number.isFinite(wanted)?STATIONS.filter(s=>s.node===wanted):STATIONS;if(!configs.length)return res.status(404).json({ok:false,error:'Unknown station'});const results=[];for(const station of configs){const rows=await sql`SELECT id, observed_at, received_at, temperature_c, metrics, radio FROM telemetry_readings WHERE node_num=${station.node} AND telemetry_type='environment' AND temperature_c IS NOT NULL ORDER BY observed_at DESC LIMIT 1`;results.push(resultFor(station,rows[0]||null));}res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,stations:results,...(results.length===1?results[0]:{})});}
  catch(error){console.error('Station health query failed',error);return res.status(500).json({ok:false,error:'Station health query failed'});}
}
