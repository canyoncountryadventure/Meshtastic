import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSql as sourceSql } from './db.js';
import { watershedSql as getSql } from '../lib/watershed-store.js';
import { validateRule, normalizeEmails, STATIONS, PARAMETERS, displayRule, storedRule } from '../lib/watershed-alert-values.js';
import { dispatchEmails, emailConfig } from '../lib/alerts.js';

function equal(a,b) { const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length && timingSafeEqual(x,y); }
const ownerKey=()=>process.env.WATERSHED_OWNER_PASSWORD || process.env.WATERSHED_ALERTS_ADMIN_KEY || process.env.ALERTS_ADMIN_KEY;
function signature(value) { return createHmac('sha256',ownerKey()).update('watershed:' + value).digest('hex'); }
function authenticated(req) {
  const prefix='watershed_alerts_session=';
  const cookie=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(prefix))?.slice(prefix.length);
  if (!cookie) return false;
  const [expiry,sig]=cookie.split('.');
  return /^\d+$/.test(expiry) && Number(expiry)>Date.now() && equal(sig,signature(expiry));
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).json({error:'GET or POST required'});
  if (!ownerKey()) return res.status(503).json({error:'Owner access has not been configured'});
  if (req.method==='POST' && req.headers.origin) {
    try { if (new URL(req.headers.origin).host!==req.headers.host) return res.status(403).json({error:'Origin rejected'}); }
    catch { return res.status(403).json({error:'Origin rejected'}); }
  }
  let body=req.body || {};
  try { if (typeof body==='string') body=JSON.parse(body); } catch { return res.status(400).json({error:'Invalid JSON'}); }
  if (body.action==='login' && req.method==='POST') {
    if (!equal(body.password || '',ownerKey())) return res.status(401).json({error:'Incorrect owner password'});
    const expiry=String(Date.now()+8*60*60*1000);
    res.setHeader('Set-Cookie',`watershed_alerts_session=${expiry}.${signature(expiry)}; HttpOnly; Secure; SameSite=Strict; Path=/api/watershed-alerts; Max-Age=28800`);
    return res.status(200).json({ok:true});
  }
  if (!authenticated(req)) return res.status(401).json({error:'Sign in to manage alerts'});
  if (body.action==='logout' && req.method==='POST') {
    res.setHeader('Set-Cookie','watershed_alerts_session=; HttpOnly; Secure; SameSite=Strict; Path=/api/watershed-alerts; Max-Age=0');
    return res.status(200).json({ok:true});
  }
  try {
    const sql=getSql();
    if (req.method==='GET') {
      const [rules,history,config]=await Promise.all([
        sql`SELECT * FROM alert_rules ORDER BY id`,
        sql`SELECT id,rule_id,recipient,subject,status,attempts,error,created_at,sent_at FROM alert_deliveries ORDER BY id DESC LIMIT 50`,
        sourceSql()`SELECT sender,updated_at FROM alert_email_config WHERE id=1`,
      ]);
      return res.status(200).json({ok:true,rules:rules.map(displayRule),temperature_unit:'F',history,email:{configured:!!config[0],sender:config[0]?.sender || ''},stations:STATIONS,parameters:PARAMETERS});
    }
    if (body.action==='save_rule') {
      const rule=validateRule(storedRule(body)),emails=normalizeEmails(body.recipients || []);
      const args=JSON.stringify(emails);
      if (body.id) {
        const rows=await sql`UPDATE alert_rules SET node_num=${rule.node_num},station_name=${rule.station_name},parameter=${rule.parameter},
          direction=${rule.direction},threshold=${rule.threshold},reset_value=${rule.reset_value},enabled=${rule.enabled},recipients=${args}::jsonb,
          active=FALSE,last_observed_at=NOW(),updated_at=NOW(),revision=revision+1 WHERE id=${body.id} RETURNING id`;
        if (!rows.length) return res.status(404).json({error:'Rule not found'});
      } else {
        await sql`INSERT INTO alert_rules(node_num,station_name,parameter,direction,threshold,reset_value,enabled,recipients,last_observed_at)
          VALUES(${rule.node_num},${rule.station_name},${rule.parameter},${rule.direction},${rule.threshold},${rule.reset_value},${rule.enabled},${args}::jsonb,NOW())`;
      }
    } else if (body.action==='delete_rule') {
      await sql`DELETE FROM alert_rules WHERE id=${body.id}`;
    } else if (body.action==='test') {
      const rows=await sql`SELECT id,station_name,recipients FROM alert_rules WHERE id=${body.id}`;
      const rule=rows[0]; if (!rule || !rule.recipients.length) throw new Error('Save at least one recipient first');
      const config=await sourceSql()`SELECT id FROM alert_email_config WHERE id=1`;
      if (!config.length) throw new Error('Connect the email service first');
      const recent=await sql`SELECT id FROM alert_deliveries WHERE rule_id=${rule.id} AND reading_id IS NULL AND created_at>NOW()-INTERVAL '1 minute' LIMIT 1`;
      if (recent.length) throw new Error('Wait one minute before another test');
      await sql`INSERT INTO alert_deliveries(rule_id,recipient,subject,body)
        SELECT ${rule.id},email,${`Moab Watersheds test: ${rule.station_name}`},'Your Moab Watersheds email notifications are connected. This is a test, not a threshold event.'
        FROM jsonb_array_elements_text(${JSON.stringify(rule.recipients)}::jsonb) email`;
      const result=await dispatchEmails(sql,2,{config:await emailConfig(sourceSql()),idempotencyPrefix:'watershed-alert'});
      return res.status(200).json({ok:true,...result});
    } else throw new Error('Unknown action');
    return res.status(200).json({ok:true});
  } catch(error) {
    console.error('Alerts request failed',error.name);
    const safe=/Choose|Reset|Threshold|Enter|Use up|Stage|Only Pack|Save at|Connect|Wait one|Unknown action/.test(error.message);
    return res.status(safe?400:500).json({error:safe?error.message:'Could not save or load alerts'});
  }
}
