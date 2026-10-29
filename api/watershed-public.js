import { createHash,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import { watershedSql } from '../lib/watershed-store.js';
import { getSql as mainSql } from './db.js';
import { emailConfig } from '../lib/alerts.js';
import { validateRule,storedRule,displayRule,normalizeEmails,STATIONS,PARAMETERS } from '../lib/watershed-alert-values.js';
import { isPrivateStation } from '../lib/private-station-policy.js';

const BASE='https://seutahwatersheds.vercel.app/notifications';
const COOKIE='watershed_public_session';
const key=()=>process.env.WATERSHED_OWNER_PASSWORD||process.env.WATERSHED_ALERTS_ADMIN_KEY||process.env.ALERTS_ADMIN_KEY||'';
const hash=t=>createHash('sha256').update(t).digest('hex');
const sig=t=>createHmac('sha256',key()).update('public-watershed-session:'+t).digest('hex');
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function subscriber(req){
 const cookie=(req.headers.cookie||'').split(';').map(t=>t.trim()).find(t=>t.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!cookie||!key())return null;
 const parts=cookie.split('.');if(parts.length!==3||!/^[0-9]+$/.test(parts[0])||Number(parts[0])<=Date.now())return null;
 if(!equal(sig(parts[0]+'.'+parts[1]),parts[2]))return null;
 try{const email=Buffer.from(parts[1],'base64url').toString('utf8');return normalizeEmails([email])[0]===email?email:null;}catch{return null;}
}
function setSession(res,email){
 const exp=String(Date.now()+30*24*3600000),encoded=Buffer.from(email).toString('base64url');
 const v=exp+'.'+encoded;res.setHeader('Set-Cookie',COOKIE+'='+v+'.'+sig(v)+'; HttpOnly; Secure; SameSite=Lax; Path=/api/watershed-public; Max-Age=2592000');
}
function cleanId(v){const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;}
async function sendLink(email,token){
 const config=await emailConfig(mainSql());
 if(!config)throw new Error('Email delivery unavailable');
 const url=BASE+'#verify='+encodeURIComponent(token);
 const response=await fetch('https://api.resend.com/emails',{
  method:'POST',signal:AbortSignal.timeout(7000),
  headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},
  body:JSON.stringify({from:config.sender,to:[email],subject:'Confirm your Moab Watersheds email alerts',
   text:'To set up or manage your own Moab Watersheds notifications, open this secure one-time link (valid for 20 minutes):\n\n'+url+'\n\nIf you did not request this, ignore the message. Your email is not subscribed until you confirm.'})
 });
 if(!response.ok)throw new Error('Email provider rejected request');
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GET or POST required'});
 if(!key())return res.status(503).json({error:'Public email access is not configured'});
 if(req.method==='POST'&&req.headers.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origin rejected'});}
  catch{return res.status(403).json({error:'Origin rejected'});}
 }
 let body=req.body||{};
 try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({error:'Invalid JSON'});}
 if(req.method==='POST'&&body.action==='request_link'){
  let email;try{email=normalizeEmails([body.email])[0];}catch{return res.status(400).json({error:'Enter a valid email address'});}
  try{
   const sql=watershedSql(),token=randomBytes(32).toString('base64url');
   // Limit total verification traffic as well as each address. Do not expose address existence.
   const volume=await sql`SELECT COUNT(*)::int AS requests FROM watershed_public_email_access WHERE last_requested_at>NOW()-INTERVAL '1 hour'`;
   if(Number(volume[0]?.requests)>=60)return res.status(200).json({ok:true,message:'If eligible, check your email for a sign-in link.'});
   const saved=await sql`INSERT INTO watershed_public_email_access(email,token_hash,token_expires_at,last_requested_at)
     VALUES(${email},${hash(token)},NOW()+INTERVAL '20 minutes',NOW())
     ON CONFLICT(email) DO UPDATE SET token_hash=EXCLUDED.token_hash,token_expires_at=EXCLUDED.token_expires_at,
       last_requested_at=NOW()
     WHERE watershed_public_email_access.last_requested_at<NOW()-INTERVAL '10 minutes'
     RETURNING email`;
   if(saved.length)await sendLink(email,token);
   return res.status(200).json({ok:true,message:'If the request is eligible, check your email for a private sign-in link. Allow up to 10 minutes between requests.'});
  }catch(err){console.error('Public email request failed',err.name);return res.status(503).json({error:'Could not send confirmation email at this time'});}
 }
 if(req.method==='POST'&&body.action==='verify'){
  if(typeof body.token!=='string'||!(/^[A-Za-z0-9_-]{40,100}$/.test(body.token)))return res.status(401).json({error:'Invalid or expired link'});
  try{
   const sql=watershedSql();
   const rows=await sql`UPDATE watershed_public_email_access
     SET token_hash=NULL,token_expires_at=NULL,verified_at=NOW()
     WHERE token_hash=${hash(body.token)} AND token_expires_at>NOW()
     RETURNING email`;
   if(!rows.length)return res.status(401).json({error:'Link expired or already used. Request another.'});
   setSession(res,rows[0].email);
   return res.status(200).json({ok:true});
  }catch(err){console.error('Public email verification failed',err.name);return res.status(503).json({error:'Cannot verify the link right now'});}
 }
 if(req.method==='POST'&&body.action==='logout'){
  res.setHeader('Set-Cookie',COOKIE+'=; HttpOnly; Secure; SameSite=Lax; Path=/api/watershed-public; Max-Age=0');
  return res.status(200).json({ok:true});
 }
 const email=subscriber(req);
 if(!email)return res.status(401).json({error:'Verify your email address to manage your subscriptions'});
 try{
  const sql=watershedSql();
  if(req.method==='GET'){
   const rules=await sql`SELECT id,node_num,station_name,parameter,direction,threshold,reset_value,enabled,active,created_at
     FROM alert_rules WHERE owner_email=${email} ORDER BY id DESC`;
   return res.status(200).json({ok:true,email,rules:rules.map(displayRule),stations:STATIONS.filter(([id])=>!isPrivateStation(id)),parameters:PARAMETERS});
  }
  if(body.action==='save_rule'){
   if(isPrivateStation(body.node_num))return res.status(403).json({error:'Private stations are not available for public subscriptions'});
   const rule=validateRule(storedRule(body));
   const json=JSON.stringify([email]);
   const id=body.id?cleanId(body.id):null;
   if(body.id&&!id)return res.status(400).json({error:'Invalid rule ID'});
   if(id){
    const changed=await sql`UPDATE alert_rules SET node_num=${rule.node_num},station_name=${rule.station_name},
      parameter=${rule.parameter},direction=${rule.direction},threshold=${rule.threshold},reset_value=${rule.reset_value},
      enabled=${rule.enabled},recipients=${json}::jsonb,active=FALSE,last_observed_at=NOW(),
      revision=revision+1,updated_at=NOW()
      WHERE id=${id} AND owner_email=${email} RETURNING id`;
    if(!changed.length)return res.status(404).json({error:'Rule not found'});
   }else{
    const created=await sql`INSERT INTO alert_rules(node_num,station_name,parameter,direction,threshold,reset_value,enabled,recipients,owner_email,last_observed_at)
      SELECT ${rule.node_num},${rule.station_name},${rule.parameter},${rule.direction},${rule.threshold},${rule.reset_value},
        ${rule.enabled},${json}::jsonb,${email},NOW()
      WHERE (SELECT COUNT(*) FROM alert_rules WHERE owner_email=${email})<8 RETURNING id`;
    if(!created.length)return res.status(400).json({error:'Use up to 8 subscriptions per email'});
   }
   return res.status(200).json({ok:true});
  }
  if(body.action==='delete_rule'){
   const id=cleanId(body.id);if(!id)return res.status(400).json({error:'Invalid rule ID'});
   const rows=await sql`DELETE FROM alert_rules WHERE id=${id} AND owner_email=${email} RETURNING id`;
   if(!rows.length)return res.status(404).json({error:'Rule not found'});
   return res.status(200).json({ok:true});
  }
  return res.status(400).json({error:'Unknown action'});
 }catch(error){
  console.error('Public watershed alert operation failed',error.name);
  const permitted=/Choose|Use up|Threshold|Enter/.test(error.message);
  return res.status(permitted?400:503).json({error:permitted?error.message:'Subscription service temporarily unavailable'});
 }
}
