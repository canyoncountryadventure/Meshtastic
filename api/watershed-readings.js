import { watershedSql, readCreekData } from '../lib/watershed-store.js';
import { isGoogleSheetsBackupConfigured } from '../lib/google-sheets-backup.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GET required'});}
 const requested=Number(new URL(req.url||'/','http://localhost').searchParams.get('hours')||168);
 const hours=[6,12,24,72,168,336,720,1440,2160,8760].includes(requested)?requested:168;
 try{
  const sql=watershedSql();
  const data=await readCreekData(sql,hours);
  res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=60');
  return res.status(200).json({ok:true,hours,...data});
 }catch(error){console.error('Watershed query failed',error.name);return res.status(503).json({ok:false,error:'Creek observations unavailable',backup_active:isGoogleSheetsBackupConfigured()});}
}
