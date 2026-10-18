import { getSql } from './db.js';
import { watershedSql, reconcileCreekReadings, readCreekData } from '../lib/watershed-store.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GET required'});}
 const requested=Number(new URL(req.url||'/','http://localhost').searchParams.get('hours')||168);
 const hours=[6,12,24,168,720,2160,8760].includes(requested)?requested:168;
 try{
  const sql=watershedSql();
  // One-time operator-requested reset of CC01/CC02 measurement HISTORY.
  // An atomic marker prevents later radio readings from being purged again.
  // Keep creek_stations and monitoring/alert configuration untouched.
  const purged = await sql`WITH claim AS (
    INSERT INTO creek_sync_state(name) VALUES ('cc01_cc02_history_purge_20261018')
    ON CONFLICT(name) DO NOTHING RETURNING name
  ), gone AS (
    DELETE FROM creek_observations
    WHERE node_num IN (1695962694,2425602407)
      AND EXISTS (SELECT 1 FROM claim)
    RETURNING node_num
  ) SELECT node_num, COUNT(*)::int AS removed FROM gone GROUP BY node_num`;
  if (purged.length) console.info('One-time CC01/CC02 watershed history purge',JSON.stringify(purged));
  if(process.env.DATABASE_URL){
   try{await reconcileCreekReadings(getSql(),sql);}catch(error){console.error('Watershed reconciliation failed',error.name);}
  }
  const data=await readCreekData(sql,hours);
  res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=60');
  return res.status(200).json({ok:true,hours,...data});
 }catch(error){console.error('Watershed query failed',error.name);return res.status(503).json({ok:false,error:'Creek observations unavailable'});}
}
