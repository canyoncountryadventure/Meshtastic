import { createHmac, timingSafeEqual } from 'node:crypto';

// Password already used for watershed owner notifications. No new credential.
const PASSWORD=()=>process.env.WATERSHED_OWNER_PASSWORD||process.env.WATERSHED_ALERTS_ADMIN_KEY||process.env.ALERTS_ADMIN_KEY||'';
const COOKIE='ps_session';
const DURATION=8*60*60*1000;
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);}
function signed(expiry){return createHmac('sha256',PASSWORD()).update('watershed-private-stations:v1:'+expiry).digest('hex');}
function authorized(req){
 const cookie=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 const [expiry,signature,...extra]=cookie.split('.');
 return Boolean(PASSWORD()&&!extra.length&&/^\d{13}$/.test(expiry||'')&&Number(expiry)>Date.now()&&Number(expiry)<Date.now()+DURATION+60000&&/^[a-f0-9]{64}$/.test(signature||'')&&equal(signature,signed(expiry)));
}
function sameOrigin(req){
 if(!req.headers.origin)return true;
 try{return new URL(req.headers.origin).host===(req.headers['x-forwarded-host']||req.headers.host);}catch{return false;}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'GET or POST required'});
 if(!PASSWORD())return res.status(503).json({ok:false,error:'Private station access is not configured'});
 if(req.method==='GET')return res.status(200).json({ok:true,authenticated:authorized(req)});
 if(!sameOrigin(req))return res.status(403).json({ok:false,error:'Origin rejected'});
 let body=req.body||{};try{if(typeof body==='string')body=JSON.parse(body);}catch{return res.status(400).json({ok:false,error:'Invalid JSON'});}
 if(body.action==='logout'){
  res.setHeader('Set-Cookie',COOKIE+'=; HttpOnly; Secure; SameSite=Strict; Path=/api/private-stations; Max-Age=0');
  return res.status(200).json({ok:true,authenticated:false});
 }
 if(body.action!=='login'||typeof body.password!=='string'||body.password.length>256)
   return res.status(400).json({ok:false,error:'Invalid login request'});
 if(!equal(body.password,PASSWORD()))return res.status(401).json({ok:false,error:'Incorrect password'});
 const expiry=String(Date.now()+DURATION);
 res.setHeader('Set-Cookie',COOKIE+'='+expiry+'.'+signed(expiry)+'; HttpOnly; Secure; SameSite=Strict; Path=/api/private-stations; Max-Age=28800');
 return res.status(200).json({ok:true,authenticated:true});
}
