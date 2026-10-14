import { getSql } from './db.js';
import { watershedSql, reconcileCreekReadings, readCreekData } from '../lib/watershed-store.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GET required'});}
 const requested=Number(new URL(req.url||'/','http://localhost').searchParams.get('hours')||168);
 const hours=[24,168,720].includes(requested)?requested:168;
 try{
  const sql=watershedSql();
  if(process.env.DATABASE_URL){
   try{await reconcileCreekReadings(getSql(),sql);}catch(error){console.error('Watershed reconciliation failed',error.name);}
  }
  const data=await readCreekData(sql,hours);
  res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=60');
  return res.status(200).json({ok:true,hours,...data});
 }catch(error){console.error('Watershed query failed',error.name);return res.status(503).json({ok:false,error:'Creek observations unavailable'});}
}
