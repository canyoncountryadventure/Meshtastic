import privateStationLogin from '../lib/private-station-login.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSql as sourceSql } from './db.js';
import { watershedSql as getSql } from '../lib/watershed-store.js';
import { validateRule, normalizeEmails, STATIONS, PARAMETERS, displayRule, storedRule } from '../lib/watershed-alert-values.js';
import { dispatchEmails, emailConfig } from '../lib/alerts.js';
import { readOwnerBatteryHistory, BATTERY_HISTORY_DAYS, readOwnerBatteryWindow, BATTERY_HISTORY_HOURS } from '../lib/watershed-battery-history.js';

function equal(a,b) { const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length && timingSafeEqual(x,y); }
const ownerKey=()=>process.env.WATERSHED_OWNER_PASSWORD || process.env.WATERSHED_ALERTS_ADMIN_KEY || process.env.ALERTS_ADMIN_KEY;
const POLL_INTERVALS=new Set([5,10,15,20,30,60,120,180,360,720,1440]);
const CC01_NODE=1695962694, MATHESON_NODE=2004386937;
function validatedPollCommand(body){
 const node=Number(body.node_num),operation=body.operation,mode=body.mode||'READ';
 const interval=operation==='schedule'?Number(body.interval_minutes):null;
 if(!Number.isSafeInteger(node)||node<1||node>4294967295||!['schedule','off','once'].includes(operation)||!['READ','WATER','BOTH'].includes(mode))
  throw new Error('Choose a valid node, polling action, and sensor mode');
 if(operation==='schedule'&&!POLL_INTERVALS.has(interval))throw new Error('Choose a supported polling interval');
 // The dedicated pollers have fixed sensor protocols; keep the field deployment intact.
 if(node===CC01_NODE&&(operation==='once'||mode!=='WATER'))throw new Error('South Cottonwood supports recurring WATER READ or OFF');
 if(node===MATHESON_NODE&&(operation==='once'||mode!=='READ'))throw new Error('Matheson supports recurring HOBO READ or OFF');
 return {node,operation,mode,interval};
}
function signature(value) { return createHmac('sha256',ownerKey()).update('watershed:' + value).digest('hex'); }
function authenticated(req) {
  const prefix='watershed_alerts_session=';
  const cookie=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(prefix))?.slice(prefix.length);
  if (!cookie) return false;
  const [expiry,sig]=cookie.split('.');
  return /^\d+$/.test(expiry) && Number(expiry)>Date.now() && equal(sig,signature(expiry));
}
export default async function handler(req,res) {
  if(new URL(req.url||'/','http://localhost').searchParams.get('ps')==='1')return privateStationLogin(req,res);
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
    // One on-demand owner-only query; never called by public subscriptions.
    if (req.method==='POST' && body.action==='battery_history_hours') {
      const hours=Number(body.hours);
      if(!BATTERY_HISTORY_HOURS.includes(hours))return res.status(400).json({error:'Choose 24 hours, 7 days, 30 days, or 90 days'});
      try {
        const history=await readOwnerBatteryWindow(sql,hours);
        return res.status(200).json({ok:true,...history});
      } catch(error) {
        console.error('Owner battery window query failed',error.name);
        return res.status(503).json({error:'Battery history temporarily unavailable'});
      }
    }
    if (req.method==='POST' && body.action==='battery_history') {
      const days=Number(body.days);
      if(!BATTERY_HISTORY_DAYS.includes(days))return res.status(400).json({error:'Choose 7, 30, or 60 days'});
      try {
        const history=await readOwnerBatteryHistory(sourceSql(),sql,days);
        return res.status(200).json({ok:true,...history});
      } catch(error) {
        console.error('Owner battery history read failed',error.name);
        return res.status(503).json({error:'Battery history unavailable. Neon may be at its compute limit; try after the allowance resets.'});
      }
    }
    if (req.method==='GET') {
      const [rules,history,config,control,pollRequests]=await Promise.all([
        sql`SELECT * FROM alert_rules ORDER BY id`,
        sql`SELECT id,rule_id,recipient,subject,status,attempts,error,created_at,sent_at FROM alert_deliveries ORDER BY id DESC LIMIT 50`,
        sourceSql()`SELECT sender,updated_at FROM alert_email_config WHERE id=1`,
        sql`SELECT water_enabled,hobo_enabled,authorized_admin_node,version,updated_at,applied_water_enabled,applied_hobo_enabled,applied_version,applied_at,poll_cloud_capable,poll_cloud_seen_at FROM cc01_gateway_control WHERE id=1`,
        sql`SELECT id,node_num,operation,interval_minutes,mode,status,error,created_at,applied_at FROM gateway_poll_commands ORDER BY id DESC LIMIT 50`,
      ]);
      return res.status(200).json({ok:true,rules:rules.map(displayRule),temperature_unit:'F',history,email:{configured:!!config[0],sender:config[0]?.sender || ''},stations:STATIONS,parameters:PARAMETERS,gateway_control:control[0]||null,poll_requests:pollRequests});
    }
    if (body.action==='queue_gateway_poll') {
      let command;
      try {command=validatedPollCommand(body);}
      catch(error){return res.status(400).json({error:error.message});}
      const active=command.operation==='schedule';
      // Supersede older unapplied changes to the same node. Never enqueue a
      // conflicting ON followed by OFF that could surprise a distant station.
      const rows=await sql`
        WITH abandoned AS (
          UPDATE gateway_poll_commands SET status='superseded'
          WHERE node_num=${command.node} AND status='pending'
          RETURNING id
        )
        INSERT INTO gateway_poll_commands(node_num,operation,interval_minutes,mode)
        VALUES(${command.node},${command.operation},${command.interval},${command.mode})
        RETURNING id,node_num,operation,interval_minutes,mode,status,created_at`;
      if(!rows.length)return res.status(503).json({error:'Unable to queue gateway command'});
      // Existing Heltec firmware already supports Cottonwood ON/OFF through
      // the cloud control flags. Keep the dedicated state consistent.
      if(command.node===CC01_NODE){
        await sql`UPDATE cc01_gateway_control SET water_enabled=${active},hobo_enabled=FALSE,
          version=version+1,updated_at=NOW() WHERE id=1`;
      }
      return res.status(202).json({ok:true,command:rows[0],note:'Queued for Heltec; applied status requires updated gateway firmware'});
    }
    if (body.action==='save_gateway_control') {
      const adminNode=Number(body.authorized_admin_node);
      if(typeof body.water_enabled!=='boolean'||!Number.isSafeInteger(adminNode)||
         adminNode<1||adminNode>4294967295)
         return res.status(400).json({error:'Choose WATER READ on/off and an authorized Meshtastic node ID'});
      // South Cottonwood has no HOBO. Do not alter another station's poll schedule here.
      const changed=await sql`UPDATE cc01_gateway_control SET
        water_enabled=${body.water_enabled},hobo_enabled=FALSE,
        authorized_admin_node=${adminNode},
        version=version+1,updated_at=NOW()
        WHERE id=1 RETURNING version`;
      if(!changed.length)return res.status(503).json({error:'Gateway control not initialized'});
      return res.status(200).json({ok:true,version:Number(changed[0].version)});
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
