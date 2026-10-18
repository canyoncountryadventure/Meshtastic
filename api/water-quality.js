import { watershedSql } from '../lib/watershed-store.js';
import { readWaterQualityData } from '../lib/water-quality-store.js';

export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GET required'});}
 try{
  const data=await readWaterQualityData(watershedSql());
  res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=300');
  return res.status(200).json({ok:true,...data});
 }catch(error){console.error('Water quality query failed',error.name);return res.status(503).json({ok:false,error:'Water-quality observations unavailable'});}
}
