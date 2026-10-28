import { getSql as getMainSql } from './db.js';
import { watershedSql } from '../lib/watershed-store.js';
import { evaluateOfflineRules } from '../lib/watershed-offline.js';
import { dispatchEmails,emailConfig } from '../lib/alerts.js';
import { timingSafeEqual } from 'node:crypto';
import { verifyGitHubHeartbeat } from '../lib/github-oidc-heartbeat.js';
import { markEmergencyBackup, pendingEmergencyBackups, isGoogleSheetsBackupConfigured } from '../lib/google-sheets-backup.js';

const BACKFILL_SCOPE={audience:'meshtastic-telemetry-backfill',workflow:'canyoncountryadventure/Meshtastic/.github/workflows/telemetry-backfill.yml@refs/heads/main'};
function sameOrigin(req){const host=req.headers['x-forwarded-host']||req.headers.host;return `${req.headers['x-forwarded-proto']||'https'}://${host}`;}
async function runBackfill(req){
 if(!isGoogleSheetsBackupConfigured())return {status:503,body:{ok:false,error:'Google Sheets backup is not configured'}};
 const requested=Number(req.query?.limit||50),limit=Number.isInteger(requested)?Math.max(1,Math.min(100,requested)):50;
 const rows=await pendingEmergencyBackups(limit),result={ok:true,checked:rows.length,synchronized:0,deferred:0,failed:0};
 for(const item of rows){
  const attempts=Number(item.row[19]||0)+1;let raw;
  try{raw=JSON.parse(item.row[17]);}catch{await markEmergencyBackup(item.rowNumber,{status:'error',attempts,error:'Original JSON is invalid'});result.failed++;continue;}
  try{
   const response=await fetch(`${sameOrigin(req)}/api/ingest`,{method:'POST',headers:{'content-type':'application/json','x-ingest-key':process.env.INGEST_KEY||''},body:JSON.stringify(raw),signal:AbortSignal.timeout(20000)});
   const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body?.error||`Ingest returned ${response.status}`);
   if(Number(body.backed_up||0)>0){await markEmergencyBackup(item.rowNumber,{status:'retry',attempts,error:'Neon remains unavailable'});result.deferred++;break;}
   await markEmergencyBackup(item.rowNumber,{status:'synced',syncedAt:new Date().toISOString(),attempts,error:''});result.synchronized++;
  }catch(error){await markEmergencyBackup(item.rowNumber,{status:'retry',attempts,error:String(error?.message||error).slice(0,500)});result.failed++;break;}
 }
 return {status:200,body:result};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 const backfill=new URL(req.url||'/','http://localhost').searchParams.get('backfill')==='1';
 const secret=process.env.CRON_SECRET||'';
 const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
 const a=Buffer.from(secret),b=Buffer.from(supplied);
 const cronAllowed=secret.length>=16&&a.length===b.length&&timingSafeEqual(a,b);
 if(!cronAllowed && !(await verifyGitHubHeartbeat(supplied,fetch,backfill?BACKFILL_SCOPE:undefined)))return res.status(401).json({error:'Unauthorized'});
 if(backfill){try{const result=await runBackfill(req);return res.status(result.status).json(result.body);}catch(error){console.error('Emergency telemetry backfill failed',error.name);return res.status(503).json({ok:false,error:'Emergency telemetry backfill unavailable'});}}
 try{
  const sql=watershedSql();
  const result=await evaluateOfflineRules(sql);
  const config=await emailConfig(getMainSql());
  const sent=config?await dispatchEmails(sql,20,{config,idempotencyPrefix:'watershed-alert'}):{configured:false,sent:0};
  return res.status(200).json({ok:true,checked:result.checked,created:result.newDeliveries,dispatched:sent.sent,configured:sent.configured});
 }catch(error){console.error('Watershed heartbeat check failed',error.name);return res.status(503).json({error:'Heartbeat check unavailable'});}
}
