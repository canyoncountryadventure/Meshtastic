import { sessionCookie } from '../lib/private-stations.js';
// This proxy verifies passwords at the existing gateway, without copying a secret to Vercel.
const UPSTREAM='https://meshtastic-ecru.vercel.app/api/private-stations';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({ok:false,error:'GET or POST required'});
 if(req.method==='POST'&&req.headers.origin){
  try{if(new URL(req.headers.origin).host!==(req.headers['x-forwarded-host']||req.headers.host))return res.status(403).json({ok:false,error:'Origin rejected'});}
  catch{return res.status(403).json({ok:false,error:'Origin rejected'});}
 }
 let body;
 if(req.method==='POST'){
  body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body);}catch{return res.status(400).json({ok:false,error:'Invalid JSON'});}}
  if(!body||typeof body!=='object'||!['login','logout'].includes(body.action))return res.status(400).json({ok:false,error:'Invalid request'});
  if(body.action==='login'&&(typeof body.password!=='string'||body.password.length>256))return res.status(400).json({ok:false,error:'Invalid password'});
 }
 try{
  const cookie=sessionCookie(req);
  const upstream=await fetch(UPSTREAM,{
   method:req.method,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9000),
   headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
   ...(req.method==='POST'?{body:JSON.stringify(body)}:{})
  });
  const setCookie=upstream.headers.get('set-cookie');
  if(setCookie&&setCookie.startsWith('ps_session=')){
   // Change cookie path only. Preserve HttpOnly, Secure and SameSite attributes.
   res.setHeader('Set-Cookie',setCookie.replace(/Path=\/api\/private-stations(?=;|$)/i,'Path=/'));
  }
  return res.status(upstream.status).json(await upstream.json());
 }catch{return res.status(503).json({ok:false,error:'Private station login unavailable'});}
}
