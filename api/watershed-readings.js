import { watershedSql, readCreekData } from '../lib/watershed-store.js';
import { isGoogleSheetsBackupConfigured, readWatershedEmergencyBackups } from '../lib/google-sheets-backup.js';
import { filterPrivateTelemetry, isPrivateStation } from '../lib/private-station-policy.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GET required'});}
 const params=new URL(req.url||'/','http://localhost').searchParams;
 const node=params.get('node');
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('Vercel-CDN-Cache-Control','no-store');
 if(node!==null&&isPrivateStation(node))return res.status(403).json({ok:false,error:'Private station login required on Southeastern Utah Watersheds'});
 const requested=Number(params.get('hours')||168);
 const hours=[6,12,24,72,168,336,720,1440,2160,8760].includes(requested)?requested:168;
 try{
  const sql=watershedSql();
  const data=await readCreekData(sql,hours);
  return res.status(200).json({ok:true,hours,...filterPrivateTelemetry(data)});
 }catch(error){
  console.error('Watershed query failed',error.name);
  if (!isGoogleSheetsBackupConfigured()) return res.status(503).json({ok:false,error:'Creek observations unavailable',backup_active:false});
  try {
   const data=await readWatershedEmergencyBackups(hours);
   return res.status(200).json({ok:true,hours,backup_active:true,backup_readings:true,...filterPrivateTelemetry(data)});
  } catch (backupError) {
   console.error('Watershed emergency backup query failed',backupError.name,String(backupError.message||backupError).slice(0,300));
   return res.status(503).json({ok:false,error:'Creek observations unavailable',backup_active:true});
  }
 }
}
