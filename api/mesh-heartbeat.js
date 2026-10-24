import { getSql } from './db.js';
import { evaluateMeshOfflineRules } from '../lib/mesh-offline.js';
import { dispatchEmails,emailConfig } from '../lib/alerts.js';
import { verifyGitHubHeartbeat } from '../lib/github-oidc-heartbeat.js';
import { timingSafeEqual } from 'node:crypto';

const MESH_SCOPE={
  audience:'meshtastic-station-heartbeat',
  workflow:'canyoncountryadventure/Meshtastic/.github/workflows/mesh-heartbeat.yml@refs/heads/main',
};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET required'});
  const secret=process.env.CRON_SECRET||'',supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
  const a=Buffer.from(secret),b=Buffer.from(supplied);
  const cronAllowed=secret.length>=16&&a.length===b.length&&timingSafeEqual(a,b);
  if(!cronAllowed&&!(await verifyGitHubHeartbeat(supplied,fetch,MESH_SCOPE)))
    return res.status(401).json({error:'Unauthorized'});
  try {
    const sql=getSql(); // Meshtastic neondb only, not moab_watersheds.
    const result=await evaluateMeshOfflineRules(sql);
    const config=await emailConfig(sql);
    const delivery=config
      ? await dispatchEmails(sql,20,{config,idempotencyPrefix:'meshtastic-alert'})
      : {sent:0,configured:false};
    return res.status(200).json({ok:true,checked:result.checked,created:result.newDeliveries,
      dispatched:delivery.sent,configured:delivery.configured});
  }catch(error) {
    console.error('Meshtastic heartbeat failed',error.name);
    return res.status(503).json({error:'Meshtastic delayed-station check unavailable'});
  }
}
