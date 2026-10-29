import { watershedSql, readCreekData } from '../lib/watershed-store.js';
import { isGoogleSheetsBackupConfigured, readEmergencyBackupData } from '../lib/google-sheets-backup.js';
import { hasPrivateAccess, hidePrivate, isPrivateStation } from '../lib/private-stations.js';

// Unified station histories come directly from moab_watersheds, not the old Meshtastic API.
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'GET required'});}
 const params=new URL(req.url||'/','http://localhost').searchParams;
 const requested=Number(params.get('hours')||168);
 const hours=[6,12,24,72,168,336,720,1440,2160,8760,1000000].includes(requested)?requested:168;
 const node=Number(params.get('node'));
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('Vercel-CDN-Cache-Control','no-store');
 const authenticated=await hasPrivateAccess(req);
 if(isPrivateStation(node)&&!authenticated)return res.status(403).json({ok:false,error:'Private station login required'});
 try{
  const data=await readCreekData(watershedSql(),hours);
  return res.status(200).json({ok:true,hours,...hidePrivate(data,authenticated)});
 }catch(error){
  console.error('Watershed query failed',error.name);
  if(!isGoogleSheetsBackupConfigured())return res.status(503).json({ok:false,error:'Creek observations unavailable',backup_active:false});
  try{
   const data=await readEmergencyBackupData(hours);
   return res.status(200).json({ok:true,hours,backup_active:true,backup_readings:true,...hidePrivate(data,authenticated)});
  }catch(backupError){console.error('Watershed emergency backup query failed',backupError.name,String(backupError.message||backupError).slice(0,300));return res.status(503).json({ok:false,error:'Creek observations unavailable',backup_active:true});}
 }
}
