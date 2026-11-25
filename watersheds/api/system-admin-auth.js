// Same-origin administrative API: owner authentication is verified by the gateway.
// Preserve the gateway's signed HttpOnly cookie, but scope it to this dashboard host.
const ORIGIN='https://meshtastic-ecru.vercel.app/api/watershed-alerts?v=2';
function originAllowed(req){
 if(!req.headers.origin)return true;
 try{
  const origin=new URL(req.headers.origin);
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();
  return origin.protocol==='https:'&&origin.host===host;
 }catch{return false;}
}
function sessionCookie(req){
 return String(req.headers.cookie||'').split(';').map(s=>s.trim())
  .filter(s=>/^watershed_alerts_session=\d{13}\.[a-f0-9]{64}$/i.test(s)).join('; ');
}
function normalizedSessionCookies(response){
 const all=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean);
 return all.filter(cookie=>/^watershed_alerts_session=/i.test(cookie.trim())).map(cookie=>{
  const original=cookie.trim();
  // Upstream sets Path=/api/watershed-alerts, but the admin page is at /admin.
  // Rewrite only the Path; never expose or rewrite the HMAC signature.
  const path=/;\s*Path=[^;]*/i.test(original)
    ?original.replace(/;\s*Path=[^;]*/i,'; Path=/')
    :original+'; Path=/';
  return path;
 });
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, no-cache, max-age=0, must-revalidate');
 res.setHeader('Vercel-CDN-Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'GET or POST required'});}
 if(req.method==='POST'&&!originAllowed(req))return res.status(403).json({error:'Request origin does not match this site'});
 const body=req.method==='POST'?(typeof req.body==='string'?req.body:JSON.stringify(req.body||{})):null;
 let action='get';
 if(body){try{action=String(JSON.parse(body).action||'post')}catch{return res.status(400).json({error:'Invalid request JSON'});}}
 try{
  const cookie=sessionCookie(req);
  const response=await fetch(ORIGIN,{
   method:req.method,
   headers:{'Content-Type':'application/json','Accept':'application/json',...(cookie?{Cookie:cookie}:{})},
   ...(body?{body}:{}),
   redirect:'error',cache:'no-store',signal:AbortSignal.timeout(17000)
  });
  const cookies=normalizedSessionCookies(response);
  if(cookies.length)res.setHeader('Set-Cookie',cookies);
  const raw=await response.text();
  let data;
  try{data=JSON.parse(raw);}catch{
   console.error('Owner auth gateway returned a non-JSON response',response.status,action);
   return res.status(502).json({error:'Owner authentication service returned an unexpected response (HTTP '+response.status+')'});
  }
  if(response.status>=500)console.error('Owner auth gateway error',response.status,action);
  return res.status(response.status).json(data);
 }catch(error){
  console.error('Owner auth gateway connection failed',action,error?.name||'Unknown');
  return res.status(503).json({error:'Owner authentication service unavailable. This is not a password error.'});
 }
}
