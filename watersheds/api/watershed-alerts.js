// Standalone host forwards only this scoped alert API. Cookies remain host-only.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'GET or POST required'});}
 if(req.method==='POST'&&req.headers.origin){
  try{if(new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({error:'Origin rejected'});}catch{return res.status(403).json({error:'Origin rejected'});}
 }
 try{
  const cookie=(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith('watershed_alerts_session=')).join('; ');
  const response=await fetch('https://meshtastic-ecru.vercel.app/api/watershed-alerts?v=2',{
   method:req.method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
   ...(req.method==='POST'?{body:typeof req.body==='string'?req.body:JSON.stringify(req.body||{})}:{}),signal:AbortSignal.timeout(22000),redirect:'error',cache:'no-store',
  });
  const setCookie=response.headers.get('set-cookie');if(setCookie)res.setHeader('Set-Cookie',setCookie);
  const data=await response.json();return res.status(response.status).json(data);
 }catch{return res.status(503).json({error:'Email notifications are temporarily unavailable'});}
}
