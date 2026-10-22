import { timingSafeEqual } from 'node:crypto';
import { watershedSql } from '../lib/watershed-store.js';
const valid=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GET or POST required'});
 if(!valid(req.headers['x-ingest-key'],process.env.INGEST_KEY))return res.status(401).json({error:'Unauthorized'});
 let body=req.body||{};
 try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({error:'Malformed JSON'});}
 try{
  const sql=watershedSql();
  if(req.method==='GET'){
   const rows=await sql`SELECT version,water_enabled,hobo_enabled,authorized_admin_node FROM cc01_gateway_control WHERE id=1`;
   if(!rows.length)return res.status(503).json({error:'Control not initialized'});
   const r=rows[0];return res.status(200).json({version:Number(r.version),water_enabled:r.water_enabled,hobo_enabled:r.hobo_enabled,authorized_admin_node:Number(r.authorized_admin_node)});
  }
  if(body.type==='report'){
   if(typeof body.water_enabled!=='boolean'||typeof body.hobo_enabled!=='boolean'||
     !Number.isSafeInteger(Number(body.version))||Number(body.version)<0)return res.status(400).json({error:'Invalid report'});
   await sql`UPDATE cc01_gateway_control SET applied_water_enabled=${body.water_enabled},applied_hobo_enabled=${body.hobo_enabled},
     applied_version=${Number(body.version)},applied_at=NOW() WHERE id=1`;
   return res.status(200).json({ok:true});
  }
  if(body.type==='event'){
   if(!['water','hobo'].includes(body.sensor)||!['timeout','ble_unavailable','read_failed'].includes(body.status)||
     !Number.isSafeInteger(Number(body.packet_id))||Number(body.packet_id)<0||Number(body.packet_id)>4294967295)
     return res.status(400).json({error:'Invalid station event'});
   await sql`INSERT INTO cc01_sensor_events(node_num,sensor,status,packet_id)
     VALUES(1695962694,${body.sensor},${body.status},${Number(body.packet_id)})`;
   return res.status(201).json({ok:true});
  }
  return res.status(400).json({error:'Unknown request'});
 }catch(error){console.error('CC01 control API unavailable',error.name);return res.status(503).json({error:'CC01 control unavailable'});}
}
