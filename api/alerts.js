import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSql } from './db.js';
import { normalizeEmails, displayRule, storedRule } from '../lib/alert-values.js';
import { MESH_STATIONS, MESH_PARAMETERS, MESH_PARAMETER_CHOICES, validateMeshRule, isMeshRule } from '../lib/mesh-alert-values.js';
import { encryptKey, dispatchEmails, emailConfig } from '../lib/alerts.js';
import { evaluateMeshOfflineRules } from '../lib/mesh-offline.js';
import { verifyGitHubHeartbeat } from '../lib/github-oidc-heartbeat.js';

function equal(a,b) { const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length && timingSafeEqual(x,y); }
function signature(value) { return createHmac('sha256',process.env.ALERTS_ADMIN_KEY).update(value).digest('hex'); }
function authenticated(req) {
  const cookie=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('alerts_session='))?.slice(15);
  if (!cookie) return false;
  const [expiry,sig]=cookie.split('.');
  return /^\d+$/.test(expiry) && Number(expiry)>Date.now() && equal(sig,signature(expiry));
}
async function editableRule(sql,id) {
  const found=await sql`SELECT node_num,parameter FROM alert_rules WHERE id=${id}`;
  return found.length===1 && isMeshRule(found[0]);
}
const MESH_HEARTBEAT_SCOPE={
  audience:'meshtastic-station-heartbeat',
  workflow:'canyoncountryadventure/Meshtastic/.github/workflows/mesh-heartbeat.yml@refs/heads/main',
};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'GET or POST required'});
  // Dedicated signed scheduler action reuses this function to stay below the Vercel Hobby limit.
  // It reads only the Meshtastic neondb. Ordinary alert settings still require owner login.
  const url=new URL(req.url||'/api/alerts','https://meshtastic-ecru.vercel.app');
  if(req.method==='GET' && url.searchParams.get('heartbeat')==='mesh'){
    const secret=process.env.CRON_SECRET||'',supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
    const a=Buffer.from(secret),b=Buffer.from(supplied);
    const cronAllowed=secret.length>=16&&a.length===b.length&&timingSafeEqual(a,b);
    if(!cronAllowed&&!(await verifyGitHubHeartbeat(supplied,fetch,MESH_HEARTBEAT_SCOPE)))
      return res.status(401).json({error:'Unauthorized'});
    try{
      const sql=getSql();
      const result=await evaluateMeshOfflineRules(sql);
      const config=await emailConfig(sql);
      const deliveries=config?await dispatchEmails(sql,20,{config,idempotencyPrefix:'meshtastic-alert'}):{sent:0,configured:false};
      return res.status(200).json({ok:true,checked:result.checked,created:result.newDeliveries,
        dispatched:deliveries.sent,configured:deliveries.configured});
    }catch(error){console.error('Meshtastic heartbeat failed',error.name);return res.status(503).json({error:'Station delay check unavailable'});}
  }
  if (!process.env.ALERTS_ADMIN_KEY) return res.status(503).json({error:'Owner access has not been configured'});
  if (req.method==='POST' && req.headers.origin) {
    try { if (new URL(req.headers.origin).host!==req.headers.host) return res.status(403).json({error:'Origin rejected'}); }
    catch { return res.status(403).json({error:'Origin rejected'}); }
  }
  let body=req.body || {};
  try { if (typeof body==='string') body=JSON.parse(body); } catch { return res.status(400).json({error:'Invalid JSON'}); }
  if (body.action==='login' && req.method==='POST') {
    if (!equal(body.password || '',process.env.ALERTS_ADMIN_KEY)) return res.status(401).json({error:'Incorrect owner password'});
    const expiry=String(Date.now()+8*60*60*1000);
    res.setHeader('Set-Cookie',`alerts_session=${expiry}.${signature(expiry)}; HttpOnly; Secure; SameSite=Strict; Path=/api/alerts; Max-Age=28800`);
    return res.status(200).json({ok:true});
  }
  if (!authenticated(req)) return res.status(401).json({error:'Sign in to manage alerts'});
  if (body.action==='logout' && req.method==='POST') {
    res.setHeader('Set-Cookie','alerts_session=; HttpOnly; Secure; SameSite=Strict; Path=/api/alerts; Max-Age=0');
    return res.status(200).json({ok:true});
  }
  try {
    const sql=getSql();
    if (req.method==='GET') {
      const [rules,history,config]=await Promise.all([
        sql`SELECT * FROM alert_rules ORDER BY id`,
        sql`SELECT d.id,d.rule_id,d.recipient,d.subject,d.status,d.attempts,d.error,d.created_at,d.sent_at,
          r.node_num,r.parameter FROM alert_deliveries d JOIN alert_rules r ON r.id=d.rule_id
          WHERE r.node_num IN (3044869407,2740603892,1577197109,4241345683)
          ORDER BY d.id DESC LIMIT 200`,
        sql`SELECT sender,updated_at FROM alert_email_config WHERE id=1`,
      ]);
      return res.status(200).json({ok:true,rules:rules.filter(isMeshRule).map(displayRule),temperature_unit:'F',history:history.filter(isMeshRule).slice(0,50).map(({node_num,parameter,...delivery})=>delivery),email:{configured:!!config[0],sender:config[0]?.sender || ''},stations:MESH_STATIONS,parameters:MESH_PARAMETERS,parameter_choices:MESH_PARAMETER_CHOICES});
    }
    if (body.action==='save_rule') {
      const rule=validateMeshRule(storedRule(body)),emails=normalizeEmails(body.recipients || []);
      const args=JSON.stringify(emails);
      if (body.id) {
        if(!(await editableRule(sql,body.id)))return res.status(404).json({error:'Rule not found on this dashboard'});
        const rows=await sql`UPDATE alert_rules SET node_num=${rule.node_num},station_name=${rule.station_name},parameter=${rule.parameter},
          direction=${rule.direction},threshold=${rule.threshold},reset_value=${rule.reset_value},enabled=${rule.enabled},recipients=${args}::jsonb,
          active=FALSE,last_observed_at=NOW(),updated_at=NOW(),revision=revision+1 WHERE id=${body.id} RETURNING id`;
        if (!rows.length) return res.status(404).json({error:'Rule not found'});
      } else {
        await sql`INSERT INTO alert_rules(node_num,station_name,parameter,direction,threshold,reset_value,enabled,recipients,last_observed_at)
          VALUES(${rule.node_num},${rule.station_name},${rule.parameter},${rule.direction},${rule.threshold},${rule.reset_value},${rule.enabled},${args}::jsonb,NOW())`;
      }
    } else if (body.action==='delete_rule') {
      if(!(await editableRule(sql,body.id)))return res.status(404).json({error:'Rule not found on this dashboard'});
      await sql`DELETE FROM alert_rules WHERE id=${body.id}`;
    } else if (body.action==='save_email') {
      const sender=String(body.sender || '').trim(); normalizeEmails([sender]);
      if (typeof body.key!=='string' || !/^re_[A-Za-z0-9_-]{10,200}$/.test(body.key)) throw new Error('Enter a Resend API key');
      await sql`INSERT INTO alert_email_config(id,sender,encrypted_key) VALUES(1,${sender},${encryptKey(body.key)})
        ON CONFLICT(id) DO UPDATE SET sender=EXCLUDED.sender,encrypted_key=EXCLUDED.encrypted_key,updated_at=NOW()`;
    } else if (body.action==='test') {
      const rows=await sql`SELECT id,node_num,parameter,station_name,recipients FROM alert_rules WHERE id=${body.id}`;
      const rule=rows[0]; if (!isMeshRule(rule) || !rule.recipients.length) throw new Error('Save at least one recipient first');
      const config=await sql`SELECT id FROM alert_email_config WHERE id=1`;
      if (!config.length) throw new Error('Connect the email service first');
      const recent=await sql`SELECT id FROM alert_deliveries WHERE rule_id=${rule.id} AND reading_id IS NULL AND created_at>NOW()-INTERVAL '1 minute' LIMIT 1`;
      if (recent.length) throw new Error('Wait one minute before another test');
      await sql`INSERT INTO alert_deliveries(rule_id,recipient,subject,body)
        SELECT ${rule.id},email,${`Test: ${rule.station_name} station alerts`},'Your station alert email is connected. This is a test, not a threshold event.'
        FROM jsonb_array_elements_text(${JSON.stringify(rule.recipients)}::jsonb) email`;
      const result=await dispatchEmails(sql,4);
      return res.status(200).json({ok:true,...result});
    } else throw new Error('Unknown action');
    return res.status(200).json({ok:true});
  } catch(error) {
    console.error('Alerts request failed',error.name);
    const safe=/Choose|choose|Threshold|threshold|Battery|battery|delayed|duration|parameter|station|Enter|Use up|Save at|Connect|Wait one|Unknown action/.test(error.message);
    return res.status(safe?400:500).json({error:safe?error.message:'Could not save or load alerts'});
  }
}
