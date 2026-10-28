import { watershedSql, readCreekData } from '../lib/watershed-store.js';
import { isGoogleSheetsBackupConfigured, readEmergencyBackupData } from '../lib/google-sheets-backup.js';

const MAIN_TELEMETRY_ORIGIN='https://meshtastic-ecru.vercel.app';
const EXTERNAL_SENSOR_STATIONS=new Map([
 [3044869407,{station_name:'Hidden Valley',waterbody:'La Sal Mountains',station_type:'relay'}],
 [1577197109,{station_name:'Fishlake Hightop',waterbody:'Fishlake Plateau',station_type:'relay'}],
 [1683604927,{station_name:'Mill Creek',waterbody:'Power Dam',station_type:'sensor'}],
 [647393146,{station_name:'Seed Relay 1',waterbody:'Field radio',station_type:'sensor'}],
 [1252758033,{station_name:'Spare RAK',waterbody:'Field radio',station_type:'relay'}],
 [4241345683,{station_name:'Mini Me',waterbody:'Field radio',station_type:'sensor'}],
]);

async function fetchMainReadings(node,hours,limit,bucketMinutes=0){
 const url=new URL('/api/readings',MAIN_TELEMETRY_ORIGIN);
 url.searchParams.set('node',String(node));
 url.searchParams.set('hours',String(Math.min(hours,8760)));
 url.searchParams.set('limit',String(limit));
 url.searchParams.set('bucket_minutes',String(bucketMinutes));
 const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('Main telemetry API returned '+response.status);
 const data=await response.json();
 if(!data?.ok||!Array.isArray(data.readings))throw new Error('Main telemetry API returned invalid data');
 return data.readings;
}

async function readExternalSensorData(node,hours){
 const station=EXTERNAL_SENSOR_STATIONS.get(node);
 const bucketMinutes=hours>=8760?1440:hours>=2160?360:hours>=1440?120:0;
 const [readings,latestWindow]=await Promise.all([
  fetchMainReadings(node,hours,10000,bucketMinutes),
  fetchMainReadings(node,8760,2000,0),
 ]);
 const sorted=[...latestWindow].sort((a,b)=>new Date(b.observed_at)-new Date(a.observed_at));
 const seen=new Set();
 const latest=sorted.filter(reading=>!seen.has(reading.telemetry_type)&&seen.add(reading.telemetry_type));
 const recentCutoff=Date.now()-24*60*60*1000;
 const recent=sorted.filter(reading=>new Date(reading.observed_at).getTime()>=recentCutoff);
 return {
  stations:[{node_num:node,...station,rating_curve:null}],readings,latest,recent,
  sensor_events:[],cc01_polling:null,
  sample_interval_hours:bucketMinutes?bucketMinutes/60:null,
  sample_interval_hours_by_node:bucketMinutes?{[String(node)]:bucketMinutes/60}:{},
 };
}

export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GET required'});}
 const params=new URL(req.url||'/','http://localhost').searchParams;
 const requested=Number(params.get('hours')||168);
 const hours=[6,12,24,72,168,336,720,1440,2160,8760,1000000].includes(requested)?requested:168;
 const node=Number(params.get('node'));
 try{
  const data=EXTERNAL_SENSOR_STATIONS.has(node)
   ? await readExternalSensorData(node,hours)
   : await readCreekData(watershedSql(),hours);
  res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=60');
  return res.status(200).json({ok:true,hours,...data});
 }catch(error){
  console.error('Watershed query failed',error.name);
  if(!isGoogleSheetsBackupConfigured())return res.status(503).json({ok:false,error:'Creek observations unavailable',backup_active:false});
  try{
   const data=await readEmergencyBackupData(hours);
   res.setHeader('Cache-Control','no-store');
   return res.status(200).json({ok:true,hours,backup_active:true,backup_readings:true,...data});
  }catch(backupError){console.error('Watershed emergency backup query failed',backupError.name);return res.status(503).json({ok:false,error:'Creek observations unavailable',backup_active:true});}
 }
}
