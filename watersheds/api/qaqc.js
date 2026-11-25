import { watershedSql } from '../lib/watershed-store.js';
import { hasPrivateAccess } from '../lib/private-stations.js';
import { calculateDischarge } from '../lib/watershed-rating.js';

const VALID=Object.freeze({
  environment:['temperature_f'],
  mx2001:['temperature_f','stage_ft','discharge_cfs'],
  water_distance:['stage_ft','discharge_cfs'],
  rugged_troll:['temperature_f','stage_ft']
});
const WINDOWS=[24,72,168,336,720];
const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const seriesName=(type,metric)=>type+'|'+metric;
const sameOrigin=req=>!req.headers.origin||(()=>{try{return new URL(req.headers.origin).host===(req.headers['x-forwarded-host']||req.headers.host)}catch{return false}})();
function readValue(row,metric,curve){
 const m=row.metrics||{};
 if(metric==='temperature_f'){
   const f=number(m.temperature_f);
   if(f!==null)return Number(f.toFixed(3));
   const c=number(row.temperature_c)??number(m.temperature_c)??number(m.temperature);
   return c===null?null:Number((c*1.8+32).toFixed(3));
 }
 const stage=number(m.water_level_ft)??number(m.stage_ft);
 if(metric==='stage_ft')return stage;
 if(metric==='discharge_cfs'){
   const rated=number(m.discharge_cfs);
   if(rated!==null)return rated;
   return curve?.active===true?calculateDischarge(stage,curve):null;
 }
 return null;
}
function parseSeries(input){
 const [type,metric,...extra]=String(input||'').split('|');
 return !extra.length&&VALID[type]?.includes(metric)?{type,metric,key:seriesName(type,metric)}:null;
}
function asPoint(r,metric,curve){
 const value=readValue(r,metric,curve);
 return value===null?null:{id:Number(r.id),node_num:Number(r.node_num),observed_at:r.observed_at,received_at:r.received_at,
   value,telemetry_type:r.telemetry_type,quality:r.metrics?.stage_calibrated===false?'uncalibrated':'reported',
   rssi:number(r.radio?.rssi),snr:number(r.radio?.snr),hops:number(r.radio?.hops_away)};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('Vercel-CDN-Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(req.method==='POST'&&!sameOrigin(req))return res.status(403).json({error:'Origin rejected'});
 if(!(await hasPrivateAccess(req)))return res.status(401).json({error:'Sign in through System Administration first'});
 const sql=watershedSql();
 try{
  if(req.method==='GET'){
   const url=new URL(req.url||'/', 'https://admin.local');
   const op=url.searchParams.get('op')||'catalog';
   if(op==='catalog'){
     const stations=await sql\`SELECT s.node_num,s.station_name,s.rating_curve,
       o.telemetry_type,COUNT(*)::int AS samples,
       MAX(o.observed_at) AS last_observed,
       BOOL_OR(o.temperature_c IS NOT NULL OR o.metrics ? 'temperature_f' OR o.metrics ? 'temperature_c' OR o.metrics ? 'temperature') AS has_temp,
       BOOL_OR(o.metrics ? 'water_level_ft' OR o.metrics ? 'stage_ft') AS has_stage
       FROM creek_stations s JOIN creek_observations o USING(node_num)
       WHERE s.enabled AND o.observed_at > NOW()-INTERVAL '180 days'
         AND o.telemetry_type IN ('environment','mx2001','water_distance','rugged_troll')
       GROUP BY s.node_num,s.station_name,s.rating_curve,o.telemetry_type
       ORDER BY s.station_name,o.telemetry_type\`;
     const options=[];
     for(const r of stations){
       if(r.has_temp)options.push({node_num:Number(r.node_num),station_name:r.station_name,series_key:seriesName(r.telemetry_type,'temperature_f'),label:r.telemetry_type+' · temperature (°F)',last_observed:r.last_observed,samples:Number(r.samples)});
       if(r.has_stage){
         options.push({node_num:Number(r.node_num),station_name:r.station_name,series_key:seriesName(r.telemetry_type,'stage_ft'),label:r.telemetry_type+' · stage (ft)',last_observed:r.last_observed,samples:Number(r.samples)});
         if(r.rating_curve?.active===true)options.push({node_num:Number(r.node_num),station_name:r.station_name,series_key:seriesName(r.telemetry_type,'discharge_cfs'),label:r.telemetry_type+' · rated discharge (cfs)',last_observed:r.last_observed,samples:Number(r.samples)});
       }
     }
     return res.status(200).json({ok:true,series:options});
   }
   const node=Number(url.searchParams.get('node'));
   const parsed=parseSeries(url.searchParams.get('series'));
   if(!Number.isSafeInteger(node)||node<1||!parsed)return res.status(400).json({error:'Choose an existing station and series'});
   const station=await sql\`SELECT node_num,station_name,rating_curve FROM creek_stations WHERE node_num=\${node} AND enabled=true\`;
   if(!station.length)return res.status(404).json({error:'Station unavailable'});
   if(op==='audit'){
     const rows=await sql\`SELECT id,observation_id,node_num,series_key,previous_decision,new_decision,note,changed_at
       FROM qaqc_audit WHERE node_num=\${node} AND series_key=\${parsed.key}
       ORDER BY changed_at DESC,id DESC LIMIT 120\`;
     return res.status(200).json({ok:true,history:rows});
   }
   if(op!=='series')return res.status(400).json({error:'Unknown operation'});
   const hours=Number(url.searchParams.get('hours')||72);
   if(!WINDOWS.includes(hours))return res.status(400).json({error:'Unsupported time window'});
   const [rows,setting,reviews,history]=await Promise.all([
     sql\`SELECT source_id AS id,node_num,telemetry_type,observed_at,received_at,temperature_c,metrics,radio
         FROM creek_observations WHERE node_num=\${node} AND telemetry_type=\${parsed.type}
           AND observed_at >= NOW()- (\${hours}*INTERVAL '1 hour')
         ORDER BY observed_at DESC,source_id DESC LIMIT 4200\`,
     sql\`SELECT checks,sigma,sensitivity,enabled,updated_at FROM qaqc_settings WHERE node_num=\${node} AND series_key=\${parsed.key}\`,
     sql\`SELECT observation_id,decision,note,updated_at FROM qaqc_reviews WHERE node_num=\${node} AND series_key=\${parsed.key}\`,
     sql\`SELECT id,observation_id,previous_decision,new_decision,note,changed_at FROM qaqc_audit WHERE node_num=\${node} AND series_key=\${parsed.key} ORDER BY changed_at DESC,id DESC LIMIT 30\`
   ]);
   const points=rows.map(r=>asPoint(r,parsed.metric,station[0].rating_curve)).filter(Boolean).reverse();
   let peer=[];
   if(parsed.metric==='stage_ft'&&['mx2001','water_distance'].includes(parsed.type)){
     const peerType=parsed.type==='mx2001'?'water_distance':'mx2001';
     const peers=await sql\`SELECT source_id AS id,node_num,telemetry_type,observed_at,received_at,temperature_c,metrics,radio
       FROM creek_observations WHERE node_num=\${node} AND telemetry_type=\${peerType}
       AND observed_at >= NOW()-(\${hours}*INTERVAL '1 hour')
       ORDER BY observed_at DESC,source_id DESC LIMIT 4200\`;
     peer=peers.map(r=>asPoint(r,'stage_ft',null)).filter(Boolean).reverse();
   }
   return res.status(200).json({ok:true,node_num:node,station_name:station[0].station_name,series_key:parsed.key,hours,
     points,peer,settings:setting[0]||null,reviews,history,limit_reached:rows.length===4200,
     readonly_raw:true,auto_flags_advisory:true});
  }
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const node=Number(body.node_num),parsed=parseSeries(body.series_key);
  if(!Number.isSafeInteger(node)||node<1||!parsed)return res.status(400).json({error:'Invalid station or measurement series'});
  const station=await sql\`SELECT node_num FROM creek_stations WHERE node_num=\${node} AND enabled=true\`;
  if(!station.length)return res.status(404).json({error:'Station not found'});
  if(body.action==='save_settings'){
    const c=body.checks||{},checks={};
    for(const k of ['spike','step','gap','flatline','peer']){if(typeof c[k]!=='boolean')return res.status(400).json({error:'Invalid QA rule toggle'});checks[k]=c[k];}
    const sigma=Number(body.sigma),sensitivity=Number(body.sensitivity);
    if(!(sigma>=2&&sigma<=8&&sensitivity>=0.5&&sensitivity<=2.5))return res.status(400).json({error:'Sensitivity is out of range'});
    await sql\`INSERT INTO qaqc_settings(node_num,series_key,checks,sigma,sensitivity,enabled)
      VALUES(\${node},\${parsed.key},\${JSON.stringify(checks)}::jsonb,\${sigma},\${sensitivity},true)
      ON CONFLICT(node_num,series_key) DO UPDATE SET checks=excluded.checks,sigma=excluded.sigma,sensitivity=excluded.sensitivity,updated_at=NOW()\`;
    return res.status(200).json({ok:true,saved:true});
  }
  if(body.action==='review'){
    const id=Number(body.observation_id),decision=String(body.decision||'');
    const note=String(body.note||'').trim();
    if(!Number.isSafeInteger(id)||id<1||!['accepted','rejected','needs_review','clear'].includes(decision)||note.length>1000)
      return res.status(400).json({error:'Invalid QA review'});
    if(decision==='rejected'&&note.length<6)return res.status(400).json({error:'Explain why the reading is rejected (at least six characters)'});
    const existing=await sql\`SELECT source_id FROM creek_observations WHERE source_id=\${id} AND node_num=\${node} AND telemetry_type=\${parsed.type}\`;
    if(!existing.length)return res.status(404).json({error:'Observation not found'});
    const before=await sql\`SELECT decision FROM qaqc_reviews WHERE observation_id=\${id} AND series_key=\${parsed.key}\`;
    if(decision==='clear'){
      await sql\`DELETE FROM qaqc_reviews WHERE observation_id=\${id} AND series_key=\${parsed.key}\`;
    }else{
      await sql\`INSERT INTO qaqc_reviews(observation_id,node_num,series_key,decision,note)
        VALUES(\${id},\${node},\${parsed.key},\${decision},\${note})
        ON CONFLICT(observation_id,series_key) DO UPDATE SET decision=excluded.decision,note=excluded.note,updated_at=NOW()\`;
    }
    await sql\`INSERT INTO qaqc_audit(observation_id,node_num,series_key,previous_decision,new_decision,note)
      VALUES(\${id},\${node},\${parsed.key},\${before[0]?.decision||null},\${decision},\${note}\`;
    return res.status(200).json({ok:true,reviewed:true});
  }
  return res.status(400).json({error:'Unknown QA operation'});
 }catch(error){
  console.error('QA QC endpoint error',error.name);
  return res.status(503).json({error:'QA/QC database request unavailable'});
 }
}
