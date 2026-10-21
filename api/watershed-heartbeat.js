import { getSql as getMainSql } from './db.js';
import { watershedSql } from '../lib/watershed-store.js';
import { evaluateOfflineRules } from '../lib/watershed-offline.js';
import { dispatchEmails,emailConfig } from '../lib/alerts.js';
import { timingSafeEqual } from 'node:crypto';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 const secret=process.env.CRON_SECRET||'';
 const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
 const a=Buffer.from(secret),b=Buffer.from(supplied);
 if(secret.length<16||a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:'Unauthorized'});
 try{
  const sql=watershedSql();
  const result=await evaluateOfflineRules(sql);
  const config=await emailConfig(getMainSql());
  const sent=config?await dispatchEmails(sql,20,{config,idempotencyPrefix:'watershed-alert'}):{configured:false,sent:0};
  return res.status(200).json({ok:true,checked:result.checked,created:result.newDeliveries,dispatched:sent.sent,configured:sent.configured});
 }catch(error){console.error('Watershed heartbeat check failed',error.name);return res.status(503).json({error:'Heartbeat check unavailable'});}
}
